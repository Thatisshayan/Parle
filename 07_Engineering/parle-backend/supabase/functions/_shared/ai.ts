import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { validateJson } from "./json-schema.ts";
import { takeRateLimit } from "./rate-limit.ts";

export { validateJson };
export type AiMode = "fast" | "standard";
export type AiRequest = { prompt: string; schema?: Record<string, unknown>; mode?: AiMode };
export class AiError extends Error { code: string; constructor(code: string) { super(code); this.code = code; this.name = "AiError"; } }

const DEFAULTS = { standard: "moonshotai/kimi-k3", fast: "moonshotai/kimi-k3", cap: 2000 };
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

/** Model per mode and the global daily cap, from app_setting (values are JSON strings, as Buildy stored them). */
export async function aiSettings(db: SupabaseClient) {
  const { data } = await db.from("app_setting").select("key, value").in("key", ["ai_model_standard", "ai_model_fast", "ai_global_daily_cap"]);
  const read = (k: string) => { const row = (data ?? []).find((r: any) => r.key === k); try { return row ? JSON.parse(row.value) : undefined; } catch { return row?.value; } };
  const str = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v.trim() : d);
  const num = (v: unknown, d: number) => (typeof v === "number" && v > 0 ? v : d);
  return { models: { standard: str(read("ai_model_standard"), DEFAULTS.standard), fast: str(read("ai_model_fast"), DEFAULTS.fast) }, cap: num(read("ai_global_daily_cap"), DEFAULTS.cap) };
}

export function extractJson(text: string): unknown | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  for (const [open, close] of [["{", "}"], ["[", "]"]]) {
    const a = cleaned.indexOf(open), b = cleaned.lastIndexOf(close);
    if (a >= 0 && b > a) { try { return JSON.parse(cleaned.slice(a, b + 1)); } catch { /* try the next shape */ } }
  }
  return null;
}

async function nvidia(model: string, system: string, prompt: string): Promise<string> {
  const key = Deno.env.get("NVIDIA_API_KEY");
  if (!key) throw new AiError("AI_NOT_CONFIGURED");
  const r = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }], temperature: 0.3, max_tokens: 4096 }),
    signal: AbortSignal.timeout(120_000),
  }).catch(() => null);
  if (!r?.ok) { console.warn("NVIDIA call failed", { model, status: r?.status ?? "network" }); throw new AiError("AI_UNAVAILABLE"); }
  const body = await r.json();
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new AiError("AI_UNAVAILABLE");
  return text;
}

async function fake(db: SupabaseClient): Promise<string> {
  const { data, error } = await db.rpc("pop_ai_test_response");
  if (error || typeof data !== "string") throw new AiError("AI_UNAVAILABLE");
  return data;
}

/**
 * One AI completion (replaces Buildy's invokeLLM). With a schema, the reply must be JSON matching it; one retry
 * after an invalid reply (spec section 7, D25b). Every call counts toward the global daily cap.
 */
export async function completeJson(db: SupabaseClient, req: AiRequest, opts: { capKey?: string; cap?: number } = {}): Promise<unknown> {
  const settings = await aiSettings(db);
  if (!(await takeRateLimit(db, opts.capKey ?? "ai:global", 86_400, opts.cap ?? settings.cap))) throw new AiError("AI_DAILY_CAP_REACHED");
  const model = settings.models[req.mode ?? "standard"];
  const system = req.schema
    ? `Reply with exactly one JSON value that matches this JSON schema, and nothing else:\n${JSON.stringify(req.schema)}`
    : "You are Parle's French tutor. Reply in plain text.";
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = Deno.env.get("AI_PROVIDER") === "fake" ? await fake(db) : await nvidia(model, system, req.prompt);
    if (!req.schema) return text;
    const value = extractJson(text);
    const problems = value === null ? ["not JSON"] : validateJson(value, req.schema);
    if (!problems.length) return value;
    console.warn("AI reply failed its schema check", { attempt, model, problems: problems.slice(0, 5) });
  }
  throw new AiError("AI_OUTPUT_INVALID");
}
