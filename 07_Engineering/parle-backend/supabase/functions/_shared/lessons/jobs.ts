import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { LessonPayments } from "./payments.ts";
import type { LessonSettings } from "./settings.ts";
import { completeCheckout } from "./confirm.ts";
import { sendConfirmation } from "./notify.ts";

export type JobStep = (db: SupabaseClient, payments: LessonPayments, settings: LessonSettings, now: Date) => Promise<number>;
export const BATCH = 20;

async function expire(db: SupabaseClient, id: string, now: Date) {
  await db.from("booking").update({ status: "expired", status_changed_at: now.toISOString() }).eq("id", id).eq("status", "pending_payment");
}

async function confirmIfPaid(db: SupabaseClient, payments: LessonPayments, sessionId: string): Promise<boolean> {
  const session = await payments.getCheckout(sessionId);
  if (session.status !== "complete" || session.paymentStatus !== "paid" || !session.paymentIntentId || session.amountTotal === null) return false;
  await completeCheckout(db, payments, { id: session.id, paymentIntentId: session.paymentIntentId, amountTotal: session.amountTotal }, null);
  return true;
}

/** Open holds: confirm what Stripe says is paid (a missed event); expire what was abandoned (spec section 4). */
export const reconcileHolds: JobStep = async (db, payments, _settings, now) => {
  const { data, error } = await db.from("booking").select("id, stripe_checkout_session_id, hold_expires_at, created_at")
    .eq("status", "pending_payment").lt("created_at", new Date(now.getTime() - 2 * 60_000).toISOString()).order("created_at").limit(BATCH);
  if (error) throw new Error(error.message);
  let handled = 0;
  for (const b of data ?? []) {
    const lapsed = !b.hold_expires_at || Date.parse(b.hold_expires_at) <= now.getTime();
    if (!b.stripe_checkout_session_id) {
      if (lapsed) { await expire(db, b.id, now); handled++; }
      continue;
    }
    if (await confirmIfPaid(db, payments, b.stripe_checkout_session_id)) { handled++; continue; }
    if (lapsed) {
      await payments.expireCheckout(b.stripe_checkout_session_id).catch(() => undefined); // already closed is fine
      await expire(db, b.id, now);
      handled++;
    }
  }
  return handled;
};

/** Holds that ended in the last 2 hours: a payment Stripe completed without telling us is confirmed or refunded. */
export const reconcileLatePayments: JobStep = async (db, payments, _settings, now) => {
  const { data, error } = await db.from("booking").select("id, stripe_checkout_session_id").eq("status", "expired")
    .not("stripe_checkout_session_id", "is", null).gt("status_changed_at", new Date(now.getTime() - 2 * 3_600_000).toISOString())
    .order("status_changed_at").limit(BATCH);
  if (error) throw new Error(error.message);
  let handled = 0;
  for (const b of data ?? []) if (await confirmIfPaid(db, payments, b.stripe_checkout_session_id!)) handled++;
  return handled;
};

/** Confirmed lessons whose emails did not go out (Resend down at the time): sent once, later. */
export const sendMissedConfirmations: JobStep = async (db, _payments, _settings, now) => {
  const { data, error } = await db.from("booking").select("id").eq("status", "confirmed").is("confirmation_sent_at", null)
    .gt("start_at", now.toISOString()).order("start_at").limit(BATCH);
  if (error) throw new Error(error.message);
  let sent = 0;
  for (const b of data ?? []) {
    try { if (await sendConfirmation(db, b.id)) sent++; } catch (e) { console.warn("lesson confirmation retry failed", (e as Error).message); }
  }
  return sent;
};

/** Every 10 minutes, in this order; later tasks add confirmations, briefs, reminders, auto-complete, review requests. */
export const JOB_STEPS: Array<[string, JobStep]> = [
  ["holds", reconcileHolds],
  ["late_payments", reconcileLatePayments],
  ["confirmations", sendMissedConfirmations],
];

export async function runBookingJobs(db: SupabaseClient, payments: LessonPayments, settings: LessonSettings, now: Date): Promise<Record<string, number>> {
  const report: Record<string, number> = {};
  for (const [name, step] of JOB_STEPS) {
    try {
      report[name] = await step(db, payments, settings, now);
    } catch (e) {
      report[name] = -1;
      console.error("booking job step failed", name, (e as Error).message);
    }
  }
  return report;
}
