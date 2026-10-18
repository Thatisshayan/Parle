import { User, learner_task, topic_mastery } from "@/entities";
import { parleAssessmentService } from "@/functions";
import { learnerLocalDateFromUtcTimestamp } from "@/lib/learner-display";
import { SKILL_KEYS, type SkillKey } from "@/lib/roadmap-engine";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const SKILL_SET = new Set<string>(SKILL_KEYS);

type AnalyticsRow = Record<string, unknown> & {
  created_by?: string;
  user_id?: string;
  type?: unknown;
  skill?: unknown;
  reason?: unknown;
  reason_skill?: unknown;
  minutes?: unknown;
  status?: unknown;
  completed_at_utc?: unknown;
  created_at?: unknown;
  language_point?: unknown;
  language_point_key?: unknown;
  language_point_rolling_score?: unknown;
};

export interface PracticeTaskAnalyticsRow {
  type?: unknown;
  skill?: unknown;
  reason?: unknown;
  reason_skill?: unknown;
  minutes?: unknown;
  status?: unknown;
  completed_at_utc?: unknown;
}

function skillKeyFromSavedValue(value: unknown): SkillKey | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return SKILL_SET.has(normalized) ? normalized as SkillKey : null;
}

/** Uses the saved primary skill; reason_skill is a fallback only when the saved reason proves it. */
function skillForAnalyticsTask(task: PracticeTaskAnalyticsRow): SkillKey | null {
  const rawSkill = typeof task.skill === "string" ? task.skill.trim() : "";
  if (rawSkill) return skillKeyFromSavedValue(rawSkill);

  const reasonSkill = skillKeyFromSavedValue(task.reason_skill);
  if (task.reason === "biggest_gap" && reasonSkill) return reasonSkill;
  if (task.reason === "speaking_check" && task.type === "speaking_check" && reasonSkill === "speaking") return reasonSkill;
  return null;
}

export interface LearnerLocalDateRange {
  startLocalDate: string;
  endLocalDate: string;
  timeZone: string;
}

export interface LanguagePointMasteryRow {
  created_at?: unknown;
  language_point?: unknown;
  language_point_key?: unknown;
  language_point_rolling_score?: unknown;
}

export interface LanguagePointMasterySummary {
  key: string;
  languagePoint: string;
  score: number;
}

export type PracticeMinutesBySkill = Record<SkillKey, number>;

export interface LearnerDetailedAnalytics {
  minutesBySkill: PracticeMinutesBySkill | null;
  reportMinutesBySkill: PracticeMinutesBySkill | null;
  weeklyCheckInMinutes: number | null;
  reportWeeklyCheckInMinutes: number | null;
  lowestLanguagePoints: LanguagePointMasterySummary[];
}

export type LearnerAnalyticsResult =
  | { planTier: "free" }
  | { planTier: "premium"; analytics: LearnerDetailedAnalytics };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unwrapServiceResponse(value: unknown): Record<string, unknown> {
  let current: unknown = value;
  for (let index = 0; index < 6; index += 1) {
    if (!isObject(current)) break;
    if (isObject(current.result)) {
      current = current.result;
      continue;
    }
    if (isObject(current.data) && ("status" in current.data || "error" in current.data || "error_code" in current.data || "summary" in current.data || "url" in current.data)) {
      current = current.data;
      continue;
    }
    break;
  }
  return isObject(current) ? current : {};
}

export function readServerPlanTier(value: unknown): "free" | "premium" {
  const payload = unwrapServiceResponse(value);
  if (payload.status !== "complete" || !isObject(payload.summary)) {
    throw new Error("The server plan summary could not be confirmed.");
  }

  // Use the same server-resolved plan summary as Your plan. The client never decides entitlement.
  if (payload.summary.plan_tier === "premium") return "premium";
  if (payload.summary.plan_tier === "free") return "free";
  throw new Error("The server plan tier could not be confirmed.");
}

/** Sums completed skill-bearing task durations in the rolling 28-day window or an explicit learner-local report range. */
export function aggregatePracticeMinutesBySkill(
  tasks: readonly PracticeTaskAnalyticsRow[],
  now = new Date(),
  reportRange?: LearnerLocalDateRange,
): PracticeMinutesBySkill | null {
  const nowTime = now.getTime();
  if (!Number.isFinite(nowTime)) return null;
  const windowStart = nowTime - 28 * DAY_IN_MS;
  if (reportRange && (
    !isCalendarDate(reportRange.startLocalDate)
    || !isCalendarDate(reportRange.endLocalDate)
    || reportRange.endLocalDate < reportRange.startLocalDate
    || typeof reportRange.timeZone !== "string"
    || !reportRange.timeZone.trim()
  )) return null;

  const totals: PracticeMinutesBySkill = { listening: 0, reading: 0, writing: 0, speaking: 0 };
  let countedTasks = 0;

  for (const task of tasks) {
    if (task.status !== "done") continue;
    const skill = skillForAnalyticsTask(task);
    if (!skill) continue;
    if (typeof task.minutes !== "number" || !Number.isFinite(task.minutes) || task.minutes <= 0) continue;
    if (typeof task.completed_at_utc !== "string" || !task.completed_at_utc.trim()) continue;

    const completedAt = Date.parse(task.completed_at_utc);
    if (!Number.isFinite(completedAt) || completedAt > nowTime) continue;
    if (reportRange) {
      const completedDate = learnerLocalDateFromUtcTimestamp(task.completed_at_utc, reportRange.timeZone);
      if (!completedDate || completedDate < reportRange.startLocalDate || completedDate > reportRange.endLocalDate) continue;
    } else if (completedAt < windowStart) {
      continue;
    }

    totals[skill] += task.minutes;
    countedTasks += 1;
  }

  return countedTasks ? totals : null;
}

/** Sums completed weekly check-ins as whole minutes over the rolling card window or learner-local report range. */
export function aggregateWeeklyCheckInMinutes(
  tasks: readonly PracticeTaskAnalyticsRow[],
  now = new Date(),
  reportRange?: LearnerLocalDateRange,
): number | null {
  const nowTime = now.getTime();
  if (!Number.isFinite(nowTime)) return null;
  const windowStart = nowTime - 28 * DAY_IN_MS;
  if (reportRange && (
    !isCalendarDate(reportRange.startLocalDate)
    || !isCalendarDate(reportRange.endLocalDate)
    || reportRange.endLocalDate < reportRange.startLocalDate
    || typeof reportRange.timeZone !== "string"
    || !reportRange.timeZone.trim()
  )) return null;

  let totalMinutes = 0;
  for (const task of tasks) {
    if (task.status !== "done" || task.type !== "weekly_checkin") continue;
    if (typeof task.minutes !== "number" || !Number.isFinite(task.minutes) || task.minutes <= 0) continue;
    if (typeof task.completed_at_utc !== "string" || !task.completed_at_utc.trim()) continue;

    const completedAt = Date.parse(task.completed_at_utc);
    if (!Number.isFinite(completedAt) || completedAt > nowTime) continue;
    const completedDate = learnerLocalDateFromUtcTimestamp(task.completed_at_utc, reportRange?.timeZone ?? "UTC");
    if (!completedDate) continue;
    if (reportRange) {
      if (completedDate < reportRange.startLocalDate || completedDate > reportRange.endLocalDate) continue;
    } else if (completedAt < windowStart) {
      continue;
    }

    const minutes = Math.floor(task.minutes);
    if (minutes > 0) totalMinutes += minutes;
  }

  return totalMinutes;
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function timestampFor(row: LanguagePointMasteryRow): number {
  const timestamp = typeof row.created_at === "string" ? Date.parse(row.created_at) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

/** Keeps the latest saved point-level score for each language point, then returns the three lowest. */
export function selectLowestLanguagePointMastery(
  rows: readonly LanguagePointMasteryRow[],
): LanguagePointMasterySummary[] {
  const latestByPoint = new Map<string, {
    key: string;
    languagePoint: string;
    score: number | null;
    createdAt: number;
  }>();

  for (const row of rows) {
    const languagePoint = typeof row.language_point === "string" ? row.language_point.trim() : "";
    if (!languagePoint) continue;

    const storedKey = typeof row.language_point_key === "string" ? row.language_point_key.trim() : "";
    const key = storedKey
      ? `key:${storedKey.toLocaleLowerCase()}`
      : `label:${languagePoint.toLocaleLowerCase().replace(/\s+/g, " ")}`;
    const createdAt = timestampFor(row);
    const existing = latestByPoint.get(key);
    if (existing && createdAt <= existing.createdAt) continue;

    const scoreValue = row.language_point_rolling_score;
    const score = typeof scoreValue === "number" && Number.isFinite(scoreValue) && scoreValue >= 0 && scoreValue <= 100
      ? scoreValue
      : null;
    latestByPoint.set(key, { key, languagePoint, score, createdAt });
  }

  return [...latestByPoint.values()]
    .flatMap((item) => item.score === null ? [] : [{ key: item.key, languagePoint: item.languagePoint, score: item.score }])
    .sort((left, right) => left.score - right.score || left.languagePoint.localeCompare(right.languagePoint))
    .slice(0, 3);
}

function rowsFromResponse(value: unknown, label: string): AnalyticsRow[] {
  const rows = Array.isArray(value)
    ? value
    : isObject(value) && Array.isArray(value.data)
      ? value.data
      : null;
  if (!rows) throw new Error(`Saved ${label} records could not be read.`);
  return rows.filter(isObject) as AnalyticsRow[];
}

export function filterAnalyticsRowsByOwner<T extends { user_id?: unknown; created_by?: unknown }>(
  rows: readonly T[],
  learner: { id: string; email: string },
): T[] {
  return rows.filter((row) => row.user_id === learner.id && row.created_by === learner.email);
}

async function loadOwnedRows(
  entity: unknown,
  learner: { id: string; email: string },
  label: string,
  sort: string,
  limit: number,
): Promise<AnalyticsRow[]> {
  const response = await (entity as { filter: (filters: Record<string, string>, sort: string, limit: number) => Promise<unknown> }).filter(
    { created_by: learner.email, user_id: learner.id },
    sort,
    limit,
  );
  return filterAnalyticsRowsByOwner(rowsFromResponse(response, label), learner);
}

/** Calls the existing read-only plan-summary action before reading any Premium analytics records. */
export async function loadMyLearnerAnalytics(
  now = new Date(),
  reportRange?: LearnerLocalDateRange,
): Promise<LearnerAnalyticsResult> {
  const response = await parleAssessmentService({ action: "tutor_get_plan_summary" });
  const planTier = readServerPlanTier(response);
  if (planTier === "free") return { planTier };

  const currentUser = await User.me() as { id?: unknown; email?: unknown } | null;
  if (typeof currentUser?.id !== "string" || !currentUser.id || typeof currentUser.email !== "string" || !currentUser.email) {
    throw new Error("Sign in to view detailed learner analytics.");
  }
  const learner = { id: currentUser.id, email: currentUser.email };
  const [taskRows, masteryRows] = await Promise.all([
    loadOwnedRows(learner_task, learner, "practice task", "-completed_at_utc", 500),
    loadOwnedRows(topic_mastery, learner, "language-point mastery", "-created_at", 200),
  ]);

  return {
    planTier,
    analytics: {
      minutesBySkill: aggregatePracticeMinutesBySkill(taskRows, now),
      reportMinutesBySkill: reportRange ? aggregatePracticeMinutesBySkill(taskRows, now, reportRange) : null,
      weeklyCheckInMinutes: aggregateWeeklyCheckInMinutes(taskRows, now),
      reportWeeklyCheckInMinutes: reportRange ? aggregateWeeklyCheckInMinutes(taskRows, now, reportRange) : null,
      lowestLanguagePoints: selectLowestLanguagePointMastery(masteryRows),
    },
  };
}
