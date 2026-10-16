import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { LessonPayments } from "./payments.ts";
import { completeCheckout } from "./confirm.ts";

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
  const { data: pay, error } = await db.from("payment").select("id, amount_cents, refunded_cents, status").eq("stripe_payment_intent_id", pi).maybeSingle();
  if (error) throw new Error(error.message);
  if (!pay) return { received: true, handled: false }; // not a lesson payment
  const at = new Date().toISOString();
  if (type === "charge.dispute.created") {
    await db.from("payment").update({ status: "disputed", updated_at: at }).eq("id", pay.id);
    console.warn("stripe-webhook: a lesson payment is disputed (chargeback); Plan 7B holds the payout");
    return { received: true, handled: "disputed" };
  }
  // charge.refunded: Stripe's total wins, which also covers a refund made in Stripe's dashboard
  const refunded = Math.min(pay.amount_cents, Math.max(Number(pay.refunded_cents), Number(object.amount_refunded ?? 0)));
  const status = pay.status === "disputed" ? "disputed" : refunded >= pay.amount_cents ? "refunded" : refunded > 0 ? "partly_refunded" : "succeeded";
  await db.from("payment").update({ refunded_cents: refunded, status, updated_at: at }).eq("id", pay.id);
  return { received: true, handled: "refund_recorded" };
}
