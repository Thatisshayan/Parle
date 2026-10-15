import Stripe from "npm:stripe@14.21.0";
import { stripeClient, syncSubscription } from "../_shared/stripe-sync.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const HANDLED = new Set(["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"]);

/** Stripe calls this when a subscription changes; it updates the subscription cache at once (spec section 6). */
Deno.serve(async (req) => {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  const signature = req.headers.get("stripe-signature");
  if (!signature || !secret) return json({ error: "SIGNATURE_REQUIRED" }, 400);
  const stripe = stripeClient(key || "sk_test_unset");
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), signature, secret, undefined, Stripe.createSubtleCryptoProvider());
  } catch {
    return json({ error: "SIGNATURE_INVALID" }, 400);
  }
  if (event.livemode) return json({ error: "LIVE_MODE_NOT_ENABLED" }, 400);
  if (!HANDLED.has(event.type)) return json({ received: true, handled: false });
  if (!key.startsWith("sk_test_")) return json({ error: "STRIPE_NOT_CONFIGURED" }, 503);
  const object = event.data.object as Record<string, any>;
  const subscriptionId = event.type === "checkout.session.completed" ? object.subscription : object.id;
  if (!subscriptionId) return json({ received: true, handled: false });
  try {
    return json({ received: true, handled: await syncSubscription(stripe, key, String(subscriptionId)) });
  } catch (e) {
    console.error("stripe-webhook could not sync a subscription", { type: event.type, error: (e as Error).name });
    return json({ error: "SYNC_FAILED" }, 500); // Stripe retries
  }
});
