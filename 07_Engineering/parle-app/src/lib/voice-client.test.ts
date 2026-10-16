import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { listeningUrl, safeOutcome, setVoiceDeps, transcribe, VoiceRequestError, voiceErrorKey } from "./voice-client";
import { afterScoreError, resultFromAssessment, voiceErrorFrom } from "./voice-client";

afterEach(() => setVoiceDeps(null));
const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("voice client", () => {
  it("sends a long answer in parts, in order, with the first part's ticket, and joins what was heard", async () => {
    const urls: string[] = [];
    let n = 0;
    setVoiceDeps({
      token: async () => "tok",
      fetch: async (url) => { urls.push(String(url)); n++; return answer(200, { ticket_id: "t-1", transcript: `partie ${n}.`, duration_ms: 50_000, remaining: 1 }); },
    });
    const r = await transcribe(new Float32Array(16000 * 120).fill(0.2), "answer", "task-1");
    assert.equal(urls.length, 3);
    assert.match(urls[0], /action=transcribe&purpose=answer&ref=task-1&part=1$/);
    assert.match(urls[1], /part=2&ticket=t-1$/);
    assert.deepEqual([r.ticketId, r.transcript, r.durationMs, r.remaining], ["t-1", "partie 1. partie 2. partie 3.", 150_000, 1]);
  });
  it("turns the limit and busy answers into the spec's messages", async () => {
    setVoiceDeps({ token: async () => "tok", fetch: async () => answer(429, { error_code: "LIMIT_REACHED", plan: "free", limit: 2 }) });
    const limited = await transcribe(new Float32Array(16000), "answer", "x").catch((e) => e);
    assert.ok(limited instanceof VoiceRequestError);
    assert.deepEqual([limited.code, limited.info.plan, limited.info.limit], ["LIMIT_REACHED", "free", 2]);
    assert.equal(voiceErrorKey(limited, "answer"), "voice.limit.answers");
    assert.equal(voiceErrorKey(limited, "message"), "voice.limit.messages");
    setVoiceDeps({ token: async () => "tok", fetch: async () => { throw new Error("offline"); } });
    assert.equal(voiceErrorKey(await transcribe(new Float32Array(16000), "message", "x").catch((e) => e), "message"), "voice.busy");
  });
  it("waits while listening audio is being made, then plays it", async () => {
    let calls = 0;
    setVoiceDeps({ token: async () => "tok", wait: async () => undefined, fetch: async () => (++calls < 3 ? answer(409, { error_code: "AUDIO_BEING_MADE" }) : answer(200, { url: "https://x.test/a.mp3" })) });
    assert.equal(await listeningUrl("question_item", "q-1"), "https://x.test/a.mp3");
    assert.equal(calls, 3);
  });
  it("reads a scoring outcome strictly", () => {
    assert.deepEqual(safeOutcome({ status: "too_short" }), { status: "too_short" });
    const scored = safeOutcome({ status: "scored", result: { id: "r", mode: "spoken", transcript: "Je suis allé au marché.", criteria: { task_completion: 3, vocabulary: 2, grammar: 2, coherence_fluency: 3 }, level: "B1", nclc: "NCLC 5-7", corrections: [], tip: "Bien.", words_per_minute: 102, duration_ms: 20_000 } });
    assert.equal(scored.status === "scored" && scored.result.wordsPerMinute, 102);
    assert.throws(() => safeOutcome({ status: "scored", result: { level: "Z" } }));
  });
});


describe("placement speaking on the page", () => {
  it("shows a placement assessment with the spoken level (C1), not the bank band", () => {
    const r = resultFromAssessment({ level: "B2", spoken_level: "C1", nclc: "NCLC 10 or above", rubric: { task_completion: 4, vocabulary: 4, grammar: 3, coherence_fluency: 4 }, corrections: [], tip: "Bien.", transcript: "Je pense que...", word_count: 3, words_per_minute: 120, prompt_id: "p" });
    assert.deepEqual([r.level, r.nclc, r.wordsPerMinute], ["C1", "NCLC 10 or above", 120]);
  });
  it("reads the plan service's refusal body", () => {
    const e = voiceErrorFrom({ body: { error_code: "PLACEMENT_ATTEMPTS_USED" } });
    assert.equal(voiceErrorKey(e, "answer"), "voice.placementAttempts");
  });
});

describe("after a spoken answer could not be scored (final review, Important 1)", () => {
  it("scoring failures keep the recording to score again; a closed task shows its saved result; the rest record again", () => {
    for (const code of ["SCORE_FAILED", "SCORING_IN_PROGRESS", "VOICE_BUSY", "REQUEST_FAILED", "NETWORK"]) assert.equal(afterScoreError(new VoiceRequestError(code)), "retry_score", code);
    assert.equal(afterScoreError(new VoiceRequestError("TASK_CLOSED")), "load_result");
    for (const code of ["TICKET_NOT_FOUND", "TICKET_CLOSED", "LIMIT_REACHED"]) assert.equal(afterScoreError(new VoiceRequestError(code)), "record_again", code);
    assert.equal(afterScoreError(new Error("offline")), "retry_score");
  });
});
