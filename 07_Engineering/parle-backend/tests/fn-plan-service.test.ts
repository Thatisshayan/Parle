import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { HAS_LOCAL_DEMO_FIXTURES } from "./helpers/migration-fixtures";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { callFunction } from "./helpers/functions-env";
import { clearAiQueue, queueAiResponses } from "./helpers/ai-queue";
import { seedLocalContent } from "../scripts/seed-local-content";
import { onboardedLearner } from "./helpers/learners";

const FN = "parle-plan-service";
const everyDayAvailability = { monday: 20, tuesday: 20, wednesday: 20, thursday: 20, friday: 20, saturday: 20, sunday: 20 };
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const tokenOf = async (u: Awaited<ReturnType<typeof makeUser>>) => (await u.client.auth.getSession()).data.session!.access_token;

beforeAll(async () => { if (HAS_LOCAL_DEMO_FIXTURES) await seedLocalContent(); });
beforeEach(async () => { await clearAiQueue(); });

describe.skipIf(!HAS_LOCAL_DEMO_FIXTURES)("parle-plan-service", () => {
  it("builds the learner's plan on the server and saves it as theirs", async () => {
    const { u, t } = await onboardedLearner();
    const r = await callFunction(FN, t, { action: "get_or_create_plan", options: {} });
    expect(r.status).toBe(200);
    expect(r.body.result.tasks.length).toBeGreaterThan(0);
    for (const table of ["roadmap", "week_plan", "learner_task"]) {
      const { data } = await service().from(table).select("owner_id, created_by").eq("user_id", u.id);
      expect({ table, n: data!.length > 0 }).toEqual({ table, n: true });
      expect(data!.every((row) => row.owner_id === u.id && row.created_by === u.email)).toBe(true);
    }
  });
  it("two learners at once each get their own plan", async () => {
    const [a, b] = await Promise.all([onboardedLearner(), onboardedLearner()]);
    const [ra, rb] = await Promise.all([
      callFunction(FN, a.t, { action: "get_or_create_plan", options: {} }),
      callFunction(FN, b.t, { action: "get_or_create_plan", options: {} }),
    ]);
    expect([ra.status, rb.status]).toEqual([200, 200]);
    const owners = async (id: string) => (await service().from("learner_task").select("owner_id").eq("user_id", id)).data!.map((r) => r.owner_id);
    expect(new Set(await owners(a.u.id))).toEqual(new Set([a.u.id]));
    expect(new Set(await owners(b.u.id))).toEqual(new Set([b.u.id]));
  });
  it("a learner completes their own task but cannot complete another learner's task", async () => {
    const a = await onboardedLearner(), b = await onboardedLearner();
    const planA = (await callFunction(FN, a.t, { action: "get_or_create_plan", options: {} })).body.result;
    const planB = (await callFunction(FN, b.t, { action: "get_or_create_plan", options: {} })).body.result;
    const own = planA.tasks.find((x: any) => x.type !== "weekly_checkin");
    expect((await callFunction(FN, a.t, { action: "mark_task_done", task_id: own.id })).status).toBe(200);
    const other = planB.tasks.find((x: any) => x.type !== "weekly_checkin");
    expect((await callFunction(FN, a.t, { action: "mark_task_done", task_id: other.id })).status).toBe(400);
    const { data } = await service().from("learner_task").select("status").eq("id", other.id).single();
    expect(data!.status).not.toBe("done");
  });
  it("roadmap and progress load through the service", async () => {
    const { t } = await onboardedLearner();
    expect((await callFunction(FN, t, { action: "load_roadmap" })).status).toBe(200);
    expect((await callFunction(FN, t, { action: "load_progress" })).status).toBe(200);
  });
  it("the weekly check-in is served without answer keys (scored on the server after submission)", async () => {
    const { t } = await onboardedLearner({ availability: everyDayAvailability });
    await callFunction(FN, t, { action: "get_or_create_plan", options: {} });
    const r = await callFunction(FN, t, { action: "prepare_checkin" });
    expect(r.status).toBe(200);
    const questions = r.body.result.questions ?? [];
    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) {
      expect(q).not.toHaveProperty("answerOptionId");
      expect(q).not.toHaveProperty("explanation");
    }
  });
  it("refuses unknown actions and missing tokens", async () => {
    expect((await callFunction(FN, null, { action: "load_roadmap" })).status).toBe(401);
    const { t } = await onboardedLearner();
    expect((await callFunction(FN, t, { action: "drop" })).body.error_code).toBe("UNKNOWN_ACTION");
  });
  it("with a plan, the coach note comes from the AI and is saved to the learner (moved from Task 8)", async () => {
    const { u, t } = await onboardedLearner({ availability: everyDayAvailability });
    const plan = (await callFunction(FN, t, { action: "get_or_create_plan", options: {} })).body.result;
    // The note needs practice done this week (hasEssentialCoachNoteContext); otherwise it is a saved fallback.
    await callFunction(FN, t, { action: "mark_task_done", task_id: plan.tasks.find((x: any) => x.type !== "weekly_checkin").id });
    await clearAiQueue();
    await queueAiResponses('{"note":"You practised well this week. Keep going with your listening tomorrow."}');
    const r = await callFunction("parle-assessment-service", t, { action: "learner_coach_note" });
    expect(r.status).toBe(200);
    expect(r.body.note).toContain("listening");
    const { data } = await service().from("ParleCoachNote").select("owner_id").eq("owner_id", u.id);
    expect(data!.length).toBe(1);
  });
  it("with a plan, the coach note falls back when the AI fails (moved from Task 8)", async () => {
    const { t } = await onboardedLearner({ availability: everyDayAvailability });
    const plan = (await callFunction(FN, t, { action: "get_or_create_plan", options: {} })).body.result;
    await callFunction(FN, t, { action: "mark_task_done", task_id: plan.tasks.find((x: any) => x.type !== "weekly_checkin").id });
    await clearAiQueue();
    await queueAiResponses("garbage", "still garbage");
    const r = await callFunction("parle-assessment-service", t, { action: "learner_coach_note" });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("fallback");
    const { data } = await service().from("ai_test_queue").select("id");
    expect(data!.length).toBe(0); // both replies were tried (one retry), then the fallback
  });
  it("decides the planning date, week number and note on the server, ignoring the browser's (A3, R21)", async () => {
    const { t } = await onboardedLearner();
    const r = await callFunction(FN, t, { action: "get_or_create_plan", options: { planningDate: "2030-01-07", weekNumber: 9, whatChangedNote: "Browser note", includeTaskHistory: true } });
    expect(r.status).toBe(200);
    expect(r.body.result.weekNumber).toBe(1);
    expect(r.body.result.weekStart < "2030-01-01").toBe(true);
    expect(r.body.result.whatChangedNote).not.toBe("Browser note");
  }, 30000);
  it("knows a learner without a profile by the engine's error code, not its wording (A15, R34)", () => {
    const src = readFileSync(`${import.meta.dir}/../supabase/functions/parle-plan-service/index.ts`, "utf8");
    expect(src).not.toContain("Finish your learner onboarding");
    expect(src).toContain('"ONBOARDING_REQUIRED"');
  });
});

describe.skipIf(!HAS_LOCAL_DEMO_FIXTURES)("Today before onboarding (found in the Plan 4 preview click-through)", () => {
  it("a learner who signed up but skipped onboarding is told to finish onboarding, not that the plan failed", async () => {
    const u = await makeUser("learner");
    const t = (await u.client.auth.getSession()).data.session!.access_token;
    await callFunction("parle-account-service", t, { action: "ensure_identity", role: "learner", age_confirmed: true });
    const r = await callFunction(FN, t, { action: "get_or_create_plan", options: {} });
    expect(r.body.error_code).toBe("ONBOARDING_REQUIRED");
  }, 30000);
});
