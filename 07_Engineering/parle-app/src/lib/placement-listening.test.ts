import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assemblePlacementResult, createAdaptiveRun, skipListeningQuestion, summarizeAutoRun } from "./placement-test";

const targets = { listening: "B1", reading: "B1", writing: "B1", speaking: "B1" } as any;

describe("listening as audio in placement (Plan 13)", () => {
  it("a question skipped because its audio would not load is never scored", () => {
    const run = skipListeningQuestion(createAdaptiveRun("listening", "A2"), "q1");
    assert.deepEqual(run.askedIds, ["q1"]);
    assert.equal(run.responses.length, 0);
    assert.equal(run.audioSkips, 1);
    assert.equal(run.completed, false);
  });
  it("after three skips the listening section ends as not assessed", () => {
    let run = createAdaptiveRun("listening", "A2");
    for (const id of ["q1", "q2", "q3"]) run = skipListeningQuestion(run, id);
    assert.equal(run.completed, true);
    assert.equal(run.completionReason, "audio_unavailable");
    const result = assemblePlacementResult({ track: "immigration", targetPerSkill: targets, autoSections: [summarizeAutoRun(run)], writing: null, skippedSections: [] });
    assert.equal(result.states.L, "not_assessed");
    assert.equal(result.levels.L, null);
  });
  it("a listening section that played audio is assessed, not 'transcript only'", () => {
    const run = { ...createAdaptiveRun("listening", "A2"), completed: true, completionReason: "maximum" as const };
    const result = assemblePlacementResult({ track: "immigration", targetPerSkill: targets, autoSections: [summarizeAutoRun(run)], writing: null, skippedSections: [] });
    assert.equal(result.states.L, "assessed");
  });
  it("skipping is only for listening", () => {
    assert.throws(() => skipListeningQuestion(createAdaptiveRun("reading", "A2"), "q1"));
  });
});

describe("placement prompts from the real bank (Plan 13 final review)", () => {
  it("a real (non-demo) prompt is offered: the server already sends only the switched bank's prompts", async () => {
    const { selectPrompt } = await import("./placement-test");
    const real = { id: "p1", demo_code: "LB-WRITING-B1-001", kind: "writing", cefr_level: "B1", track: "all", text: "Écrivez un courriel.", status: "approved", is_test_data: false } as any;
    assert.deepEqual(selectPrompt([real], "writing", "B1").map((p) => p.demo_code), ["LB-WRITING-B1-001"]);
  });
});
