import { describe, it, expect, beforeAll } from "bun:test";
import { callFunction } from "./helpers/functions-env";
import { seedLocalContent } from "../scripts/seed-local-content";
import { prepareListeningAudio } from "./helpers/voice";

// cf-connecting-ip stands in for the gateway-set address, so each test gets its own allowance.
const ip = () => ({ "cf-connecting-ip": `198.51.100.${Math.floor(Math.random() * 250) + 1}` });
// Plan 13: listening questions need prepared audio (the check is used signed out)
beforeAll(async () => { await seedLocalContent(); await prepareListeningAudio(); });

describe("public level check", () => {
  it("start returns questions without answers", async () => {
    const r = await callFunction("parle-public-level-check", null, { action: "start" }, ip());
    expect(r.status).toBe(200);
    expect(r.body.runId).toMatch(/^run_[0-9a-f]{32}$/);
    expect(r.body.questions.length).toBeGreaterThan(0);
    const text = JSON.stringify(r.body);
    for (const leak of ["answer_option_id", "\"answer\"", "explanation", "choice-1"]) expect(text).not.toContain(leak);
  });
  it("scores a run it started", async () => {
    const headers = ip();
    const start = await callFunction("parle-public-level-check", null, { action: "start" }, headers);
    const answers = (start.body.questions as any[]).map((q) => ({ questionId: q.id, choiceId: q.options[0].id }));
    const score = await callFunction("parle-public-level-check", null, { action: "score", runId: start.body.runId, answers }, headers);
    expect(score.status).toBe(200);
  });
  it("a caller cannot get a fresh allowance by changing the forwarded address it sends (final review 1)", async () => {
    const real = ip();
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await callFunction("parle-public-level-check", null, { action: "start" }, { ...real, "x-forwarded-for": `203.0.113.${i + 1}` })).status);
    expect(codes[10]).toBe(429);
  });
  it("allows 10 starts per address per hour", async () => {
    const headers = ip();
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await callFunction("parle-public-level-check", null, { action: "start" }, headers)).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});
