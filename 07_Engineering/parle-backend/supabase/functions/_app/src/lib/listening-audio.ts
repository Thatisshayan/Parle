// GENERATED from parle-app/src/lib/listening-audio.ts by scripts/sync-app-code.ts. Do not edit.
import type { TranslationKey } from "./i18n.ts";

/** Plan 13: the check-in answer sent for a listening question whose audio would not load; it is never scored. */
export const SKIPPED_AUDIO = "skipped_audio";

/**
 * Plan 13: what the Listen button shows after its audio failed to load. In a test (placement, the weekly check-in,
 * the level check) the learner is asked to try again, and after a second failure may skip the question (not
 * counted). In practice, where the text is on the page, the existing note is kept and there is no skip.
 */
export function listeningFailureView(failures: number, inATest: boolean): { messageKey: TranslationKey | null; canSkip: boolean } {
  if (failures <= 0) return { messageKey: null, canSkip: false };
  if (!inATest) return { messageKey: "voice.listening.unavailable", canSkip: false };
  return { messageKey: "voice.listening.retry", canSkip: failures >= 2 };
}
