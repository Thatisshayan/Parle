import { ProviderError, TTS_RATE, type Env, type VoiceProvider } from "./provider.js";

/** Like the Stripe fake: fixed transcripts and a short silent sound, never a network call. */
export const FAKE_TRANSCRIPT = "Le week-end dernier, je suis allé au marché avec ma sœur. Nous avons acheté des légumes frais et du pain, puis nous avons pris un café sur la terrasse.";
export const fakeCalls = { transcribe: 0, synthesize: 0 };

export function fakeProvider(env: Env): VoiceProvider {
  const fail = () => { if (env.VOICE_FAKE_FAIL === "1") throw new ProviderError("VOICE_BUSY"); };
  return {
    name: "fake",
    async transcribe() { fakeCalls.transcribe++; fail(); return env.VOICE_FAKE_TRANSCRIPT ?? FAKE_TRANSCRIPT; },
    async synthesize() { fakeCalls.synthesize++; fail(); return new Int16Array(Math.round(TTS_RATE * 0.25)); },
  };
}
