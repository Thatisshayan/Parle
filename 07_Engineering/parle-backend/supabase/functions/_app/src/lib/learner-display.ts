// GENERATED from parle-app/src/lib/learner-display.ts by scripts/sync-app-code.ts. Do not edit.
import { t } from "./i18n.ts";
import type { PlannerTrack } from "./roadmap-engine.ts";

const CEFR_ANCHORS = ["A0", "A1", "A2", "B1", "B2", "C1"] as const;

export type ApproximateNclcLevel = number | "below" | null;
export type CheckInEvidenceKind = "listening" | "reading" | "grammar";
export type CheckInResultCopyKey =
  | "learner.checkin.resultListening"
  | "learner.checkin.resultReading"
  | "learner.checkin.resultGrammar";

type QuestionOptionView = { id: string; text: string };

function boundedScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, value));
}

function formatNumericScore(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/** Maps quarter-step planning scores to the nearest approved CEFR anchor, with ties rounded up. */
export function cefrLabelForScore(value: number): (typeof CEFR_ANCHORS)[number] {
  const score = boundedScore(value);
  const anchorIndex = Math.min(CEFR_ANCHORS.length - 1, Math.floor(score + 0.5));
  return CEFR_ANCHORS[anchorIndex];
}

export function formatSkillLevel(value: number, locale?: string): string {
  return `${cefrLabelForScore(value)} · ${formatNumericScore(value, locale)} / 5`;
}

/** Uses only Parle's approved Canadian-track planning approximation, never an official conversion. */
export function approximateNclcLevel(value: number, track: PlannerTrack): ApproximateNclcLevel {
  if (track === "general" || !Number.isFinite(value)) return null;
  const score = boundedScore(value);
  if (score < 1.5) return "below";
  return Math.min(10, 3 + Math.round((score - 1.5) / 0.5));
}

export function formatLearnerLevel(value: number, track: PlannerTrack = "general", locale?: string): string {
  const base = formatSkillLevel(value, locale);
  const nclc = approximateNclcLevel(value, track);
  if (nclc === "below") return `${base} · ${t("learner.level.nclcBelow")}`;
  if (typeof nclc === "number") {
    return `${base} · ${t("learner.level.nclcApprox").replace("{level}", String(nclc))}`;
  }
  return base;
}

export function formatCurrentEstimate(value: number, track: PlannerTrack = "general", locale?: string): string {
  return `${formatLearnerLevel(value, track, locale)} · ${t("learner.checkin.estimateLabel")}`;
}

/** Formats a date-only value in UTC at midday so local browser zones cannot shift its calendar day. */
export function formatCalendarDate(
  value: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
  locale?: string,
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return value;
  return new Intl.DateTimeFormat(locale, { ...options, year: "numeric", timeZone: "UTC" }).format(date);
}

/** Sums every task row supplied, using the caller's exact visible day list. */
export function scheduledMinutesForTasks(tasks: ReadonlyArray<{ minutes: number }>): number {
  return tasks.reduce((total, task) => total + task.minutes, 0);
}

type CompletedMinuteTask = { status: string; minutes: number; completedAtUtc?: string | null };

const localDateFormatters = new Map<string, Intl.DateTimeFormat>();
const utcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateFormatterForTimeZone(timeZone: string): Intl.DateTimeFormat | null {
  const cached = localDateFormatters.get(timeZone);
  if (cached) return cached;
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    localDateFormatters.set(timeZone, formatter);
    return formatter;
  } catch {
    return null;
  }
}

/** Converts a valid saved UTC timestamp to the learner's ISO calendar date. */
export function learnerLocalDateFromUtcTimestamp(value: unknown, timeZone: string): string | null {
  if (typeof value !== "string" || !utcTimestampPattern.test(value) || !isValidCalendarDate(value.slice(0, 10))) return null;
  const timestamp = Date.parse(value);
  const formatter = dateFormatterForTimeZone(timeZone);
  if (!Number.isFinite(timestamp) || !formatter) return null;

  const parts = formatter.formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  const localDate = `${part("year")}-${part("month")}-${part("day")}`;
  return isValidCalendarDate(localDate) ? localDate : null;
}

function completedMinutesForMatchingLocalDates(
  tasks: ReadonlyArray<CompletedMinuteTask>,
  includesDate: (localDate: string) => boolean,
  timeZone: string,
): number {
  return tasks.reduce((total, task) => {
    if (task.status !== "done" || !Number.isFinite(task.minutes) || task.minutes <= 0) return total;
    const minutes = Math.floor(task.minutes);
    if (minutes <= 0) return total;
    const completedDate = learnerLocalDateFromUtcTimestamp(task.completedAtUtc, timeZone);
    return completedDate && includesDate(completedDate) ? total + minutes : total;
  }, 0);
}

/** Sums completed whole minutes recorded on one learner-local calendar date. */
export function completedMinutesForLocalDate(
  tasks: ReadonlyArray<CompletedMinuteTask>,
  localDate: string,
  timeZone: string,
): number {
  if (!isValidCalendarDate(localDate)) return 0;
  return completedMinutesForMatchingLocalDates(tasks, (date) => date === localDate, timeZone);
}

/** Sums completed whole minutes between two inclusive learner-local calendar dates. */
export function completedMinutesForLocalDateRange(
  tasks: ReadonlyArray<CompletedMinuteTask>,
  startLocalDate: string,
  endLocalDate: string,
  timeZone: string,
): number {
  if (!isValidCalendarDate(startLocalDate) || !isValidCalendarDate(endLocalDate) || endLocalDate < startLocalDate) return 0;
  return completedMinutesForMatchingLocalDates(
    tasks,
    (date) => date >= startLocalDate && date <= endLocalDate,
    timeZone,
  );
}

export function formatTaskCountLabel(count: number, singular: string, plural: string): string {
  return (count === 1 ? singular : plural).replace("{count}", String(count));
}

export function checkInResultCopyKey(kind: CheckInEvidenceKind): CheckInResultCopyKey {
  switch (kind) {
    case "listening": return "learner.checkin.resultListening";
    case "reading": return "learner.checkin.resultReading";
    case "grammar": return "learner.checkin.resultGrammar";
  }
}

/** Returns fresh option arrays while keeping each option and answer attached to its stable ID. */
export function shuffleQuestionOptions<T extends { options: QuestionOptionView[] }>(
  questions: readonly T[],
  random: () => number = Math.random,
): T[] {
  return questions.map((question) => {
    const options = [...question.options];
    for (let index = options.length - 1; index > 0; index -= 1) {
      const sample = random();
      const safeSample = Number.isFinite(sample) ? sample : 0;
      const swapIndex = Math.max(0, Math.min(index, Math.floor(safeSample * (index + 1))));
      [options[index], options[swapIndex]] = [options[swapIndex], options[index]];
    }
    return { ...question, options } as T;
  });
}
