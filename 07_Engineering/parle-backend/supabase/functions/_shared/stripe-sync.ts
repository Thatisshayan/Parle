import Stripe from "npm:stripe@14.21.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { persistVerifiedStripeSubscription } from "../_app/functions/parle-premium-status.helper.ts";
import { createSuperdevClientAs, type BuildyUser } from "./superdev-compat.ts";
import { retryOnUniqueConflict } from "./retry.ts";

export function stripeClient(key: string) {
  const host = key.startsWith("sk_test_") ? Deno.env.get("STRIPE_TEST_API_HOST") : null;
  const port = host ? Deno.env.get("STRIPE_TEST_API_PORT") : null;
  const protocol = host ? Deno.env.get("STRIPE_TEST_API_PROTOCOL") : null;
  return new Stripe(key, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
    ...(host ? { host, ...(port ? { port } : {}), ...(protocol ? { protocol: protocol as "http" | "https" } : {}) } : {}),
  });
}

/** The Parle user a Stripe subscription belongs to (metadata.user_id set at checkout), in Buildy's user shape. */
async function ownerOf(userId: string): Promise<BuildyUser | null> {
  if (!userId) return null;
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data } = await db.auth.admin.getUserById(userId);
  const u = data?.user;
  if (!u?.email) return null;
  return { id: u.id, email: u.email, full_name: null, role: (u.app_metadata as any)?.role === "admin" ? "administrator" : "user" };
}

/**
 * Re-reads one subscription from Stripe and stores it in the learner's subscription cache, acting as that learner
 * (as Buildy's code did when the learner pressed "Refresh my plan"). Returns false when nothing was stored.
 */
export async function syncSubscription(stripe: Stripe, key: string, subscriptionId: string): Promise<boolean> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const owner = await ownerOf(String(subscription.metadata?.user_id ?? ""));
  if (!owner) return false;
  const customer = await stripe.customers.retrieve(String(subscription.customer));
  const client = createSuperdevClientAs(owner);
  // One checkout sends three events at once; the losers of the first-save race update the row the winner made (R27).
  const saved = await retryOnUniqueConflict(() => persistVerifiedStripeSubscription({ client, userId: owner.id, email: owner.email, testStripeSecret: key, subscription, customer }));
  return saved !== null;
}
