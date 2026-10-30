// Regression: ISSUE-001 — AI tutor replies mixing Persian and French showed every line right to left
// Found by /qa on 2026-10-29
// Report: .gstack/qa-reports/qa-report-parle-preview-2026-10-29.md
import { describe, expect, test } from "bun:test";
import { textLines } from "./text-lines";

describe("textLines", () => {
  test("keeps a Persian line and a French line apart so each picks its own direction", () => {
    const reply = "سلام! من پارل هستم.\n\nVotre objectif est l’immigration au Canada.";
    expect(textLines(reply)).toEqual(["سلام! من پارل هستم.", " ", "Votre objectif est l’immigration au Canada."]);
  });

  test("treats Windows and old Mac line breaks like plain ones", () => {
    expect(textLines("Bonjour\r\nSalut\rCoucou")).toEqual(["Bonjour", "Salut", "Coucou"]);
  });

  test("a single line stays one line, and empty text gives one blank line", () => {
    expect(textLines("Bonjour !")).toEqual(["Bonjour !"]);
    expect(textLines("")).toEqual([" "]);
  });
});
