import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { listeningFailureView } from "./listening-audio";
import { t } from "./i18n";

describe("when listening audio will not load (Plan 13)", () => {
  it("in a test: try again first, then the learner may skip the question", () => {
    assert.deepEqual(listeningFailureView(0, true), { messageKey: null, canSkip: false });
    assert.deepEqual(listeningFailureView(1, true), { messageKey: "voice.listening.retry", canSkip: false });
    assert.deepEqual(listeningFailureView(2, true), { messageKey: "voice.listening.retry", canSkip: true });
  });
  it("in practice (text on the page): the existing note, never a skip", () => {
    assert.deepEqual(listeningFailureView(2, false), { messageKey: "voice.listening.unavailable", canSkip: false });
  });
  it("the wording exists", () => {
    for (const key of ["voice.listening.retry", "voice.listening.skip", "placement.listening.audioNotice", "publicLevelCheck.audioLabel"] as const) assert.notEqual(t(key), key);
  });
});

describe("assessment pages never show a listening transcript (Plan 13)", () => {
  const page = (name: string) => readFileSync(new URL(`../pages/${name}`, import.meta.url), "utf8");
  it("placement, the weekly check-in and the level check render no transcript text", () => {
    assert.ok(!/currentQuestion\.transcript/.test(page("PlacementTest.tsx")), "PlacementTest still renders the transcript");
    assert.ok(page("LearnerWeeklyCheckin.tsx").includes('kind !== "listening" && question.text.trim()'), "the check-in's text block is not limited to reading");
    assert.ok(!/currentQuestion\.transcript/.test(page("LevelCheck.tsx")), "LevelCheck still renders the transcript");
  });
});
