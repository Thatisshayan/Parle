export {
  languagePointKey,
  planPremiumLanguagePointPractice,
} from "../../functions/parle-premium-language-point-trigger.helper.ts";
export type {
  PremiumLanguagePointPracticeInput,
  PremiumLanguagePointPracticeResult,
  PremiumLanguagePointPracticeTask,
} from "../../functions/parle-premium-language-point-trigger.helper.ts";

export const SKILL_KEYS = ["listening", "reading", "writing", "speaking"] as const;
export type SkillKey = (typeof SKILL_KEYS)[number];
export type PlannerTrack = "immigration" | "citizenship" | "general";
export type Weekday = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
export type FeasibilityStatus = "on_track" | "tight" | "unlikely" | "projected";
export type TaskType =
  | "ai_lesson"
  | "vocabulary_drill"
  | "listening_exercise"
  | "speaking_practice"
  | "speaking_check"
  | "writing"
  | "tutor_lesson"
  | "weekly_checkin";
export type TaskStatus = "planned" | "done" | "skipped" | "rolled" | "dropped" | "suggested";
export type TaskReason = "biggest_gap" | "weekly_practice" | "speaking_check" | "weekly_checkin" | "tutor_suggestion";

export type SkillValues<T> = Record<SkillKey, T>;
export type Availability = Partial<Record<Weekday, number>>;

export interface TopicMasteryFocus {
  topic: string;
  rollingScore: number;
}

export interface PlannerInput {
  track: PlannerTrack;
  current: SkillValues<number>;
  targets: SkillValues<number | null>;
  availability: Availability;
  tutorBudget: string;
  tutorWindows: string[];
  targetDate: string | null;
  today: string;
  generalGoal?: string;
  weekNumber?: number;
  speakingAssessed?: boolean;
  premiumFeaturesEnabled?: boolean;
  weaknessSkill?: SkillKey | null;
  bookedTutorHoursPerWeek?: number;
  topicMastery?: TopicMasteryFocus[];
  mistakeTopics?: string[];
  /** Skills a tutor marked "struggling" in recent lesson notes (Plan 7A): a little more time, never a level change. */
  tutorFocusSkills?: SkillKey[];
  /** Saved task rows supplied only when the existing weekly plan is being refreshed. */
  existingTasks?: PlannedTask[];
}

export interface PlanningSettingsSignatureInput {
  track: PlannerTrack;
  placementStatus: "assessed" | "unverified" | "none";
  startingLevels: SkillValues<number>;
  speakingAssessed: boolean;
  targets: SkillValues<number | null>;
  targetDate: string | null;
  availability: Availability;
  tutorBudget: string;
  tutorWindows: readonly string[];
  generalGoal: string;
  timeZone: string;
}

export interface PlannedTask {
  id: string;
  date: string | null;
  type: TaskType;
  skill: SkillKey | null;
  minutes: number;
  topic: string;
  reason: TaskReason;
  reasonSkill: SkillKey | null;
  status: TaskStatus;
  rolloverCount: number;
  optional: boolean;
  tutorWindow?: string;
  originalDate?: string;
}

export interface FeasibilityResult {
  status: FeasibilityStatus;
  requiredHours: number;
  availableHours: number;
  weeklyMinutes: number;
  weeksUntilTarget: number | null;
  minutesPerDayNeeded: number | null;
  realisticDate: string | null;
  projectedDate: string | null;
  targetDate: string | null;
  ratio: number | null;
}

export interface RoadmapMilestone {
  id: string;
  skill: SkillKey;
  fromValue: number;
  toValue: number;
  canDoText: string;
  expectedDate: string | null;
  status: "upcoming" | "reached";
}

export interface WeeklyPlan {
  track: PlannerTrack;
  today: string;
  weekStartDate: string;
  weekEndDate: string;
  planStartDate: string | null;
  weekNumber: number;
  plannerVersion: number;
  scheduleDates: string[];
  weeklyMinutes: number;
  scheduledAvailabilityMinutes: number;
  scheduledTaskMinutes: number;
  learningBudgetMinutes: number;
  allocationShare: SkillValues<number>;
  allocationMinutes: SkillValues<number>;
  plannedLearningMinutes: number;
  dailyLimits: Record<string, number>;
  dailyMinutes: Record<string, number>;
  tasks: PlannedTask[];
  tutorSuggestion: PlannedTask | null;
  biggestGapSkill: SkillKey | null;
  feasibility: FeasibilityResult;
  milestones: RoadmapMilestone[];
  whatChangedNote: string;
  premiumFeaturesEnabled: boolean;
  warnings: string[];
}

const WEEKDAYS: Weekday[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const NCLC_TO_SCORE: Record<number, number> = { 3: 1.5, 4: 2, 5: 2.5, 6: 3, 7: 3.5, 8: 4, 9: 4.5, 10: 5 };
const FULL_STEP_HOURS: Record<number, number> = { 0: 90, 1: 100, 2: 180, 3: 200, 4: 250 };
const FLOOR_SHARE = 0.1;
const DAY_CEILING_RATIO = 1.2;
const CHECKIN_MINUTES = 10;
const SPEAKING_CHECK_MINUTES = 10;
const TUTOR_SUGGESTION_MINUTES = 45;
export const PLANNER_VERSION = 4;
const DAY_MINUTES = 24 * 60 * 60 * 1000;

const BASE_TRACK_WEIGHTS: Record<PlannerTrack, SkillValues<number>> = {
  immigration: { listening: 1, reading: 1, writing: 1, speaking: 1 },
  citizenship: { listening: 1, reading: 0, writing: 0, speaking: 1 },
  general: { listening: 1.2, reading: 0.8, writing: 0.6, speaking: 1.4 },
};

const TASK_CATALOG: Record<SkillKey, Array<{ type: TaskType; min: number; max: number }>> = {
  listening: [
    { type: "listening_exercise", min: 10, max: 15 },
    { type: "vocabulary_drill", min: 10, max: 10 },
    { type: "ai_lesson", min: 15, max: 20 },
  ],
  reading: [
    { type: "vocabulary_drill", min: 10, max: 10 },
    { type: "ai_lesson", min: 15, max: 20 },
  ],
  writing: [
    { type: "writing", min: 15, max: 20 },
    { type: "vocabulary_drill", min: 10, max: 10 },
    { type: "ai_lesson", min: 15, max: 20 },
  ],
  speaking: [
    { type: "speaking_practice", min: 10, max: 15 },
    { type: "vocabulary_drill", min: 10, max: 10 },
    { type: "ai_lesson", min: 15, max: 20 },
  ],
};

export function normalizeLevelScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(5, value)) * 4) / 4;
}

/**
 * Canonical signature for saved inputs that can change the generated roadmap.
 * The current date and week number are deliberately excluded so ordinary visits reuse the same roadmap.
 */
export function planningSettingsSignature(input: PlanningSettingsSignatureInput): string {
  const startingLevels = SKILL_KEYS.map((skill) => [
    skill,
    Number.isFinite(input.startingLevels[skill]) ? normalizeLevelScore(input.startingLevels[skill]) : 0,
  ]);
  const targets = SKILL_KEYS.map((skill) => {
    const target = input.targets[skill];
    return [skill, typeof target === "number" && Number.isFinite(target) ? normalizeLevelScore(target) : null];
  });
  const availability = WEEKDAYS.map((day) => {
    const minutes = input.availability[day];
    return [day, typeof minutes === "number" && Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0];
  });
  const validWindows = Array.from(new Set(
    input.tutorWindows.filter((window) => /^(weekday|weekend)_(morning|afternoon|evening)$/.test(window)),
  ));

  return JSON.stringify([
    "planning-settings-v1",
    input.track,
    input.placementStatus,
    startingLevels,
    input.speakingAssessed,
    targets,
    input.targetDate,
    availability,
    input.tutorBudget,
    validWindows,
    input.generalGoal.trim(),
    input.timeZone,
  ]);
}

/** Combines the authenticated learner's source records with their canonical planning settings. */
export function createRoadmapPlanKey(
  profileId: string,
  placementResultId: string | null,
  settings: PlanningSettingsSignatureInput,
): string {
  const placementKey = placementResultId?.trim() || "unverified";
  return `profile:${profileId}:placement:${placementKey}:settings:${planningSettingsSignature(settings)}`;
}

export function nclcToScore(level: number): number | null {
  return NCLC_TO_SCORE[level] ?? null;
}

export function cefrToScore(level: string): number | null {
  const scores: Record<string, number> = { A0: 0, A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, "Below A1": 0 };
  return scores[level.trim().toUpperCase()] ?? (level.trim() === "Below A1" ? 0 : null);
}

export function parseTargetScore(value: number | string | null | undefined): number | null {
  if (typeof value === "number") return normalizeLevelScore(value);
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  const nclc = text.match(/NCLC\s*(\d{1,2})/i);
  if (nclc) return nclcToScore(Number(nclc[1]));
  const cefr = text.match(/(?:CEFR\s*)?(Below\s*A1|A0|A1|A2|B1|B2|C1)/i);
  if (cefr) return cefrToScore(cefr[1].replace(/\s+/g, " "));
  const numeric = Number(text);
  return Number.isFinite(numeric) ? normalizeLevelScore(numeric) : null;
}

/** Maps the continuous planning scale to the nearest approved demo-bank band, when one exists. */
export function bankLevelForScore(value: number): "A1" | "A2" | "B1" | "B2" | null {
  const score = normalizeLevelScore(value);
  if (score < 1) return null;
  if (score < 2) return "A1";
  if (score < 3) return "A2";
  if (score < 4) return "B1";
  if (score < 5) return "B2";
  return null;
}

export function getTrackWeights(track: PlannerTrack, targets: SkillValues<number | null>): SkillValues<number> {
  const weights = { ...BASE_TRACK_WEIGHTS[track] };
  if (track === "citizenship") {
    if (targets.reading !== null) weights.reading = 1;
    if (targets.writing !== null) weights.writing = 1;
  }
  return {
    listening: targets.listening === null ? 0 : weights.listening,
    reading: targets.reading === null ? 0 : weights.reading,
    writing: targets.writing === null ? 0 : weights.writing,
    speaking: targets.speaking === null ? 0 : weights.speaking,
  };
}

function activeSkills(weights: SkillValues<number>): SkillKey[] {
  return SKILL_KEYS.filter((skill) => weights[skill] > 0);
}

function normalizeShares(raw: SkillValues<number>, active: SkillKey[]): SkillValues<number> {
  const shares: SkillValues<number> = { listening: 0, reading: 0, writing: 0, speaking: 0 };
  if (!active.length) return shares;
  if (active.length === 1) {
    shares[active[0]] = 1;
    return shares;
  }

  const fixed = new Set<SkillKey>();
  while (true) {
    const fixedFloor = fixed.size * FLOOR_SHARE;
    const remaining = Math.max(0, 1 - fixedFloor);
    const flexible = active.filter((skill) => !fixed.has(skill));
    const flexibleTotal = flexible.reduce((sum, skill) => sum + Math.max(0, raw[skill]), 0);
    if (!flexible.length || flexibleTotal <= 0) {
      const evenShare = remaining / Math.max(flexible.length, 1);
      flexible.forEach((skill) => { shares[skill] = evenShare; });
      break;
    }

    const belowFloor = flexible.filter((skill) => (raw[skill] / flexibleTotal) * remaining < FLOOR_SHARE - 1e-12);
    if (!belowFloor.length) {
      fixed.forEach((skill) => { shares[skill] = FLOOR_SHARE; });
      flexible.forEach((skill) => { shares[skill] = (raw[skill] / flexibleTotal) * remaining; });
      break;
    }
    belowFloor.forEach((skill) => fixed.add(skill));
  }
  return shares;
}

export function calculateAllocationShares(input: Pick<PlannerInput, "track" | "current" | "targets" | "premiumFeaturesEnabled" | "weaknessSkill" | "tutorFocusSkills">): {
  shares: SkillValues<number>;
  weights: SkillValues<number>;
  biggestGapSkill: SkillKey | null;
} {
  const weights = getTrackWeights(input.track, input.targets);
  const active = activeSkills(weights);
  const raw: SkillValues<number> = { listening: 0, reading: 0, writing: 0, speaking: 0 };
  let biggestGapSkill: SkillKey | null = null;
  let biggestWeightedGap = 0;

  active.forEach((skill) => {
    const current = normalizeLevelScore(input.current[skill]);
    const target = input.targets[skill] ?? current;
    const gap = Math.max(0, target - current);
    raw[skill] = weights[skill] * Math.max(gap, 0.25);
    const weightedGap = gap * weights[skill];
    if (weightedGap > biggestWeightedGap) {
      biggestWeightedGap = weightedGap;
      biggestGapSkill = skill;
    }
  });

  const shares = normalizeShares(raw, active);
  if (input.premiumFeaturesEnabled && input.weaknessSkill && active.includes(input.weaknessSkill) && active.length > 1) {
    const weakSkill = input.weaknessSkill;
    const donorSkills = active.filter((skill) => skill !== weakSkill);
    const donorSurplus = donorSkills.reduce((sum, skill) => sum + Math.max(0, shares[skill] - FLOOR_SHARE), 0);
    const boost = Math.min(0.1, Math.max(0, 1 - shares[weakSkill]), donorSurplus);
    if (boost > 0 && donorSurplus > 0) {
      donorSkills.forEach((skill) => {
        const surplus = Math.max(0, shares[skill] - FLOOR_SHARE);
        shares[skill] -= boost * (surplus / donorSurplus);
      });
      shares[weakSkill] += boost;
    }
  }
  // Lesson notes (Plan 7A): up to 10 % of the week moves to the skills a tutor marked "struggling".
  const focus = [...new Set(input.tutorFocusSkills ?? [])].filter((skill) => active.includes(skill)).slice(0, 2);
  if (focus.length && active.length > focus.length) {
    const donors = active.filter((skill) => !focus.includes(skill));
    const donorSurplus = donors.reduce((total, skill) => total + Math.max(0, shares[skill] - FLOOR_SHARE), 0);
    const boost = Math.min(0.1, donorSurplus);
    if (boost > 0) {
      donors.forEach((skill) => { shares[skill] -= boost * (Math.max(0, shares[skill] - FLOOR_SHARE) / donorSurplus); });
      focus.forEach((skill) => { shares[skill] += boost / focus.length; });
    }
  }
  return { shares, weights, biggestGapSkill };
}

export function guidedHoursBetween(fromValue: number, toValue: number): number {
  let current = normalizeLevelScore(fromValue);
  const target = normalizeLevelScore(toValue);
  if (target <= current) return 0;
  let hours = 0;
  while (current < target - 1e-9) {
    const stepIndex = Math.min(4, Math.floor(current + 1e-9));
    const stepEnd = Math.min(target, stepIndex + 1);
    const portion = Math.max(0, stepEnd - current);
    hours += (FULL_STEP_HOURS[stepIndex] ?? FULL_STEP_HOURS[4]) * portion;
    current = stepEnd;
  }
  return Math.round(hours * 100) / 100;
}

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function addDays(dateString: string, days: number): string {
  const parsed = parseDate(dateString);
  if (!parsed) throw new Error(`Invalid ISO date: ${dateString}`);
  return new Date(parsed.getTime() + Math.trunc(days) * DAY_MINUTES).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  if (!fromDate || !toDate) return 0;
  return Math.round((toDate.getTime() - fromDate.getTime()) / DAY_MINUTES);
}

function weekdayForDate(dateString: string): Weekday {
  const date = parseDate(dateString);
  if (!date) throw new Error(`Invalid ISO date: ${dateString}`);
  const day = date.getUTCDay();
  return WEEKDAYS[(day + 6) % 7];
}

function mondayOfWeek(dateString: string): string {
  const day = weekdayForDate(dateString);
  const index = WEEKDAYS.indexOf(day);
  return addDays(dateString, -index);
}

function normalizedAvailability(availability: Availability): Availability {
  const result: Availability = {};
  WEEKDAYS.forEach((day) => {
    const value = availability[day];
    result[day] = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  });
  return result;
}

function weeklyMinutes(availability: Availability): number {
  return WEEKDAYS.reduce((total, day) => total + (availability[day] ?? 0), 0);
}

function availableDatesForWeek(weekStart: string, availability: Availability, notBefore?: string): string[] {
  return Array.from({ length: 7 }, (_, offset) => addDays(weekStart, offset)).filter((date) =>
    (!notBefore || date >= notBefore) && (availability[weekdayForDate(date)] ?? 0) > 0
  );
}

function availabilityDates(today: string, availability: Availability): { weekStart: string; weekEnd: string; dates: string[] } {
  let weekStart = mondayOfWeek(today);
  let dates = availableDatesForWeek(weekStart, availability, today);
  if (dates.length === 0 && weeklyMinutes(availability) > 0) {
    weekStart = addDays(weekStart, 7);
    dates = availableDatesForWeek(weekStart, availability);
  }
  return { weekStart, weekEnd: addDays(weekStart, 6), dates };
}

export function calculateFeasibility(input: Pick<PlannerInput, "track" | "current" | "targets" | "availability" | "targetDate" | "today" | "bookedTutorHoursPerWeek">): FeasibilityResult {
  const availability = normalizedAvailability(input.availability);
  const weekly = weeklyMinutes(availability);
  const weights = getTrackWeights(input.track, input.targets);
  const active = activeSkills(weights);
  const effectiveWeeklyHours = weekly / 60 + Math.max(0, input.bookedTutorHoursPerWeek ?? 0) * 1.5;
  const guidedHours = active.map((skill) => ({
    skill,
    weightedGap: Math.max(0, (input.targets[skill] ?? input.current[skill]) - input.current[skill]) * weights[skill],
    hours: guidedHoursBetween(input.current[skill], input.targets[skill] ?? input.current[skill]),
  }));
  const largest = guidedHours
    .filter((entry) => entry.weightedGap > 0)
    .sort((a, b) => b.weightedGap - a.weightedGap || b.hours - a.hours)[0];
  const requiredHours = largest?.hours ?? 0;
  const targetDate = input.targetDate && parseDate(input.targetDate) ? input.targetDate : null;
  const weeksUntilTarget = targetDate ? Math.max(0, daysBetween(input.today, targetDate) / 7) : null;
  const availableHours = weeksUntilTarget === null ? 0 : Math.round(effectiveWeeklyHours * weeksUntilTarget * 100) / 100;
  const ratio = weeksUntilTarget === null ? null : requiredHours === 0 ? 1 : availableHours / requiredHours;
  const status: FeasibilityStatus = !targetDate
    ? "projected"
    : requiredHours === 0 || (ratio ?? 0) >= 1
      ? "on_track"
      : (ratio ?? 0) >= 0.8
        ? "tight"
        : "unlikely";

  const daysPerWeek = WEEKDAYS.filter((day) => (availability[day] ?? 0) > 0).length;
  let minutesPerDayNeeded: number | null = null;
  if (status === "unlikely" && weeksUntilTarget !== null && weeksUntilTarget > 0 && daysPerWeek > 0) {
    const bookedEffectiveHours = Math.max(0, input.bookedTutorHoursPerWeek ?? 0) * 1.5;
    const remainingWeeklyHours = Math.max(0, requiredHours / weeksUntilTarget - bookedEffectiveHours);
    minutesPerDayNeeded = Math.ceil((remainingWeeklyHours * 60) / daysPerWeek);
  }

  let projectedDate: string | null = null;
  let realisticDate: string | null = null;
  if (requiredHours === 0) {
    projectedDate = input.today;
    realisticDate = input.today;
  } else if (effectiveWeeklyHours > 0) {
    const weeksRequired = requiredHours / effectiveWeeklyHours;
    const date = addDays(input.today, Math.ceil(weeksRequired * 7));
    projectedDate = date;
    realisticDate = date;
  }

  return {
    status,
    requiredHours: Math.round(requiredHours * 100) / 100,
    availableHours,
    weeklyMinutes: weekly,
    weeksUntilTarget,
    minutesPerDayNeeded,
    realisticDate: targetDate ? realisticDate : null,
    projectedDate: targetDate ? null : projectedDate,
    targetDate,
    ratio: ratio === null ? null : Math.round(ratio * 10000) / 10000,
  };
}

function roundAllocation(total: number, shares: SkillValues<number>): SkillValues<number> {
  const result: SkillValues<number> = { listening: 0, reading: 0, writing: 0, speaking: 0 };
  const activeSkills = SKILL_KEYS.filter((skill) => shares[skill] > 0);
  if (!activeSkills.length || total <= 0) return result;
  const fractions: Array<{ skill: SkillKey; fraction: number }> = [];
  let used = 0;
  activeSkills.forEach((skill) => {
    const exact = total * shares[skill];
    result[skill] = Math.floor(exact);
    used += result[skill];
    fractions.push({ skill, fraction: exact - result[skill] });
  });
  fractions.sort((a, b) => b.fraction - a.fraction || SKILL_KEYS.indexOf(a.skill) - SKILL_KEYS.indexOf(b.skill));
  for (let index = 0; index < total - used; index += 1) {
    const skill = fractions[index % Math.max(fractions.length, 1)]?.skill;
    if (skill) result[skill] += 1;
  }
  return result;
}

function topicFor(input: PlannerInput, index: number): string {
  const mastery = (input.topicMastery ?? [])
    .filter((item) => typeof item.topic === "string" && item.topic.trim() && Number.isFinite(item.rollingScore) && item.rollingScore >= 0 && item.rollingScore <= 100)
    .map((item) => ({ topic: item.topic.trim(), score: item.rollingScore }));
  const weakTopics = mastery.filter((item) => item.score < 70).sort((a, b) => a.score - b.score || a.topic.localeCompare(b.topic)).map((item) => item.topic);
  const counts = new Map<string, number>();
  (input.mistakeTopics ?? []).forEach((topic) => {
    if (typeof topic !== "string" || !topic.trim()) return;
    const value = topic.trim();
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  const mistakeFocus = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([topic]) => topic);
  const focus = [...new Set([...weakTopics, ...mistakeFocus])];
  if (focus.length) return focus[index % focus.length];
  if (input.track === "immigration") return ["work", "housing", "services", "opinions"][index % 4];
  if (input.track === "citizenship") return ["everyday_life", "community", "appointments", "personal_history"][index % 4];
  return input.generalGoal?.trim() || "general_conversation";
}

function taskReason(skill: SkillKey, biggestGapSkill: SkillKey | null): TaskReason {
  return skill === biggestGapSkill ? "biggest_gap" : "weekly_practice";
}


function createTutorSuggestion(
  input: PlannerInput,
  dates: string[],
  availableMinutes: number,
  availability: Availability,
  reservedMinutesByDate: Record<string, number>,
): PlannedTask | null {
  if (!input.tutorBudget || input.tutorBudget === "none" || availableMinutes < 90 || !input.tutorWindows.length) return null;
  const validWindows = input.tutorWindows.filter((window) => /^(weekday|weekend)_(morning|afternoon|evening)$/.test(window));
  for (const tutorWindow of validWindows) {
    const dayGroup = tutorWindow.startsWith("weekend") ? ["saturday", "sunday"] : ["monday", "tuesday", "wednesday", "thursday", "friday"];
    const matchingDate = dates.find((date) => {
      if (!dayGroup.includes(weekdayForDate(date))) return false;
      const dailyCapacity = availability[weekdayForDate(date)] ?? 0;
      const alreadyReserved = reservedMinutesByDate[date] ?? 0;
      return dailyCapacity - alreadyReserved >= TUTOR_SUGGESTION_MINUTES;
    });
    if (!matchingDate) continue;
    return {
      id: "tutor-suggestion",
      date: matchingDate,
      type: "tutor_lesson",
      skill: null,
      minutes: TUTOR_SUGGESTION_MINUTES,
      topic: "individual_feedback",
      reason: "tutor_suggestion",
      reasonSkill: null,
      status: "suggested",
      rolloverCount: 0,
      optional: true,
      tutorWindow,
      originalDate: matchingDate,
    };
  }
  return null;
}

function createCanDoText(skill: SkillKey, level: number): string {
  if (skill === "listening") {
    if (level < 2) return "Catch familiar words and key details in a short everyday exchange.";
    if (level < 3) return "Follow the main point of a clear conversation about familiar plans.";
    if (level < 4) return "Follow a connected discussion and notice why a speaker holds an opinion.";
    if (level < 5) return "Understand detailed talk about work, services, and everyday decisions.";
    return "Follow nuanced French in complex professional and social conversations.";
  }
  if (skill === "reading") {
    if (level < 2) return "Find names, dates, and familiar details in a short notice.";
    if (level < 3) return "Follow the main points in a practical message or community notice.";
    if (level < 4) return "Compare details across a longer article about a familiar subject.";
    if (level < 5) return "Identify an argument and supporting details in a range of texts.";
    return "Interpret tone and implied meaning in complex French texts.";
  }
  if (skill === "writing") {
    if (level < 2) return "Write a short note with familiar words and simple connected sentences.";
    if (level < 3) return "Write a clear message about a familiar plan or experience.";
    if (level < 4) return "Explain an opinion with reasons and examples in connected paragraphs.";
    if (level < 5) return "Write detailed, organized text for work, study, or community life.";
    return "Shape precise, well-structured writing for complex audiences and purposes.";
  }
  if (level < 2) return "Introduce yourself and answer simple questions about daily life.";
  if (level < 3) return "Describe a familiar experience and answer a follow-up question.";
  if (level < 4) return "Explain a point of view and support it with a clear example.";
  if (level < 5) return "Keep a detailed conversation going across work and community topics.";
  return "Express nuanced ideas and adapt naturally in complex conversations.";
}

function buildMilestones(input: PlannerInput, shares: SkillValues<number>, feasibility: FeasibilityResult): RoadmapMilestone[] {
  const weights = getTrackWeights(input.track, input.targets);
  const horizon = input.targetDate && parseDate(input.targetDate) ? input.targetDate : feasibility.projectedDate;
  const milestones: RoadmapMilestone[] = [];
  activeSkills(weights).forEach((skill) => {
    const current = normalizeLevelScore(input.current[skill]);
    const target = normalizeLevelScore(input.targets[skill] ?? current);
    if (target <= current) return;
    const totalSkillHours = guidedHoursBetween(current, target);
    let fromValue = current;
    let guard = 0;
    while (fromValue < target - 1e-9 && guard < 30) {
      guard += 1;
      const toValue = normalizeLevelScore(Math.min(target, fromValue + 0.5));
      const cumulativeHours = guidedHoursBetween(current, toValue);
      const proportion = totalSkillHours > 0 ? cumulativeHours / totalSkillHours : (toValue - current) / (target - current);
      const totalDays = horizon ? Math.max(0, daysBetween(input.today, horizon)) : 0;
      const expectedDate = horizon ? addDays(input.today, Math.ceil(totalDays * proportion)) : null;
      milestones.push({
        id: `${skill}-${fromValue.toFixed(2)}-${toValue.toFixed(2)}`,
        skill,
        fromValue,
        toValue,
        canDoText: createCanDoText(skill, toValue),
        expectedDate,
        status: "upcoming",
      });
      fromValue = toValue;
    }
  });
  return milestones.sort((a, b) => (a.expectedDate ?? "9999-12-31").localeCompare(b.expectedDate ?? "9999-12-31") || SKILL_KEYS.indexOf(a.skill) - SKILL_KEYS.indexOf(b.skill));
}

interface DailyTaskSlot {
  type: TaskType;
  skill: SkillKey;
  min: number;
  max: number;
}

interface DailyTaskBundle {
  tasks: Array<Omit<PlannedTask, "id" | "date">>;
  minutes: number;
  skillMinutes: SkillValues<number>;
}

type DailyPlanTask = Omit<PlannedTask, "date" | "id"> & { id?: string };

/** Keeps completed and skipped check-in history, plus at most one active scheduled review. */
function retainedTasksForWeek(tasks: PlannedTask[], weekStart: string): PlannedTask[] {
  const weekEnd = addDays(weekStart, 6);
  const byId = new Map<string, PlannedTask>();
  tasks.forEach((task) => {
    if (!task.id || task.status === "dropped" || !Number.isFinite(task.minutes) || task.minutes < 0) return;
    if (task.date && (!parseDate(task.date) || task.date < weekStart || task.date > weekEnd)) return;
    const prior = byId.get(task.id);
    if (!prior || (task.status === "done" && prior.status !== "done")) byId.set(task.id, { ...task });
  });

  const uniqueTasks = [...byId.values()];
  const checkIns = uniqueTasks
    .filter((task) => task.type === "weekly_checkin")
    .sort((a, b) => (a.date ?? "9999-12-31").localeCompare(b.date ?? "9999-12-31") || a.id.localeCompare(b.id));
  const completedCheckIns = checkIns.filter((task) => task.status === "done");
  const skippedCheckIns = checkIns.filter((task) => task.status === "skipped");
  const activeCheckIns = checkIns.filter((task) => task.status === "planned" || task.status === "rolled" || task.status === "suggested");
  const retainedCheckInIds = new Set([
    ...completedCheckIns.map((task) => task.id),
    ...skippedCheckIns.map((task) => task.id),
    ...(!completedCheckIns.length ? activeCheckIns.slice(0, 1).map((task) => task.id) : []),
  ]);

  return uniqueTasks.filter((task) => task.type !== "weekly_checkin" || retainedCheckInIds.has(task.id));
}

/** Uses the normal one-day rollover policy to make room for unfinished retained tasks. */
function redistributeRetainedTasks(
  tasks: PlannedTask[],
  dates: string[],
  dailyLimits: Record<string, number>,
  availability: Availability,
): PlannedTask[] {
  let result = tasks.map((task) => ({ ...task }));
  const capacityByDate = Object.fromEntries(dates.map((date) => [date, availability[weekdayForDate(date)] ?? 0]));

  for (const date of dates) {
    let guard = 0;
    const minutesOnDay = () => result
      .filter((task) => task.date === date && task.status !== "dropped")
      .reduce((total, task) => total + task.minutes, 0);
    while (minutesOnDay() > (dailyLimits[date] ?? 0) && guard < result.length) {
      guard += 1;
      const candidate = result
        .filter((task) => task.date === date && !task.optional && (task.status === "planned" || task.status === "rolled"))
        .sort((a, b) => Number(a.type === "weekly_checkin") - Number(b.type === "weekly_checkin") || b.minutes - a.minutes || a.id.localeCompare(b.id))[0];
      if (!candidate) break;

      const reconciliationInput = result.map((task) => ({
        ...task,
        optional: false,
        ...(task.date === date && task.id !== candidate.id && task.status !== "done" && task.status !== "dropped"
          ? { status: "suggested" as const }
          : {}),
      }));
      const reconciliation = reconcileMissedTasks(reconciliationInput, date, dates, capacityByDate);
      const reconciledCandidate = reconciliation.tasks.find((task) => task.id === candidate.id);
      if (!reconciledCandidate || (reconciledCandidate.date === candidate.date && reconciledCandidate.status === candidate.status)) break;
      result = result.map((task) => {
        if (task.id === candidate.id) return { ...reconciledCandidate, optional: task.optional };
        return task;
      });
    }
  }
  return result;
}

function canAddTaskToDay(task: Omit<PlannedTask, "id" | "date">, dayTasks: Array<Omit<PlannedTask, "id" | "date">>, dayLimit: number, dayUsed: number): boolean {
  if (dayUsed + task.minutes > dayLimit) return false;
  if (dayTasks.some((existing) => existing.type === task.type)) return false;
  const skills = new Set(dayTasks.filter((existing) => existing.skill).map((existing) => existing.skill));
  if (task.skill && !skills.has(task.skill) && skills.size >= 3) return false;
  return true;
}

/** Finds a deterministic, non-repeating set of task types that fills today's remaining minutes. */
function buildDailyPracticeBundle(input: {
  plannerInput: PlannerInput;
  activeSkills: SkillKey[];
  existingTasks: Array<Omit<PlannedTask, "id" | "date">>;
  availableMinutes: number;
  baselineMinutes: number;
  dailyLimit: number;
  targetLearningMinutes: number;
  allocationShares: SkillValues<number>;
  learningBudgetMinutes: number;
  assignedLearningMinutes: number;
  assignedSkillMinutes: SkillValues<number>;
  topicIndexes: Record<SkillKey, number>;
  biggestGapSkill: SkillKey | null;
}): DailyTaskBundle {
  const empty: DailyTaskBundle = {
    tasks: [],
    minutes: 0,
    skillMinutes: { listening: 0, reading: 0, writing: 0, speaking: 0 },
  };
  const maximumLearningMinutes = Math.max(0, input.dailyLimit - input.baselineMinutes);
  if (input.targetLearningMinutes <= 0 || maximumLearningMinutes < 10 || input.activeSkills.length === 0) return empty;

  const usedTypes = new Set(input.existingTasks.map((task) => task.type));
  const existingSkills = new Set(input.existingTasks.flatMap((task) => task.skill ? [task.skill] : []));
  const taskTypeOrder: TaskType[] = ["ai_lesson", "vocabulary_drill", "listening_exercise", "speaking_practice", "writing"];
  const slotsByType = taskTypeOrder.map((type) => ({
    type,
    slots: input.activeSkills.flatMap((skill) => {
      const template = TASK_CATALOG[skill].find((candidate) => candidate.type === type);
      return template ? [{ type, skill, min: template.min, max: template.max }] : [];
    }),
  }));
  const minimumForDay = Math.ceil(input.availableMinutes * 0.8);
  let best: DailyTaskBundle | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  const consider = (selection: DailyTaskSlot[], minimumTotal: number, maximumTotal: number) => {
    if (selection.length === 0 || minimumTotal > maximumLearningMinutes) return;
    const maxFeasible = Math.min(maximumTotal, maximumLearningMinutes);
    if (minimumTotal > maxFeasible) return;
    const minutes = Math.max(minimumTotal, Math.min(input.targetLearningMinutes, maxFeasible));
    const proposedDailyMinutes = input.baselineMinutes + minutes;
    const skillTotals: SkillValues<number> = { listening: 0, reading: 0, writing: 0, speaking: 0 };
    const taskMinutes = selection.map((slot) => slot.min);
    selection.forEach((slot) => { skillTotals[slot.skill] += slot.min; });
    let extra = minutes - minimumTotal;
    while (extra > 0) {
      const availableSlots = selection
        .map((slot, index) => ({ slot, index, remaining: slot.max - taskMinutes[index] }))
        .filter((candidate) => candidate.remaining > 0)
        .sort((a, b) => {
          const desiredFraction = input.learningBudgetMinutes > 0
            ? Math.min(1, (input.assignedLearningMinutes + minutes) / input.learningBudgetMinutes)
            : 1;
          const desiredA = input.learningBudgetMinutes * input.allocationShares[a.slot.skill] * desiredFraction;
          const desiredB = input.learningBudgetMinutes * input.allocationShares[b.slot.skill] * desiredFraction;
          const currentA = input.assignedSkillMinutes[a.slot.skill] + skillTotals[a.slot.skill];
          const currentB = input.assignedSkillMinutes[b.slot.skill] + skillTotals[b.slot.skill];
          return (desiredB - currentB) - (desiredA - currentA) || a.index - b.index;
        });
      const next = availableSlots[0];
      if (!next) break;
      const added = Math.min(extra, next.remaining);
      taskMinutes[next.index] += added;
      skillTotals[next.slot.skill] += added;
      extra -= added;
    }
    const projectedFraction = input.learningBudgetMinutes > 0
      ? Math.min(1, (input.assignedLearningMinutes + minutes) / input.learningBudgetMinutes)
      : 1;
    const allocationError = input.activeSkills.reduce((total, skill) => {
      const desired = input.learningBudgetMinutes * input.allocationShares[skill] * projectedFraction;
      const projected = input.assignedSkillMinutes[skill] + skillTotals[skill];
      const scale = Math.max(10, input.learningBudgetMinutes * input.allocationShares[skill]);
      return total + ((projected - desired) / scale) ** 2;
    }, 0);
    const fillError = Math.abs(input.availableMinutes - proposedDailyMinutes);
    const underfillPenalty = Math.max(0, minimumForDay - proposedDailyMinutes);
    const score = fillError * 1000 + underfillPenalty * 10000 + allocationError * 10 + selection.length * 0.01;
    if (score >= bestScore) return;

    const topicIndexes = { ...input.topicIndexes };
    const tasks = selection.map((slot, index): Omit<PlannedTask, "id" | "date"> => {
      const topicIndex = topicIndexes[slot.skill];
      topicIndexes[slot.skill] += 1;
      return {
        type: slot.type,
        skill: slot.skill,
        minutes: taskMinutes[index],
        topic: topicFor(input.plannerInput, topicIndex),
        reason: taskReason(slot.skill, input.biggestGapSkill),
        reasonSkill: input.biggestGapSkill,
        status: "planned",
        rolloverCount: 0,
        optional: false,
      };
    });
    let priorTasks = [...input.existingTasks];
    let priorMinutes = input.baselineMinutes;
    for (const task of tasks) {
      if (!canAddTaskToDay(task, priorTasks, input.dailyLimit, priorMinutes)) return;
      priorTasks = [...priorTasks, task];
      priorMinutes += task.minutes;
    }
    best = { tasks, minutes, skillMinutes: skillTotals };
    bestScore = score;
  };

  const visit = (index: number, selection: DailyTaskSlot[], usedSkills: Set<SkillKey>, minimumTotal: number, maximumTotal: number) => {
    if (index >= slotsByType.length) {
      consider(selection, minimumTotal, maximumTotal);
      return;
    }
    visit(index + 1, selection, usedSkills, minimumTotal, maximumTotal);
    const entry = slotsByType[index];
    if (usedTypes.has(entry.type)) return;
    for (const slot of entry.slots) {
      const nextSkills = new Set(usedSkills);
      nextSkills.add(slot.skill);
      if (nextSkills.size > 3 || existingSkills.size + [...nextSkills].filter((skill) => !existingSkills.has(skill)).length > 3) continue;
      if (minimumTotal + slot.min > maximumLearningMinutes) continue;
      visit(index + 1, [...selection, slot], nextSkills, minimumTotal + slot.min, maximumTotal + slot.max);
    }
  };

  visit(0, [], new Set<SkillKey>(), 0, 0);
  if (!best) return empty;
  best.tasks.forEach((task) => { if (task.skill) input.topicIndexes[task.skill] += 1; });
  return best;
}

export function buildWeeklyPlan(input: PlannerInput): WeeklyPlan {
  if (!parseDate(input.today)) throw new Error("Planner today must be an ISO calendar date.");
  const availability = normalizedAvailability(input.availability);
  const dates = availabilityDates(input.today, availability);
  const weekly = weeklyMinutes(availability);
  const scheduledAvailabilityMinutes = dates.dates.reduce((total, date) => total + (availability[weekdayForDate(date)] ?? 0), 0);
  const speakingAssessed = input.speakingAssessed ?? false;
  const weekNumber = input.weekNumber ?? 1;
  const { shares, weights, biggestGapSkill } = calculateAllocationShares(input);
  const eligibleForSpeakingCheck = weekNumber === 1 && !speakingAssessed && weights.speaking > 0;
  const checkinDate = dates.dates[dates.dates.length - 1] ?? null;
  const speakingCheckDate = eligibleForSpeakingCheck ? dates.dates[0] ?? null : null;
  const feasibility = calculateFeasibility(input);
  const milestones = buildMilestones(input, shares, feasibility);
  const warnings: string[] = [];

  const dailyLimits: Record<string, number> = {};
  const dailyMinutes: Record<string, number> = {};
  const dayTasksByDate: Record<string, DailyPlanTask[]> = {};
  dates.dates.forEach((date) => {
    const limit = Math.floor((availability[weekdayForDate(date)] ?? 0) * DAY_CEILING_RATIO);
    dailyLimits[date] = limit;
    dailyMinutes[date] = 0;
    dayTasksByDate[date] = [];
  });

  const retainedBeforeRedistribution = retainedTasksForWeek(input.existingTasks ?? [], dates.weekStart);
  const retainedCheckinExists = retainedBeforeRedistribution.some((task) => task.type === "weekly_checkin");
  const retainedSpeakingCheckExists = retainedBeforeRedistribution.some((task) => task.type === "speaking_check");
  const retainedTasks = redistributeRetainedTasks(retainedBeforeRedistribution, dates.dates, dailyLimits, availability);
  const retainedOutsideSchedule: PlannedTask[] = [];
  retainedTasks.forEach((task) => {
    if (task.date && dates.dates.includes(task.date) && task.status !== "dropped") {
      const { date, ...draft } = task;
      dayTasksByDate[date].push(draft);
      dailyMinutes[date] += task.minutes;
    } else {
      retainedOutsideSchedule.push({ ...task });
    }
  });
  const existingTutorSuggestion = retainedTasks.find((task) => task.type === "tutor_lesson" && task.status !== "dropped") ?? null;

  if (speakingCheckDate && !retainedSpeakingCheckExists) {
    const available = availability[weekdayForDate(speakingCheckDate)] ?? 0;
    const alreadyUsed = dailyMinutes[speakingCheckDate] ?? 0;
    if (alreadyUsed + SPEAKING_CHECK_MINUTES <= available) {
      dayTasksByDate[speakingCheckDate].push({
        type: "speaking_check",
        skill: "speaking",
        minutes: SPEAKING_CHECK_MINUTES,
        topic: topicFor(input, 0),
        reason: "speaking_check",
        reasonSkill: "speaking",
        status: "planned",
        rolloverCount: 0,
        optional: false,
      });
      dailyMinutes[speakingCheckDate] += SPEAKING_CHECK_MINUTES;
    } else {
      warnings.push("speaking_check_does_not_fit_first_available_day");
    }
  }

  if (checkinDate && !retainedCheckinExists) {
    const available = availability[weekdayForDate(checkinDate)] ?? 0;
    const alreadyUsed = dailyMinutes[checkinDate] ?? 0;
    if (alreadyUsed + CHECKIN_MINUTES <= available) {
      dayTasksByDate[checkinDate].push({
        type: "weekly_checkin",
        skill: null,
        minutes: CHECKIN_MINUTES,
        topic: "weekly_review",
        reason: "weekly_checkin",
        reasonSkill: null,
        status: "planned",
        rolloverCount: 0,
        optional: false,
      });
      dailyMinutes[checkinDate] += CHECKIN_MINUTES;
    } else if (available >= CHECKIN_MINUTES) {
      warnings.push("weekly_checkin_does_not_fit_last_available_day");
    } else {
      warnings.push("weekly_checkin_exceeds_daily_ceiling_on_last_available_day");
    }
  }

  const tutorSuggestion = existingTutorSuggestion ?? createTutorSuggestion(
    input,
    dates.dates,
    scheduledAvailabilityMinutes,
    availability,
    dailyMinutes,
  );
  if (!existingTutorSuggestion && tutorSuggestion?.date) {
    const { date, id: _id, ...scheduledTutorTask } = tutorSuggestion;
    dayTasksByDate[date]?.push(scheduledTutorTask);
    dailyMinutes[date] = (dailyMinutes[date] ?? 0) + tutorSuggestion.minutes;
  }

  const reservedMinutes = dates.dates.reduce((total, date) => total + dayTasksByDate[date]
    .filter((task) => task.type === "speaking_check" || task.type === "weekly_checkin" || task.type === "tutor_lesson")
    .reduce((dayTotal, task) => dayTotal + task.minutes, 0), 0);
  const learningBudgetMinutes = Math.max(0, scheduledAvailabilityMinutes - reservedMinutes);
  const allocationMinutes = roundAllocation(learningBudgetMinutes, shares);
  const assignedMinutes: SkillValues<number> = { listening: 0, reading: 0, writing: 0, speaking: 0 };
  const topicIndexes: Record<SkillKey, number> = { listening: 0, reading: 0, writing: 0, speaking: 0 };
  const planningSkills = SKILL_KEYS.filter((skill) => shares[skill] > 0);
  let assignedLearningMinutes = 0;
  dates.dates.forEach((date) => {
    const dayTasks = dayTasksByDate[date];
    const baselineMinutes = dailyMinutes[date] ?? 0;
    const availableMinutes = availability[weekdayForDate(date)] ?? 0;
    const bundle = buildDailyPracticeBundle({
      plannerInput: input,
      activeSkills: planningSkills,
      existingTasks: dayTasks.map(({ id: _id, ...task }) => task),
      availableMinutes,
      baselineMinutes,
      dailyLimit: dailyLimits[date] ?? 0,
      targetLearningMinutes: Math.max(0, availableMinutes - baselineMinutes),
      allocationShares: shares,
      learningBudgetMinutes,
      assignedLearningMinutes,
      assignedSkillMinutes: assignedMinutes,
      topicIndexes,
      biggestGapSkill,
    });
    dayTasks.push(...bundle.tasks);
    dailyMinutes[date] = baselineMinutes + bundle.minutes;
    SKILL_KEYS.forEach((skill) => { assignedMinutes[skill] += bundle.skillMinutes[skill]; });
    assignedLearningMinutes += bundle.minutes;
    if (dailyMinutes[date] < Math.ceil(availableMinutes * 0.8)) warnings.push(`daily_schedule_below_minimum:${date}`);
  });

  const tasks: PlannedTask[] = [...retainedOutsideSchedule];
  dates.dates.forEach((date) => {
    const ordered = [...dayTasksByDate[date]].sort((a, b) => {
      const taskOrder: Record<TaskType, number> = { speaking_check: 0, ai_lesson: 1, vocabulary_drill: 2, listening_exercise: 3, speaking_practice: 4, writing: 5, tutor_lesson: 6, weekly_checkin: 7 };
      return taskOrder[a.type] - taskOrder[b.type] || (a.id ?? "").localeCompare(b.id ?? "");
    });
    ordered.forEach((task, index) => tasks.push({
      ...task,
      date,
      id: task.id || `${date}-${task.skill ?? "all"}-${task.type}-${index + 1}`,
    }));
  });

  const scheduledTaskMinutes = tasks
    .filter((task) => task.status !== "dropped")
    .reduce((total, task) => total + task.minutes, 0);
  const plannedLearningMinutes = tasks
    .filter((task) => !task.optional && task.type !== "weekly_checkin" && task.type !== "speaking_check" && task.status !== "dropped")
    .reduce((total, task) => total + task.minutes, 0);

  const reasonSkill = biggestGapSkill;
  const note = weekNumber === 1
    ? input.speakingAssessed === false
      ? "Your first week starts from the available placement evidence, with a short speaking check because speaking has not been assessed yet."
      : "Your first week is set from your starting estimates, target, and weekly availability."
    : "Your next week is set from your latest estimates and weekly availability.";

  return {
    track: input.track,
    today: input.today,
    weekStartDate: dates.weekStart,
    weekEndDate: dates.weekEnd,
    planStartDate: dates.dates[0] ?? null,
    weekNumber,
    plannerVersion: PLANNER_VERSION,
    scheduleDates: dates.dates,
    weeklyMinutes: weekly,
    scheduledAvailabilityMinutes,
    scheduledTaskMinutes,
    learningBudgetMinutes,
    allocationShare: shares,
    allocationMinutes,
    plannedLearningMinutes,
    dailyLimits,
    dailyMinutes,
    tasks,
    tutorSuggestion,
    biggestGapSkill: reasonSkill,
    feasibility,
    milestones,
    whatChangedNote: note,
    premiumFeaturesEnabled: input.premiumFeaturesEnabled ?? false,
    warnings,
  };
}

export type CheckInComparison = "below" | "at" | "above";

export interface CheckInScoringInput {
  track: PlannerTrack;
  current: SkillValues<number>;
  targets: SkillValues<number | null>;
  listeningCorrectCount?: number | null;
  readingCorrectCount?: number | null;
  grammarCorrectCount?: number | null;
  writingScoredLevel?: number | null;
  speakingSelfRating?: CheckInComparison | null;
}

export interface CheckInScoringResult {
  values: SkillValues<number>;
  deltas: SkillValues<number>;
  comparisons: Partial<SkillValues<CheckInComparison>>;
  grammarComparison: CheckInComparison | null;
  speakingSelfRating: CheckInComparison | null;
  writingScored: boolean;
}

/** Maps exactly three approved questions to the learner-approved comparison bands. */
export function comparisonFromThreeItemScore(correctCount: number): CheckInComparison {
  if (!Number.isInteger(correctCount) || correctCount < 0 || correctCount > 3) {
    throw new RangeError("A three-item check-in score must be an integer from zero to three.");
  }
  if (correctCount <= 1) return "below";
  return correctCount === 2 ? "at" : "above";
}

/** Converts only a valid level from the existing writing scorer into the planning scale. */
export function scoredWritingLevelToScore(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const level = value.trim().toUpperCase();
  if (level !== "A1" && level !== "A2" && level !== "B1" && level !== "B2") return null;
  return cefrToScore(level);
}

/** Converts the writing service's returned level into a bounded comparison with the estimate. */
export function compareWritingLevel(current: number, scoredLevel: number | null | undefined): CheckInComparison | null {
  if (typeof scoredLevel !== "number" || !Number.isFinite(scoredLevel)) return null;
  const estimate = normalizeLevelScore(current);
  const scored = normalizeLevelScore(scoredLevel);
  return scored > estimate ? "above" : scored < estimate ? "below" : "at";
}

function applyComparison(value: number, comparison: CheckInComparison): { value: number; delta: number } {
  const before = normalizeLevelScore(value);
  const step = comparison === "above" ? 0.25 : comparison === "below" ? -0.25 : 0;
  const next = normalizeLevelScore(Math.max(0, Math.min(5, before + step)));
  return { value: next, delta: Math.round((next - before) * 100) / 100 };
}

/**
 * Applies only evidence that can update a skill estimate. Grammar is diagnostic when reading is not
 * weighted, and speaking self-ratings are retained as evidence without moving the speaking estimate.
 */
export function applyCheckInEvidence(input: CheckInScoringInput): CheckInScoringResult {
  const values = Object.fromEntries(SKILL_KEYS.map((skill) => [skill, normalizeLevelScore(input.current[skill])])) as SkillValues<number>;
  const deltas: SkillValues<number> = { listening: 0, reading: 0, writing: 0, speaking: 0 };
  const comparisons: Partial<SkillValues<CheckInComparison>> = {};
  const weights = getTrackWeights(input.track, input.targets);
  let grammarComparison: CheckInComparison | null = null;
  let writingScored = false;

  const applyForSkill = (skill: SkillKey, comparison: CheckInComparison) => {
    const next = applyComparison(values[skill], comparison);
    values[skill] = next.value;
    deltas[skill] = next.delta;
    comparisons[skill] = comparison;
  };

  if (weights.listening > 0 && typeof input.listeningCorrectCount === "number") {
    applyForSkill("listening", comparisonFromThreeItemScore(input.listeningCorrectCount));
  }
  if (weights.reading > 0 && typeof input.readingCorrectCount === "number") {
    applyForSkill("reading", comparisonFromThreeItemScore(input.readingCorrectCount));
  } else if (weights.reading === 0 && typeof input.grammarCorrectCount === "number") {
    grammarComparison = comparisonFromThreeItemScore(input.grammarCorrectCount);
  }
  if (weights.writing > 0 && typeof input.writingScoredLevel === "number" && Number.isFinite(input.writingScoredLevel)) {
    const comparison = compareWritingLevel(values.writing, input.writingScoredLevel);
    if (comparison) {
      writingScored = true;
      applyForSkill("writing", comparison);
    }
  }

  return {
    values,
    deltas,
    comparisons,
    grammarComparison,
    speakingSelfRating: input.speakingSelfRating ?? null,
    writingScored,
  };
}

/** Produces a translation-ready note descriptor from numeric, scored estimate changes only. */
export function buildCheckInChangeNote(deltas: Partial<SkillValues<number>>): { kind: "steady" | "changed"; skills: SkillKey[] } {
  const skills = SKILL_KEYS.filter((skill) => typeof deltas[skill] === "number" && deltas[skill] !== 0);
  return { kind: skills.length ? "changed" : "steady", skills };
}

/** Progress percentage from the saved starting estimate toward a skill's target, capped at 100%. */
export function calculateSkillProgressPercentage(current: number, start: number, target: number): number {
  const value = normalizeLevelScore(current);
  const initial = normalizeLevelScore(start);
  const goal = normalizeLevelScore(target);
  if (goal <= initial) return value >= goal ? 100 : 0;
  return Math.round(Math.max(0, Math.min(100, ((value - initial) / (goal - initial)) * 100)));
}

/** Weighted goal readiness for skills that have a target and a positive track weight. */
export function calculateOverallReadiness(input: {
  track: PlannerTrack;
  current: SkillValues<number>;
  starts: SkillValues<number>;
  targets: SkillValues<number | null>;
}): number | null {
  const weights = getTrackWeights(input.track, input.targets);
  const active = SKILL_KEYS.filter((skill) => weights[skill] > 0 && input.targets[skill] !== null);
  const totalWeight = active.reduce((total, skill) => total + weights[skill], 0);
  if (!totalWeight) return null;
  const weighted = active.reduce((total, skill) => {
    const target = input.targets[skill];
    if (target === null) return total;
    return total + calculateSkillProgressPercentage(input.current[skill], input.starts[skill], target) * weights[skill];
  }, 0);
  return Math.round(weighted / totalWeight);
}

export interface CompletedStudyTask {
  dateLocal: string;
  minutes: number;
  status: string;
}

export type LearnerTaskAction = "done" | "skipped";

/** Returns a safe learner-requested status change, or null when the transition is not allowed. */
export function transitionLearnerTaskStatus(
  current: TaskStatus,
  action: LearnerTaskAction,
  taskType: TaskType,
): TaskStatus | null {
  if (action === "done" && taskType === "weekly_checkin") return null;
  if (current === action) return current;
  if (current !== "planned" && current !== "rolled" && current !== "suggested") return null;
  return action;
}

export interface AnswerOptionReference {
  id: string;
}

export interface PracticeAnswerFeedback {
  correct: boolean;
  selectedOptionId: string;
  correctOptionId: string;
}

/** Confirms an answer key by stable option ID, independent of the option's displayed position. */
export function validatePracticeAnswerKey(options: readonly AnswerOptionReference[], correctOptionId: string): boolean {
  if (!correctOptionId || options.length < 2 || options.length > 4) return false;
  const ids = options.map((option) => option.id);
  return ids.every((id) => typeof id === "string" && id.trim().length > 0) &&
    new Set(ids).size === ids.length &&
    ids.filter((id) => id === correctOptionId).length === 1;
}

/** Grades a learner's selected answer against its saved option ID. Invalid choices return null. */
export function gradePracticeAnswer(
  options: readonly AnswerOptionReference[],
  correctOptionId: string,
  selectedOptionId: string | null | undefined,
): PracticeAnswerFeedback | null {
  if (!selectedOptionId || !validatePracticeAnswerKey(options, correctOptionId) || !options.some((option) => option.id === selectedOptionId)) return null;
  return { correct: selectedOptionId === correctOptionId, selectedOptionId, correctOptionId };
}

/** Groups completed task minutes by learner-local Monday; planned and skipped work is excluded. */
export function aggregateCompletedMinutesByWeek(tasks: CompletedStudyTask[]): Record<string, number> {
  const totals: Record<string, number> = {};
  tasks.forEach((task) => {
    if (task.status !== "done" || !parseDate(task.dateLocal) || !Number.isFinite(task.minutes) || task.minutes <= 0) return;
    const weekStart = mondayOfWeek(task.dateLocal);
    totals[weekStart] = (totals[weekStart] ?? 0) + Math.floor(task.minutes);
  });
  return totals;
}

/** Counts consecutive study dates ending today, or yesterday when today has not been logged yet. */
export function calculateStudyStreak(completedDates: string[], today: string): number {
  if (!parseDate(today)) return 0;
  const dates = new Set(completedDates.filter((date) => parseDate(date) !== null));
  let cursor = dates.has(today) ? today : addDays(today, -1);
  if (!dates.has(cursor)) return 0;
  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Derives weekly minutes and a streak from completed tasks only. */
export function calculateCompletedStudyProgress(tasks: CompletedStudyTask[], today: string): {
  completedMinutesByWeek: Record<string, number>;
  streak: number;
} {
  const completedTasks = tasks.filter((task) => task.status === "done");
  return {
    completedMinutesByWeek: aggregateCompletedMinutesByWeek(completedTasks),
    streak: calculateStudyStreak(completedTasks.map((task) => task.dateLocal), today),
  };
}

/** Above-estimate evidence raises a supported skill; speaking is intentionally never score-updated. */
export function applyCheckInUpdates(current: Partial<SkillValues<number>>, comparison: Partial<SkillValues<CheckInComparison>>): {
  values: Partial<SkillValues<number>>;
  deltas: Partial<SkillValues<number>>;
} {
  const values: Partial<SkillValues<number>> = {};
  const deltas: Partial<SkillValues<number>> = {};
  SKILL_KEYS.filter((skill) => skill !== "speaking").forEach((skill) => {
    const value = current[skill];
    const result = comparison[skill];
    if (typeof value !== "number" || !result) return;
    const next = applyComparison(value, result);
    values[skill] = next.value;
    deltas[skill] = next.delta;
  });
  if (typeof current.speaking === "number") {
    values.speaking = normalizeLevelScore(current.speaking);
    deltas.speaking = 0;
  }
  return { values, deltas };
}

export interface RolloverResult {
  tasks: PlannedTask[];
  rolledTaskIds: string[];
  droppedTaskIds: string[];
  dailyMinutes: Record<string, number>;
  dailyLimits: Record<string, number>;
}

export function reconcileMissedTasks(
  tasks: PlannedTask[],
  missedDate: string,
  availableDates: string[],
  availabilityMinutesByDate: Record<string, number>,
): RolloverResult {
  const nextTasks = tasks.map((task) => ({ ...task }));
  const rolledTaskIds: string[] = [];
  const droppedTaskIds: string[] = [];
  const dates = [...new Set(availableDates)].sort();
  const dailyLimits: Record<string, number> = {};
  const dailyMinutes: Record<string, number> = {};
  dates.forEach((date) => {
    const available = Math.max(0, availabilityMinutesByDate[date] ?? 0);
    dailyLimits[date] = Math.floor(available * DAY_CEILING_RATIO);
    dailyMinutes[date] = nextTasks
      .filter((task) => task.date === date && !task.optional && task.status !== "dropped")
      .reduce((total, task) => total + task.minutes, 0);
  });

  const missed = nextTasks.filter((task) =>
    task.date === missedDate && !task.optional && task.status !== "done" && task.status !== "dropped" && task.status !== "suggested"
  );
  for (const task of missed) {
    if (task.rolloverCount >= 1) {
      task.status = "dropped";
      droppedTaskIds.push(task.id);
      dailyMinutes[missedDate] = Math.max(0, (dailyMinutes[missedDate] ?? 0) - task.minutes);
      continue;
    }
    const nextDate = dates.find((date) => date > missedDate);
    const canMove = Boolean(nextDate) &&
      (dailyMinutes[nextDate!] ?? 0) + task.minutes <= (dailyLimits[nextDate!] ?? 0) &&
      !nextTasks.some((existing) => existing.id !== task.id && existing.date === nextDate && existing.status !== "dropped" && existing.type === task.type) &&
      (!task.skill || new Set(nextTasks.filter((existing) => existing.date === nextDate && existing.status !== "dropped" && existing.skill).map((existing) => existing.skill)).has(task.skill) ||
        new Set(nextTasks.filter((existing) => existing.date === nextDate && existing.status !== "dropped" && existing.skill).map((existing) => existing.skill)).size < 3);
    if (canMove && nextDate) {
      task.originalDate = task.originalDate ?? missedDate;
      task.date = nextDate;
      task.status = "rolled";
      task.rolloverCount += 1;
      dailyMinutes[missedDate] = Math.max(0, (dailyMinutes[missedDate] ?? 0) - task.minutes);
      dailyMinutes[nextDate] = (dailyMinutes[nextDate] ?? 0) + task.minutes;
      rolledTaskIds.push(task.id);
    } else {
      task.status = "dropped";
      droppedTaskIds.push(task.id);
      dailyMinutes[missedDate] = Math.max(0, (dailyMinutes[missedDate] ?? 0) - task.minutes);
    }
  }

  return { tasks: nextTasks, rolledTaskIds, droppedTaskIds, dailyMinutes, dailyLimits };
}
