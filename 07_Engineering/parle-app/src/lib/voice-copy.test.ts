import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { t, type TranslationKey } from "./i18n";
import { publicInfoPages } from "./public-info-content";

const NEW_KEYS = [
  "voice.recorder.permissionNote", "voice.tooQuiet", "voice.notFrench", "voice.busy", "voice.scoreFailed", "voice.limit.answers",
  "voice.limit.messages", "voice.limit.replies", "voice.result.heard", "voice.result.estimate", "voice.result.correction",
  "voice.result.pronunciation", "voice.result.typed", "voice.task.intro", "voice.readAloudHelp", "voice.fallbackNote",
  "placement.section.speakingDescription", "placement.speaking.providerNote", "placement.speaking.noMic", "placement.result.transcriptCaveat",
  "adminListening.intro", "adminControl.setting.freeVoiceAnswers.help", "legal.privacyVoiceTitle", "legal.privacyVoiceBody",
  "publicInfo.aiTutor.voice", "publicInfo.levelEstimates.speakingBody", "publicInfo.faq.threeAnswer",
] as TranslationKey[];

describe("voice wording (Plan 9)", () => {
  it("no new string has an em dash", () => {
    for (const key of NEW_KEYS) assert.equal(t(key).includes("\u2014"), false, key);
  });
  it("uses the spec's exact messages", () => {
    assert.equal(t("voice.tooQuiet"), "We couldn't hear enough. Try again.");
    assert.equal(t("voice.notFrench"), "Answer in French to get a score.");
    assert.equal(t("voice.busy"), "Voice is busy. Try again in a moment.");
    assert.equal(t("voice.scoreFailed"), "We couldn't score this one. Try again.");
    assert.equal(t("voice.limit.answers"), "You've used today's spoken answers. Type your answer, or try again tomorrow.");
    assert.equal(t("voice.result.heard"), "What we heard");
    assert.equal(t("voice.result.pronunciation"), "Pronunciation isn't scored yet.");
  });
  it("no longer says speaking is not scored, and the privacy page names the speech provider", () => {
    for (const key of ["publicInfo.levelEstimates.speakingBody", "publicInfo.faq.threeAnswer"] as TranslationKey[]) assert.doesNotMatch(t(key), /not scored automatically/);
    assert.match(t("legal.privacyVoiceBody"), /NVIDIA/);
    assert.match(t("legal.privacyVoiceBody"), /does not store/);
    assert.ok(JSON.stringify(publicInfoPages.aiTutor).includes("publicInfo.aiTutor.voice"));
  });
});
