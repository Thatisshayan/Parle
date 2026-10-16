import { createClient } from "@supabase/supabase-js";
import { PROD_REF, api } from "./management";
import { waitForMail } from "../buildy/agentmail";
import * as auth from "../../../parle-app/src/lib/backend/auth";

/**
 * Production check learners on AgentMail aliases (`obsidianteamhq+p6...`), shared by the Plan 6 checks (bun and Node).
 * Prints outcomes only, never passwords, codes or tokens. Every caller deletes its learner with removeLearner.
 */
export const PROD_URL = `https://${PROD_REF}.supabase.co`;
let anon: string | null = null;
export async function anonKey(): Promise<string> {
  if (anon) return anon;
  const keys = (await api(`/v1/projects/${PROD_REF}/api-keys`)) as Array<{ name: string; api_key: string }>;
  anon = keys.find((k) => k.name === "anon")?.api_key ?? null;
  if (!anon) throw new Error("anon key not returned");
  return anon;
}

export type Learner = { email: string; password: string; token: string };

export async function fn(name: string, token: string, body: Record<string, unknown>) {
  const r = await fetch(`${PROD_URL}/functions/v1/${name}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, apikey: await anonKey(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
}

export async function newLearner(tag: string, level: "A1" | "A2" | "B2", nativeLanguage = "English", explainInNative = false, prefix = "p6"): Promise<Learner> {
  const email = `obsidianteamhq+${prefix}${tag}${Date.now().toString(36)}@agentmail.to`;
  const password = `Plan-six-${crypto.randomUUID().slice(0, 8)}1`;
  const c = createClient(PROD_URL, await anonKey(), { auth: { persistSession: false } });
  const since = new Date(Date.now() - 5000).toISOString();
  await auth.signUpWithCode(c, "Plan Six", email, password);
  const code = (await waitForMail(email, since))?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`no verification code for ${tag}`);
  await auth.verifySignupCode(c, email, code, password, "Plan Six");
  const token = (await c.auth.getSession()).data.session!.access_token;
  const zone = "America/Toronto";
  for (const body of [
    { action: "ensure_identity", role: "learner", age_confirmed: true },
    { action: "save_profile", time_zone: zone, native_language: nativeLanguage, explain_in_native: explainInNative },
    { action: "save_learner_profile", goals: ["canada_immigration"], main_goal: "canada_immigration", other_goal_text: "", track: "immigration", target_per_skill: JSON.stringify({ L: "NCLC 7", R: "NCLC 7", W: "NCLC 7", S: "NCLC 7" }), target_date: "", no_deadline: true, test_booked: false, test_booked_date: "", availability: JSON.stringify({ monday: 30, wednesday: 30, friday: 30 }), tutor_windows: [], tutor_budget_band: "unspecified", self_assessed_level: level, native_language: nativeLanguage, time_zone: zone },
    { action: "save_unverified_placement", self_assessed_level: level, track: "immigration" },
  ]) {
    const r = await fn("parle-account-service", token, body);
    if (r.status !== 200) throw new Error(`${body.action}: ${r.status} ${r.body.error_code ?? ""}`);
  }
  console.log(`${tag}: learner ready (${level}, ${nativeLanguage}${explainInNative ? ", explanations in that language" : ""})`);
  return { email, password, token };
}

export async function removeLearner(l: Learner) {
  const r = await fn("parle-account-service", l.token, { action: "delete_account", password: l.password, confirm: "DELETE" });
  console.log(`deleted the check learner: ${r.status}`);
}

export async function chat(l: Learner, mode: string, texts: string[]): Promise<string[]> {
  const open = await fn("parle-assessment-service", l.token, { action: "tutor_open_session", mode });
  if (open.status !== 200) return [`open failed ${open.status}`];
  const replies: string[] = [];
  for (const text of texts) {
    const r = await fn("parle-assessment-service", l.token, { action: "tutor_send_message", session_id: open.body.session_id, text });
    replies.push(typeof r.body.reply === "string" ? r.body.reply : `reply failed ${r.status}`);
  }
  return replies;
}
