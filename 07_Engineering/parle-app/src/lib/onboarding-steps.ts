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
