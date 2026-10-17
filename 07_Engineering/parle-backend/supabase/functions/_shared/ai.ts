import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { validateJson } from "./json-schema.ts";
import { takeRateLimit } from "./rate-limit.ts";
import { chatNvidia, chatOpenRouter, ProviderCallError, routeModel } from "./ai-provider.ts";

export { validateJson };
export type AiMode = "fast" | "standard";
/** `signal`: the caller may stop the call (Plan 11, A29: a language repeat whose time is up). */
export type AiRequest = { prompt: string; schema?: Record<string, unknown>; mode?: AiMode; signal?: AbortSignal };
export class AiError extends Error { code: string; constructor(code: string) { super(code); this.code = code; this.name = "AiError"; } }

const DEFAULTS = { standard: "openrouter:openai/gpt-6-luna", fast: "openrouter:openai/gpt-6-luna", cap: 2000 }; // decision #59

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

/**
 * How long one AI call may take. Background ("fast") work such as practice content falls back to the approved bank
 * when the model is slow (decision #49). Practice now runs one card per request after Today is shown (Plan 6 A28), so
 * it gets 40 s instead of 20 s (A39): enough for the model most of the time, well inside the function time limit.
 */
export function aiTimeoutMs(mode: AiMode): number {
  const raw = Number(Deno.env.get(mode === "fast" ? "AI_TIMEOUT_FAST_MS" : "AI_TIMEOUT_STANDARD_MS"));
  // A40: tutor replies take 9 to 15 s on GPT-6 Luna; 45 s plus the 40 s fast fallback stays inside the 150 s worker limit
  return Number.isFinite(raw) && raw > 0 ? raw : mode === "fast" ? 40_000 : 45_000;
}

/** One provider call (Plan 10): OpenRouter for `openrouter:<id>`, NVIDIA otherwise (local comparison only). */
export async function providerCall(model: string, system: string, prompt: string, json: boolean, signal: AbortSignal): Promise<string> {
  const route = routeModel(model);
  if (route.provider === "nvidia" && Deno.env.get("AI_PROVIDER") === "live") {
    // production: NVIDIA's trial terms forbid it, so a setting without the prefix is a mistake, never a fallback
    console.warn("AI model setting has no openrouter: prefix", { model: route.model });
    throw new AiError("AI_NOT_CONFIGURED");
  }
  const key =Deno.env.get(route.provider === "openrouter" ? "OPENROUTER_API_KEY" : "NVIDIA_API_KEY");
  if (!key) throw new AiError("AI_NOT_CONFIGURED");
  try {
    const c = { model: route.model, system, prompt, json, signal };
    return route.provider === "openrouter" ? await chatOpenRouter(key, c) : await chatNvidia(key, c);
  } catch (e) {
    // provider, model and status only: an error body can repeat the learner's words
    console.warn("AI call failed", { provider: route.provider, model: route.model, status: e instanceof ProviderCallError ? e.status : "network" });
    throw new AiError("AI_UNAVAILABLE");
  }
}

async function fake(db: SupabaseClient, signal: AbortSignal): Promise<string> {
  const delay = Number(Deno.env.get("AI_FAKE_DELAY_MS") ?? 0);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  if (signal.aborted) throw new AiError("AI_UNAVAILABLE"); // a late reply is not taken from the queue
  const { data, error } = await db.rpc("pop_ai_test_response");
  if (error || typeof data !== "string") throw new AiError("AI_UNAVAILABLE");
  return data;
}

/**
 * One AI completion (replaces Buildy's invokeLLM). With a schema, the reply must be JSON matching it; one retry
 * after an invalid reply (spec section 7, D25b) if at least 40% of the call's time budget is left. The budget covers
 * both attempts, so a call never outlasts the function time limit (final review 3). Each attempt counts toward the
 * global daily cap.
 */
export async function completeJson(db: SupabaseClient, req: AiRequest, opts: { capKey?: string; cap?: number } = {}): Promise<unknown> {
  const settings = await aiSettings(db);
  const takeCap = async () => {
    if (!(await takeRateLimit(db, opts.capKey ?? "ai:global", 86_400, opts.cap ?? settings.cap))) throw new AiError("AI_DAILY_CAP_REACHED");
  };
  await takeCap();
  const model = settings.models[req.mode ?? "standard"];
  const system = req.schema
    ? `Reply with exactly one JSON value that matches this JSON schema, and nothing else:\n${JSON.stringify(req.schema)}`
    : "You are Parle's French tutor. Reply in plain text.";
  const mode = req.mode ?? "standard";
  const budget = aiTimeoutMs(mode);
  const started = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = budget - (Date.now() - started);
    if (attempt > 0) {
      if (remaining < budget * 0.4) break; // not enough time left for a useful retry
      await takeCap();
    }
    const controller = new AbortController();
    if (req.signal?.aborted) controller.abort();
    req.signal?.addEventListener("abort", () => controller.abort(), { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new AiError("AI_UNAVAILABLE")); }, remaining);
    });
    let text: string;
    try {
      const call = Deno.env.get("AI_PROVIDER") === "fake" ? fake(db, controller.signal) : providerCall(model, system, req.prompt, Boolean(req.schema), controller.signal);
      text = await Promise.race([call, timedOut]);
    } catch (e) {
      if (controller.signal.aborted) console.warn("AI call took too long", { model, mode, limitMs: budget });
      throw e;
    } finally {
      clearTimeout(timer);
    }
    if (!req.schema) return text;
    const value = extractJson(text);
    const problems = value === null ? ["not JSON"] : validateJson(value, req.schema);
    if (!problems.length) return value;
    console.warn("AI reply failed its schema check", { attempt, model, problems: problems.slice(0, 5) });
  }
  throw new AiError("AI_OUTPUT_INVALID");
}
