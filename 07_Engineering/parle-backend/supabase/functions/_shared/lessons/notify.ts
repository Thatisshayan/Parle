import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sendMail } from "../email.ts";
import { allowedOrigins } from "../cors.ts";
import { loadBooking, person, tutorInfo, type BookingRow } from "./store.ts";
import {
  cancellationMails, confirmationMails, reminderMails, rescheduleMails, reviewRequestMail, slotLostMail,
  type CancelInfo, type MailContext, type OutgoingMail,
} from "./mail-copy.ts";

/** The app address the emails link to (function setting APP_URL: the private preview until launch). */
export function appUrl(): string {
  const configured = (Deno.env.get("APP_URL") ?? "").trim().replace(/\/+$/, "");
  return configured || allowedOrigins()[0] || "https://parle.buzz";
}

export async function mailContext(db: SupabaseClient, row: BookingRow): Promise<MailContext | null> {
  const [learner, tutor] = await Promise.all([row.learner_id ? person(db, row.learner_id) : null, row.tutor_id ? tutorInfo(db, row.tutor_id) : null]);
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

async function send(mails: OutgoingMail[]) {
  for (const mail of mails) await sendMail({ ...mail, from: "automatic" });
}

async function withContext(db: SupabaseClient, bookingId: string, build: (c: MailContext) => OutgoingMail[]) {
  const row = await loadBooking(db, bookingId);
  const c = row ? await mailContext(db, row) : null;
  if (c) await send(build(c));
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
    if (c) await send(confirmationMails(c));
    return true;
  } catch (e) {
    await db.from("booking").update({ confirmation_sent_at: null }).eq("id", bookingId);
    throw e;
  }
}

export const sendCancellation = (db: SupabaseClient, bookingId: string, info: CancelInfo) => withContext(db, bookingId, (c) => cancellationMails(c, info));
export const sendReschedule = (db: SupabaseClient, bookingId: string, old: { startAt: string; endAt: string; rescheduleCount: number }) =>
  withContext(db, bookingId, (c) => rescheduleMails(c, old));
export const sendSlotLost = (db: SupabaseClient, bookingId: string, refundCents: number) => withContext(db, bookingId, (c) => [slotLostMail(c, refundCents)]);

export async function sendReminder(db: SupabaseClient, row: BookingRow, kind: "24h" | "1h") {
  const c = await mailContext(db, row);
  if (c) await send(reminderMails(c, kind));
}
export async function sendReviewRequest(db: SupabaseClient, row: BookingRow) {
  const c = await mailContext(db, row);
  if (c) await send([reviewRequestMail(c)]);
}
