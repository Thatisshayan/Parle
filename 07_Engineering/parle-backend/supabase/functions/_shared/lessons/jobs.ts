import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { LessonPayments } from "./payments.ts";
import type { LessonSettings } from "./settings.ts";
import { completeCheckout } from "./confirm.ts";
import { sendConfirmation, sendReminder, sendReviewRequest } from "./notify.ts";
import { buildBrief } from "./brief.ts";
import { reminderDue } from "./rules.ts";
import { person, type BookingRow } from "./store.ts";
import { schedulePayout, scheduleMissingPayouts } from "../payouts/schedule.ts";
import { resumeStaleClaims, sendDuePayouts } from "../payouts/send.ts";

export type JobStep = (db: SupabaseClient, payments: LessonPayments, settings: LessonSettings, now: Date) => Promise<number>;
export const BATCH = 20;

async function expire(db: SupabaseClient, id: string, now: Date) {
  await db.from("booking").update({ status: "expired", status_changed_at: now.toISOString() }).eq("id", id).eq("status", "pending_payment");
}

async function confirmIfPaid(db: SupabaseClient, payments: LessonPayments, sessionId: string): Promise<boolean> {
  const session = await payments.getCheckout(sessionId);
  if (session.status !== "complete" || session.paymentStatus !== "paid" || !session.paymentIntentId || session.amountTotal === null) return false;
  await completeCheckout(db, payments, { id: session.id, paymentIntentId: session.paymentIntentId, amountTotal: session.amountTotal, bookingId: session.bookingId }, null);
  return true;
}

/** Open holds: confirm what Stripe says is paid (a missed event); expire what was abandoned (spec section 4). */
export const reconcileHolds: JobStep = async (db, payments, _settings, now) => {
  const { data, error } = await db.from("booking").select("id, stripe_checkout_session_id, hold_expires_at, created_at")
    .eq("status", "pending_payment").lt("created_at", new Date(now.getTime() - 2 * 60_000).toISOString()).order("created_at").limit(BATCH);
  if (error) throw new Error(error.message);
  let handled = 0;
  for (const b of data ?? []) {
    // one hold Stripe cannot read must not stop the others (final review): log it and go on
    try {
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
    } catch (e) {
      console.warn("lesson hold could not be reconciled; the next run retries", (e as Error).message);
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
  for (const b of data ?? []) {
    try {
      if (await confirmIfPaid(db, payments, b.stripe_checkout_session_id!)) handled++;
    } catch (e) {
      console.warn("late lesson payment could not be checked; the next run retries", (e as Error).message);
    }
  }
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

const HOUR = 3_600_000;

/** Briefs for lessons in the next 24 h that have none yet (spec section 6). */
export const buildDueBriefs: JobStep = async (db, _payments, _settings, now) => {
  const { data, error } = await db.from("booking").select("*").eq("status", "confirmed").gt("start_at", now.toISOString())
    .lte("start_at", new Date(now.getTime() + 24 * HOUR).toISOString()).order("start_at").limit(50);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as BookingRow[];
  if (!rows.length) return 0;
  const { data: have } = await db.from("lesson_brief").select("booking_id").in("booking_id", rows.map((r) => r.id));
  const done = new Set((have ?? []).map((b: { booking_id: string }) => b.booking_id));
  let built = 0;
  for (const row of rows) {
    if (done.has(row.id) || !row.learner_id) continue;
    const learner = await person(db, row.learner_id);
    const content = await buildBrief(db, row, learner?.firstName || "Your learner");
    const { error: saveError } = await db.from("lesson_brief").upsert({ booking_id: row.id, content, built_at: now.toISOString() }, { onConflict: "booking_id", ignoreDuplicates: true });
    if (!saveError) built++;
  }
  return built;
};

/** Each reminder once: claimed by stamping its column first (two runs at once, Review Focus 5), released on failure. */
function reminderStep(kind: "24h" | "1h"): JobStep {
  const column = kind === "24h" ? "reminder_24h_sent_at" : "reminder_1h_sent_at";
  return async (db, _payments, _settings, now) => {
    const { data, error } = await db.from("booking").select("*").eq("status", "confirmed").is(column, null)
      .gt("start_at", now.toISOString()).lte("start_at", new Date(now.getTime() + (kind === "24h" ? 24 : 1) * HOUR).toISOString())
      .order("start_at").limit(50);
    if (error) throw new Error(error.message);
    let sent = 0;
    for (const row of (data ?? []) as BookingRow[]) {
      const { data: claimed } = await db.from("booking").update({ [column]: now.toISOString() }).eq("id", row.id).is(column, null).select("id");
      if (!claimed?.length) continue;
      // booked less than 24 h ahead, or already inside the last hour: no "tomorrow" email (the claim records the skip)
      if (!reminderDue(kind, { startAt: row.start_at, bookedAt: row.booked_at, now })) continue;
      try {
        await sendReminder(db, row, kind);
        sent++;
      } catch (e) {
        await db.from("booking").update({ [column]: null }).eq("id", row.id);
        console.warn("lesson reminder failed; the next run retries", (e as Error).message);
      }
    }
    return sent;
  };
}

/** Lessons nobody marked are completed auto_complete_hours (48) after their end (spec section 6). */
export const autoComplete: JobStep = async (db, _payments, settings, now) => {
  const cutoff = new Date(now.getTime() - settings.auto_complete_hours * HOUR).toISOString();
  const { data, error } = await db.from("booking")
    .update({ status: "completed", completed_at: now.toISOString(), attendance_marked_by: "auto", status_changed_at: now.toISOString() })
    .eq("status", "confirmed").lte("end_at", cutoff).select("id");
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    await schedulePayout(db, r.id, settings).catch((e) => console.warn("payout not scheduled; the safety net retries", (e as Error).message));
  }
  return (data ?? []).length;
};

/** After a completed lesson the learner is asked once for a review (completed in the last 14 days). */
export const sendReviewRequests: JobStep = async (db, _payments, _settings, now) => {
  const { data, error } = await db.from("booking").select("*").eq("status", "completed").is("review_request_sent_at", null)
    .not("learner_id", "is", null).gt("end_at", new Date(now.getTime() - 14 * 24 * HOUR).toISOString()).order("end_at").limit(50);
  if (error) throw new Error(error.message);
  let sent = 0;
  for (const row of (data ?? []) as BookingRow[]) {
    const { data: claimed } = await db.from("booking").update({ review_request_sent_at: now.toISOString() }).eq("id", row.id).is("review_request_sent_at", null).select("id");
    if (!claimed?.length) continue;
    try {
      await sendReviewRequest(db, row);
      sent++;
    } catch (e) {
      await db.from("booking").update({ review_request_sent_at: null }).eq("id", row.id);
      console.warn("review request failed; the next run retries", (e as Error).message);
    }
  }
  return sent;
};

/** Every 10 minutes, in this order; later tasks add confirmations, briefs, reminders, auto-complete, review requests. */
export const JOB_STEPS: Array<[string, JobStep]> = [
  ["holds", reconcileHolds],
  ["late_payments", reconcileLatePayments],
  ["confirmations", sendMissedConfirmations],
  ["briefs", buildDueBriefs],
  ["reminders_24h", reminderStep("24h")],
  ["reminders_1h", reminderStep("1h")],
  ["auto_completed", autoComplete],
  ["review_requests", sendReviewRequests],
  ["payouts_scheduled", scheduleMissingPayouts],
  ["payouts_resumed", resumeStaleClaims],
  ["payouts_sent", sendDuePayouts],
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
