import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { LessonPayments } from "../lessons/payments.ts";
import { isUuid } from "../lessons/rules.ts";
import { money } from "../lessons/mail-copy.ts";
import { applyAccountUpdate } from "./accounts.ts";
import { alertAdmins } from "./alerts.ts";

/** account.updated comes from the connected-accounts destination; transfers are Parle's own, marked lesson_payout. */
export function isPayoutEvent(type: string, object: Record<string, any>): boolean {
  if (type === "account.updated") return typeof object?.id === "string" && object.id.startsWith("acct_");
  if (type === "transfer.created" || type === "transfer.reversed") return object?.metadata?.kind === "lesson_payout";
  return false;
}

/** A claim older than this was left by a worker that stopped before finishing (longer than any webhook run). */
const STALE_CLAIM_SECONDS = 120;

export async function handlePayoutEvent(db: SupabaseClient, payments: LessonPayments, eventId: string, type: string, object: Record<string, any>): Promise<Record<string, unknown>> {
  // A66 (R74): claim the event first, so two deliveries at once are handled once; a failure gives the claim back so
  // Stripe's retry runs again (every branch below is safe to repeat)
  const { data: claimed, error: claimError } = await db.from("stripe_event")
    .upsert({ id: eventId, type, claimed_at: new Date().toISOString() }, { onConflict: "id", ignoreDuplicates: true }).select("id");
  if (claimError) throw new Error(claimError.message);
  if (!claimed?.length) {
    // R122: a claim whose worker was stopped before finishing is taken again after the stale window
    const { data: retaken, error: retakeError } = await db.rpc("stripe_event_retake", { p_id: eventId, p_stale_seconds: STALE_CLAIM_SECONDS });
    if (retakeError) throw new Error(retakeError.message);
    if (retaken !== true) return { received: true, handled: "duplicate" };
  }
  try {
    const handled = await handleClaimedPayoutEvent(db, payments, type, object);
    await db.from("stripe_event").update({ claimed_at: null }).eq("id", eventId);
    return { received: true, handled };
  } catch (e) {
    await db.from("stripe_event").delete().eq("id", eventId);
    throw e;
  }
}

async function handleClaimedPayoutEvent(db: SupabaseClient, payments: LessonPayments, type: string, object: Record<string, any>): Promise<string> {
  let handled: string;
  if (type === "account.updated") {
    // A60 (R68): Stripe's current state, not the event's copy, so an event delivered late cannot undo a newer one.
    // Stripe unreachable: this throws, the webhook answers 500 and Stripe sends the event again.
    const { data: known, error: knownError } = await db.from("tutor_payout_account").select("tutor_id").eq("stripe_account_id", String(object.id)).maybeSingle();
    if (knownError) throw new Error(knownError.message);
    handled = !known ? "account_unknown"
      : (await applyAccountUpdate(db, await payments.getConnectAccount(String(object.id)), new Date())) ? "account_updated" : "account_unknown";
  } else if (type === "transfer.created") {
    // normally already recorded by the job; this covers a transfer whose answer never reached Parle
    const payoutId = String(object.metadata?.payout_id ?? "");
    if (!isUuid(payoutId)) {
      handled = "payout_unknown";
    } else {
      const { data, error } = await db.rpc("payout_mark_paid", { p_payout: payoutId, p_transfer: String(object.id) });
      if (error) throw new Error(error.message);
      handled = data === "paid" ? "payout_paid" : "payout_unchanged";
      if (data === "paid") {
        await db.rpc("payout_record_transfer", { p_payout: payoutId, p_currency: String(object.currency ?? "cad"), p_cents: Number(object.amount ?? 0) });
      } else {
        // Stripe paid the tutor for a payout Parle no longer expects to pay (cancelled, or paid by another transfer)
        await alertAdmins("a tutor transfer Parle did not expect", [
          `Payout ${payoutId}: Stripe made transfer ${String(object.id)} of ${money(Number(object.amount ?? 0))}, but Parle could not record it as this payout.`,
          "Check the payout on the Payouts screen and in Stripe's dashboard; the tutor may have been paid for a lesson that was refunded.",
        ], `unexpected-transfer:${String(object.id)}`);
      }
    }
  } else {
    const total = Number(object.amount_reversed ?? 0);
    const { data: p, error } = await db.from("payout").select("id, booking_id, reversed_cents").eq("stripe_transfer_id", String(object.id)).maybeSingle();
    if (error) throw new Error(error.message);
    if (!p) {
      handled = "payout_unknown";
    } else if (total > Number(p.reversed_cents)) {
      const { error: upError } = await db.from("payout").update({ reversed_cents: total, updated_at: new Date().toISOString() }).eq("id", p.id).lt("reversed_cents", total);
      if (upError) throw new Error(upError.message);
      // a reversal Parle itself is making (refund after payout) lands here before Parle records it: no alert then
      const { data: ours } = await db.from("refund").select("id").eq("booking_id", p.booking_id).eq("reason", "admin_after_payout").maybeSingle();
      const { data: deciding } = await db.from("payout").select("decision").eq("id", p.id).maybeSingle();
      if (!ours && deciding?.decision !== "refund_after_payout") await alertAdmins("a tutor transfer was reversed outside Parle", [
        `Payout ${p.id} (lesson ${p.booking_id}): Stripe reports ${money(total)} reversed in total, more than Parle recorded.`,
        "Check Stripe's dashboard to see who reversed it.",
      ], `reversed:${p.id}:${total}`);
      handled = "reversal_recorded";
    } else {
      handled = "reversal_known";
    }
  }
  return handled;
}

/** A Stripe chargeback (charge.dispute.created) holds any unpaid payout and alerts the administrator (spec section 7). */
export async function holdForChargeback(db: SupabaseClient, bookingId: string): Promise<string> {
  const { data: p, error } = await db.from("payout").select("id, status").eq("booking_id", bookingId).maybeSingle();
  if (error) throw new Error(error.message);
  let result = "none"; // no payout yet: payout_schedule creates it held, because the payment is disputed
  if (p?.status === "paid" || p?.status === "cancelled") {
    result = p.status;
  } else if (p) {
    const { data, error: holdError } = await db.rpc("payout_hold", { p_payout: p.id, p_reason: "chargeback" });
    if (holdError) throw new Error(holdError.message);
    result = data === "held" ? "held" : data === "in_flight" ? "in_flight" : "unchanged";
  }
  const next = result === "paid"
    ? "The tutor was already paid. On the Payouts screen you can take their share back or have Parle absorb it."
    : result === "in_flight"
      ? "The tutor's payout was being sent at that moment. Check the Payouts screen in a few minutes: if it was paid, take the share back or have Parle absorb it."
      : "The tutor's payout is held until you decide on the Payouts screen.";
  await alertAdmins(result === "paid" ? "chargeback after the tutor was paid" : "chargeback on a lesson", [`Lesson ${bookingId}: the learner's bank disputed the payment.`, next], `chargeback:${bookingId}`);
  return result;
}
