import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { callFunction } from "./helpers/functions-env";
import { clearAiQueue, queueAiResponses } from "./helpers/ai-queue";
import { seedLocalContent } from "../scripts/seed-local-content";
import { onboardedLearner } from "./helpers/learners";

const FN = "parle-plan-service";
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const psql = (sql: string) => Bun.spawnSync(["docker", "exec", "supabase_db_parle-staging", "psql", "-U", "postgres", "-tA", "-c", sql]).stdout.toString().trim();
const queueLeft = async () => (await service().from("ai_test_queue").select("id")).data!.length;

/** Valid for every practice task type: a passage of 40+ characters, one word, one answerable question, steps. */
const PRACTICE = JSON.stringify({ content: {
  title: "Au bureau",
  instructions: "Read the text, then answer the question.",
  text: "Je travaille dans un bureau à Toronto. Le matin, je lis mes courriels et je parle avec mes collègues.",
  vocabulary: [{ term: "le bureau", meaning: "the office", example: "Je vais au bureau à huit heures." }],
  questions: [{ prompt: "Où travaille la personne ?", options: [{ id: "a", text: "Dans un bureau" }, { id: "b", text: "Dans un magasin" }], answer_option_id: "a", explanation: "Le texte dit « dans un bureau »." }],
  steps: ["Lisez le texte.", "Répondez à la question."],
} });

beforeAll(async () => { await seedLocalContent(); });
beforeEach(async () => { await clearAiQueue(); });

async function freshPlan() {
  const learner = await onboardedLearner();
  await queueAiResponses(PRACTICE); // must still be in the queue after the plan request
  const r = await callFunction(FN, learner.t, { action: "get_or_create_plan", options: { includeTaskHistory: true } });
  expect(r.status).toBe(200);
  return { ...learner, plan: r.body.result };
}
const prepare = (t: string, task_id: string) => callFunction(FN, t, { action: "prepare_task_content", task_id });

describe("practice content after the plan (A28, D1)", () => {
  it("allows the pending content source in the database", () => {
    expect(psql("select count(*) from pg_constraint where conname = 'learner_task_content_source_check' and pg_get_constraintdef(oid) like '%pending%'")).toBe("1");
  });
  it("shows the plan at once: AI practice tasks come back pending and the plan request uses no AI", async () => {
    const { plan } = await freshPlan();
    const aiTasks = plan.tasks.filter((x: any) => x.type !== "tutor_lesson" && x.type !== "weekly_checkin" && x.skill);
    expect(aiTasks.length).toBeGreaterThan(0);
    expect(aiTasks.every((x: any) => x.contentSource === "pending")).toBe(true);
    for (const x of plan.tasks.filter((y: any) => y.type === "weekly_checkin")) expect(["approved_bank", "plan_only"]).toContain(x.contentSource);
    expect(await queueLeft()).toBe(1);
  }, 60000);
  it("prepares one pending task with AI content, and a second request uses no AI", async () => {
    const { t, u, plan } = await freshPlan();
    const task = plan.tasks.find((x: any) => x.contentSource === "pending");
    const first = await prepare(t, task.id);
    expect(first.status).toBe(200);
    expect(first.body.result.contentSource).toBe("generated");
    expect(first.body.result.content.title).toBe("Au bureau");
    expect(await queueLeft()).toBe(0);
    const { data } = await service().from("learner_task").select("content_source, owner_id").eq("id", task.id).single();
    expect(data).toEqual({ content_source: "generated", owner_id: u.id });
    const again = await prepare(t, task.id);
    expect(again.body.result.contentSource).toBe("generated");
  }, 60000);
  it("uses the approved bank when the AI fails", async () => {
    const { t, plan } = await freshPlan();
    await clearAiQueue();
    await queueAiResponses("garbage", "still garbage");
    const pending = plan.tasks.filter((x: any) => x.contentSource === "pending");
    // a fresh learner's first week may hold only a speaking check; the bank has reading, writing and speaking items
    const task = pending.find((x: any) => ["reading", "writing", "speaking"].includes(x.skill));
    expect(task).toBeTruthy();
    const r = await prepare(t, task.id);
    expect(r.status).toBe(200);
    expect(r.body.result.contentSource).toBe("approved_bank");
  }, 60000);
  it("refuses another learner's task and leaves it pending", async () => {
    const a = await freshPlan(), b = await onboardedLearner();
    const task = a.plan.tasks.find((x: any) => x.contentSource === "pending");
    const r = await prepare(b.t, task.id);
    expect(r.status).toBe(400);
    expect(r.body.error_code).toBe("PLAN_ACTION_FAILED");
    expect((await service().from("learner_task").select("content_source").eq("id", task.id).single()).data!.content_source).toBe("pending");
  }, 60000);
  it("reopening Today keeps prepared and pending tasks as they are (Review Focus 1)", async () => {
    const { t, plan } = await freshPlan();
    const [done, waiting] = plan.tasks.filter((x: any) => x.contentSource === "pending");
    expect((await prepare(t, done.id)).body.result.contentSource).toBe("generated");
    await queueAiResponses(PRACTICE);
    const reopened = (await callFunction(FN, t, { action: "get_or_create_plan", options: {} })).body.result;
    expect(reopened.tasks.find((x: any) => x.id === done.id).contentSource).toBe("generated");
    if (waiting) expect(reopened.tasks.find((x: any) => x.id === waiting.id).contentSource).toBe("pending");
    expect(await queueLeft()).toBe(1);
  }, 60000);
  it("a task that is no longer open is not prepared (Review Focus 2)", async () => {
    const { t, plan } = await freshPlan();
    const task = plan.tasks.find((x: any) => x.contentSource === "pending");
    expect((await callFunction(FN, t, { action: "mark_task_done", task_id: task.id })).status).toBe(200);
    const r = await prepare(t, task.id);
    expect(r.status).toBe(200);
    expect(r.body.result.status).toBe("done");
    expect(r.body.result.contentSource).toBe("pending");
    expect(await queueLeft()).toBe(1);
  }, 60000);
});
