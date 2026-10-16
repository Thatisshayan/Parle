import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { toConnectAccount } from "../lessons/payments.ts";
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

export async function handlePayoutEvent(db: SupabaseClient, eventId: string, type: string, object: Record<string, any>): Promise<Record<string, unknown>> {
  const { data: seen, error: seenError } = await db.from("stripe_event").select("id").eq("id", eventId).maybeSingle();
  if (seenError) throw new Error(seenError.message);
  if (seen) return { received: true, handled: "duplicate" };
  let handled: string;
  if (type === "account.updated") {
    handled = (await applyAccountUpdate(db, toConnectAccount(object), new Date())) ? "account_updated" : "account_unknown";
  } else if (type === "transfer.created") {
    // normally already recorded by the job; this covers a transfer whose answer never reached Parle
    const payoutId = String(object.metadata?.payout_id ?? "");
    if (!isUuid(payoutId)) {
      handled = "payout_unknown";
    } else {
      const { data, error } = await db.rpc("payout_mark_paid", { p_payout: payoutId, p_transfer: String(object.id) });
      if (error) throw new Error(error.message);
      handled = data === "paid" ? "payout_paid" : "payout_unchanged";
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
      await alertAdmins("a tutor transfer was reversed outside Parle", [
        `Payout ${p.id} (lesson ${p.booking_id}): Stripe reports ${money(total)} reversed in total, more than Parle recorded.`,
        "Check Stripe's dashboard to see who reversed it.",
      ], `reversed:${p.id}:${total}`);
      handled = "reversal_recorded";
    } else {
      handled = "reversal_known";
    }
  }
  const { error: recordError } = await db.from("stripe_event").insert({ id: eventId, type });
  if (recordError && recordError.code !== "23505") throw new Error(recordError.message);
  return { received: true, handled };
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
    result = data === "held" ? "held" : "unchanged";
  }
  const next = result === "paid"
    ? "The tutor was already paid. On the Payouts screen you can take their share back or have Parle absorb it."
    : "The tutor's payout is held until you decide on the Payouts screen.";
  await alertAdmins(result === "paid" ? "chargeback after the tutor was paid" : "chargeback on a lesson", [`Lesson ${bookingId}: the learner's bank disputed the payment.`, next], `chargeback:${bookingId}`);
  return result;
}
