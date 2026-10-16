import { describe, it, expect } from "bun:test";
import {
  autoCompleteDue, canMarkAttendance, canReport, canReschedule, cancelOutcome, commissionPctFor,
  reminderDue, strugglingSkills, validMeetingLink, validNoteSkills,
} from "../supabase/functions/_shared/lessons/rules";
import { LESSON_SETTING_DEFAULTS, parseLessonSettings } from "../supabase/functions/_shared/lessons/settings";

const now = new Date("2026-11-10T12:00:00.000Z");
const hours = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();

describe("lesson settings (spec section 3)", () => {
  it("defaults are the spec's values, and the payout-account switch is off", () => {
    expect(parseLessonSettings([])).toEqual(LESSON_SETTING_DEFAULTS);
    expect(LESSON_SETTING_DEFAULTS).toMatchObject({ commission_percent: 20, founding_commission_percent: 10, payout_delay_hours: 72, cancellation_window_hours: 24, min_notice_hours: 12, booking_horizon_days: 30, minimum_lesson_charge_usd: 8, slot_hold_minutes: 30, auto_complete_hours: 48, tutor_cancellation_flag_count: 3, require_payout_account: false });
  });
  it("reads JSON-encoded values and keeps the default for a missing, out-of-range or wrongly typed one", () => {
    const s = parseLessonSettings([
      { key: "commission_percent", value: "25" }, { key: "slot_hold_minutes", value: "10" },
      { key: "require_payout_account", value: "true" }, { key: "booking_horizon_days", value: "\"14\"" },
    ]);
    expect(s.commission_percent).toBe(25);
    expect(s.slot_hold_minutes).toBe(30);
    expect(s.require_payout_account).toBe(true);
    expect(s.booking_horizon_days).toBe(30);
  });
});

describe("money rules (spec sections 2 and 5)", () => {
  it("founding tutors pay 10 % on bookings made before their date, 20 % after", () => {
    const base = { commissionPercent: 20, foundingCommissionPercent: 10 };
    expect(commissionPctFor({ ...base, foundingUntil: "2026-11-11", bookedAt: now })).toBe(10);
    expect(commissionPctFor({ ...base, foundingUntil: "2026-11-10", bookedAt: now })).toBe(20);
    expect(commissionPctFor({ ...base, foundingUntil: null, bookedAt: now })).toBe(20);
  });
  it("a learner cancelling 24 h or more ahead gets a full refund; less than 24 h, none and a late cancel", () => {
    expect(cancelOutcome({ by: "learner", startAt: hours(24), now, priceCents: 4000, windowHours: 24 })).toEqual({ refundCents: 4000, late: false, status: "cancelled_learner", reason: "learner_cancelled" });
    expect(cancelOutcome({ by: "learner", startAt: hours(23.99), now, priceCents: 4000, windowHours: 24 })).toEqual({ refundCents: 0, late: true, status: "cancelled_learner", reason: "learner_cancelled" });
  });
  it("a tutor cancelling refunds in full at any time", () => {
    expect(cancelOutcome({ by: "tutor", startAt: hours(1), now, priceCents: 3000, windowHours: 24 })).toEqual({ refundCents: 3000, late: false, status: "cancelled_tutor", reason: "tutor_cancelled" });
  });
});

describe("timing rules (spec sections 5 and 6)", () => {
  it("reschedule: once, confirmed, 24 h or more ahead", () => {
    const base = { status: "confirmed", now, windowHours: 24, rescheduleCount: 0 };
    expect(canReschedule({ ...base, startAt: hours(25) })).toBe(true);
    expect(canReschedule({ ...base, startAt: hours(23) })).toBe(false);
    expect(canReschedule({ ...base, startAt: hours(25), rescheduleCount: 1 })).toBe(false);
  });
  it("attendance opens at the lesson's end; reports stay open until the payout would be sent", () => {
    expect(canMarkAttendance({ status: "confirmed", endAt: hours(0), now })).toBe(true);
    expect(canMarkAttendance({ status: "confirmed", endAt: hours(0.1), now })).toBe(false);
    expect(canReport({ status: "completed", endAt: hours(-71), now, payoutDelayHours: 72 })).toBe(true);
    expect(canReport({ status: "completed", endAt: hours(-72), now, payoutDelayHours: 72 })).toBe(false);
    expect(canReport({ status: "confirmed", endAt: hours(-1), now, payoutDelayHours: 72 })).toBe(false);
  });
  it("reminders: 24 h only for lessons booked 24 h or more ahead; 1 h for every lesson", () => {
    expect(reminderDue("24h", { startAt: hours(23), bookedAt: hours(-30), now })).toBe(true);
    expect(reminderDue("24h", { startAt: hours(23), bookedAt: hours(-0.5), now })).toBe(false);
    expect(reminderDue("24h", { startAt: hours(25), bookedAt: hours(-30), now })).toBe(false);
    expect(reminderDue("24h", { startAt: hours(0.9), bookedAt: hours(-30), now })).toBe(false);
    expect(reminderDue("1h", { startAt: hours(0.9), bookedAt: hours(-0.5), now })).toBe(true);
    expect(reminderDue("1h", { startAt: hours(-0.1), bookedAt: hours(-30), now })).toBe(false);
  });
  it("unmarked lessons complete automatically 48 h after their end", () => {
    expect(autoCompleteDue({ status: "confirmed", endAt: hours(-48), now, autoCompleteHours: 48 })).toBe(true);
    expect(autoCompleteDue({ status: "confirmed", endAt: hours(-47), now, autoCompleteHours: 48 })).toBe(false);
  });
});

describe("notes and links", () => {
  it("accepts struggling / ok / strong per known skill only", () => {
    expect(validNoteSkills({ writing: "struggling", speaking: "ok" })).toEqual({ writing: "struggling", speaking: "ok" });
    expect(validNoteSkills({ writing: "bad" })).toBeNull();
    expect(validNoteSkills({ cooking: "ok" })).toBeNull();
    expect(validNoteSkills({})).toBeNull();
  });
  it("struggling skills: most recent first, at most two", () => {
    expect(strugglingSkills([
      { skills: { reading: "struggling" }, at: "2026-11-01T10:00:00.000Z" },
      { skills: { writing: "struggling", speaking: "struggling" }, at: "2026-11-05T10:00:00.000Z" },
    ])).toEqual(["writing", "speaking"]);
  });
  it("meeting links: Zoom or Google Meet over https only", () => {
    expect(validMeetingLink("https://meet.google.com/abc-defg-hij")).toBe(true);
    expect(validMeetingLink("https://us02web.zoom.us/j/123")).toBe(true);
    expect(validMeetingLink("http://meet.google.com/abc")).toBe(false);
    expect(validMeetingLink("")).toBe(false);
  });
});
