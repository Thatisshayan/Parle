import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateAvailabilityOverlap,
  expandTutorAvailability,
  findEarliestLearnerOverlap,
  parseTutorAvailability,
  resolveLocalDateTime,
  summarizeTutorAvailabilityWeek,
  type AvailabilityWindow,
} from "./tutor-availability";

const instant = (value: string) => Date.parse(value);
const local = (value: string) => resolveLocalDateTime(value.slice(0, 10), value.slice(11), "America/Toronto")!;

function weekdayRule(day: number, start: string, end: string, zone = "America/Toronto") {
  return { day_of_week: day, start_local: start, end_local: end, time_zone: zone };
}

describe("tutor availability expansion", () => {
  it("converts weekly tutor-local times to UTC and excludes the 14-day end boundary", () => {
    const windows = expandTutorAvailability({ rules: [weekdayRule(1, "09:00", "10:00")] }, { now: "2026-11-01T16:00:00.000Z" });
    const starts = windows.map((item) => item.startUtc);
    assert.ok(starts.includes("2026-11-02T14:00:00.000Z"));
    assert.ok(starts.includes("2026-11-09T14:00:00.000Z"));
    assert.equal(starts.includes("2026-11-16T14:00:00.000Z"), false);
  });

  it("removes regular hours on off dates and unions an extra-hours exception", () => {
    const windows = expandTutorAvailability({
      rules: [weekdayRule(1, "09:00", "10:00"), weekdayRule(2, "09:00", "10:00")],
      exceptions: [
        { date_local: "2026-10-12", kind: "off", time_zone: "America/Toronto" },
        { date_local: "2026-10-13", kind: "extra", start_local: "13:00", end_local: "15:00", time_zone: "America/Toronto" },
      ],
    }, { now: "2026-10-12T10:00:00.000Z", days: 3 });
    assert.equal(windows.some((item) => item.startUtc === "2026-10-12T13:00:00.000Z"), false);
    assert.ok(windows.some((item) => item.startUtc === "2026-10-13T13:00:00.000Z" && item.endUtc === "2026-10-13T14:00:00.000Z"));
    assert.ok(windows.some((item) => item.startUtc === "2026-10-13T17:00:00.000Z" && item.endUtc === "2026-10-13T19:00:00.000Z"));
  });

  it("summarizes the Monday to Sunday tutor-local week across a UTC date boundary", () => {
    const summary = summarizeTutorAvailabilityWeek({
      rules: [weekdayRule(1, "09:00", "10:00"), weekdayRule(7, "11:00", "12:00")],
    }, "America/Toronto", "2026-10-12T02:30:00.000Z");
    assert.ok(summary);
    assert.equal(summary.time_zone, "America/Toronto");
    assert.equal(summary.week_start, "2026-10-05");
    assert.equal(summary.week_end, "2026-10-11");
    assert.deepEqual(summary.days[0].intervals, [{ start_local: "09:00", end_local: "10:00" }]);
    assert.deepEqual(summary.days[6].intervals, [{ start_local: "11:00", end_local: "12:00" }]);
  });

  it("lets date-off exceptions override weekly hours and merges extra hours", () => {
    const summary = summarizeTutorAvailabilityWeek({
      rules: [weekdayRule(1, "09:00", "10:00"), weekdayRule(2, "09:00", "10:00")],
      exceptions: [
        { date_local: "2026-10-05", kind: "off", time_zone: "America/Toronto" },
        { date_local: "2026-10-06", kind: "extra", start_local: "09:30", end_local: "11:00", time_zone: "America/Toronto" },
        { date_local: "2026-10-07", kind: "extra", start_local: "14:00", end_local: "15:00", time_zone: "America/Toronto" },
      ],
    }, "America/Toronto", "2026-10-12T02:30:00.000Z");
    assert.ok(summary);
    assert.deepEqual(summary.days[0], {
      date: "2026-10-05", day_of_week: 1, kind: "off", has_extra_hours: false, intervals: [],
    });
    assert.deepEqual(summary.days[1].intervals, [{ start_local: "09:00", end_local: "11:00" }]);
    assert.equal(summary.days[1].has_extra_hours, true);
    assert.deepEqual(summary.days[2].intervals, [{ start_local: "14:00", end_local: "15:00" }]);
    assert.equal(summary.days[2].kind, "available");
    assert.equal(summary.days[2].has_extra_hours, true);
  });

  it("resolves a learner-facing weekday into the learner's next local calendar date", () => {
    const windows = expandTutorAvailability({ rules: [{ day_of_week: 1, start_local: "23:30", end_local: "23:59", time_zone: "America/Los_Angeles" }] }, { now: "2026-01-05T00:00:00.000Z" });
    const start = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Kiritimati", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(windows[0].startUtc));
    assert.match(start, /2026/);
    assert.equal(windows[0].startUtc, "2026-01-06T07:30:00.000Z");
  });

  it("uses compatible spring-gap handling and both fall-fold occurrences in Toronto", () => {
    assert.equal(new Date(resolveLocalDateTime("2026-03-08", "02:30", "America/Toronto", "start")!).toISOString(), "2026-03-08T07:30:00.000Z");
    assert.equal(new Date(resolveLocalDateTime("2026-11-01", "01:30", "America/Toronto", "start")!).toISOString(), "2026-11-01T05:30:00.000Z");
    assert.equal(new Date(resolveLocalDateTime("2026-11-01", "01:30", "America/Toronto", "end")!).toISOString(), "2026-11-01T06:30:00.000Z");
  });

  it("handles the historical Tehran spring gap and autumn fold", () => {
    assert.equal(new Date(resolveLocalDateTime("2022-03-22", "00:30", "Asia/Tehran", "start")!).toISOString(), "2022-03-21T21:00:00.000Z");
    assert.equal(new Date(resolveLocalDateTime("2022-09-21", "23:30", "Asia/Tehran", "start")!).toISOString(), "2022-09-21T19:00:00.000Z");
    assert.equal(new Date(resolveLocalDateTime("2022-09-21", "23:30", "Asia/Tehran", "end")!).toISOString(), "2022-09-21T20:00:00.000Z");
  });

  it("counts only overlap with the learner's selected local windows and finds the first overlap", () => {
    const tutorWindows: AvailabilityWindow[] = [
      { startUtc: "2026-10-13T23:00:00.000Z", endUtc: "2026-10-14T01:00:00.000Z" },
      { startUtc: "2026-10-15T16:00:00.000Z", endUtc: "2026-10-15T17:00:00.000Z" },
    ];
    const overlap = calculateAvailabilityOverlap(tutorWindows, ["weekday_evening"], "America/Toronto", { now: "2026-10-12T12:00:00.000Z", days: 5 });
    assert.equal(overlap.hasOverlap, true);
    assert.ok(overlap.ratio > 0 && overlap.ratio < 1);
    const earliest = findEarliestLearnerOverlap(tutorWindows, ["weekday_evening"], "America/Toronto", { now: "2026-10-12T12:00:00.000Z", days: 5 });
    assert.ok(earliest);
    assert.equal(earliest.startUtc, "2026-10-13T23:00:00.000Z");
    const none = calculateAvailabilityOverlap(tutorWindows, [], "America/Toronto", { now: "2026-10-12T12:00:00.000Z", days: 5 });
    assert.deepEqual(none, { ratio: 0, overlappedMinutes: 0, learnerWindowMinutes: 0, hasOverlap: false });
  });

  it("clips past listed time and safely ignores malformed snapshot inputs", () => {
    const windows = expandTutorAvailability({ rules: [weekdayRule(1, "09:00", "10:00")] }, { now: "2026-10-12T13:30:00.000Z", days: 1 });
    assert.deepEqual(windows, [{ startUtc: "2026-10-12T13:30:00.000Z", endUtc: "2026-10-12T14:00:00.000Z" }]);
    assert.deepEqual(parseTutorAvailability("not-json"), { rules: [], exceptions: [] });
    assert.deepEqual(expandTutorAvailability(null, { now: "2026-10-12T00:00:00.000Z" }), []);
  });

  it("merges overlapping tutor rules before calculating the learner overlap", () => {
    const windows = expandTutorAvailability({ rules: [weekdayRule(1, "09:00", "11:00"), { ...weekdayRule(1, "10:00", "12:00") }] }, { now: "2026-10-12T12:00:00.000Z", days: 1 });
    assert.equal(windows.length, 1);
    assert.equal(windows[0].startUtc, "2026-10-12T13:00:00.000Z");
    assert.equal(windows[0].endUtc, "2026-10-12T16:00:00.000Z");
  });
});
