import { describe, it, expect } from "bun:test";
import { demandByBand, offeredHours, supplyByBand, trackComparison, weeklyHours, weeklyStudyMinutes } from "../supabase/functions/_shared/admin/metrics-rules";

const rule = (day: number, start: string, end: string) => ({ day_of_week: day, start_local: start, end_local: end });

describe("metrics rules (D24)", () => {
  it("tutor supply per weekday or weekend and time band, in the tutor's own clock (bands as onboarding: 06-12, 12-17, 17-22)", () => {
    const s = supplyByBand([rule(1, "10:00", "14:00"), rule(6, "16:00", "23:00"), rule(3, "25:00", "26:00"), rule(8, "09:00", "10:00")]);
    expect(s).toEqual({ weekday_morning: 2, weekday_afternoon: 2, weekday_evening: 0, weekend_morning: 0, weekend_afternoon: 1, weekend_evening: 5 });
    expect(weeklyHours([rule(1, "10:00", "14:00"), rule(2, "18:30", "19:00")])).toBe(4.5);
    expect(offeredHours([rule(1, "09:00", "16:00")], 30)).toBe(30);
  });
  it("learner demand counts each learner once per chosen window; unreadable values are skipped", () => {
    expect(demandByBand([["weekday_evening", "weekend_morning"], '["weekday_evening"]', null, ["bogus"], "not json"])).toEqual({
      weekday_morning: 0, weekday_afternoon: 0, weekday_evening: 2, weekend_morning: 1, weekend_afternoon: 0, weekend_evening: 0,
    });
  });
  it("weekly study minutes from onboarding availability", () => {
    expect(weeklyStudyMinutes('{"monday":20,"friday":30,"note":"x"}')).toBe(50);
    expect(weeklyStudyMinutes({ monday: -5 })).toBeNull();
    expect(weeklyStudyMinutes("nope")).toBeNull();
  });
  it("track and specialty comparison with real numbers", () => {
    const rows = trackComparison(
      [{ track: "immigration", availability: { monday: 60 } }, { track: "immigration", availability: { tuesday: 30 } }, { track: "general", availability: {} }],
      [{ specialties: ["canada_immigration_tef_tcf"], rules: [rule(1, "10:00", "12:00")] }, { specialties: ["canadian_citizenship"], rules: [] }],
    );
    expect(rows).toEqual([
      { track: "immigration", specialty: "canada_immigration_tef_tcf", learners: 2, learner_weekly_hours: 1.5, tutors: 1, tutor_weekly_hours: 2, short_of_tutors: false },
      { track: "citizenship", specialty: "canadian_citizenship", learners: 0, learner_weekly_hours: 0, tutors: 1, tutor_weekly_hours: 0, short_of_tutors: false },
    ]);
  });
});
