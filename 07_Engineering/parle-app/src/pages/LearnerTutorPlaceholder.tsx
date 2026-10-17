import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Check,
  CircleHelp,
  Clock3,
  FileText,
  History,
  Languages,
  LoaderCircle,
  MessageCircle,
  Mic2,
  Square,
  PenLine,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Volume2,
} from "lucide-react";
import { ai_message, ai_session, mistake_log, topic_mastery } from "@/entities";
import { parleAssessmentService } from "@/functions";
import { t, type TranslationKey } from "@/lib/i18n";
import { VoiceRecorder } from "@/components/parle/VoiceRecorder";
import { MESSAGE_MAX_MS } from "@/lib/voice-audio";
import { loadVoiceStatus, saveReadAloud } from "@/lib/voice-client";
import { ReplyPlayer } from "@/lib/voice-playback";
import { isAbandonedRequest } from "@/lib/tutor-open";
import { markMyLearnerTaskDone } from "@/lib/learner-plan-remote";
import {
  loadMyParleAccount,
  updateMyExplanationPreference,
  type ParleAccountData,
  type ParleUser,
} from "@/lib/parle-profile";

type TutorMode = "lesson" | "speaking" | "writing" | "chat" | "question";
type TutorSkill = "listening" | "reading" | "writing" | "speaking";
type TutorArea = "grammar" | "vocabulary" | "structure";
type TutorTaskType = "ai_lesson" | "speaking_practice" | "writing";
type TutorPlanTier = "free" | "premium";
type TutorLimitReason = "free_daily_limit" | "premium_fair_use" | null;
export type TutorDiagnostic = {
  tier: TutorPlanTier;
  limitApplied: number;
  messagesCountedToday: number;
  localDayKey: string;
  compRecordFound: boolean;
  recordType: "ParleIdentity";
  lookupField: "created_by";
  learnerKeyType: "email";
  statusField: "premium_comp_active";
};
type TutorRow = Record<string, unknown> & { id?: string; user_id?: string; created_by?: string };

interface TutorOption {
  id: string;
  text: string;
}

interface TutorItem {
  id: string;
  prompt: string;
  area: TutorArea;
  example_sentence: string;
  language_point: string;
  theme: string;
  options: TutorOption[];
}

export interface TutorMessage {
  id: string;
  sender: "learner" | "tutor_ai";
  text: string;
  transcript?: string;
  feedback: Record<string, unknown>;
  created_at?: string;
}

interface TutorSessionSummary {
  id: string;
  mode: string;
  task_id: string;
  started_at: string;
  ended_at: string;
  mastery_score: number | null;
}

interface TutorHistory {
  sessions: TutorSessionSummary[];
  messagesBySession: Record<string, TutorMessage[]>;
  mistakes: TutorRow[];
  mastery: TutorRow[];
}

interface TutorTaskSummary {
  id: string;
  type: TutorTaskType;
  skill: TutorSkill | null;
  topic: string;
  minutes: number;
}

interface TutorContext {
  goal: string;
  track: string;
  weeklyFocus: string;
  currentEstimates: Record<string, { score?: number; level: string; state?: string }>;
  nativeLanguage: string;
  explainInNative: boolean;
  planTier: TutorPlanTier;
  messagesRemaining: number;
  messagesLimit: number;
  limitReason: TutorLimitReason;
  voiceMinutesRemaining: number;
}

interface BrowserRecognitionResult {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface BrowserRecognitionError {
  error: string;
}

interface BrowserRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: BrowserRecognitionResult) => void) | null;
  onerror: ((event: BrowserRecognitionError) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type BrowserRecognitionConstructor = new () => BrowserRecognition;

const MODE_ORDER: TutorMode[] = ["chat", "question", "lesson", "speaking", "writing"];
const MODE_KEYS: Record<TutorMode, TranslationKey> = {
  chat: "learner.tutor.mode.chat",
  question: "learner.tutor.mode.question",
  lesson: "learner.tutor.mode.lesson",
  speaking: "learner.tutor.mode.speaking",
  writing: "learner.tutor.mode.writing",
};
const MODE_ICONS: Record<TutorMode, typeof MessageCircle> = {
  chat: MessageCircle,
  question: CircleHelp,
  lesson: BookOpenText,
  speaking: Mic2,
  writing: PenLine,
};
const TASK_TYPE_KEYS: Record<TutorTaskType, TranslationKey> = {
  ai_lesson: "learner.task.type.aiLesson",
  speaking_practice: "learner.task.type.speaking",
  writing: "learner.task.type.writing",
};
const SKILL_KEYS: Record<TutorSkill, TranslationKey> = {
  listening: "learner.tutor.skillListening",
  reading: "learner.tutor.skillReading",
  writing: "learner.tutor.skillWriting",
  speaking: "learner.tutor.skillSpeaking",
};
const AREA_KEYS: Record<TutorArea | "pronunciation", TranslationKey> = {
  grammar: "learner.tutor.areaGrammar",
  vocabulary: "learner.tutor.areaVocabulary",
  structure: "learner.tutor.areaStructure",
  pronunciation: "learner.tutor.areaPronunciation",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseTutorDiagnostic(value: unknown): TutorDiagnostic | null {
  if (!isObject(value)) return null;
  const limitApplied = value.limitApplied;
  const messagesCountedToday = value.messagesCountedToday;
  if (
    (value.tier !== "free" && value.tier !== "premium") ||
    typeof limitApplied !== "number" || !Number.isSafeInteger(limitApplied) || limitApplied < 0 ||
    typeof messagesCountedToday !== "number" || !Number.isSafeInteger(messagesCountedToday) || messagesCountedToday < 0 ||
    typeof value.localDayKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.localDayKey) ||
    typeof value.compRecordFound !== "boolean" ||
    value.recordType !== "ParleIdentity" ||
    value.lookupField !== "created_by" ||
    value.learnerKeyType !== "email" ||
    value.statusField !== "premium_comp_active"
  ) return null;

  return {
    tier: value.tier,
    limitApplied,
    messagesCountedToday,
    localDayKey: value.localDayKey,
    compRecordFound: value.compRecordFound,
    recordType: "ParleIdentity",
    lookupField: "created_by",
    learnerKeyType: "email",
    statusField: "premium_comp_active",
  };
}

function entityRows(value: unknown): TutorRow[] {
  if (Array.isArray(value)) return value.filter(isObject) as TutorRow[];
  if (isObject(value) && Array.isArray(value.data)) return value.data.filter(isObject) as TutorRow[];
  return [];
}

function unwrapTutorResponse(value: unknown): Record<string, unknown> {
  let current: unknown = value;
  for (let index = 0; index < 3; index += 1) {
    if (!isObject(current)) break;
    if (isObject(current.result)) {
      current = current.result;
      continue;
    }
    if (isObject(current.data) && ("status" in current.data || "error" in current.data)) {
      current = current.data;
      continue;
    }
    break;
  }
  return isObject(current) ? current : {};
}

/** The plan tier and today's allowance from the plan summary, read when the tutor page loads (D25 a). */
export function allowanceFromPlanSummary(value: unknown): { tier: TutorPlanTier; used: number; limit: number } | null {
  const payload = unwrapTutorResponse(value);
  const summary = isObject(payload.summary) ? payload.summary : null;
  if (payload.status !== "complete" || !summary) return null;
  const tier: TutorPlanTier | null = summary.plan_tier === "premium" ? "premium" : summary.plan_tier === "free" ? "free" : null;
  const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : null);
  const used = count(summary.messages_used), limit = count(summary.messages_limit);
  return tier && used !== null && limit !== null ? { tier, used, limit } : null;
}

/** Plan badge: a neutral label until the server has said which plan this learner has. */
export function tutorPlanBadgeKey(tier: TutorPlanTier | null, summaryFailed = false): TranslationKey {
  if (tier === "premium") return "learner.tutor.premiumPlan";
  if (tier === "free") return "learner.tutor.freePlan";
  // a failed plan summary must not leave "Checking your plan" on screen for good (R43)
  return summaryFailed ? "learner.tutor.planUnknown" : "learner.tutor.planLoading";
}

function tutorFeedback(value: unknown): Record<string, unknown> {
  if (isObject(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function tutorMessageFromRow(row: TutorRow): TutorMessage | null {
  if ((row.sender !== "learner" && row.sender !== "tutor_ai") || typeof row.text !== "string") return null;
  return {
    id: typeof row.id === "string" ? row.id : `${row.sender}-${String(row.created_at ?? Math.random())}`,
    sender: row.sender,
    text: row.text,
    transcript: typeof row.transcript === "string" ? row.transcript : "",
    feedback: tutorFeedback(row.feedback_json),
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}

function normalizeTutorItems(value: unknown): TutorItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isObject(entry) || typeof entry.id !== "string" || typeof entry.prompt !== "string") return [];
    const options = Array.isArray(entry.options)
      ? entry.options.flatMap((option) => isObject(option) && typeof option.id === "string" && typeof option.text === "string"
        ? [{ id: option.id, text: option.text }]
        : [])
      : [];
    if (options.length < 2 || options.length > 4 || options.some((option) => !option.id.trim() || !option.text.trim()) || new Set(options.map((option) => option.id)).size !== options.length) return [];
    const area: TutorArea = entry.area === "vocabulary" || entry.area === "structure" ? entry.area : "grammar";
    return [{
      id: entry.id,
      prompt: entry.prompt,
      area,
      example_sentence: typeof entry.example_sentence === "string" ? entry.example_sentence : "",
      language_point: typeof entry.language_point === "string" ? entry.language_point : "",
      theme: typeof entry.theme === "string" ? entry.theme : "",
      options,
    }];
  });
}

function modeFromSearch(search: string): TutorMode {
  const mode = new URLSearchParams(search).get("mode");
  return MODE_ORDER.includes(mode as TutorMode) ? mode as TutorMode : "chat";
}

function taskIdFromSearch(search: string): string {
  return new URLSearchParams(search).get("task_id")?.trim().slice(0, 120) ?? "";
}

function prettyTopic(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  return value.replace(/_/g, " ").replace(/\s+/g, " ").trim().replace(/^./, (letter) => letter.toUpperCase());
}

function formatSessionDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function modeKey(value: unknown): TranslationKey {
  return typeof value === "string" && value in MODE_KEYS ? MODE_KEYS[value as TutorMode] : "learner.tutor.mode.chat";
}

async function loadTutorHistory(user: ParleUser): Promise<TutorHistory> {
  if (!user.id || !user.email) return { sessions: [], messagesBySession: {}, mistakes: [], mastery: [] };
  const filters = { created_by: user.email, user_id: user.id };
  const [sessionResponse, mistakeResponse, masteryResponse] = await Promise.all([
    (ai_session as any).filter(filters, "-created_at", 8),
    (mistake_log as any).filter(filters, "-created_at", 12),
    (topic_mastery as any).filter(filters, "-created_at", 200),
  ]);
  const sessionRows = entityRows(sessionResponse).filter((row) => row.user_id === user.id && (row.created_by === undefined || row.created_by === user.email));
  const sessions: TutorSessionSummary[] = sessionRows.flatMap((row) => {
    if (typeof row.id !== "string") return [];
    return [{
      id: row.id,
      mode: typeof row.mode === "string" ? row.mode : "chat",
      task_id: typeof row.task_id === "string" ? row.task_id : "",
      started_at: typeof row.started_at === "string" ? row.started_at : "",
      ended_at: typeof row.ended_at === "string" ? row.ended_at : "",
      mastery_score: typeof row.mastery_score === "number" && Number.isFinite(row.mastery_score) ? row.mastery_score : null,
    }];
  });
  const mistakes = entityRows(mistakeResponse).filter((row) => row.user_id === user.id && (row.created_by === undefined || row.created_by === user.email));
  const mastery = entityRows(masteryResponse).filter((row) => row.user_id === user.id && (row.created_by === undefined || row.created_by === user.email));
  const messageEntries = await Promise.all(sessions.map(async (session) => {
    try {
      const response = await (ai_message as any).filter({ ...filters, session_id: session.id }, "created_at", 120);
      const messages = entityRows(response)
        .filter((row) => row.user_id === user.id && row.session_id === session.id && (row.created_by === undefined || row.created_by === user.email))
        .map(tutorMessageFromRow)
        .filter((message): message is TutorMessage => Boolean(message));
      return [session.id, messages] as const;
    } catch (error) {
      console.error("Parle tutor session history could not be loaded", error);
      return [session.id, []] as const;
    }
  }));
  return { sessions, messagesBySession: Object.fromEntries(messageEntries), mistakes, mastery };
}

function estimateLevel(context: TutorContext | null, skill: TutorSkill): string {
  const estimate = context?.currentEstimates?.[skill];
  return typeof estimate?.level === "string" && estimate.level.trim() ? estimate.level : "A0";
}

function estimateLabel(level: string): string {
  return `${level} · ${t("learner.tutor.estimateCaveat")}`;
}

async function payloadFromErrorValue(value: unknown, depth = 0): Promise<Record<string, unknown>> {
  if (depth > 5) return {};
  if (typeof value === "string") {
    try {
      return payloadFromErrorValue(JSON.parse(value), depth + 1);
    } catch {
      return {};
    }
  }
  if (!isObject(value)) return {};

  if (typeof value.json === "function") {
    try {
      return payloadFromErrorValue(await (value.json as () => Promise<unknown>)(), depth + 1);
    } catch {
      // Some request wrappers expose an already-consumed response body.
    }
  }

  const unwrapped = unwrapTutorResponse(value);
  if (unwrapped !== value && Object.keys(unwrapped).length) return unwrapped;
  for (const nested of [value.data, value.body, value.result]) {
    if (nested === undefined || nested === value) continue;
    const payload = await payloadFromErrorValue(nested, depth + 1);
    if (Object.keys(payload).length) return payload;
  }
  if (Object.keys(unwrapped).length) return unwrapped;
  return {};
}

export async function responseErrorPayload(error: unknown): Promise<Record<string, unknown>> {
  if (!isObject(error)) return {};
  const response = isObject(error.response) ? error.response : {};
  for (const candidate of [error.data, response.data, error.result, response.body, error.body, response, error]) {
    const payload = await payloadFromErrorValue(candidate);
    if (Object.keys(payload).length) return payload;
  }
  return {};
}

function responseErrorIsLimit(error: unknown): boolean {
  if (!isObject(error)) return error instanceof Error && /daily tutor message limit/i.test(error.message);
  const response = isObject(error.response) ? error.response : {};
  const data = isObject(error.data) ? error.data : {};
  return error.status === 429 || response.status === 429 || data.status === "limit" || /daily tutor message limit/i.test(String(error.message ?? ""));
}

function TutorFeedback({ feedback }: { feedback: Record<string, unknown> }) {
  const corrections = Array.isArray(feedback.corrections)
    ? feedback.corrections.filter(isObject).slice(0, 8)
    : [];
  const results = Array.isArray(feedback.results)
    ? feedback.results.filter(isObject).slice(0, 3)
    : [];
  const correctedText = typeof feedback.corrected_text === "string" ? feedback.corrected_text : "";
  const hasSpeakingDimensions = Boolean(feedback.task_completion_feedback || feedback.grammar_feedback || feedback.vocabulary_feedback);
  const kind = typeof feedback.kind === "string" ? feedback.kind : "";
  if (!correctedText && !corrections.length && !feedback.feedback_summary && !hasSpeakingDimensions && !results.length && kind !== "practice_result" && kind !== "mini_test_result") return null;

  return (
    <div className="mt-3 space-y-2.5 rounded-2xl border border-[#E8EAF0] bg-[#F8F9FC] p-3.5 sm:p-4">
      {typeof feedback.feedback_summary === "string" && feedback.feedback_summary && <p className="break-words text-sm leading-6 text-foreground">{feedback.feedback_summary}</p>}
      {hasSpeakingDimensions && (
        <div className="grid gap-2 sm:grid-cols-3">
          {([["learner.tutor.taskCompletion", feedback.task_completion_feedback], ["learner.tutor.grammarFeedback", feedback.grammar_feedback], ["learner.tutor.vocabularyFeedback", feedback.vocabulary_feedback]] as const).map(([key, value]) => typeof value === "string" && value ? (
            <div key={key} className="min-w-0 rounded-xl bg-white p-3">
              <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{t(key)}</p>
              <p className="mt-1 break-words text-xs leading-5 text-foreground">{value}</p>
            </div>
          ) : null)}
        </div>
      )}
      {correctedText && (
        <div className="rounded-xl border border-[#B9D9CB] bg-white p-3.5">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#287252]">{t("learner.tutor.correctedVersion")}</p>
          <p dir="auto" className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{correctedText}</p>
        </div>
      )}
      {corrections.length > 0 && (
        <div className="space-y-2">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{t("learner.tutor.changeTitle")}</p>
          {corrections.map((entry, index) => {
            const area = entry.area === "vocabulary" || entry.area === "structure" || entry.area === "pronunciation" ? entry.area : "grammar";
            return (
              <div key={`${String(entry.original_sentence)}-${index}`} className="rounded-xl bg-white p-3">
                <span className="rounded-full bg-[#EEF2FA] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.08em] text-primary">{t(AREA_KEYS[area])}</span>
                {typeof entry.language_point === "string" && entry.language_point.trim() && <p className="mt-2 break-words text-xs font-bold leading-5 text-primary"><span className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">{t("learner.tutor.languagePointLabel")}:</span> {entry.language_point}</p>}
                {typeof entry.theme === "string" && entry.theme.trim() && <p className="mt-1 break-words text-[11px] leading-5 text-muted-foreground"><span className="font-bold">{t("learner.tutor.themeLabel")}:</span> {prettyTopic(entry.theme)}</p>}
                {typeof entry.original_sentence === "string" && <p dir="auto" className="mt-2 break-words text-xs leading-5 text-muted-foreground"><span className="font-bold">{t("learner.tutor.originalText")}:</span> {entry.original_sentence}</p>}
                {typeof entry.corrected_sentence === "string" && <p dir="auto" className="mt-1 break-words text-sm font-bold leading-5 text-primary"><span>{t("learner.tutor.correctedText")}:</span> {entry.corrected_sentence}</p>}
                {typeof entry.explanation === "string" && <p dir="auto" className="mt-1 break-words text-xs leading-5 text-foreground"><span className="font-bold">{t("learner.tutor.explanationLabel")}:</span> {entry.explanation}</p>}
                {typeof entry.example_sentence === "string" && entry.example_sentence && <p dir="auto" className="mt-1 break-words text-xs leading-5 text-muted-foreground"><span className="font-bold">{t("learner.tutor.exampleSentence")}:</span> {entry.example_sentence}</p>}
              </div>
            );
          })}
        </div>
      )}
      {kind === "practice_result" && (
        <div role="status" className="rounded-xl bg-white p-3 text-sm leading-5 text-foreground">
          <p className="font-bold">{feedback.correct === true ? t("learner.tutor.practiceCorrect") : t("learner.tutor.practiceIncorrect").replace("{answer}", String(feedback.answer ?? ""))}</p>
          {typeof feedback.explanation === "string" && <p dir="auto" className="mt-1 break-words text-xs">{feedback.explanation}</p>}
        </div>
      )}
      {kind === "mini_test_result" && typeof feedback.mastery_score === "number" && (
        <div role="status" className="rounded-xl border border-[#B9D9CB] bg-white p-3.5">
          <p className="font-display text-base font-extrabold text-primary">{t("learner.tutor.miniTestScore").replace("{score}", String(feedback.mastery_score)).replace("{correct}", String(feedback.correct_count ?? 0)).replace("{total}", "3")}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("learner.tutor.masterySaved")}</p>
          {results.length > 0 && <ul className="mt-2 space-y-1.5 border-t border-primary/10 pt-2">{results.map((item, index) => <li key={`${String(item.item_id)}-${index}`} className="break-words text-xs leading-5 text-foreground">{t("learner.tutor.miniTestResult").replace("{number}", String(index + 1)).replace("{answer}", String(item.answer ?? ""))}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}

function TutorMessageBubble({
  message,
  frenchVoiceAvailable,
  onListen,
}: {
  message: TutorMessage;
  frenchVoiceAvailable: boolean | null;
  onListen: (text: string, rate: number, messageId?: string) => void;
}) {
  const isTutor = message.sender === "tutor_ai";
  return (
    <article className={`min-w-0 max-w-full rounded-[1.35rem] border p-4 sm:max-w-[92%] sm:p-5 ${isTutor ? "border-primary/10 bg-white text-foreground shadow-[0_14px_32px_-28px_rgba(30,58,138,0.55)]" : "ml-auto border-[#D8DEEB] bg-[#EEF2FA] text-primary"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">{t(isTutor ? "learner.tutor.aiTutor" : "learner.tutor.you")}</p>
        {isTutor && message.text && (
          <div className="flex flex-wrap items-center gap-1.5">
            {frenchVoiceAvailable === true ? (
              <>
                <button type="button" onClick={() => onListen(message.text, 1, message.id)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-primary/10 bg-white px-2.5 text-[10px] font-bold text-primary transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <Volume2 aria-hidden="true" className="h-3.5 w-3.5" />{t("learner.tutor.listen")}
                </button>
                <button type="button" onClick={() => onListen(message.text, 0.72, message.id)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-primary/10 bg-white px-2.5 text-[10px] font-bold text-primary transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <Play aria-hidden="true" className="h-3 w-3" />{t("learner.tutor.listenSlow")}
                </button>
              </>
            ) : null}
          </div>
        )}
      </div>
      <p dir="auto" className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{message.text}</p>
      {isTutor && <TutorFeedback feedback={message.feedback} />}
    </article>
  );
}

function ModeSelector({ selected, onSelect }: { selected: TutorMode; onSelect: (mode: TutorMode) => void }) {
  return (
    <nav aria-label={t("learner.tutor.modeNavigation")} className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {MODE_ORDER.map((mode) => {
        const Icon = MODE_ICONS[mode];
        const active = selected === mode;
        return (
          <button key={mode} type="button" onClick={() => onSelect(mode)} aria-current={active ? "page" : undefined} className={`flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-left text-xs font-extrabold leading-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${active ? "border-primary bg-primary text-white shadow-[0_12px_24px_-18px_rgba(30,58,138,0.8)]" : "border-primary/10 bg-white text-primary hover:border-primary/25 hover:bg-[#F8F9FC]"}`}>
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">{t(MODE_KEYS[mode])}</span>
          </button>
        );
      })}
    </nav>
  );
}

function tutorLimitMessage(timeZone: string): string {
  return t("learner.tutor.limitBody", { timeZone: timeZone.trim() || "UTC" });
}

export function TutorLimitReason({ timeZone, id }: { timeZone: string; id?: string }) {
  return (
    <p id={id} className="break-words rounded-xl border border-[#F2CDC7] bg-[#FFF8F6] px-3.5 py-3 text-xs leading-5 text-[#75413D] [overflow-wrap:anywhere]">
      {tutorLimitMessage(timeZone)}
    </p>
  );
}

export function TutorLimitNotice({
  limitReached,
  showUpgradeLink,
  timeZone,
}: {
  limitReached: boolean;
  showUpgradeLink: boolean;
  timeZone: string;
}) {
  if (!limitReached) return null;
  const [upgradeBeforeLink = "", upgradeAfterLink = ""] = t("learner.tutor.limitUpgrade").split("{planLink}");

  return (
    <section className="min-w-0 rounded-[1.35rem] border border-[#F2CDC7] bg-[#FFF8F6] p-4 sm:p-5" role="status" aria-live="polite">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FCE7E3] text-[#A13F36]"><Clock3 aria-hidden="true" className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm leading-6 text-[#75413D] [overflow-wrap:anywhere]">{tutorLimitMessage(timeZone)}</p>
          {showUpgradeLink && (
            <p className="mt-3 break-words text-xs font-semibold leading-5 text-[#75413D]">
              {upgradeBeforeLink}<Link to="/learner/plan" className="font-extrabold text-[#8D342D] underline decoration-[#8D342D]/40 underline-offset-2 transition hover:text-[#6F2924] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t("learner.plan.seeYourPlan")}</Link>{upgradeAfterLink}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function TutorConversationLog({
  messages,
  limitReached,
  timeZone,
  frenchVoiceAvailable,
  onListen,
}: {
  messages: TutorMessage[];
  limitReached: boolean;
  timeZone: string;
  frenchVoiceAvailable: boolean | null;
  onListen: (text: string, rate: number, messageId?: string) => void;
}) {
  return (
    <div className="mt-4 flex min-w-0 flex-col gap-3" role="log" aria-live="polite" aria-relevant="additions text">
      {messages.length
        ? messages.map((message) => <TutorMessageBubble key={message.id} message={message} frenchVoiceAvailable={frenchVoiceAvailable} onListen={onListen} />)
        : limitReached
          ? <TutorLimitReason timeZone={timeZone} />
          : <p className="rounded-xl border border-dashed border-primary/15 bg-white px-4 py-5 text-sm leading-6 text-muted-foreground">{t("learner.tutor.emptyConversation")}</p>}
    </div>
  );
}

export type TutorComposerMode = Exclude<TutorMode, "lesson">;

export function TutorMessageComposer({
  mode,
  value,
  onChange,
  onSubmit,
  busy,
  limitReached,
  sessionEnded,
  timeZone,
  transcriptPending = false,
  transcriptConfirmed = false,
  onConfirmTranscript,
  onSwitchToTyping,
}: {
  mode: TutorComposerMode;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  limitReached: boolean;
  sessionEnded: boolean;
  timeZone: string;
  transcriptPending?: boolean;
  transcriptConfirmed?: boolean;
  onConfirmTranscript?: () => void;
  onSwitchToTyping?: () => void;
}) {
  const limitReasonId = "tutor-composer-limit-reason";
  const reasonDescription = limitReached ? limitReasonId : undefined;
  const submitDisabled = !value.trim() || busy || limitReached || sessionEnded;
  const fieldClass = "w-full min-w-0 resize-y rounded-xl border border-primary/15 bg-white px-3.5 py-3 text-sm leading-6 text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60";

  if (mode === "speaking" && transcriptPending) {
    return (
      <form onSubmit={onSubmit} className="min-w-0 space-y-3 rounded-2xl border border-[#F2CDC7] bg-[#FFF8F6] p-4">
        <div>
          <label htmlFor="tutor-confirm-transcript" className="block font-display text-sm font-extrabold text-primary">{t("learner.tutor.transcriptTitle")}</label>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("learner.tutor.transcriptHelp")}</p>
        </div>
        <textarea id="tutor-confirm-transcript" value={value} onChange={(event) => onChange(event.target.value.slice(0, 4000))} rows={3} maxLength={4000} disabled={busy || limitReached} aria-describedby={reasonDescription} className="w-full min-w-0 resize-y rounded-xl border border-primary/15 bg-white px-3 py-2.5 text-sm leading-6 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60" />
        {limitReached && <TutorLimitReason id={limitReasonId} timeZone={timeZone} />}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onConfirmTranscript} disabled={!value.trim() || busy || limitReached} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#B9D9CB] bg-[#F0F8F4] px-4 py-2 text-xs font-extrabold text-[#205D45] disabled:opacity-50"><Check aria-hidden="true" className="h-3.5 w-3.5" />{t("learner.tutor.confirmTranscript")}</button>
          <button type="submit" disabled={!transcriptConfirmed || submitDisabled} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-white transition hover:bg-[#172E70] disabled:cursor-not-allowed disabled:opacity-50">{busy && <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}{t(busy ? "learner.tutor.sending" : "learner.tutor.submitSpeaking")}</button>
          <button type="button" onClick={onSwitchToTyping} disabled={limitReached} className="inline-flex min-h-10 items-center rounded-full px-3 py-2 text-xs font-bold text-primary hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">{t("learner.tutor.speakingTypedLabel")}</button>
        </div>
        {transcriptConfirmed && <p role="status" className="text-xs font-bold text-[#205D45]">{t("learner.tutor.transcriptConfirmed")}</p>}
      </form>
    );
  }

  if (mode === "speaking") {
    return (
      <form onSubmit={onSubmit} className="space-y-3">
        <label htmlFor="tutor-speaking-response" className="block text-xs font-bold text-foreground">{t("learner.tutor.speakingTypedLabel")}</label>
        <textarea id="tutor-speaking-response" value={value} onChange={(event) => onChange(event.target.value.slice(0, 4000))} rows={4} maxLength={4000} placeholder={t("learner.tutor.messagePlaceholder")} disabled={sessionEnded || limitReached} aria-describedby={reasonDescription} className={fieldClass} />
        {limitReached && <TutorLimitReason id={limitReasonId} timeZone={timeZone} />}
        <button type="submit" disabled={submitDisabled} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{busy && <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}{t(busy ? "learner.tutor.sending" : "learner.tutor.submitSpeaking")}</button>
      </form>
    );
  }

  if (mode === "writing") {
    return (
      <form onSubmit={onSubmit} className="space-y-3">
        <label htmlFor="tutor-writing-response" className="block text-xs font-bold text-foreground">{t("learner.tutor.writingLabel")}</label>
        <textarea id="tutor-writing-response" value={value} onChange={(event) => onChange(event.target.value.slice(0, 4000))} rows={6} maxLength={4000} placeholder={t("learner.tutor.writingPlaceholder")} disabled={sessionEnded || limitReached} aria-describedby={reasonDescription} className={fieldClass} />
        {limitReached && <TutorLimitReason id={limitReasonId} timeZone={timeZone} />}
        <button type="submit" disabled={submitDisabled} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{busy && <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}{t(busy ? "learner.tutor.sending" : "learner.tutor.submitWriting")}</button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-3 border-t border-primary/10 pt-5">
      <label htmlFor="tutor-message" className="block text-xs font-bold text-foreground">{t("learner.tutor.messageLabel")}</label>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
        <textarea id="tutor-message" value={value} onChange={(event) => onChange(event.target.value.slice(0, 4000))} rows={3} maxLength={4000} placeholder={t(mode === "question" ? "learner.tutor.questionPlaceholder" : "learner.tutor.messagePlaceholder")} disabled={sessionEnded || limitReached} aria-describedby={reasonDescription} className="w-full min-w-0 resize-y rounded-xl border border-primary/15 bg-white px-3.5 py-3 text-sm leading-6 text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60" />
        <button type="submit" disabled={submitDisabled} className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{busy ? <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Send aria-hidden="true" className="h-3.5 w-3.5" />}{t(busy ? "learner.tutor.sending" : "learner.tutor.send")}</button>
      </div>
      {limitReached && <TutorLimitReason id={limitReasonId} timeZone={timeZone} />}
    </form>
  );
}

export default function LearnerTutorPlaceholder() {
  const location = useLocation();
  const navigate = useNavigate();
  const [account, setAccount] = useState<ParleAccountData | null>(null);
  const [mode, setMode] = useState<TutorMode>(() => modeFromSearch(location.search));
  const [taskId, setTaskId] = useState(() => taskIdFromSearch(location.search));
  const [task, setTask] = useState<TutorTaskSummary | null>(null);
  const [context, setContext] = useState<TutorContext | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [history, setHistory] = useState<TutorHistory>({ sessions: [], messagesBySession: {}, mistakes: [], mastery: [] });
  const [viewingSessionId, setViewingSessionId] = useState("");
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const [retryOpen, setRetryOpen] = useState(0);
  const [requestBusy, setRequestBusy] = useState(false);
  const [finishBusy, setFinishBusy] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [serverFinished, setServerFinished] = useState(false);
  const [serverCompletedTaskId, setServerCompletedTaskId] = useState("");
  const [taskCompleted, setTaskCompleted] = useState(false);
  const [taskCompletionError, setTaskCompletionError] = useState(false);
  const [genericError, setGenericError] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [planTier, setPlanTier] = useState<TutorPlanTier | null>(null);
  const [summaryAllowance, setSummaryAllowance] = useState<{ tier: TutorPlanTier; used: number; limit: number } | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [limitReason, setLimitReason] = useState<TutorLimitReason>(null);
  const [explainInNative, setExplainInNative] = useState(false);
  const [nativeLanguage, setNativeLanguage] = useState("English");
  const [preferenceBusy, setPreferenceBusy] = useState(false);
  const [preferenceError, setPreferenceError] = useState(false);
  const [composeText, setComposeText] = useState("");
  const [writingPrompt, setWritingPrompt] = useState("");
  const [speakingResponseFeedback, setSpeakingResponseFeedback] = useState(false);
  const [lessonPracticeItems, setLessonPracticeItems] = useState<TutorItem[]>([]);
  const [miniTestItems, setMiniTestItems] = useState<TutorItem[]>([]);
  const [practiceChoices, setPracticeChoices] = useState<Record<string, string>>({});
  const [practiceResults, setPracticeResults] = useState<Record<string, { correct: boolean; answer: string; explanation: string; example: string }>>({});
  const [practiceBusyId, setPracticeBusyId] = useState("");
  const [miniTestChoices, setMiniTestChoices] = useState<Record<string, string>>({});
  const [miniTestResult, setMiniTestResult] = useState<{ score: number; correct: number; results: TutorRow[] } | null>(null);
  const [miniTestBusy, setMiniTestBusy] = useState(false);
  const [speechNote, setSpeechNote] = useState<"unsupported" | "denied" | "">("");
  const [speechListening, setSpeechListening] = useState(false);
  const [speechTranscriptPending, setSpeechTranscriptPending] = useState(false);
  const [speechTranscriptConfirmed, setSpeechTranscriptConfirmed] = useState(false);
  const [frenchVoiceAvailable, setFrenchVoiceAvailable] = useState<boolean | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const activeSessionRequest = useRef(0);
  const activityRefreshRevision = useRef(0);
  const speechSynthesisRef = useRef<SpeechSynthesis | null>(null);
  const playerRef = useRef(new ReplyPlayer());
  // A87: set while the page is being left or reloaded, so its cancelled requests are not reported as failures
  const pageLeaving = useRef(false);
  useEffect(() => {
    const leave = () => { pageLeaving.current = true; };
    const back = () => { pageLeaving.current = false; };
    window.addEventListener("beforeunload", leave);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", back);
    return () => {
      window.removeEventListener("beforeunload", leave);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", back);
    };
  }, []);
  const [voiceNote, setVoiceNote] = useState<TranslationKey | null>(null);
  const [readAloud, setReadAloud] = useState(false);

  const viewedSession = history.sessions.find((entry) => entry.id === viewingSessionId) ?? null;
  const viewedMode = viewedSession && viewedSession.mode in MODE_KEYS ? viewedSession.mode as TutorMode : mode;
  const visibleMessages = viewingSessionId
    ? history.messagesBySession[viewingSessionId] ?? []
    : messages;
  const isViewingHistory = Boolean(viewingSessionId);
  const remainingMessages = typeof context?.messagesRemaining === "number"
    ? Math.max(0, context.messagesRemaining)
    : summaryAllowance ? Math.max(0, summaryAllowance.limit - summaryAllowance.used) : 0;
  const messagesLimit = typeof context?.messagesLimit === "number" && Number.isFinite(context.messagesLimit) ? context.messagesLimit : summaryAllowance?.limit ?? null;
  const reachedLimit = limitReached || (Boolean(context) && remainingMessages <= 0);
  const displayedPlanTier = context?.planTier ?? planTier ?? summaryAllowance?.tier ?? null;
  const premiumFairUseReached = limitReason === "premium_fair_use" || (reachedLimit && displayedPlanTier === "premium");
  const practiceComplete = lessonPracticeItems.length > 0 && lessonPracticeItems.every((item) => Boolean(practiceResults[item.id]));
  const lessonComplete = practiceComplete && Boolean(miniTestResult);
  const modeResponseComplete = mode === "speaking" ? speakingResponseFeedback : messages.some((message) => message.sender === "tutor_ai" && message.feedback.completed_response === true);
  const canFinishSession = mode === "lesson"
    ? lessonComplete
    : mode === "writing" || mode === "speaking"
      ? modeResponseComplete
      : Boolean(sessionId);
  const estimateValues = useMemo(() => ([
    ["listening", estimateLevel(context, "listening")],
    ["reading", estimateLevel(context, "reading")],
    ["writing", estimateLevel(context, "writing")],
    ["speaking", estimateLevel(context, "speaking")],
  ] as const), [context]);
  const recentMastery = useMemo(() => {
    const seen = new Set<string>();
    return history.mastery.filter((row) => {
      const languagePoint = typeof row.language_point === "string" ? row.language_point.trim() : "";
      const languagePointKey = typeof row.language_point_key === "string" && row.language_point_key.trim()
        ? row.language_point_key.trim()
        : languagePoint
          ? languagePoint.toLocaleLowerCase()
          : `legacy:${String(row.theme ?? row.topic ?? "unknown").toLocaleLowerCase()}`;
      const hasScore = (typeof row.language_point_rolling_score === "number" && Number.isFinite(row.language_point_rolling_score))
        || (typeof row.rolling_score === "number" && Number.isFinite(row.rolling_score));
      if (!hasScore || seen.has(languagePointKey)) return false;
      seen.add(languagePointKey);
      return true;
    }).slice(0, 5);
  }, [history.mastery]);
  const otherSessions = history.sessions.filter((entry) => entry.id !== sessionId).slice(0, 6);
  const learnerTimeZone = account?.profile?.time_zone?.trim() || "UTC";

  useEffect(() => {
    let active = true;
    // The plan badge and allowance come from the plan summary once per page load, before any session opens (D25 a, R43).
    void parleAssessmentService({ action: "tutor_get_plan_summary" })
      .then((summary) => {
        if (!active) return;
        const allowance = allowanceFromPlanSummary(summary);
        setSummaryAllowance(allowance);
        setSummaryFailed(allowance === null);
      })
      .catch((error) => {
        console.warn("Parle plan summary could not be read for the tutor page", error);
        if (active) setSummaryFailed(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const requestKey = ++activeSessionRequest.current;
    const requestedMode = modeFromSearch(location.search);
    const requestedTaskId = taskIdFromSearch(location.search);

    const loadHistoryForLimit = async (user: ParleUser) => {
      setHistoryLoading(true);
      const activityRevisionAtLoad = activityRefreshRevision.current;
      try {
        const snapshot = await loadTutorHistory(user);
        if (!active || activeSessionRequest.current !== requestKey) return;
        setHistory((current) => ({
          ...snapshot,
          mistakes: activityRefreshRevision.current === activityRevisionAtLoad ? snapshot.mistakes : current.mistakes,
          mastery: activityRefreshRevision.current === activityRevisionAtLoad ? snapshot.mastery : current.mastery,
        }));
      } catch (historyError) {
        console.error("Parle tutor history could not be refreshed after the AI message limit was reached", historyError);
      } finally {
        if (active && activeSessionRequest.current === requestKey) setHistoryLoading(false);
      }
    };

    setMode(requestedMode);
    setTaskId(requestedTaskId);
    setTask(null);
    setContext(null);
    setSessionId("");
    setMessages([]);
    setViewingSessionId("");
    setLessonPracticeItems([]);
    setMiniTestItems([]);
    setPracticeChoices({});
    setPracticeResults({});
    setMiniTestChoices({});
    setMiniTestResult(null);
    setWritingPrompt("");
    setComposeText("");
    setSpeakingResponseFeedback(false);
    setSessionEnded(false);
    setServerFinished(false);
    setServerCompletedTaskId("");
    setTaskCompleted(false);
    setTaskCompletionError(false);
    setGenericError(false);
    setLimitReached(false);
    setPlanTier(null);
    setLimitReason(null);
    setSessionLoading(true);
    setSessionError(false);

    void (async () => {
      let loadedAccount: ParleAccountData | null = null;
      try {
        const savedAccount = await loadMyParleAccount();
        loadedAccount = savedAccount;
        if (!active || activeSessionRequest.current !== requestKey) return;
        setAccount(savedAccount);
        const language = savedAccount.profile?.native_language?.trim() || "English";
        const explainNative = savedAccount.profile?.explain_in_native === true;
        setNativeLanguage(language);
        setExplainInNative(explainNative);
        const raw = await parleAssessmentService({
          action: "tutor_open_session",
          mode: requestedMode,
          ...(requestedTaskId ? { task_id: requestedTaskId } : {}),
        });
        const payload = unwrapTutorResponse(raw);
        if (!active || activeSessionRequest.current !== requestKey) return;
        if (payload.status === "limit") {
          updateRemaining(payload);
          setLimitReached(true);
          setSessionLoading(false);
          await loadHistoryForLimit(savedAccount.user);
          return;
        }
        if (payload.error || payload.status !== "complete" || typeof payload.session_id !== "string") {
          setSessionError(true);
          setSessionLoading(false);
          return;
        }
        const newSessionId = payload.session_id;
        setSessionId(newSessionId);
        const serverContext = isObject(payload.context) ? payload.context as unknown as TutorContext : null;
        setContext(serverContext);
        updateRemaining(payload);
        if (serverContext && typeof serverContext.nativeLanguage === "string" && serverContext.nativeLanguage.trim()) setNativeLanguage(serverContext.nativeLanguage);
        if (serverContext && typeof serverContext.explainInNative === "boolean") setExplainInNative(serverContext.explainInNative);
        setLimitReached(false);
        setSessionEnded(false);
        if (isObject(payload.task) && typeof payload.task.id === "string" && ["ai_lesson", "speaking_practice", "writing"].includes(String(payload.task.type))) {
          setTask({
            id: payload.task.id,
            type: payload.task.type as TutorTaskType,
            skill: payload.task.skill === "listening" || payload.task.skill === "reading" || payload.task.skill === "writing" || payload.task.skill === "speaking" ? payload.task.skill : null,
            topic: typeof payload.task.topic === "string" ? payload.task.topic : "",
            minutes: typeof payload.task.minutes === "number" ? payload.task.minutes : 0,
          });
          setTaskId(payload.task.id);
        }
        if (typeof payload.writing_prompt === "string") setWritingPrompt(payload.writing_prompt);
        if (typeof payload.scenario === "string" && requestedMode === "speaking") setWritingPrompt(payload.scenario);
        if (isObject(payload.lesson)) {
          setLessonPracticeItems(normalizeTutorItems(payload.lesson.practice_items));
          setMiniTestItems(normalizeTutorItems(payload.lesson.mini_test));
        }
        const opening: TutorMessage = {
          id: typeof payload.opening_message_id === "string" && payload.opening_message_id ? payload.opening_message_id : `opening-${newSessionId}`,
          sender: "tutor_ai",
          text: typeof payload.reply === "string" ? payload.reply : "",
          feedback: {
            kind: "session_opening",
            scenario: payload.scenario,
            writing_prompt: payload.writing_prompt,
          },
          created_at: new Date().toISOString(),
        };
        setMessages(opening.text ? [opening] : []);
        setSessionLoading(false);
        setHistoryLoading(true);
        const activityRevisionAtLoad = activityRefreshRevision.current;
        try {
          const snapshot = await loadTutorHistory(savedAccount.user);
          if (!active || activeSessionRequest.current !== requestKey) return;
          setHistory((current) => ({
            ...snapshot,
            mistakes: activityRefreshRevision.current === activityRevisionAtLoad ? snapshot.mistakes : current.mistakes,
            mastery: activityRefreshRevision.current === activityRevisionAtLoad ? snapshot.mastery : current.mastery,
          }));
          const storedMessages = snapshot.messagesBySession[newSessionId] ?? [];
          if (storedMessages.length) setMessages(storedMessages);
        } catch (historyError) {
          console.error("Parle tutor history could not be refreshed", historyError);
        } finally {
          if (active && activeSessionRequest.current === requestKey) setHistoryLoading(false);
        }
      } catch (error) {
        if (!active || activeSessionRequest.current !== requestKey || isAbandonedRequest(error, pageLeaving.current)) return;
        console.error("Parle tutor session could not open", error);
        const isLimitError = responseErrorIsLimit(error);
        if (isLimitError) {
          updateRemaining(await responseErrorPayload(error));
          setLimitReached(true);
        } else setSessionError(true);
        setSessionLoading(false);
        if (isLimitError && loadedAccount) await loadHistoryForLimit(loadedAccount.user);
      }
    })();

    return () => {
      active = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* Recognition may already have ended. */ }
        recognitionRef.current = null;
      }
      if (activeSessionRequest.current === requestKey) activeSessionRequest.current += 1;
    };
  }, [location.search, retryOpen]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setFrenchVoiceAvailable(false);
      return;
    }
    const synthesis = window.speechSynthesis;
    speechSynthesisRef.current = synthesis;
    const updateVoices = () => {
      const frenchVoice = synthesis.getVoices().some((voice) => /^fr(?:[-_]|$)/i.test(voice.lang));
      setFrenchVoiceAvailable(frenchVoice);
    };
    updateVoices();
    synthesis.addEventListener("voiceschanged", updateVoices);
    return () => {
      synthesis.removeEventListener("voiceschanged", updateVoices);
      synthesis.cancel();
      speechSynthesisRef.current = null;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void loadVoiceStatus().then((status) => { if (active) setReadAloud(status.readAloud); }).catch(() => undefined);
    const player = playerRef.current;
    return () => { active = false; player.stop(); };
  }, []);

  function updateRemaining(payload: Record<string, unknown>) {
    const serverContext = isObject(payload.context) ? payload.context : {};
    const remainingValue = payload.messages_remaining ?? payload.messagesRemaining ?? serverContext.messagesRemaining;
    const limitValue = payload.messages_limit ?? payload.messagesLimit ?? serverContext.messagesLimit;
    const tierValue = payload.plan_tier ?? payload.planTier ?? serverContext.planTier;
    const rawReason = Object.prototype.hasOwnProperty.call(payload, "limit_reason")
      ? payload.limit_reason
      : Object.prototype.hasOwnProperty.call(payload, "limitReason")
        ? payload.limitReason
        : serverContext.limitReason;
    const remaining = typeof remainingValue === "number" && Number.isFinite(remainingValue) ? Math.max(0, Math.floor(remainingValue)) : null;
    const limit = typeof limitValue === "number" && Number.isFinite(limitValue) ? Math.max(0, Math.floor(limitValue)) : null;
    const nextTier: TutorPlanTier | null = tierValue === "premium" || tierValue === "free" ? tierValue : null;
    const effectiveTier = nextTier ?? planTier ?? summaryAllowance?.tier ?? "free";
    let nextReason: TutorLimitReason | undefined;
    if (rawReason === "free_daily_limit" || rawReason === "premium_fair_use") nextReason = rawReason;
    else if (rawReason === null || (remaining !== null && remaining > 0)) nextReason = null;
    else if (payload.status === "limit" || remaining === 0) nextReason = effectiveTier === "premium" ? "premium_fair_use" : "free_daily_limit";

    if (nextTier) setPlanTier(nextTier);
    if (nextReason !== undefined) setLimitReason(nextReason);
    if (remaining !== null) setLimitReached(remaining <= 0);
    setContext((current) => {
      const base = current ?? (isObject(payload.context) ? payload.context as unknown as TutorContext : null);
      if (!base) return current;
      return {
        ...base,
        ...(remaining !== null ? { messagesRemaining: remaining } : {}),
        ...(limit !== null ? { messagesLimit: limit } : {}),
        ...(nextTier ? { planTier: nextTier } : {}),
        ...(nextReason !== undefined ? { limitReason: nextReason } : {}),
      };
    });
  }

  function appendLocalMessages(newMessages: TutorMessage[]) {
    setMessages((current) => [...current, ...newMessages]);
    if (sessionId) {
      setHistory((current) => ({
        ...current,
        messagesBySession: {
          ...current.messagesBySession,
          [sessionId]: [...(current.messagesBySession[sessionId] ?? []), ...newMessages],
        },
      }));
    }
  }

  async function refreshTutorPanels() {
    const user = account?.user;
    if (!user?.id || !user.email) return;
    activityRefreshRevision.current += 1;
    const filters = { created_by: user.email, user_id: user.id };
    try {
      const [mistakeResponse, masteryResponse] = await Promise.all([
        (mistake_log as any).filter(filters, "-created_at", 12),
        (topic_mastery as any).filter(filters, "-created_at", 200),
      ]);
      const mistakes = entityRows(mistakeResponse).filter((row) => row.user_id === user.id && (row.created_by === undefined || row.created_by === user.email));
      const mastery = entityRows(masteryResponse).filter((row) => row.user_id === user.id && (row.created_by === undefined || row.created_by === user.email));
      setHistory((current) => ({ ...current, mistakes, mastery }));
    } catch (error) {
      console.error("Parle tutor correction and mastery panels could not be refreshed", error);
    }
  }

  function navigateToMode(nextMode: TutorMode) {
    const nextUrl = `/learner/ai-tutor?mode=${nextMode}`;
    navigate(nextUrl);
  }

  async function handleLimitOrGenericError(error: unknown) {
    if (responseErrorIsLimit(error)) {
      const payload = await responseErrorPayload(error);
      updateRemaining(payload);
      setLimitReached(true);
      setContext((current) => current ? { ...current, messagesRemaining: 0 } : current);
      const payloadTier = payload.plan_tier === "premium" || payload.plan_tier === "free"
        ? payload.plan_tier
        : isObject(payload.context) && (payload.context.planTier === "premium" || payload.context.planTier === "free")
          ? payload.context.planTier
          : planTier ?? summaryAllowance?.tier ?? "free";
      const payloadReason = payload.limit_reason === "premium_fair_use" || payload.limit_reason === "free_daily_limit"
        ? payload.limit_reason
        : isObject(payload.context) && (payload.context.limitReason === "premium_fair_use" || payload.context.limitReason === "free_daily_limit")
          ? payload.context.limitReason
          : payloadTier === "premium" ? "premium_fair_use" : "free_daily_limit";
      setPlanTier(payloadTier);
      setLimitReason(payloadReason);
      return;
    }
    console.error("Parle tutor request could not be completed", error);
    setGenericError(true);
  }

  async function changeExplanationLanguage(enabled: boolean) {
    if (preferenceBusy) return;
    setPreferenceBusy(true);
    setPreferenceError(false);
    try {
      await updateMyExplanationPreference(enabled);
      setExplainInNative(enabled);
      setContext((current) => current ? { ...current, explainInNative: enabled, nativeLanguage } : current);
    } catch (error) {
      console.error("Parle tutor explanation language preference could not be saved", error);
      setPreferenceError(true);
    } finally {
      setPreferenceBusy(false);
    }
  }

  function speakTutorMessage(text: string, rate: number, messageId?: string) {
    setVoiceNote(null);
    void playerRef.current.play(text, messageId ?? "", rate === 1 ? 1 : 0.75).then((outcome) => {
      if (outcome === "browser") setVoiceNote("voice.fallbackNote");
      else if (outcome === "browser_limit") setVoiceNote("voice.limit.replies");
      else if (outcome === "none") setVoiceNote("voice.noFrenchToRead");
      else if (outcome === "unavailable") setVoiceNote("voice.noVoice");
      else if (outcome === "needs_tap") setVoiceNote("voice.tapToListen");
    });
  }

  /** Listen pressed: unlock the audio inside the tap, so phones (iPhone Safari) allow it to play (Plan 9 final review). */
  function listenTapped(text: string, rate: number, messageId?: string) {
    playerRef.current.unlock();
    speakTutorMessage(text, rate, messageId);
  }


  function updateComposerText(value: string) {
    setComposeText(value.slice(0, 4000));
    if (mode === "speaking" && speechTranscriptPending) setSpeechTranscriptConfirmed(false);
  }

  async function submitTutorMessage(event: FormEvent<HTMLFormElement>) {
    if (readAloud) playerRef.current.unlock(); // inside the tap, so the reply can be read aloud on phones
    event.preventDefault();
    const text = composeText.trim();
    if (!text || !sessionId || requestBusy || reachedLimit || isViewingHistory || sessionEnded) return;
    if (mode === "speaking" && speechTranscriptPending && !speechTranscriptConfirmed) return;
    setGenericError(false);
    setRequestBusy(true);
    try {
      const raw = await parleAssessmentService({
        action: "tutor_send_message",
        session_id: sessionId,
        text,
        ...(mode === "speaking" && speechTranscriptConfirmed ? { transcript: text } : {}),
      });
      const payload = unwrapTutorResponse(raw);
      if (payload.status === "limit") {
        updateRemaining(payload);
        setLimitReached(true);
        return;
      }
      if (payload.error || payload.status !== "complete") throw new Error("Tutor response was not confirmed.");
      updateRemaining(payload);
      const now = new Date().toISOString();
      const learnerMessage: TutorMessage = {
        id: typeof payload.learner_message_id === "string" && payload.learner_message_id ? payload.learner_message_id : `learner-${crypto.randomUUID()}`,
        sender: "learner",
        text,
        transcript: mode === "speaking" && speechTranscriptConfirmed ? text : "",
        feedback: {},
        created_at: now,
      };
      const feedback = {
        completed_response: payload.completed_response === true,
        corrected_text: typeof payload.corrected_text === "string" ? payload.corrected_text : "",
        feedback_summary: typeof payload.feedback_summary === "string" ? payload.feedback_summary : "",
        task_completion_feedback: typeof payload.task_completion_feedback === "string" ? payload.task_completion_feedback : "",
        grammar_feedback: typeof payload.grammar_feedback === "string" ? payload.grammar_feedback : "",
        vocabulary_feedback: typeof payload.vocabulary_feedback === "string" ? payload.vocabulary_feedback : "",
        optional_practice: typeof payload.optional_practice === "string" ? payload.optional_practice : "",
        corrections: Array.isArray(payload.corrections) ? payload.corrections : [],
        guardrail: payload.guardrail ?? null,
      };
      const tutorMessage: TutorMessage = {
        id: typeof payload.tutor_message_id === "string" && payload.tutor_message_id ? payload.tutor_message_id : `tutor-${crypto.randomUUID()}`,
        sender: "tutor_ai",
        text: typeof payload.reply === "string" ? payload.reply : "",
        feedback,
        created_at: now,
      };
      appendLocalMessages([learnerMessage, tutorMessage]);
      if (readAloud && tutorMessage.text) speakTutorMessage(tutorMessage.text, 1, tutorMessage.id);
      setComposeText("");
      setSpeechTranscriptPending(false);
      setSpeechTranscriptConfirmed(false);
      setSpeechNote("");
      setGenericError(false);
      if (Array.isArray(feedback.corrections) && feedback.corrections.length) await refreshTutorPanels();
    } catch (error) {
      await handleLimitOrGenericError(error);
    } finally {
      setRequestBusy(false);
    }
  }

  async function gradeLessonPractice(item: TutorItem) {
    const optionId = practiceChoices[item.id];
    if (!sessionId || !optionId || practiceBusyId || practiceResults[item.id] || isViewingHistory) return;
    setPracticeBusyId(item.id);
    setGenericError(false);
    try {
      const raw = await parleAssessmentService({ action: "tutor_grade_practice", session_id: sessionId, item_id: item.id, option_id: optionId });
      const payload = unwrapTutorResponse(raw);
      if (payload.status === "limit") {
        updateRemaining(payload);
        setLimitReached(true);
        return;
      }
      if (payload.error || payload.status !== "complete") throw new Error("Practice feedback was not confirmed.");
      updateRemaining(payload);
      const answer = typeof payload.answer === "string" ? payload.answer : "";
      const explanation = typeof payload.explanation === "string" ? payload.explanation : "";
      const example = typeof payload.example_sentence === "string" ? payload.example_sentence : item.example_sentence;
      const correct = payload.correct === true;
      setPracticeResults((current) => ({ ...current, [item.id]: { correct, answer, explanation, example } }));
      const chosen = item.options.find((option) => option.id === optionId);
      const now = new Date().toISOString();
      appendLocalMessages([
        { id: `practice-learner-${crypto.randomUUID()}`, sender: "learner", text: `${item.prompt}\n${chosen?.text ?? ""}`, feedback: {}, created_at: now },
        { id: `practice-tutor-${crypto.randomUUID()}`, sender: "tutor_ai", text: explanation || t(correct ? "learner.tutor.practiceCorrect" : "learner.tutor.practiceIncorrect").replace("{answer}", answer), feedback: { kind: "practice_result", correct, answer, explanation, example_sentence: example }, created_at: now },
      ]);
      await refreshTutorPanels();
    } catch (error) {
      await handleLimitOrGenericError(error);
    } finally {
      setPracticeBusyId("");
    }
  }

  async function submitMiniTest() {
    if (!sessionId || miniTestBusy || !miniTestItems.length || !miniTestItems.every((item) => Boolean(miniTestChoices[item.id])) || isViewingHistory || !practiceComplete) return;
    setMiniTestBusy(true);
    setGenericError(false);
    try {
      const raw = await parleAssessmentService({
        action: "tutor_submit_mini_test",
        session_id: sessionId,
        answers: miniTestItems.map((item) => ({ item_id: item.id, option_id: miniTestChoices[item.id] })),
      });
      const payload = unwrapTutorResponse(raw);
      if (payload.status === "limit") {
        updateRemaining(payload);
        setLimitReached(true);
        return;
      }
      if (payload.error || payload.status !== "complete" || typeof payload.mastery_score !== "number") throw new Error("Mini-test score was not confirmed.");
      updateRemaining(payload);
      const results = Array.isArray(payload.results) ? payload.results.filter(isObject) as TutorRow[] : [];
      const correctCount = typeof payload.correct_count === "number" ? payload.correct_count : results.filter((item) => item.correct === true).length;
      setMiniTestResult({ score: payload.mastery_score, correct: correctCount, results });
      const now = new Date().toISOString();
      appendLocalMessages([{
        id: `mini-test-${crypto.randomUUID()}`,
        sender: "tutor_ai",
        text: t("learner.tutor.miniTestScore").replace("{score}", String(payload.mastery_score)).replace("{correct}", String(correctCount)).replace("{total}", "3"),
        feedback: { kind: "mini_test_result", mastery_score: payload.mastery_score, correct_count: correctCount, results },
        created_at: now,
      }]);
      await refreshTutorPanels();
    } catch (error) {
      await handleLimitOrGenericError(error);
    } finally {
      setMiniTestBusy(false);
    }
  }

  async function retryLinkedTaskCompletion() {
    if (!taskId || !serverFinished || serverCompletedTaskId !== taskId || taskCompleted) return;
    setFinishBusy(true);
    setTaskCompletionError(false);
    try {
      await markMyLearnerTaskDone(taskId);
      setTaskCompleted(true);
    } catch (error) {
      console.error("Parle task completion could not be confirmed after tutor feedback", error);
      setTaskCompletionError(true);
    } finally {
      setFinishBusy(false);
    }
  }

  async function finishTutorSession() {
    if (!sessionId || finishBusy || isViewingHistory) return;
    if (!canFinishSession && !sessionEnded) return;
    if (serverFinished) {
      if (taskId && !taskCompleted) await retryLinkedTaskCompletion();
      return;
    }
    setFinishBusy(true);
    setGenericError(false);
    setTaskCompletionError(false);
    try {
      const raw = await parleAssessmentService({ action: "tutor_finish_session", session_id: sessionId });
      const payload = unwrapTutorResponse(raw);
      if (payload.error || payload.status !== "complete") throw new Error("Session completion was not confirmed.");
      setServerFinished(true);
      setSessionEnded(true);
      const completedTaskId = typeof payload.completed_task_id === "string" ? payload.completed_task_id : "";
      setServerCompletedTaskId(completedTaskId);
      if (taskId) {
        if (completedTaskId !== taskId) {
          setTaskCompletionError(true);
          return;
        }
        try {
          await markMyLearnerTaskDone(taskId);
          setTaskCompleted(true);
        } catch (error) {
          console.error("Parle task completion could not be confirmed after tutor feedback", error);
          setTaskCompletionError(true);
        }
      }
    } catch (error) {
      await handleLimitOrGenericError(error);
    } finally {
      setFinishBusy(false);
    }
  }

  function chooseHistorySession(sessionIdToView: string) {
    if (!sessionIdToView || sessionIdToView === sessionId) return;
    setViewingSessionId(sessionIdToView);
    setGenericError(false);
  }

  function returnToCurrentSession() {
    setViewingSessionId("");
  }

  const sessionMode = isViewingHistory ? viewedMode : mode;
  const ModeIcon = MODE_ICONS[sessionMode];
  const linkedTaskIsValid = !taskId || (task !== null && task.id === taskId);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38 }} className="min-w-0 space-y-5">
      <section className="relative min-w-0 overflow-hidden rounded-[1.7rem] bg-primary px-5 py-6 text-white shadow-[0_26px_70px_-42px_rgba(30,58,138,0.75)] sm:px-7 sm:py-8">
        <div aria-hidden="true" className="absolute -right-14 -top-16 h-52 w-52 rounded-full border-[24px] border-white/5" />
        <div aria-hidden="true" className="absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-[#F97362]/20 blur-2xl" />
        <div className="relative flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#FFC0B4]"><Sparkles aria-hidden="true" className="h-3.5 w-3.5" />{t("learner.tutor.heroEyebrow")}</p>
            <h2 className="mt-3 max-w-2xl break-words font-display text-2xl font-extrabold leading-tight tracking-[-0.045em] sm:text-3xl">{t("learner.tutor.heroTitle")}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">{t("learner.tutor.heroBody")}</p>
          </div>
          <Link to="/learner" className="relative inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-extrabold text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />{t("learner.tutor.backToToday")}
          </Link>
        </div>
        {taskId && (
          <div className="relative mt-5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/15 pt-4 text-xs font-semibold text-white/85">
            <Target aria-hidden="true" className="h-4 w-4 shrink-0 text-[#FFC0B4]" />
            <span>{t("learner.tutor.taskLinked")}:</span>
            {task ? <span className="break-words font-extrabold">{t(TASK_TYPE_KEYS[task.type])}{task.topic ? ` · ${prettyTopic(task.topic)}` : ""}</span> : <span>{t("learner.tutor.opening")}</span>}
          </div>
        )}
      </section>

      {!taskId && <ModeSelector selected={mode} onSelect={navigateToMode} />}
      {taskId && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-white px-4 py-3">
        <p className="flex min-w-0 items-center gap-2 text-xs font-bold text-primary"><ModeIcon aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="break-words">{t(MODE_KEYS[mode])}</span></p>
        <Link to="/learner" className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-xs font-extrabold text-primary transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />{t("learner.tutor.backToToday")}</Link>
      </div>}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-5">
          {sessionLoading && (
            <section className="flex min-h-64 items-center justify-center rounded-[1.5rem] border border-primary/10 bg-white p-6" role="status" aria-live="polite">
              <div className="text-center"><LoaderCircle aria-hidden="true" className="mx-auto h-8 w-8 animate-spin text-primary" /><p className="mt-4 text-sm font-semibold text-muted-foreground">{t("learner.tutor.opening")}</p></div>
            </section>
          )}

          {sessionError && !sessionLoading && (
            <section className="rounded-[1.5rem] border border-[#F0C5C0] bg-white p-5 sm:p-7" role="alert">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><CircleHelp aria-hidden="true" className="h-5 w-5" /></div>
              <h3 className="mt-4 font-display text-xl font-extrabold text-primary">{t("learner.tutor.openErrorTitle")}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("learner.tutor.openErrorBody")}</p>
              <button type="button" onClick={() => setRetryOpen((value) => value + 1)} className="parle-button-primary mt-5 justify-center"><ArrowRight aria-hidden="true" className="h-4 w-4" />{t("learner.tutor.tryAgain")}</button>
            </section>
          )}

          {!sessionLoading && !sessionError && (
            <>
              <section className="min-w-0 rounded-[1.5rem] border border-primary/10 bg-white p-4 shadow-[0_20px_52px_-42px_rgba(30,58,138,0.45)] sm:p-5" aria-labelledby="tutor-context-title">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><Target aria-hidden="true" className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <h3 id="tutor-context-title" className="font-display text-base font-extrabold text-primary">{t("learner.tutor.currentEstimates")}</h3>
                    <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                      {estimateValues.map(([skill, level]) => (
                        <div key={skill} className="min-w-0 rounded-xl bg-[#F7F8FB] p-3">
                          <p className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">{t(SKILL_KEYS[skill])}</p>
                          <p className="mt-1 break-words text-sm font-extrabold leading-5 text-primary">{estimateLabel(level)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {(context?.goal || context?.weeklyFocus) && (
                  <div className="mt-4 grid min-w-0 gap-2 border-t border-primary/10 pt-4 sm:grid-cols-2">
                    <div className="min-w-0 rounded-xl border border-primary/10 px-3.5 py-3"><p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{t("learner.tutor.goalLabel")}</p><p className="mt-1 break-words text-sm font-bold leading-5 text-foreground">{context?.goal}</p></div>
                    <div className="min-w-0 rounded-xl border border-primary/10 px-3.5 py-3"><p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{t("learner.tutor.focusLabel")}</p><p className="mt-1 break-words text-sm font-bold leading-5 text-foreground">{context?.weeklyFocus}</p></div>
                  </div>
                )}
              </section>

              <TutorLimitNotice
                limitReached={reachedLimit}
                showUpgradeLink={!premiumFairUseReached && displayedPlanTier === "free"}
                timeZone={learnerTimeZone}
              />

              {genericError && <p role="alert" className="rounded-xl border border-[#F0C5C0] bg-[#FFF8F6] px-4 py-3 text-sm leading-6 text-[#8D342D]">{t("learner.tutor.errorGeneric")}</p>}

              {taskCompletionError && (
                <section role="alert" className="rounded-xl border border-[#F0C5C0] bg-[#FFF8F6] px-4 py-3 text-sm leading-6 text-[#8D342D]">
                  <p>{t("learner.tutor.taskCompleteError")}</p>
                  {serverFinished && serverCompletedTaskId === taskId && !taskCompleted && <button type="button" onClick={() => void retryLinkedTaskCompletion()} disabled={finishBusy} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-[#8D342D]/25 bg-white px-4 py-2 text-xs font-extrabold text-[#8D342D] disabled:opacity-60">{finishBusy && <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}{t("learner.tutor.retryTaskComplete")}</button>}
                </section>
              )}

              {taskCompleted && <p role="status" className="flex items-start gap-2 rounded-xl border border-[#B9D9CB] bg-[#F0F8F4] px-4 py-3 text-sm leading-6 text-[#205D45]"><Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />{t("learner.tutor.taskComplete")}</p>}

              {isViewingHistory && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/10 bg-[#F7F8FB] px-4 py-3">
                  <p className="flex items-center gap-2 text-xs font-bold text-primary"><History aria-hidden="true" className="h-4 w-4" />{t("learner.tutor.viewingSaved")}</p>
                  <button type="button" onClick={returnToCurrentSession} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-3.5 py-2 text-xs font-extrabold text-primary transition hover:bg-[#EEF2FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />{t("learner.tutor.returnToCurrent")}</button>
                </div>
              )}

              <section className="min-w-0 rounded-[1.5rem] border border-primary/10 bg-[#FBFBFA] p-4 shadow-[0_20px_52px_-42px_rgba(30,58,138,0.45)] sm:p-5" aria-label={t("learner.tutor.conversationLabel")}>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-primary/10 pb-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-white"><ModeIcon aria-hidden="true" className="h-5 w-5" /></span>
                    <div className="min-w-0"><p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-[#C64D43]">{t("learner.tutor.aiTutor")}</p><h3 className="break-words font-display text-base font-extrabold text-primary">{t(MODE_KEYS[sessionMode])}</h3></div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/10 bg-white px-3 py-1.5 text-[10px] font-extrabold text-primary"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />{t(tutorPlanBadgeKey(displayedPlanTier, summaryFailed))}</span>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-xs font-bold text-primary">
                    <input type="checkbox" role="switch" aria-checked={readAloud} checked={readAloud} onChange={(event) => { const on = event.target.checked; if (on) playerRef.current.unlock(); setReadAloud(on); void saveReadAloud(on).catch(() => setReadAloud(!on)); }} className="h-4 w-4 accent-primary" />
                    {t("voice.readAloud")}
                  </label>
                  <button type="button" onClick={() => playerRef.current.stop()} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-primary/10 bg-white px-3 text-[11px] font-bold text-primary transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><Square aria-hidden="true" className="h-3 w-3" />{t("voice.stop")}</button>
                </div>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{t("voice.readAloudHelp")}</p>
                {voiceNote && <p role="status" className="mt-3 rounded-xl border border-primary/10 bg-white px-3.5 py-3 text-xs leading-5 text-muted-foreground">{t(voiceNote)}</p>}

                <TutorConversationLog
                  messages={visibleMessages}
                  limitReached={reachedLimit}
                  timeZone={learnerTimeZone}
                  frenchVoiceAvailable={true}
                  onListen={listenTapped}
                />

                {sessionMode === "lesson" && !isViewingHistory && lessonPracticeItems.length > 0 && (
                  <div className="mt-5 space-y-4 border-t border-primary/10 pt-5">
                    <section aria-labelledby="lesson-practice-title" className="min-w-0 rounded-2xl border border-primary/10 bg-white p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FA] text-primary"><BookOpenText aria-hidden="true" className="h-4 w-4" /></span>
                        <div className="min-w-0"><h4 id="lesson-practice-title" className="font-display text-base font-extrabold text-primary">{t("learner.tutor.lessonPracticeTitle")}</h4><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("learner.tutor.lessonPracticeHelp")}</p></div>
                      </div>
                      <div className="mt-4 space-y-3">
                        {lessonPracticeItems.map((item, index) => {
                          const result = practiceResults[item.id];
                          const selected = practiceChoices[item.id] ?? "";
                          const busy = practiceBusyId === item.id;
                          return (
                            <fieldset key={item.id} className="min-w-0 rounded-xl bg-[#F8F9FC] p-3.5 sm:p-4">
                              <legend className="max-w-full break-words pr-1 text-sm font-bold leading-5 text-foreground"><span className="mb-1 block text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#A13F36]">{t("learner.tutor.practiceItem").replace("{number}", String(index + 1)).replace("{total}", String(lessonPracticeItems.length))}</span>{item.prompt}</legend>
                              <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
                                {item.options.map((option) => (
                                  <label key={option.id} className="block min-w-0 cursor-pointer">
                                    <input type="radio" name={`practice-${sessionId}-${item.id}`} value={option.id} checked={selected === option.id} disabled={Boolean(result) || busy || sessionEnded} onChange={() => setPracticeChoices((current) => current[item.id] ? current : { ...current, [item.id]: option.id })} className="peer sr-only" />
                                    <span className={`flex min-h-11 items-center rounded-xl border px-3 py-2.5 text-sm leading-5 text-foreground transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-disabled:cursor-not-allowed peer-disabled:opacity-75 ${selected === option.id ? "border-primary bg-[#EEF2FA]" : "border-primary/10 bg-white hover:border-primary/25"}`}><span className="break-words">{option.text}</span></span>
                                  </label>
                                ))}
                              </div>
                              {!result && <button type="button" onClick={() => void gradeLessonPractice(item)} disabled={!selected || busy || requestBusy || sessionEnded} className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50">{busy && <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}{t(busy ? "learner.tutor.checkingAnswer" : "learner.tutor.checkAnswer")}</button>}
                              {result && <p role="status" className={`mt-3 rounded-xl px-3.5 py-3 text-xs leading-5 ${result.correct ? "bg-[#E7F4ED] text-[#205D45]" : "bg-[#FFF5F2] text-[#75413D]"}`}><strong className="block">{result.correct ? t("learner.tutor.practiceCorrect") : t("learner.tutor.practiceIncorrect").replace("{answer}", result.answer)}</strong>{result.explanation && <span dir="auto" className="mt-1 block break-words">{result.explanation}</span>}{result.example && <span dir="auto" className="mt-1 block break-words"><strong>{t("learner.tutor.exampleSentence")}:</strong> {result.example}</span>}</p>}
                            </fieldset>
                          );
                        })}
                      </div>
                      <p className="mt-3 text-xs font-bold text-muted-foreground">{t("learner.tutor.practiceProgress").replace("{done}", String(Object.keys(practiceResults).length)).replace("{total}", String(lessonPracticeItems.length))}</p>
                    </section>

                    {practiceComplete && miniTestItems.length === 3 && (
                      <section aria-labelledby="mini-test-title" className="min-w-0 rounded-2xl border border-[#F2CDC7] bg-[#FFF8F6] p-4 sm:p-5">
                        <div className="flex items-start gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FCE7E3] text-[#A13F36]"><Check aria-hidden="true" className="h-4 w-4" /></span>
                          <div className="min-w-0"><h4 id="mini-test-title" className="font-display text-base font-extrabold text-primary">{t("learner.tutor.miniTestTitle")}</h4><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("learner.tutor.miniTestHelp")}</p></div>
                        </div>
                        {!miniTestResult ? <div className="mt-4 space-y-3">
                          {miniTestItems.map((item, index) => (
                            <fieldset key={item.id} className="min-w-0 rounded-xl border border-primary/10 bg-white p-3.5 sm:p-4">
                              <legend className="max-w-full break-words pr-1 text-sm font-bold leading-5 text-foreground"><span className="mb-1 block text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#A13F36]">{t("learner.tutor.practiceItem").replace("{number}", String(index + 1)).replace("{total}", "3")}</span>{item.prompt}</legend>
                              <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
                                {item.options.map((option) => (
                                  <label key={option.id} className="block min-w-0 cursor-pointer">
                                    <input type="radio" name={`mini-${sessionId}-${item.id}`} value={option.id} checked={miniTestChoices[item.id] === option.id} disabled={miniTestBusy || sessionEnded} onChange={() => setMiniTestChoices((current) => ({ ...current, [item.id]: option.id }))} className="peer sr-only" />
                                    <span className={`flex min-h-11 items-center rounded-xl border px-3 py-2.5 text-sm leading-5 text-foreground transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-disabled:cursor-not-allowed peer-disabled:opacity-75 ${miniTestChoices[item.id] === option.id ? "border-primary bg-[#EEF2FA]" : "border-primary/10 bg-white hover:border-primary/25"}`}><span className="break-words">{option.text}</span></span>
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                          ))}
                          <button type="button" onClick={() => void submitMiniTest()} disabled={!miniTestItems.every((item) => Boolean(miniTestChoices[item.id])) || miniTestBusy || sessionEnded} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#A13F36] px-4 py-2 text-xs font-extrabold text-white transition hover:bg-[#8D342D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A13F36] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{miniTestBusy && <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}{t(miniTestBusy ? "learner.tutor.submittingMiniTest" : "learner.tutor.submitMiniTest")}</button>
                        </div> : (
                          <div role="status" className="mt-4 rounded-xl border border-[#B9D9CB] bg-white p-4"><p className="font-display text-lg font-extrabold text-primary">{t("learner.tutor.miniTestScore").replace("{score}", String(miniTestResult.score)).replace("{correct}", String(miniTestResult.correct)).replace("{total}", "3")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("learner.tutor.masterySaved")}</p>{miniTestResult.results.length > 0 && <div className="mt-3 space-y-2 border-t border-primary/10 pt-3">{miniTestResult.results.map((result, index) => <div key={`${String(result.item_id)}-${index}`} className="rounded-lg bg-[#F8F9FC] px-3 py-2.5 text-xs leading-5"><p className="font-bold text-foreground">{t("learner.tutor.miniTestResult").replace("{number}", String(index + 1)).replace("{answer}", String(result.answer ?? ""))}</p>{typeof result.explanation === "string" && <p dir="auto" className="mt-1 break-words text-muted-foreground">{result.explanation}</p>}</div>)}</div>}</div>
                        )}
                      </section>
                    )}
                  </div>
                )}

                {sessionMode === "speaking" && !isViewingHistory && (
                  <section className="mt-5 min-w-0 space-y-4 border-t border-primary/10 pt-5" aria-labelledby="speaking-scenario-title">
                    {writingPrompt && <div className="rounded-2xl border border-primary/10 bg-white p-4"><p id="speaking-scenario-title" className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-[#C64D43]">{t("learner.tutor.scenarioTitle")}</p><p dir="auto" className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{writingPrompt}</p></div>}
                    {sessionId && !sessionEnded && !reachedLimit && (
                      <VoiceRecorder
                        purpose="message"
                        refId={sessionId}
                        maxMs={MESSAGE_MAX_MS}
                        disabled={requestBusy}
                        onTranscribed={(r) => {
                          setComposeText(r.transcript.slice(0, 4000));
                          setSpeechTranscriptPending(true);
                          setSpeechTranscriptConfirmed(false);
                        }}
                      />
                    )}
                    <p className="text-xs leading-5 text-muted-foreground">{t("learner.tutor.typedFallback")}</p>
                    <TutorMessageComposer
                      mode="speaking"
                      value={composeText}
                      onChange={updateComposerText}
                      onSubmit={submitTutorMessage}
                      busy={requestBusy}
                      limitReached={reachedLimit}
                      sessionEnded={sessionEnded}
                      timeZone={learnerTimeZone}
                      transcriptPending={speechTranscriptPending}
                      transcriptConfirmed={speechTranscriptConfirmed}
                      onConfirmTranscript={() => setSpeechTranscriptConfirmed(true)}
                      onSwitchToTyping={() => {
                        setSpeechTranscriptPending(false);
                        setSpeechTranscriptConfirmed(false);
                        setComposeText("");
                      }}
                    />
                    {speakingResponseFeedback && (
                      <div className="rounded-2xl border border-[#B9D9CB] bg-[#F0F8F4] p-4">
                        <p className="text-xs font-extrabold text-[#205D45]">{t("learner.tutor.speakingFeedback")}</p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {([["learner.tutor.pronunciation", "learner.tutor.notAssessed"], ["learner.tutor.fluency", "learner.tutor.notAssessed"]] as const).map(([label, value]) => <div key={label} className="min-w-0 rounded-xl bg-white px-3 py-2.5"><p className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">{t(label)}</p><p className="mt-1 break-words text-xs font-bold text-primary">{t(value)}</p></div>)}
                        </div>
                        <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{t("learner.tutor.speakingDisclaimer")}</p>
                      </div>
                    )}
                  </section>
                )}

                {sessionMode === "writing" && !isViewingHistory && (
                  <section className="mt-5 min-w-0 space-y-4 border-t border-primary/10 pt-5" aria-labelledby="writing-prompt-title">
                    {writingPrompt && <div className="rounded-2xl border border-primary/10 bg-white p-4"><p id="writing-prompt-title" className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-[#C64D43]">{t("learner.tutor.writingPromptTitle")}</p><p dir="auto" className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{writingPrompt}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{t("learner.tutor.writingPromptHelp")}</p></div>}
                    <TutorMessageComposer
                      mode="writing"
                      value={composeText}
                      onChange={updateComposerText}
                      onSubmit={submitTutorMessage}
                      busy={requestBusy}
                      limitReached={reachedLimit}
                      sessionEnded={sessionEnded}
                      timeZone={learnerTimeZone}
                    />
                  </section>
                )}

                {(sessionMode === "chat" || sessionMode === "question") && !isViewingHistory && (
                  <TutorMessageComposer
                    mode={sessionMode}
                    value={composeText}
                    onChange={updateComposerText}
                    onSubmit={submitTutorMessage}
                    busy={requestBusy}
                    limitReached={reachedLimit}
                    sessionEnded={sessionEnded}
                    timeZone={learnerTimeZone}
                  />
                )}

                {!isViewingHistory && sessionId && (
                  <div className="mt-5 flex min-w-0 flex-col gap-3 border-t border-primary/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 text-xs leading-5 text-muted-foreground">
                      {sessionEnded ? <p>{t("learner.tutor.sessionFinished")}</p> : !canFinishSession ? <p>{t(mode === "lesson" ? "learner.tutor.finishBlocked" : "learner.tutor.finishResponseFirst")}</p> : <p>{t("learner.tutor.finishSession")}</p>}
                      {taskId && !linkedTaskIsValid && <p role="alert" className="mt-1 text-[#8D342D]">{t("learner.tutor.errorGeneric")}</p>}
                    </div>
                    <button type="button" onClick={() => void finishTutorSession()} disabled={finishBusy || (!canFinishSession && !serverFinished) || (taskId && taskCompleted)} className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-full border border-[#B9D9CB] bg-[#F0F8F4] px-4 py-2 text-xs font-extrabold text-[#205D45] transition hover:bg-[#E7F4ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#287252] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{finishBusy ? <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Check aria-hidden="true" className="h-3.5 w-3.5" />}{t(finishBusy ? "learner.tutor.finishingSession" : taskCompleted ? "learner.tutor.taskComplete" : "learner.tutor.finishSession")}</button>
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-[1.45rem] border border-primary/10 bg-white p-4 shadow-[0_18px_42px_-34px_rgba(30,58,138,0.38)] sm:p-5">
            <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEF2FA] text-primary"><Clock3 aria-hidden="true" className="h-4 w-4" /></span><div><p className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-muted-foreground">{t(tutorPlanBadgeKey(displayedPlanTier, summaryFailed))}</p><h3 className="mt-1 font-display text-sm font-extrabold text-primary">{messagesLimit === null ? t("learner.tutor.messagesPending") : t("learner.tutor.messagesRemaining", { remaining: remainingMessages, limit: messagesLimit })}</h3></div></div>
            <p className="mt-3 text-[10px] leading-5 text-muted-foreground">{t("learner.tutor.limitDemoNote")}</p>
          </section>

          <section className="rounded-[1.45rem] border border-primary/10 bg-white p-4 shadow-[0_18px_42px_-34px_rgba(30,58,138,0.38)] sm:p-5">
            <label htmlFor="explain-in-native" className="flex cursor-pointer items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EC] text-[#A13F36]"><Languages aria-hidden="true" className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-primary">{t("learner.tutor.explainNative")}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{t("learner.tutor.explainNativeHelp")}</span></span>
              <input id="explain-in-native" type="checkbox" checked={explainInNative} disabled={preferenceBusy || !account} onChange={(event) => void changeExplanationLanguage(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 rounded border-primary/25 text-primary accent-[#1E3A8A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50" />
            </label>
            {nativeLanguage && <p className="mt-3 border-t border-primary/10 pt-3 text-[10px] font-semibold text-muted-foreground">{nativeLanguage}</p>}
            {preferenceBusy && <p role="status" className="mt-2 text-xs text-muted-foreground">{t("learner.tutor.preferenceSaving")}</p>}
            {preferenceError && <p role="alert" className="mt-2 text-xs leading-5 text-[#8D342D]">{t("learner.tutor.preferenceError")}</p>}
          </section>

          <section className="rounded-[1.45rem] border border-primary/10 bg-white p-4 shadow-[0_18px_42px_-34px_rgba(30,58,138,0.38)] sm:p-5">
            <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F7F8FB] text-primary"><Mic2 aria-hidden="true" className="h-4 w-4" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-sm font-extrabold text-primary">{t("learner.tutor.liveVoiceTitle")}</h3><span className="rounded-full bg-[#FFF0EC] px-2 py-1 text-[8px] font-extrabold uppercase tracking-[0.1em] text-[#8D342D]">{t("learner.tutor.liveVoiceComing")}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("learner.tutor.liveVoiceBody")}</p></div></div>
            <button type="button" disabled className="mt-3 inline-flex min-h-10 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full border border-primary/10 bg-[#F7F8FB] px-3 text-xs font-extrabold text-muted-foreground opacity-80"><Mic2 aria-hidden="true" className="h-3.5 w-3.5" />{t("learner.tutor.liveVoiceComing")}</button>
          </section>

          <Link to="/learner/plan" className="inline-flex min-h-10 w-fit max-w-full items-center gap-2 rounded-full border border-primary/15 bg-white px-3.5 py-2 text-[11px] font-extrabold text-primary transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <span className="whitespace-nowrap">{t("learner.plan.seeYourPlan")}</span><ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          </Link>

          <section className="rounded-[1.45rem] border border-primary/10 bg-white p-4 shadow-[0_18px_42px_-34px_rgba(30,58,138,0.38)] sm:p-5" aria-labelledby="topic-mastery-title">
            <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E7F4ED] text-[#287252]"><Target aria-hidden="true" className="h-4 w-4" /></span><h3 id="topic-mastery-title" className="font-display text-sm font-extrabold text-primary">{t("learner.tutor.masteryTitle")}</h3></div>
            {recentMastery.length ? <ul className="mt-3 space-y-2">{recentMastery.map((row, index) => {
              const languagePoint = typeof row.language_point === "string" && row.language_point.trim() ? row.language_point.trim() : t("learner.tutor.legacyMasteryPoint");
              const theme = typeof row.theme === "string" && row.theme.trim() ? row.theme : typeof row.topic === "string" ? row.topic : "";
              const score = typeof row.language_point_rolling_score === "number" && Number.isFinite(row.language_point_rolling_score)
                ? row.language_point_rolling_score
                : typeof row.rolling_score === "number" && Number.isFinite(row.rolling_score) ? row.rolling_score : 0;
              return <li key={String(row.id ?? row.language_point_key ?? index)} className="min-w-0 rounded-xl bg-[#F7F8FB] px-3 py-2.5 text-xs leading-5 text-foreground"><p className="break-words font-bold text-primary">{languagePoint}</p><p className="mt-1 font-semibold">{t("learner.tutor.masteryScore").replace("{score}", String(score))}</p>{theme && <p className="mt-1 break-words text-muted-foreground"><span className="font-bold">{t("learner.tutor.themeLabel")}:</span> {prettyTopic(theme)}</p>}</li>;
            })}</ul> : <p className="mt-3 text-xs leading-5 text-muted-foreground">{t("learner.tutor.masteryEmpty")}</p>}
          </section>

          <section className="rounded-[1.45rem] border border-primary/10 bg-white p-4 shadow-[0_18px_42px_-34px_rgba(30,58,138,0.38)] sm:p-5" aria-labelledby="mistakes-title">
            <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF0EC] text-[#A13F36]"><FileText aria-hidden="true" className="h-4 w-4" /></span><h3 id="mistakes-title" className="font-display text-sm font-extrabold text-primary">{t("learner.tutor.mistakesTitle")}</h3></div>
            {history.mistakes.length ? <ul className="mt-3 space-y-2">{history.mistakes.slice(0, 5).map((row, index) => {
              const skill = row.skill === "listening" || row.skill === "reading" || row.skill === "writing" || row.skill === "speaking" ? row.skill : null;
              const area = row.area === "vocabulary" || row.area === "structure" || row.area === "pronunciation" ? row.area : "grammar";
              const languagePoint = typeof row.language_point === "string" && row.language_point.trim() ? row.language_point.trim() : t("learner.tutor.legacyCorrectionPoint");
              const theme = typeof row.theme === "string" && row.theme.trim() ? row.theme : typeof row.topic === "string" ? row.topic : "";
              return <li key={`${String(row.id ?? row.created_at ?? index)}`} className="min-w-0 rounded-xl bg-[#F7F8FB] p-3"><p className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#A13F36]">{skill ? t(SKILL_KEYS[skill]) : ""}{skill ? " · " : ""}{t(AREA_KEYS[area])}</p><p className="mt-1 break-words text-xs font-bold leading-5 text-primary"><span className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">{t("learner.tutor.languagePointLabel")}:</span> {languagePoint}</p>{theme && <p className="mt-1 break-words text-[11px] leading-5 text-muted-foreground"><span className="font-bold">{t("learner.tutor.themeLabel")}:</span> {prettyTopic(theme)}</p>}<p dir="auto" className="mt-2 break-words text-xs leading-5 text-foreground">{String(row.original_sentence ?? "")}</p><p dir="auto" className="mt-1 break-words text-xs font-bold leading-5 text-primary">{String(row.corrected_sentence ?? "")}</p></li>;
            })}</ul> : <p className="mt-3 text-xs leading-5 text-muted-foreground">{historyLoading ? t("learner.tutor.opening") : t("learner.tutor.mistakesEmpty")}</p>}
          </section>

          <section className="rounded-[1.45rem] border border-primary/10 bg-white p-4 shadow-[0_18px_42px_-34px_rgba(30,58,138,0.38)] sm:p-5" aria-labelledby="session-history-title">
            <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEF2FA] text-primary"><History aria-hidden="true" className="h-4 w-4" /></span><h3 id="session-history-title" className="font-display text-sm font-extrabold text-primary">{t("learner.tutor.historyTitle")}</h3></div>
            {otherSessions.length ? <ul className="mt-3 space-y-2">{otherSessions.map((entry) => <li key={entry.id}><button type="button" onClick={() => chooseHistorySession(entry.id)} className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl bg-[#F7F8FB] px-3 py-2 text-left text-xs font-bold leading-5 text-primary transition hover:bg-[#EEF2FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><span className="min-w-0 break-words">{t("learner.tutor.viewSavedSession").replace("{mode}", t(modeKey(entry.mode))).replace("{date}", formatSessionDate(entry.started_at) || "")}</span><ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /></button></li>)}</ul> : <p className="mt-3 text-xs leading-5 text-muted-foreground">{historyLoading ? t("learner.tutor.opening") : t("learner.tutor.historyEmpty")}</p>}
          </section>
        </aside>
      </div>
    </motion.div>
  );
}
