/**
 * Onboarding has six questions and, for a visitor, a seventh step that creates the account. Someone who already
 * signed up on the sign-up page reaches onboarding signed in: they skip the account step and their answers are saved
 * to the account they already have (found in the Plan 4 preview click-through; Buildy had the same dead end).
 */
export function onboardingStepCount(signedIn: boolean): number {
  return signedIn ? 6 : 7;
}

export function afterQuestionStep(step: number, signedIn: boolean): "next" | "finish_signed_in" | "sign_up" {
  if (step < onboardingStepCount(signedIn)) return "next";
  return signedIn ? "finish_signed_in" : "sign_up";
}

/** The plan service answers ONBOARDING_REQUIRED when the learner has no profile yet; Today then links to onboarding. */
export function needsOnboarding(error: unknown): boolean {
  return error instanceof Error && /\bONBOARDING_REQUIRED\b/.test(error.message);
}

/**
 * Every learner service refuses an account without a learner profile, so the learner area sends such a learner to
 * onboarding first. Account stays reachable (settings, delete account).
 */
export function learnerOnboardingRedirect(hasLearnerProfile: boolean, path: string): string | null {
  if (hasLearnerProfile || path.startsWith("/learner/account")) return null;
  return "/onboarding";
}

/** Runs on every learner page: where to send this learner, or null. A failed profile read never blocks the area. */
export async function onboardingRedirectFor(path: string, hasLearnerProfile: () => Promise<boolean>): Promise<string | null> {
  try {
    return learnerOnboardingRedirect(await hasLearnerProfile(), path);
  } catch {
    return null;
  }
}

export type SignInState = "checking" | "learner" | "visitor" | "unknown";

/** A saved step never goes past the steps this person has (a signed-in learner has 6): no "STEP 7 OF 6" (R29). */
export function clampOnboardingStep(step: number, signedIn: boolean): number {
  const n = Number.isFinite(step) ? Math.floor(step) : 1;
  return Math.min(onboardingStepCount(signedIn), Math.max(1, n));
}

/**
 * Retries a sign-in check that failed (network), so a signed-in learner is not sent to the account step (R29).
 * "unknown" means every attempt failed; the page asks again before choosing the last step.
 */
export async function checkSignInWithRetry(
  check: () => Promise<"learner" | "visitor">,
  attempts = 3,
  pause: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<"learner" | "visitor" | "unknown"> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await check();
    } catch {
      if (i < attempts - 1) await pause(500 * (i + 1));
    }
  }
  return "unknown";
}

/**
 * What the last step shows (R38). Step 7 creates a visitor's account, so its fields appear only once the sign-in check
 * says "visitor". While checking (or for a learner about to be moved to step 6) a neutral note; after the retries
 * failed, a message with a button to check again. Never the password field by default.
 */
export function lastStepView(step: number, state: SignInState): "question" | "account" | "checking" | "retry" {
  if (step < 7) return "question";
  if (state === "visitor") return "account";
  if (state === "unknown") return "retry";
  return "checking";
}
