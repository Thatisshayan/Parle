import type { LessonContext } from "./actions.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { LessonError } from "./errors.ts";
import { lessonSettings, type LessonSettings } from "./settings.ts";
import { commissionPctFor, isUuid, plainText, type Viewer } from "./rules.ts";
import { blockedRanges, loadBooking, person, publishedListing, tutorInfo, viewsFor, type BookingRow, type Listing } from "./store.ts";
import { allowedOrigins } from "../cors.ts";
import { takeRateLimit } from "../rate-limit.ts";
import { isPaused } from "../account-status.ts";
import {
  lessonPriceCents, offeredLessonLengths, safeBookingSettings, validateBookableSlot, type BookingSchedule,
} from "../../_app/functions/parle-booking-slots.helper.ts";

const MAX_OPEN_HOLDS = 3;
const NOT_AVAILABLE = () => new LessonError("TUTOR_NOT_AVAILABLE", 404, "This tutor is not taking bookings right now.");
const TAKEN = () => new LessonError("SLOT_TAKEN", 409, "That time was just taken. Choose another.");

// Plan 7B: the tutor's Stripe Connect state (tutor_payout_account.payouts_enabled, kept current by account.updated).
import { tutorCanReceivePayouts } from "../payouts/accounts.ts";
export { tutorCanReceivePayouts };

async function refusal(ctx: LessonContext, listing: Listing, settings: LessonSettings): Promise<string | null> {
  if (ctx.caller.role !== "learner") return "LEARNER_ONLY";
  if (ctx.caller.id === listing.tutorId) return "OWN_PROFILE";
  if (settings.require_payout_account && !(await tutorCanReceivePayouts(ctx.db, listing.tutorId))) return "BOOKING_NOT_OPEN";
  return null;
}

export const minimumChargeCents = (s: LessonSettings) => Math.round(s.minimum_lesson_charge_usd * 100);
export function offeredLengthsFor(listing: Listing, s: LessonSettings) {
  return offeredLessonLengths(safeBookingSettings(listing.schedule.settings), listing.hourlyRateCents, minimumChargeCents(s));
}
export function scheduleWith(listing: Listing, busy: Array<{ start_utc: string; end_utc: string }>): BookingSchedule {
  return { ...(listing.schedule as BookingSchedule), busy_intervals: busy };
}

/** The lesson, only for its learner or its tutor; anyone else gets "not found". */
export async function ownBooking(ctx: LessonContext, id: unknown): Promise<BookingRow> {
  const row = isUuid(id) ? await loadBooking(ctx.db, id) : null;
  if (!row || (row.learner_id !== ctx.caller.id && row.tutor_id !== ctx.caller.id)) throw new LessonError("NOT_FOUND", 404, "This lesson was not found.");
  return row;
}

export async function bookingOptions(ctx: LessonContext): Promise<Record<string, unknown>> {
  const listing = await publishedListing(ctx.db, String(ctx.body.tutor_profile_id ?? ""));
  if (!listing || (await isPaused(ctx.db, listing.tutorId))) throw NOT_AVAILABLE(); // a paused tutor (Plan 8 spec 3.2)
  const settings = await lessonSettings(ctx.db);
  const [reason, busy, me] = await Promise.all([
    refusal(ctx, listing, settings), blockedRanges(ctx.db, listing.tutorId, ctx.now, "", ctx.caller.id), person(ctx.db, ctx.caller.id),
  ]);
  const lengths = offeredLengthsFor(listing, settings);
  return {
    can_book: reason === null,
    reason,
    time_zone: me?.timeZone ?? "UTC",
    busy_intervals: busy,
    offered_lengths: lengths,
    prices: Object.fromEntries(lengths.map((m) => [String(m), lessonPriceCents(listing.hourlyRateCents, m)])),
    minimum_notice_hours: settings.min_notice_hours,
    horizon_days: settings.booking_horizon_days,
    hold_minutes: settings.slot_hold_minutes,
  };
}

/** Spec section 4, steps 3-5: re-check the slot, hold it, open Checkout for the frozen price. */
export async function bookLesson(ctx: LessonContext): Promise<Record<string, unknown>> {
  const { db, caller, body, now } = ctx;
  const listing = await publishedListing(db, String(body.tutor_profile_id ?? ""));
  if (!listing || (await isPaused(ctx.db, listing.tutorId))) throw NOT_AVAILABLE(); // a paused tutor (Plan 8 spec 3.2)
  const settings = await lessonSettings(db);
  const refused = await refusal(ctx, listing, settings);
  if (refused) throw new LessonError(refused, 403, "Booking is not open for this tutor yet.");
  if (!allowedOrigins().includes(ctx.origin)) throw new LessonError("ORIGIN_NOT_ALLOWED", 400, "Open Parle from its usual address and try again.");
  const start = typeof body.start_utc === "string" && Number.isFinite(Date.parse(body.start_utc)) ? body.start_utc : "";
  const minutes = Number(body.minutes);
  if (!start || ![30, 45, 60].includes(minutes)) throw TAKEN();

  // A second press, or a second tab, resumes the learner's own open hold (Review Focus 1). A press that lands while the
  // first is still opening Stripe waits for it, and a press that loses the race for the time to the learner's own other
  // press resumes that hold instead of answering "just taken" (A51).
  const resumeOwnHold = async (): Promise<Record<string, unknown> | null> => {
    for (let i = 0; i < 8; i++) {
      const { data: own } = await db.from("booking").select("id, stripe_checkout_session_id")
        .eq("learner_id", caller.id).eq("tutor_id", listing.tutorId).eq("status", "pending_payment")
        .eq("start_at", start).eq("minutes", minutes).gt("hold_expires_at", now.toISOString()).limit(1);
      const hold = own?.[0];
      if (!hold) return null; // none, or the first press failed and ended it
      if (hold.stripe_checkout_session_id) {
        const session = await ctx.payments.getCheckout(hold.stripe_checkout_session_id).catch(() => null);
        return session?.status === "open" ? { booking_id: hold.id, checkout_url: session.url } : null;
      }
      await new Promise((resolve) => setTimeout(resolve, 500)); // the first press is still opening Stripe
    }
    return null;
  };
  const resumed = await resumeOwnHold();
  if (resumed) return resumed;

  // R127: the learner chose a different time that overlaps their own unpaid hold with this tutor (the booking page
  // hides their own hold): they changed their mind, so that hold ends first. A late payment for it is refunded
  // (lesson_confirm_payment refunds an expired hold with cancelled_by set).
  const wantedEnd = new Date(Date.parse(start) + minutes * 60_000).toISOString();
  const { data: overlapping, error: overlapError } = await db.from("booking").select("id, stripe_checkout_session_id")
    .eq("learner_id", caller.id).eq("tutor_id", listing.tutorId).eq("status", "pending_payment")
    .lt("start_at", wantedEnd).gt("blocked_until", start);
  if (overlapError) throw new Error(overlapError.message);
  for (const old of overlapping ?? []) {
    if (old.stripe_checkout_session_id) await ctx.payments.expireCheckout(old.stripe_checkout_session_id).catch(() => undefined);
    const { error: endError } = await db.from("booking").update({ status: "expired", cancelled_by: "learner", status_changed_at: now.toISOString() })
      .eq("id", old.id).eq("status", "pending_payment");
    if (endError) throw new Error(endError.message);
  }

  const { count } = await db.from("booking").select("id", { count: "exact", head: true })
    .eq("learner_id", caller.id).eq("status", "pending_payment").gt("hold_expires_at", now.toISOString());
  if ((count ?? 0) >= MAX_OPEN_HOLDS) throw new LessonError("HOLD_LIMIT", 429, "You already have 3 lessons waiting for payment. Finish paying or let one lapse first.");
  if (!(await takeRateLimit(db, `book:${caller.id}`, 3600, 20))) throw new LessonError("RATE_LIMITED", 429, "Too many booking attempts. Please try again in an hour.");

  const check = validateBookableSlot(scheduleWith(listing, await blockedRanges(db, listing.tutorId, now)), start, minutes, {
    now, windowDays: settings.booking_horizon_days, minimumNoticeHours: settings.min_notice_hours, lengths: offeredLengthsFor(listing, settings),
  });
  if (check.status === "notice_too_short") throw new LessonError("NOTICE_TOO_SHORT", 409, "This time is too soon to book. Choose a later time.");
  if (check.status !== "offered") {
    const mine = await resumeOwnHold(); // A51: perhaps the learner's own other press took it a moment ago
    if (mine) return mine;
    throw TAKEN();
  }

  const tutor = await tutorInfo(db, listing.tutorId);
  if (!tutor) throw NOT_AVAILABLE();
  const price = lessonPriceCents(listing.hourlyRateCents, minutes);
  const commission = commissionPctFor({ foundingUntil: tutor.foundingUntil, bookedAt: now, commissionPercent: settings.commission_percent, foundingCommissionPercent: settings.founding_commission_percent });
  const { data: bookingId, error } = await db.rpc("lesson_hold", {
    p_learner: caller.id, p_tutor: listing.tutorId, p_profile: listing.profileId, p_start: check.slot.startUtc, p_minutes: minutes,
    p_buffer: safeBookingSettings(listing.schedule.settings).buffer_minutes, p_price: price, p_commission: commission,
    p_message: plainText(body.message, 1000), p_hold_minutes: settings.slot_hold_minutes,
  });
  if (error) throw new Error(error.message);
  if (!bookingId) {
    const mine = await resumeOwnHold(); // the time went to this learner's own other press
    if (mine) return mine;
    throw TAKEN();
  }
  const hold = await loadBooking(db, String(bookingId));
  try {
    const session = await ctx.payments.createCheckout({
      bookingId: String(bookingId), amountCents: price, customerEmail: caller.email,
      description: `French lesson with ${tutor.displayName} (${minutes} minutes)`,
      // Stripe needs at least 30 minutes from its own clock: 3 minutes past the hold, never under 33 minutes from now
      // (A58; a late payment is handled by lesson_confirm_payment)
      expiresAt: Math.floor(Math.max(Date.parse(hold!.hold_expires_at!), Date.now() + 30 * 60_000) / 1000) + 180,
      successUrl: `${ctx.origin}/learner/lessons?booking=${bookingId}&checkout=done`,
      cancelUrl: `${ctx.origin}/learner/lessons?booking=${bookingId}&checkout=cancelled`,
    });
    const { error: saveError } = await db.from("booking").update({ stripe_checkout_session_id: session.id }).eq("id", bookingId);
    if (saveError) {
      // never hand out a payment page the booking cannot be matched to: close it and let the learner try again
      await ctx.payments.expireCheckout(session.id).catch(() => undefined);
      throw new Error(`checkout id not saved: ${saveError.message}`);
    }
    return { booking_id: bookingId, checkout_url: session.url };
  } catch (e) {
    console.error("lesson checkout could not start", (e as Error).message);
    await db.from("booking").update({ status: "expired", status_changed_at: new Date().toISOString() }).eq("id", bookingId).eq("status", "pending_payment");
    throw new LessonError("PAYMENT_UNAVAILABLE", 503, "Payment could not start. Please try again in a few minutes.");
  }
}

export async function lessonStatus(ctx: LessonContext): Promise<Record<string, unknown>> {
  const row = await ownBooking(ctx, ctx.body.booking_id);
  const viewer: Viewer = row.learner_id === ctx.caller.id ? "learner" : "tutor";
  const [view] = await viewsFor(ctx.db, [row], viewer, ctx.now, await lessonSettings(ctx.db));
  return { lesson: view };
}

/** "Return to payment" after leaving Stripe's page: the same page while the hold lasts. */
export async function resumeCheckout(ctx: LessonContext): Promise<Record<string, unknown>> {
  const row = await ownBooking(ctx, ctx.body.booking_id);
  const open = row.learner_id === ctx.caller.id && row.status === "pending_payment" && row.hold_expires_at && Date.parse(row.hold_expires_at) > ctx.now.getTime();
  const session = open && row.stripe_checkout_session_id ? await ctx.payments.getCheckout(row.stripe_checkout_session_id).catch(() => null) : null;
  if (!session || session.status !== "open") throw new LessonError("HOLD_EXPIRED", 409, "This time is no longer held. Choose a time again on the tutor's page.");
  return { checkout_url: session.url };
}

const LEARNER_STATUSES = ["pending_payment", "confirmed", "expired", "cancelled_learner", "cancelled_tutor", "completed", "learner_no_show", "disputed"];
const TUTOR_STATUSES = ["confirmed", "cancelled_learner", "cancelled_tutor", "completed", "learner_no_show", "disputed"];

export async function listLessons(ctx: LessonContext, viewer: Viewer): Promise<Record<string, unknown>> {
  if (ctx.caller.role !== viewer) throw new LessonError(viewer === "learner" ? "LEARNER_ONLY" : "TUTOR_ONLY", 403);
  const col = viewer === "learner" ? "learner_id" : "tutor_id";
  const statuses = (viewer === "learner" ? LEARNER_STATUSES : TUTOR_STATUSES).filter((s) => s !== "expired");
  const { data, error } = await ctx.db.from("booking").select("*").eq(col, ctx.caller.id).in("status", statuses)
    .order("start_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  let lost: BookingRow[] = [];
  if (viewer === "learner") {
    // A55, R125: an expired lesson is listed only when it was refunded as slot_lost, so abandoned holds never fill the list
    const { data: refunds, error: refundError } = await ctx.db.from("refund").select("booking_id, booking!inner(learner_id)")
      .eq("reason", "slot_lost").eq("booking.learner_id", ctx.caller.id).limit(100);
    if (refundError) throw new Error(refundError.message);
    const ids = [...new Set((refunds ?? []).map((r: any) => String(r.booking_id)))];
    if (ids.length) {
      const { data: rows, error: lostError } = await ctx.db.from("booking").select("*").in("id", ids).eq("status", "expired");
      if (lostError) throw new Error(lostError.message);
      lost = (rows ?? []) as BookingRow[];
    }
  }
  const merged = [...((data ?? []) as BookingRow[]), ...lost].sort((a, b) => Date.parse(b.start_at) - Date.parse(a.start_at)).slice(0, 100);
  const rows = merged.filter((r) => r.status !== "pending_payment" || (r.hold_expires_at && Date.parse(r.hold_expires_at) > ctx.now.getTime()));
  const settings = await lessonSettings(ctx.db);
  const me = viewer === "learner" ? await person(ctx.db, ctx.caller.id) : await tutorInfo(ctx.db, ctx.caller.id);
  // an expired lesson is listed only when it was refunded because the time could not be booked (A55)
  const views = (await viewsFor(ctx.db, rows, viewer, ctx.now, settings)).filter((v) => v.status !== "expired" || v.refund_reason === "slot_lost");
  return { time_zone: me?.timeZone ?? "UTC", lessons: views };
}
