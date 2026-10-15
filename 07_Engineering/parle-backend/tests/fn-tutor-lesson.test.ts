import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { callFunction } from "./helpers/functions-env";
import { clearAiQueue, queueAiResponses } from "./helpers/ai-queue";
import { seedLocalContent } from "../scripts/seed-local-content";
import { onboardedLearner } from "./helpers/learners";

const item = (id: string, prompt: string, right: string, wrong: string) => ({
  id, prompt, area: "grammar", example_sentence: prompt.replace("___", right), language_point: "passé composé avec avoir", theme: "work",
  options: [{ id: "a", text: right }, { id: "b", text: wrong }], answer_option_id: "a", explanation: "On utilise avoir ici.",
});
const lesson = (practice: unknown[], test: unknown[]) => JSON.stringify({
  reply: "Aujourd'hui, on révise le passé composé.", scenario: "", writing_prompt: "", corrected_text: "", feedback_summary: "",
  task_completion_feedback: "", grammar_feedback: "", vocabulary_feedback: "", optional_practice: "", corrections: [],
  practice_items: practice, mini_test: test,
});
const GOOD_TEST = [item("m1", "Elle ___ acheté du pain.", "a", "est"), item("m2", "Ils ___ regardé le film.", "ont", "sont"), item("m3", "Vous ___ répondu.", "avez", "êtes")];
const PRACTICE = [
  item("p1", "Hier, j'___ mangé au restaurant.", "ai", "suis"),
  item("p2", "Nous ___ fini le travail.", "avons", "sommes"),
  item("p3", "Tu ___ parlé au client.", "as", "es"),
  item("p4", "Hier, je ___ avec mon patron.", "j'ai parlé", "parlé"),
];

beforeAll(async () => { await seedLocalContent(); });
beforeEach(async () => { await clearAiQueue(); });

async function openLesson(reply: string) {
  const { t } = await onboardedLearner();
  await callFunction("parle-plan-service", t, { action: "get_or_create_plan", options: {} });
  await clearAiQueue();
  await queueAiResponses(reply);
  return callFunction("parle-assessment-service", t, { action: "tutor_open_session", mode: "lesson" });
}

describe("AI lesson items (A21, D25 b)", () => {
  it("drops a practice item whose stem already holds the answer's subject", async () => {
    const opened = await openLesson(lesson(PRACTICE, GOOD_TEST));
    expect(opened.status).toBe(200);
    const prompts = opened.body.lesson.practice_items.map((p: any) => p.prompt);
    expect(prompts).not.toContain("Hier, je ___ avec mon patron.");
    expect(prompts.length).toBe(3);
  }, 60000);
  it("refuses a lesson whose mini-test has such an item (the learner opens it again)", async () => {
    const opened = await openLesson(lesson(PRACTICE.slice(0, 3), [...GOOD_TEST.slice(0, 2), item("m4", "Je ___ au bureau.", "je suis allé", "allé")]));
    expect(opened.status).toBe(502);
  }, 60000);
});
