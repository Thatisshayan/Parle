import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { LessonPayments } from "./payments.ts";
import { sendConfirmation, sendSlotLost } from "./notify.ts";
import type { SlotLostReason } from "./mail-copy.ts";
import { isPaused } from "../account-status.ts";

export type PaidSession = { id: string; paymentIntentId: string; amountTotal: number; bookingId?: string | null };

/**
 * A paid Checkout session (from the webhook, or from Stripe via the reconciliation job). Confirms the lesson, or, when
 * the time was lost after the hold lapsed, refunds the payment once (spec section 4, edge cases).
 */
export async function completeCheckout(db: SupabaseClient, payments: LessonPayments, s: PaidSession, eventId: string | null): Promise<string> {
  // The Checkout id may never have been saved on the booking (a failed write after Stripe made the page): the booking
  // id Stripe carries in the session's metadata finds it, so a paid lesson is never left unconfirmed (final review).
  if (s.bookingId) {
    const { error: linkError } = await db.from("booking").update({ stripe_checkout_session_id: s.id })
      .eq("id", s.bookingId).is("stripe_checkout_session_id", null);
    if (linkError) throw new Error(linkError.message);
  }
  const { data: outcome, error } = await db.rpc("lesson_confirm_payment", { p_session: s.id, p_payment_intent: s.paymentIntentId, p_amount: s.amountTotal, p_event: eventId });
  if (error) throw new Error(error.message);
  if (outcome === "confirmed" || outcome === "confirmed_late") {
    const { data: row } = await db.from("booking").select("id").eq("stripe_checkout_session_id", s.id).maybeSingle();
    if (row) await sendConfirmation(db, row.id).catch((e) => console.warn("lesson confirmation email failed; the jobs retry", (e as Error).message));
  }
  if (outcome === "slot_lost") {
    const { data: row, error: readError } = await db.from("booking").select("id, tutor_id, learner_id, price_cents, cancelled_by").eq("stripe_checkout_session_id", s.id).single();
    if (readError) throw new Error(readError.message);
    const refund = await payments.refund({ paymentIntentId: s.paymentIntentId, amountCents: s.amountTotal, idempotencyKey: `lesson-refund:${row.id}:slot_lost`, bookingId: row.id, reason: "slot_lost" });
    const { data: recorded, error: recordError } = await db.rpc("lesson_record_refund", { p_booking: row.id, p_amount: s.amountTotal, p_refund_id: refund.id, p_reason: "slot_lost", p_by: "system", p_event: eventId });
    if (recordError) throw new Error(recordError.message);
    // A55: the email gives the real reason
    // R126: a paused learner is told their own account is paused, not that the tutor is away
    const reason: SlotLostReason = !row.tutor_id ? "tutor_gone"
      : row.learner_id && (await isPaused(db, row.learner_id)) ? "account_paused"
      : row.cancelled_by === "admin" || (await isPaused(db, row.tutor_id)) ? "tutor_unavailable"
      : row.cancelled_by === "learner" ? "learner_replaced"
      : s.amountTotal !== row.price_cents ? "amount_mismatch" : "time_taken";
    if (recorded === "recorded") await sendSlotLost(db, row.id, s.amountTotal, reason).catch((e) => console.warn("slot_lost email failed", (e as Error).message));
  }
  return String(outcome);
}
