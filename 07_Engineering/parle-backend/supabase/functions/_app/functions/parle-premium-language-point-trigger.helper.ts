// GENERATED from parle-app/functions/parle-premium-language-point-trigger.helper.ts by scripts/sync-app-code.ts. Do not edit.
export type LanguagePointTriggerSkill = "listening" | "reading" | "writing" | "speaking";

export interface PremiumLanguagePointPracticeTask {
  id: string;
  date: string;
  type: "ai_lesson";
  skill: LanguagePointTriggerSkill;
  minutes: 10;
  topic: string;
  reason: "weekly_practice";
  reasonSkill: LanguagePointTriggerSkill;
  status: "planned";
  rolloverCount: 0;
  optional: false;
}

export interface PremiumLanguagePointPracticeInput {
  priorScore: unknown;
  nextScore: unknown;
  premiumEligible: unknown;
  triggerEnabled: unknown;
  languagePoint: unknown;
  skill: unknown;
  todayLocal: unknown;
  weekStartLocal: unknown;
  weekEndLocal: unknown;
  weekPlanId: unknown;
  dailyLimits: unknown;
  dailyMinutes: unknown;
  scheduledTaskMinutes: unknown;
  plannedLearningMinutes: unknown;
  existingTasks: readonly unknown[];
  existingWhatChangedNote: unknown;
}

export type PremiumLanguagePointPracticeResult =
  | { task: null }
  | {
    task: PremiumLanguagePointPracticeTask;
    dailyMinutes: Record<string, number>;
    scheduledTaskMinutes: number;
    plannedLearningMinutes?: number;
    whatChangedNote: string;
  };

const CHANGE_NOTE_PREFIX = "[[parle-i18n:learner.today.change.extraPractice:";
const TRIGGER_TASK_PREFIX = "premium-point-practice-";
const PRACTICE_MINUTES = 10;
const SKILLS = new Set<LanguagePointTriggerSkill>(["listening", "reading", "writing", "speaking"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

export function languagePointKey(value: string): string {
  return cleanText(value, 120)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function validLocalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addLocalDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mondayOfLocalWeek(value: string): string {
  const weekday = new Date(`${value}T12:00:00.000Z`).getUTCDay();
  return addLocalDays(value, -((weekday + 6) % 7));
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function changedNoteMarker(point: string): string {
  return `${CHANGE_NOTE_PREFIX}${encodeURIComponent(point)}]]`;
}

function hasExistingTriggeredTask(tasks: readonly unknown[], taskId: string, taskKey: string): boolean {
  return tasks.some((value) => {
    if (!isObject(value)) return false;
    return value.id === taskId || value.id === taskKey || value.task_key === taskKey || value.taskKey === taskKey;
  });
}

/**
 * Pure extension to the weekly planner for one Premium language-point trigger.
 * Caps and scheduled minutes come from the active saved planner snapshot, so
 * this decision never regenerates or redistributes the learner's week.
 */
export function planPremiumLanguagePointPractice(
  input: PremiumLanguagePointPracticeInput,
): PremiumLanguagePointPracticeResult {
  if (input.premiumEligible !== true || input.triggerEnabled !== true) return { task: null };

  const priorScore = finiteNumber(input.priorScore);
  const nextScore = finiteNumber(input.nextScore);
  if (priorScore === null || nextScore === null || !(priorScore >= 60 && nextScore < 60 && nextScore < priorScore)) return { task: null };

  const point = cleanText(input.languagePoint, 120);
  const pointKey = languagePointKey(point);
  const skill = typeof input.skill === "string" && SKILLS.has(input.skill as LanguagePointTriggerSkill)
    ? input.skill as LanguagePointTriggerSkill
    : null;
  const weekPlanId = cleanText(input.weekPlanId, 120);
  if (!point || !pointKey || !skill || !weekPlanId || !validLocalDate(input.todayLocal) || !validLocalDate(input.weekStartLocal) || !validLocalDate(input.weekEndLocal)) {
    return { task: null };
  }

  const weekStart = input.weekStartLocal;
  const weekEnd = input.weekEndLocal;
  const expectedWeekStart = mondayOfLocalWeek(input.todayLocal);
  if (weekStart !== expectedWeekStart || weekEnd !== addLocalDays(weekStart, 6)) return { task: null };

  const taskId = `${TRIGGER_TASK_PREFIX}${weekStart}-${pointKey}`;
  const taskKey = `${weekPlanId}:${taskId}`;
  const marker = changedNoteMarker(point);
  const currentNote = typeof input.existingWhatChangedNote === "string" ? input.existingWhatChangedNote : "";
  if (
    hasExistingTriggeredTask(input.existingTasks, taskId, taskKey) ||
    currentNote.includes(marker)
  ) return { task: null };

  if (!isObject(input.dailyLimits) || !isObject(input.dailyMinutes)) return { task: null };
  let eligibleDate: string | null = null;
  for (let dayOffset = 0; dayOffset <= 6; dayOffset += 1) {
    const date = addLocalDays(input.todayLocal, dayOffset);
    if (date > weekEnd) break;
    const cap = finiteNumber(input.dailyLimits[date]);
    const scheduled = finiteNumber(input.dailyMinutes[date]);
    if (cap !== null && scheduled !== null && cap >= 0 && scheduled >= 0 && scheduled + PRACTICE_MINUTES <= cap) {
      eligibleDate = date;
      break;
    }
  }
  if (!eligibleDate) return { task: null };

  const dailyMinutes = { ...input.dailyMinutes } as Record<string, number>;
  dailyMinutes[eligibleDate] = Number(dailyMinutes[eligibleDate]) + PRACTICE_MINUTES;
  const savedScheduledMinutes = finiteNumber(input.scheduledTaskMinutes);
  const scheduledTaskMinutes = (savedScheduledMinutes ?? Object.values(input.dailyMinutes).reduce<number>((sum, value) => sum + (finiteNumber(value) ?? 0), 0)) + PRACTICE_MINUTES;
  const savedLearningMinutes = finiteNumber(input.plannedLearningMinutes);
  const task: PremiumLanguagePointPracticeTask = {
    id: taskId,
    date: eligibleDate,
    type: "ai_lesson",
    skill,
    minutes: PRACTICE_MINUTES,
    topic: point,
    reason: "weekly_practice",
    reasonSkill: skill,
    status: "planned",
    rolloverCount: 0,
    optional: false,
  };
  const whatChangedNote = currentNote.trim()
    ? `${currentNote.trim()}\n${marker}`
    : marker;

  return {
    task,
    dailyMinutes,
    scheduledTaskMinutes,
    ...(savedLearningMinutes !== null ? { plannedLearningMinutes: savedLearningMinutes + PRACTICE_MINUTES } : {}),
    whatChangedNote,
  };
}
