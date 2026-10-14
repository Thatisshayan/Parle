import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TodayCoachNoteCard } from "../pages/LearnerTodayPlan.tsx";
import { t } from "./i18n";
import {
  deriveLearnerCoachNoteFacts,
  getOrCreateDailyCoachNote,
  normalizeCoachNoteText,
  resolveCoachNoteLanguage,
  type CoachNoteRecord,
  type CoachNoteStorage,
} from "../../functions/parle-coach-note.helper.ts";
import { normalizeLearnerCoachNoteResponse } from "./learner-coach-note";

const USER = { id: "coach-learner-1", email: "learner@parle.test" };
const NOW_BEFORE_LOCAL_MIDNIGHT = new Date("2026-10-14T03:30:00.000Z");
const NOW_AFTER_LOCAL_MIDNIGHT = new Date("2026-10-14T04:30:00.000Z");

function savedData(overrides: Record<string, unknown> = {}) {
  return {
    learnerProfile: {
      id: "learner-profile-1",
      user_id: USER.id,
      time_zone: "America/Toronto",
      target_date: "2027-02-01",
    },
    parleProfile: { native_language: "Spanish", explain_in_native: true },
    currentRoadmap: {
      id: "roadmap-1",
      user_id: USER.id,
      profile_id: "learner-profile-1",
      feasibility: "tight",
      target_date: "2027-02-01",
      realistic_date: "2027-02-15",
      minutes_per_day_needed: 20,
    },
    activeWeekPlan: {
      id: "week-1",
      status: "active",
      roadmap_id: "roadmap-1",
      week_start_local: "2026-10-12",
      time_zone: "America/Toronto",
      total_minutes: 50,
      allocation_json: JSON.stringify({
        weekEndDate: "2026-10-18",
        scheduledTaskMinutes: 50,
        tasks: [
          { type: "ai_lesson", topic: "work", status: "planned" },
          { type: "writing", topic: "appointments", status: "planned" },
          { type: "weekly_checkin", topic: "general_conversation", status: "planned" },
        ],
      }),
    },
    learnerTasks: [
      { status: "done", minutes: 20, completed_at_utc: "2026-10-13T14:00:00.000Z" },
      { status: "planned", minutes: 15, completed_at_utc: "" },
      { status: "done", minutes: 45, completed_at_utc: "2026-10-10T14:00:00.000Z" },
    ],
    checkins: [
      {
        id: "checkin-new",
        roadmap_id: "roadmap-1",
        status: "submitted",
        created_at: "2026-10-13T15:00:00.000Z",
        listening_correct_count: 2,
        listening_total_count: 3,
        listening_comparison: "at",
        reading_correct_count: 0,
        reading_total_count: 0,
        reading_comparison: "",
        writing_status: "not_scored",
        writing_scored_level: "",
        writing_comparison: "",
        speaking_self_rating: "below",
        after_values_json: JSON.stringify({ listening: 1.5, reading: 2, writing: 3, speaking: 4 }),
      },
      {
        id: "checkin-old",
        roadmap_id: "roadmap-1",
        status: "submitted",
        created_at: "2026-10-06T15:00:00.000Z",
        listening_correct_count: 1,
        listening_total_count: 3,
        listening_comparison: "below",
        reading_correct_count: 0,
        reading_total_count: 0,
        reading_comparison: "",
        writing_status: "not_scored",
        writing_scored_level: "",
        writing_comparison: "",
        speaking_self_rating: "above",
        after_values_json: JSON.stringify({ listening: 1.5, reading: 1.75, writing: 3, speaking: 4 }),
      },
      {
        id: "self-rated-only",
        roadmap_id: "roadmap-1",
        status: "submitted",
        created_at: "2026-10-14T15:00:00.000Z",
        speaking_self_rating: "below",
        after_values_json: JSON.stringify({ speaking: 0 }),
      },
    ],
    now: NOW_BEFORE_LOCAL_MIDNIGHT,
    ...overrides,
  };
}

function newNote(text = "You completed 20 minutes this week. Try one short French task on work today.") {
  return { note: text };
}

function fakeStorage(actorEmail = USER.email, initialRows: CoachNoteRecord[] = []) {
  const rows = structuredClone(initialRows);
  let nextId = 0;
  const storage: CoachNoteStorage = {
    findForLocalDay: async ({ userId, userEmail, localDate }) => rows.filter((row) =>
      row.user_id === userId && row.local_date === localDate && row.created_by === userEmail
    ).map((row) => structuredClone(row)),
    create: async (values) => {
      const row: CoachNoteRecord = {
        ...structuredClone(values),
        id: `coach-note-${++nextId}`,
        created_by: actorEmail,
        created_at: new Date().toISOString(),
      };
      rows.push(row);
      return structuredClone(row);
    },
    update: async (id, patch) => {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row) throw new Error("The saved note is unavailable.");
      Object.assign(row, structuredClone(patch));
      return structuredClone(row);
    },
  };
  return { storage, rows };
}

function fakeProvider(answer: unknown = newNote()) {
  const prompts: string[] = [];
  return {
    prompts,
    complete: async (prompt: string) => {
      prompts.push(prompt);
      if (answer instanceof Error) throw answer;
      return structuredClone(answer);
    },
  };
}

async function requestNote(input: {
  now?: Date;
  saved?: Record<string, unknown>;
  store?: ReturnType<typeof fakeStorage>;
  provider?: ReturnType<typeof fakeProvider>;
}) {
  const saved = (input.saved ?? savedData({ ...(input.now ? { now: input.now } : {}) })) as Parameters<typeof deriveLearnerCoachNoteFacts>[0];
  const facts = deriveLearnerCoachNoteFacts(saved);
  const store = input.store ?? fakeStorage();
  const provider = input.provider ?? fakeProvider();
  const result = await getOrCreateDailyCoachNote({
    userId: USER.id,
    userEmail: USER.email,
    facts,
    now: saved.now,
    storage: store.storage,
    provider,
  });
  return { result, facts, store, provider };
}

describe("saved daily Coach note", () => {
  it("returns the saved same-learner, same-local-day note without a second AI call", async () => {
    const fixture = savedData();
    const store = fakeStorage();
    const provider = fakeProvider();
    const first = await requestNote({ saved: fixture, store, provider });
    const second = await requestNote({ saved: fixture, store, provider });

    assert.equal(first.result.status, "generated");
    assert.deepEqual(second.result, first.result);
    assert.equal(provider.prompts.length, 1);
    assert.equal(store.rows.length, 1);
    assert.equal(store.rows[0]?.status, "generated");
    assert.equal(store.rows[0]?.local_date, first.facts.localDate);
  });

  it("creates one new saved note on the next learner-local date", async () => {
    const store = fakeStorage();
    const provider = fakeProvider();
    const first = await requestNote({ saved: savedData({ now: NOW_BEFORE_LOCAL_MIDNIGHT }), store, provider });
    const nextDay = await requestNote({ saved: savedData({ now: NOW_AFTER_LOCAL_MIDNIGHT }), store, provider });

    assert.equal(first.facts.localDate, "2026-10-13");
    assert.equal(nextDay.facts.localDate, "2026-10-14");
    assert.notEqual(store.rows[0]?.id, store.rows[1]?.id);
    assert.equal(provider.prompts.length, 2);
    assert.deepEqual(store.rows.map((row) => row.local_date), ["2026-10-13", "2026-10-14"]);
  });

  it("saves a fallback for a week with no completed tasks and never calls the model", async () => {
    const store = fakeStorage();
    const provider = fakeProvider();
    const usageCounterSnapshot = [{ user_id: USER.id, period: "day", ai_messages: 7 }];
    const before = structuredClone(usageCounterSnapshot);
    const saved = savedData({ learnerTasks: [] });
    const { result } = await requestNote({ saved, store, provider });

    assert.deepEqual(result, { status: "fallback", note: "" });
    assert.equal(provider.prompts.length, 0);
    assert.equal(store.rows[0]?.status, "fallback");
    assert.deepEqual(usageCounterSnapshot, before);

    const serviceSource = await readFile(new URL("../../functions/parle-assessment-service.ts", import.meta.url), "utf8");
    const helperSource = await readFile(new URL("../../functions/parle-coach-note.helper.ts", import.meta.url), "utf8");
    const actionStart = serviceSource.indexOf('if (body.action === "learner_coach_note")');
    const tutorStart = serviceSource.indexOf('if (body.action.startsWith("tutor_"))', actionStart);
    const handlerStart = serviceSource.indexOf("async function handleLearnerCoachNoteAction(");
    const handlerEnd = serviceSource.indexOf("\n}\n\nDeno.serve", handlerStart);
    assert.ok(actionStart >= 0 && tutorStart > actionStart, "the Coach action stays before tutor allowance routing");
    assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, "the Coach handler remains a separate learner path");
    const coachPath = `${serviceSource.slice(actionStart, tutorStart)}\n${serviceSource.slice(handlerStart, handlerEnd)}\n${helperSource}`;
    assert.doesNotMatch(coachPath, /usage_counter|usageCounter|tutorAllowance|consumeTutorAllowance/i);
  });

  it("uses native language only when the saved preference is enabled", async () => {
    assert.equal(resolveCoachNoteLanguage({ explainInNative: true, nativeLanguage: "Spanish" }), "Spanish");
    assert.equal(resolveCoachNoteLanguage({ explainInNative: false, nativeLanguage: "Spanish" }), "English");
    assert.equal(resolveCoachNoteLanguage({ explainInNative: true, nativeLanguage: "Other" }), "English");

    const enabledProvider = fakeProvider();
    await requestNote({ saved: savedData(), provider: enabledProvider });
    assert.match(enabledProvider.prompts[0] ?? "", /entire note in Spanish/);

    const disabledProvider = fakeProvider();
    await requestNote({ saved: savedData({ parleProfile: { native_language: "Spanish", explain_in_native: false } }), provider: disabledProvider });
    assert.match(disabledProvider.prompts[0] ?? "", /entire note in English/);
  });

  it("uses only scored evidence for the same skill and ignores self-rated speaking", () => {
    const facts = deriveLearnerCoachNoteFacts(savedData() as Parameters<typeof deriveLearnerCoachNoteFacts>[0]);
    assert.deepEqual(facts.stagnatingSkill, { skill: "listening", trend: "stayed" });
    assert.equal(facts.weeklyFocus.join(", "), "work and work experience, appointments");
    assert.equal(facts.completedWeekMinutes, 20);
    assert.equal(facts.scheduledWeekMinutes, 50);
    assert.equal(facts.goalDatePace?.status, "tight");
  });

  it("does not call AI again when a same-day pending reservation already exists", async () => {
    const facts = deriveLearnerCoachNoteFacts(savedData() as Parameters<typeof deriveLearnerCoachNoteFacts>[0]);
    const store = fakeStorage(USER.email, [{
      id: "pending-today",
      user_id: USER.id,
      created_by: USER.email,
      local_date: facts.localDate,
      time_zone: facts.timeZone,
      status: "pending",
      note_text: "",
    }]);
    const provider = fakeProvider();
    const result = await getOrCreateDailyCoachNote({
      userId: USER.id,
      userEmail: USER.email,
      facts,
      now: NOW_BEFORE_LOCAL_MIDNIGHT,
      storage: store.storage,
      provider,
    });

    assert.deepEqual(result, { status: "fallback", note: "" });
    assert.equal(provider.prompts.length, 0);
    assert.equal(store.rows.length, 1);
  });

  it("falls back when generated prose is not two or three short sentences", async () => {
    const store = fakeStorage();
    const provider = fakeProvider({ note: "A single sentence." });
    const { result } = await requestNote({ store, provider });
    assert.deepEqual(result, { status: "fallback", note: "" });
    assert.equal(store.rows[0]?.status, "fallback");
    assert.equal(normalizeCoachNoteText("One sentence only."), null);
  });

  it("renders the Coach card at a 375px sizing boundary without exposing markup", () => {
    const note = { status: "generated", text: "A saved note & <script>alert(1)</script>. Try one short work-focused task today." } as const;
    const markup = renderToStaticMarkup(createElement(
      "div",
      { style: { width: "375px", maxWidth: "100vw" } },
      createElement(TodayCoachNoteCard, { note, loading: false }),
    ));

    assert.match(markup, /width:375px/);
    assert.match(markup, /min-w-0/);
    assert.match(markup, /\[overflow-wrap:anywhere\]/);
    assert.match(markup, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(markup, new RegExp(t("learner.today.coachNoteDisclaimer").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("normalizes malformed service results to the translated fallback state", () => {
    assert.deepEqual(normalizeLearnerCoachNoteResponse({ data: { status: "fallback" } }), { status: "fallback", text: "" });
    assert.deepEqual(normalizeLearnerCoachNoteResponse({ data: { status: "generated", note: "Only one sentence." } }), { status: "fallback", text: "" });
  });
});
