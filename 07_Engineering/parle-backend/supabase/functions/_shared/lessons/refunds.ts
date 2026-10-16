import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { LessonPayments } from "./payments.ts";
import type { BookingRow } from "./store.ts";

export type RefundReason = "learner_cancelled" | "tutor_cancelled" | "account_deleted";

/**
 * Refunds what is still refundable on the lesson's payment (the frozen price paid, Review Focus 4). Stripe sees one
 * idempotency key per booking and reason, so a retry or a second press returns the same refund. Null when unpaid.
 */
export async function refundLesson(db: SupabaseClient, payments: LessonPayments, row: BookingRow, reason: RefundReason): Promise<{ refundId: string; amountCents: number } | null> {
  const { data: pay, error } = await db.from("payment").select("stripe_payment_intent_id, amount_cents, refunded_cents").eq("booking_id", row.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!pay) return null;
  const amountCents = Number(pay.amount_cents) - Number(pay.refunded_cents);
  if (amountCents <= 0) return null;
  const refund = await payments.refund({ paymentIntentId: pay.stripe_payment_intent_id, amountCents, idempotencyKey: `lesson-refund:${row.id}:${reason}`, bookingId: row.id, reason });
  return { refundId: refund.id, amountCents };
}
