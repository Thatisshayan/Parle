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

describe("learner area check on every page (final review, Minor 2 raised)", () => {
  it("redirects per page, and a failed profile read never blocks the learner area", async () => {
    const { onboardingRedirectFor } = await import("./onboarding-steps.ts");
    assert.equal(await onboardingRedirectFor("/learner/plan", async () => false), "/onboarding");
    assert.equal(await onboardingRedirectFor("/learner/account", async () => false), null);
    assert.equal(await onboardingRedirectFor("/learner/plan", async () => true), null);
    assert.equal(await onboardingRedirectFor("/learner/plan", async () => { throw new Error("network"); }), null);
  });
});

describe("signed-in learners never get the account step (A16, R29)", () => {
  it("clamps a saved step to the steps this person has", async () => {
    const { clampOnboardingStep } = await import("./onboarding-steps.ts");
    assert.equal(clampOnboardingStep(7, true), 6);
    assert.equal(clampOnboardingStep(7, false), 7);
    assert.equal(clampOnboardingStep(0, true), 1);
    assert.equal(clampOnboardingStep(Number.NaN, false), 1);
  });
  it("retries a sign-in check that failed on the network, and says unknown instead of guessing", async () => {
    const { checkSignInWithRetry } = await import("./onboarding-steps.ts");
    const noWait = async () => {};
    let calls = 0;
    assert.equal(await checkSignInWithRetry(async () => { calls += 1; if (calls < 3) throw new Error("network"); return "learner"; }, 3, noWait), "learner");
    assert.equal(calls, 3);
    assert.equal(await checkSignInWithRetry(async () => { throw new Error("network"); }, 3, noWait), "unknown");
    assert.equal(await checkSignInWithRetry(async () => "visitor", 3, noWait), "visitor");
  });
  it("the page uses the clamped step and the real step count (Review Focus 2)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../pages/Onboarding.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(src, /aria-valuemax=\{7\}/);
    assert.match(src, /aria-valuemax=\{stepCount\}/);
    assert.match(src, /aria-valuenow=\{displayStep\}/);
    assert.match(src, /clampOnboardingStep\(current\.step, true\)/);
    assert.match(src, /checkSignInWithRetry\(checkSignIn\)/);
  });
});
