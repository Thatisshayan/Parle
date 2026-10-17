import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { callFunction } from "./helpers/functions-env";
import { clearAiQueue, queueAiResponses } from "./helpers/ai-queue";
import { seedLocalContent } from "../scripts/seed-local-content";
import { onboardedLearner } from "./helpers/learners";
import { psql } from "./helpers/admin";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";

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

describe("one AI reply at a time per learner (Plan 12: R128)", () => {
  const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
  it("a reply claim is taken once, frees itself when stale, and only its own holder releases it (review Minor 3)", async () => {
    const { u } = await onboardedLearner();
    const a = psql(`select public.tutor_reply_claim('${u.id}', 150)`);
    expect(a).not.toBe("");
    expect(psql(`select public.tutor_reply_claim('${u.id}', 150)`)).toBe(""); // refused: null
    psql(`update public.tutor_reply_claim set claimed_until = now() - interval '1 second' where user_id = '${u.id}'`);
    const b = psql(`select public.tutor_reply_claim('${u.id}', 150)`);
    expect(b).not.toBe("");
    psql(`select public.tutor_reply_release('${u.id}', (select claimed_until from public.tutor_reply_claim where user_id = '${u.id}') - interval '1 hour')`); // a stale holder's token
    expect(psql(`select count(*) from public.tutor_reply_claim where user_id = '${u.id}'`)).toBe("1");
    psql(`select public.tutor_reply_release('${u.id}', '${b}')`);
    expect(psql(`select count(*) from public.tutor_reply_claim where user_id = '${u.id}'`)).toBe("0");
  });
  it("a send while another reply is being made is told to wait and runs no AI; after the claim goes it is answered", async () => {
    const { u, t } = await onboardedLearner();
    await callFunction("parle-plan-service", t, { action: "get_or_create_plan", options: {} });
    await clearAiQueue();
    await queueAiResponses(OPENING);
    const opened = await callFunction(FN, t, { action: "tutor_open_session", mode: "chat" });
    const sessionId = opened.body.session_id ?? opened.body.session?.id;
    await service().from("tutor_reply_claim").upsert({ user_id: u.id, claimed_until: new Date(Date.now() + 60_000).toISOString() });
    await queueAiResponses(OPENING);
    const busy = await callFunction(FN, t, { action: "tutor_send_message", session_id: sessionId, text: "Je travaille ici depuis trois ans." });
    expect([busy.status, busy.body.error_code]).toEqual([409, "REPLY_IN_PROGRESS"]);
    expect(psql("select count(*) from public.ai_test_queue")).toBe("1"); // no AI call was made
    await service().from("tutor_reply_claim").delete().eq("user_id", u.id);
    const ok = await callFunction(FN, t, { action: "tutor_send_message", session_id: sessionId, text: "Je travaille ici depuis trois ans." });
    expect(ok.status).toBe(200);
    expect(psql(`select count(*) from public.tutor_reply_claim where user_id = '${u.id}'`)).toBe("0"); // released after the reply
  }, 60000);
});
