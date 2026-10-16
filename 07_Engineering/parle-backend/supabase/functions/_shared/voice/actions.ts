import { VoiceError, type VoiceContext } from "./context.ts";
import { setReadAloud, voicePart, voiceRelease, voiceStatus, voiceTake } from "./limits.ts";
import { speakingResultFor, speakingScore, speakingScoreTyped } from "./speaking.ts";
import { adminListeningMissing, listeningClaim, listeningStore } from "./listening.ts";

type Action = (ctx: VoiceContext) => Promise<Record<string, unknown>>;
/** Called only by the relay (header x-voice-secret), always with the learner's own token. */
const RELAY: Record<string, Action> = {
  voice_take: voiceTake, voice_part: voicePart, voice_release: voiceRelease, listening_claim: listeningClaim, listening_store: listeningStore,
};
/** Called by the app with the learner's token. */
const LEARNER: Record<string, Action> = {
  voice_status: voiceStatus,
  voice_set_read_aloud: setReadAloud,
  speaking_score: speakingScore,
  speaking_score_typed: speakingScoreTyped,
  speaking_result: speakingResultFor,
  admin_listening_missing: adminListeningMissing,
};

export async function runVoiceAction(ctx: VoiceContext): Promise<Record<string, unknown>> {
  const action = String(ctx.body.action ?? "");
  if (RELAY[action]) {
    if (!ctx.relay) throw new VoiceError("RELAY_ONLY", 403, "Only the voice relay may do this.");
    return RELAY[action](ctx);
  }
  if (LEARNER[action]) return LEARNER[action](ctx);
  throw new VoiceError("UNKNOWN_ACTION", 400);
}
