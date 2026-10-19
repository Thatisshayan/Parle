import type { Env } from "./provider.js";

export type BackendAnswer = { status: number; body: Record<string, unknown> };
export type Backend = (action: string, body: Record<string, unknown>) => Promise<BackendAnswer>;

/** parle-voice-service, called with the learner's own token and the relay's shared secret. */
export function backendFor(env: Env, token: string): Backend {
  const url = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? "";
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  const secret = env.VOICE_RELAY_SECRET ?? "";
  return async (action, body) => {
    if (!url || !secret) return { status: 503, body: { error: "VOICE_NOT_CONFIGURED", error_code: "VOICE_NOT_CONFIGURED" } };
    const r = await fetch(`${url}/functions/v1/parle-voice-service`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${token}`, "x-voice-secret": secret },
      body: JSON.stringify({ action, ...body }),
    }).catch(() => null);
    if (!r) return { status: 503, body: { error: "VOICE_BUSY", error_code: "VOICE_BUSY", message: "Voice is busy. Try again in a moment." } };
    const parsedBody: unknown = await r.json().catch(() => ({}));
    return { status: r.status, body: parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody) ? parsedBody as Record<string, unknown> : {} };
  };
}
