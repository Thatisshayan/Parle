import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkInCorrectCounts, SKIPPED_AUDIO } from "./learner-plan";

const q = (id: string, kind: "listening" | "reading") => ({ id, demoCode: id, kind, text: "", prompt: "", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], answerOptionId: "a", explanation: "" });

describe("a check-in listening question skipped for its audio (Plan 13)", () => {
  it("is left out of the count, and says listening was not fully answered", () => {
    assert.deepEqual(checkInCorrectCounts([q("1", "listening"), q("2", "listening"), q("3", "listening")], { 1: "a", 2: SKIPPED_AUDIO, 3: "b" }), { correct: 1, skipped: 1 });
  });
  it("only listening may be skipped", () => {
    assert.throws(() => checkInCorrectCounts([q("1", "reading")], { 1: SKIPPED_AUDIO }));
  });
});

describe("practice never serves assessment-bank items", () => {
  it("does not query placement questions or prompts as practice fallback", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./learner-plan.ts", import.meta.url), "utf8");
    assert.ok(!src.includes("approvedBankFallback"), "practice must not select assessment-bank questions or prompts");
  });
});
