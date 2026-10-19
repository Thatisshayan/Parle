import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { LessonPayments } from "./payments.ts";
import { completeCheckout } from "./confirm.ts";
import { holdForChargeback } from "../payouts/webhook.ts";
import { alertAdmins } from "../payouts/alerts.ts";
import { markPaymentDisputed } from "./disputes.ts";

/** Lesson Checkout pages carry metadata.kind = "lesson"; refunds and disputes are matched by payment intent. */
export function isLessonEvent(type: string, object: Record<string, any>): boolean {
  if (type === "checkout.session.completed" || type === "checkout.session.expired") return object?.metadata?.kind === "lesson";
  return type === "charge.refunded" || type === "charge.dispute.created";
}

export async function handleLessonEvent(db: SupabaseClient, payments: LessonPayments, eventId: string, type: string, object: Record<string, any>): Promise<Record<string, unknown>> {
  if (type === "checkout.session.completed") {
    if (object.payment_status !== "paid" || typeof object.payment_intent !== "string" || !Number.isInteger(object.amount_total)) return { received: true, handled: false };
    return { received: true, handled: await completeCheckout(db, payments, { id: String(object.id), paymentIntentId: object.payment_intent, amountTotal: object.amount_total, bookingId: typeof object.metadata?.booking_id === "string" ? object.metadata.booking_id : null }, eventId) };
  }
  if (type === "checkout.session.expired") {
    const { error } = await db.from("booking").update({ status: "expired", status_changed_at: new Date().toISOString() })
      .eq("stripe_checkout_session_id", String(object.id)).eq("status", "pending_payment");
    if (error) throw new Error(error.message);
    return { received: true, handled: "expired" };
  }
  const pi = typeof object.payment_intent === "string" ? object.payment_intent : "";
  const { data: pay, error } = await db.from("payment").select("id, booking_id, amount_cents, refunded_cents, status").eq("stripe_payment_intent_id", pi).maybeSingle();
  if (error) throw new Error(error.message);
  if (!pay) return { received: true, handled: false }; // not a lesson payment
  const at = new Date().toISOString();
  if (type === "charge.dispute.created") {
    await markPaymentDisputed(db, pay.id, at);
    return { received: true, handled: "disputed", payout: await holdForChargeback(db, pay.booking_id) };
  }
  // charge.refunded: Stripe's total wins, which also covers a refund made in Stripe's dashboard
  const refunded = Math.min(pay.amount_cents, Math.max(Number(pay.refunded_cents), Number(object.amount_refunded ?? 0)));
  const status = pay.status === "disputed" ? "disputed" : refunded >= pay.amount_cents ? "refunded" : refunded > 0 ? "partly_refunded" : "succeeded";
  const { error: refundError } = await db.from("payment").update({ refunded_cents: refunded, status, updated_at: at }).eq("id", pay.id);
  if (refundError) throw new Error(refundError.message);
  let payout: string | null = null;
  if (refunded > 0) {
    const { data: payoutRow, error: payoutError } = await db.from("payout").select("id, status, amount_cents, transfer_started_at, stripe_transfer_id").eq("booking_id", pay.booking_id).maybeSingle();
    if (payoutError) throw new Error(payoutError.message);
    if (payoutRow) {
      const { data: hold, error: holdError } = await db.rpc("payout_hold", { p_payout: payoutRow.id, p_reason: "payment_refund" });
      if (holdError) throw new Error(holdError.message);
      payout = String(hold);
      if (hold === "in_flight" || payoutRow.status === "paid" || payoutRow.stripe_transfer_id) {
        await alertAdmins("learner refund needs tutor payout review", [
          `Lesson ${pay.booking_id}: Stripe recorded ${refunded} refunded cents against ${pay.amount_cents} payment cents.`,
          `Payout ${payoutRow.id} was already in flight or transferred (${payoutRow.status}). Review it on the Payouts screen and apply the finance-approved refund policy.`,
        ], `refund-review:${pay.id}:${refunded}`);
      }
    }
  }
  return { received: true, handled: "refund_recorded", ...(payout ? { payout } : {}) };
}
