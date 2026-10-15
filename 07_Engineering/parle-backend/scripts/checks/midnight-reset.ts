import { createClient } from "@supabase/supabase-js";
import { makeUser } from "../../tests/helpers/users";
import { LOCAL_URL, localKeys } from "../../tests/helpers/local";
import { callFunction } from "../../tests/helpers/functions-env";
import { clearAiQueue, queueAiResponses } from "../../tests/helpers/ai-queue";

/** B3 (D10), local: a learner whose zone is minutes before midnight uses messages, then the count is read after midnight. */
const reply = (text: string) => JSON.stringify({ reply: text, scenario: "", writing_prompt: "", corrected_text: "", feedback_summary: "", task_completion_feedback: "", grammar_feedback: "", vocabulary_feedback: "", optional_practice: "", practice_items: [], mini_test: [], corrections: [] });
const minutesToMidnight = (zone: string) => {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":").map(Number);
  return 24 * 60 - (h * 60 + m);
};
const pick = () => Intl.supportedValuesOf("timeZone").find((z) => { const left = minutesToMidnight(z); return left >= 3 && left <= 8; }) ?? null;
let zone = pick();
while (!zone) { console.log("no zone is 3 to 8 minutes before midnight yet; waiting a minute"); await Bun.sleep(60_000); zone = pick(); }

const u = await makeUser("learner");
const t = (await u.client.auth.getSession()).data.session!.access_token;
await callFunction("parle-account-service", t, { action: "ensure_identity", role: "learner", age_confirmed: true });
await callFunction("parle-account-service", t, { action: "save_profile", time_zone: zone });
await callFunction("parle-account-service", t, { action: "save_learner_profile", track: "general", goals: ["general"], main_goal: "general", self_assessed_level: "A2", native_language: "English", time_zone: zone });
await callFunction("parle-account-service", t, { action: "save_unverified_placement", self_assessed_level: "A2", track: "general" });
await clearAiQueue();
await queueAiResponses(reply("Bonjour !"), reply("Très bien."), reply("Super."), reply("D'accord."), reply("Merci."));
const open = await callFunction("parle-assessment-service", t, { action: "tutor_open_session", mode: "chat" });
for (const text of ["Bonjour.", "Je vais bien."]) await callFunction("parle-assessment-service", t, { action: "tutor_send_message", session_id: open.body.session_id, text });
const used = async () => (await callFunction("parle-assessment-service", t, { action: "tutor_get_plan_summary" })).body.summary.messages_used;
const before = await used();
const wait = minutesToMidnight(zone);
console.log(`B3 zone ${zone}: ${before} used, ${wait} minutes before local midnight; waiting`);
await Bun.sleep((wait * 60 + 90) * 1000);
const after = await used();
const db = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const { data } = await db.from("usage_counter").select("period_key, ai_messages").eq("user_id", u.id);
console.log(`B3 zone ${zone}: before midnight ${before} used, after midnight ${after} used; counter rows ${JSON.stringify(data)}`);
await clearAiQueue();
