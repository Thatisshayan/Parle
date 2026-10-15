import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { practiceContentIsUseful } from "../../functions/parle-practice-content.helper.ts";

const passage = "Je travaille dans un bureau à Toronto. Le matin, je lis mes courriels et je parle avec mes collègues.";
const content = (over: Partial<{ text: string; vocabulary: unknown[]; questions: unknown[]; steps: unknown[] }> = {}) => ({ text: passage, vocabulary: [], questions: [], steps: [], ...over });

describe("useful AI practice (A34, R42)", () => {
  it("an AI lesson whose questions were all dropped is not shown; the bank is used instead", () => {
    assert.equal(practiceContentIsUseful("ai_lesson", content(), 3), false);
    assert.equal(practiceContentIsUseful("ai_lesson", content({ questions: [{}] }), 3), true);
    assert.equal(practiceContentIsUseful("ai_lesson", content(), 0), true); // the AI wrote a lesson without questions
  });
  it("keeps the rules for the other task types", () => {
    assert.equal(practiceContentIsUseful("vocabulary_drill", content({ vocabulary: [{}] }), 2), true);
    assert.equal(practiceContentIsUseful("vocabulary_drill", content(), 0), false);
    assert.equal(practiceContentIsUseful("listening_exercise", content({ questions: [{}] }), 1), true);
    assert.equal(practiceContentIsUseful("listening_exercise", content(), 1), false);
    assert.equal(practiceContentIsUseful("writing", content({ text: "Court." }), 0), false);
    assert.equal(practiceContentIsUseful("speaking_practice", content(), 0), true);
  });
  it("the assessment service uses it after dropping malformed questions", () => {
    const src = readFileSync(new URL("../../functions/parle-assessment-service.ts", import.meta.url), "utf8");
    assert.match(src, /const contentIsUseful = practiceContentIsUseful\(taskType, /);
    assert.ok(src.indexOf("usablePracticeQuestions(") < src.indexOf("const contentIsUseful"));
  });
});
