import { describe, it, expect, beforeAll } from "bun:test";
import { HAS_LOCAL_DEMO_FIXTURES } from "./helpers/migration-fixtures";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { callFunction } from "./helpers/functions-env";
import { seedLocalContent } from "../scripts/seed-local-content";
import { clearAiQueue, queueAiResponses } from "./helpers/ai-queue";
import { FRENCH_ANSWER, recordedAnswer, voice } from "./helpers/voice";

const SPEAKING_SCORE = {
  is_french: true, criteria: { task_completion: 3, vocabulary: 2, grammar: 2, coherence_fluency: 3 }, level: "B1",
  corrections: [], tip: "Add one example from your own life.",
};

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
beforeAll(async () => { if (HAS_LOCAL_DEMO_FIXTURES) await seedLocalContent(); });

describe.skipIf(!HAS_LOCAL_DEMO_FIXTURES)("placement test on the server", () => {
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
  it("two simultaneous finishes save one result (A8, R20)", async () => {
    const { u, t } = await learner();
    const runId = (await call(t, { action: "placement_open" })).body.result.runId;
    await finishSection(t, runId, "listening");
    await call(t, { action: "placement_skip", runId, section: "reading" });
    await finishSection(t, runId, "grammar_vocabulary");
    await call(t, { action: "placement_skip", runId, section: "writing" });
    const [a, b] = await Promise.all([call(t, { action: "placement_finish", runId }), call(t, { action: "placement_finish", runId })]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    const { data } = await service().from("placement_result").select("id").eq("user_id", u.id).eq("status", "assessed");
    expect(data!.length).toBe(1);
  }, 60000);
  it("scores the placement writing once per run and returns the saved score after that (A9, R19)", async () => {
    const { t } = await learner("immigration");
    const open = (await call(t, { action: "placement_open" })).body.result;
    const prompt = open.prompts.find((p: any) => p.kind === "writing");
    await clearAiQueue();
    await queueAiResponses(
      JSON.stringify({ level: "A2", feedback: "Clear ideas. Add linking words.", rubric: { task_completion: 3, grammar: 2, vocabulary: 2, coherence: 3 } }),
      JSON.stringify({ level: "B2", feedback: "A second score.", rubric: { task_completion: 4, grammar: 4, vocabulary: 4, coherence: 4 } }),
    );
    const text = Array.from({ length: 45 }, (_, i) => `mot${i}`).join(" ");
    const first = await call(t, { action: "placement_score_writing", runId: open.runId, promptId: prompt.id, text });
    expect(first.status).toBe(200);
    expect(first.body.result.assessment.level).toBe("A2");
    const again = await call(t, { action: "placement_score_writing", runId: open.runId, promptId: prompt.id, text: `${text} encore` });
    expect(again.body.result.assessment.level).toBe("A2");
    const { count } = await service().from("ai_test_queue").select("*", { count: "exact", head: true });
    expect(count).toBe(1); // the second reply was never asked for
    await clearAiQueue();
  }, 60000);
  it("a writing claim left by a killed request does not lock the run for the rest of the day (final review)", async () => {
    const { t } = await learner("immigration");
    const open = (await call(t, { action: "placement_open" })).body.result;
    const prompt = open.prompts.find((p: any) => p.kind === "writing");
    // the claim a request leaves when the platform stops it mid-AI-call (its catch never runs): today's day-long window
    const dayStart = new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000).toISOString();
    await service().from("rate_limit_hit").insert({ key: `placement-writing:${open.runId}`, window_start: dayStart, hits: 1 });
    await clearAiQueue();
    await queueAiResponses(JSON.stringify({ level: "A2", feedback: "Clear ideas.", rubric: { task_completion: 3, grammar: 2, vocabulary: 2, coherence: 3 } }));
    const text = Array.from({ length: 45 }, (_, i) => `mot${i}`).join(" ");
    const r = await call(t, { action: "placement_score_writing", runId: open.runId, promptId: prompt.id, text });
    expect(r.body.error).not.toBe("WRITING_IN_PROGRESS");
    expect(r.status).toBe(200);
    await clearAiQueue();
  }, 60000);
  it("placement speaking: a recorded answer sets the speaking level and the result says speaking was assessed; it is never counted", async () => {
    const { t } = await learner();
    const open = (await call(t, { action: "placement_open" })).body.result;
    const runId = open.runId;
    for (const section of ["listening", "grammar_vocabulary"]) await finishSection(t, runId, section);
    for (const section of ["reading", "writing"]) await call(t, { action: "placement_skip", runId, section });
    const prompt = open.prompts.find((p: { kind: string }) => p.kind === "speaking");
    await clearAiQueue();
    await queueAiResponses(JSON.stringify(SPEAKING_SCORE));
    const { ticketId } = await recordedAnswer(t, runId, FRENCH_ANSWER, 25_000, "placement");
    const scored = await call(t, { action: "placement_score_speaking", runId, promptId: prompt.id, ticketId });
    expect(scored.body.result).toMatchObject({ status: "scored", assessment: { level: "B1", spoken_level: "B1", nclc: "NCLC 5-7" } });
    const again = await call(t, { action: "placement_score_speaking", runId, promptId: prompt.id, ticketId });
    expect(again.body.result.assessment.transcript).toBe(FRENCH_ANSWER);
    const finish = (await call(t, { action: "placement_finish", runId })).body.result;
    expect(finish.record.speaking_assessed).toBe(true);
    expect(JSON.parse(finish.record.level_per_skill).S).toBe("B1");
    expect(JSON.parse(finish.record.skill_state_per_skill).S).toBe("assessed");
    expect((await voice(t, { action: "voice_status" })).body.answers.used).toBe(0);
  }, 60000);
  it("a placement run may record at most six times", async () => {
    const { t } = await learner();
    const runId = (await call(t, { action: "placement_open" })).body.result.runId;
    for (let i = 0; i < 6; i++) expect((await recordedAnswer(t, runId, FRENCH_ANSWER, 10_000, "placement")).take.status).toBe(200);
    const seventh = await recordedAnswer(t, runId, FRENCH_ANSWER, 10_000, "placement");
    expect([seventh.take.status, seventh.take.body.error_code]).toEqual([429, "PLACEMENT_ATTEMPTS_USED"]);
  }, 60000);
  it("a placement finished without speaking keeps speaking not assessed", async () => {
    const { t } = await learner();
    const runId = (await call(t, { action: "placement_open" })).body.result.runId;
    for (const section of ["listening", "grammar_vocabulary"]) await finishSection(t, runId, section);
    for (const section of ["reading", "writing"]) await call(t, { action: "placement_skip", runId, section });
    const finish = (await call(t, { action: "placement_finish", runId })).body.result;
    expect(finish.record.speaking_assessed).toBe(false);
  }, 60000);
});

describe.skipIf(!HAS_LOCAL_DEMO_FIXTURES)("placement speaking and finish (Plan 11: A92)", () => {
  it("speaking scored in another tab never reopens a finished run (R100)", async () => {
    const { t } = await learner();
    const open = (await call(t, { action: "placement_open" })).body.result;
    const runId = open.runId;
    for (const s of ["listening", "grammar_vocabulary"]) await finishSection(t, runId, s);
    for (const s of ["reading", "writing"]) await call(t, { action: "placement_skip", runId, section: s });
    await clearAiQueue(); await queueAiResponses(JSON.stringify(SPEAKING_SCORE));
    const { ticketId } = await recordedAnswer(t, runId, FRENCH_ANSWER, 25_000, "placement");
    const prompt = open.prompts.find((p: any) => p.kind === "speaking");
    // hold speaking between loading the open run and saving it: its result insert waits on this lock,
    // and finish closes the run meanwhile (the order two tabs can produce)
    const lock = Bun.spawn(["docker", "exec", "-i", "supabase_db_parle-staging", "psql", "-U", "postgres", "-c",
      "begin; lock table public.speaking_result in exclusive mode; select pg_sleep(4); commit;"], { stdout: "ignore", stderr: "ignore" });
    await new Promise((r) => setTimeout(r, 700));
    const speaking = call(t, { action: "placement_score_speaking", runId, promptId: prompt.id, ticketId });
    await new Promise((r) => setTimeout(r, 1500));
    expect((await call(t, { action: "placement_finish", runId })).status).toBe(200);
    await lock.exited;
    await speaking;
    const { data } = await service().from("placement_run").select("status").eq("id", runId).single();
    expect(data!.status).toBe("finished");
  }, 60000);
});

describe.skipIf(!HAS_LOCAL_DEMO_FIXTURES)("listening as audio in placement (Plan 13)", () => {
  it("a listening question and its answer feedback never carry the transcript", async () => {
    const { t } = await learner();
    const runId = (await call(t, { action: "placement_open" })).body.result.runId;
    const q = (await call(t, { action: "placement_question", runId, section: "listening" })).body.result.question;
    expect(q.skill).toBe("listening");
    expect("transcript" in q).toBe(false);
    expect(typeof q.audio_url).toBe("string");
    const answered = (await call(t, { action: "placement_answer", runId, optionId: q.options[0].id })).body.result;
    expect("transcript" in (answered.item ?? {})).toBe(false);
    // the explanations often quote the transcript word for word (final review): listening feedback leaves them out
    expect("explanation" in (answered.item ?? {})).toBe(false);
  });
  it("a listening question whose audio will not load can be skipped, unscored; three skips end the section", async () => {
    const { t } = await learner();
    const runId = (await call(t, { action: "placement_open" })).body.result.runId;
    const first = (await call(t, { action: "placement_question", runId, section: "listening" })).body.result.question;
    const skipped = (await call(t, { action: "placement_skip_question", runId })).body.result;
    expect(skipped.completed).toBe(false);
    const second = (await call(t, { action: "placement_question", runId, section: "listening" })).body.result.question;
    expect(second.id).not.toBe(first.id);
    await call(t, { action: "placement_skip_question", runId });
    await call(t, { action: "placement_question", runId, section: "listening" });
    expect((await call(t, { action: "placement_skip_question", runId })).body.result.completed).toBe(true);
    expect((await call(t, { action: "placement_question", runId, section: "listening" })).body.result.done).toBe(true);
    const { data } = await service().from("placement_run").select("state_json").eq("id", runId).single();
    const listening = JSON.parse(data!.state_json).autoResults.find((r: any) => r.section === "listening");
    expect([listening.total, listening.audioUnavailable]).toEqual([0, true]);
  });
  it("skipping is refused outside listening", async () => {
    const { t } = await learner();
    const runId = (await call(t, { action: "placement_open" })).body.result.runId;
    await call(t, { action: "placement_question", runId, section: "reading" });
    expect((await call(t, { action: "placement_skip_question", runId })).status).toBe(400);
  });
});
