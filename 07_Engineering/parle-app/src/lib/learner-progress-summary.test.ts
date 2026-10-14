import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { t } from "@/lib/i18n";
import { formatLearnerLevel } from "@/lib/learner-display";
import { buildLearnerProgressSummary } from "@/lib/learner-progress-summary";
import type { LearnerProgressData } from "@/lib/learner-plan";
import { readServerPlanTier, type PracticeMinutesBySkill } from "@/lib/learner-analytics";
import type { PlannerTrack, SkillValues } from "@/lib/roadmap-engine";

const starting: SkillValues<number> = { listening: 1.5, reading: 2, writing: 1.75, speaking: 1 };
const current: SkillValues<number> = { listening: 2.25, reading: 2.5, writing: 2, speaking: 1.25 };
const allMinutes: PracticeMinutesBySkill = { listening: 38, reading: 24, writing: 17, speaking: 11 };

function progressData(options: {
  track?: PlannerTrack;
  earliestPlacementDate?: string | null;
  weeklyTotals?: Record<string, number>;
  history?: LearnerProgressData["history"];
  learnerName?: string | null;
  speakingState?: string;
  today?: string;
} = {}): LearnerProgressData {
  const track = options.track ?? "immigration";
  const targets: SkillValues<number | null> = track === "citizenship"
    ? { listening: 2, reading: null, writing: null, speaking: 2 }
    : { listening: 3.5, reading: 3.5, writing: 3.5, speaking: 3.5 };
  return {
    plan: {
      userId: "learner-1",
      profileId: "profile-1",
      roadmapId: "roadmap-1",
      weekPlanId: "week-1",
      track,
      goalLabel: track === "immigration" ? "canada_immigration" : track,
      today: options.today ?? "2026-10-13",
      timeZone: "America/Toronto",
      sourceLabel: "Placement assessment",
      hasScoredAssessment: true,
      speakingAssessed: true,
      current,
      targets,
      feasibility: {} as LearnerProgressData["plan"]["feasibility"],
      weekStart: "2026-10-12",
      weekEnd: "2026-10-18",
      planStartDate: "2026-10-12",
      weekNumber: 3,
      totalMinutes: 90,
      allocationShare: { listening: 0.25, reading: 0.25, writing: 0.25, speaking: 0.25 },
      allocationMinutes: { listening: 20, reading: 20, writing: 20, speaking: 20 },
      dailyMinutes: {},
      whatChangedNote: null,
      startValues: starting,
      skillStates: { listening: "assessed", reading: "assessed", writing: "assessed", speaking: options.speakingState ?? "assessed" },
      tasks: [],
    } as LearnerProgressData["plan"],
    starts: starting,
    states: { listening: "assessed", reading: "assessed", writing: "assessed", speaking: options.speakingState ?? "assessed" },
    history: options.history ?? [
      { user_id: "learner-1", week_start_local: "2026-10-05", date_local: "2026-10-11", status: "submitted" },
      { user_id: "learner-1", week_start_local: "", date_local: "2026-09-28", status: "submitted" },
    ],
    trend: [],
    startedOn: "2026-08-01",
    earliestPlacementDate: options.earliestPlacementDate === undefined ? "2026-08-01" : options.earliestPlacementDate,
    learnerName: options.learnerName === undefined ? "Amina Laurent" : options.learnerName,
    skillProgress: { listening: 50, reading: 25, writing: 15, speaking: 10 },
    readiness: 42,
    completedMinutesByWeek: options.weeklyTotals ?? { "2026-10-05": 90, "2026-10-12": 60 },
    streak: 2,
    taskActivity: [],
  } as LearnerProgressData;
}

const producedAt = new Date("2026-10-14T02:00:00.000Z");

describe("private printable learner progress summary", () => {
  it("sums the existing Progress weekly totals and uses the learner-local produced date and full check-in history", () => {
    const data = progressData({ history: [
      { user_id: "learner-1", week_start_local: "2026-10-05", date_local: "2026-10-10", status: "submitted" },
      { user_id: "learner-1", week_start_local: "", date_local: "2026-09-28", status: "submitted" },
      { user_id: "learner-1", week_start_local: "2026-09-21", date_local: "2026-09-27", status: "submitted" },
    ] });
    const summary = buildLearnerProgressSummary(data, {
      producedAt,
      access: "premium",
      minutesBySkill: allMinutes,
      weeklyCheckInMinutes: 0,
      viewerId: "learner-1",
    });

    assert.equal(summary.learnerName, "Amina Laurent");
    assert.equal(summary.goalLabel, "Canada immigration");
    assert.equal(summary.trackLabel, "Canada Immigration");
    assert.equal(summary.placementDate, "2026-08-01");
    assert.equal(summary.rangeEndDate, "2026-10-13");
    assert.equal(summary.producedOn, "2026-10-13");
    assert.equal(summary.totalMinutes, 150);
    assert.equal(summary.totalHours, 2.5);
    assert.equal(summary.access, "premium");
    assert.deepEqual(summary.minutesBySkill, allMinutes);
    assert.equal(summary.weeklyCheckInMinutes, 0);
    assert.deepEqual(summary.checkInDates, ["2026-10-10", "2026-09-28", "2026-09-27"]);
    assert.equal(
      summary.practiceRecordDisclaimer,
      "This summary shows practice recorded in Parle; it is not a language test result and is not accepted as proof of French ability for immigration or citizenship.",
    );
    assert.equal(summary.estimateDisclaimer, "Estimate - not an official score");
  });

  it("adds separate weekly check-in minutes to the 20-minute Premium summary total", () => {
    const summary = buildLearnerProgressSummary(progressData({
      today: "2026-10-14",
      earliestPlacementDate: "2026-08-01",
      weeklyTotals: { "2026-10-05": 10, "2026-10-12": 10 },
      history: [{ user_id: "learner-1", week_start_local: "2026-10-05", date_local: "2026-10-10", status: "submitted" }],
    }), {
      producedAt,
      access: "premium",
      minutesBySkill: { listening: 0, reading: 0, writing: 0, speaking: 10 },
      weeklyCheckInMinutes: 10,
      viewerId: "learner-1",
    });
    const skillMinutes = Object.values(summary.minutesBySkill ?? {}).reduce((total, minutes) => total + minutes, 0);

    assert.equal(summary.placementDate, "2026-08-01");
    assert.equal(summary.rangeEndDate, "2026-10-14");
    assert.equal(summary.totalMinutes, 20);
    assert.equal(summary.weeklyCheckInMinutes, 10);
    assert.deepEqual(summary.minutesBySkill, { listening: 0, reading: 0, writing: 0, speaking: 10 });
    assert.equal(skillMinutes, 10);
    assert.equal(skillMinutes + (summary.weeklyCheckInMinutes ?? 0), summary.totalMinutes);
    assert.equal(t("learner.progress.weeklyCheckIns"), "Weekly check-ins");

    const checkInOnly = buildLearnerProgressSummary(progressData({
      today: "2026-10-14",
      earliestPlacementDate: "2026-08-01",
      weeklyTotals: { "2026-10-05": 10 },
    }), {
      producedAt,
      access: "premium",
      minutesBySkill: null,
      weeklyCheckInMinutes: 10,
      viewerId: "learner-1",
    });
    assert.equal(checkInOnly.minutesBySkill, null);
    assert.equal(checkInOnly.weeklyCheckInMinutes, 10);
    assert.equal(checkInOnly.weeklyCheckInMinutes, checkInOnly.totalMinutes);
  });

  it("does not use the plan week start when a saved check-in submission date is missing or invalid", () => {
    const summary = buildLearnerProgressSummary(progressData({ history: [
      { user_id: "learner-1", week_start_local: "2026-10-05", date_local: "", status: "submitted" },
      { user_id: "learner-1", week_start_local: "2026-10-12", date_local: "2026-02-30", status: "submitted" },
    ] }), { producedAt, access: "free" });

    assert.deepEqual(summary.checkInDates, [null, null]);
  });

  it("uses the Progress track weights and the existing CEFR and approximate NCLC formatting", () => {
    const summary = buildLearnerProgressSummary(progressData({ track: "citizenship", speakingState: "not_assessed" }), {
      producedAt,
      access: "premium",
      minutesBySkill: null,
    });

    assert.deepEqual(summary.skills.map((skill) => skill.skill), ["listening", "speaking"]);
    assert.equal(summary.skills[0].startingEstimate, formatLearnerLevel(starting.listening, "citizenship"));
    assert.equal(summary.skills[0].currentEstimate, formatLearnerLevel(current.listening, "citizenship"));
    assert.equal(summary.skills[1].startingEstimate, t("learner.progress.levelNotYetAssessed"));
    assert.equal(summary.skills[1].currentEstimate, t("learner.progress.levelNotYetAssessed"));
  });

  it("exposes skill minutes to Premium only and keeps the Free line exact", () => {
    const freeSummary = buildLearnerProgressSummary(progressData(), {
      producedAt,
      access: "free",
      minutesBySkill: allMinutes,
      weeklyCheckInMinutes: 10,
    });
    const premiumSummary = buildLearnerProgressSummary(progressData(), {
      producedAt,
      access: "premium",
      minutesBySkill: allMinutes,
      weeklyCheckInMinutes: 10,
    });
    const complimentaryTier = readServerPlanTier({
      status: "complete",
      summary: { plan_tier: "premium", billing_source: "complimentary" },
    });
    const complimentaryPremiumSummary = buildLearnerProgressSummary(progressData(), {
      producedAt,
      access: complimentaryTier,
      minutesBySkill: allMinutes,
      weeklyCheckInMinutes: 10,
    });
    const checkingSummary = buildLearnerProgressSummary(progressData(), {
      producedAt,
      access: "loading",
      minutesBySkill: allMinutes,
      weeklyCheckInMinutes: 10,
    });

    assert.equal(freeSummary.minutesBySkill, null);
    assert.equal(freeSummary.weeklyCheckInMinutes, null);
    assert.deepEqual(premiumSummary.minutesBySkill, allMinutes);
    assert.equal(premiumSummary.weeklyCheckInMinutes, 10);
    assert.equal(complimentaryPremiumSummary.access, "premium");
    assert.deepEqual(complimentaryPremiumSummary.minutesBySkill, allMinutes);
    assert.equal(complimentaryPremiumSummary.weeklyCheckInMinutes, 10);
    assert.equal(checkingSummary.minutesBySkill, null);
    assert.equal(checkingSummary.weeklyCheckInMinutes, null);
    assert.equal(t("learner.progressSummary.freeSkillNotice"), "Minutes by skill are part of Premium.");
  });

  it("keeps the exact estimate disclaimer and clear dates on an empty-data report", () => {
    const empty = buildLearnerProgressSummary(progressData({
      learnerName: null,
      earliestPlacementDate: null,
      weeklyTotals: {},
      history: [],
    }), { producedAt, access: "free" });

    assert.equal(empty.learnerName, t("learner.progressSummary.nameUnavailable"));
    assert.equal(empty.placementDate, null);
    assert.equal(empty.rangeEndDate, "2026-10-13");
    assert.equal(empty.producedOn, "2026-10-13");
    assert.equal(empty.totalMinutes, 0);
    assert.equal(empty.totalHours, 0);
    assert.deepEqual(empty.checkInDates, []);
    assert.equal(empty.practiceRecordDisclaimer, t("learner.progressSummary.practiceRecordDisclaimer"));
    assert.equal(empty.estimateDisclaimer, t("learner.today.estimateCaveat"));
    assert.equal(empty.estimateDisclaimer, "Estimate - not an official score");
    assert.equal(t("learner.today.estimateCaveat"), "Estimate - not an official score");
  });

  it("rejects Progress data that belongs to a different viewer", () => {
    assert.throws(
      () => buildLearnerProgressSummary(progressData(), { producedAt, viewerId: "learner-2" }),
      /does not belong to the signed-in learner/,
    );
  });
});
