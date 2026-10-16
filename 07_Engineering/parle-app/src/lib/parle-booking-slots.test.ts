import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_BOOKING_SETTINGS,
  expandTutorLocalAvailability,
  generateBookableSlots,
  hasBufferedOverlap,
  lessonPriceCents,
  offeredLessonLengths,
  safeBookingSettings,
  validateBookableSlot,
  type BookingSchedule,
  type BookingSettings,
  type TutorLocalSchedule,
} from "../../functions/parle-booking-slots.helper.ts";
import { safePublicBookingProjection } from "../../functions/parle-marketplace.helper.ts";

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
    const rules = [{ day_of_week: 4, start_local: "10:00", end_local: "12:30", time_zone: "UTC" }];
    const makeSlots = (buffer: 0 | 10 | 15) => generateBookableSlots({
      rules,
      // a booked 11:00-11:30 lesson blocks until its end plus its frozen buffer (the database rule)
      busy_intervals: [{ start_utc: "2026-11-05T11:00:00.000Z", end_utc: new Date(Date.parse("2026-11-05T11:30:00.000Z") + buffer * 60_000).toISOString() }],
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

  it("keeps the published default settings when none are saved", () => {
    const publishedSchedule = safePublicBookingProjection(
      [{ day_of_week: 4, start_local: "18:00", end_local: "21:00", time_zone: "America/Toronto" }], [], null, [], Date.parse("2026-10-12T12:00:00.000Z"),
    ) as BookingSchedule;
    assert.deepEqual(safeBookingSettings(publishedSchedule.settings), DEFAULT_BOOKING_SETTINGS);
  });

  it("offers only lengths whose price reaches the $8 minimum (spec section 4)", () => {
    const all = { ...baseSettings, lesson_lengths_minutes: [30, 45, 60] as BookingSettings["lesson_lengths_minutes"] };
    assert.equal(lessonPriceCents(1000, 45), 750);
    assert.deepEqual(offeredLessonLengths(all, 1000, 800), [60]);
    assert.deepEqual(offeredLessonLengths(all, 1500, 800), [45, 60]);
    assert.deepEqual(offeredLessonLengths(all, 1600, 800), [30, 45, 60]);
    assert.deepEqual(offeredLessonLengths(all, 0, 800), []);
  });

  it("uses the larger of the platform and tutor notice, and the booking horizon", () => {
    const schedule: BookingSchedule = {
      rules: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day_of_week: day, start_local: "00:00", end_local: "23:45", time_zone: "UTC" })),
      settings: { ...baseSettings, minimum_notice_hours: 12 },
    };
    const now = "2026-11-04T00:00:00.000Z";
    const first = generateBookableSlots(schedule, { now, windowDays: 30, minimumNoticeHours: 24 })[0];
    assert.equal(first.startUtc, "2026-11-05T00:00:00.000Z");
    const week = generateBookableSlots(schedule, { now, windowDays: 7 });
    assert.ok(week.every((slot) => Date.parse(slot.endUtc) <= Date.parse("2026-11-11T00:00:00.000Z")));
  });

  it("lengths given by the server replace the tutor's lengths (a 45-minute lesson moved after 45 was turned off)", () => {
    const schedule: BookingSchedule = {
      rules: [{ day_of_week: 4, start_local: "10:00", end_local: "12:00", time_zone: "UTC" }],
      settings: { ...baseSettings, lesson_lengths_minutes: [60] },
    };
    const options = { now: "2026-11-04T00:00:00.000Z", windowDays: 2 };
    assert.equal(validateBookableSlot(schedule, "2026-11-05T10:00:00.000Z", 45, options).status, "not_offered");
    assert.equal(validateBookableSlot(schedule, "2026-11-05T10:00:00.000Z", 45, { ...options, lengths: [45] }).status, "offered");
    assert.equal(validateBookableSlot(schedule, "2026-11-05T10:00:00.000Z", 60, { ...options, lengths: [] }).status, "not_accepting");
  });

  it("a slot whose end plus the buffer reaches a booked range is not offered (mirrors the database rule)", () => {
    const schedule: BookingSchedule = {
      rules: [{ day_of_week: 4, start_local: "09:00", end_local: "12:00", time_zone: "UTC" }],
      settings: { ...baseSettings, buffer_minutes: 15 },
      busy_intervals: [{ start_utc: "2026-11-05T11:00:00.000Z", end_utc: "2026-11-05T11:30:00.000Z" }],
    };
    const starts = generateBookableSlots(schedule, { now: "2026-11-04T00:00:00.000Z", windowDays: 2 }).map((slot) => slot.startUtc);
    assert.equal(starts.includes("2026-11-05T10:30:00.000Z"), false);
    assert.equal(starts.includes("2026-11-05T10:15:00.000Z"), true);
    assert.equal(starts.includes("2026-11-05T11:30:00.000Z"), true);
  });
});
