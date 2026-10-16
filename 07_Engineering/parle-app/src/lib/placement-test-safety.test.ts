import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { MemoryRouter } from "react-router-dom";
import { PageErrorBoundary } from "@/components/parle/PageErrorBoundary";
import PlacementTest from "@/pages/PlacementTest";
import { t } from "@/lib/i18n";
import {
  createAdaptiveRun,
  getNextQuestion,
  isQuestionItemReady,
  selectApprovedDemoQuestionItems,
  selectApprovedQuestionItems,
} from "@/lib/placement-test";
import { selectApprovedCheckInQuestionItems } from "@/lib/learner-plan";
import { selectPublicLevelCheckQuestions } from "../../functions/parle-public-level-check.helper.ts";

function placementQuestion(overrides: Record<string, unknown> = {}) {
  return {
    id: "question-valid",
    demo_code: "L-A1-01",
    skill: "listening",
    cefr_level: "A1",
    format: "multiple_choice",
    prompt: "Quel message avez-vous reçu ?",
    passage: "",
    transcript: "Le train part à midi.",
    options: [
      { id: "correct", text: "Le train part à midi." },
      { id: "other", text: "Le train part à dix heures." },
    ],
    answer_option_id: "correct",
    answer: "Le train part à midi.",
    explanation: "Le message indique midi.",
    status: "approved",
    is_test_data: true,
    ...overrides,
  };
}

type PublicSkill = "reading" | "listening";
type PublicLevel = "A1" | "A2" | "B1" | "B2";
const publicLevels: PublicLevel[] = ["A1", "A1", "A2", "B1", "B2"];

function publicQuestion(
  id: string,
  skill: PublicSkill,
  level: PublicLevel = "A1",
  status = "approved",
  options: unknown = [
    { id: "correct", text: `Réponse exacte pour ${id}` },
    { id: "other", text: `Autre réponse pour ${id}` },
  ],
) {
  return {
    id,
    demo_code: id,
    skill,
    cefr_level: level,
    format: "multiple_choice",
    prompt: `Question ${id}`,
    passage: skill === "reading" ? `Texte ${id}` : "",
    transcript: skill === "listening" ? `Message ${id}` : "",
    options,
    answer_option_id: "correct",
    answer: `Réponse exacte pour ${id}`,
    status,
    is_test_data: true,
  };
}

function balancedPublicBank() {
  return (["reading", "listening"] as const).flatMap((skill) =>
    publicLevels.map((level, index) => publicQuestion(`demo-${skill}-${index}`, skill, level)),
  );
}

describe("approved demo question safety", () => {
  it("skips null options and malformed option rows while keeping a valid question selectable", () => {
    const run = createAdaptiveRun("listening", "A1");
    const nullOptions = placementQuestion({
      id: "question-null-options",
      demo_code: "L-A1-00",
      options: null,
    });
    const malformedEntry = placementQuestion({
      id: "question-malformed-entry",
      demo_code: "L-A1-02",
      options: [
        { id: "correct", text: "Le train part à midi." },
        null,
        { id: "other", text: "Le train part à dix heures." },
      ],
    });
    const valid = placementQuestion();
    const invalidAnswerId = placementQuestion({
      id: "question-invalid-answer-id",
      demo_code: "L-A1-03",
      answer_option_id: "missing-option",
      answer: "Le train part à midi.",
    });
    const rows = [null, nullOptions, malformedEntry, invalidAnswerId, valid];

    assert.equal(isQuestionItemReady(null), false);
    assert.equal(isQuestionItemReady(placementQuestion({ options: null })), false);
    assert.deepEqual(selectApprovedDemoQuestionItems(rows).map((item) => item.id), ["question-valid"]);
    assert.equal(getNextQuestion(run, rows)?.id, "question-valid");
    assert.equal(getNextQuestion(run, [nullOptions, malformedEntry, invalidAnswerId]), null);
  });

  it("never serves draft, retired, or non-demo items", () => {
    const run = createAdaptiveRun("listening", "A1");
    const draft = placementQuestion({ id: "draft", demo_code: "L-A1-00", status: "draft" });
    const retired = placementQuestion({ id: "retired", demo_code: "L-A1-02", status: "retired" });
    const production = placementQuestion({ id: "production", demo_code: "L-A1-03", is_test_data: false });
    const approved = placementQuestion({ id: "approved", demo_code: "L-A1-04" });

    assert.equal(getNextQuestion(run, [draft, retired, production, approved])?.id, "approved");
    assert.equal(getNextQuestion(run, [draft, retired, production]), null);
    assert.deepEqual(selectApprovedDemoQuestionItems([draft, retired, production, approved]).map((item) => item.id), ["approved"]);
  });

  it("uses the guarded approved-demo selector for weekly check-in questions", () => {
    const selected = selectApprovedCheckInQuestionItems([
      null,
      placementQuestion({ id: "checkin-null", options: null }),
      placementQuestion({ id: "checkin-draft", status: "draft" }),
      placementQuestion({ id: "checkin-production", is_test_data: false }),
      placementQuestion({ id: "checkin-valid", demo_code: "L-A1-05" }),
    ]);

    assert.deepEqual(selected.map((item) => item.id), ["checkin-valid"]);
    assert.ok(selected.every((item) => item.status === "approved" && item.is_test_data));
  });
});

describe("public level-check question safety", () => {
  it("ignores draft and null-options rows without losing a balanced approved set", () => {
    const rows = [
      ...balancedPublicBank(),
      publicQuestion("draft-reading", "reading", "B2", "draft"),
      publicQuestion("null-options-reading", "reading", "B2", "approved", null),
    ];
    const selected = selectPublicLevelCheckQuestions(rows, () => 0.42);

    assert.ok(selected);
    assert.equal(selected.publicProjection.questions.length, 10);
    assert.equal(selected.publicProjection.questions.filter((question) => question.skill === "reading").length, 5);
    assert.equal(selected.publicProjection.questions.filter((question) => question.skill === "listening").length, 5);
    assert.ok(selected.publicProjection.questions.every((question) => question.id !== "draft-reading" && question.id !== "null-options-reading"));
    assert.ok(selected.privateMapping.questions.every((question) => question.questionId !== "draft-reading" && question.questionId !== "null-options-reading"));
  });
});

describe("placement test first render", () => {
  it("renders the loading state before effects or data requests run", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ["/placement-test"] },
        createElement(PlacementTest),
      ),
    );

    assert.match(markup, /role="status"/);
    assert.ok(markup.includes(t("placement.loading")));
    assert.doesNotMatch(markup, /Something went wrong on this page/);
  });
});

describe("routed page error recovery", () => {
  it("renders the requested recovery message and accessible Today link", () => {
    const boundary = new PageErrorBoundary({ children: createElement("p", null, "Page content") });
    boundary.state = PageErrorBoundary.getDerivedStateFromError(new Error("test rendering failure"));
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ["/placement-test"] }, boundary.render()),
    );

    assert.match(markup, /role="alert"/);
    assert.match(markup, /Something went wrong on this page/);
    assert.match(markup, /href="\/learner"/);
    assert.match(markup, /<a[^>]*href="\/learner"[^>]*>Back to Today/);
    assert.doesNotMatch(markup, /Page content/);
  });
});

describe("the question bank switch (bank readers fix)", () => {
  it("the real bank keeps only real items, and real items need no demo code", () => {
    const demo = placementQuestion({ id: "demo-1", demo_code: "L-A1-05" });
    const real = placementQuestion({ id: "real-1", demo_code: null, is_test_data: false });
    assert.deepEqual(selectApprovedQuestionItems([demo, real], "real").map((item) => item.id), ["real-1"]);
    assert.deepEqual(selectApprovedQuestionItems([demo, real], "demo").map((item) => item.id), ["demo-1"]);
    assert.equal(selectApprovedQuestionItems([real], "real")[0]?.demo_code, "real-1");
  });

  it("a run on the real bank never serves a demo item, even from a mixed list", () => {
    const run = { ...createAdaptiveRun("listening", "A1"), bankSource: "real" as const };
    const demo = placementQuestion({ id: "demo-2", demo_code: "L-A1-06" });
    const real = placementQuestion({ id: "real-2", demo_code: null, is_test_data: false });
    assert.equal(getNextQuestion(run, [demo, real])?.id, "real-2");
    assert.equal(getNextQuestion(run, [demo]), null);
  });

  it("the public level check uses only the bank the switch names", () => {
    const rows = [true, false].flatMap((isDemo) => ["reading", "listening"].flatMap((skill) => Array.from({ length: 6 }, (_, i) => placementQuestion({
      id: `${isDemo ? "d" : "r"}-${skill}-${i}`, demo_code: `${isDemo ? "D" : "R"}-${skill}-${i}`, skill, is_test_data: isDemo,
    }))));
    const demoSet = selectPublicLevelCheckQuestions(rows, () => 0.42, "demo");
    const realSet = selectPublicLevelCheckQuestions(rows, () => 0.42, "real");
    assert.ok(demoSet && demoSet.publicProjection.questions.every((q) => q.id.startsWith("d-")));
    assert.ok(realSet && realSet.publicProjection.questions.every((q) => q.id.startsWith("r-")));
  });
});
