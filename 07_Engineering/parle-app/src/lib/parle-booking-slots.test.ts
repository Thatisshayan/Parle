import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_BOOKING_SETTINGS,
  expandTutorLocalAvailability,
  generateBookableSlots,
  hasBufferedOverlap,
  safeBookingSettings,
  type BookingSchedule,
  type BookingSettings,
  type TutorLocalSchedule,
} from "../../functions/parle-booking-slots.helper.ts";
import {
  safePublicBookingProjection,
  validateAndPersistLearnerBookingRequest,
} from "../../functions/parle-marketplace.helper.ts";

const baseSettings: BookingSettings = {
  lesson_lengths_minutes: [30],
  buffer_minutes: 0,
  minimum_notice_hours: 12,
  booking_window_days: 30,
};

function formatLocal(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const read = (key: string) => parts.find((part) => part.type === key)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")} ${read("hour")}:${read("minute")}`;
}

function singleTuesday(date: string, now: string) {
  const schedule: TutorLocalSchedule = {
    rules: [{ day_of_week: 2, start_local: "18:00", end_local: "21:00", time_zone: "America/Toronto" }],
  };
  const window = expandTutorLocalAvailability(schedule, { now, windowDays: 30 }).find((item) => item.startUtc.slice(0, 10) === date);
  assert.ok(window, `Expected a Toronto Tuesday window on ${date}`);
  return window;
}

describe("Parle booking slot rules", () => {
  it("shows the October 27 Toronto window correctly across the learner time zones", () => {
    const window = singleTuesday("2026-10-27", "2026-10-20T00:00:00.000Z");
    assert.deepEqual(window, { startUtc: "2026-10-27T22:00:00.000Z", endUtc: "2026-10-28T01:00:00.000Z" });
    assert.equal(formatLocal(window.startUtc, "Asia/Tehran"), "2026-10-28 01:30");
    assert.equal(formatLocal(window.endUtc, "Asia/Tehran"), "2026-10-28 04:30");
    assert.equal(formatLocal(window.startUtc, "Europe/Paris"), "2026-10-27 23:00");
    assert.equal(formatLocal(window.endUtc, "Europe/Paris"), "2026-10-28 02:00");
    assert.equal(formatLocal(window.startUtc, "Asia/Kolkata"), "2026-10-28 03:30");
    assert.equal(formatLocal(window.endUtc, "Asia/Kolkata"), "2026-10-28 06:30");
  });

  it("shows the November 3 Toronto window correctly after the North American clock change", () => {
    const window = singleTuesday("2026-11-03", "2026-10-20T00:00:00.000Z");
    assert.deepEqual(window, { startUtc: "2026-11-03T23:00:00.000Z", endUtc: "2026-11-04T02:00:00.000Z" });
    assert.equal(formatLocal(window.startUtc, "Asia/Tehran"), "2026-11-04 02:30");
    assert.equal(formatLocal(window.endUtc, "Asia/Tehran"), "2026-11-04 05:30");
    assert.equal(formatLocal(window.startUtc, "Europe/Paris"), "2026-11-04 00:00");
    assert.equal(formatLocal(window.endUtc, "Europe/Paris"), "2026-11-04 03:00");
    assert.equal(formatLocal(window.startUtc, "Asia/Kolkata"), "2026-11-04 04:30");
    assert.equal(formatLocal(window.endUtc, "Asia/Kolkata"), "2026-11-04 07:30");
  });

  it("keeps the exact buffer before and after an accepted lesson for each setting", () => {
    const schedule = {
      rules: [{ day_of_week: 4, start_local: "10:00", end_local: "12:30", time_zone: "UTC" }],
      busy_intervals: [{ start_utc: "2026-11-05T11:00:00.000Z", end_utc: "2026-11-05T11:30:00.000Z" }],
    };
    const makeSlots = (buffer: 0 | 10 | 15) => generateBookableSlots({
      ...schedule,
      settings: { ...baseSettings, buffer_minutes: buffer },
    }, { now: "2026-11-04T00:00:00.000Z", windowDays: 2 });

    const noBuffer = makeSlots(0).map((slot) => slot.startUtc);
    const tenMinuteBuffer = makeSlots(10).map((slot) => slot.startUtc);
    const fifteenMinuteBuffer = makeSlots(15).map((slot) => slot.startUtc);
    assert.ok(noBuffer.includes("2026-11-05T10:30:00.000Z"));
    assert.ok(noBuffer.includes("2026-11-05T11:30:00.000Z"));
    assert.equal(tenMinuteBuffer.includes("2026-11-05T10:30:00.000Z"), false);
    assert.equal(tenMinuteBuffer.includes("2026-11-05T11:30:00.000Z"), false);
    assert.ok(tenMinuteBuffer.includes("2026-11-05T10:15:00.000Z"));
    assert.ok(tenMinuteBuffer.includes("2026-11-05T11:45:00.000Z"));
    assert.equal(fifteenMinuteBuffer.includes("2026-11-05T10:30:00.000Z"), false);
    assert.ok(fifteenMinuteBuffer.includes("2026-11-05T10:15:00.000Z"));
    assert.ok(fifteenMinuteBuffer.includes("2026-11-05T11:45:00.000Z"));
  });

  it("does not publish a previously accepted slot", () => {
    const slots = generateBookableSlots({
      rules: [{ day_of_week: 4, start_local: "10:00", end_local: "11:00", time_zone: "UTC" }],
      settings: baseSettings,
      busy_intervals: [{ start_utc: "2026-11-05T10:00:00.000Z", end_utc: "2026-11-05T10:30:00.000Z" }],
    }, { now: "2026-11-04T00:00:00.000Z", windowDays: 2 });
    assert.equal(slots.some((slot) => slot.startUtc === "2026-11-05T10:00:00.000Z"), false);
    assert.ok(slots.some((slot) => slot.startUtc === "2026-11-05T10:30:00.000Z"));
  });

  it("honors 12, 24 and 48-hour notice thresholds at their exact UTC boundary", () => {
    const schedule = {
      rules: Array.from({ length: 7 }, (_, index) => ({ day_of_week: index + 1, start_local: "00:00", end_local: "23:59", time_zone: "UTC" })),
    };
    for (const [hours, expectedStart] of [
      [12, "2026-11-01T12:00:00.000Z"],
      [24, "2026-11-02T00:00:00.000Z"],
      [48, "2026-11-03T00:00:00.000Z"],
    ] as const) {
      const slots = generateBookableSlots({ ...schedule, settings: { ...baseSettings, minimum_notice_hours: hours } }, {
        now: "2026-11-01T00:00:00.000Z",
        windowDays: 4,
      });
      assert.ok(slots.some((slot) => slot.startUtc === expectedStart), `${hours}-hour notice should include the boundary slot`);
      const oneMillisecondLater = generateBookableSlots({ ...schedule, settings: { ...baseSettings, minimum_notice_hours: hours } }, {
        now: "2026-11-01T00:00:00.001Z",
        windowDays: 4,
      });
      assert.equal(oneMillisecondLater.some((slot) => slot.startUtc === expectedStart), false, `${hours}-hour notice should exclude a slot before its boundary`);
    }
  });

  it("keeps lesson starts and ends inside the fixed 30-day booking window", () => {
    const schedule = {
      rules: Array.from({ length: 7 }, (_, index) => ({ day_of_week: index + 1, start_local: "00:00", end_local: "23:59", time_zone: "UTC" })),
      settings: { ...baseSettings, minimum_notice_hours: 12 },
    };
    const slots = generateBookableSlots(schedule, { now: "2026-10-01T00:00:00.000Z" });
    const boundary = Date.parse("2026-10-31T00:00:00.000Z");
    assert.ok(slots.length > 0);
    assert.ok(slots.every((slot) => Date.parse(slot.startUtc) < boundary && Date.parse(slot.endUtc) <= boundary));
  });

  it("applies one-date days off and extra-hours exceptions", () => {
    const slots = generateBookableSlots({
      rules: [
        { day_of_week: 1, start_local: "09:00", end_local: "10:00", time_zone: "UTC" },
        { day_of_week: 2, start_local: "09:00", end_local: "10:00", time_zone: "UTC" },
      ],
      exceptions: [
        { date_local: "2026-11-02", kind: "off", time_zone: "UTC" },
        { date_local: "2026-11-03", kind: "extra", start_local: "13:00", end_local: "14:00", time_zone: "UTC" },
      ],
      settings: baseSettings,
    }, { now: "2026-11-01T00:00:00.000Z", windowDays: 4 });
    assert.equal(slots.some((slot) => slot.startUtc.startsWith("2026-11-02T")), false);
    assert.ok(slots.some((slot) => slot.startUtc === "2026-11-03T13:00:00.000Z"));
    assert.ok(slots.some((slot) => slot.startUtc === "2026-11-03T09:00:00.000Z"));
  });

  it("offers only enabled lesson lengths and omits durations that do not fit", () => {
    const slots = generateBookableSlots({
      rules: [{ day_of_week: 4, start_local: "10:00", end_local: "10:45", time_zone: "UTC" }],
      settings: { ...baseSettings, lesson_lengths_minutes: [30, 45] },
    }, { now: "2026-11-04T00:00:00.000Z", windowDays: 2 });
    assert.ok(slots.some((slot) => slot.startUtc === "2026-11-05T10:00:00.000Z" && slot.durationMinutes === 30));
    assert.ok(slots.some((slot) => slot.startUtc === "2026-11-05T10:00:00.000Z" && slot.durationMinutes === 45));
    assert.equal(slots.some((slot) => slot.durationMinutes === 60), false);
    assert.equal(slots.some((slot) => slot.durationMinutes === 15), false);
    const paused = generateBookableSlots({
      rules: [{ day_of_week: 4, start_local: "10:00", end_local: "11:00", time_zone: "UTC" }],
      settings: { ...baseSettings, lesson_lengths_minutes: [] },
    }, { now: "2026-11-04T00:00:00.000Z", windowDays: 2 });
    assert.deepEqual(paused, []);
  });

  it("checks buffer overlap symmetrically while allowing the exact buffer gap", () => {
    const proposal = { startUtc: "2026-11-05T11:40:00.000Z", endUtc: "2026-11-05T12:10:00.000Z" };
    const previous = { startUtc: "2026-11-05T11:00:00.000Z", endUtc: "2026-11-05T11:30:00.000Z" };
    const later = { startUtc: "2026-11-05T12:20:00.000Z", endUtc: "2026-11-05T12:50:00.000Z" };
    assert.equal(hasBufferedOverlap(proposal, previous, 10), false);
    assert.equal(hasBufferedOverlap(proposal, later, 10), false);
    assert.equal(hasBufferedOverlap(proposal, previous, 11), true);
    assert.equal(hasBufferedOverlap({ startUtc: "2026-11-05T11:29:00.000Z", endUtc: "2026-11-05T11:59:00.000Z" }, previous, 0), true);
  });

  it("offers and saves a Thursday Toronto lesson with no saved booking settings", async () => {
    const now = "2026-10-12T12:00:00.000Z";
    const publishedSchedule = safePublicBookingProjection(
      [{ day_of_week: 4, start_local: "18:00", end_local: "21:00", time_zone: "America/Toronto" }],
      [],
      null,
      [],
      Date.parse(now),
    ) as BookingSchedule;

    assert.deepEqual(safeBookingSettings(publishedSchedule.settings), DEFAULT_BOOKING_SETTINGS);
    assert.deepEqual(publishedSchedule.settings, {
      lesson_lengths_minutes: [30, 45, 60],
      buffer_minutes: 0,
      minimum_notice_hours: 12,
      booking_window_days: 30,
    });

    const slots = generateBookableSlots(publishedSchedule, { now, windowDays: 30 });
    const offeredSlot = slots.find((slot) => slot.startUtc === "2026-10-15T23:00:00.000Z" && slot.durationMinutes === 45);
    assert.deepEqual(offeredSlot, {
      startUtc: "2026-10-15T23:00:00.000Z",
      endUtc: "2026-10-15T23:45:00.000Z",
      durationMinutes: 45,
    });

    let persisted: Record<string, unknown> | null = null;
    const result = await validateAndPersistLearnerBookingRequest({
      isPublished: true,
      tutorProfileId: "camille-profile",
      tutorUserId: "camille-user",
      tutorDisplayName: "Camille T.",
      learnerUserId: "learner-user",
      learnerFirstName: "Immigration",
      startTimeUtc: offeredSlot.startUtc,
      durationMinutes: offeredSlot.durationMinutes,
      learnerMessage: "I’m preparing for my immigration exam.",
      schedule: publishedSchedule,
      now,
    }, async (record) => {
      persisted = record;
      return { id: "booking-request-1", ...record };
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.slot, offeredSlot);
    assert.equal(result.booking.status, "requested");
    assert.ok(persisted);
    assert.equal(persisted.status, "requested");
    assert.equal(persisted.start_time_utc, "2026-10-15T23:00:00.000Z");
    assert.equal(persisted.end_time_utc, "2026-10-15T23:45:00.000Z");
  });

  it("returns specific codes for a changed slot, short notice, and paused tutor", async () => {
    const startTimeUtc = "2026-10-15T23:00:00.000Z";
    const schedule = safePublicBookingProjection(
      [{ day_of_week: 4, start_local: "18:00", end_local: "21:00", time_zone: "America/Toronto" }],
      [],
      null,
      [],
      Date.parse("2026-10-12T12:00:00.000Z"),
    ) as BookingSchedule;
    let persistCalls = 0;
    const persist = async (record: Record<string, unknown>) => {
      persistCalls += 1;
      return { id: "unexpected-booking", ...record };
    };
    const baseInput = {
      isPublished: true,
      tutorProfileId: "camille-profile",
      tutorUserId: "camille-user",
      tutorDisplayName: "Camille T.",
      learnerUserId: "learner-user",
      learnerFirstName: "Immigration",
      durationMinutes: 45,
      learnerMessage: "",
      schedule,
      now: "2026-10-12T12:00:00.000Z",
    };

    const changedSlot = await validateAndPersistLearnerBookingRequest({ ...baseInput, startTimeUtc: "2026-10-15T23:05:00.000Z" }, persist);
    assert.deepEqual(changedSlot, { ok: false, code: "BOOKING_SLOT_INVALID" });

    const tooLittleNotice = await validateAndPersistLearnerBookingRequest({
      ...baseInput,
      startTimeUtc,
      now: "2026-10-15T12:00:00.000Z",
    }, persist);
    assert.deepEqual(tooLittleNotice, { ok: false, code: "BOOKING_NOTICE_TOO_SHORT" });

    const pausedTutor = await validateAndPersistLearnerBookingRequest({ ...baseInput, startTimeUtc, acceptingRequests: false }, persist);
    assert.deepEqual(pausedTutor, { ok: false, code: "TUTOR_NOT_ACCEPTING" });
    assert.equal(persistCalls, 0);
  });
});
