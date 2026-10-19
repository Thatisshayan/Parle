import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Persist the chargeback state before acknowledging Stripe; failures must propagate so Stripe retries. */
export async function markPaymentDisputed(db: SupabaseClient, paymentId: string, at: string): Promise<void> {
  const { error } = await db.from("payment").update({ status: "disputed", updated_at: at }).eq("id", paymentId);
  if (error) throw new Error(error.message);
}
