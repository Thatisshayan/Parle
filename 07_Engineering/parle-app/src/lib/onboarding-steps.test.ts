import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { afterQuestionStep, onboardingStepCount } from "./onboarding-steps.ts";

describe("onboarding steps (found in the Plan 4 preview click-through)", () => {
  it("a visitor answers six questions, then creates the account on step 7", () => {
    assert.equal(onboardingStepCount(false), 7);
    assert.equal(afterQuestionStep(6, false), "next");
    assert.equal(afterQuestionStep(7, false), "sign_up");
  });
  it("someone already signed in skips the account step and finishes after step 6", () => {
    assert.equal(onboardingStepCount(true), 6);
    assert.equal(afterQuestionStep(5, true), "next");
    assert.equal(afterQuestionStep(6, true), "finish_signed_in");
  });
});

describe("Today before onboarding", () => {
  it("recognises the server's onboarding-required answer, and nothing else", async () => {
    const { needsOnboarding } = await import("./onboarding-steps.ts");
    assert.equal(needsOnboarding(new Error("API request failed: ONBOARDING_REQUIRED")), true);
    assert.equal(needsOnboarding(new Error("API request failed: PLAN_ACTION_FAILED")), false);
    assert.equal(needsOnboarding("ONBOARDING_REQUIRED"), false);
  });
});

describe("learner area before onboarding", () => {
  it("sends a learner with no profile to onboarding, except from Account (settings, delete account)", async () => {
    const { learnerOnboardingRedirect } = await import("./onboarding-steps.ts");
    assert.equal(learnerOnboardingRedirect(false, "/learner"), "/onboarding");
    assert.equal(learnerOnboardingRedirect(false, "/learner/plan"), "/onboarding");
    assert.equal(learnerOnboardingRedirect(false, "/learner/account"), null);
    assert.equal(learnerOnboardingRedirect(true, "/learner"), null);
  });
});
