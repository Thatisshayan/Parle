import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { t } from "@/lib/i18n";
import { formatLearnerLevel } from "@/lib/learner-display";
import {
  earliestOwnedPlacementDate,
  filterLearnerRowsByOwner,
  hasScoredLearnerAssessment,
  latestSavedSkillEstimateValues,
  latestScoredLearnerCheckIn,
  selectTodayWhatChangedNote,
  todayLevelHeadingKey,
  type LearnerCheckInRecord,
} from "@/lib/learner-plan";
import type { SkillValues } from "@/lib/roadmap-engine";

const startingValues: SkillValues<number> = {
  listening: 1,
  reading: 1,
  writing: 1,
  speaking: 1,
};
const firstPlanNote = "Your first week is set from your starting estimates.";
const latestReplanNote = "Listening and reading moved; next week adds more listening practice.";

function submittedCheckIn(createdAt: string, weekStart: string): LearnerCheckInRecord {
  return {
    user_id: "learner-1",
    profile_id: "profile-1",
    roadmap_id: "roadmap-1",
    status: "submitted",
    created_at: createdAt,
    week_start_local: weekStart,
  };
}

describe("private printable progress ownership and placement date", () => {
  const owner = { id: "learner-1", email: "amina@example.test" };

  it("keeps progress rows only when both learner ID and account email match", () => {
    const rows = [
      { id: "owned", user_id: owner.id, created_by: owner.email },
      { id: "other-id", user_id: "learner-2", created_by: owner.email },
      { id: "other-email", user_id: owner.id, created_by: "other@example.test" },
      { id: "missing-email", user_id: owner.id },
    ];

    assert.deepEqual(filterLearnerRowsByOwner(rows, owner).map((row) => row.id), ["owned"]);
  });

  it("uses the earliest qualifying placement in the learner's local calendar and ignores other owners", () => {
    const date = earliestOwnedPlacementDate([
      { user_id: "learner-2", created_by: owner.email, status: "assessed", taken_at: "2021-01-01T12:00:00.000Z" },
      { user_id: owner.id, created_by: "other@example.test", status: "assessed", taken_at: "2022-01-01T12:00:00.000Z" },
      { user_id: owner.id, created_by: owner.email, status: "in_progress", taken_at: "2023-01-01T12:00:00.000Z" },
      { user_id: owner.id, created_by: owner.email, status: "assessed", taken_at: "2026-08-15T04:00:00.000Z" },
      { user_id: owner.id, created_by: owner.email, status: "unverified", taken_at: "2026-08-01T02:00:00.000Z" },
    ], owner, "America/Toronto");

    assert.equal(date, "2026-07-31");
  });
});

describe("Today learner estimate and change-note data", () => {
  it("uses the saved first-plan note before any check-in exists", () => {
    const note = selectTodayWhatChangedNote({
      checkIns: [],
      firstPlanNote,
      latestCheckInReplanNote: undefined,
    });

    assert.equal(note, firstPlanNote);
    assert.equal(hasScoredLearnerAssessment(null, [], []), false);
    assert.equal(t(todayLevelHeadingKey(false)), "Starting level");
  });

  it("uses the newest scored check-in re-plan note and the latest estimate for each skill", () => {
    const checkIns = [
      submittedCheckIn("2026-09-07T12:00:00.000Z", "2026-08-31"),
      submittedCheckIn("2026-09-14T12:00:00.000Z", "2026-09-07"),
    ];
    const latestCheckIn = latestScoredLearnerCheckIn(checkIns);
    const current = latestSavedSkillEstimateValues([
      { skill: "listening", value: 2.25, source: "checkin" },
      { skill: "listening", value: 2, source: "placement" },
      { skill: "reading", value: 2.75, source: "checkin" },
      { skill: "reading", value: 2.5, source: "placement" },
      { skill: "writing", value: 1.5, source: "placement" },
      { skill: "speaking", value: 1, source: "placement" },
    ], startingValues);
    const note = selectTodayWhatChangedNote({
      checkIns,
      firstPlanNote,
      latestCheckInReplanNote: latestReplanNote,
    });

    assert.equal(latestCheckIn?.week_start_local, "2026-09-07");
    assert.equal(note, latestReplanNote);
    assert.equal(hasScoredLearnerAssessment(null, checkIns, []), true);
    assert.equal(t(todayLevelHeadingKey(true)), "Current level");
    assert.equal(t("learner.today.estimateCaveat"), "Estimate - not an official score");
    assert.deepEqual(current, {
      listening: 2.25,
      reading: 2.75,
      writing: 1.5,
      speaking: 1,
    });
    assert.equal(formatLearnerLevel(current.listening, "general", "en-US"), "A2 · 2.25 / 5");
    assert.equal(formatLearnerLevel(current.reading, "general", "en-US"), "B1 · 2.75 / 5");
  });

  it("keeps a learner with no saved estimates in the Starting level state", () => {
    const current = latestSavedSkillEstimateValues([], startingValues);
    const hasScoredAssessment = hasScoredLearnerAssessment(null, [], []);

    assert.deepEqual(current, startingValues);
    assert.equal(t(todayLevelHeadingKey(hasScoredAssessment)), "Starting level");
  });

  it("shows no older note when the latest check-in re-plan note cannot be read", () => {
    const note = selectTodayWhatChangedNote({
      checkIns: [submittedCheckIn("2026-09-14T12:00:00.000Z", "2026-09-07")],
      firstPlanNote,
      latestCheckInReplanNote: undefined,
    });

    assert.equal(note, null);
    assert.equal(selectTodayWhatChangedNote({
      checkIns: [submittedCheckIn("2026-09-14T12:00:00.000Z", "2026-09-07")],
      firstPlanNote,
      latestCheckInReplanNote: "  ",
    }), null);
    assert.equal(selectTodayWhatChangedNote({
      checkIns: null,
      firstPlanNote,
      latestCheckInReplanNote: latestReplanNote,
    }), null);
  });
});

describe("learner without a profile (A15, R34)", () => {
  it("is refused with an error code, not a sentence", async () => {
    const { LearnerOnboardingRequiredError } = await import("./learner-plan");
    const e = new LearnerOnboardingRequiredError();
    assert.equal(e.code, "ONBOARDING_REQUIRED");
    assert.ok(e instanceof Error);
  });
});
