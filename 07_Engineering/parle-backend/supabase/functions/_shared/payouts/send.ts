import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { LessonPayments, TransferResult } from "../lessons/payments.ts";
import type { JobStep } from "../lessons/jobs.ts";
import { money } from "../lessons/mail-copy.ts";
import { alertAdmins } from "./alerts.ts";
import { auditPayout } from "./audit.ts";

const BATCH = 20; // spec section 7: batches of 20, far inside the function time limit
const STALE_MINUTES = 15;

/** Records a transfer made at Stripe, and what it sent (decision #55: CAD). Used by the jobs and the administrator's actions. */
export async function recordPaid(db: SupabaseClient, payoutId: string, transfer: TransferResult): Promise<void> {
  const { error } = await db.rpc("payout_mark_paid", { p_payout: payoutId, p_transfer: transfer.id });
  // the transfer exists at Stripe: leave the claim, the stale-claim step finds it again by its transfer group
  if (error) throw new Error(`transfer made but not recorded: ${error.message}`);
  const { error: amountError } = await db.rpc("payout_record_transfer", { p_payout: payoutId, p_currency: transfer.currency, p_cents: transfer.amountCents });
  if (amountError) console.warn("transfer amount not recorded", "database_error");
}

async function sourceCharge(db: SupabaseClient, payments: LessonPayments, bookingId: string): Promise<{ charge: string | null; currency: string }> {
  const { data, error } = await db.from("payment").select("stripe_payment_intent_id, currency").eq("booking_id", bookingId).maybeSingle();
  if (error) throw new Error(error.message);
  return { charge: data ? await payments.chargeIdFor(data.stripe_payment_intent_id) : null, currency: String(data?.currency ?? "cad") };
}

/**
 * A claimed payout (spec section 7): check the tutor's account, look for a transfer whose answer was lost, otherwise
 * transfer with the payout's idempotency key. A failure holds it and alerts the administrator; it is never retried.
 */
export async function sendClaimed(db: SupabaseClient, payments: LessonPayments, payoutId: string): Promise<"paid" | "held"> {
  const { data, error } = await db.from("payout").select("id, booking_id, tutor_id, amount_cents, transfer_attempt, created_at").eq("id", payoutId).single();
  if (error) throw new Error(error.message);
  const p = data as { id: string; booking_id: string; tutor_id: string; amount_cents: number; transfer_attempt: number; created_at: string };
  const { data: account, error: accountError } = await db.from("tutor_payout_account").select("stripe_account_id, payouts_enabled").eq("tutor_id", p.tutor_id).maybeSingle();
  if (accountError) throw new Error(accountError.message);
  if (!account?.stripe_account_id || account.payouts_enabled !== true) {
    // not a failed transfer: released by itself when Stripe enables the account again (Review Focus 5)
    await db.rpc("payout_hold", { p_payout: p.id, p_reason: "account_not_ready" });
    return "held";
  }
  let transfer: TransferResult;
  try {
    const existing = await payments.findTransfer(p.id, account.stripe_account_id, p.created_at); // Review Focus 2: never pay twice
    const source = existing ? null : await sourceCharge(db, payments, p.booking_id);
    transfer = existing ?? await payments.transfer({
      payoutId: p.id, attempt: p.transfer_attempt, accountId: account.stripe_account_id, amountCents: p.amount_cents,
      sourceCharge: source!.charge, chargeCurrency: source!.currency, bookingId: p.booking_id,
    });
  } catch (e) {
    await db.rpc("payout_hold", { p_payout: p.id, p_reason: "transfer_failed" });
    await alertAdmins("a tutor transfer failed", [
      `Payout ${p.id} (lesson ${p.booking_id}) for ${money(p.amount_cents)} could not be sent: ${(e as Error).message.slice(0, 200)}`,
      "It is held and will not be retried automatically. Release it on the Payouts screen once the cause is fixed.",
    ], `failed:${p.id}:${p.transfer_attempt}`);
    return "held";
  }
  await recordPaid(db, p.id, transfer);
  return "paid";
}

/** Claims a due payout, then sends it; "not_due" when it is not due, held, under a decision or already claimed. */
export async function sendPayout(db: SupabaseClient, payments: LessonPayments, payoutId: string): Promise<"paid" | "held" | "not_due"> {
  const { data: claim, error } = await db.rpc("payout_claim", { p_payout: payoutId });
  if (error) throw new Error(error.message);
  if (claim !== "claimed") return "not_due";
  return await sendClaimed(db, payments, payoutId);
}

/** A60 (R68): payouts held only because the account was not ready go back to scheduled once it is (missed moments). */
export const releaseReadyHolds: JobStep = async (db, _payments, _settings, now) => {
  const { data, error } = await db.rpc("payout_release_ready", { p_limit: BATCH });
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as Array<{ id: string }>) {
    await auditPayout(db, { actorId: null, actorLabel: "system", action: "payout.auto_release", payoutId: r.id, oldValue: "held: account_not_ready", newValue: "scheduled: the payout account can receive payouts", now });
  }
  return (data ?? []).length;
};

/** Every 10 minutes: due, unheld payouts, at most 20 per run (spec section 7). */
export const sendDuePayouts: JobStep = async (db, payments) => {
  // only payouts the jobs can claim: one of a disputed lesson waits for its hold instead of filling the batch
  const { data, error } = await db.rpc("payout_due", { p_limit: BATCH });
  if (error) throw new Error(error.message);
  let paid = 0;
  for (const p of (data ?? []) as Array<{ id: string }>) {
    try {
      if ((await sendPayout(db, payments, p.id)) === "paid") paid++;
    } catch (e) {
      console.warn("payout could not be sent this run", e instanceof Error ? e.name : "unknown");
    }
  }
  return paid;
};

/** The tutor's Stripe account, so a transfer made without our transfer group can still be found (A101). */
export async function payoutAccountId(db: SupabaseClient, tutorId: string): Promise<string | null> {
  const { data } = await db.from("tutor_payout_account").select("stripe_account_id").eq("tutor_id", tutorId).maybeSingle();
  return data?.stripe_account_id ?? null;
}

/** A claim older than 15 minutes lost its answer (the function stopped): record Stripe's transfer, or free the claim. */
export const resumeStaleClaims: JobStep = async (db, payments, _settings, now) => {
  const { data, error } = await db.from("payout").select("id, tutor_id, created_at").eq("status", "scheduled").is("stripe_transfer_id", null)
    .not("transfer_started_at", "is", null).lt("transfer_started_at", new Date(now.getTime() - STALE_MINUTES * 60_000).toISOString()).limit(BATCH);
  if (error) throw new Error(error.message);
  let resumed = 0;
  for (const p of data ?? []) {
    try {
      const found = await payments.findTransfer(p.id, await payoutAccountId(db, p.tutor_id), p.created_at);
      if (found) {
        await recordPaid(db, p.id, found);
      } else {
        // nothing reached Stripe: the next send uses the same idempotency key, so it can never pay twice
        const { error: freeError } = await db.from("payout").update({ transfer_started_at: null, updated_at: now.toISOString() })
          .eq("id", p.id).eq("status", "scheduled").is("stripe_transfer_id", null);
        if (freeError) throw new Error(freeError.message);
      }
      resumed++;
    } catch (e) {
      console.warn("stale payout claim could not be checked; the next run retries", e instanceof Error ? e.name : "unknown");
    }
  }
  return resumed;
};
