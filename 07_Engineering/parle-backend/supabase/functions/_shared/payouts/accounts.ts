import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Booking opens only for a tutor whose Stripe account can receive payouts (spec section 4, "Who can book"). */
export async function tutorCanReceivePayouts(db: SupabaseClient, tutorId: string): Promise<boolean> {
  const { data, error } = await db.from("tutor_payout_account").select("stripe_account_id, payouts_enabled, tutor_deleted_at").eq("tutor_id", tutorId).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data?.stripe_account_id && data.payouts_enabled === true && !data.tutor_deleted_at);
}
