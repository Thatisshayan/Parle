import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { LessonPayments } from "./payments.ts";
import type { BookingRow } from "./store.ts";

export type RefundReason = "learner_cancelled" | "tutor_cancelled" | "account_deleted" | "admin";

/**
 * Refunds what is still refundable on the lesson's payment (the frozen price paid, Review Focus 4). Stripe sees one
 * idempotency key per booking and reason, so a retry or a second press returns the same refund. Null when unpaid.
 * attempt > 0 (an administrator retrying after Stripe refused, Plan 8 review Important 1): Stripe replays a refusal
 * for the same key for 24 h, so the key gets the attempt number, and a refund already made is found first, never
 * made twice.
 */
/** What was already refunded for a lesson before this action (A54: the cancellation email says so). */
export async function priorRefunded(db: SupabaseClient, bookingId: string): Promise<number> {
  const { data, error } = await db.from("payment").select("refunded_cents").eq("booking_id", bookingId).maybeSingle();
  if (error) throw new Error(error.message);
  return Number(data?.refunded_cents ?? 0);
}

export async function refundLesson(db: SupabaseClient, payments: LessonPayments, row: BookingRow, reason: RefundReason, attempt = 0): Promise<{ refundId: string; amountCents: number } | null> {
  const { data: pay, error } = await db.from("payment").select("stripe_payment_intent_id, amount_cents, refunded_cents").eq("booking_id", row.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!pay) return null;
  const amountCents = Number(pay.amount_cents) - Number(pay.refunded_cents);
  if (amountCents <= 0) return null;
  if (attempt > 0) {
    const earlier = await payments.findRefund(pay.stripe_payment_intent_id, row.id, reason);
    if (earlier) return { refundId: earlier.id, amountCents: earlier.amountCents };
  }
  const key = attempt > 0 ? `lesson-refund:${row.id}:${reason}:${attempt}` : `lesson-refund:${row.id}:${reason}`;
  const refund = await payments.refund({ paymentIntentId: pay.stripe_payment_intent_id, amountCents, idempotencyKey: key, bookingId: row.id, reason });
  return { refundId: refund.id, amountCents };
}
