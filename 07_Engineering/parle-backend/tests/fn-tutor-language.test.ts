import { describe, it, expect, beforeAll } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { callFunction } from "./helpers/functions-env";
import { clearAiQueue, queueAiResponses } from "./helpers/ai-queue";
import { seedLocalContent } from "../scripts/seed-local-content";
import { onboardedLearner } from "./helpers/learners";

const AI = "parle-assessment-service";
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const queueLeft = async () => (await service().from("ai_test_queue").select("id")).data!.length;
const reply = (text: string) => JSON.stringify({
  reply: text, scenario: "", writing_prompt: "", corrected_text: "", feedback_summary: "", task_completion_feedback: "",
  grammar_feedback: "", vocabulary_feedback: "", optional_practice: "", corrections: [], practice_items: [], mini_test: [],
});
const FRENCH = "« Depuis » indique le point de départ d'une action qui continue. « Pendant » indique une durée complète et terminée. Exemple : J'habite ici depuis deux ans.";
const ARABIC = "نستخدم «depuis» لفعل بدأ في الماضي وما زال مستمرًا، ونستخدم «pendant» لمدة كاملة انتهت. مثال: J'habite ici depuis deux ans.";
const HINDI = "«depuis» का प्रयोग उस काम के लिए होता है जो अतीत में शुरू हुआ और अब भी जारी है; «pendant» पूरी हो चुकी अवधि के लिए है। उदाहरण: J'habite ici depuis deux ans.";
const QUESTION = "Quelle est la différence entre « depuis » et « pendant » ?";

beforeAll(async () => { await seedLocalContent(); });

async function learner(language: string | null) {
  const { t } = await onboardedLearner();
  if (language) await callFunction("parle-account-service", t, { action: "save_profile", time_zone: "America/Toronto", native_language: language, explain_in_native: true });
  return t;
}
async function openQuestion(t: string, opening: string) {
  await clearAiQueue();
  await queueAiResponses(reply(opening));
  const opened = await callFunction(AI, t, { action: "tutor_open_session", mode: "question" });
  expect(opened.status).toBe(200);
  return opened.body.session_id as string;
}
async function ask(t: string, session_id: string, ...replies: string[]) {
  await clearAiQueue();
  await queueAiResponses(...replies.map(reply));
  return callFunction(AI, t, { action: "tutor_send_message", session_id, text: QUESTION });
}

describe("tutor explanations in the learner's language (A29, R37)", () => {
  it("asks once more when an Arabic explanation comes back in French, and keeps the Arabic answer", async () => {
    const t = await learner("Arabic"), s = await openQuestion(t, ARABIC);
    const r = await ask(t, s, FRENCH, ARABIC);
    expect(r.status).toBe(200);
    expect(/[\u0600-\u06FF]/.test(r.body.reply)).toBe(true);
    expect(await queueLeft()).toBe(0);
  }, 60000);
  it("keeps the first reply when the second also misses (Review Focus 5)", async () => {
    const t = await learner("Arabic"), s = await openQuestion(t, ARABIC);
    const r = await ask(t, s, FRENCH, FRENCH);
    expect(r.status).toBe(200);
    expect(r.body.reply).toContain("Depuis");
    const failedRetry = await ask(t, s, FRENCH); // the second AI call fails (empty queue): still the first reply
    expect(failedRetry.status).toBe(200);
    expect(failedRetry.body.reply).toContain("Depuis");
  }, 60000);
  it("takes a Hindi explanation in Hindi at once", async () => {
    const t = await learner("Hindi"), s = await openQuestion(t, HINDI);
    const r = await ask(t, s, HINDI, FRENCH);
    expect(r.status).toBe(200);
    expect(/[\u0900-\u097F]/.test(r.body.reply)).toBe(true);
    expect(await queueLeft()).toBe(1);
  }, 60000);
  it("never asks again for a learner with French-first explanations", async () => {
    const t = await learner(null), s = await openQuestion(t, FRENCH);
    const r = await ask(t, s, FRENCH, ARABIC);
    expect(r.status).toBe(200);
    expect(await queueLeft()).toBe(1);
  }, 60000);
  it("asks once more for an opening that misses the language", async () => {
    const t = await learner("Arabic");
    await clearAiQueue();
    await queueAiResponses(reply(FRENCH), reply(ARABIC));
    const opened = await callFunction(AI, t, { action: "tutor_open_session", mode: "question" });
    expect(opened.status).toBe(200);
    expect(await queueLeft()).toBe(0);
  }, 60000);
});

describe("one charge per message (Plan 11: A46, Review Focus 5)", () => {
  const used = async (t: string) => (await callFunction(AI, t, { action: "tutor_get_plan_summary" })).body.summary.messages_used as number;
  it("a language repeat is not charged again", async () => {
    const t = await learner("Arabic"), s = await openQuestion(t, ARABIC);
    const before = await used(t);
    const r = await ask(t, s, FRENCH, FRENCH);
    expect(r.status).toBe(200);
    expect(r.body.reply).toContain("Depuis");
    expect(await used(t)).toBe(before + 1);
  }, 60000);
});
