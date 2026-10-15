import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { itemStemIsMalformed, stemRepeatsAnswer, usablePracticeQuestions } from "../../functions/parle-item-stem.helper.ts";

describe("AI items whose stem already holds the answer (A21, D25 b)", () => {
  it("catches a subject written in the stem and again in the answer", () => {
    assert.equal(stemRepeatsAnswer("Hier, je ___ avec mon patron.", "j'ai parlé"), true);
    assert.equal(stemRepeatsAnswer("Hier, je ___ avec mon patron.", "j’ai parlé"), true);
    assert.equal(stemRepeatsAnswer("Elle ___ au marché.", "elle va"), true);
    assert.equal(stemRepeatsAnswer("Il a ___ une pomme.", "a mangé"), true);
  });
  it("keeps well-formed items", () => {
    assert.equal(stemRepeatsAnswer("Hier, j'___ mangé au restaurant.", "ai"), false);
    assert.equal(stemRepeatsAnswer("Je ___ content.", "suis"), false);
    assert.equal(stemRepeatsAnswer("___ suis content.", "Je"), false);
    assert.equal(stemRepeatsAnswer("Choisissez : depuis ou pendant ?", "depuis"), false);
  });
  it("keeps valid object and reflexive pronoun items (final review, Important 1)", () => {
    assert.equal(stemRepeatsAnswer("Je ___ en prie.", "vous"), false);
    assert.equal(stemRepeatsAnswer("Je ___ remercie.", "vous"), false);
    assert.equal(stemRepeatsAnswer("Nous ___ levons à 7 h.", "nous"), false);
    assert.equal(stemRepeatsAnswer("Vous ___ appelez comment ?", "vous"), false);
    assert.equal(stemRepeatsAnswer("Il ___ parle.", "nous"), false);
  });
  it("checks the correct option of an item", () => {
    const item = { prompt: "Hier, je ___ avec mon patron.", options: [{ id: "a", text: "j'ai parlé" }, { id: "b", text: "parlé" }], answer_option_id: "a" };
    assert.equal(itemStemIsMalformed(item), true);
    assert.equal(itemStemIsMalformed({ ...item, answer_option_id: "b" }), false);
  });
  it("all malformed questions leave none, so the bank is used (Review Focus 5)", () => {
    const bad = { prompt: "Nous ___ partis.", options: [{ id: "a", text: "nous sommes" }, { id: "b", text: "sommes" }], answer_option_id: "a" };
    assert.deepEqual(usablePracticeQuestions([bad, bad]), []);
    const src = readFileSync(new URL("../../functions/parle-assessment-service.ts", import.meta.url), "utf8");
    const filterAt = src.indexOf("usablePracticeQuestions(");
    assert.ok(filterAt > 0 && filterAt < src.indexOf("const contentIsUseful"), "questions are filtered before the usefulness check");
  });
});
