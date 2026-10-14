import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { t } from "@/lib/i18n";
import {
  aggregatePracticeMinutesBySkill,
  aggregateWeeklyCheckInMinutes,
  filterAnalyticsRowsByOwner,
  readServerPlanTier,
  selectLowestLanguagePointMastery,
} from "@/lib/learner-analytics";

describe("learner detailed analytics", () => {
  const now = new Date("2026-10-13T12:00:00.000Z");

  it("sums completed practice durations by skill using stored completion times inside the rolling 28-day window", () => {
    const totals = aggregatePracticeMinutesBySkill([
      { status: "done", type: "ai_lesson", skill: "listening", minutes: 12, completed_at_utc: "2026-09-15T12:00:00.000Z" },
      { status: "done", type: "vocabulary_drill", skill: "listening", minutes: 7, completed_at_utc: "2026-10-10T09:30:00.000Z" },
      { status: "done", type: "writing", skill: "writing", minutes: 8.5, completed_at_utc: "2026-10-13T12:00:00.000Z" },
      { status: "planned", type: "writing", skill: "writing", minutes: 90, completed_at_utc: "2026-10-11T10:00:00.000Z" },
      { status: "skipped", type: "speaking_practice", skill: "speaking", minutes: 30, completed_at_utc: "2026-10-11T10:00:00.000Z" },
      { status: "done", type: "weekly_checkin", skill: "", minutes: 60, completed_at_utc: "2026-10-11T10:00:00.000Z" },
      { status: "done", type: "tutor_lesson", skill: "", minutes: 60, completed_at_utc: "2026-10-11T10:00:00.000Z" },
      { status: "done", type: "speaking_practice", skill: "speaking", minutes: 50, completed_at_utc: "2026-09-15T11:59:59.999Z" },
      { status: "done", type: "ai_lesson", skill: "listening", minutes: 4, completed_at_utc: "2026-10-13T12:00:00.001Z" },
      { status: "done", type: "ai_lesson", skill: "listening", minutes: 5, completed_at_utc: "not-a-date" },
    ], now);

    assert.deepEqual(totals, { listening: 19, reading: 0, writing: 8.5, speaking: 0 });
  });

  it("uses each completed task's saved skill in both the rolling card and matching summary windows", () => {
    const tasks = [
      {
        status: "done",
        type: "vocabulary_drill",
        skill: "reading",
        reason: "weekly_practice",
        reason_skill: "listening",
        minutes: 10,
        completed_at_utc: "2026-10-10T09:30:00.000Z",
      },
      {
        status: "done",
        type: "speaking_practice",
        skill: "speaking",
        reason: "weekly_practice",
        reason_skill: "listening",
        minutes: 10,
        completed_at_utc: "2026-10-13T11:30:00.000Z",
      },
    ];
    const summaryRange = {
      startLocalDate: "2026-10-01",
      endLocalDate: "2026-10-13",
      timeZone: "America/Toronto",
    };
    const expected = { listening: 0, reading: 10, writing: 0, speaking: 10 };
    const cardTotals = aggregatePracticeMinutesBySkill(tasks, now);
    const summaryTotals = aggregatePracticeMinutesBySkill(tasks, now, summaryRange);

    assert.deepEqual(cardTotals, expected);
    assert.deepEqual(summaryTotals, expected);
    for (const totals of [cardTotals, summaryTotals]) {
      assert.ok(totals);
      assert.equal(Object.values(totals).reduce((sum, minutes) => sum + minutes, 0), 20);
    }
  });

  it("keeps a completed 10-minute weekly check-in separate from today's 10-minute Speaking task", () => {
    const exampleNow = new Date("2026-10-14T12:00:00.000Z");
    const tasks = [
      {
        status: "done",
        type: "weekly_checkin",
        skill: "",
        minutes: 10,
        completed_at_utc: "2026-10-10T14:00:00.000Z",
      },
      {
        status: "done",
        type: "speaking_practice",
        skill: "speaking",
        minutes: 10,
        completed_at_utc: "2026-10-14T12:00:00.000Z",
      },
    ];
    const summaryRange = {
      startLocalDate: "2026-08-01",
      endLocalDate: "2026-10-14",
      timeZone: "America/Toronto",
    };
    const expectedSkillMinutes = { listening: 0, reading: 0, writing: 0, speaking: 10 };
    const cardSkillMinutes = aggregatePracticeMinutesBySkill(tasks, exampleNow);
    const reportSkillMinutes = aggregatePracticeMinutesBySkill(tasks, exampleNow, summaryRange);
    const cardCheckInMinutes = aggregateWeeklyCheckInMinutes(tasks, exampleNow);
    const reportCheckInMinutes = aggregateWeeklyCheckInMinutes(tasks, exampleNow, summaryRange);

    assert.deepEqual(cardSkillMinutes, expectedSkillMinutes);
    assert.deepEqual(reportSkillMinutes, expectedSkillMinutes);
    assert.equal(cardCheckInMinutes, 10);
    assert.equal(reportCheckInMinutes, 10);
    for (const [skillMinutes, checkInMinutes] of [
      [cardSkillMinutes, cardCheckInMinutes],
      [reportSkillMinutes, reportCheckInMinutes],
    ] as const) {
      assert.ok(skillMinutes);
      assert.equal(Object.values(skillMinutes).reduce((sum, minutes) => sum + minutes, 0), 10);
      assert.equal(Object.values(skillMinutes).reduce((sum, minutes) => sum + minutes, 0) + (checkInMinutes ?? 0), 20);
    }
  });

  it("counts only valid completed weekly check-ins inside each window and floors each task separately", () => {
    const exampleNow = new Date("2026-10-14T12:00:00.000Z");
    const tasks = [
      { status: "done", type: "weekly_checkin", skill: "", minutes: 10.9, completed_at_utc: "2026-10-10T14:00:00.000Z" },
      { status: "done", type: "weekly_checkin", skill: "", minutes: 4.5, completed_at_utc: "2026-09-15T14:00:00.000Z" },
      { status: "done", type: "weekly_checkin", skill: "", minutes: 1.9, completed_at_utc: "2026-10-12T14:00:00.000Z" },
      { status: "done", type: "weekly_checkin", skill: "", minutes: 0.9, completed_at_utc: "2026-10-13T14:00:00.000Z" },
      { status: "planned", type: "weekly_checkin", minutes: 30, completed_at_utc: "2026-10-13T14:00:00.000Z" },
      { status: "skipped", type: "weekly_checkin", minutes: 30, completed_at_utc: "2026-10-13T14:00:00.000Z" },
      { status: "done", type: "weekly_checkin", minutes: 40, completed_at_utc: "2026-07-31T14:00:00.000Z" },
      { status: "done", type: "weekly_checkin", minutes: 40, completed_at_utc: "2026-10-14T12:00:00" },
      { status: "done", type: "weekly_checkin", minutes: 40, completed_at_utc: "not-a-date" },
      { status: "done", type: "weekly_checkin", minutes: 40, completed_at_utc: "2026-10-14T12:00:00.001Z" },
      { status: "done", type: "weekly_checkin", minutes: 0, completed_at_utc: "2026-10-13T14:00:00.000Z" },
      { status: "done", type: "weekly_checkin", minutes: -5, completed_at_utc: "2026-10-13T14:00:00.000Z" },
      { status: "done", type: "speaking_practice", skill: "speaking", minutes: 50, completed_at_utc: "2026-10-13T14:00:00.000Z" },
    ];
    const summaryRange = {
      startLocalDate: "2026-08-01",
      endLocalDate: "2026-10-14",
      timeZone: "America/Toronto",
    };

    assert.equal(aggregateWeeklyCheckInMinutes(tasks, exampleNow), 11);
    assert.equal(aggregateWeeklyCheckInMinutes(tasks, exampleNow, summaryRange), 15);
    assert.equal(aggregateWeeklyCheckInMinutes([], exampleNow), 0);
    assert.equal(aggregateWeeklyCheckInMinutes(tasks, exampleNow, {
      ...summaryRange,
      startLocalDate: "2026-10-15",
    }), null);
  });

  it("uses only semantically valid reason-skill fallbacks and leaves unmappable records unassigned", () => {
    assert.deepEqual(aggregatePracticeMinutesBySkill([
      {
        status: "done",
        type: "vocabulary_drill",
        skill: "",
        reason: "biggest_gap",
        reason_skill: "reading",
        minutes: 10,
        completed_at_utc: "2026-10-12T10:00:00.000Z",
      },
    ], now), { listening: 0, reading: 10, writing: 0, speaking: 0 });

    assert.equal(aggregatePracticeMinutesBySkill([
      {
        status: "done",
        type: "vocabulary_drill",
        skill: "",
        reason: "weekly_practice",
        reason_skill: "reading",
        minutes: 10,
        completed_at_utc: "2026-10-12T10:00:00.000Z",
      },
    ], now), null);
  });

  it("counts a saved skill even when its task type is outside the practice list and normalizes canonical values", () => {
    assert.deepEqual(aggregatePracticeMinutesBySkill([
      { status: "done", type: "tutor_lesson", skill: " SPEAKING ", minutes: 10, completed_at_utc: "2026-10-12T10:00:00.000Z" },
    ], now), { listening: 0, reading: 0, writing: 0, speaking: 10 });
  });

  it("aggregates the explicit placement-to-today window by learner-local dates without changing the default window", () => {
    const tasks = [
      { status: "done", type: "ai_lesson", skill: "listening", minutes: 14, completed_at_utc: "2026-08-05T12:00:00.000Z" },
      { status: "done", type: "vocabulary_drill", skill: "reading", minutes: 6, completed_at_utc: "2026-08-01T02:00:00.000Z" },
      { status: "done", type: "ai_lesson", skill: "listening", minutes: 7, completed_at_utc: "2026-09-15T16:00:00.000Z" },
      { status: "done", type: "writing", skill: "writing", minutes: 8.5, completed_at_utc: "2026-10-13T12:00:00.000Z" },
      { status: "done", type: "ai_lesson", skill: "speaking", minutes: 30, completed_at_utc: "2026-10-13T12:00:00.001Z" },
    ];
    const reportRange = {
      startLocalDate: "2026-08-01",
      endLocalDate: "2026-10-13",
      timeZone: "America/Toronto",
    };

    assert.deepEqual(aggregatePracticeMinutesBySkill(tasks, now, reportRange), {
      listening: 21,
      reading: 0,
      writing: 8.5,
      speaking: 0,
    });
    assert.deepEqual(aggregatePracticeMinutesBySkill(tasks, now), {
      listening: 7,
      reading: 0,
      writing: 8.5,
      speaking: 0,
    });
    assert.equal(aggregatePracticeMinutesBySkill(tasks, now, {
      ...reportRange,
      startLocalDate: "2026-10-14",
    }), null);
  });

  it("filters analytics rows by both signed-in owner identifiers", () => {
    const rows = [
      { id: "owned", user_id: "learner-1", created_by: "learner@example.test" },
      { id: "other-id", user_id: "learner-2", created_by: "learner@example.test" },
      { id: "other-email", user_id: "learner-1", created_by: "other@example.test" },
      { id: "missing-email", user_id: "learner-1" },
    ];
    assert.deepEqual(filterAnalyticsRowsByOwner(rows, { id: "learner-1", email: "learner@example.test" }).map((row) => row.id), ["owned"]);
  });

  it("uses the server-resolved Premium tier for paid and complimentary access and preserves Free access", () => {
    assert.equal(readServerPlanTier({ status: "complete", summary: { plan_tier: "premium", billing_source: "stripe" } }), "premium");
    assert.equal(readServerPlanTier({ status: "complete", summary: { plan_tier: "premium", billing_source: "complimentary" } }), "premium");
    assert.equal(readServerPlanTier({ status: "complete", summary: { plan_tier: "free" } }), "free");
    assert.equal(t("learner.progressSummary.freeSkillNotice"), "Minutes by skill are part of Premium.");
    assert.equal(t("learner.progress.weeklyCheckIns"), "Weekly check-ins");
  });

  it("returns no practice totals when stored records contain no completed practice in the window", () => {
    assert.equal(aggregatePracticeMinutesBySkill([], now), null);
    assert.equal(aggregatePracticeMinutesBySkill([
      { status: "planned", type: "ai_lesson", skill: "reading", minutes: 15, completed_at_utc: "2026-10-12T10:00:00.000Z" },
      { status: "done", type: "ai_lesson", skill: "reading", minutes: 15, completed_at_utc: "2026-09-15T11:59:59.999Z" },
    ], now), null);
    assert.deepEqual(selectLowestLanguagePointMastery([]), []);
    assert.equal(t("learner.progress.analytics.noData"), "Not enough practice yet.");
  });

  it("returns the three lowest current language-point scores and ignores older duplicates", () => {
    const lowest = selectLowestLanguagePointMastery([
      { language_point: "Être and avoir", language_point_key: "etre-avoir", language_point_rolling_score: 91, created_at: "2026-09-20T10:00:00.000Z" },
      { language_point: "Articles", language_point_key: "articles", language_point_rolling_score: 17, created_at: "2026-10-02T10:00:00.000Z" },
      { language_point: "Object pronouns", language_point_rolling_score: 46, created_at: "2026-09-01T10:00:00.000Z" },
      { language_point: " ÊTRE and AVOIR ", language_point_key: "etre-avoir", language_point_rolling_score: 22, created_at: "2026-10-10T10:00:00.000Z" },
      { language_point: "Past participles", language_point_key: "past-participles", language_point_rolling_score: 82, created_at: "2026-10-11T10:00:00.000Z" },
      { language_point: "Object pronouns", language_point_rolling_score: 15, created_at: "2026-10-09T10:00:00.000Z" },
      { language_point: "Pronoun y", language_point_key: "pronoun-y", language_point_rolling_score: 10, created_at: "2026-10-12T10:00:00.000Z" },
      { language_point: "Ignored missing score", language_point_key: "missing-score", rolling_score: 2, created_at: "2026-10-12T11:00:00.000Z" },
    ]);

    assert.deepEqual(lowest.map(({ languagePoint, score }) => ({ languagePoint, score })), [
      { languagePoint: "Pronoun y", score: 10 },
      { languagePoint: "Object pronouns", score: 15 },
      { languagePoint: "Articles", score: 17 },
    ]);
  });
});
