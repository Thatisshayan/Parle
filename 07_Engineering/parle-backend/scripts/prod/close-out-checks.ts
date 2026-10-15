import { createClient } from "@supabase/supabase-js";
import { PROD_REF, api } from "./management";
import { waitForMail } from "../buildy/agentmail";
import * as auth from "../../../parle-app/src/lib/backend/auth";

/**
 * Plan 5 group B checks on production (B1, B4 explanations, B5 refusals, B7). Each run signs up fresh AgentMail
 * learners, prints outcomes only (never passwords, codes or tokens) and deletes every account it made.
 * usage: bun scripts/prod/close-out-checks.ts <first-today|explanations|tutor-a1|admin-refusals>
 */
const url = `https://${PROD_REF}.supabase.co`;
const keys = (await api(`/v1/projects/${PROD_REF}/api-keys`)) as Array<{ name: string; api_key: string }>;
const anonKey = keys.find((k) => k.name === "anon")?.api_key;
if (!anonKey) throw new Error("anon key not returned");

type Learner = { email: string; password: string; token: string };
async function fn(name: string, token: string, body: Record<string, unknown>) {
  const r = await fetch(`${url}/functions/v1/${name}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, apikey: anonKey!, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
}

async function newLearner(tag: string, level: "A1" | "A2" | "B2", nativeLanguage = "English", explainInNative = false): Promise<Learner> {
  const email = `obsidianteamhq+p5${tag}${Date.now().toString(36)}@agentmail.to`;
  const password = `Close-out-${crypto.randomUUID().slice(0, 8)}1`;
  const c = createClient(url, anonKey!, { auth: { persistSession: false } });
  const since = new Date(Date.now() - 5000).toISOString();
  await auth.signUpWithCode(c, "Close Out", email, password);
  const code = (await waitForMail(email, since))?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`no verification code for ${tag}`);
  await auth.verifySignupCode(c, email, code, password, "Close Out");
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

async function remove(l: Learner) {
  const r = await fn("parle-account-service", l.token, { action: "delete_account", password: l.password, confirm: "DELETE" });
  console.log(`deleted the check learner: ${r.status}`);
}

async function chat(l: Learner, mode: string, texts: string[]): Promise<string[]> {
  const open = await fn("parle-assessment-service", l.token, { action: "tutor_open_session", mode });
  if (open.status !== 200) return [`open failed ${open.status}`];
  const replies: string[] = [];
  for (const text of texts) {
    const r = await fn("parle-assessment-service", l.token, { action: "tutor_send_message", session_id: open.body.session_id, text });
    replies.push(typeof r.body.reply === "string" ? r.body.reply : `reply failed ${r.status}`);
  }
  return replies;
}

const englishLines = (reply: string) => reply.split(/\n+/).filter((line) => /\b(the|and|you|is|are|this|that|with|your|in english)\b/i.test(line)).length;

const checks: Record<string, () => Promise<void>> = {
  "first-today": async () => {
    const l = await newLearner("b1", "A2");
    try {
      const t0 = Date.now();
      const r = await fn("parle-plan-service", l.token, { action: "get_or_create_plan", options: { includeTaskHistory: true } });
      const tasks: any[] = r.body.result?.tasks ?? [];
      const sources: Record<string, number> = {};
      for (const task of tasks) sources[task.contentSource ?? "none"] = (sources[task.contentSource ?? "none"] ?? 0) + 1;
      console.log(`B1 first Today: ${r.status} in ${((Date.now() - t0) / 1000).toFixed(1)} s; ${tasks.length} tasks; content ${JSON.stringify(sources)}`);
      const t1 = Date.now();
      await fn("parle-plan-service", l.token, { action: "get_or_create_plan", options: { includeTaskHistory: true } });
      console.log(`B1 second open: ${((Date.now() - t1) / 1000).toFixed(1)} s`);
    } finally { await remove(l); }
  },
  "tutor-a1": async () => {
    const l = await newLearner("b7", "A1");
    try {
      const replies = await chat(l, "chat", ["Bonjour ! Je m'appelle Sam. J'habite à Toronto.", "Je travaille dans un bureau. Et toi ?", "Comment on dit « I am tired » en français ?"]);
      replies.forEach((reply, i) => console.log(`B7 reply ${i + 1} (${englishLines(reply)} English lines):\n${reply}\n---`));
    } finally { await remove(l); }
  },
  explanations: async () => {
    const question = ["Quelle est la différence entre « depuis » et « pendant » ?"];
    for (const [tag, level, language, native] of [["b4a2", "A2", "English", false], ["b4b2", "B2", "English", false], ["b4ar", "A2", "Arabic", true], ["b4es", "A2", "Spanish", true], ["b4hi", "A2", "Hindi", true]] as const) {
      const l = await newLearner(tag, level, language, native);
      try {
        const [reply] = await chat(l, "question", question);
        const script = language === "Arabic" ? /[؀-ۿ]/.test(reply) : language === "Hindi" ? /[ऀ-ॿ]/.test(reply) : language === "Spanish" ? /\b(que|para|con|es|el|la)\b/i.test(reply) : true;
        console.log(`B4 ${level} ${language}: ${reply.length} chars, ${englishLines(reply)} English lines, expected language present: ${script}\n${reply}\n---`);
      } finally { await remove(l); }
    }
  },
  "admin-refusals": async () => {
    const l = await newLearner("b5", "A2");
    try {
      for (const [name, action] of [
        ["parle-assessment-service", "audit_question_bank"], ["parle-assessment-service", "admin_generate_content_drafts"],
        ["parle-marketplace-service", "admin_get_demo_bank"], ["parle-marketplace-service", "admin_update_demo_bank_content"],
        ["parle-marketplace-service", "admin_content_coverage"], ["parle-marketplace-service", "admin_get_content_item"],
        ["parle-marketplace-service", "admin_save_content_item"],
      ]) console.log(`B5 ${action} as a learner: ${(await fn(name, l.token, { action })).status}`);
    } finally { await remove(l); }
  },
};

const which = process.argv[2] ?? "";
if (!checks[which]) throw new Error(`usage: bun scripts/prod/close-out-checks.ts <${Object.keys(checks).join("|")}>`);
await checks[which]();
