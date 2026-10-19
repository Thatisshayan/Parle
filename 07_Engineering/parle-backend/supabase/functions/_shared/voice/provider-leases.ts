import { providerConcurrencyLimit } from "../provider-concurrency.ts";
import { VoiceError, type VoiceContext } from "./context.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function providerLeaseAcquire(ctx: VoiceContext): Promise<Record<string, unknown>> {
  if (!ctx.relay) throw new VoiceError("RELAY_ONLY", 403, "Only the voice relay may do this.");
  const role = ctx.body.role;
  if (role !== "speech_stt" && role !== "speech_tts") throw new VoiceError("INVALID_INPUT", 400);
  const env = role === "speech_stt" ? "VOICE_STT_MAX_CONCURRENT" : "VOICE_TTS_MAX_CONCURRENT";
  const { data, error } = await ctx.db.rpc("acquire_provider_lease", {
    p_role: role, p_max_active: providerConcurrencyLimit(Deno.env.get(env), 2), p_lease_seconds: 90,
  });
  if (error) throw new Error("provider capacity check failed");
  if (typeof data !== "string") throw new VoiceError("VOICE_BUSY", 503, "Voice is busy. Try again in a moment.");
  return { lease_id: data };
}

export async function providerLeaseRelease(ctx: VoiceContext): Promise<Record<string, unknown>> {
  if (!ctx.relay) throw new VoiceError("RELAY_ONLY", 403, "Only the voice relay may do this.");
  const id = ctx.body.lease_id;
  if (typeof id !== "string" || !UUID.test(id)) throw new VoiceError("INVALID_INPUT", 400);
  const { error } = await ctx.db.rpc("release_provider_lease", { p_id: id });
  if (error) throw new Error("provider capacity release failed");
  return { released: true };
}
