import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveOverallLevel,
  eligibleRatingAverage,
  goalSpecialtyFit,
  levelForTutorMatching,
  priceFitPoints,
  scoreTutorMatch,
  sharedLanguagePoints,
  topMatchReason,
} from "./tutor-match-score";

const learner = {
  mainGoal: "canada_immigration",
  currentLevel: "B1",
  nativeLanguage: "Arabic",
  tutorBudgetBand: "20_35",
};
const tutor = {
  specialties: ["canada_immigration_tef_tcf"],
  levelsTaught: ["A1", "B1"],
  spokenLanguages: ["Arabic", "English"],
  hourlyRateCents: 3500,
};

describe("deterministic tutor matching", () => {
  it("awards full points for an exact specialty and half for a curated related specialty", () => {
    assert.equal(goalSpecialtyFit("canada_immigration", ["canada_immigration_tef_tcf"]), "exact");
    assert.equal(goalSpecialtyFit("canada_immigration", ["grammar"]), "related");
    assert.equal(goalSpecialtyFit("work", ["canadian_citizenship"]), "none");
  });

  it("does not fuzzy-match unknown or learner-written goals", () => {
    assert.equal(goalSpecialtyFit("other", ["business_french"]), "none");
    assert.equal(goalSpecialtyFit("I want to work in French", ["business_french"]), "none");
    assert.equal(goalSpecialtyFit("invented_goal", ["conversation"]), "none");
  });

  it("averages finite skill estimates, snaps to a CEFR anchor, rounds ties up, and uses self-assessment only as fallback", () => {
    assert.equal(deriveOverallLevel([1.2, 2.1, 1.8, 2.5]), "A2");
    assert.equal(deriveOverallLevel([2.5]), "B1");
    assert.equal(deriveOverallLevel([4.5]), "C1");
    assert.equal(deriveOverallLevel(["3", Number.NaN, 8], "B1"), "B1");
    assert.equal(deriveOverallLevel([], "A0"), "A0");
    assert.equal(deriveOverallLevel([], "not-a-level"), null);
    assert.equal(levelForTutorMatching("A0"), "A1");
  });

  it("implements budget ceilings, a twenty-percent grace band, and no-budget choices", () => {
    assert.equal(priceFitPoints(1900, "under_20"), 15);
    assert.equal(priceFitPoints(2400, "under_20"), 7.5);
    assert.equal(priceFitPoints(2401, "under_20"), 0);
    assert.equal(priceFitPoints(4200, "20_35"), 7.5);
    assert.equal(priceFitPoints(4210, "20_35"), 0);
    assert.equal(priceFitPoints(5000, "35_50"), 15);
    assert.equal(priceFitPoints(15000, "50_plus"), 15);
    assert.equal(priceFitPoints(2500, "unspecified"), 15);
    assert.equal(priceFitPoints(2500, "none"), 0);
  });

  it("awards native language points before the English fallback and treats Other as unknown", () => {
    assert.equal(sharedLanguagePoints("Arabic", ["Arabic", "English"]), 10);
    assert.equal(sharedLanguagePoints("Persian", ["English"]), 5);
    assert.equal(sharedLanguagePoints("English", ["English"]), 10);
    assert.equal(sharedLanguagePoints("Punjabi", ["French"]), 0);
    assert.equal(sharedLanguagePoints("Other", ["Other"]), 0);
    assert.equal(sharedLanguagePoints("Other", ["Other", "English"]), 5);
    assert.equal(sharedLanguagePoints(null, ["English"]), 5);

    const reason = topMatchReason({
      learner: { ...learner, mainGoal: "other", nativeLanguage: "Other", tutorBudgetBand: "none" },
      tutor: { ...tutor, specialties: [], levelsTaught: [], spokenLanguages: ["Other", "English"], hourlyRateCents: 5000 },
    });
    assert.deepEqual(reason, { kind: "language", language: "English" });
  });

  it("sums the requested weights, rounds the score to an integer, and ignores ratings", () => {
    const result = scoreTutorMatch({ learner, tutor, availabilityOverlapRatio: 0.5 });
    assert.deepEqual(result, { goal: 30, level: 20, availability: 12.5, price: 15, language: 10, total: 88 });
    const differentRating = scoreTutorMatch({ learner, tutor: { ...tutor, ratingAverage: 1, ratingCount: 100 }, availabilityOverlapRatio: 0.5 });
    assert.equal(differentRating.total, result.total);
    const outOfRangeOverlap = scoreTutorMatch({ learner, tutor, availabilityOverlapRatio: 8 });
    assert.equal(outOfRangeOverlap.availability, 25);
  });

  it("does not expose or tie-break on a rating until three reviews are eligible", () => {
    assert.equal(eligibleRatingAverage(5, 2), null);
    assert.equal(eligibleRatingAverage(4.5, 3), 4.5);
    assert.equal(eligibleRatingAverage(0, 8), null);
  });
});
