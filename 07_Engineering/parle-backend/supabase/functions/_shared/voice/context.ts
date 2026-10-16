import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Caller } from "../caller.ts";
import { APP_SETTING_DEFAULTS, APP_SETTING_RULES, type AppSettingKey } from "../../_app/functions/parle-admin-settings.helper.ts";

export type VoiceKind = "answer" | "message" | "reply" | "placement";
export type Plan = "free" | "premium";
/** relay: the request carried the relay's shared secret (only the relay may take units and save transcripts). */
export type VoiceContext = { db: SupabaseClient; caller: Caller; body: Record<string, any>; now: Date; relay: boolean };

/** A refusal the app or the relay can act on: a code, an HTTP status, a plain message and details (limit, plan). */
export class VoiceError extends Error {
  code: string;
  status: number;
  extra: Record<string, unknown>;
  constructor(code: string, status: number, message = code, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = "VoiceError";
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

/** Placement speaking is never counted (spec 6) but a run may record at most this many times (ruling 6). */
export const PLACEMENT_ATTEMPTS = 6;
/** A 3-minute answer is sent in parts of at most 60 seconds (ruling 2). */
export const MAX_PARTS = 4;

const LIMIT_KEYS: Record<"answer" | "message" | "reply", readonly [AppSettingKey, AppSettingKey]> = {
  answer: ["free_voice_answers_per_day", "premium_voice_answers_per_day"],
  message: ["free_voice_messages_per_day", "premium_voice_messages_per_day"],
  reply: ["free_voice_replies_per_day", "premium_voice_replies_per_day"],
};

/** The administrator's limits (newest saved row per key), or the defaults; Premium is never below Free. */
export async function voiceLimits(db: SupabaseClient): Promise<Record<"answer" | "message" | "reply", { free: number; premium: number }>> {
  const keys = Object.values(LIMIT_KEYS).flat();
  const { data, error } = await db.from("app_setting").select("key, value, updated_at").in("key", keys).order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  const read = (key: AppSettingKey): number => {
    const row = (data ?? []).find((r: { key: string }) => r.key === key);
    let value: unknown = row?.value;
    try { value = typeof value === "string" ? JSON.parse(value) : value; } catch { value = undefined; }
    const rule = APP_SETTING_RULES[key];
    return typeof value === "number" && Number.isInteger(value) && value >= Number(rule.min) && value <= Number(rule.max) ? value : Number(APP_SETTING_DEFAULTS[key]);
  };
  const out = {} as Record<"answer" | "message" | "reply", { free: number; premium: number }>;
  for (const [kind, [free, premium]] of Object.entries(LIMIT_KEYS) as Array<["answer" | "message" | "reply", readonly [AppSettingKey, AppSettingKey]]>) {
    const f = read(free);
    out[kind] = { free: f, premium: Math.max(f, read(premium)) };
  }
  return out;
}

/** Premium the way the admin user detail reads it (Plan 8, ruling 8): a live Stripe subscription or the comp flag. */
export async function planOf(db: SupabaseClient, userId: string): Promise<Plan> {
  const [subs, identity] = await Promise.all([
    db.from("Subscriber").select("stripe_status").eq("user_id", userId).limit(5),
    db.from("ParleIdentity").select("premium_comp_active").eq("owner_id", userId).limit(1),
  ]);
  if (subs.error) throw new Error(subs.error.message);
  if (identity.error) throw new Error(identity.error.message);
  const paid = (subs.data ?? []).some((s: { stripe_status?: unknown }) => ["active", "trialing", "past_due"].includes(String(s.stripe_status)));
  return paid || identity.data?.[0]?.premium_comp_active === true ? "premium" : "free";
}

function validZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone.trim()) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: zone.trim() }); return true; } catch { return false; }
}

/** The learner's day, in the time zone the AI tutor uses: Parle profile, then learner profile, then UTC (ruling 9). */
export async function learnerDay(db: SupabaseClient, userId: string, now: Date): Promise<{ day: string; zone: string }> {
  const [parle, learner] = await Promise.all([
    db.from("ParleProfile").select("time_zone").eq("owner_id", userId).order("created_at", { ascending: false }).limit(1),
    db.from("learner_profile").select("time_zone").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1),
  ]);
  const zone = [parle.data?.[0]?.time_zone, learner.data?.[0]?.time_zone].find(validZone)?.trim() ?? "UTC";
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return { day, zone };
}

/** Corrections and tips are written in the learner's explanation language (spec 4.2), else English. */
export async function explanationLanguage(db: SupabaseClient, userId: string): Promise<string> {
  const { data } = await db.from("ParleProfile").select("native_language, explain_in_native").eq("owner_id", userId).order("created_at", { ascending: false }).limit(1);
  const p = data?.[0];
  return p?.explain_in_native === true && typeof p.native_language === "string" && p.native_language.trim() ? p.native_language.trim().slice(0, 60) : "English";
}
