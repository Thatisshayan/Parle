import { createClient } from "npm:@supabase/supabase-js@2";
import { takeRateLimit, clientIp } from "./rate-limit.ts";
import { buildyUserFromToken } from "./superdev-compat.ts";
import type { Guard } from "./serve.ts";

const db = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
export const limited = (code = "RATE_LIMITED") =>
  new Response(JSON.stringify({ error: code, error_code: code }), { status: 429, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
const actionOf = async (req: Request) => {
  try {
    const b = await req.json();
    return typeof b?.action === "string" ? b.action : "";
  } catch {
    return "";
  }
};

/** Public level check: 10 starts and 30 scores per address per hour (S29). */
export const publicLevelCheckLimit: Guard = async (req) => {
  const action = await actionOf(req);
  if (action !== "start" && action !== "score") return null;
  const ok = await takeRateLimit(db(), `levelcheck:${action}:${clientIp(req)}`, 3600, action === "start" ? 10 : 30);
  if (!ok) return limited();
  // A ceiling for everyone together, in case addresses can be varied (final review 1).
  if (action === "start" && !(await takeRateLimit(db(), "levelcheck:start:all", 3600, 1000))) return limited();
  return null;
};

/** AI-backed actions: 60 per account per 10 minutes (S10, S15); the per-day message limits stay in the services. */
export const AI_ACTIONS = new Set([
  "score_writing", "generate_practice_content", "learner_coach_note", "tutor_open_session", "tutor_send_message",
  "tutor_finish_session", "admin_generate_content_drafts", "audit_question_bank",
]);
export const aiActionLimit: Guard = async (req) => {
  const action = await actionOf(req);
  if (!AI_ACTIONS.has(action)) return null;
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const user = token ? await buildyUserFromToken(db(), token) : null;
  if (!user) return null; // the service answers 401 itself
  if (!(await takeRateLimit(db(), `ai:user:${user.id}`, 600, 60))) return limited();
  // A daily share per account, so no single account can use up the platform's global AI cap (final review 2).
  return (await takeRateLimit(db(), `ai:user:day:${user.id}`, 86_400, 150)) ? null : limited();
};

/** Scheduled jobs: only pg_cron (header x-cron-secret) may call. */
export const cronOnly: Guard = async (req) => {
  const sent = req.headers.get("x-cron-secret") ?? "", want = Deno.env.get("CRON_SECRET") ?? "";
  return want && sent.length === want.length && sent === want
    ? null
    : new Response(JSON.stringify({ error: "FORBIDDEN" }), { status: 401, headers: { "Content-Type": "application/json" } });
};
