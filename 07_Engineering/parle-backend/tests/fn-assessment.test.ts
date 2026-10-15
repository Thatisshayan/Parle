import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { callFunction, functionsEnv } from "./helpers/functions-env";
import { queueAiResponses, clearAiQueue } from "./helpers/ai-queue";
import { seedLocalContent } from "../scripts/seed-local-content";

const FN = "parle-assessment-service";
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const tokenOf = async (u: Awaited<ReturnType<typeof makeUser>>) => (await u.client.auth.getSession()).data.session!.access_token;
async function learnerWithProfile() {
  const u = await makeUser("learner"), t = await tokenOf(u);
  await callFunction("parle-account-service", t, { action: "ensure_identity", role: "learner", age_confirmed: true });
  await callFunction("parle-account-service", t, { action: "save_profile", time_zone: "America/Toronto" });
  await callFunction("parle-account-service", t, { action: "save_learner_profile", track: "immigration", goals: ["immigration"], main_goal: "immigration", self_assessed_level: "A2", native_language: "English", time_zone: "America/Toronto" });
  return { u, t };
}
beforeAll(async () => { await seedLocalContent(); });
beforeEach(async () => { await clearAiQueue(); });

describe("parle-assessment-service", () => {
  it("refuses callers without a valid token", async () => {
    expect((await callFunction(FN, null, { action: "learner_coach_note" })).status).toBe(401);
    expect((await callFunction(FN, "not-a-token", { action: "learner_coach_note" })).status).toBe(401);
  });
  it("refuses administrator-only actions to a learner", async () => {
    const { t } = await learnerWithProfile();
    expect((await callFunction(FN, t, { action: "admin_generate_content_drafts" })).status).toBe(403);
  }, 20000);
  it("reports the daily AI messages from the server's daily total row", async () => {
    const { u, t } = await learnerWithProfile();
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
    await service().from("usage_counter").insert({ owner_id: u.id, created_by: u.email, user_id: u.id, period: "day", period_key: day, ai_messages: 3, source_session_id: "daily-total" });
    const r = await callFunction(FN, t, { action: "tutor_get_plan_summary" });
    expect(r.status).toBe(200);
    expect(r.body.summary.messages_used).toBe(3);
    expect(r.body.summary.messages_limit).toBe(10);
  });
  it("a learner without a study plan gets the saved fallback note, not an AI guess", async () => {
    const { t } = await learnerWithProfile();
    await queueAiResponses('{"note":"should not be used"}');
    const r = await callFunction(FN, t, { action: "learner_coach_note" });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("fallback");
    const { data } = await service().from("ai_test_queue").select("id");
    expect(data!.length).toBe(1); // the AI was not called
  });
  it("limits AI actions to 60 per account per 10 minutes", async () => {
    const { u, t } = await learnerWithProfile();
    for (let i = 0; i < 60; i++) await service().rpc("take_rate_limit", { p_key: `ai:user:${u.id}`, p_window_seconds: 600, p_max: 60 });
    expect((await callFunction(FN, t, { action: "learner_coach_note" })).status).toBe(429);
  });
  it("one account cannot use more than its daily share of AI (final review 2)", async () => {
    const { u, t } = await learnerWithProfile();
    for (let i = 0; i < 150; i++) await service().rpc("take_rate_limit", { p_key: `ai:user:day:${u.id}`, p_window_seconds: 86400, p_max: 150 });
    expect((await callFunction(FN, t, { action: "learner_coach_note" })).status).toBe(429);
  });
  it.skipIf(!functionsEnv().STRIPE_SECRET_KEY)("opens a Stripe sandbox checkout for a learner", async () => {
    const { t } = await learnerWithProfile();
    const r = await callFunction(FN, t, { action: "billing_checkout", plan: "premium_monthly" }, { Origin: "http://127.0.0.1:5173" });
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).toContain("https://checkout.stripe.com/");
  });
  it("refuses the question-bank audit to a learner (B5, D21)", async () => {
    const { t } = await learnerWithProfile();
    expect((await callFunction(FN, t, { action: "audit_question_bank", kind: "question", items: [{ demo_code: "x" }] })).status).toBe(403);
  }, 20000);
});
