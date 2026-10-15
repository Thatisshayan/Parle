import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { callFunction } from "./helpers/functions-env";
import { clearAiQueue, queueAiResponses } from "./helpers/ai-queue";
import { seedLocalContent } from "../scripts/seed-local-content";

const FN = "parle-plan-service";
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const tokenOf = async (u: Awaited<ReturnType<typeof makeUser>>) => (await u.client.auth.getSession()).data.session!.access_token;

/** A learner set up exactly as onboarding saves one (Onboarding.tsx payload). */
export async function onboardedLearner() {
  const u = await makeUser("learner"), t = await tokenOf(u);
  await callFunction("parle-account-service", t, { action: "ensure_identity", role: "learner", age_confirmed: true });
  await callFunction("parle-account-service", t, { action: "save_profile", time_zone: "America/Toronto" });
  await callFunction("parle-account-service", t, {
    action: "save_learner_profile",
    goals: ["canada_immigration"], main_goal: "canada_immigration", other_goal_text: "", track: "immigration",
    target_per_skill: JSON.stringify({ L: "NCLC 7", R: "NCLC 7", W: "NCLC 7", S: "NCLC 7" }),
    target_date: "", no_deadline: true, test_booked: false, test_booked_date: "",
    availability: JSON.stringify({ monday: 20, wednesday: 20, friday: 20 }),
    tutor_windows: [], tutor_budget_band: "unspecified", self_assessed_level: "A2", native_language: "English", time_zone: "America/Toronto",
  });
  await callFunction("parle-account-service", t, { action: "save_unverified_placement", self_assessed_level: "A2", track: "immigration" });
  return { u, t };
}
beforeAll(async () => { await seedLocalContent(); });
beforeEach(async () => { await clearAiQueue(); });

describe("parle-plan-service", () => {
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
  it("refuses unknown actions and missing tokens", async () => {
    expect((await callFunction(FN, null, { action: "load_roadmap" })).status).toBe(401);
    const { t } = await onboardedLearner();
    expect((await callFunction(FN, t, { action: "drop" })).body.error_code).toBe("UNKNOWN_ACTION");
  });
  it("with a plan, the coach note comes from the AI and is saved to the learner (moved from Task 8)", async () => {
    const { u, t } = await onboardedLearner();
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
    const { t } = await onboardedLearner();
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
});
