import { createSuperdevClient } from "../_shared/superdev-compat.ts";
import { serveWith } from "../_shared/serve.ts";
import { cronOnly } from "../_shared/guards.ts";
import { stripeClient, syncSubscription } from "../_shared/stripe-sync.ts";

const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } });

/** Daily safety net (spec section 7): re-reads every saved subscription from Stripe. */
serveWith(async () => {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key.startsWith("sk_test_")) return json({ status: "not_configured" });
  const stripe = stripeClient(key);
  const client = createSuperdevClient({});
  client.auth.setToken(Deno.env.get("SUPERDEV_SERVICE_ROLE_KEY") ?? "");
  const subscribers = await client.entities.Subscriber.filter({}, "-updated_at", 1000);
  let checked = 0, failed = 0;
  for (const row of subscribers) {
    if (!row.stripe_subscription_id) continue;
    try {
      if (await syncSubscription(stripe, key, String(row.stripe_subscription_id))) checked++;
      else failed++;
    } catch (e) {
      failed++;
      console.warn("billing re-check failed for one subscriber", { id: row.id, error: (e as Error).name });
    }
  }
  return json({ checked, failed });
}, cronOnly);
