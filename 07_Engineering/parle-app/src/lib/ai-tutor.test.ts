import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { t } from "./i18n";
import {
  TutorConversationLog,
  TutorLimitNotice,
  TutorMessageComposer,
  parseTutorDiagnostic,
  allowanceFromPlanSummary,
  tutorPlanBadgeKey,
} from "../pages/LearnerTutorPlaceholder.tsx";
import { LearnerPlanContent, parseLearnerPlanSummary } from "../pages/LearnerPlan.tsx";
import { safeProfileImage } from "../pages/TutorDashboard.tsx";
import { accountPlanPath } from "../pages/Settings.tsx";
import {
  buildContextFirstMessage,
  buildTutorPrompt,
  calculateMiniTestScore,
  classifyTutorGuardrail,
  dailyMessageLimit,
  guardrailReply,
  localDateKey,
  localMonthKey,
  monthlyVoiceMinuteLimit,
  remainingDailyMessages,
  rollingMasteryScore,
  tutorExplanationRule,
  tutorLevelForEstimate,
  TUTOR_GUARDRAIL_POLICY,
} from "../../functions/parle-tutor.helper";
import {
  countUsageEventRows,
  handleTutorServiceAction,
  modeForTask,
  projectSavedTutorItems,
  resolveTutorTimeZone,
} from "../../functions/parle-tutor-service.helper.ts";
import {
  assignTutorServerOptionIds,
  isTutorOptionCorrect,
} from "../../functions/parle-tutor-answer-options.helper.ts";
import { lookupPremiumStatus } from "../../functions/parle-premium-status.helper.ts";
import { createSubscriptionCacheSignature, type SubscriptionCachePayload } from "../../functions/parle-stripe-subscription.logic.helper.ts";
import { setLearnerPremiumComp } from "../../functions/parle-admin-users.helper.ts";
import type { AdminActor } from "../../functions/parle-admin-settings.helper.ts";

describe("Parle AI tutor deterministic rules", () => {
  it("averages the ten latest valid topic items and scores a three-item mini-test", () => {
    assert.equal(rollingMasteryScore([100, 100, 100, 100, 100, 100, 100, 100, 100, 0, 0, 0]), 90);
    assert.equal(rollingMasteryScore([85, 65]), 75);
    assert.equal(rollingMasteryScore([]), 0);
    assert.equal(calculateMiniTestScore([true, false, true]), 67);
    assert.equal(calculateMiniTestScore([false, false, false]), 0);
    assert.equal(calculateMiniTestScore([true, true, true]), 100);
    assert.throws(() => calculateMiniTestScore([true, false]), RangeError);
  });

  it("assigns unique server IDs and balances correct positions across twenty lesson items", () => {
    let randomState = 0x12345678;
    const randomIndex = (upperBound: number) => {
      randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
      return randomState % upperBound;
    };
    const generated = Array.from({ length: 20 }, (_, index) => tutorItem(`balanced-${index}`));
    const assigned = assignTutorServerOptionIds(generated, {
      randomIndex,
      optionId: (itemId, _itemIndex, optionIndex) => `${itemId}-server-choice-${optionIndex}`,
    });
    const correctPositions = assigned.map((item) => {
      assert.ok(item.options.every((option) => option.id.startsWith(`${item.id}-server-choice-`)));
      return item.options.findIndex((option) => option.id === item.answer_option_id);
    });

    assert.deepEqual([...correctPositions].sort((left, right) => left - right), [...Array(10).fill(0), ...Array(10).fill(1)]);
    assert.equal(new Set(correctPositions).size, 2, "the correct answer must move across display positions");
  });

  it("scores the correct stable option ID at every display position", () => {
    for (let correctPosition = 0; correctPosition < 4; correctPosition += 1) {
      const options = Array.from({ length: 4 }, (_, optionIndex) => ({
        id: `item-${correctPosition}-choice-${optionIndex}`,
        text: `Choice ${optionIndex}`,
      }));
      const item = { id: `position-${correctPosition}`, options, answer_option_id: options[correctPosition]!.id };
      options.forEach((option, optionIndex) => {
        assert.equal(isTutorOptionCorrect(item, option.id), optionIndex === correctPosition);
      });
    }
  });

  it("stores server choice IDs and reloads the exact saved lesson order without exposing its answer key", async () => {
    const fixture = createTutorFixture();
    const provider = fakeProvider([openingResponse("lesson")]);
    const opened = await callTutor(fixture, provider, { action: "tutor_open_session", mode: "lesson" });
    assert.equal(opened.status, 200);
    const sessionId = opened.payload.session_id as string;
    const saved = savedTutorBundle(fixture, sessionId);

    for (const collection of ["practice_items", "mini_test"] as const) {
      const shown = opened.payload.lesson[collection] as Array<Record<string, any>>;
      const stored = saved[collection];
      const firstLoad = projectSavedTutorItems(sessionId, collection, stored);
      const secondLoad = projectSavedTutorItems(sessionId, collection, stored);
      assert.ok(firstLoad && secondLoad);
      assert.deepEqual(firstLoad.map((item) => item.options.map((option) => option.id)), stored.map((item) => item.options.map((option) => option.id)));
      assert.deepEqual(secondLoad.map((item) => item.options.map((option) => option.id)), firstLoad.map((item) => item.options.map((option) => option.id)));
      assert.deepEqual(shown.map((item) => item.options.map((option: SavedTutorChoice) => option.id)), firstLoad.map((item) => item.options.map((option) => option.id)));
      for (const item of shown) {
        assert.equal("answer_option_id" in item, false);
        assert.equal("legacy_option_identity" in item, false);
        assert.ok(item.options.every((option: Record<string, unknown>) => Object.keys(option).sort().join(",") === "id,text"));
      }
    }

    const savedBeforeScore = JSON.stringify(saved);
    const firstItem = saved.practice_items[0]!;
    const score = await callTutor(fixture, provider, {
      action: "tutor_grade_practice",
      session_id: sessionId,
      item_id: firstItem.id,
      option_id: savedOptionId(firstItem, true),
    });
    assert.equal(score.status, 200);
    assert.equal(score.payload.correct, true);
    assert.equal(JSON.stringify(savedTutorBundle(fixture, sessionId)), savedBeforeScore, "loading and scoring must not rewrite the saved choice order");
  });

  it("scores the original first legacy choice after a deterministic display shuffle", async () => {
    const fixture = createTutorFixture();
    const providerLesson = openingResponse("lesson");
    const provider = fakeProvider([providerLesson]);
    const opened = await callTutor(fixture, provider, { action: "tutor_open_session", mode: "lesson" });
    assert.equal(opened.status, 200);
    const initialSessionId = opened.payload.session_id as string;
    const opening = fixture.store.ai_message.find((row) => row.session_id === initialSessionId && row.sender === "tutor_ai");
    const session = fixture.store.ai_session.find((row) => row.id === initialSessionId);
    assert.ok(opening && session);

    const legacyItems = (items: Array<Record<string, any>>) => items.map((item) => {
      const legacy = { ...item, options: item.options.map((option: Record<string, string>) => option.text) };
      delete legacy.answer_option_id;
      return legacy;
    });
    const legacyBundle = {
      practice_items: legacyItems(providerLesson.practice_items as Array<Record<string, any>>),
      mini_test: legacyItems(providerLesson.mini_test as Array<Record<string, any>>),
    };
    const originalFeedback = JSON.parse(String(opening.feedback_json)) as Record<string, unknown>;
    opening.feedback_json = JSON.stringify({ ...originalFeedback, lesson_bundle: legacyBundle });

    let lessonId = initialSessionId;
    let projected = projectSavedTutorItems(lessonId, "practice_items", legacyBundle.practice_items);
    for (let attempt = 0; projected?.[0]?.options.findIndex((option) => option.originalIndex === 0) === 0 && attempt < 80; attempt += 1) {
      lessonId = `legacy-shuffle-session-${attempt}`;
      projected = projectSavedTutorItems(lessonId, "practice_items", legacyBundle.practice_items);
    }
    assert.ok(projected);
    const repeatedProjection = projectSavedTutorItems(lessonId, "practice_items", legacyBundle.practice_items);
    assert.deepEqual(repeatedProjection?.map((item) => item.options.map((option) => ({ id: option.id, text: option.text }))), projected.map((item) => item.options.map((option) => ({ id: option.id, text: option.text }))));
    const originalFirstChoice = projected[0]!.options.find((option) => option.originalIndex === 0);
    assert.ok(originalFirstChoice);
    assert.notEqual(projected[0]!.options.indexOf(originalFirstChoice), 0, "the legacy correct answer should be displayed after a shuffle");
    assert.equal(projected[0]!.legacy_option_identity, true);
    assert.notEqual(originalFirstChoice.id, "");

    session.id = lessonId;
    opening.session_id = lessonId;
    const wrongChoice = projected[1]!.options.find((option) => option.originalIndex === 1);
    assert.ok(wrongChoice);
    const wrongScore = await callTutor(fixture, provider, {
      action: "tutor_grade_practice",
      session_id: lessonId,
      item_id: projected[1]!.id,
      option_id: wrongChoice.id,
    });
    assert.equal(wrongScore.status, 200);
    assert.equal(wrongScore.payload.correct, false);

    const correctScore = await callTutor(fixture, provider, {
      action: "tutor_grade_practice",
      session_id: lessonId,
      item_id: projected[0]!.id,
      option_id: originalFirstChoice.id,
    });
    assert.equal(correctScore.status, 200);
    assert.equal(correctScore.payload.correct, true);
    assert.equal(correctScore.payload.answer, "Je vais au marché.");
    const unchangedSaved = JSON.parse(String(opening.feedback_json)).lesson_bundle as typeof legacyBundle;
    assert.equal(unchangedSaved.practice_items[0].options[0], "Je vais au marché.", "legacy saved choices remain in their original order and format");
  });

  it("resets daily and monthly message periods at the learner's local calendar boundary", () => {
    const beforeTehranMidnight = new Date("2026-10-12T20:29:00.000Z");
    const atTehranMidnight = new Date("2026-10-12T20:30:00.000Z");
    assert.equal(localDateKey(beforeTehranMidnight, "Asia/Tehran"), "2026-10-12");
    assert.equal(localDateKey(atTehranMidnight, "Asia/Tehran"), "2026-10-13");
    const beforeTorontoMidnight = new Date("2026-10-12T03:59:00.000Z");
    const atTorontoMidnight = new Date("2026-10-12T04:00:00.000Z");
    assert.equal(localDateKey(beforeTorontoMidnight, "America/Toronto"), "2026-10-11");
    assert.equal(localDateKey(atTorontoMidnight, "America/Toronto"), "2026-10-12");
    assert.equal(localDateKey(beforeTehranMidnight, "America/Toronto"), "2026-10-12");
    assert.equal(localDateKey(new Date("2026-11-01T04:30:00.000Z"), "America/Toronto"), "2026-11-01");
    assert.equal(localDateKey(new Date("2026-10-12T18:30:00.000Z"), "Asia/Kolkata"), "2026-10-13");
    assert.equal(localMonthKey(new Date("2026-11-01T00:30:00.000Z"), "America/Toronto"), "2026-10");
  });

  it("keeps every learner on Free until a Premium allowance is explicitly supplied", () => {
    assert.equal(dailyMessageLimit("free"), 10);
    assert.equal(dailyMessageLimit("premium"), 10);
    assert.equal(dailyMessageLimit("premium", true), 300);
    assert.equal(dailyMessageLimit("free", false, 12), 12);
    assert.equal(remainingDailyMessages(5, "free", false, 12), 7);
    assert.equal(monthlyVoiceMinuteLimit("premium"), 0);
    assert.equal(monthlyVoiceMinuteLimit("premium", true), 60);
    assert.equal(remainingDailyMessages(3, "free"), 7);
    assert.equal(remainingDailyMessages(12, "free"), 0);
  });

  it("counts append-only usage rows instead of mutable message totals", () => {
    const events = [
      { ai_messages: 0 },
      { ai_messages: -900 },
      { ai_messages: 700 },
      {},
    ];
    const used = countUsageEventRows(events);
    assert.equal(used, 4);
    assert.equal(remainingDailyMessages(used, "free"), 6);
    assert.equal(remainingDailyMessages(countUsageEventRows(Array.from({ length: 10 }, () => ({ ai_messages: 0 }))), "free"), 0);
  });

  it("counts the server's daily total row by its value, alongside append-only event rows", () => {
    assert.equal(countUsageEventRows([{ source_session_id: "daily-total", ai_messages: 4 }]), 4);
    assert.equal(countUsageEventRows([{ source_session_id: "daily-total", ai_messages: -3 }, {}]), 1);
    assert.equal(countUsageEventRows([{ source_session_id: "daily-total", ai_messages: 2 }, { ai_messages: 0 }]), 3);
  });

  it("falls back from an invalid Parle time zone to the learner profile, then UTC", () => {
    assert.equal(resolveTutorTimeZone("Invalid/Zone", "Asia/Tehran"), "Asia/Tehran");
    assert.equal(resolveTutorTimeZone("America/Toronto", "Asia/Tehran"), "America/Toronto");
    assert.equal(resolveTutorTimeZone("Invalid/Zone", "Still/Invalid"), "UTC");
  });

  it("allows task-linked tutor sessions only for AI lessons, speaking practice, and writing", () => {
    assert.equal(modeForTask("ai_lesson"), "lesson");
    assert.equal(modeForTask("speaking_practice"), "speaking");
    assert.equal(modeForTask("writing"), "writing");
    assert.equal(modeForTask("speaking_check"), null);
    assert.equal(modeForTask("weekly_checkin"), null);
  });

  it("uses simpler A0-A2 explanations and French-first B1-B2 explanations", () => {
    assert.equal(tutorLevelForEstimate(2.5), "A2");
    assert.equal(tutorLevelForEstimate(3), "B1");
    const A2 = tutorExplanationRule({ level: "A2", nativeLanguage: "English", explainInNative: false });
    const B2 = tutorExplanationRule({ level: "B2", nativeLanguage: "English", explainInNative: false });
    assert.match(A2, /very simple French/i);
    assert.match(A2, /English support/i);
    assert.match(B2, /French first/i);
    assert.match(B2, /no routine English translation/i);
  });

  it("uses the saved native-language preference for Persian, Arabic, Spanish, and Hindi", () => {
    for (const language of ["Persian", "Arabic", "Spanish", "Hindi"]) {
      const instruction = tutorExplanationRule({ level: "A1", nativeLanguage: language, explainInNative: true });
      assert.match(instruction, new RegExp(`only in the learner's saved language \\(${language}\\)`));
      assert.match(instruction, /explain every teaching point.*feedback note/i);
      assert.match(instruction, /do not switch to English/i);
      assert.match(instruction, /corrected forms, examples, prompts, answer options, and practice items in French/i);
      const opening = buildContextFirstMessage({
        level: "A1",
        nativeLanguage: language,
        explainInNative: true,
        goal: "Canadian citizenship",
        focus: "work and work experience",
      });
      assert.match(opening, /la citoyenneté canadienne/);
      assert.match(opening, /le français au travail et l’expérience professionnelle/);
      assert.doesNotMatch(opening, /Canadian citizenship|work and work experience/i);
      assert.match(opening, /\p{Script=Arabic}|\p{Script=Devanagari}|Tu meta es/u);
    }
  });

  it("uses translated native labels for the Canada immigration goal and work focus", () => {
    const labels = {
      Persian: { goal: "مهاجرت به کانادا", focus: "زبان فرانسوی در محیط کار" },
      Arabic: { goal: "الهجرة إلى كندا", focus: "الفرنسية في مكان العمل" },
      Spanish: { goal: "la inmigración a Canadá", focus: "el francés en el trabajo" },
      Hindi: { goal: "कनाडा में आप्रवासन", focus: "कार्यस्थल पर फ़्रेंच" },
    };
    for (const [language, expected] of Object.entries(labels)) {
      const opening = buildContextFirstMessage({
        level: "A1",
        nativeLanguage: language,
        explainInNative: true,
        goal: "Canadian immigration language goals",
        focus: "WORK",
      });
      const [nativeAnchor, frenchContext] = opening.split("\n\n");
      assert.ok(nativeAnchor?.includes(expected.goal), `${language} should use a translated immigration goal`);
      assert.ok(nativeAnchor?.includes(expected.focus), `${language} should use a translated work focus`);
      assert.doesNotMatch(nativeAnchor ?? "", /Canadian immigration language goals|WORK/);
      assert.equal(frenchContext, "Votre objectif est l’immigration au Canada. Cette semaine, nous nous concentrons sur le français au travail.");
    }
  });

  it("keeps untranslated custom French labels visible in the native opening", () => {
    const opening = buildContextFirstMessage({
      level: "A1",
      nativeLanguage: "Spanish",
      explainInNative: true,
      goal: "un parcours professionnel précis",
      focus: "des échanges au travail",
    });
    const [nativeAnchor, frenchContext] = opening.split("\n\n");
    assert.ok(nativeAnchor?.includes("un parcours professionnel précis"));
    assert.ok(nativeAnchor?.includes("des échanges au travail"));
    assert.equal(frenchContext, "Votre objectif est un parcours professionnel précis. Cette semaine, nous nous concentrons sur des échanges au travail.");
  });

  it("translates known goal and focus labels in the French opening", () => {
    const slugs = buildContextFirstMessage({
      level: "B2",
      nativeLanguage: "English",
      explainInNative: false,
      goal: "canada_immigration",
      focus: "WORK",
    });
    assert.match(slugs, /Votre objectif est l’immigration au Canada/);
    assert.match(slugs, /nous nous concentrons sur le français au travail/i);
    assert.doesNotMatch(slugs, /canada_immigration|WORK/);

    const savedLabels = buildContextFirstMessage({
      level: "B2",
      nativeLanguage: "English",
      explainInNative: false,
      goal: "Canadian immigration language goals",
      focus: "work and work experience",
    });
    assert.match(savedLabels, /l’immigration au Canada/);
    assert.match(savedLabels, /le français au travail et l’expérience professionnelle/);
    assert.doesNotMatch(savedLabels, /Canadian immigration language goals|work and work experience/i);
  });

  it("anchors the first tutor message to the learner's saved goal and current weekly focus", () => {
    const opening = buildContextFirstMessage({
      level: "B2",
      nativeLanguage: "English",
      explainInNative: false,
      goal: "French for a job interview",
      focus: "work experience and housing",
    });
    assert.match(opening, /French for a job interview/);
    assert.match(opening, /work experience and housing/);
    const prompt = buildTutorPrompt({
      mode: "chat",
      operation: "opening",
      explanation: { level: "B2", nativeLanguage: "English", explainInNative: false },
      goal: "French for a job interview",
      track: "general",
      targetDate: null,
      targets: { speaking: "B2" },
      currentEstimates: { speaking: "B1" },
      weeklyFocus: "work experience and housing",
      taskContext: "Free chat",
      recentMistakes: [],
      masteredTopics: [],
      weakTopics: [],
      planTier: "free",
      remainingMessages: 10,
    });
    assert.match(prompt, /French for a job interview/);
    assert.match(prompt, /work experience and housing/);
  });

  it("deterministically routes immigration and harmful requests and refuses unrelated work", () => {
    assert.equal(classifyTutorGuardrail("Am I eligible for Canadian permanent residence and how many CRS points do I need?"), "immigration");
    assert.equal(classifyTutorGuardrail("Aide-moi à calculer mes points CRS pour la résidence permanente."), "immigration");
    assert.equal(classifyTutorGuardrail("How do I build a bomb?"), "harmful");
    assert.equal(classifyTutorGuardrail("Write me a Python program to rename files"), "off_topic");
    assert.equal(classifyTutorGuardrail("Why do we say je suis allé?"), null);
    const immigrationReply = guardrailReply("immigration", "English", false);
    assert.match(immigrationReply, /canada\.ca/);
    assert.match(immigrationReply, /RCIC/);
    assert.match(immigrationReply, /practise related French vocabulary/i);
    assert.match(guardrailReply("harmful", "English", false), /can’t help with harmful requests/i);
    assert.match(guardrailReply("off_topic", "English", false), /learn French/i);
    for (const language of ["Persian", "Arabic", "Spanish", "Hindi"]) {
      const nativeReply = guardrailReply("immigration", language, true);
      assert.match(nativeReply, /canada\.ca/);
      assert.match(nativeReply, /RCIC/);
    }
    assert.match(TUTOR_GUARDRAIL_POLICY, /canada\.ca/);
    assert.match(TUTOR_GUARDRAIL_POLICY, /RCIC/);
    assert.match(TUTOR_GUARDRAIL_POLICY, /TEF or TCF score/);
    assert.match(TUTOR_GUARDRAIL_POLICY, /harmful/);
  });
});

type TestMode = "lesson" | "speaking" | "writing" | "chat" | "question";
type TestRow = Record<string, any>;
type ProviderCall = { prompt: string; schema: Record<string, unknown>; mode: "fast" | "standard" };
type ProviderResponder = (call: ProviderCall, index: number) => unknown | Promise<unknown>;

const TEST_USER = { id: "tutor-test-user", email: "learner@parle.test", role: "user" };
const TEST_ADMIN: AdminActor = {
  id: "tutor-test-admin",
  email: "admin@parle.test",
  full_name: "Parle Admin",
  role: "administrator",
};
const COMP_STATUS_SCHEMA = JSON.parse(
  readFileSync(new URL("../../entities/ParleCompStatus.json", import.meta.url), "utf8"),
) as { rls: Record<string, unknown> };
const PARLE_IDENTITY_SCHEMA = JSON.parse(
  readFileSync(new URL("../../entities/ParleIdentity.json", import.meta.url), "utf8"),
) as { properties: Record<string, { type?: string }>; rls: Record<string, unknown> };
const TEST_PROFILE = {
  id: "tutor-test-profile",
  user_id: TEST_USER.id,
  track: "citizenship",
  self_assessed_level: "A2",
  main_goal: "canadian_citizenship",
  target_date: "2027-06-01",
  target_per_skill: JSON.stringify({ listening: "B1", reading: "B1", writing: "B1", speaking: "B1" }),
  time_zone: "America/Toronto",
};
const FIXED_TUTOR_NOW = new Date("2026-10-12T23:00:00.000Z");

function createTutorFixture(options: { compStatusRows?: TestRow[]; compStatusReadable?: boolean; stripe?: any; testStripeSecret?: string | null } = {}) {
  const names = ["ParleProfile", "ParleIdentity", "Subscriber", "app_setting", "ParleCompStatus", "admin_audit_log", "roadmap", "mistake_log", "topic_mastery", "skill_estimate", "week_plan", "usage_counter", "learner_task", "ai_session", "ai_message"];
  const store: Record<string, TestRow[]> = Object.fromEntries(names.map((name) => [name, []]));
  if (options.compStatusRows) store.ParleCompStatus = options.compStatusRows;
  store.ParleProfile.push({
    id: "parle-profile-test",
    user_id: TEST_USER.id,
    created_by: TEST_USER.email,
    native_language: "English",
    explain_in_native: false,
    time_zone: "America/Toronto",
  });
  store.ParleIdentity.push({
    id: "parle-identity-test",
    created_by: TEST_USER.email,
    role: "learner",
    created_at: "2026-01-01T00:00:00.000Z",
    premium_comp_active: false,
  });
  store.roadmap.push({
    id: "roadmap-test",
    user_id: TEST_USER.id,
    created_by: TEST_USER.email,
    profile_id: TEST_PROFILE.id,
    track: TEST_PROFILE.track,
  });
  const skillValues: Record<string, number> = { listening: 1, reading: 2, writing: 3, speaking: 4 };
  for (const [skill, value] of Object.entries(skillValues)) {
    store.skill_estimate.push({
      id: `estimate-${skill}`,
      user_id: TEST_USER.id,
      created_by: TEST_USER.email,
      roadmap_id: "roadmap-test",
      skill,
      value,
      state: "estimated",
    });
  }
  store.week_plan.push({
    id: "week-plan-test",
    user_id: TEST_USER.id,
    created_by: TEST_USER.email,
    roadmap_id: "roadmap-test",
    status: "active",
    week_start_local: "2026-10-12",
    total_minutes: 50,
    what_changed_note: "The current plan keeps work and appointments in focus.",
    allocation_json: JSON.stringify({
      weekStartDate: "2026-10-12",
      weekEndDate: "2026-10-18",
      scheduledTaskMinutes: 50,
      plannedLearningMinutes: 50,
      dailyLimits: Object.fromEntries(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"].map((date) => [date, 36])),
      dailyMinutes: Object.fromEntries(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"].map((date, index) => [date, index === 0 ? 30 : index === 1 ? 20 : 0])),
      tasks: [
        { id: "seed-ai-lesson", date: "2026-10-12", type: "ai_lesson", skill: "listening", minutes: 30, topic: "work", reason: "weekly_practice", reasonSkill: "listening", status: "planned", rolloverCount: 0, optional: false },
        { id: "seed-writing", date: "2026-10-13", type: "writing", skill: "writing", minutes: 20, topic: "appointments", reason: "weekly_practice", reasonSkill: "writing", status: "planned", rolloverCount: 0, optional: false },
      ],
    }),
  });

  let sequence = 0;
  const entities: Record<string, any> = {};
  for (const name of names) {
    entities[name] = {
      filter: async (filters: Record<string, unknown> = {}, sort = "", limit = 100) => {
        const readableRows = name === "ParleCompStatus"
          ? options.compStatusReadable === false
            ? []
            : store[name].filter((row) => row.user_id === TEST_USER.id)
          : store[name];
        const matching = readableRows.filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
        const field = sort.startsWith("-") ? sort.slice(1) : sort;
        const direction = sort.startsWith("-") ? -1 : 1;
        const ordered = [...matching].sort((left, right) => {
          if (!field) return 0;
          return direction * String(left[field] ?? "").localeCompare(String(right[field] ?? ""));
        });
        return structuredClone(ordered.slice(0, limit));
      },
      create: async (values: TestRow) => {
        const now = new Date().toISOString();
        const record = {
          ...structuredClone(values),
          id: `${name}-${++sequence}`,
          created_by: TEST_USER.email,
          created_at: now,
          updated_at: now,
        };
        store[name].push(record);
        return structuredClone(record);
      },
      update: async (id: string, values: TestRow) => {
        const record = store[name].find((row) => row.id === id);
        if (!record) throw new Error(`Missing fake ${name} row`);
        Object.assign(record, structuredClone(values), { updated_at: new Date().toISOString() });
        return structuredClone(record);
      },
      delete: async (id: string) => {
        const index = store[name].findIndex((row) => row.id === id);
        if (index >= 0) store[name].splice(index, 1);
      },
    };
  }
  const accessLog = { canonicalCompLookups: 0, legacyCompFilters: 0 };
  const legacyEntities = {
    ...entities,
    ParleCompStatus: {
      filter: async () => {
        accessLog.legacyCompFilters += 1;
        return [];
      },
    },
  };
  const client = {
    auth: {
      list: async () => structuredClone([{
        id: TEST_USER.id,
        email: TEST_USER.email,
        full_name: "Test Learner",
        role: TEST_USER.role,
        created_at: "2026-01-01T00:00:00.000Z",
      }]),
    },
    entities: legacyEntities,
    entity(name: string) {
      if (name === "ParleCompStatus") accessLog.canonicalCompLookups += 1;
      return entities[name];
    },
  };
  return { client, store, accessLog, stripe: options.stripe ?? null, testStripeSecret: options.testStripeSecret ?? null };
}

function fakeProvider(outputs: readonly unknown[] | ProviderResponder) {
  const calls: ProviderCall[] = [];
  const queue = typeof outputs === "function" ? null : [...outputs];
  const responder = typeof outputs === "function" ? outputs : null;
  const provider = {
    calls,
    complete: async (prompt: string, schema: Record<string, unknown>, mode: "fast" | "standard" = "standard") => {
      const call = { prompt, schema, mode };
      calls.push(call);
      const output = responder ? await responder(call, calls.length - 1) : queue?.shift();
      if (output instanceof Error) throw output;
      return output === undefined ? tutorResponse() : structuredClone(output);
    },
  };
  return provider;
}

function tutorResponse(overrides: Record<string, unknown> = {}) {
  return {
    reply: "Très bien. On va pratiquer une phrase à la fois.",
    scenario: "",
    writing_prompt: "",
    corrected_text: "Je vais au marché.",
    feedback_summary: "La réponse correspond à la consigne.",
    task_completion_feedback: "Voici un retour sur votre réponse.",
    grammar_feedback: "La structure est claire.",
    vocabulary_feedback: "Le vocabulaire convient au sujet.",
    optional_practice: "Essayez une autre phrase au présent.",
    practice_items: [],
    mini_test: [],
    corrections: [],
    ...overrides,
  };
}

function tutorItem(id: string, area: "grammar" | "vocabulary" | "structure" = "grammar") {
  return {
    id,
    prompt: `Choisissez la forme correcte pour ${id}.`,
    area,
    example_sentence: "Je vais au marché après le travail.",
    options: [
      { id: "correct", text: "Je vais au marché." },
      { id: "incorrect", text: "Je va au marché." },
    ],
    answer_option_id: "correct",
    explanation: "Avec je, le verbe aller prend la forme vais.",
  };
}

function openingResponse(mode: TestMode) {
  const lesson = mode === "lesson";
  return tutorResponse({
    reply: "Commençons avec une courte activité en français.",
    scenario: mode === "speaking" ? "Décrivez une journée de travail en deux phrases." : "",
    writing_prompt: mode === "writing" ? "Écrivez un court message pour demander un rendez-vous." : "",
    practice_items: lesson ? [tutorItem("practice-1"), tutorItem("practice-2", "vocabulary"), tutorItem("practice-3", "structure")] : [],
    mini_test: lesson ? [tutorItem("test-1"), tutorItem("test-2", "vocabulary"), tutorItem("test-3", "structure")] : [],
  });
}

async function seedPaidSubscriptionCache(
  fixture: ReturnType<typeof createTutorFixture>,
  overrides: Partial<SubscriptionCachePayload> = {},
) {
  const payload: SubscriptionCachePayload = {
    userId: TEST_USER.id,
    customerId: "cus_tutor_test_123",
    subscriptionId: "sub_tutor_test_123",
    plan: "premium_monthly",
    status: "active",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: "2026-11-12T23:00:00.000Z",
    lastConfirmedAt: FIXED_TUTOR_NOW.toISOString(),
    ...overrides,
  };
  const signature = await createSubscriptionCacheSignature(payload, "sk_test_parle_ai_tutor_test");
  fixture.testStripeSecret = "sk_test_parle_ai_tutor_test";
  fixture.store.Subscriber.push({
    id: `subscriber-${payload.subscriptionId}`,
    user_id: TEST_USER.id,
    email: TEST_USER.email,
    created_by: TEST_USER.email,
    stripe_customer_id: payload.customerId,
    stripe_subscription_id: payload.subscriptionId,
    stripe_checkout_session_id: "cs_test_tutor_123",
    plan: payload.plan,
    stripe_status: payload.status,
    cancel_at_period_end: payload.cancelAtPeriodEnd,
    current_period_end: payload.currentPeriodEnd,
    last_confirmed_at: payload.lastConfirmedAt,
    cache_signature: signature,
    updated_at: FIXED_TUTOR_NOW.toISOString(),
  });
}

async function callTutor(
  fixture: ReturnType<typeof createTutorFixture>,
  provider: ReturnType<typeof fakeProvider>,
  body: Record<string, unknown>,
  now?: Date,
  identity = fixture.store.ParleIdentity.find((row) => row.created_by === TEST_USER.email && row.role === "learner"),
) {
  const response = await (handleTutorServiceAction as any)({
    client: fixture.client,
    user: TEST_USER,
    identity,
    profile: TEST_PROFILE,
    body,
    provider,
    origin: null,
    now,
    stripe: fixture.stripe,
    testStripeSecret: fixture.testStripeSecret,
  });
  return { status: response.status as number, payload: await response.json() as Record<string, any> };
}

type SavedTutorChoice = { id: string; text: string };
type SavedTutorQuestion = { id: string; options: SavedTutorChoice[]; answer_option_id: string };
type SavedTutorBundle = { practice_items: SavedTutorQuestion[]; mini_test: SavedTutorQuestion[] };

function savedTutorBundle(fixture: ReturnType<typeof createTutorFixture>, sessionId: string): SavedTutorBundle {
  const opening = fixture.store.ai_message.find((row) => row.session_id === sessionId && row.sender === "tutor_ai");
  assert.ok(opening, `saved tutor opening for ${sessionId} should exist`);
  const feedback = JSON.parse(String(opening.feedback_json)) as Record<string, unknown>;
  assert.ok(feedback.lesson_bundle && typeof feedback.lesson_bundle === "object");
  return feedback.lesson_bundle as SavedTutorBundle;
}

function savedOptionId(item: SavedTutorQuestion, correct: boolean): string {
  if (correct) return item.answer_option_id;
  return item.options.find((option) => option.id !== item.answer_option_id)?.id ?? "";
}

function activateCompStatus(fixture: ReturnType<typeof createTutorFixture>) {
  const identity = fixture.store.ParleIdentity.find((row) => row.created_by === TEST_USER.email && row.role === "learner");
  if (identity) identity.premium_comp_active = true;
  fixture.store.ParleCompStatus.push({
    id: "comp-status-test",
    user_id: TEST_USER.id,
    plan: "premium_comp",
    status: "active",
    created_by: TEST_ADMIN.email,
  });
}

function recordAdminCompGrant(fixture: ReturnType<typeof createTutorFixture>) {
  fixture.store.admin_audit_log.push({
    id: "admin-comp-grant-test",
    action: "user.premium_comp_granted",
    target_type: "user",
    target_id: TEST_USER.id,
    actor_user_id: TEST_ADMIN.id,
    actor_label: TEST_ADMIN.full_name,
    old_value: JSON.stringify({ active: false }),
    new_value: JSON.stringify({ active: true, reason: "Tutor comp regression test" }),
    occurred_at_utc: new Date(Date.now() - 60_000).toISOString(),
    created_by: TEST_ADMIN.email,
    created_at: new Date(Date.now() - 60_000).toISOString(),
  });
}

function seedTutorUsage(fixture: ReturnType<typeof createTutorFixture>, count: number, now = new Date()) {
  const dayKey = localDateKey(now, "America/Toronto");
  for (let index = 0; index < count; index += 1) {
    fixture.store.usage_counter.push({
      id: `seed-usage-${index}`,
      user_id: TEST_USER.id,
      created_by: TEST_USER.email,
      period: "day",
      period_key: dayKey,
      ai_messages: 1,
    });
  }
}

function saveTutorSetting(fixture: ReturnType<typeof createTutorFixture>, key: string, value: number | boolean) {
  const existing = fixture.store.app_setting.find((row) => row.key === key);
  if (existing) {
    existing.value = String(value);
    existing.updated_at = new Date().toISOString();
    return;
  }
  fixture.store.app_setting.push({ id: `setting-${key}`, key, value: String(value), updated_at: new Date().toISOString() });
}

function seedLanguagePointMastery(fixture: ReturnType<typeof createTutorFixture>, itemScore = 100) {
  fixture.store.topic_mastery.push({
    id: "prior-french-grammar-point",
    user_id: TEST_USER.id,
    created_by: TEST_USER.email,
    session_id: "earlier-lesson-session",
    skill: "listening",
    topic: "general_conversation",
    theme: "general_conversation",
    language_point: "French grammar point",
    language_point_key: "french-grammar-point",
    source: "mini_test",
    item_key: "earlier-lesson-session:mini_test:prior-point",
    item_score: itemScore,
    rolling_score: itemScore,
    language_point_rolling_score: itemScore,
    created_at: "2026-10-10T12:00:00.000Z",
  });
}

function seedTask(fixture: ReturnType<typeof createTutorFixture>, type: string, skill: string, topic = "work") {
  const id = `task-${type}`;
  fixture.store.learner_task.push({
    id,
    user_id: TEST_USER.id,
    created_by: TEST_USER.email,
    type,
    skill,
    topic,
    minutes: 15,
    status: "planned",
    content_json: JSON.stringify({ title: `Saved ${type} activity`, text: "Une courte activité de français." }),
  });
  return id;
}

function providerError(status: number) {
  return Object.assign(new Error(`Provider failure ${status}: private prompt and token text`), { status });
}

function collectReactButtons(node: unknown): Array<{ type: unknown; props: Record<string, unknown> }> {
  if (Array.isArray(node)) return node.flatMap(collectReactButtons);
  if (!node || typeof node !== "object" || !("type" in node) || !("props" in node)) return [];
  const element = node as { type: unknown; props: Record<string, unknown> };
  const own = element.type === "button" ? [element] : [];
  return [...own, ...collectReactButtons(element.props.children)];
}

describe("AI tutor limit notices", () => {
  const timeZone = TEST_PROFILE.time_zone;
  const limitMessage = t("learner.tutor.limitBody", { timeZone });
  const renderedLimitMessage = limitMessage
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

  function renderLimitNotice(props: { limitReached: boolean; showUpgradeLink: boolean; timeZone: string }) {
    return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(TutorLimitNotice, props)));
  }

  function renderComposer(mode: "chat" | "question" | "speaking" | "writing", limitReached: boolean, overrides: Record<string, unknown> = {}) {
    return renderToStaticMarkup(createElement(TutorMessageComposer, {
      mode,
      value: "Je voudrais corriger cette phrase.",
      onChange: () => undefined,
      onSubmit: () => undefined,
      busy: false,
      limitReached,
      sessionEnded: false,
      timeZone,
      ...overrides,
    }));
  }

  it("shows the Free limit message, saved time zone, and linked Premium plan line", async () => {
    const fixture = createTutorFixture();
    seedTutorUsage(fixture, 10, FIXED_TUTOR_NOW);
    const limited = await callTutor(
      fixture,
      fakeProvider([]),
      { action: "tutor_open_session", mode: "chat" },
      FIXED_TUTOR_NOW,
    );
    assert.equal(limited.status, 200);
    assert.equal(limited.payload.status, "limit");
    assert.equal(limited.payload.messages_remaining, 0);
    assert.equal(limited.payload.messages_limit, 10);
    assert.equal(limited.payload.plan_tier, "free");
    const diagnostic = parseTutorDiagnostic(limited.payload.diagnostic);
    assert.ok(diagnostic);
    assert.deepEqual(diagnostic, {
      tier: "free",
      limitApplied: 10,
      messagesCountedToday: 10,
      localDayKey: "2026-10-12",
      compRecordFound: false,
      recordType: "ParleIdentity",
      lookupField: "created_by",
      learnerKeyType: "email",
      statusField: "premium_comp_active",
    });

    const markup = renderLimitNotice({
      limitReached: limited.payload.status === "limit",
      showUpgradeLink: limited.payload.plan_tier === "free",
      timeZone,
    });
    assert.ok(markup.includes(renderedLimitMessage));
    assert.ok(markup.includes("Premium gives you more room - "));
    assert.ok(markup.includes('href="/learner/plan"'));
    assert.ok(markup.includes(t("learner.plan.seeYourPlan")));
    assert.doesNotMatch(markup, /Diagnostic \(demo\)|ParleIdentity|created_by|premium_comp_active/i);
    assert.ok(!markup.includes(TEST_USER.id));
    assert.ok(!markup.includes(TEST_USER.email));
  });

  it("hides the upgrade line for complimentary and paid Premium limit responses", async () => {
    for (const source of ["complimentary", "paid"] as const) {
      const fixture = createTutorFixture();
      if (source === "complimentary") activateCompStatus(fixture);
      else await seedPaidSubscriptionCache(fixture);
      seedTutorUsage(fixture, 300, FIXED_TUTOR_NOW);

      const limited = await callTutor(
        fixture,
        fakeProvider([]),
        { action: "tutor_open_session", mode: "chat" },
        FIXED_TUTOR_NOW,
      );
      assert.equal(limited.payload.status, "limit", `${source} Premium reaches its effective fair-use limit`);
      assert.equal(limited.payload.plan_tier, "premium", `${source} Premium uses the effective Premium tier`);
      assert.equal(limited.payload.limit_reason, "premium_fair_use");

      const markup = renderLimitNotice({
        limitReached: limited.payload.status === "limit",
        showUpgradeLink: limited.payload.plan_tier === "free",
        timeZone,
      });
      assert.ok(markup.includes(renderedLimitMessage));
      assert.doesNotMatch(markup, /Premium gives you more room|See your plan|href="\/learner\/plan"/);
    }
  });

  it("keeps the current empty conversation and enabled composer below the limit", () => {
    assert.equal(renderLimitNotice({ limitReached: false, showUpgradeLink: true, timeZone }), "");
    const emptyLog = renderToStaticMarkup(createElement(TutorConversationLog, {
      messages: [],
      limitReached: false,
      timeZone,
      frenchVoiceAvailable: false,
      onListen: () => undefined,
    }));
    assert.ok(emptyLog.includes(t("learner.tutor.emptyConversation")));
    assert.ok(!emptyLog.includes(renderedLimitMessage));

    for (const mode of ["chat", "question", "speaking", "writing"] as const) {
      const markup = renderComposer(mode, false);
      assert.doesNotMatch(markup, /<textarea[^>]*disabled=""/);
      assert.doesNotMatch(markup, /<button[^>]*disabled=""/);
      assert.ok(!markup.includes(renderedLimitMessage));
    }
  });

  it("disables every message composer at the limit and places the same reason beside it", () => {
    for (const mode of ["chat", "question", "speaking", "writing"] as const) {
      const markup = renderComposer(mode, true);
      assert.match(markup, /<textarea[^>]*disabled=""/);
      assert.match(markup, /<button[^>]*disabled=""/);
      assert.ok(markup.includes(renderedLimitMessage), `${mode} shows the time-zone reset reason`);
      assert.ok(markup.includes('aria-describedby="tutor-composer-limit-reason"'));
    }

    const transcriptMarkup = renderComposer("speaking", true, {
      transcriptPending: true,
      transcriptConfirmed: true,
      onConfirmTranscript: () => undefined,
      onSwitchToTyping: () => undefined,
    });
    assert.match(transcriptMarkup, /<textarea[^>]*disabled=""/);
    assert.match(transcriptMarkup, /<button[^>]*type="submit"[^>]*disabled=""/);
    assert.ok(transcriptMarkup.includes(renderedLimitMessage));
  });

  it("keeps earlier learner and tutor messages visible when a request reaches the limit", () => {
    const markup = renderToStaticMarkup(createElement(TutorConversationLog, {
      messages: [
        { id: "saved-learner-message", sender: "learner", text: "Je dois déplacer mon rendez-vous.", feedback: {} },
        { id: "saved-tutor-message", sender: "tutor_ai", text: "Voici une correction enregistrée.", feedback: {} },
      ],
      limitReached: true,
      timeZone,
      frenchVoiceAvailable: false,
      onListen: () => undefined,
    }));
    assert.ok(markup.includes("Je dois déplacer mon rendez-vous."));
    assert.ok(markup.includes("Voici une correction enregistrée."));
    assert.ok(!markup.includes(t("learner.tutor.emptyConversation")));
  });

  it("shows the same limit message in every tutor mode rejected by the server", async () => {
    const modes: TestMode[] = ["lesson", "speaking", "writing", "chat", "question"];
    for (const mode of modes) {
      const fixture = createTutorFixture();
      seedTutorUsage(fixture, 10, FIXED_TUTOR_NOW);
      const limited = await callTutor(
        fixture,
        fakeProvider([]),
        { action: "tutor_open_session", mode },
        FIXED_TUTOR_NOW,
      );
      assert.equal(limited.payload.status, "limit", `${mode} receives the existing server limit response`);
      const markup = renderLimitNotice({
        limitReached: limited.payload.status === "limit",
        showUpgradeLink: limited.payload.plan_tier === "free" && limited.payload.limit_reason !== "premium_fair_use",
        timeZone,
      });
      assert.ok(markup.includes(renderedLimitMessage), `${mode} shows the translated reset message`);
    }
  });
});

describe("Learner plan view", () => {
  it("uses the exact subscription labels, dates, and voice benefit text", () => {
    assert.equal(t("learner.plan.chooseMonthly"), "Upgrade monthly");
    assert.equal(t("learner.plan.chooseAnnual"), "Upgrade yearly");
    assert.equal(t("learner.plan.premiumMonthlyTitle"), "Premium plan (monthly)");
    assert.equal(t("learner.plan.premiumAnnualTitle"), "Premium plan (yearly)");
    assert.equal(t("learner.plan.refreshMyPlan"), "Refresh my plan");
    assert.equal(t("learner.plan.manageBilling"), "Manage billing");
    assert.equal(t("learner.plan.voiceMinutes"), "Live voice minutes per month");
    assert.equal(t("learner.plan.comingSoon"), "Coming soon");
  });

  it("shows saved Free usage and starts monthly or annual Checkout with a plan refresh action", () => {
    const summary = parseLearnerPlanSummary({
      status: "complete",
      summary: {
        plan_tier: "free",
        billing_source: "free",
        messages_used: 4,
        messages_limit: 12,
        free_messages_limit: 12,
        premium_messages_limit: 350,
        subscription_plan: null,
        subscription_status: null,
        current_period_end: null,
        cancel_at_period_end: false,
      },
    });
    assert.ok(summary);
    assert.deepEqual(summary, {
      planTier: "free",
      messagesUsed: 4,
      messagesLimit: 12,
      freeDailyMessages: 12,
      premiumDailyMessages: 350,
      billingSource: "free",
      subscriptionPlan: null,
      subscriptionStatus: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    const selected: string[] = [];
    const tree = LearnerPlanContent({
      summary,
      onCheckout: (plan) => selected.push(plan),
      onRefresh: () => selected.push("refresh"),
    });
    const buttons = collectReactButtons(tree);
    assert.equal(buttons.length, 3, "Free learners see both Checkout choices and a refresh action");
    for (const button of buttons) (button.props.onClick as () => void)();
    assert.deepEqual(selected, ["premium_monthly", "premium_annual", "refresh"]);

    const markup = renderToStaticMarkup(LearnerPlanContent({ summary }));
    assert.ok(markup.includes(t("learner.plan.freeTitle")));
    assert.ok(markup.includes(t("learner.plan.usageCount", { used: 4, limit: 12 })));
    assert.ok(markup.includes(t("learner.plan.freeDailyLabel")));
    assert.ok(markup.includes(t("learner.plan.premiumDailyLabel")));
    assert.ok(markup.includes(t("learner.plan.premiumMessagesBenefit", { limit: 350 })));
    assert.ok(markup.includes(t("learner.plan.voiceMinutes")));
    assert.ok(markup.includes(t("learner.plan.comingSoon")));
    assert.ok(markup.includes(t("learner.plan.roadmapBenefit")));
    assert.ok(markup.includes("$14.99 per month"));
    assert.ok(markup.includes("$119 per year"));
    assert.ok(markup.includes("Save 34%"));
    assert.ok(markup.includes(t("learner.plan.refreshMyPlan")));
    assert.doesNotMatch(markup, /Payment opens in the next step|href=\"https?:/i);
  });

  it("shows paid monthly or yearly status and billing actions without another Checkout option", () => {
    const summary = parseLearnerPlanSummary({
      status: "complete",
      summary: {
        plan_tier: "premium",
        billing_source: "paid",
        messages_used: 42,
        messages_limit: 360,
        free_messages_limit: 14,
        premium_messages_limit: 360,
        subscription_plan: "premium_annual",
        subscription_status: "cancelling",
        current_period_end: "2026-11-13T12:00:00.000Z",
        cancel_at_period_end: true,
      },
    });
    assert.ok(summary);
    assert.equal(summary.planTier, "premium");
    assert.equal(summary.billingSource, "paid");
    assert.equal(summary.subscriptionPlan, "premium_annual");
    assert.equal(summary.subscriptionStatus, "cancelling");

    const actions: string[] = [];
    const tree = LearnerPlanContent({ summary, onRefresh: () => actions.push("refresh"), onManageBilling: () => actions.push("portal") });
    const buttons = collectReactButtons(tree);
    assert.equal(buttons.length, 2, "paid Premium has refresh and manage billing, without a second Checkout button");
    for (const button of buttons) (button.props.onClick as () => void)();
    assert.deepEqual(actions, ["refresh", "portal"]);
    const markup = renderToStaticMarkup(tree);
    const date = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" }).format(new Date(summary.currentPeriodEnd!));
    assert.ok(markup.includes(t("learner.plan.premiumAnnualTitle")));
    assert.ok(markup.includes(t("learner.plan.cancelsOn", { date })));
    assert.ok(markup.includes(t("learner.plan.manageBilling")));
    assert.ok(markup.includes(t("learner.plan.refreshMyPlan")));
    assert.doesNotMatch(markup, /Upgrade monthly|Upgrade yearly|\$14\.99 per month|\$119 per year/);

    const monthly = parseLearnerPlanSummary({
      status: "complete",
      summary: {
        plan_tier: "premium", billing_source: "paid", messages_used: 0, messages_limit: 300,
        free_messages_limit: 10, premium_messages_limit: 300, subscription_plan: "premium_monthly",
        subscription_status: "active", current_period_end: "2026-11-13T12:00:00.000Z", cancel_at_period_end: false,
      },
    });
    assert.equal(monthly?.subscriptionPlan, "premium_monthly");
    const monthlyMarkup = renderToStaticMarkup(LearnerPlanContent({ summary: monthly! }));
    assert.ok(monthlyMarkup.includes(t("learner.plan.premiumMonthlyTitle")));
    assert.ok(monthlyMarkup.includes(t("learner.plan.renewalDate", { date })));
    assert.doesNotMatch(monthlyMarkup, /Cancels on/);
  });

  it("shows complimentary Premium without billing or refresh controls and fails unknown tiers closed", () => {
    const summary = parseLearnerPlanSummary({
      status: "complete",
      summary: {
        plan_tier: "premium",
        billing_source: "complimentary",
        messages_used: 42,
        messages_limit: 360,
        free_messages_limit: 14,
        premium_messages_limit: 360,
        subscription_plan: null,
        subscription_status: null,
        current_period_end: null,
        cancel_at_period_end: false,
      },
    });
    assert.ok(summary);
    const tree = LearnerPlanContent({ summary });
    const markup = renderToStaticMarkup(tree);
    assert.ok(markup.includes(t("learner.plan.premiumComplimentary")));
    assert.ok(markup.includes(t("learner.plan.usageCount", { used: 42, limit: 360 })));
    assert.ok(markup.includes(t("learner.plan.voiceMinutes")));
    assert.ok(markup.includes(t("learner.plan.comingSoon")));
    assert.equal(collectReactButtons(tree).length, 0);
    assert.doesNotMatch(markup, /Refresh my plan|Manage billing|Choose monthly|Choose annual|\$14\.99|\$119|Save 34%/);

    const unknownTier = parseLearnerPlanSummary({
      status: "complete",
      summary: { plan_tier: "unknown", messages_used: 0, free_messages_limit: 14, premium_messages_limit: 360 },
    });
    assert.equal(unknownTier?.planTier, "free", "unexpected server tiers fail closed to Free");
  });


  it("keeps the learner plan link protected and routes legacy public plan links to plans", () => {
    assert.equal(accountPlanPath({ role: "learner" }), "/learner/plan");
    assert.equal(accountPlanPath({ role: "tutor" }), "/plan");
    assert.equal(accountPlanPath({ role: "administrator" }), "/plan");
    assert.equal(accountPlanPath(null), "/plan");

    const roleShell = readFileSync(new URL("../pages/RoleShell.tsx", import.meta.url), "utf8");
    assert.match(roleShell, /path:\s*"\/learner\/plan",\s*label:\s*"role\.plan"/);
    assert.match(roleShell, /role === "learner" && path === "\/learner\/plan"\s*\? <LearnerPlan \/>/);
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    assert.match(app, /Route path="\/learner\/\*" element=\{<RoleShell role="learner" \/>\}/);
    assert.ok(app.includes('<Route path="/plan" element={<Navigate to={publicInfoRouteAliases["/plan"]} replace />} />'));
  });

  it("marks the photo checklist complete only for the same safe image shown in the preview", () => {
    const noPhoto = { display_name: "Camille Martin", photo_url: "https://profile.test/photo.jpg" };
    assert.equal(safeProfileImage(noPhoto), null, "initials or a raw URL do not count as the profile preview photo");
    assert.equal(safeProfileImage({ photo_base64: "not-used", photo_mime_type: "image/svg+xml" }), null);

    const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4a8AAAAASUVORK5CYII=";
    const safeImage = safeProfileImage({ photo_base64: base64, photo_mime_type: "image/png" });
    assert.equal(safeImage, `data:image/png;base64,${base64}`);
    assert.ok(Boolean(safeImage), "a supported image with data is available to render");

    const dashboard = readFileSync(new URL("../pages/TutorDashboard.tsx", import.meta.url), "utf8");
    assert.match(dashboard, /const image = safeProfileImage\(previewFields\);/);
    assert.match(dashboard, /complete: Boolean\(image\)/);
    assert.match(dashboard, /image \? <img src=\{image\}/);
  });
});

describe("Parle AI tutor service integration", () => {
  it("keeps Premium comp creation, updates, and removal administrator-only", () => {
    const adminOnly = { user_condition: { role: "administrator" } };
    assert.deepEqual(COMP_STATUS_SCHEMA.rls.create, adminOnly);
    assert.deepEqual(COMP_STATUS_SCHEMA.rls.update, adminOnly);
    assert.deepEqual(COMP_STATUS_SCHEMA.rls.delete, adminOnly);
    assert.deepEqual(COMP_STATUS_SCHEMA.rls.read, {
      $or: [
        { user_id: "{{user.id}}" },
        { user_condition: { role: "administrator" } },
      ],
    });
  });

  it("lets learners create only an inactive Premium projection and reserves changes for admins", () => {
    const adminOnly = { user_condition: { role: "administrator" } };
    assert.equal(PARLE_IDENTITY_SCHEMA.properties.premium_comp_active?.type, "boolean");
    assert.deepEqual(PARLE_IDENTITY_SCHEMA.rls.create, {
      $and: [
        { created_by: "{{user.email}}" },
        { premium_comp_active: false },
      ],
    });
    assert.deepEqual(PARLE_IDENTITY_SCHEMA.rls.read, {
      $or: [
        { created_by: "{{user.email}}" },
        { user_condition: { role: "administrator" } },
      ],
    });
    assert.deepEqual(PARLE_IDENTITY_SCHEMA.rls.update, adminOnly);
    assert.deepEqual(PARLE_IDENTITY_SCHEMA.rls.delete, adminOnly);
  });

  it("builds a read-only Free plan summary from the authenticated learner's saved settings and local-day usage", async () => {
    const fixture = createTutorFixture();
    fixture.store.ParleProfile[0].time_zone = "Asia/Tehran";
    saveTutorSetting(fixture, "free_ai_messages_per_day", 17);
    saveTutorSetting(fixture, "premium_fair_use_ai_messages_per_day", 360);
    const learnerDay = localDateKey(FIXED_TUTOR_NOW, "Asia/Tehran");
    const priorDay = localDateKey(new Date(FIXED_TUTOR_NOW.getTime() - 24 * 60 * 60 * 1000), "Asia/Tehran");
    fixture.store.usage_counter.push(
      { id: "local-day-1", user_id: TEST_USER.id, created_by: TEST_USER.email, period: "day", period_key: learnerDay, ai_messages: 1 },
      { id: "local-day-2", user_id: TEST_USER.id, created_by: TEST_USER.email, period: "day", period_key: learnerDay, ai_messages: 1 },
      { id: "previous-day-1", user_id: TEST_USER.id, created_by: TEST_USER.email, period: "day", period_key: priorDay, ai_messages: 1 },
      { id: "other-learner-today", user_id: "other-learner-id", created_by: "other-learner@parle.test", period: "day", period_key: learnerDay, ai_messages: 1 },
      { id: "month-counter", user_id: TEST_USER.id, created_by: TEST_USER.email, period: "month", period_key: localMonthKey(FIXED_TUTOR_NOW, "Asia/Tehran"), ai_messages: 1 },
    );
    fixture.store.ParleCompStatus.push({
      id: "admin-premium-row-must-not-be-read",
      user_id: TEST_USER.id,
      plan: "premium_comp",
      status: "active",
      created_by: TEST_ADMIN.email,
    });

    const usageBefore = structuredClone(fixture.store.usage_counter);
    const provider = fakeProvider([]);
    const result = await callTutor(fixture, provider, {
      action: "tutor_get_plan_summary",
      plan_tier: "premium",
      messages_used: 9999,
      messages_limit: 1,
    }, FIXED_TUTOR_NOW);

    assert.equal(result.status, 200);
    assert.deepEqual(result.payload.summary, {
      plan_tier: "free",
      messages_used: 2,
      messages_limit: 17,
      free_messages_limit: 17,
      premium_messages_limit: 360,
      billing_source: "free",
      subscription_plan: null,
      subscription_status: null,
      current_period_end: null,
      cancel_at_period_end: false,
    });
    assert.equal(learnerDay, "2026-10-13", "the saved Tehran time zone advances the local quota day");
    assert.equal("diagnostic" in result.payload, false, "plan summaries do not expose tutor diagnostic data");
    assert.equal(provider.calls.length, 0, "plan summaries never call the AI provider");
    assert.equal(fixture.store.ai_session.length, 0, "plan summaries never create sessions");
    assert.equal(fixture.store.ai_message.length, 0);
    assert.deepEqual(fixture.store.usage_counter, usageBefore, "plan summaries never write usage rows");
    assert.equal(fixture.accessLog.canonicalCompLookups, 0, "the summary does not read admin-created comp records");
    assert.equal(fixture.accessLog.legacyCompFilters, 0);
  });

  it("uses only the authenticated learner's explicit Premium identity for plan summaries", async () => {
    const fixture = createTutorFixture();
    activateCompStatus(fixture);
    saveTutorSetting(fixture, "free_ai_messages_per_day", 14);
    saveTutorSetting(fixture, "premium_fair_use_ai_messages_per_day", 333);
    seedTutorUsage(fixture, 7, FIXED_TUTOR_NOW);
    const provider = fakeProvider([]);
    const premium = await callTutor(fixture, provider, { action: "tutor_get_plan_summary" }, FIXED_TUTOR_NOW);
    assert.deepEqual(premium.payload.summary, {
      plan_tier: "premium",
      messages_used: 7,
      messages_limit: 333,
      free_messages_limit: 14,
      premium_messages_limit: 333,
      billing_source: "complimentary",
      subscription_plan: null,
      subscription_status: null,
      current_period_end: null,
      cancel_at_period_end: false,
    });

    const substitutedIdentity = {
      ...fixture.store.ParleIdentity[0],
      created_by: TEST_ADMIN.email,
    };
    const substituted = await callTutor(
      fixture,
      provider,
      { action: "tutor_get_plan_summary", plan_tier: "premium", messages_used: 1000 },
      FIXED_TUTOR_NOW,
      substitutedIdentity,
    );
    assert.equal(substituted.payload.summary.plan_tier, "free", "a non-learner-owned identity cannot select Premium");
    assert.equal(substituted.payload.summary.messages_used, 7);
    assert.equal(substituted.payload.summary.messages_limit, 14);
    assert.equal(provider.calls.length, 0);
    assert.equal(fixture.store.ai_session.length, 0);
    assert.equal(fixture.store.ai_message.length, 0);
    assert.equal(fixture.store.usage_counter.length, 7);
    assert.equal(fixture.accessLog.canonicalCompLookups, 0);
    assert.equal(fixture.accessLog.legacyCompFilters, 0);
  });

  it("opens and completes the five text modes with server-owned context and task links", async () => {
    const cases: Array<{ mode: TestMode; taskType?: string; skill: string }> = [
      { mode: "lesson", taskType: "ai_lesson", skill: "listening" },
      { mode: "speaking", taskType: "speaking_practice", skill: "speaking" },
      { mode: "writing", taskType: "writing", skill: "writing" },
      { mode: "chat", skill: "speaking" },
      { mode: "question", skill: "reading" },
    ];

    for (const testCase of cases) {
      const fixture = createTutorFixture();
      const taskId = testCase.taskType ? seedTask(fixture, testCase.taskType, testCase.skill, "appointments") : "";
      const provider = fakeProvider([openingResponse(testCase.mode), tutorResponse()]);
      const opened = await callTutor(fixture, provider, {
        action: "tutor_open_session",
        mode: testCase.mode,
        ...(taskId ? { task_id: taskId } : {}),
      });

      assert.equal(opened.status, 200, `${testCase.mode} opening should succeed`);
      assert.equal(opened.payload.status, "complete");
      assert.ok(opened.payload.session_id);
      assert.equal(opened.payload.context.messagesLimit, 10);
      assert.equal(opened.payload.skill, testCase.skill);
      assert.equal(opened.payload.context.currentEstimates[testCase.skill].level, tutorLevelForEstimate(({ listening: 1, reading: 2, writing: 3, speaking: 4 } as Record<string, number>)[testCase.skill]));
      assert.match(opened.payload.reply, /la citoyenneté canadienne et le français du quotidien/i);
      assert.match(opened.payload.reply, /les rendez-vous/);
      assert.match(provider.calls[0].prompt, /Canadian citizenship and everyday French/);
      assert.match(provider.calls[0].prompt, /appointments/);
      assert.match(provider.calls[0].prompt, new RegExp(opened.payload.context.currentEstimates[testCase.skill].level));
      if (taskId) {
        assert.equal(opened.payload.task.id, taskId);
        assert.match(provider.calls[0].prompt, new RegExp(`Saved ${testCase.taskType} activity`));
      }
      assert.equal(fixture.store.ai_message.length, 1, "the first AI reply should be saved");
      assert.equal(fixture.store.ai_message[0].sender, "tutor_ai");

      if (testCase.mode === "lesson") {
        const firstPractice = opened.payload.lesson.practice_items[0];
        const savedPractice = savedTutorBundle(fixture, opened.payload.session_id).practice_items.find((item) => item.id === firstPractice.id);
        assert.ok(savedPractice);
        const practiceResult = await callTutor(fixture, provider, {
          action: "tutor_grade_practice",
          session_id: opened.payload.session_id,
          item_id: firstPractice.id,
          option_id: savedOptionId(savedPractice, false),
        });
        assert.equal(practiceResult.status, 200);
        assert.equal(practiceResult.payload.correct, false);
        assert.equal(fixture.store.mistake_log.length, 1);
        assert.equal(fixture.store.mistake_log[0].skill, "listening");
        assert.equal(fixture.store.mistake_log[0].topic, "appointments");
        assert.equal(fixture.store.mistake_log[0].area, "grammar");
        assert.equal(fixture.store.mistake_log[0].example_sentence, "Je vais au marché après le travail.");

        const savedMiniTest = savedTutorBundle(fixture, opened.payload.session_id).mini_test;
        const answers = opened.payload.lesson.mini_test.map((item: Record<string, any>, index: number) => ({
          item_id: item.id,
          option_id: savedOptionId(savedMiniTest[index]!, index < 2),
        }));
        const miniTest = await callTutor(fixture, provider, { action: "tutor_submit_mini_test", session_id: opened.payload.session_id, answers });
        assert.equal(miniTest.status, 200);
        assert.equal(miniTest.payload.mastery_score, 67);
        assert.equal(fixture.store.topic_mastery.filter((row) => row.source === "mini_test").length, 3);
        assert.deepEqual(fixture.store.topic_mastery.filter((row) => row.source === "mini_test").map((row) => row.item_score), [100, 100, 0]);
        assert.equal(fixture.store.usage_counter.length, 0, "practice checks and mini-test submissions do not use learner-message allowance");
        assert.equal(fixture.store.ai_session[0].mastery_score, 67);

        const usageBeforeRetry = fixture.store.usage_counter.length;
        const masteryBeforeRetry = fixture.store.topic_mastery.length;
        const retry = await callTutor(fixture, provider, { action: "tutor_submit_mini_test", session_id: opened.payload.session_id, answers });
        assert.equal(retry.status, 200);
        assert.equal(retry.payload.mastery_score, 67);
        assert.equal(fixture.store.usage_counter.length, usageBeforeRetry);
        assert.equal(fixture.store.topic_mastery.length, masteryBeforeRetry);
      } else {
        const message = await callTutor(fixture, provider, {
          action: "tutor_send_message",
          session_id: opened.payload.session_id,
          text: testCase.mode === "writing" ? "Je suis alle au marche." : "Je voudrais pratiquer une phrase en français.",
        });
        assert.equal(message.status, 200, `${testCase.mode} reply should succeed`);
        assert.equal(message.payload.status, "complete");
        assert.match(provider.calls[1].prompt, new RegExp(opened.payload.context.currentEstimates[testCase.skill].level));
        if (testCase.mode === "speaking" || testCase.mode === "writing") assert.equal(message.payload.completed_response, true);
      }

      const finished = await callTutor(fixture, provider, { action: "tutor_finish_session", session_id: opened.payload.session_id });
      assert.equal(finished.status, 200, `${testCase.mode} session should finish after its mode flow`);
      if (taskId) assert.equal(finished.payload.completed_task_id, taskId);
    }
  });

  it("confirms Premium only from the authenticated learner's matching owner-readable identity projection", () => {
    const fixture = createTutorFixture();
    const identity = fixture.store.ParleIdentity[0];
    const freeStatus = {
      premium: false,
      compRecordFound: false,
      recordType: "ParleIdentity",
      lookupField: "created_by",
      learnerKeyType: "email",
      statusField: "premium_comp_active",
    };
    assert.deepEqual(lookupPremiumStatus(identity, TEST_USER.email), freeStatus, "a missing or false projection remains Free");

    const activeIdentity = { ...identity, premium_comp_active: true };
    assert.deepEqual(lookupPremiumStatus(activeIdentity, TEST_USER.email), {
      ...freeStatus,
      premium: true,
      compRecordFound: true,
    }, "a caller-owned active learner projection selects Premium");
    assert.equal(lookupPremiumStatus(activeIdentity, "other-learner@parle.test").premium, false, "another caller's email cannot use this projection");
    assert.equal(lookupPremiumStatus(null, TEST_USER.email).compRecordFound, false, "an empty caller-readable result fails closed");
    assert.equal(lookupPremiumStatus({ ...activeIdentity, role: "tutor" }, TEST_USER.email).premium, false, "a tutor identity does not grant learner Premium");
    assert.equal(lookupPremiumStatus({ ...activeIdentity, created_by: TEST_ADMIN.email }, TEST_USER.email).premium, false, "an administrator-created identity cannot be substituted");
    assert.equal(lookupPremiumStatus({ ...activeIdentity, premium_comp_active: 1 }, TEST_USER.email).premium, false, "only an explicit boolean grant is active");
    assert.throws(() => lookupPremiumStatus(activeIdentity, null), /authenticated learner email is required/i);
    assert.equal(fixture.accessLog.canonicalCompLookups, 0, "Premium resolution does not query administrator-created comp rows");
    assert.equal(fixture.accessLog.legacyCompFilters, 0, "Premium resolution does not use the legacy comp entity map");
  });

  it("keeps complimentary Premium ahead of a valid paid subscription cache", async () => {
    const fixture = createTutorFixture();
    await seedPaidSubscriptionCache(fixture);
    activateCompStatus(fixture);
    saveTutorSetting(fixture, "free_ai_messages_per_day", 14);
    saveTutorSetting(fixture, "premium_fair_use_ai_messages_per_day", 333);
    seedTutorUsage(fixture, 5, FIXED_TUTOR_NOW);

    const cachedSubscription = structuredClone(fixture.store.Subscriber[0]);
    const summary = await callTutor(fixture, fakeProvider([]), { action: "tutor_get_plan_summary" }, FIXED_TUTOR_NOW);
    assert.equal(summary.status, 200);
    assert.deepEqual(summary.payload.summary, {
      plan_tier: "premium",
      messages_used: 5,
      messages_limit: 333,
      free_messages_limit: 14,
      premium_messages_limit: 333,
      billing_source: "complimentary",
      subscription_plan: null,
      subscription_status: null,
      current_period_end: null,
      cancel_at_period_end: false,
    });
    assert.deepEqual(fixture.store.Subscriber[0], cachedSubscription, "the complimentary decision returns before paid cache reads or writes");

    const provider = fakeProvider([openingResponse("chat")]);
    const opened = await callTutor(fixture, provider, { action: "tutor_open_session", mode: "chat" }, FIXED_TUTOR_NOW);
    assert.equal(opened.status, 200);
    assert.equal(opened.payload.context.planTier, "premium");
    assert.equal(opened.payload.context.messagesLimit, 333);
    assert.equal(opened.payload.diagnostic.compRecordFound, true);
    assert.equal(provider.calls.length, 1);
  });

  it("reports the caller-readable Premium projection and applied daily quota in successful and limited tutor responses", async () => {
    const fixture = createTutorFixture();
    activateCompStatus(fixture);
    seedTutorUsage(fixture, 10, FIXED_TUTOR_NOW);
    assert.equal(fixture.store.ParleCompStatus[0].created_by, TEST_ADMIN.email, "the shared current row remains administrator-created");
    assert.equal(fixture.store.ParleCompStatus[0].user_id, TEST_USER.id, "admin comp records remain keyed to the account ID");
    assert.equal(fixture.store.ParleIdentity[0].created_by, TEST_USER.email, "the tutor reads the learner-owned identity projection");
    assert.deepEqual(lookupPremiumStatus(fixture.store.ParleIdentity[0], TEST_USER.email), {
      premium: true,
      compRecordFound: true,
      recordType: "ParleIdentity",
      lookupField: "created_by",
      learnerKeyType: "email",
      statusField: "premium_comp_active",
    });

    const provider = fakeProvider([openingResponse("chat")]);
    const opened = await callTutor(fixture, provider, { action: "tutor_open_session", mode: "chat" }, FIXED_TUTOR_NOW);
    assert.equal(opened.status, 200);
    assert.equal(opened.payload.context.planTier, "premium");
    assert.equal(opened.payload.context.messagesLimit, 300);
    const expectedPremiumDiagnostic = {
      tier: "premium",
      limitApplied: 300,
      messagesCountedToday: 10,
      localDayKey: "2026-10-12",
      compRecordFound: true,
      recordType: "ParleIdentity",
      lookupField: "created_by",
      learnerKeyType: "email",
      statusField: "premium_comp_active",
    };
    assert.deepEqual(opened.payload.diagnostic, expectedPremiumDiagnostic);
    assert.deepEqual(parseTutorDiagnostic(opened.payload.diagnostic), opened.payload.diagnostic);

    const cappedFixture = createTutorFixture();
    activateCompStatus(cappedFixture);
    seedTutorUsage(cappedFixture, 300, FIXED_TUTOR_NOW);
    const capped = await callTutor(cappedFixture, fakeProvider([]), { action: "tutor_open_session", mode: "chat" }, FIXED_TUTOR_NOW);
    assert.equal(capped.status, 200);
    assert.deepEqual(capped.payload.diagnostic, {
      ...expectedPremiumDiagnostic,
      messagesCountedToday: 300,
    });

    for (const diagnostic of [opened.payload.diagnostic, capped.payload.diagnostic]) {
      assert.equal(Object.keys(diagnostic).length, 9);
      assert.ok(!JSON.stringify(diagnostic).includes(TEST_USER.id));
      assert.ok(!JSON.stringify(diagnostic).includes(TEST_USER.email));
      assert.ok(!JSON.stringify(diagnostic).includes(TEST_ADMIN.email));
    }
    assert.equal(fixture.accessLog.canonicalCompLookups, 0, "the tutor never reads admin-created status rows");
    assert.equal(fixture.accessLog.legacyCompFilters, 0, "the tutor never falls back to the legacy status alias");
  });

  it("keeps Free when only an administrator-created shared row exists and the learner projection is inactive", async () => {
    const fixture = createTutorFixture({
      compStatusRows: [{
        id: "admin-created-comp-row",
        user_id: TEST_USER.id,
        plan: "premium_comp",
        status: "active",
        created_by: TEST_ADMIN.email,
      }],
      compStatusReadable: false,
    });
    seedTutorUsage(fixture, 10, FIXED_TUTOR_NOW);
    assert.equal(fixture.store.ParleCompStatus.length, 1, "the fixture retains the existing administrator-created status row");
    assert.equal(fixture.store.ParleIdentity[0].premium_comp_active, false, "the learner-owned projection has not been reconciled yet");

    const blocked = await callTutor(fixture, fakeProvider([]), { action: "tutor_open_session", mode: "chat" }, FIXED_TUTOR_NOW);
    assert.equal(blocked.status, 200);
    assert.equal(blocked.payload.plan_tier, "free");
    assert.equal(blocked.payload.messages_limit, 10);
    assert.equal(blocked.payload.messages_remaining, 0);
    assert.deepEqual(blocked.payload.diagnostic, {
      tier: "free",
      limitApplied: 10,
      messagesCountedToday: 10,
      localDayKey: "2026-10-12",
      compRecordFound: false,
      recordType: "ParleIdentity",
      lookupField: "created_by",
      learnerKeyType: "email",
      statusField: "premium_comp_active",
    });
    assert.ok(!JSON.stringify(blocked.payload.diagnostic).includes(TEST_USER.id));
    assert.ok(!JSON.stringify(blocked.payload.diagnostic).includes(TEST_USER.email));
    assert.ok(!JSON.stringify(blocked.payload.diagnostic).includes(TEST_ADMIN.email));
    assert.equal(fixture.accessLog.canonicalCompLookups, 0, "the tutor fails closed without reading a cross-owner status row");
    assert.equal(fixture.accessLog.legacyCompFilters, 0);
  });

  it("uses a verified paid subscription for the saved Premium tutor limit", async () => {
    const fixture = createTutorFixture();
    await seedPaidSubscriptionCache(fixture);
    saveTutorSetting(fixture, "free_ai_messages_per_day", 14);
    saveTutorSetting(fixture, "premium_fair_use_ai_messages_per_day", 333);
    seedTutorUsage(fixture, 332, FIXED_TUTOR_NOW);

    const summary = await callTutor(fixture, fakeProvider([]), { action: "tutor_get_plan_summary" }, FIXED_TUTOR_NOW);
    assert.equal(summary.status, 200);
    assert.equal(summary.payload.summary.plan_tier, "premium");
    assert.equal(summary.payload.summary.billing_source, "paid");
    assert.equal(summary.payload.summary.subscription_plan, "premium_monthly");
    assert.equal(summary.payload.summary.subscription_status, "active");
    assert.equal(summary.payload.summary.messages_used, 332);
    assert.equal(summary.payload.summary.messages_limit, 333);
    assert.equal(summary.payload.summary.premium_messages_limit, 333);

    const provider = fakeProvider([openingResponse("chat"), tutorResponse()]);
    const opened = await callTutor(fixture, provider, { action: "tutor_open_session", mode: "chat" }, FIXED_TUTOR_NOW);
    assert.equal(opened.status, 200);
    assert.equal(opened.payload.context.planTier, "premium");
    assert.equal(opened.payload.context.messagesLimit, 333);
    assert.equal(opened.payload.context.messagesRemaining, 1);
    assert.equal(fixture.store.usage_counter.length, 332, "opening a session does not consume a learner message");

    const finalAllowed = await callTutor(fixture, provider, {
      action: "tutor_send_message",
      session_id: opened.payload.session_id,
      text: "Je voudrais encore pratiquer le français.",
    }, FIXED_TUTOR_NOW);
    assert.equal(finalAllowed.status, 200);
    assert.equal(finalAllowed.payload.plan_tier, "premium");
    assert.equal(finalAllowed.payload.messages_limit, 333);
    assert.equal(finalAllowed.payload.messages_remaining, 0);
    assert.equal(fixture.store.usage_counter.length, 333);

    const blocked = await callTutor(fixture, provider, { action: "tutor_open_session", mode: "chat" }, FIXED_TUTOR_NOW);
    assert.equal(blocked.status, 200);
    assert.equal(blocked.payload.plan_tier, "premium");
    assert.equal(blocked.payload.messages_limit, 333);
    assert.equal(blocked.payload.messages_remaining, 0);
    assert.equal(blocked.payload.limit_reason, "premium_fair_use");
    assert.equal(provider.calls.length, 2, "the paid fair-use cap blocks the next request before another AI call");
  });

  it("refreshes an expired signed subscription cache through the injected Stripe client", async () => {
    const stripeCalls = { subscriptions: 0, customers: 0 };
    const stripe = {
      subscriptions: {
        retrieve: async (id: string, options?: Record<string, unknown>) => {
          stripeCalls.subscriptions += 1;
          assert.equal(id, "sub_tutor_test_123");
          assert.deepEqual(options, { expand: ["items.data.price"] });
          return {
            id,
            customer: "cus_tutor_test_123",
            status: "active",
            cancel_at_period_end: false,
            current_period_end: Math.floor(Date.parse("2026-11-12T23:00:00.000Z") / 1000),
            metadata: { user_id: TEST_USER.id, plan: "premium_monthly" },
            items: { data: [{ quantity: 1, price: { currency: "usd", unit_amount: 1499, recurring: { interval: "month", interval_count: 1 } } }] },
          };
        },
      },
      customers: {
        retrieve: async (id: string) => {
          stripeCalls.customers += 1;
          assert.equal(id, "cus_tutor_test_123");
          return { id, deleted: false, metadata: { user_id: TEST_USER.id } };
        },
      },
    };
    const fixture = createTutorFixture({ stripe });
    await seedPaidSubscriptionCache(fixture, {
      lastConfirmedAt: new Date(FIXED_TUTOR_NOW.getTime() - 60 * 60 * 1000).toISOString(),
    });

    const summary = await callTutor(fixture, fakeProvider([]), { action: "tutor_get_plan_summary" }, FIXED_TUTOR_NOW);
    assert.equal(summary.status, 200);
    assert.equal(summary.payload.summary.plan_tier, "premium");
    assert.equal(summary.payload.summary.billing_source, "paid");
    assert.deepEqual(stripeCalls, { subscriptions: 1, customers: 1 }, "an expired cache triggers one fresh owner-and-price check");
    assert.equal(fixture.store.Subscriber[0].last_confirmed_at, FIXED_TUTOR_NOW.toISOString());
    assert.ok(fixture.store.Subscriber[0].cache_signature, "the refreshed result is saved with a server-generated signature");
  });

  it("blocks Premium message 301 with the fair-use reason", async () => {
    const cappedFixture = createTutorFixture();
    activateCompStatus(cappedFixture);
    seedTutorUsage(cappedFixture, 300);
    const cappedProvider = fakeProvider([]);
    const blocked = await callTutor(cappedFixture, cappedProvider, { action: "tutor_open_session", mode: "chat" });
    assert.equal(blocked.status, 200);
    assert.equal(blocked.payload.plan_tier, "premium");
    assert.equal(blocked.payload.messages_limit, 300);
    assert.equal(blocked.payload.messages_remaining, 0);
    assert.equal(blocked.payload.limit_reason, "premium_fair_use");
    assert.match(blocked.payload.error, /Premium fair-use/i);
    assert.equal(cappedProvider.calls.length, 0, "message 301 is stopped before the AI provider");
  });

  it("shows Premium at ten uses, accepts message eleven, and enforces Free after administrator removal", async () => {
    const fixture = createTutorFixture();
    activateCompStatus(fixture);
    recordAdminCompGrant(fixture);
    seedTutorUsage(fixture, 10, FIXED_TUTOR_NOW);
    assert.equal(fixture.store.ParleCompStatus[0].created_by, TEST_ADMIN.email, "the current row was created by an administrator");

    const provider = fakeProvider([openingResponse("chat"), tutorResponse()]);
    const opened = await callTutor(fixture, provider, { action: "tutor_open_session", mode: "chat" }, FIXED_TUTOR_NOW);
    assert.equal(opened.status, 200);
    assert.equal(opened.payload.status, "complete");
    assert.equal(opened.payload.context.planTier, "premium");
    assert.equal(opened.payload.context.messagesLimit, 300);
    assert.equal(opened.payload.context.messagesRemaining, 290);
    assert.equal(t("learner.tutor.premiumPlan"), "Premium plan");
    assert.equal(
      t("learner.tutor.messagesRemaining", {
        remaining: opened.payload.context.messagesRemaining,
        limit: opened.payload.context.messagesLimit,
      }),
      "290 of 300 AI messages left today",
    );
    assert.equal(fixture.accessLog.legacyCompFilters, 0);
    assert.equal(fixture.accessLog.canonicalCompLookups, 0, "tutor quota checks use only the learner-owned Premium projection");

    const eleventh = await callTutor(fixture, provider, {
      action: "tutor_send_message",
      session_id: opened.payload.session_id,
      text: "Je voudrais encore pratiquer le français.",
    }, FIXED_TUTOR_NOW);
    assert.equal(eleventh.status, 200, "the active comp permits message 11");
    assert.equal(eleventh.payload.plan_tier, "premium");
    assert.equal(eleventh.payload.messages_limit, 300);
    assert.equal(eleventh.payload.messages_remaining, 289);
    assert.equal(fixture.store.usage_counter.length, 11);

    const removed = await setLearnerPremiumComp(fixture.client, TEST_ADMIN, {
      target_user_id: TEST_USER.id,
      comp_action: "remove",
      reason: "Tutor comp regression test complete",
    });
    assert.equal(removed.status, "complete");
    assert.equal(removed.comp_active, false);
    assert.equal(fixture.store.ParleCompStatus.length, 0, "the administrator action removes the shared current-status row");
    assert.ok(fixture.store.admin_audit_log.some((row) => row.action === "user.premium_comp_removed"));

    const sameStoreAfterRemoval = await callTutor(fixture, provider, {
      action: "tutor_send_message",
      session_id: opened.payload.session_id,
      text: "Je voudrais continuer à pratiquer.",
    }, FIXED_TUTOR_NOW);
    assert.equal(sameStoreAfterRemoval.status, 200);
    assert.equal(sameStoreAfterRemoval.payload.plan_tier, "free");
    assert.equal(sameStoreAfterRemoval.payload.messages_limit, 10);
    assert.equal(sameStoreAfterRemoval.payload.messages_remaining, 0);
    assert.equal(sameStoreAfterRemoval.payload.limit_reason, "free_daily_limit");
    assert.deepEqual(sameStoreAfterRemoval.payload.diagnostic, {
      tier: "free",
      limitApplied: 10,
      messagesCountedToday: 11,
      localDayKey: "2026-10-12",
      compRecordFound: false,
      recordType: "ParleIdentity",
      lookupField: "created_by",
      learnerKeyType: "email",
      statusField: "premium_comp_active",
    });
    assert.ok(!JSON.stringify(sameStoreAfterRemoval.payload.diagnostic).includes(TEST_USER.id));
    assert.equal(fixture.store.usage_counter.length, 11, "a Free-blocked request does not consume another message");

    const freeLimitFixture = createTutorFixture({ compStatusRows: fixture.store.ParleCompStatus });
    seedTutorUsage(freeLimitFixture, 10, FIXED_TUTOR_NOW);
    const freeLimitProvider = fakeProvider([]);
    const atFreeLimit = await callTutor(freeLimitFixture, freeLimitProvider, { action: "tutor_open_session", mode: "chat" }, FIXED_TUTOR_NOW);
    assert.equal(atFreeLimit.status, 200, "the same learner is stopped at the exact Free boundary after comp removal");
    assert.equal(atFreeLimit.payload.plan_tier, "free");
    assert.equal(atFreeLimit.payload.messages_limit, 10);
    assert.equal(atFreeLimit.payload.messages_remaining, 0);
    assert.equal(atFreeLimit.payload.limit_reason, "free_daily_limit");
    assert.equal(freeLimitProvider.calls.length, 0);
    assert.equal(freeLimitFixture.accessLog.legacyCompFilters, 0);
  });

  it("uses the saved Free allowance for the tutor response, counter copy, and server enforcement", async () => {
    const usedFixture = createTutorFixture();
    usedFixture.store.app_setting.push({ id: "free-limit-setting", key: "free_ai_messages_per_day", value: "12", updated_at: new Date().toISOString() });
    const today = localDateKey(new Date(), "America/Toronto");
    for (let index = 0; index < 5; index += 1) {
      usedFixture.store.usage_counter.push({
        id: `used-${index}`,
        user_id: TEST_USER.id,
        created_by: TEST_USER.email,
        period: "day",
        period_key: today,
        ai_messages: 1,
      });
    }
    const provider = fakeProvider([openingResponse("chat")]);
    const opened = await callTutor(usedFixture, provider, { action: "tutor_open_session", mode: "chat" });
    assert.equal(opened.status, 200);
    assert.equal(opened.payload.context.messagesLimit, 12);
    assert.equal(opened.payload.context.messagesRemaining, 7);
    assert.equal(t("learner.tutor.messagesRemaining", { remaining: opened.payload.context.messagesRemaining, limit: opened.payload.context.messagesLimit }), "7 of 12 AI messages left today");

    const limitFixture = createTutorFixture();
    limitFixture.store.app_setting.push({ id: "free-limit-setting", key: "free_ai_messages_per_day", value: "12", updated_at: new Date().toISOString() });
    for (let index = 0; index < 12; index += 1) {
      limitFixture.store.usage_counter.push({
        id: `used-${index}`,
        user_id: TEST_USER.id,
        created_by: TEST_USER.email,
        period: "day",
        period_key: today,
        ai_messages: 1,
      });
    }
    const blockedProvider = fakeProvider([]);
    const blocked = await callTutor(limitFixture, blockedProvider, { action: "tutor_open_session", mode: "chat" });
    assert.equal(blocked.status, 200);
    assert.equal(blocked.payload.messages_remaining, 0);
    assert.equal(blocked.payload.messages_limit, 12);
    assert.equal(blockedProvider.calls.length, 0);
    assert.equal(limitFixture.store.ai_session.length, 0);
  });

  it("reloads saved Free and Premium message limits on the next tutor request", async () => {
    const freeFixture = createTutorFixture();
    seedTutorUsage(freeFixture, 5);
    const freeProvider = fakeProvider([openingResponse("chat"), tutorResponse()]);
    const freeOpen = await callTutor(freeFixture, freeProvider, { action: "tutor_open_session", mode: "chat" });
    assert.equal(freeOpen.status, 200);
    assert.equal(freeOpen.payload.context.messagesLimit, 10);
    saveTutorSetting(freeFixture, "free_ai_messages_per_day", 12);
    const freeNextMessage = await callTutor(freeFixture, freeProvider, {
      action: "tutor_send_message",
      session_id: freeOpen.payload.session_id,
      text: "Je pratique encore le français.",
    });
    assert.equal(freeNextMessage.status, 200);
    assert.equal(freeNextMessage.payload.plan_tier, "free");
    assert.equal(freeNextMessage.payload.messages_limit, 12);
    assert.equal(freeNextMessage.payload.messages_remaining, 6);

    const premiumFixture = createTutorFixture();
    activateCompStatus(premiumFixture);
    seedTutorUsage(premiumFixture, 10);
    const premiumProvider = fakeProvider([openingResponse("chat"), tutorResponse()]);
    const premiumOpen = await callTutor(premiumFixture, premiumProvider, { action: "tutor_open_session", mode: "chat" });
    assert.equal(premiumOpen.status, 200);
    assert.equal(premiumOpen.payload.context.messagesLimit, 300);
    saveTutorSetting(premiumFixture, "premium_fair_use_ai_messages_per_day", 320);
    const premiumNextMessage = await callTutor(premiumFixture, premiumProvider, {
      action: "tutor_send_message",
      session_id: premiumOpen.payload.session_id,
      text: "Je pratique encore le français.",
    });
    assert.equal(premiumNextMessage.status, 200);
    assert.equal(premiumNextMessage.payload.plan_tier, "premium");
    assert.equal(premiumNextMessage.payload.messages_limit, 320);
    assert.equal(premiumNextMessage.payload.messages_remaining, 309);
  });

  it("gives the same question visibly different A2 and B2 guidance from server estimates", async () => {
    async function replyPromptForReadingEstimate(score: number) {
      const fixture = createTutorFixture();
      const readingEstimate = fixture.store.skill_estimate.find((row) => row.skill === "reading");
      assert.ok(readingEstimate);
      readingEstimate.value = score;
      const provider = fakeProvider([openingResponse("question"), tutorResponse()]);
      const opened = await callTutor(fixture, provider, { action: "tutor_open_session", mode: "question" });
      assert.equal(opened.status, 200);
      const reply = await callTutor(fixture, provider, {
        action: "tutor_send_message",
        session_id: opened.payload.session_id,
        text: "Why do we say je suis allé instead of j'ai allé?",
      });
      assert.equal(reply.status, 200);
      return { level: opened.payload.context.currentEstimates.reading.level as string, prompt: provider.calls[1].prompt as string };
    }

    const A2 = await replyPromptForReadingEstimate(2);
    const B2 = await replyPromptForReadingEstimate(4);
    assert.equal(A2.level, "A2");
    assert.equal(B2.level, "B2");
    assert.match(A2.prompt, /A2/);
    assert.match(A2.prompt, /very simple French/i);
    assert.match(A2.prompt, /English support/i);
    assert.match(B2.prompt, /B2/);
    assert.match(B2.prompt, /French first/i);
    assert.notEqual(A2.prompt, B2.prompt);
  });

  it("saves every valid writing correction with its skill, area, topic, and French example", async () => {
    const fixture = createTutorFixture();
    const taskId = seedTask(fixture, "writing", "writing", "appointments");
    const correctedText = "Je suis allé au parc.";
    const provider = fakeProvider([
      openingResponse("writing"),
      tutorResponse({
        reply: "Voici la correction et la raison du changement.",
        corrected_text: correctedText,
        corrections: [{
          original_sentence: "Je suis alle au parc",
          corrected_sentence: correctedText,
          explanation: "Le participe passé allé prend un accent aigu.",
          area: "grammar",
          example_sentence: "Hier, je suis allé au cinéma.",
        }],
      }),
    ]);
    const opened = await callTutor(fixture, provider, { action: "tutor_open_session", mode: "writing", task_id: taskId });
    const reply = await callTutor(fixture, provider, { action: "tutor_send_message", session_id: opened.payload.session_id, text: "Je suis alle au parc" });

    assert.equal(reply.status, 200);
    assert.equal(fixture.store.mistake_log.length, 1);
    assert.deepEqual(
      (({ skill, area, topic, language_point, theme, example_sentence }: Record<string, string>) => ({ skill, area, topic, language_point, theme, example_sentence }))(fixture.store.mistake_log[0]),
      { skill: "writing", area: "grammar", topic: "appointments", language_point: "accent aigu in allé", theme: "appointments", example_sentence: "Hier, je suis allé au cinéma." },
    );
  });

  it("stores language-point mastery separately from the broad theme score", async () => {
    const fixture = createTutorFixture();
    const pointItem = (id: string, prompt: string) => ({
      ...tutorItem(id),
      prompt,
      explanation: prompt,
      language_point: "WORK",
      theme: "WORK",
    });
    const practiceItems = [
      pointItem("point-depuis", "Choisissez entre depuis et pendant."),
      pointItem("point-passe-compose", "Choisissez le passé composé avec être."),
      pointItem("point-elision", "Choisissez l’élision de je devant une voyelle."),
    ];
    const response = {
      ...openingResponse("lesson"),
      practice_items: practiceItems,
      mini_test: [tutorItem("point-test-1"), tutorItem("point-test-2"), tutorItem("point-test-3")],
    };
    const provider = fakeProvider([response]);
    const opened = await callTutor(fixture, provider, { action: "tutor_open_session", mode: "lesson" });
    assert.equal(opened.status, 200);
    assert.deepEqual(opened.payload.lesson.practice_items.map((item: Record<string, string>) => item.language_point), [
      "depuis vs pendant",
      "passé composé with être",
      "elision j'",
    ]);
    assert.deepEqual(opened.payload.lesson.practice_items.map((item: Record<string, string>) => item.theme), ["WORK", "WORK", "WORK"]);

    const sessionId = opened.payload.session_id as string;
    const savedPracticeItems = savedTutorBundle(fixture, sessionId).practice_items;
    for (const [index, item] of opened.payload.lesson.practice_items.entries()) {
      const savedItem = savedPracticeItems.find((candidate) => candidate.id === item.id);
      assert.ok(savedItem);
      const checked = await callTutor(fixture, provider, {
        action: "tutor_grade_practice",
        session_id: sessionId,
        item_id: item.id,
        option_id: savedOptionId(savedItem, index !== 1),
      });
      assert.equal(checked.status, 200);
    }

    const mastery = fixture.store.topic_mastery.filter((row) => row.source === "practice");
    assert.equal(mastery.length, 3);
    assert.ok(new Set(mastery.map((row) => row.language_point_key)).size === 3);
    assert.deepEqual(mastery.map((row) => row.language_point), [
      "depuis vs pendant",
      "passé composé with être",
      "elision j'",
    ]);
    assert.ok(mastery.every((row) => row.theme === "WORK" && row.topic === "work"));
    assert.deepEqual(mastery.map((row) => row.language_point_rolling_score), [100, 0, 100]);
    assert.deepEqual(mastery.map((row) => row.rolling_score), [100, 50, 200 / 3].map((score) => Math.round(score * 100) / 100));
    assert.equal(fixture.store.mistake_log[0].language_point, "passé composé with être");
    assert.equal(fixture.store.mistake_log[0].theme, "WORK");
  });

  it("enforces the sequential 10-message Free limit on the server before an 11th AI call", async () => {
    const fixture = createTutorFixture();
    const provider = fakeProvider((_call, index) => index === 0 ? openingResponse("chat") : tutorResponse({ reply: `Réponse de pratique ${index}.` }));
    const opened = await callTutor(fixture, provider, { action: "tutor_open_session", mode: "chat" });
    assert.equal(opened.status, 200);

    for (let index = 1; index <= 10; index += 1) {
      const result = await callTutor(fixture, provider, {
        action: "tutor_send_message",
        session_id: opened.payload.session_id,
        text: `Je pratique le français, réponse numéro ${index}.`,
      });
      assert.equal(result.status, 200, `learner message ${index} should be allowed`);
      assert.equal(result.payload.messages_remaining, 10 - index);
    }

    const eleventh = await callTutor(fixture, provider, {
      action: "tutor_send_message",
      session_id: opened.payload.session_id,
      text: "Je voudrais encore pratiquer le français.",
    });
    assert.equal(eleventh.status, 200);
    assert.equal(eleventh.payload.status, "limit");
    assert.equal(eleventh.payload.messages_remaining, 0);
    assert.match(eleventh.payload.error, /daily tutor message limit/i);
    assert.equal(fixture.store.usage_counter.length, 10);
    assert.equal(fixture.store.ai_message.filter((row) => row.sender === "learner").length, 10);
    assert.equal(provider.calls.length, 11, "opening plus ten replies, with no provider call for message eleven");
  });

  it("allows lesson checks and a mini-test after ten counted tutor messages", async () => {
    const fixture = createTutorFixture();
    const provider = fakeProvider([openingResponse("chat"), openingResponse("lesson")]);
    const chat = await callTutor(fixture, provider, { action: "tutor_open_session", mode: "chat" });
    const lesson = await callTutor(fixture, provider, { action: "tutor_open_session", mode: "lesson" });
    assert.equal(chat.status, 200);
    assert.equal(lesson.status, 200);

    for (let index = 1; index <= 10; index += 1) {
      const result = await callTutor(fixture, provider, {
        action: "tutor_send_message",
        session_id: chat.payload.session_id,
        text: `Je pratique le français, message numéro ${index}.`,
      });
      assert.equal(result.status, 200);
      assert.equal(result.payload.messages_remaining, 10 - index);
    }
    assert.equal(fixture.store.usage_counter.length, 10);

    const savedPracticeItems = savedTutorBundle(fixture, lesson.payload.session_id).practice_items;
    for (const item of lesson.payload.lesson.practice_items) {
      const savedItem = savedPracticeItems.find((candidate) => candidate.id === item.id);
      assert.ok(savedItem);
      const checked = await callTutor(fixture, provider, {
        action: "tutor_grade_practice",
        session_id: lesson.payload.session_id,
        item_id: item.id,
        option_id: savedOptionId(savedItem, true),
      });
      assert.equal(checked.status, 200, "practice remains available at the message cap");
      assert.equal(checked.payload.messages_remaining, 0);
      assert.equal(fixture.store.usage_counter.length, 10);
    }

    const savedMiniTest = savedTutorBundle(fixture, lesson.payload.session_id).mini_test;
    const answers = lesson.payload.lesson.mini_test.map((item: Record<string, any>, index: number) => ({
      item_id: item.id,
      option_id: savedOptionId(savedMiniTest[index]!, true),
    }));
    const submitted = await callTutor(fixture, provider, {
      action: "tutor_submit_mini_test",
      session_id: lesson.payload.session_id,
      answers,
    });
    assert.equal(submitted.status, 200, "mini-test remains available at the message cap");
    assert.equal(submitted.payload.messages_remaining, 0);
    assert.equal(fixture.store.usage_counter.length, 10);
    assert.equal(provider.calls.length, 12, "lesson checks and mini-test scoring make no additional AI request");
  });

  it("returns the immigration and CRS redirect without AI advice or planned-task completion", async () => {
    const fixture = createTutorFixture();
    const taskId = seedTask(fixture, "speaking_practice", "speaking", "work");
    const provider = fakeProvider([openingResponse("speaking")]);
    const opened = await callTutor(fixture, provider, { action: "tutor_open_session", mode: "speaking", task_id: taskId });
    const refusal = await callTutor(fixture, provider, {
      action: "tutor_send_message",
      session_id: opened.payload.session_id,
      text: "Am I eligible for permanent residence, and how many CRS points do I need?",
    });

    assert.equal(refusal.status, 200);
    assert.equal(refusal.payload.guardrail, "immigration");
    assert.equal(refusal.payload.completed_response, false);
    assert.match(refusal.payload.reply, /canada\.ca/);
    assert.match(refusal.payload.reply, /RCIC/);
    assert.match(refusal.payload.reply, /practise related French vocabulary/i);
    assert.equal(provider.calls.length, 1, "the guarded learner message must not be sent to the AI provider");

    const finish = await callTutor(fixture, provider, { action: "tutor_finish_session", session_id: opened.payload.session_id });
    assert.equal(finish.status, 409);
    assert.notEqual(finish.payload.completed_task_id, taskId);
  });

  it("retries one provider 5xx in fast mode and creates no blank session after a failed opening", async () => {
    const recoveredFixture = createTutorFixture();
    const recoveredProvider = fakeProvider([providerError(500), openingResponse("chat")]);
    const recovered = await callTutor(recoveredFixture, recoveredProvider, { action: "tutor_open_session", mode: "chat" });
    assert.equal(recovered.status, 200);
    assert.deepEqual(recoveredProvider.calls.map((call) => call.mode), ["standard", "fast"]);
    assert.equal(recoveredFixture.store.ai_session.length, 1);
    assert.equal(recoveredFixture.store.ai_message.length, 1);

    for (const status of [401, 429, 400]) {
      const failedFixture = createTutorFixture();
      const failedProvider = fakeProvider([providerError(status), openingResponse("chat")]);
      const failed = await callTutor(failedFixture, failedProvider, { action: "tutor_open_session", mode: "chat" });
      assert.equal(failed.status, 503);
      assert.equal(failedProvider.calls.length, 1, `${status} must not be retried`);
      assert.equal(failedFixture.store.ai_session.length, 0, "provider failure must not leave a blank session");
      assert.equal(failedFixture.store.ai_message.length, 0);
      assert.doesNotMatch(JSON.stringify(failed.payload), /private prompt|token text/i);
    }

    const failedFallbackFixture = createTutorFixture();
    const failedFallbackProvider = fakeProvider([providerError(500), providerError(500)]);
    const failedFallback = await callTutor(failedFallbackFixture, failedFallbackProvider, { action: "tutor_open_session", mode: "chat" });
    assert.equal(failedFallback.status, 503);
    assert.deepEqual(failedFallbackProvider.calls.map((call) => call.mode), ["standard", "fast"]);
    assert.equal(failedFallbackFixture.store.ai_session.length, 0);
  });
});

describe("AI tutor plan label on load (A17, D25 a)", () => {
  it("reads the tier and today's allowance from the plan summary", () => {
    assert.deepEqual(allowanceFromPlanSummary({ status: "complete", summary: { plan_tier: "premium", messages_used: 4, messages_limit: 300 } }), { tier: "premium", used: 4, limit: 300 });
    assert.deepEqual(allowanceFromPlanSummary({ data: { status: "complete", summary: { plan_tier: "free", messages_used: 0, messages_limit: 10 } } }), { tier: "free", used: 0, limit: 10 });
    assert.equal(allowanceFromPlanSummary({ error: "PLAN_SUMMARY_FAILED" }), null);
  });
  it("shows a neutral label until the server has said which plan this is", () => {
    assert.equal(t(tutorPlanBadgeKey(null)), "Checking your plan");
    assert.equal(t(tutorPlanBadgeKey("premium")), "Premium plan");
    assert.equal(t(tutorPlanBadgeKey("free")), "Free plan");
  });
  it("asks for the plan summary when the page loads and never assumes Free", () => {
    const src = readFileSync(new URL("../pages/LearnerTutorPlaceholder.tsx", import.meta.url), "utf8");
    assert.match(src, /action: "tutor_get_plan_summary"/);
    assert.doesNotMatch(src, /setPlanTier\("free"\)/);
    assert.doesNotMatch(src, /useState<TutorPlanTier>\("free"\)/);
  });
});

describe("A1 tutor instruction (A20, D13)", () => {
  it("asks A0 and A1 replies for French first and at most one short English line", () => {
    for (const level of ["A0", "A1"] as const) {
      const rule = tutorExplanationRule({ level, nativeLanguage: "English", explainInNative: false });
      assert.match(rule, /whole reply in French first/);
      assert.match(rule, /one short line that starts with "In English:"/);
      assert.match(rule, /never use more than one English line/i);
    }
    const a2 = tutorExplanationRule({ level: "A2", nativeLanguage: "English", explainInNative: false });
    assert.match(a2, /English support/);
  });
});
describe("plan badge after a failed plan summary (A35, R43)", () => {
  it("says the plan details are unavailable instead of checking forever", () => {
    assert.equal(t(tutorPlanBadgeKey(null, true)), "Plan details unavailable");
    assert.equal(t(tutorPlanBadgeKey(null, false)), "Checking your plan");
    assert.equal(t(tutorPlanBadgeKey("premium", true)), "Premium plan");
  });
  it("reads the plan summary once per page load, not for each session", () => {
    const src = readFileSync(new URL("../pages/LearnerTutorPlaceholder.tsx", import.meta.url), "utf8");
    assert.equal(src.match(/action: "tutor_get_plan_summary"/g)?.length, 1);
    assert.match(src, /tutor_get_plan_summary[\s\S]{0,700}\}, \[\]\);/);
    assert.equal(src.match(/tutorPlanBadgeKey\(displayedPlanTier, summaryFailed\)/g)?.length, 2);
  });
});
