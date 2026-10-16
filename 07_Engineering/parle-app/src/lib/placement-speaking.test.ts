import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assemblePlacementResult, type SpeakingAssessment } from "./placement-test";

const speaking: SpeakingAssessment = {
  level: "B2", spoken_level: "C1", nclc: "NCLC 10 or above",
  rubric: { task_completion: 4, vocabulary: 3, grammar: 3, coherence_fluency: 4 },
  corrections: [], tip: "Keep using linking words.", transcript: "Je pense que le télétravail est utile.", word_count: 7, words_per_minute: 110, prompt_id: "p-1",
};
const base = { track: "immigration" as const, targetPerSkill: { L: null, R: null, W: null, S: null }, autoSections: [], writing: null, skippedSections: [] };

describe("placement speaking in the result (Plan 9)", () => {
  it("a scored speaking answer sets the speaking level, state, NCLC, rubric and tip", () => {
    const r = assemblePlacementResult({ ...base, speaking });
    assert.equal(r.levels.S, "B2");
    assert.equal(r.states.S, "assessed");
    assert.equal(r.nclcEstimates.S?.min, 8);
    assert.deepEqual(r.scores.S, speaking.rubric);
    assert.equal(r.feedback.S, "Keep using linking words.");
    assert.equal(r.responses.find((x) => x.type === "speaking")?.spoken_level, "C1");
  });
  it("without one, speaking stays not assessed", () => {
    const r = assemblePlacementResult(base);
    assert.equal(r.states.S, "not_assessed");
    assert.equal(r.levels.S, null);
  });
});
