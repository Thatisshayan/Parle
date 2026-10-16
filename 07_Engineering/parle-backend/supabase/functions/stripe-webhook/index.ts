import Stripe from "npm:stripe@14.21.0";
import { stripeClient, syncSubscription } from "../_shared/stripe-sync.ts";
import { serviceClient } from "../_shared/db.ts";
import { lessonPayments } from "../_shared/lessons/payments.ts";
import { handleLessonEvent, isLessonEvent } from "../_shared/lessons/webhook.ts";
import { handlePayoutEvent, isPayoutEvent } from "../_shared/payouts/webhook.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const HANDLED = new Set(["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"]);
const secrets = () => [Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "", Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET") ?? ""].filter(Boolean);

/** Parle's own destination first, then the connected-accounts destination (Plan 7B: account.updated). */
async function verified(stripe: Stripe, raw: string, signature: string): Promise<Stripe.Event | null> {
  for (const secret of secrets()) {
    try {
      return await stripe.webhooks.constructEventAsync(raw, signature, secret, undefined, Stripe.createSubtleCryptoProvider());
    } catch {
      // not signed with this secret: try the next one
    }
  }
  return null;
}

/** Stripe calls this for subscriptions, lesson payments and tutor payouts (spec section 8). */
Deno.serve(async (req) => {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const signature = req.headers.get("stripe-signature");
  if (!signature || !secrets().length) return json({ error: "SIGNATURE_REQUIRED" }, 400);
  const stripe = stripeClient(key || "sk_test_unset");
  const event = await verified(stripe, await req.text(), signature);
  if (!event) return json({ error: "SIGNATURE_INVALID" }, 400);
  if (event.livemode) return json({ error: "LIVE_MODE_NOT_ENABLED" }, 400);
  const object = event.data.object as Record<string, any>;
  if (isPayoutEvent(event.type, object)) {
    // Tutor payouts (Plan 7B): account state, transfers, reversals. A failure answers 500 so Stripe retries.
    try {
      return json(await handlePayoutEvent(serviceClient(), event.id, event.type, object));
    } catch (e) {
      console.error("stripe-webhook could not handle a payout event", { type: event.type, error: (e as Error).name });
      return json({ error: "PAYOUT_EVENT_FAILED" }, 500);
    }
  }
  if (isLessonEvent(event.type, object)) {
    // Lesson payments (Plan 7A): confirm, expire, refund records, disputes. A failure answers 500 so Stripe retries.
    try {
      const db = serviceClient();
      return json(await handleLessonEvent(db, lessonPayments(db), event.id, event.type, object));
    } catch (e) {
      console.error("stripe-webhook could not handle a lesson event", { type: event.type, error: (e as Error).name });
      return json({ error: "LESSON_EVENT_FAILED" }, 500);
    }
  }
  if (!HANDLED.has(event.type)) return json({ received: true, handled: false });
  if (!key.startsWith("sk_test_")) return json({ error: "STRIPE_NOT_CONFIGURED" }, 503);
  const subscriptionId = event.type === "checkout.session.completed" ? object.subscription : object.id;
  if (!subscriptionId) return json({ received: true, handled: false });
  try {
    return json({ received: true, handled: await syncSubscription(stripe, key, String(subscriptionId)) });
  } catch (e) {
    // Stripe has no such subscription (dashboard test events use made-up ids): retrying cannot help
    if ((e as { code?: string }).code === "resource_missing") {
      // a key/account mismatch would drop every checkout here, so say so in the logs (R30)
      console.warn("stripe-webhook: subscription not found in Stripe", { type: event.type, livemode: event.livemode });
      return json({ received: true, handled: "missing" });
    }
    console.error("stripe-webhook could not sync a subscription", { type: event.type, error: (e as Error).name });
    return json({ error: "SYNC_FAILED" }, 500); // Stripe retries
  }
});
