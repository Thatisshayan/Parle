import {
  buildContextFirstMessage,
  buildTutorPrompt,
  calculateMiniTestScore,
  classifyTutorGuardrail,
  dailyMessageLimit,
  guardrailReply,
  localDateKey,
  monthlyVoiceMinuteLimit,
  remainingDailyMessages,
  rollingMasteryScore,
  tutorLevelForEstimate,
  type TutorMode,
  type TutorSkill,
} from "./parle-tutor.helper.ts";
import { readAppSettings } from "./parle-admin-settings.helper.ts";
import { resolveCombinedPremiumStatus, type PremiumStatusLookup, type ResolvedPremiumStatus } from "./parle-premium-status.helper.ts";
import { planPremiumLanguagePointPractice } from "./parle-premium-language-point-trigger.helper.ts";
import {
  assignTutorServerOptionIds,
  correctTutorOption,
  isTutorOptionCorrect,
  legacyTutorItemId,
  projectLegacyTutorOptions,
} from "./parle-tutor-answer-options.helper.ts";

type Learner = { id?: string; email?: string; role?: string };
type Row = Record<string, unknown> & { id?: string; created_by?: string; user_id?: string };
type LearnerIdentity = Row & { role?: string; premium_comp_active?: unknown };
type Profile = Row & { track?: string; self_assessed_level?: string };
type ItemOption = { id: string; text: string; originalIndex?: number };
export type TutorLessonItem = {
  id: string;
  prompt: string;
  area: "grammar" | "vocabulary" | "structure";
  example_sentence: string;
  language_point: string;
  theme: string;
  options: ItemOption[];
  answer_option_id: string;
  explanation: string;
  legacy_option_identity?: boolean;
};
type Item = TutorLessonItem;
type TutorProvider = {
  complete(prompt: string, schema: Record<string, unknown>, mode?: "fast" | "standard"): Promise<unknown>;
};
type TutorProviderStage = "session_opening" | "learner_reply";
type TutorServiceActionInput = {
  client: any;
  user: Learner;
  identity: LearnerIdentity;
  profile: Profile;
  body: Record<string, unknown>;
  provider: TutorProvider;
  origin: string | null;
  now?: Date;
  stripe?: any;
  testStripeSecret?: string | null;
};
type TutorDiagnostic = {
  tier: "free" | "premium";
  limitApplied: number;
  messagesCountedToday: number;
  localDayKey: string;
  compRecordFound: boolean;
  recordType: "ParleIdentity";
  lookupField: "created_by";
  learnerKeyType: "email";
  statusField: "premium_comp_active";
};
type Explanation = { level: "A0" | "A1" | "A2" | "B1" | "B2"; nativeLanguage: string; explainInNative: boolean };

class TutorProviderUnavailable extends Error {
  constructor(
    readonly stage: TutorProviderStage,
    readonly primaryStatus: number | null,
    readonly fallbackAttempted: boolean,
    readonly fallbackStatus: number | null,
  ) {
    super("Tutor provider unavailable");
    this.name = "TutorProviderUnavailable";
  }
}
type TutorContext = {
  goal: string;
  track: string;
  targetDate: string | null;
  targets: Record<string, string | null>;
  currentEstimates: Record<TutorSkill, { score: number; level: string; state: string }>;
  weeklyFocus: string;
  focusTopicIds: string[];
  taskContext: string;
  taskRecord: Row | null;
  recentMistakes: string[];
  masteredTopics: string[];
  weakTopics: string[];
  nativeLanguage: string;
  explainInNative: boolean;
  timeZone: string;
  dayKey: string;
  planTier: "free" | "premium";
  premiumStatus: PremiumStatusLookup;
  premiumDetails: ResolvedPremiumStatus;
  premiumEligible: boolean;
  premiumRoadmapTriggersEnabled: boolean;
  currentWeek: Row | null;
  currentWeekSnapshot: Record<string, unknown>;
  messagesUsed: number;
  messagesRemaining: number;
  messagesLimit: number;
  freeMessagesLimit: number;
  premiumMessagesLimit: number;
  limitReason: "free_daily_limit" | "premium_fair_use" | null;
  voiceMinutesRemaining: number;
};
type NormalizedTutorResponse = {
  reply: string;
  scenario: string;
  writingPrompt: string;
  correctedText: string;
  feedbackSummary: string;
  taskCompletionFeedback: string;
  grammarFeedback: string;
  vocabularyFeedback: string;
  optionalPractice: string;
  practiceItems: Item[];
  miniTest: Item[];
  corrections: Array<{ original_sentence: string; corrected_sentence: string; explanation: string; area: "grammar" | "vocabulary" | "structure"; example_sentence: string; language_point: string; theme: string }>;
};

const SKILLS: TutorSkill[] = ["listening", "reading", "writing", "speaking"];
const TUTOR_ITEM_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    prompt: { type: "string" },
    area: { type: "string", enum: ["grammar", "vocabulary", "structure"] },
    example_sentence: { type: "string" },
    language_point: { type: "string" },
    theme: { type: "string" },
    options: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } }, required: ["id", "text"] } },
    answer_option_id: { type: "string" },
    explanation: { type: "string" },
  },
  required: ["id", "prompt", "area", "example_sentence", "language_point", "theme", "options", "answer_option_id", "explanation"],
};
const TUTOR_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    reply: { type: "string" },
    scenario: { type: "string" },
    writing_prompt: { type: "string" },
    corrected_text: { type: "string" },
    feedback_summary: { type: "string" },
    task_completion_feedback: { type: "string" },
    grammar_feedback: { type: "string" },
    vocabulary_feedback: { type: "string" },
    optional_practice: { type: "string" },
    practice_items: { type: "array", items: TUTOR_ITEM_SCHEMA },
    mini_test: { type: "array", items: TUTOR_ITEM_SCHEMA },
    corrections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          original_sentence: { type: "string" },
          corrected_sentence: { type: "string" },
          explanation: { type: "string" },
          area: { type: "string", enum: ["grammar", "vocabulary", "structure"] },
          example_sentence: { type: "string" },
          language_point: { type: "string" },
          theme: { type: "string" },
        },
        required: ["original_sentence", "corrected_sentence", "explanation", "area", "example_sentence", "language_point", "theme"],
      },
    },
  },
  required: ["reply", "scenario", "writing_prompt", "corrected_text", "feedback_summary", "task_completion_feedback", "grammar_feedback", "vocabulary_feedback", "optional_practice", "practice_items", "mini_test", "corrections"],
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordsFromResponse<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];
  if (isObject(response) && Array.isArray(response.data)) return response.data as T[];
  throw new Error("The private tutor records could not be read.");
}

function resultObject(value: unknown): unknown {
  return isObject(value) && isObject(value.result) ? value.result : value;
}

function plainText(value: unknown, maxLength = 500): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function normalizedTheme(value: unknown, fallback: string): string {
  return plainText(value, 120) || plainText(fallback, 120) || "general_conversation";
}

function languagePointKey(value: string): string {
  return plainText(value, 120)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

const BROAD_LANGUAGE_POINTS = new Set([
  "work", "work and work experience", "appointments", "housing", "services", "community", "everyday life",
  "personal history", "general conversation", "general french conversation", "grammar", "grammar point",
  "french grammar point", "vocabulary", "structure", "pronunciation", "writing", "speaking", "listening",
  "reading", "immigration", "citizenship",
]);

function isBroadLanguagePoint(value: string, theme: string): boolean {
  const key = value.trim().toLocaleLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const themeKey = theme.trim().toLocaleLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return !key || key === themeKey || BROAD_LANGUAGE_POINTS.has(key);
}

function classifiedLanguagePoint(value: unknown, evidence: string, area: Item["area"], theme: string): string {
  const supplied = plainText(value, 100);
  if (supplied && !isBroadLanguagePoint(supplied, theme)) return supplied;

  const text = evidence.toLocaleLowerCase();
  if (/passé composé|passe compose/.test(text) && /être|etre/.test(text)) return "passé composé with être";
  if (/depuis.{0,100}pendant|pendant.{0,100}depuis/.test(text)) return "depuis vs pendant";
  if (/élision|elision|apostrophe|j[’']/.test(text)) return "elision j'";
  if (/accent aigu|acute accent/.test(text) && /all[ée]/.test(text)) return "accent aigu in allé";
  if (/plus-que-parfait|subjonctif|imparfait|futur simple/.test(text)) {
    const knownPoint = text.match(/plus-que-parfait|subjonctif|imparfait|futur simple/);
    if (knownPoint) return knownPoint[0];
  }
  return area === "vocabulary" ? "French vocabulary in context" : area === "structure" ? "French sentence structure" : "French grammar point";
}

function learnerText(value: unknown, maxLength = 4000): string {
  return typeof value === "string"
    ? value.replace(/\u0000|[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\r/g, "").trim().slice(0, maxLength)
    : "";
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (isObject(value)) return value;
  if (typeof value !== "string") return null;
  try { const parsed: unknown = JSON.parse(value); return isObject(parsed) ? parsed : null; } catch { return null; }
}

function validTimeZoneOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.trim() });
    return value.trim();
  } catch {
    return null;
  }
}

export function resolveTutorTimeZone(parleProfileTimeZone: unknown, learnerProfileTimeZone: unknown): string {
  return validTimeZoneOrNull(parleProfileTimeZone) ?? validTimeZoneOrNull(learnerProfileTimeZone) ?? "UTC";
}

/** Each accepted learner submission is one append-only event row. Never trust its editable numeric fields. */
export function countUsageEventRows(rows: readonly unknown[]): number {
  return rows.length;
}

function jsonResponse(body: Record<string, unknown>, status: number, origin: string | null): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  if (origin) { headers.set("Access-Control-Allow-Origin", origin); headers.set("Vary", "Origin"); }
  return new Response(JSON.stringify(body), { status, headers });
}

function safeProviderStatus(error: unknown): number | null {
  const candidates: unknown[] = [];
  if (isObject(error)) {
    candidates.push(error.status, error.statusCode, error.status_code);
    if (isObject(error.response)) candidates.push(error.response.status);
    if (isObject(error.cause)) candidates.push(error.cause.status, error.cause.statusCode, error.cause.status_code);
  }
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 100 && candidate <= 599) return candidate;
  }
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : isObject(error) && typeof error.message === "string"
        ? error.message
        : "";
  const explicitStatus = message.match(/\b([1-5]\d{2})\b/);
  if (explicitStatus) return Number(explicitStatus[1]);
  if (/\binternal server error\b/i.test(message)) return 500;
  return null;
}

async function completeTutorProvider(
  provider: TutorProvider,
  prompt: string,
  schema: Record<string, unknown>,
  stage: TutorProviderStage,
): Promise<unknown> {
  try {
    return await provider.complete(prompt, schema, "standard");
  } catch (primaryError) {
    const primaryStatus = safeProviderStatus(primaryError);
    if (primaryStatus === null || primaryStatus < 500 || primaryStatus > 599) {
      throw new TutorProviderUnavailable(stage, primaryStatus, false, null);
    }
    try {
      const response = await provider.complete(prompt, schema, "fast");
      console.info("Parle tutor provider fallback succeeded", { stage, primaryStatus, mode: "fast" });
      return response;
    } catch (fallbackError) {
      throw new TutorProviderUnavailable(stage, primaryStatus, true, safeProviderStatus(fallbackError));
    }
  }
}

function safeTutorActionStage(action: unknown): string {
  if (action === "tutor_open_session") return "session_opening";
  if (action === "tutor_send_message") return "learner_reply";
  if (action === "tutor_grade_practice") return "practice_submission";
  if (action === "tutor_submit_mini_test") return "mini_test_submission";
  if (action === "tutor_finish_session") return "session_finish";
  return "tutor_action";
}

async function ownerRows(client: any, user: Learner, entityName: string, filters: Record<string, unknown> = {}, sort = "-created_at", limit = 100): Promise<Row[]> {
  const entity = (client.entities as Record<string, any>)[entityName];
  if (!entity?.filter || !user.id || !user.email) throw new Error(`Private ${entityName} records are unavailable.`);
  const response = await entity.filter({ ...filters, created_by: user.email, user_id: user.id }, sort, limit);
  return recordsFromResponse<Row>(response).filter((row) => row.user_id === user.id && (row.created_by === undefined || row.created_by === user.email));
}

async function parleProfileRows(client: any, user: Learner): Promise<Row[]> {
  const response = await client.entities.ParleProfile.filter({ created_by: user.email }, "-created_at", 20);
  return recordsFromResponse<Row>(response).filter((row) => row.created_by === undefined || row.created_by === user.email);
}

function profileGoal(profile: Profile): string {
  const names: Record<string, string> = {
    canada_immigration: "Canadian immigration language goals",
    canadian_citizenship: "Canadian citizenship and everyday French",
    conversation: "confident French conversation",
    general_fluency: "greater fluency in French",
    work: "using French at work",
    job_interview: "a French job interview",
    school: "using French in study",
  };
  const goal = plainText(profile.main_goal, 120);
  const other = plainText(profile.other_goal_text, 140);
  if (goal === "other" && other) return other;
  return names[goal] ?? (goal || "your French learning goal");
}

function topicLabel(topic: string): string {
  const names: Record<string, string> = {
    work: "work and work experience", housing: "housing and home life", services: "public services",
    opinions: "sharing opinions", everyday_life: "everyday life", community: "community life",
    appointments: "appointments", personal_history: "personal history", general_conversation: "everyday French conversation",
    grammar_question: "French grammar and vocabulary", individual_feedback: "personal feedback",
  };
  return names[topic] ?? (plainText(topic, 120) || "French conversation practice");
}

function targetLevels(profile: Profile): Record<string, string | null> {
  const raw = parseObject(profile.target_per_skill) ?? {};
  const aliases: Record<TutorSkill, string[]> = { listening: ["listening", "L", "l"], reading: ["reading", "R", "r"], writing: ["writing", "W", "w"], speaking: ["speaking", "S", "s"] };
  return Object.fromEntries(Object.entries(aliases).map(([skill, keys]) => {
    const value = keys.map((key) => raw[key]).find((candidate) => candidate !== undefined && candidate !== null && candidate !== "");
    return [skill, value === undefined ? null : plainText(value, 40) || String(value)];
  }));
}

function estimateRows(rows: Row[], profile: Profile): TutorContext["currentEstimates"] {
  const fallback: Record<string, number> = { A0: 0, A1: 1, A2: 2, B1: 3, B2: 4 };
  const base = fallback[String(profile.self_assessed_level ?? "A0")] ?? 0;
  const result = {} as TutorContext["currentEstimates"];
  for (const skill of SKILLS) {
    const row = rows.find((item) => item.skill === skill && typeof item.value === "number" && Number.isFinite(item.value));
    const score = row && typeof row.value === "number" ? Math.max(0, Math.min(5, row.value)) : base;
    result[skill] = { score, level: tutorLevelForEstimate(score), state: plainText(row?.state, 40) || "unverified" };
  }
  return result;
}

function taskContext(task: Row | null): string {
  if (!task) return "No planned task is attached; use the learner's current weekly focus.";
  const content = parseObject(task.content_json) ?? {};
  const title = plainText(content.title, 120);
  const text = plainText(content.text, 500);
  return [
    `Task type: ${plainText(task.type, 40) || "practice"}`,
    `Skill: ${plainText(task.skill, 40) || "general French"}`,
    `Topic: ${topicLabel(plainText(task.topic, 120))}`,
    typeof task.minutes === "number" ? `Scheduled duration: ${Math.max(0, Math.floor(task.minutes))} minutes` : "",
    title ? `Saved task title: ${title}` : "",
    text ? `Saved task material: ${text}` : "",
  ].filter(Boolean).join("; ");
}

async function loadContext(client: any, user: Learner, identity: LearnerIdentity, profile: Profile, task: Row | null, now = new Date(), stripe?: any, testStripeSecret?: string | null): Promise<TutorContext> {
  if (typeof user.id !== "string" || !user.id.trim()) throw new Error("The authenticated learner could not be confirmed.");
  const [parleProfiles, roadmaps, mistakes, mastery, appSettings, premiumStatus] = await Promise.all([
    parleProfileRows(client, user),
    ownerRows(client, user, "roadmap", { profile_id: profile.id }, "-created_at", 50),
    ownerRows(client, user, "mistake_log", {}, "-created_at", 20),
    ownerRows(client, user, "topic_mastery", {}, "-created_at", 200),
    readAppSettings(client),
    resolveCombinedPremiumStatus({
      identity,
      authenticatedUserId: user.id,
      authenticatedUserEmail: user.email,
      client,
      stripe,
      testStripeSecret,
      now,
    }),
  ]);
  const parleProfile = parleProfiles[0] ?? {};
  const timeZone = resolveTutorTimeZone(parleProfile.time_zone, profile.time_zone);
  const dayKey = localDateKey(now, timeZone);
  const nativeLanguage = plainText(parleProfile.native_language || profile.native_language, 60) || "English";
  const explainInNative = parleProfile.explain_in_native === true;
  const currentRoadmap = roadmaps.find((row) => row.user_id === user.id && row.profile_id === profile.id && row.track === profile.track) ?? null;
  const [estimates, weeks, usage] = await Promise.all([
    currentRoadmap?.id ? ownerRows(client, user, "skill_estimate", { roadmap_id: currentRoadmap.id }, "-created_at", 100) : Promise.resolve([]),
    currentRoadmap?.id ? ownerRows(client, user, "week_plan", { roadmap_id: currentRoadmap.id, status: "active" }, "-created_at", 100) : Promise.resolve([]),
    ownerRows(client, user, "usage_counter", { period: "day", period_key: dayKey }, "-created_at", 500),
  ]);
  const currentEstimates = estimateRows(estimates, profile);
  const week = weeks.find((row) => row.roadmap_id === currentRoadmap?.id && row.status === "active") ?? null;
  const snapshot = parseObject(week?.allocation_json) ?? {};
  const savedTasks = Array.isArray(snapshot.tasks) ? snapshot.tasks.filter(isObject) : [];
  const focusTopicIds = [...new Set(savedTasks
    .filter((item) => item.type !== "weekly_checkin" && item.status !== "dropped" && typeof item.topic === "string")
    .map((item) => plainText(item.topic, 120)).filter(Boolean))].slice(0, 4);
  const weeklyFocus = focusTopicIds.length ? focusTopicIds.map(topicLabel).join(", ") : topicLabel(profile.track === "immigration" ? "work" : profile.track === "citizenship" ? "community" : "general_conversation");
  const latestMastery = new Map<string, Row>();
  for (const item of mastery) if (typeof item.topic === "string" && item.topic.trim() && !latestMastery.has(item.topic.trim())) latestMastery.set(item.topic.trim(), item);
  const latestMasteryRows = [...latestMastery.values()];
  const masteredTopics = latestMasteryRows.filter((item) => typeof item.rolling_score === "number" && item.rolling_score >= 80).map((item) => topicLabel(String(item.topic)));
  const weakTopics = latestMasteryRows.filter((item) => typeof item.rolling_score === "number" && item.rolling_score < 60).map((item) => topicLabel(String(item.topic)));
  const recentMistakes = mistakes.slice(0, 20).map((item) => `${plainText(item.skill, 30)} / ${plainText(item.area, 30)} / ${topicLabel(plainText(item.topic, 120))}: ${plainText(item.original_sentence, 150)} → ${plainText(item.corrected_sentence, 150)}`);
  const messagesUsed = countUsageEventRows(usage);
  const planTier = premiumStatus.premium ? "premium" as const : "free" as const;
  const messagesLimit = dailyMessageLimit(
    planTier,
    planTier === "premium",
    appSettings.free_ai_messages_per_day,
    appSettings.premium_fair_use_ai_messages_per_day,
  );
  const messagesRemaining = remainingDailyMessages(
    messagesUsed,
    planTier,
    planTier === "premium",
    appSettings.free_ai_messages_per_day,
    appSettings.premium_fair_use_ai_messages_per_day,
  );
  const limitReason = messagesRemaining <= 0
    ? planTier === "premium" ? "premium_fair_use" as const : "free_daily_limit" as const
    : null;
  return {
    goal: profileGoal(profile),
    track: plainText(profile.track, 30) || "general",
    targetDate: plainText(profile.target_date, 20) || null,
    targets: targetLevels(profile),
    currentEstimates,
    weeklyFocus,
    focusTopicIds,
    taskContext: taskContext(task),
    taskRecord: task,
    recentMistakes,
    masteredTopics,
    weakTopics,
    nativeLanguage,
    explainInNative,
    timeZone,
    dayKey,
    planTier,
    premiumStatus,
    premiumDetails: premiumStatus,
    premiumEligible: premiumStatus.premium === true,
    premiumRoadmapTriggersEnabled: appSettings.premium_roadmap_triggers_enabled === true,
    currentWeek: week,
    currentWeekSnapshot: snapshot,
    messagesUsed,
    messagesRemaining,
    messagesLimit,
    freeMessagesLimit: appSettings.free_ai_messages_per_day,
    premiumMessagesLimit: appSettings.premium_fair_use_ai_messages_per_day,
    limitReason,
    voiceMinutesRemaining: monthlyVoiceMinuteLimit(planTier, false),
  };
}

function contextForClient(context: TutorContext) {
  return {
    goal: context.goal,
    track: context.track,
    weeklyFocus: context.weeklyFocus,
    currentEstimates: context.currentEstimates,
    nativeLanguage: context.nativeLanguage,
    explainInNative: context.explainInNative,
    planTier: context.planTier,
    messagesRemaining: context.messagesRemaining,
    messagesLimit: context.messagesLimit,
    limitReason: context.limitReason,
    voiceMinutesRemaining: context.voiceMinutesRemaining,
  };
}

function diagnosticForClient(context: TutorContext): TutorDiagnostic {
  return {
    tier: context.planTier,
    limitApplied: context.messagesLimit,
    messagesCountedToday: context.messagesUsed,
    localDayKey: context.dayKey,
    compRecordFound: context.premiumStatus.compRecordFound,
    recordType: context.premiumStatus.recordType,
    lookupField: context.premiumStatus.lookupField,
    learnerKeyType: context.premiumStatus.learnerKeyType,
    statusField: context.premiumStatus.statusField,
  };
}

function explanationAt(context: TutorContext, skill: TutorSkill): Explanation {
  return { level: context.currentEstimates[skill].level as Explanation["level"], nativeLanguage: context.nativeLanguage, explainInNative: context.explainInNative };
}

function weakestSkill(context: TutorContext): TutorSkill {
  return [...SKILLS].sort((a, b) => context.currentEstimates[a].score - context.currentEstimates[b].score || SKILLS.indexOf(a) - SKILLS.indexOf(b))[0];
}

function skillFor(mode: TutorMode, context: TutorContext, task: Row | null, requested: unknown): TutorSkill {
  const taskSkill = typeof task?.skill === "string" && SKILLS.includes(task.skill as TutorSkill) ? task.skill as TutorSkill : null;
  if (taskSkill) return taskSkill;
  if (typeof requested === "string" && SKILLS.includes(requested as TutorSkill)) return requested as TutorSkill;
  if (mode === "writing") return "writing";
  if (mode === "speaking" || mode === "chat") return "speaking";
  if (mode === "question") return "reading";
  return weakestSkill(context);
}

export function modeForTask(task: Row | string): TutorMode | null {
  const type = typeof task === "string" ? task : task.type;
  if (type === "ai_lesson") return "lesson";
  if (type === "speaking_practice") return "speaking";
  if (type === "writing") return "writing";
  return null;
}

function tutorItem(value: unknown, fallbackTheme = "general_conversation"): Item | null {
  if (!isObject(value) || typeof value.id !== "string" || typeof value.prompt !== "string" || typeof value.answer_option_id !== "string" || typeof value.explanation !== "string") return null;
  const options = Array.isArray(value.options) ? value.options.flatMap((option) => isObject(option) && typeof option.id === "string" && typeof option.text === "string" ? [{ id: option.id.trim().slice(0, 80), text: option.text.trim().slice(0, 250) }] : []) : [];
  const id = value.id.trim().slice(0, 80);
  const prompt = value.prompt.trim().slice(0, 500);
  const answer = value.answer_option_id.trim().slice(0, 80);
  if (!id || !prompt || options.length < 2 || options.length > 4 || new Set(options.map((item) => item.id)).size !== options.length || options.some((item) => !item.id || !item.text) || !options.some((item) => item.id === answer)) return null;
  const area = value.area === "vocabulary" || value.area === "structure" ? value.area : "grammar";
  const exampleSentence = plainText(value.example_sentence, 400) || prompt;
  const explanation = plainText(value.explanation, 500);
  const theme = normalizedTheme(value.theme, fallbackTheme);
  const language_point = classifiedLanguagePoint(value.language_point, `${prompt} ${exampleSentence} ${explanation}`, area, theme);
  return { id, prompt, area, example_sentence: exampleSentence, language_point, theme, options, answer_option_id: answer, explanation };
}

function normalizedResponse(value: unknown, mode: TutorMode, operation: "opening" | "reply", learnerInput = "", fallbackTheme = "general_conversation"): NormalizedTutorResponse | null {
  const result = resultObject(value);
  if (!isObject(result) || typeof result.reply !== "string") return null;
  const practiceRaw = Array.isArray(result.practice_items) ? result.practice_items : [];
  const testRaw = Array.isArray(result.mini_test) ? result.mini_test : [];
  const practiceItems = practiceRaw.map((item) => tutorItem(item, fallbackTheme));
  const miniTest = testRaw.map((item) => tutorItem(item, fallbackTheme));
  if (practiceItems.some((item) => !item) || miniTest.some((item) => !item)) return null;
  if (mode === "lesson" && operation === "opening" && (practiceItems.length < 3 || practiceItems.length > 5 || miniTest.length !== 3)) return null;
  const correctionsRaw = Array.isArray(result.corrections) ? result.corrections : [];
  const normalizedCorrections = correctionsRaw.flatMap((entry) => {
    if (!isObject(entry)) return [];
    const original = learnerText(entry.original_sentence, 400);
    const corrected = learnerText(entry.corrected_sentence, 400);
    const explanation = plainText(entry.explanation, 500);
    if (!original || !corrected || original === corrected || !explanation || (learnerInput && !learnerInput.toLocaleLowerCase().includes(original.toLocaleLowerCase()))) return [];
    const area: "grammar" | "vocabulary" | "structure" = entry.area === "vocabulary" || entry.area === "structure" ? entry.area : "grammar";
    const example_sentence = learnerText(entry.example_sentence, 400) || corrected;
    const theme = normalizedTheme(entry.theme, fallbackTheme);
    const language_point = classifiedLanguagePoint(entry.language_point, `${explanation} ${original} ${corrected} ${example_sentence}`, area, theme);
    return [{ original_sentence: original, corrected_sentence: corrected, explanation, area, example_sentence, language_point, theme }];
  }).slice(0, 8);
  const output: NormalizedTutorResponse = {
    reply: learnerText(result.reply, 1800),
    scenario: learnerText(result.scenario, 900),
    writingPrompt: learnerText(result.writing_prompt, 900),
    correctedText: learnerText(result.corrected_text, 6000),
    feedbackSummary: learnerText(result.feedback_summary, 1200),
    taskCompletionFeedback: learnerText(result.task_completion_feedback, 600),
    grammarFeedback: learnerText(result.grammar_feedback, 600),
    vocabularyFeedback: learnerText(result.vocabulary_feedback, 600),
    optionalPractice: learnerText(result.optional_practice, 500),
    practiceItems: practiceItems as Item[],
    miniTest: miniTest as Item[],
    corrections: normalizedCorrections,
  };
  if (!output.reply) return null;
  if (mode === "speaking" && operation === "opening" && !output.scenario) return null;
  if (mode === "writing" && operation === "opening" && !output.writingPrompt) return null;
  if (mode === "writing" && operation === "reply" && !output.correctedText) output.correctedText = learnerInput;
  return output;
}

function publicItems(items: Item[]) {
  return items.map((item) => ({
    id: item.id,
    prompt: item.prompt,
    area: item.area,
    example_sentence: item.example_sentence,
    language_point: item.language_point,
    theme: item.theme,
    options: item.options.map((option) => ({ id: option.id, text: option.text })),
  }));
}

function mutationRecord(value: unknown): Row | null {
  const unwrapped = isObject(value) && isObject(value.data) ? value.data : value;
  return isObject(unwrapped) ? unwrapped as Row : null;
}

async function saveMessage(client: any, user: Learner, values: {
  sessionId: string; sender: "learner" | "tutor_ai"; text: string; transcript?: string; skill: TutorSkill; topic: string; feedback?: Record<string, unknown>;
}): Promise<Row | null> {
  const result = await client.entities.ai_message.create({
    user_id: user.id,
    session_id: values.sessionId,
    sender: values.sender,
    text: values.text.slice(0, 6000),
    audio_url: "",
    transcript: (values.transcript ?? "").slice(0, 4000),
    feedback_json: JSON.stringify(values.feedback ?? {}),
    skill: values.skill,
    topic: values.topic,
  });
  return mutationRecord(result);
}

async function saveCorrections(client: any, user: Learner, session: Row, skill: TutorSkill, topic: string, messageId: string, corrections: NormalizedTutorResponse["corrections"]): Promise<void> {
  for (const correction of corrections) {
    await client.entities.mistake_log.create({
      user_id: user.id,
      session_id: session.id,
      message_id: messageId,
      skill,
      area: correction.area,
      topic,
      language_point: correction.language_point,
      theme: correction.theme || topic,
      example_sentence: correction.example_sentence,
      original_sentence: correction.original_sentence,
      corrected_sentence: correction.corrected_sentence,
      explanation: correction.explanation,
    });
  }
}

async function findSession(client: any, user: Learner, sessionId: string): Promise<Row | null> {
  const rows = await ownerRows(client, user, "ai_session", { id: sessionId }, "-created_at", 5);
  return rows.find((row) => row.id === sessionId && row.user_id === user.id) ?? null;
}

async function findTask(client: any, user: Learner, taskId: string): Promise<Row | null> {
  const rows = await ownerRows(client, user, "learner_task", { id: taskId }, "-created_at", 5);
  return rows.find((row) => row.id === taskId && row.user_id === user.id) ?? null;
}

async function sessionTask(client: any, user: Learner, session: Row): Promise<Row | null> {
  const id = plainText(session.task_id, 120);
  if (!id) return null;
  const task = await findTask(client, user, id);
  if (!task) throw new Error("The task attached to this tutor session could not be confirmed.");
  return task;
}

async function sessionMessages(client: any, user: Learner, sessionId: string): Promise<Row[]> {
  return ownerRows(client, user, "ai_message", { session_id: sessionId }, "-created_at", 100);
}

function savedTutorItem(value: unknown, lessonId: string, collection: string, itemIndex: number, fallbackTheme: string): Item | null {
  if (!isObject(value) || !Array.isArray(value.options)) return null;
  const rawOptions = value.options;
  const legacyShape = rawOptions.length >= 2 && rawOptions.length <= 4 && rawOptions.every((option) =>
    typeof option === "string" || (isObject(option) && typeof option.text === "string" && (option.id === undefined || option.id === null || option.id === ""))
  );

  if (legacyShape) {
    const optionTexts = rawOptions.map((option) =>
      typeof option === "string" ? option.trim().slice(0, 250) : String((option as Record<string, unknown>).text).trim().slice(0, 250)
    );
    if (optionTexts.some((text) => !text)) return null;
    const itemId = typeof value.id === "string" && value.id.trim()
      ? value.id.trim().slice(0, 80)
      : legacyTutorItemId(lessonId, collection, itemIndex);
    const legacy = projectLegacyTutorOptions(lessonId, collection, itemId, itemIndex, optionTexts);
    const normalized = tutorItem({
      ...value,
      id: itemId,
      options: legacy.options,
      answer_option_id: legacy.answerOptionId,
    }, fallbackTheme);
    return normalized
      ? { ...normalized, options: legacy.options, answer_option_id: legacy.answerOptionId, legacy_option_identity: true }
      : null;
  }

  const savedChoiceShape = rawOptions.length >= 2 && rawOptions.length <= 4 && rawOptions.every((option) =>
    isObject(option) && typeof option.id === "string" && Boolean(option.id.trim()) && typeof option.text === "string" && Boolean(option.text.trim())
  );
  if (!savedChoiceShape) return null;
  return tutorItem(value, fallbackTheme);
}

/** Projects a saved lesson's options without modifying the persisted lesson record. */
export function projectSavedTutorItems(lessonId: string, collection: string, value: unknown, fallbackTheme = "general_conversation"): Item[] | null {
  if (!lessonId.trim() || !collection.trim() || !Array.isArray(value)) return null;
  const items = value.map((entry, itemIndex) => savedTutorItem(entry, lessonId, collection, itemIndex, fallbackTheme));
  if (items.some((item) => item === null)) return null;
  return items as Item[];
}

async function lessonBundle(client: any, user: Learner, sessionId: string, fallbackTheme = "general_conversation"): Promise<{ practiceItems: Item[]; miniTest: Item[] } | null> {
  const messages = await sessionMessages(client, user, sessionId);
  for (const message of messages) {
    if (message.sender !== "tutor_ai") continue;
    const feedback = parseObject(message.feedback_json) ?? {};
    const bundle = isObject(feedback.lesson_bundle) ? feedback.lesson_bundle : null;
    if (!bundle) continue;
    const practice = projectSavedTutorItems(sessionId, "practice_items", bundle.practice_items, fallbackTheme);
    const test = projectSavedTutorItems(sessionId, "mini_test", bundle.mini_test, fallbackTheme);
    if (practice?.length && test?.length === 3) return { practiceItems: practice, miniTest: test };
  }
  return null;
}

async function consumeMessage(client: any, user: Learner, context: TutorContext, sessionId: string): Promise<number | null> {
  if (context.messagesRemaining <= 0) return null;
  await client.entities.usage_counter.create({
    user_id: user.id,
    period: "day",
    period_key: context.dayKey,
    ai_messages: 1,
    voice_minutes: 0,
    source_session_id: sessionId,
    source_event_id: crypto.randomUUID(),
  });
  return Math.max(0, context.messagesLimit - context.messagesUsed - 1);
}

async function topicEvidence(client: any, user: Learner, session: Row, context: TutorContext, skill: TutorSkill, topic: string, source: "practice" | "mini_test", item: Item, correct: boolean): Promise<{
  itemScore: number;
  languagePoint: string;
  priorPointRollingScore: number | null;
  pointRollingScore: number;
}> {
  const itemKey = `${session.id}:${source}:${item.id}`.slice(0, 180);
  const existing = await ownerRows(client, user, "topic_mastery", { session_id: session.id, item_key: itemKey }, "-created_at", 3);
  if (existing[0] && typeof existing[0].item_score === "number") {
    return {
      itemScore: existing[0].item_score,
      languagePoint: typeof existing[0].language_point === "string" ? existing[0].language_point : item.language_point,
      priorPointRollingScore: null,
      pointRollingScore: typeof existing[0].language_point_rolling_score === "number"
        ? existing[0].language_point_rolling_score
        : existing[0].item_score,
    };
  }
  const history = await ownerRows(client, user, "topic_mastery", { topic }, "-created_at", 30);
  const itemScore = correct ? 100 : 0;
  const priorScores = history.filter((row) => row.session_id !== session.id || row.item_key !== itemKey)
    .map((row) => row.item_score).filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  const rollingScore = rollingMasteryScore([itemScore, ...priorScores]);
  const languagePoint = item.language_point || classifiedLanguagePoint("", `${item.prompt} ${item.explanation}`, item.area, item.theme || topic);
  const pointKey = languagePointKey(languagePoint);
  const pointHistory = await ownerRows(client, user, "topic_mastery", { language_point_key: pointKey }, "-created_at", 30);
  const priorPointScores = pointHistory.filter((row) => row.session_id !== session.id || row.item_key !== itemKey)
    .map((row) => row.item_score).filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  const priorPointRollingScore = priorPointScores.length ? rollingMasteryScore(priorPointScores) : null;
  const pointRollingScore = rollingMasteryScore([itemScore, ...priorPointScores]);
  await client.entities.topic_mastery.create({
    user_id: user.id,
    session_id: session.id,
    skill,
    topic,
    theme: item.theme || topic,
    language_point: languagePoint,
    language_point_key: pointKey,
    source,
    item_key: itemKey,
    item_score: itemScore,
    rolling_score: rollingScore,
    language_point_rolling_score: pointRollingScore,
  });
  return { itemScore, languagePoint, priorPointRollingScore, pointRollingScore };
}

function localNoonAsUtc(localDate: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return "";
  const parsed = new Date(`${localDate}T12:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== localDate) return "";
  const [year, month, day] = localDate.split("-").map(Number);
  const targetWallTime = Date.UTC(year, month - 1, day, 12, 0, 0);
  let candidate = targetWallTime;
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(candidate));
      const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
      const representedWallTime = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
      const correction = targetWallTime - representedWallTime;
      candidate += correction;
      if (correction === 0) break;
    }
  } catch {
    return "";
  }
  return new Date(candidate).toISOString();
}

async function savePremiumLanguagePointPractice(
  client: any,
  user: Learner,
  context: TutorContext,
  mastery: { languagePoint: string; priorPointRollingScore: number | null; pointRollingScore: number },
  skill: TutorSkill,
): Promise<void> {
  const week = context.currentWeek;
  const weekPlanId = typeof week?.id === "string" ? week.id : "";
  const roadmapId = typeof week?.roadmap_id === "string" ? week.roadmap_id : "";
  if (!weekPlanId || !roadmapId) return;

  const snapshot = context.currentWeekSnapshot;
  const weekStartLocal = typeof week.week_start_local === "string"
    ? week.week_start_local
    : typeof snapshot.weekStartDate === "string"
      ? snapshot.weekStartDate
      : "";
  const weekEndLocal = typeof snapshot.weekEndDate === "string" ? snapshot.weekEndDate : "";
  const savedSnapshotTasks = Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
  const snapshotTasks = savedSnapshotTasks.filter(isObject);
  const learnerTasks = await ownerRows(client, user, "learner_task", {}, "-created_at", 500);
  const currentWeekTaskRows = learnerTasks.filter((row) => {
    const date = typeof row.date_local === "string" ? row.date_local : "";
    return row.week_plan_id === weekPlanId || (date >= weekStartLocal && date <= weekEndLocal && Boolean(date));
  });
  const persistedTasks = currentWeekTaskRows.map((row) => {
    const taskKey = typeof row.task_key === "string" ? row.task_key : "";
    const separator = taskKey.lastIndexOf(":");
    return {
      id: separator >= 0 ? taskKey.slice(separator + 1) : row.id,
      task_key: taskKey,
      taskKey,
    };
  });
  const decision = planPremiumLanguagePointPractice({
    priorScore: mastery.priorPointRollingScore,
    nextScore: mastery.pointRollingScore,
    premiumEligible: context.premiumEligible,
    triggerEnabled: context.premiumRoadmapTriggersEnabled,
    languagePoint: mastery.languagePoint,
    skill,
    todayLocal: context.dayKey,
    weekStartLocal,
    weekEndLocal,
    weekPlanId,
    dailyLimits: snapshot.dailyLimits,
    dailyMinutes: snapshot.dailyMinutes,
    scheduledTaskMinutes: snapshot.scheduledTaskMinutes ?? week.total_minutes,
    plannedLearningMinutes: snapshot.plannedLearningMinutes,
    existingTasks: [...snapshotTasks, ...persistedTasks],
    existingWhatChangedNote: typeof week.what_changed_note === "string" ? week.what_changed_note : "",
  });
  if (!decision.task) return;

  const task = decision.task;
  const taskKey = `${weekPlanId}:${task.id}`;
  const savedTask = mutationRecord(await client.entities.learner_task.create({
    user_id: user.id,
    roadmap_id: roadmapId,
    week_plan_id: weekPlanId,
    task_key: taskKey,
    date_local: task.date,
    scheduled_at_utc: localNoonAsUtc(task.date, context.timeZone),
    type: task.type,
    skill: task.skill,
    minutes: task.minutes,
    topic: task.topic,
    reason: task.reason,
    reason_skill: task.reasonSkill,
    status: task.status,
    rollover_count: task.rolloverCount,
    optional: task.optional,
    tutor_window: "",
    original_date_local: task.date,
    content_json: JSON.stringify({
      title: "Focused practice",
      instructions: "Use the AI lesson to practise this language point.",
      text: `Focus on ${task.topic}.`,
      vocabulary: [],
      questions: [],
      steps: [],
    }),
    content_source: "plan_only",
    source_ref: "",
    completed_at_utc: "",
  }));
  if (!savedTask?.id) throw new Error("The targeted language-point task could not be confirmed.");

  const updatedSnapshot = {
    ...snapshot,
    tasks: [...savedSnapshotTasks, task],
    dailyMinutes: decision.dailyMinutes,
    scheduledTaskMinutes: decision.scheduledTaskMinutes,
    ...(decision.plannedLearningMinutes !== undefined ? { plannedLearningMinutes: decision.plannedLearningMinutes } : {}),
  };
  const allocationJson = JSON.stringify(updatedSnapshot);
  await client.entities.week_plan.update(weekPlanId, {
    allocation_json: allocationJson,
    total_minutes: decision.scheduledTaskMinutes,
    what_changed_note: decision.whatChangedNote,
  });
  context.currentWeekSnapshot = updatedSnapshot;
  context.currentWeek = {
    ...week,
    allocation_json: allocationJson,
    total_minutes: decision.scheduledTaskMinutes,
    what_changed_note: decision.whatChangedNote,
  };
}

async function saveWrongAnswer(client: any, user: Learner, session: Row, skill: TutorSkill, topic: string, item: Item, selectedOptionId: string): Promise<void> {
  const chosen = item.options.find((option) => option.id === selectedOptionId);
  const answer = item.options.find((option) => option.id === item.answer_option_id);
  if (!chosen || !answer || chosen.id === answer.id) return;
  const message = await saveMessage(client, user, {
    sessionId: String(session.id), sender: "tutor_ai", skill, topic,
    text: item.explanation || "Your selected answer and the corrected answer are saved for review.",
    feedback: { kind: "practice_correction", area: item.area, language_point: item.language_point, theme: item.theme, original_sentence: chosen.text, corrected_sentence: answer.text, example_sentence: item.example_sentence, explanation: item.explanation },
  });
  await client.entities.mistake_log.create({
    user_id: user.id,
    session_id: session.id,
    message_id: typeof message?.id === "string" ? message.id : "",
    skill,
    area: item.area,
    topic,
    language_point: item.language_point,
    theme: item.theme || topic,
    example_sentence: item.example_sentence,
    original_sentence: chosen.text,
    corrected_sentence: answer.text,
    explanation: item.explanation || "Review why the corrected French option fits this practice item.",
  });
}

function taskSummary(task: Row | null) {
  if (!task) return null;
  return { id: task.id, type: task.type, skill: task.skill, topic: task.topic, minutes: task.minutes };
}

function tutorLimitResponse(context: TutorContext, origin: string | null): Response {
  const limitReason = context.limitReason ?? (context.planTier === "premium" ? "premium_fair_use" : "free_daily_limit");
  return jsonResponse({
    status: "limit",
    error: limitReason === "premium_fair_use" ? "Premium fair-use daily tutor message limit reached." : "Daily tutor message limit reached.",
    messages_remaining: context.messagesRemaining,
    messages_limit: context.messagesLimit,
    plan_tier: context.planTier,
    limit_reason: limitReason,
    context: contextForClient(context),
    diagnostic: diagnosticForClient(context),
  }, 200, origin);
}

export async function handleTutorServiceAction(input: TutorServiceActionInput): Promise<Response> {
  try {
    return await runTutorServiceAction(input);
  } catch (error) {
    const providerFailure = error instanceof TutorProviderUnavailable;
    console.error("Parle tutor service action failed", {
      stage: providerFailure ? error.stage : safeTutorActionStage(input.body.action),
      code: providerFailure ? "provider_unavailable" : "request_failed",
      providerStatus: providerFailure ? error.primaryStatus : safeProviderStatus(error),
      fallbackAttempted: providerFailure ? error.fallbackAttempted : false,
      fallbackStatus: providerFailure ? error.fallbackStatus : null,
    });
    return jsonResponse({
      error: providerFailure
        ? "The AI tutor is temporarily unavailable. Please try again."
        : "The tutor could not complete that step. Please try again.",
    }, providerFailure ? 503 : 500, input.origin);
  }
}

async function runTutorServiceAction(input: TutorServiceActionInput): Promise<Response> {
  const { client, user, identity, profile, body, provider, origin } = input;
  const action = body.action;

  if (action === "tutor_get_plan_summary") {
    const context = await loadContext(client, user, identity, profile, null, input.now, input.stripe, input.testStripeSecret);
    return jsonResponse({
      status: "complete",
      summary: {
        plan_tier: context.planTier,
        messages_used: context.messagesUsed,
        messages_limit: context.messagesLimit,
        free_messages_limit: context.freeMessagesLimit,
        premium_messages_limit: context.premiumMessagesLimit,
        billing_source: context.premiumDetails.premiumSource,
        subscription_plan: context.premiumDetails.subscriptionPlan,
        subscription_status: context.premiumDetails.subscriptionStatus,
        current_period_end: context.premiumDetails.currentPeriodEnd,
        cancel_at_period_end: context.premiumDetails.cancelAtPeriodEnd,
      },
    }, 200, origin);
  }

  if (action === "tutor_open_session") {
    const requestedMode = typeof body.mode === "string" ? body.mode : "";
    if (!["lesson", "speaking", "writing", "chat", "question"].includes(requestedMode)) return jsonResponse({ error: "Choose a supported tutor mode." }, 400, origin);
    const mode = requestedMode as TutorMode;
    const taskId = typeof body.task_id === "string" ? body.task_id.trim() : "";
    let task: Row | null = null;
    if (taskId) {
      if (taskId.length > 120) return jsonResponse({ error: "That planned task could not be confirmed." }, 400, origin);
      task = await findTask(client, user, taskId);
      if (!task) return jsonResponse({ error: "This planned task could not be confirmed as yours." }, 403, origin);
      if (["skipped", "dropped"].includes(String(task.status))) return jsonResponse({ error: "This task is no longer available to start." }, 409, origin);
      if (modeForTask(task) !== mode) return jsonResponse({ error: "This tutor mode does not match the selected task." }, 403, origin);
    }
    const context = await loadContext(client, user, identity, profile, task, input.now, input.stripe, input.testStripeSecret);
    if (context.messagesRemaining <= 0) return tutorLimitResponse(context, origin);
    const skill = skillFor(mode, context, task, body.skill);
    const topic = task ? plainText(task.topic, 120) || "general_conversation" : mode === "question" ? "grammar_question" : context.focusTopicIds[0] ?? (profile.track === "immigration" ? "work" : profile.track === "citizenship" ? "community" : "general_conversation");
    const level = context.currentEstimates[skill].level as Explanation["level"];
    const prompt = buildTutorPrompt({
      mode,
      operation: "opening",
      explanation: explanationAt(context, skill),
      goal: context.goal,
      track: context.track,
      targetDate: context.targetDate,
      targets: context.targets,
      currentEstimates: Object.fromEntries(Object.entries(context.currentEstimates).map(([name, estimate]) => [name, estimate.level])),
      weeklyFocus: context.weeklyFocus,
      taskContext: context.taskContext,
      recentMistakes: context.recentMistakes,
      masteredTopics: context.masteredTopics,
      weakTopics: context.weakTopics,
      planTier: context.planTier,
      remainingMessages: context.messagesRemaining,
    });
    const raw = await completeTutorProvider(provider, [
      prompt,
      `Use the verified skill estimate ${level} for the selected skill ${skill}.`,
      `Use the saved learning topic ${JSON.stringify(topic)} as the topic key; explain concepts at the verified skill level.`,
      mode === "lesson" ? "Teach one focused lesson in the reply. Generate 3 to 5 distinct practice items and exactly 3 distinct mini-test items. Each item must have one unambiguous correct option, a concise learner-friendly explanation, and a realistic French example sentence. Give every item a specific language_point such as 'passé composé with être', 'depuis vs pendant', or \"elision j'\", and a separate broad theme such as work or appointments. Never use the broad theme as the language point. Keep item prompts, options, answer phrases, and examples in French; explain concepts in the learner's selected explanation language at the required level." : "Return empty practice_items and mini_test arrays for this mode.",
      mode === "speaking" ? "Return one realistic French speaking scenario aligned with the track and task topic. Ask the learner to answer in a short spoken or typed response." : "",
      mode === "writing" ? "Return one practical French writing prompt aligned with the task and track." : "",
      mode === "question" ? "Offer one optional short French practice prompt after explaining that the learner may continue with an exercise." : "",
      "For a welcome, explicitly reference the saved goal and the current week's focus in your reply. Do not include or infer pronunciation or fluency scores.",
    ].filter(Boolean).join("\n\n"), TUTOR_RESPONSE_SCHEMA, "session_opening");
    const response = normalizedResponse(raw, mode, "opening", "", topic);
    if (!response) {
      console.error("Parle tutor could not validate a session opening", { stage: "session_opening", mode, skill });
      return jsonResponse({ error: "The tutor could not prepare this session. Try opening it again." }, 502, origin);
    }
    const lessonItems = mode === "lesson" ? {
      practiceItems: assignTutorServerOptionIds(response.practiceItems),
      miniTest: assignTutorServerOptionIds(response.miniTest),
    } : null;
    const sessionResult = await client.entities.ai_session.create({
      user_id: user.id,
      mode,
      task_id: taskId,
      skill,
      topic,
      started_at: new Date().toISOString(),
      ended_at: "",
      completed_at: "",
      mastery_score: 0,
      plan_tier: context.planTier,
    });
    const session = mutationRecord(sessionResult);
    if (!session?.id) return jsonResponse({ error: "The tutor session could not be saved. Try again." }, 500, origin);
    const contextualOpening = buildContextFirstMessage({
      level,
      nativeLanguage: context.nativeLanguage,
      explainInNative: context.explainInNative,
      goal: context.goal,
      focus: context.weeklyFocus,
    });
    const openingText = [contextualOpening, response.reply].filter(Boolean).join("\n\n");
    const lesson = lessonItems ? { practice_items: publicItems(lessonItems.practiceItems), mini_test: publicItems(lessonItems.miniTest) } : null;
    const savedMessage = await saveMessage(client, user, {
      sessionId: String(session.id), sender: "tutor_ai", text: openingText, skill, topic,
      feedback: {
        kind: "session_opening",
        lesson_bundle: lessonItems ? { practice_items: lessonItems.practiceItems, mini_test: lessonItems.miniTest } : null,
        scenario: response.scenario,
        writing_prompt: response.writingPrompt,
      },
    });
    if (!savedMessage?.id) return jsonResponse({ error: "The tutor could not save its opening reply. Please try again." }, 500, origin);
    return jsonResponse({
      status: "complete",
      session_id: session.id,
      mode,
      skill,
      topic,
      reply: openingText,
      scenario: response.scenario,
      writing_prompt: response.writingPrompt,
      lesson,
      context: contextForClient(context),
      diagnostic: diagnosticForClient(context),
      task: taskSummary(task),
      opening_message_id: savedMessage?.id ?? "",
    }, 200, origin);
  }

  const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
  if (!sessionId || sessionId.length > 120) return jsonResponse({ error: "Open a tutor session before sending a message." }, 400, origin);
  const session = await findSession(client, user, sessionId);
  if (!session) return jsonResponse({ error: "This tutor session could not be confirmed as yours." }, 404, origin);
  const mode = typeof session.mode === "string" ? session.mode as TutorMode : null;
  if (!mode || !["lesson", "speaking", "writing", "chat", "question"].includes(mode)) return jsonResponse({ error: "This tutor mode is not supported." }, 409, origin);
  if (typeof session.ended_at === "string" && session.ended_at) return jsonResponse({ error: "This tutor session has ended. Start a new session to continue." }, 409, origin);
  const task = await sessionTask(client, user, session);
  const context = await loadContext(client, user, identity, profile, task, input.now, input.stripe, input.testStripeSecret);
  const skill = typeof session.skill === "string" && SKILLS.includes(session.skill as TutorSkill) ? session.skill as TutorSkill : skillFor(mode, context, task, null);
  const topic = plainText(session.topic, 120) || "general_conversation";

  if (action === "tutor_send_message") {
    if (mode === "lesson") return jsonResponse({ error: "Use the lesson practice choices to submit an answer." }, 400, origin);
    const text = learnerText(body.text, 4000);
    const transcript = mode === "speaking" ? learnerText(body.transcript, 4000) : "";
    const learnerInput = transcript || text;
    if (!learnerInput || learnerInput.length > 4000) return jsonResponse({ error: "Write or confirm a short French response before sending." }, 400, origin);
    const remaining = await consumeMessage(client, user, context, sessionId);
    if (remaining === null) return tutorLimitResponse(context, origin);
    const learnerMessage = await saveMessage(client, user, { sessionId, sender: "learner", text: learnerInput, transcript, skill, topic });
    const guardrail = classifyTutorGuardrail(learnerInput);
    let response: NormalizedTutorResponse;
    if (guardrail) {
      response = {
        reply: guardrailReply(guardrail, context.nativeLanguage, context.explainInNative), scenario: "", writingPrompt: "", correctedText: "",
        feedbackSummary: "", taskCompletionFeedback: "", grammarFeedback: "", vocabularyFeedback: "", optionalPractice: "",
        practiceItems: [], miniTest: [], corrections: [],
      };
    } else {
      const prior = (await sessionMessages(client, user, sessionId)).slice(0, 12).reverse().map((item) => ({ sender: plainText(item.sender, 20), text: plainText(item.text, 1200) }));
      const prompt = buildTutorPrompt({
        mode,
        operation: mode === "writing" || mode === "speaking" ? "correction" : "reply",
        explanation: explanationAt(context, skill),
        goal: context.goal,
        track: context.track,
        targetDate: context.targetDate,
        targets: context.targets,
        currentEstimates: Object.fromEntries(Object.entries(context.currentEstimates).map(([name, estimate]) => [name, estimate.level])),
        weeklyFocus: context.weeklyFocus,
        taskContext: context.taskContext,
        recentMistakes: context.recentMistakes,
        masteredTopics: context.masteredTopics,
        weakTopics: context.weakTopics,
        planTier: context.planTier,
        remainingMessages: remaining,
        learnerText: learnerInput,
        priorMessages: prior,
      });
      const raw = await completeTutorProvider(provider, [
        prompt,
        `The current response uses verified skill estimate ${context.currentEstimates[skill].level} for ${skill}.`,
        mode === "writing" ? "Correct the learner's French text. Return a complete corrected_text and explain each real change in corrections. If the text needs no change, return it unchanged and say so." : "",
        mode === "speaking" ? "Give feedback on task completion, grammar, and vocabulary using only the confirmed transcript. Do not score pronunciation or fluency, and do not infer speaking performance beyond the words supplied." : "",
        "Do not invent corrections. Every correction must quote a phrase present in the learner's message, give a corrected French phrase, and provide a French example sentence. Name the exact language_point, such as 'passé composé with être', 'depuis vs pendant', or \"elision j'\", separately from the broad theme. Never use the theme as the language point. Keep quoted and corrected French forms and examples in French; explain the change in the learner's selected explanation language.",
      ].filter(Boolean).join("\n\n"), TUTOR_RESPONSE_SCHEMA, "learner_reply");
      const normalized = normalizedResponse(raw, mode, "reply", learnerInput, topic);
      if (!normalized) {
        console.error("Parle tutor reply failed validation", { mode, sessionId });
        return jsonResponse({ error: "The tutor could not prepare feedback. Your message was saved; try again." }, 502, origin);
      }
      response = normalized;
    }
    const completedResponse = !guardrail && (mode === "writing" || mode === "speaking");
    const tutorMessage = await saveMessage(client, user, {
      sessionId, sender: "tutor_ai", text: response.reply, skill, topic,
      feedback: {
        kind: "tutor_reply",
        completed_response: completedResponse,
        corrected_text: response.correctedText,
        feedback_summary: response.feedbackSummary,
        task_completion_feedback: response.taskCompletionFeedback,
        grammar_feedback: response.grammarFeedback,
        vocabulary_feedback: response.vocabularyFeedback,
        optional_practice: response.optionalPractice,
        corrections: response.corrections,
        guardrail,
      },
    });
    await saveCorrections(client, user, session, skill, topic, typeof tutorMessage?.id === "string" ? tutorMessage.id : "", response.corrections);
    return jsonResponse({
      status: "complete",
      reply: response.reply,
      corrected_text: response.correctedText,
      feedback_summary: response.feedbackSummary,
      task_completion_feedback: response.taskCompletionFeedback,
      grammar_feedback: response.grammarFeedback,
      vocabulary_feedback: response.vocabularyFeedback,
      optional_practice: response.optionalPractice,
      corrections: response.corrections,
      guardrail,
      completed_response: completedResponse,
      skill_level: context.currentEstimates[skill].level,
      messages_remaining: remaining,
      messages_limit: context.messagesLimit,
      plan_tier: context.planTier,
      limit_reason: remaining <= 0 ? context.planTier === "premium" ? "premium_fair_use" : "free_daily_limit" : null,
      learner_message_id: learnerMessage?.id ?? "",
      tutor_message_id: tutorMessage?.id ?? "",
    }, 200, origin);
  }

  if (action === "tutor_grade_practice") {
    if (mode !== "lesson") return jsonResponse({ error: "Practice choices are available in AI lesson mode." }, 400, origin);
    const itemId = typeof body.item_id === "string" ? body.item_id.trim() : "";
    const optionId = typeof body.option_id === "string" ? body.option_id.trim() : "";
    if (!itemId || itemId.length > 80 || !optionId || optionId.length > 80) return jsonResponse({ error: "Choose one practice answer to submit." }, 400, origin);
    const bundle = await lessonBundle(client, user, sessionId, topic);
    const item = bundle?.practiceItems.find((candidate) => candidate.id === itemId);
    if (!item) return jsonResponse({ error: "That practice question does not belong to this lesson." }, 403, origin);
    const chosen = item.options.find((option) => option.id === optionId);
    if (!chosen) return jsonResponse({ error: "Choose an answer from this practice question." }, 400, origin);
    const answerOption = correctTutorOption(item);
    if (!answerOption) return jsonResponse({ error: "The saved answer for this practice question could not be confirmed." }, 409, origin);
    const itemKey = `${session.id}:practice:${item.id}`.slice(0, 180);
    const prior = await ownerRows(client, user, "topic_mastery", { session_id: sessionId, item_key: itemKey }, "-created_at", 2);
    if (prior.length) return jsonResponse({ error: "This practice answer was already submitted." }, 409, origin);
    await saveMessage(client, user, { sessionId, sender: "learner", text: `Practice answer for ${item.prompt}: ${chosen.text}`, skill, topic });
    const correct = isTutorOptionCorrect(item, optionId);
    await topicEvidence(client, user, session, context, skill, topic, "practice", item, correct);
    await saveWrongAnswer(client, user, session, skill, topic, item, optionId);
    await saveMessage(client, user, { sessionId, sender: "tutor_ai", skill, topic, text: item.explanation || "Practice feedback is ready.", feedback: { kind: "practice_result", item_id: item.id, correct, answer: answerOption.text, explanation: item.explanation } });
    return jsonResponse({ status: "complete", correct, answer: answerOption.text, explanation: item.explanation, example_sentence: item.example_sentence, messages_remaining: context.messagesRemaining, messages_limit: context.messagesLimit }, 200, origin);
  }

  if (action === "tutor_submit_mini_test") {
    if (mode !== "lesson") return jsonResponse({ error: "The mini-test is available in AI lesson mode." }, 400, origin);
    const bundle = await lessonBundle(client, user, sessionId, topic);
    if (!bundle || bundle.miniTest.length !== 3) return jsonResponse({ error: "The three-item mini-test could not be confirmed." }, 409, origin);
    const answers = Array.isArray(body.answers) ? body.answers : [];
    if (answers.length !== 3 || answers.some((entry) => !isObject(entry) || typeof entry.item_id !== "string" || typeof entry.option_id !== "string") || new Set(answers.map((entry) => isObject(entry) ? entry.item_id : "")).size !== 3) {
      return jsonResponse({ error: "Answer all three mini-test questions before submitting." }, 400, origin);
    }
    const submitted = new Map<string, string>();
    for (const entry of answers) {
      if (!isObject(entry)) continue;
      submitted.set(String(entry.item_id), String(entry.option_id));
    }
    if (bundle.miniTest.some((item) => !submitted.has(item.id) || !item.options.some((option) => option.id === submitted.get(item.id)))) return jsonResponse({ error: "Use one of the saved answer choices for each mini-test question." }, 400, origin);
    const itemKeys = bundle.miniTest.map((item) => `${session.id}:mini_test:${item.id}`.slice(0, 180));
    const previousScores = await Promise.all(itemKeys.map(async (itemKey) => (await ownerRows(client, user, "topic_mastery", { session_id: sessionId, item_key: itemKey }, "-created_at", 2))[0]));
    if (previousScores.every((row) => row && typeof row.item_score === "number")) {
      const score = calculateMiniTestScore(previousScores.map((row) => Number(row!.item_score) >= 50));
      return jsonResponse({ status: "complete", mastery_score: score, correct_count: previousScores.filter((row) => Number(row?.item_score) >= 50).length, total: 3, results: [], messages_remaining: context.messagesRemaining, messages_limit: context.messagesLimit }, 200, origin);
    }
    const resultRows: Array<{ item_id: string; correct: boolean; answer: string; explanation: string; example_sentence: string }> = [];
    const correctFlags: boolean[] = [];
    for (let index = 0; index < bundle.miniTest.length; index += 1) {
      const item = bundle.miniTest[index];
      const selectedId = submitted.get(item.id)!;
      const selected = item.options.find((option) => option.id === selectedId)!;
      const answer = correctTutorOption(item);
      if (!answer) return jsonResponse({ error: "A saved mini-test answer could not be confirmed." }, 409, origin);
      const existing = previousScores[index];
      const correct = existing && typeof existing.item_score === "number" ? existing.item_score >= 50 : isTutorOptionCorrect(item, selectedId);
      correctFlags.push(correct);
      if (!existing) {
        const evidence = await topicEvidence(client, user, session, context, skill, topic, "mini_test", item, correct);
        await saveWrongAnswer(client, user, session, skill, topic, item, selectedId);
        try {
          await savePremiumLanguagePointPractice(client, user, context, evidence, skill);
        } catch (error) {
          console.error("Parle tutor mini-test trigger task could not be saved", {
            stage: "mini_test_submission",
            code: "premium_language_point_task_save_failed",
            message: error instanceof Error ? error.message : "unknown",
          });
        }
      }
      resultRows.push({ item_id: item.id, correct, answer: answer.text, explanation: item.explanation, example_sentence: item.example_sentence });
    }
    const score = calculateMiniTestScore(correctFlags);
    const learnerAnswerText = `Three-item mini-test submitted: ${bundle.miniTest.map((item) => `${item.prompt} ${item.options.find((option) => option.id === submitted.get(item.id))?.text ?? ""}`).join(" | ")}`.slice(0, 5000);
    await saveMessage(client, user, { sessionId, sender: "learner", skill, topic, text: learnerAnswerText });
    await saveMessage(client, user, { sessionId, sender: "tutor_ai", skill, topic, text: "The three-item mini-test has been scored.", feedback: { kind: "mini_test_result", mastery_score: score, correct_count: correctFlags.filter(Boolean).length, results: resultRows } });
    await client.entities.ai_session.update(String(session.id), { mastery_score: score });
    return jsonResponse({ status: "complete", mastery_score: score, correct_count: correctFlags.filter(Boolean).length, total: 3, results: resultRows, messages_remaining: context.messagesRemaining, messages_limit: context.messagesLimit }, 200, origin);
  }

  if (action === "tutor_finish_session") {
    const messageRows = await sessionMessages(client, user, sessionId);
    if (session.task_id) {
      if (mode === "lesson") {
        const testItems = await lessonBundle(client, user, sessionId, topic);
        const scoredItems = await ownerRows(client, user, "topic_mastery", { session_id: sessionId, source: "mini_test" }, "-created_at", 10);
        if (!testItems || scoredItems.filter((row) => row.item_key && String(row.item_key).includes(":mini_test:")).length < 3 || typeof session.mastery_score !== "number") return jsonResponse({ error: "Complete the three-item mini-test before finishing this task." }, 409, origin);
      } else if (mode === "speaking" || mode === "writing") {
        const hasFeedback = messageRows.some((message) => message.sender === "tutor_ai" && (parseObject(message.feedback_json)?.completed_response === true));
        if (!hasFeedback) return jsonResponse({ error: "Send your response and review the feedback before finishing this task." }, 409, origin);
      }
    }
    const now = new Date().toISOString();
    if (!session.ended_at) {
      await client.entities.ai_session.update(String(session.id), { ended_at: now, completed_at: session.task_id ? now : "" });
    }
    return jsonResponse({ status: "complete", completed_task_id: session.task_id || "", session_id: sessionId }, 200, origin);
  }

  return jsonResponse({ error: "That AI tutor action is not supported." }, 400, origin);
}
