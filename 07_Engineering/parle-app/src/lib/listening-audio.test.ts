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

describe("prepared audio that will not play (Plan 13 final review)", () => {
  const page = (name: string) => readFileSync(new URL(`../pages/${name}`, import.meta.url), "utf8");
  it("every assessment page plays listening audio through ListeningPlayer, which recovers from a failed file", () => {
    for (const name of ["PlacementTest.tsx", "LearnerWeeklyCheckin.tsx", "LevelCheck.tsx"]) {
      assert.ok(page(name).includes("<ListeningPlayer"), `${name} does not use ListeningPlayer`);
      assert.ok(!/<audio[^>]*audio_?[uU]rl/.test(page(name)), `${name} still plays a listening file without recovery`);
    }
    const player = readFileSync(new URL("../components/parle/ListeningPlayer.tsx", import.meta.url), "utf8");
    assert.ok(player.includes("onError"), "ListeningPlayer does not notice a failed file");
  });
  it("placement offers no skip while the answer feedback is shown (Minor 2)", () => {
    assert.ok(page("PlacementTest.tsx").includes("onGiveUp={answerFeedback ? undefined :"), "the feedback screen can still skip");
  });
  it("placement shows the explanation line only when there is one (listening feedback has none)", () => {
    assert.ok(page("PlacementTest.tsx").includes("{currentQuestion.explanation && "), "an empty explanation line is still shown");
  });
});

describe("no learner-facing line still calls listening a transcript (Plan 13 final review)", () => {
  it("the section description and the level check's count speak of audio", () => {
    for (const key of ["placement.section.listeningDescription", "publicLevelCheck.listeningCount", "placement.result.listeningCaveat"] as const) {
      assert.ok(!/transcript/i.test(t(key)), `${key}: ${t(key)}`);
    }
  });
  it("the transcript caveat shows only for an old 'transcript only' result", () => {
    const src = readFileSync(new URL("../pages/PlacementTest.tsx", import.meta.url), "utf8");
    assert.ok(src.includes('resultSnapshot.states.L === "transcript_only" ? "placement.result.transcriptCaveat" : "placement.result.listeningCaveat"'));
  });
});
