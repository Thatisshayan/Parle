import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { callFunction } from "./helpers/functions-env";
import { clearAiQueue, queueAiResponses } from "./helpers/ai-queue";
import { seedLocalContent } from "../scripts/seed-local-content";
import { onboardedLearner } from "./helpers/learners";

const FN = "parle-assessment-service";
const OPENING = JSON.stringify({
  reply: "Bonjour ! De quoi veux-tu parler aujourd'hui ?", scenario: "", writing_prompt: "", corrected_text: "",
  feedback_summary: "", task_completion_feedback: "", grammar_feedback: "", vocabulary_feedback: "", optional_practice: "",
  practice_items: [], mini_test: [], corrections: [],
});
beforeAll(async () => { await seedLocalContent(); });
beforeEach(async () => { await clearAiQueue(); });

describe("AI tutor charges", () => {
  it("a message whose AI reply fails is not counted (final review 4)", async () => {
    const { t } = await onboardedLearner();
    await callFunction("parle-plan-service", t, { action: "get_or_create_plan", options: {} });
    await clearAiQueue();
    await queueAiResponses(OPENING);
    const opened = await callFunction(FN, t, { action: "tutor_open_session", mode: "chat" });
    expect(opened.status).toBe(200);
    const sessionId = opened.body.session_id ?? opened.body.session?.id;
    expect(typeof sessionId).toBe("string");
    const before = (await callFunction(FN, t, { action: "tutor_get_plan_summary" })).body.summary.messages_used;
    await queueAiResponses("garbage", "still garbage");
    const sent = await callFunction(FN, t, { action: "tutor_send_message", session_id: sessionId, text: "Je travaille ici pendant trois ans." });
    expect(sent.status).toBeGreaterThanOrEqual(500);
    const after = (await callFunction(FN, t, { action: "tutor_get_plan_summary" })).body.summary.messages_used;
    expect(after).toBe(before);
  }, 30000);
});
