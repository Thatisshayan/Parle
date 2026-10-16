import { describe, it, expect, beforeAll, beforeEach, setDefaultTimeout } from "bun:test";
import { seedLocalContent } from "../scripts/seed-local-content";
import { clearAiQueue, queueAiResponses } from "./helpers/ai-queue";
import { callFunction } from "./helpers/functions-env";
import { nextSpeakingEstimate } from "../../parle-app/src/lib/voice-text";
import { FRENCH_ANSWER, learnerWithSpeakingTask, recordedAnswer, service, voice } from "./helpers/voice";

setDefaultTimeout(60_000);
beforeAll(async () => { await seedLocalContent(); });
beforeEach(async () => { await clearAiQueue(); });

export const SCORE = {
  is_french: true,
  criteria: { task_completion: 3, vocabulary: 2, grammar: 2, coherence_fluency: 3 },
  level: "B1",
  corrections: [{ said: "je suis allé avec ma sœur au marché", better: "je suis allé au marché avec ma sœur", reason: "Put the place before the person you went with." }],
  tip: "Add one sentence that gives your opinion.",
};
const used = async (t: string) => (await voice(t, { action: "voice_status" })).body.answers.used;
const score = (t: string, ticketId: string, taskId: string) => voice(t, { action: "speaking_score", ticket_id: ticketId, task_id: taskId });
async function speakingEstimate(userId: string, roadmapId: string) {
  const { data } = await service().from("skill_estimate").select("value, state, source").eq("user_id", userId).eq("roadmap_id", roadmapId).eq("skill", "speaking").order("created_at", { ascending: false }).limit(1);
  return data![0];
}

describe("scored speaking answers", () => {
  it("a recorded answer is scored: transcript, four criteria, level with NCLC, corrections, tip; the task is done and the speaking estimate moves one step", async () => {
    const { u, t, taskId, roadmapId } = await learnerWithSpeakingTask();
    const before = await speakingEstimate(u.id, roadmapId);
    await queueAiResponses(JSON.stringify(SCORE));
    const { ticketId } = await recordedAnswer(t, taskId, FRENCH_ANSWER, 20_000);
    const r = await score(t, ticketId, taskId);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("scored");
    expect(r.body.result).toMatchObject({ transcript: FRENCH_ANSWER, level: "B1", nclc: "NCLC 5-7", criteria: SCORE.criteria, corrections: SCORE.corrections, tip: SCORE.tip, mode: "spoken", word_count: 34, words_per_minute: 102, duration_ms: 20_000 });
    const { data: task } = await service().from("learner_task").select("status").eq("id", taskId).single();
    expect(task!.status).toBe("done");
    const after = await speakingEstimate(u.id, roadmapId);
    expect(after).toMatchObject({ value: nextSpeakingEstimate(Number(before.value), "B1"), state: "assessed", source: "speaking_task" });
    expect(await used(t)).toBe(1);
    const { data: ticket } = await service().from("voice_use").select("status, transcript").eq("id", ticketId).single();
    expect(ticket).toEqual({ status: "counted", transcript: "" });
    expect((await voice(t, { action: "speaking_result", task_id: taskId })).body.result.id).toBe(r.body.result.id);
  });
  it("under ten words is not scored and not counted", async () => {
    const { t, taskId } = await learnerWithSpeakingTask();
    const { ticketId } = await recordedAnswer(t, taskId, "Bonjour, je suis Marie.");
    expect((await score(t, ticketId, taskId)).body.status).toBe("too_short");
    expect(await used(t)).toBe(0);
  });
  it("a recording where Whisper invented subtitle credits is not scored and not counted (Review Focus 1)", async () => {
    const { t, taskId } = await learnerWithSpeakingTask();
    const { ticketId, part } = await recordedAnswer(t, taskId, "Sous-titres réalisés par la communauté d'Amara.org", 8_000);
    expect(part!.body.transcript).toBe("");
    expect((await score(t, ticketId, taskId)).body.status).toBe("too_short");
    expect(await used(t)).toBe(0);
  });
  it("an answer mostly not in French is not scored and not counted", async () => {
    const { t, taskId } = await learnerWithSpeakingTask();
    const { ticketId } = await recordedAnswer(t, taskId, "Last weekend I went to the market with my sister and we bought some bread and vegetables.");
    expect((await score(t, ticketId, taskId)).body.status).toBe("not_french");
    expect(await used(t)).toBe(0);
  });
  it("when the scoring model finds the answer is not French, it is not scored and not counted", async () => {
    const { t, taskId } = await learnerWithSpeakingTask();
    await queueAiResponses(JSON.stringify({ ...SCORE, is_french: false }));
    const { ticketId } = await recordedAnswer(t, taskId);
    expect((await score(t, ticketId, taskId)).body.status).toBe("not_french");
    expect(await used(t)).toBe(0);
  });
  it("an answer shape that fails twice says so; trying again scores the same recording with no new count", async () => {
    const { t, taskId } = await learnerWithSpeakingTask();
    await queueAiResponses("not json", JSON.stringify({ ...SCORE, level: "Z9" }));
    const { ticketId } = await recordedAnswer(t, taskId);
    const failed = await score(t, ticketId, taskId);
    expect([failed.status, failed.body.error_code, failed.body.message]).toEqual([502, "SCORE_FAILED", "We couldn't score this one. Try again."]);
    await queueAiResponses(JSON.stringify(SCORE));
    expect((await score(t, ticketId, taskId)).body.status).toBe("scored");
    expect(await used(t)).toBe(1);
  });
  it("scoring the same recording twice, one after the other or at once, gives one result and one count (Review Focus 2)", async () => {
    const a = await learnerWithSpeakingTask();
    await queueAiResponses(JSON.stringify(SCORE));
    const one = await recordedAnswer(a.t, a.taskId);
    const first = await score(a.t, one.ticketId, a.taskId);
    const again = await score(a.t, one.ticketId, a.taskId);
    expect(again.body.result.id).toBe(first.body.result.id);

    const b = await learnerWithSpeakingTask();
    await queueAiResponses(JSON.stringify(SCORE), JSON.stringify(SCORE));
    const two = await recordedAnswer(b.t, b.taskId);
    const both = await Promise.all([score(b.t, two.ticketId, b.taskId), score(b.t, two.ticketId, b.taskId)]);
    for (const r of both) expect([200, 409]).toContain(r.status);
    expect(both.some((r) => r.status === 200)).toBe(true);
    expect((await score(b.t, two.ticketId, b.taskId)).body.status).toBe("scored");
    const { count } = await service().from("speaking_result").select("id", { count: "exact", head: true }).eq("ticket_id", two.ticketId);
    expect([count, await used(a.t), await used(b.t)]).toEqual([1, 1, 1]);
  });
  it("a typed answer (microphone refused) is scored as writing practice: the task is done, the speaking level does not change, nothing is counted", async () => {
    const { u, t, taskId, roadmapId } = await learnerWithSpeakingTask();
    const before = await speakingEstimate(u.id, roadmapId);
    await queueAiResponses(JSON.stringify(SCORE));
    const r = await voice(t, { action: "speaking_score_typed", task_id: taskId, text: FRENCH_ANSWER });
    expect(r.body).toMatchObject({ status: "scored", result: { mode: "typed", level: "B1", words_per_minute: null } });
    const { data: task } = await service().from("learner_task").select("status").eq("id", taskId).single();
    expect(task!.status).toBe("done");
    expect(await speakingEstimate(u.id, roadmapId)).toEqual(before);
    expect(await used(t)).toBe(0);
  });
  it("another learner cannot score my recording", async () => {
    const mine = await learnerWithSpeakingTask(), other = await learnerWithSpeakingTask();
    const { ticketId } = await recordedAnswer(mine.t, mine.taskId);
    const r = await score(other.t, ticketId, other.taskId);
    expect([r.status, r.body.error_code]).toEqual([404, "TICKET_NOT_FOUND"]);
  });
  it("deleting the account removes the transcripts and results", async () => {
    const { u, t, taskId } = await learnerWithSpeakingTask();
    await queueAiResponses(JSON.stringify(SCORE));
    const { ticketId } = await recordedAnswer(t, taskId);
    await score(t, ticketId, taskId);
    const del = await callFunction("parle-account-service", t, { action: "delete_account", password: u.password, confirm: "DELETE" });
    expect(del.status).toBe(200);
    for (const table of ["voice_use", "speaking_result"]) {
      const { count } = await service().from(table).select("id", { count: "exact", head: true }).eq("user_id", u.id);
      expect(`${table}: ${count}`).toBe(`${table}: 0`);
    }
  });
});
