import { describe, it, expect } from "bun:test";
import { promptProblems, questionProblems } from "../scripts/lib/bank-rules";

const good = {
  demo_code: "LB-LISTENING-A2-001", skill: "listening", cefr_level: "A2", format: "multiple_choice",
  prompt: "Dans ce dialogue, que signifie le verbe « arroser » ?", passage: "",
  transcript: "A : Je pense que j'ai oublié de les arroser.\nB : Il faut être prudent avec le dosage.",
  options: [{ id: "o_a", text: "couper les feuilles" }, { id: "o_b", text: "donner de l'eau aux plantes" }, { id: "o_c", text: "acheter des plantes" }],
  answer_option_id: "o_b", answer: "donner de l'eau aux plantes", explanation: "She forgot to water them.",
};

describe("the bank's rules, shared by the audit and the import (Plan 13)", () => {
  it("a sound question has no problems", () => expect(questionProblems(good)).toEqual([]));
  it("names each broken rule", () => {
    expect(questionProblems({ ...good, options: [good.options[0]] }).join()).toContain("options");
    expect(questionProblems({ ...good, options: [...good.options, { id: "o_a", text: "x" }] }).join()).toContain("duplicate option ids");
    expect(questionProblems({ ...good, answer_option_id: "o_z" }).join()).toContain("not one of the options");
    expect(questionProblems({ ...good, answer: "autre chose" }).join()).toContain("differs from the correct option");
    expect(questionProblems({ ...good, explanation: "" }).join()).toContain("no explanation");
    expect(questionProblems({ ...good, transcript: "" }).join()).toContain("without a transcript");
  });
  it("prompts need text, a known kind and a level", () => {
    expect(promptProblems({ text: "Écrivez un courriel.", kind: "writing", cefr_level: "B1", track: "all" })).toEqual([]);
    expect(promptProblems({ text: "", kind: "drawing", cefr_level: "C1", track: "all" })).toHaveLength(3);
  });
});
