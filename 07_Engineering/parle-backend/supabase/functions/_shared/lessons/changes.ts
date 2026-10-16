import type { LessonContext } from "./actions.ts";
import { LessonError } from "./errors.ts";
import { lessonSettings, type LessonSettings } from "./settings.ts";
import { canReschedule, cancelOutcome, type Viewer } from "./rules.ts";
import { blockedRanges, loadBooking, publishedListing, viewsFor, type BookingRow } from "./store.ts";
import { ownBooking, scheduleWith } from "./booking.ts";
import { refundLesson } from "./refunds.ts";
import { schedulePayout } from "../payouts/schedule.ts";
import { sendCancellation, sendReschedule } from "./notify.ts";
import { generateBookableSlots, validateBookableSlot } from "../../_app/functions/parle-booking-slots.helper.ts";

const warn = (what: string) => (e: unknown) => console.warn(what, (e as Error).message);
const TAKEN = () => new LessonError("SLOT_TAKEN", 409, "That time was just taken. Choose another.");
const NOT_MOVABLE = () => new LessonError("RESCHEDULE_NOT_ALLOWED", 409, "A lesson can be moved once, up to 24 hours before it starts.");

async function freshView(ctx: LessonContext, id: string, viewer: Viewer, settings: LessonSettings) {
  const row = await loadBooking(ctx.db, id);
  return (await viewsFor(ctx.db, [row!], viewer, ctx.now, settings))[0];
}

/** Spec section 5: the money outcome is decided here and must match what the cancel screen showed. */
export async function cancelLesson(ctx: LessonContext): Promise<Record<string, unknown>> {
  const row = await ownBooking(ctx, ctx.body.booking_id);
  const by: Viewer = row.learner_id === ctx.caller.id ? "learner" : "tutor";
  if (row.status !== "confirmed" || Date.parse(row.start_at) <= ctx.now.getTime()) throw new LessonError("CANNOT_CANCEL", 409, "This lesson can no longer be cancelled.");
  const settings = await lessonSettings(ctx.db);
  const outcome = cancelOutcome({ by, startAt: row.start_at, now: ctx.now, priceCents: row.price_cents, windowHours: settings.cancellation_window_hours });
  // The screen showed a refund; if the 24-hour line passed since, nothing changes (Review Focus 3).
  if (Number(ctx.body.expected_refund_cents) !== outcome.refundCents) {
    throw new LessonError("CANCEL_TERMS_CHANGED", 409, "The refund for this lesson has changed. Please look again before cancelling.");
  }
  let refund: { refundId: string; amountCents: number } | null = null;
  if (outcome.refundCents > 0) {
    try {
      refund = await refundLesson(ctx.db, ctx.payments, row, outcome.reason);
    } catch (e) {
      warn("lesson refund failed")(e);
      throw new LessonError("REFUND_UNAVAILABLE", 503, "We could not reach our payment provider. Your lesson is still booked. Please try again in a few minutes.");
    }
  }
  const { data: result, error } = await ctx.db.rpc("lesson_cancel", {
    p_booking: row.id, p_status: outcome.status, p_cancelled_by: by, p_late: outcome.late,
    p_refund_cents: refund?.amountCents ?? 0, p_refund_id: refund?.refundId ?? null, p_reason: outcome.reason, p_decided_by: by,
  });
  if (error) throw new Error(error.message);
  if (result === "cancelled") {
    await sendCancellation(ctx.db, row.id, { by, refundCents: refund?.amountCents ?? 0 }).catch(warn("cancellation email failed"));
    if (by === "tutor") await noteTutorCancellations(ctx, row, settings);
    // a learner's late cancellation pays the tutor 72 h after the scheduled end (spec section 5)
    if (outcome.late) await schedulePayout(ctx.db, row.id, settings).catch(warn("payout not scheduled; the jobs retry"));
  }
  return { lesson: await freshView(ctx, row.id, by, settings), refunded_cents: result === "cancelled" ? refund?.amountCents ?? 0 : 0 };
}

/** Tutors who cancel often are listed for an administrator (admin Bookings page); here only a log line. */
async function noteTutorCancellations(ctx: LessonContext, row: BookingRow, settings: LessonSettings) {
  const { count } = await ctx.db.from("booking").select("id", { count: "exact", head: true })
    .eq("tutor_id", row.tutor_id).eq("status", "cancelled_tutor").eq("cancelled_by", "tutor")
    .gte("status_changed_at", new Date(ctx.now.getTime() - 30 * 86_400_000).toISOString());
  if ((count ?? 0) >= settings.tutor_cancellation_flag_count) console.warn("tutor reached the cancellation flag", { cancellations: count });
}

function learnerOnly(ctx: LessonContext, row: BookingRow) {
  if (row.learner_id !== ctx.caller.id) throw new LessonError("LEARNER_ONLY", 403, "Only the learner can move a lesson. A tutor who cannot make it cancels it.");
}

async function moveRules(ctx: LessonContext, row: BookingRow, settings: LessonSettings) {
  const listing = await publishedListing(ctx.db, row.tutor_profile_id);
  if (!listing || !row.tutor_id) throw new LessonError("TUTOR_NOT_AVAILABLE", 404, "This tutor is not taking bookings right now, so the lesson cannot be moved. You can cancel it instead.");
  const busy = await blockedRanges(ctx.db, row.tutor_id, ctx.now, row.id);
  return {
    schedule: scheduleWith(listing, busy),
    options: { now: ctx.now, windowDays: settings.booking_horizon_days, minimumNoticeHours: settings.min_notice_hours, lengths: [row.minutes] },
  };
}

const movable = (row: BookingRow, ctx: LessonContext, settings: LessonSettings) =>
  canReschedule({ status: row.status, startAt: row.start_at, now: ctx.now, windowHours: settings.cancellation_window_hours, rescheduleCount: row.reschedule_count });

export async function rescheduleOptions(ctx: LessonContext): Promise<Record<string, unknown>> {
  const row = await ownBooking(ctx, ctx.body.booking_id);
  learnerOnly(ctx, row);
  const settings = await lessonSettings(ctx.db);
  if (!movable(row, ctx, settings)) return { slots: [] };
  const { schedule, options } = await moveRules(ctx, row, settings);
  const current = new Date(row.start_at).toISOString();
  return { slots: generateBookableSlots(schedule, options).filter((s) => s.startUtc !== current).slice(0, 2000).map((s) => s.startUtc) };
}

/** Once per lesson, by the learner, up to 24 h before: the new time is held and the old one freed in one statement. */
export async function rescheduleLesson(ctx: LessonContext): Promise<Record<string, unknown>> {
  const row = await ownBooking(ctx, ctx.body.booking_id);
  learnerOnly(ctx, row);
  const settings = await lessonSettings(ctx.db);
  if (!movable(row, ctx, settings)) throw NOT_MOVABLE();
  const start = typeof ctx.body.start_utc === "string" ? ctx.body.start_utc : "";
  const { schedule, options } = await moveRules(ctx, row, settings);
  const check = validateBookableSlot(schedule, start, row.minutes, options);
  if (check.status === "notice_too_short") throw new LessonError("NOTICE_TOO_SHORT", 409, "This time is too soon. Choose a later time.");
  if (check.status !== "offered") throw TAKEN();
  const { data: result, error } = await ctx.db.rpc("lesson_reschedule", { p_booking: row.id, p_learner: ctx.caller.id, p_start: check.slot.startUtc, p_window_hours: settings.cancellation_window_hours });
  if (error) throw new Error(error.message);
  if (result === "slot_taken") throw TAKEN();
  if (result !== "rescheduled") throw NOT_MOVABLE();
  await sendReschedule(ctx.db, row.id, { startAt: new Date(row.start_at).toISOString(), endAt: new Date(row.end_at).toISOString(), rescheduleCount: row.reschedule_count })
    .catch(warn("reschedule email failed"));
  return { lesson: await freshView(ctx, row.id, "learner", settings) };
}
