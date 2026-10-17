import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sendMail } from "../email.ts";
import { allowedOrigins } from "../cors.ts";
import { loadBooking, person, tutorInfo, type BookingRow } from "./store.ts";
import {
  cancellationMails, confirmationMails, reminderMails, rescheduleMails, reviewRequestMail, slotLostMail, type SlotLostReason,
  type CancelInfo, type MailContext, type OutgoingMail,
} from "./mail-copy.ts";

/** The app address the emails link to (function setting APP_URL: the private preview until launch). */
export function appUrl(): string {
  const configured = (Deno.env.get("APP_URL") ?? "").trim().replace(/\/+$/, "");
  return configured || allowedOrigins()[0] || "https://parle.buzz";
}

export async function mailContext(db: SupabaseClient, row: BookingRow, opts: { allowMissingTutor?: boolean } = {}): Promise<MailContext | null> {
  const [learner, found] = await Promise.all([row.learner_id ? person(db, row.learner_id) : null, row.tutor_id ? tutorInfo(db, row.tutor_id) : null]);
  // a deleted tutor: the learner is still told about the refund (A55; slot-lost email only)
  const tutor = found ?? (opts.allowMissingTutor && learner ? { email: "", displayName: "your tutor", timeZone: learner.timeZone, meetingLink: "" } : null);
  if (!learner || !tutor) return null;
  return {
    lesson: { id: row.id, startAt: new Date(row.start_at).toISOString(), endAt: new Date(row.end_at).toISOString(), minutes: row.minutes, priceCents: row.price_cents, learnerMessage: row.learner_message, rescheduleCount: row.reschedule_count },
    learner: { email: learner.email, name: learner.firstName || "Your learner", timeZone: learner.timeZone },
    tutor: { email: tutor.email, name: tutor.displayName, timeZone: tutor.timeZone },
    meetingLink: tutor.meetingLink,
    appUrl: appUrl(),
    now: new Date().toISOString(),
  };
}

/**
 * Each email carries a duplicate-protection key per lesson, kind and recipient: when a run fails after the learner's
 * email went out, the retry resends both but Resend delivers the learner's only once (final review).
 */
async function send(mails: OutgoingMail[], key: string) {
  for (const mail of mails) await sendMail({ ...mail, from: "automatic", idempotencyKey: `${key}:${mail.to}` });
}

async function withContext(db: SupabaseClient, bookingId: string, kind: string, build: (c: MailContext) => OutgoingMail[], opts: { allowMissingTutor?: boolean } = {}) {
  const row = await loadBooking(db, bookingId);
  const c = row ? await mailContext(db, row, opts) : null;
  if (c) await send(build(c), `lesson:${bookingId}:${kind}:${row!.reschedule_count}`);
}

/** Confirmation emails, once per lesson: claimed by stamping confirmation_sent_at, released if sending fails. */
export async function sendConfirmation(db: SupabaseClient, bookingId: string): Promise<boolean> {
  const { data, error } = await db.from("booking").update({ confirmation_sent_at: new Date().toISOString() })
    .eq("id", bookingId).eq("status", "confirmed").is("confirmation_sent_at", null).select("*");
  if (error) throw new Error(error.message);
  const row = data?.[0] as BookingRow | undefined;
  if (!row) return false;
  try {
    const c = await mailContext(db, row);
    if (c) await send(confirmationMails(c), `lesson:${bookingId}:confirmation`);
    return true;
  } catch (e) {
    await db.from("booking").update({ confirmation_sent_at: null }).eq("id", bookingId);
    throw e;
  }
}

export const sendCancellation = (db: SupabaseClient, bookingId: string, info: CancelInfo) => withContext(db, bookingId, "cancellation", (c) => cancellationMails(c, info));
export const sendReschedule = (db: SupabaseClient, bookingId: string, old: { startAt: string; endAt: string; rescheduleCount: number }) =>
  withContext(db, bookingId, "reschedule", (c) => rescheduleMails(c, old));
export const sendSlotLost = (db: SupabaseClient, bookingId: string, refundCents: number, reason: SlotLostReason = "time_taken") =>
  withContext(db, bookingId, "slot-lost", (c) => [slotLostMail(c, refundCents, reason)], { allowMissingTutor: true });

export async function sendReminder(db: SupabaseClient, row: BookingRow, kind: "24h" | "1h") {
  const c = await mailContext(db, row);
  if (c) await send(reminderMails(c, kind), `lesson:${row.id}:reminder-${kind}:${row.reschedule_count}`);
}
export async function sendReviewRequest(db: SupabaseClient, row: BookingRow) {
  const c = await mailContext(db, row);
  if (c) await send([reviewRequestMail(c)], `lesson:${row.id}:review-request`);
}
