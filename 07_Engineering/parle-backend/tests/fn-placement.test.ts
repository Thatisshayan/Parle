import { describe, it, expect, beforeAll } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { callFunction } from "./helpers/functions-env";
import { seedLocalContent } from "../scripts/seed-local-content";

const FN = "parle-plan-service";
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const tokenOf = async (u: Awaited<ReturnType<typeof makeUser>>) => (await u.client.auth.getSession()).data.session!.access_token;
const call = async (t: string, body: Record<string, unknown>) => callFunction(FN, t, body);

/** Citizenship learners may skip reading and writing (the page's optional sections), so no AI is needed here. */
async function learner(track: "citizenship" | "immigration" = "citizenship") {
  const u = await makeUser("learner"), t = await tokenOf(u);
  await callFunction("parle-account-service", t, { action: "ensure_identity", role: "learner", age_confirmed: true });
  await callFunction("parle-account-service", t, {
    action: "save_learner_profile", track, goals: [track === "citizenship" ? "canadian_citizenship" : "canada_immigration"],
    main_goal: track === "citizenship" ? "canadian_citizenship" : "canada_immigration",
    target_per_skill: JSON.stringify(track === "citizenship" ? { L: "NCLC 4", R: null, W: null, S: "NCLC 4" } : { L: "NCLC 7", R: "NCLC 7", W: "NCLC 7", S: "NCLC 7" }),
    self_assessed_level: "A2", native_language: "English", time_zone: "America/Toronto",
  });
  return { u, t };
}
async function finishSection(t: string, runId: string, section: string) {
  for (let i = 0; i < 40; i++) {
    const q = (await call(t, { action: "placement_question", runId, section })).body.result;
    if (q.done) return;
    const fb = (await call(t, { action: "placement_answer", runId, optionId: q.question.options[0].id })).body.result;
    if (fb.update.completed) return;
  }
  throw new Error(`section ${section} did not finish`);
}
beforeAll(async () => { await seedLocalContent(); });

describe("placement test on the server", () => {
  it("questions are served without answers; feedback only after answering", async () => {
    const { t } = await learner();
    const open = (await call(t, { action: "placement_open" })).body.result;
    expect(open.screen).toBe("ready");
    const q = (await call(t, { action: "placement_question", runId: open.runId, section: "listening" })).body.result.question;
    const text = JSON.stringify(q);
    for (const leak of ["answer_option_id", "\"answer\"", "\"explanation\"", "created_by", "owner_id", "reviewed_by", "@"]) expect(text).not.toContain(leak);
    const fb = (await call(t, { action: "placement_answer", runId: open.runId, optionId: q.options[0].id })).body.result;
    expect(typeof fb.update.response.is_correct).toBe("boolean");
    expect(typeof fb.item.answer_option_id).toBe("string");
  });
  it("an answer for a run that is not yours is refused", async () => {
    const a = await learner(), b = await learner();
    const runId = (await call(a.t, { action: "placement_open" })).body.result.runId;
    const q = (await call(a.t, { action: "placement_question", runId, section: "listening" })).body.result.question;
    expect((await call(b.t, { action: "placement_answer", runId, optionId: q.options[0].id })).status).toBe(400);
  });
  it("an answer that is not one of the served options is refused", async () => {
    const { t } = await learner();
    const runId = (await call(t, { action: "placement_open" })).body.result.runId;
    await call(t, { action: "placement_question", runId, section: "listening" });
    expect((await call(t, { action: "placement_answer", runId, optionId: "not-an-option" })).status).toBe(400);
  });
  it("a full run saves an assessed result for the learner and blocks a retake for 14 days", async () => {
    const { u, t } = await learner();
    const runId = (await call(t, { action: "placement_open" })).body.result.runId;
    await finishSection(t, runId, "listening");
    expect((await call(t, { action: "placement_skip", runId, section: "reading" })).status).toBe(200);
    await finishSection(t, runId, "grammar_vocabulary");
    expect((await call(t, { action: "placement_skip", runId, section: "writing" })).status).toBe(200);
    const fin = await call(t, { action: "placement_finish", runId });
    expect(fin.status).toBe(200);
    expect(fin.body.result.record.status).toBe("assessed");
    const { data } = await service().from("placement_result").select("status, source, owner_id").eq("user_id", u.id).eq("status", "assessed");
    expect(data!.map((r) => ({ s: r.source, o: r.owner_id }))).toEqual([{ s: "placement_test", o: u.id }]);
    expect((await call(t, { action: "placement_open" })).body.result.screen).toBe("result");
  });
  it("cannot finish before the sections are done, or skip a required section", async () => {
    const { t } = await learner("immigration");
    const runId = (await call(t, { action: "placement_open" })).body.result.runId;
    expect((await call(t, { action: "placement_finish", runId })).status).toBe(400);
    expect((await call(t, { action: "placement_skip", runId, section: "reading" })).status).toBe(400);
  });
  it("the browser cannot read the question bank", async () => {
    const { u } = await learner();
    const { data } = await u.client.from("question_item").select("id").limit(1);
    expect(data ?? []).toEqual([]);
  });
});
