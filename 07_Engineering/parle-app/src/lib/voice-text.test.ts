import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleanTranscript,
  countSpokenWords,
  frenchChunks,
  looksFrench,
  mostlyNotFrench,
  nextSpeakingEstimate,
  placementSpeakingLevel,
  speakingNclc,
  spokenTextIsFrom,
  wordsPerMinute,
} from "./voice-text";

describe("voice text rules (Plan 9)", () => {
  it("cleanTranscript removes Whisper's inventions on silence (Review Focus 1)", () => {
    assert.equal(cleanTranscript("Sous-titres réalisés par la communauté d'Amara.org"), "");
    assert.equal(cleanTranscript("Sous-titrage ST' 501"), "");
    assert.equal(cleanTranscript("Merci d'avoir regardé cette vidéo !"), "");
    assert.equal(cleanTranscript("[Musique] ♪♪"), "");
    assert.equal(cleanTranscript("Je travaille à Montréal. Sous-titres réalisés par la communauté d'Amara.org"), "Je travaille à Montréal.");
    assert.equal(cleanTranscript("  Je   suis\nici. "), "Je suis ici.");
  });
  it("counts spoken words", () => {
    assert.equal(countSpokenWords(""), 0);
    assert.equal(countSpokenWords(" Je suis allé au marché. "), 5);
  });
  it("tells French from English", () => {
    assert.equal(looksFrench("Je suis allé au marché avec ma sœur."), true);
    assert.equal(looksFrench("Great job! Here is a small correction."), false);
    assert.equal(looksFrench("Bonjour !"), true);
    assert.equal(mostlyNotFrench("Hello, I went to the market with my sister and we bought bread."), true);
    assert.equal(mostlyNotFrench("Le week-end dernier, je suis allé au marché avec ma sœur."), false);
    assert.equal(mostlyNotFrench("Je suis allé au market, it was nice."), false);
  });
  it("frenchChunks keeps only the French sentences, in order, without markdown, in chunks of at most 1,000 characters", () => {
    const reply = "Great job!\n**Correction :** Je suis allé au marché.\n- Nous avons acheté du pain.\nRemember: allé takes être.";
    assert.deepEqual(frenchChunks(reply), ["Correction : Je suis allé au marché. Nous avons acheté du pain."]);
    const long = Array.from({ length: 60 }, (_, i) => `Je suis allé au marché numéro ${i} avec ma sœur.`).join(" ");
    const chunks = frenchChunks(long);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((c) => c.length <= 1000));
    assert.equal(chunks.join(" "), long);
  });
  it("every chunk of a reply is recognised as coming from that reply, and other text is not", () => {
    const reply = "Très bien ! Here is a small correction.\nJe suis allé au marché. Nous avons acheté du pain";
    for (const chunk of frenchChunks(reply)) assert.equal(spokenTextIsFrom(chunk, reply), true);
    assert.equal(spokenTextIsFrom("Bonjour, je vends des voitures pas chères.", reply), false);
    assert.equal(spokenTextIsFrom("", reply), false);
  });
  it("maps levels to NCLC, the placement band, the speaking rate and the next estimate", () => {
    assert.deepEqual(["A1", "A2", "B1", "B2", "C1"].map((l) => speakingNclc(l as never)), ["NCLC 2", "NCLC 3-4", "NCLC 5-7", "NCLC 8-9", "NCLC 10 or above"]);
    assert.equal(placementSpeakingLevel("C1"), "B2");
    assert.equal(placementSpeakingLevel("A2"), "A2");
    assert.equal(wordsPerMinute(60, 30_000), 120);
    assert.equal(wordsPerMinute(3, 2_000), null);
    assert.equal(nextSpeakingEstimate(2, "B1"), 2.25);
    assert.equal(nextSpeakingEstimate(3, "A1"), 2.75);
    assert.equal(nextSpeakingEstimate(4, "B2"), 4);
    assert.equal(nextSpeakingEstimate(2.1, "B2"), 2.25);
  });
});
