import { SKIPPED_AUDIO } from "./listening-audio";
import {
  learner_profile,
  placement_result,
  skill_estimate,
  roadmap,
  milestone,
  week_plan,
  learner_task,
  question_item,
  prompt_item,
  app_setting,
  checkin,
  practice_report,
  mistake_log,
  topic_mastery,
  User,
} from "@/entities";
import { parleAssessmentService } from "@/functions";
import { t, type TranslationKey } from "@/lib/i18n";
import { learnerLocalDateFromUtcTimestamp } from "@/lib/learner-display";
import {
  addDays,
  applyCheckInEvidence,
  bankLevelForScore,
  buildCheckInChangeNote,
  buildWeeklyPlan,
  calculateCompletedStudyProgress,
  calculateFeasibility,
  calculateOverallReadiness,
  calculateSkillProgressPercentage,
  createRoadmapPlanKey,
  getTrackWeights,
  cefrToScore,
  normalizeLevelScore,
  parseTargetScore,
  PLANNER_VERSION,
  reconcileMissedTasks,
  scoredWritingLevelToScore,
  transitionLearnerTaskStatus,
  validatePracticeAnswerKey,
  type CheckInComparison,
  type FeasibilityResult,
  type PlannerInput,
  type PlannedTask,
  type PlannerTrack,
  type SkillKey,
  type SkillValues,
  type TaskReason,
  type TaskStatus,
  type TaskType,
  type Weekday,
  type WeeklyPlan,
  type TopicMasteryFocus,
} from "@/lib/roadmap-engine";
import {
  KNOWN_DEFECTIVE_QUESTION_CODES,
  QUESTION_BANK_AUDIT_VERSION,
  isQuestionItemReady,
  normalizeQuestionItem,
  BANK_SOURCE_KEY,
  bankFilter,
  bankSourceFrom,
  readAllRows,
  selectApprovedQuestionItems,
  type BankSource,
  type BankLevel,
  type QuestionItem,
  type QuestionOption,
} from "@/lib/placement-test";
import { browserTimeZone, isValidIanaTimeZone, type ParleUser } from "@/lib/parle-profile";

const SKILLS: SkillKey[] = ["listening", "reading", "writing", "speaking"];
const WEEKDAYS: Weekday[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const TRACKS = new Set<PlannerTrack>(["immigration", "citizenship", "general"]);
const TASK_TYPES = new Set<TaskType>([
  "ai_lesson",
  "vocabulary_drill",
  "listening_exercise",
  "speaking_practice",
  "speaking_check",
  "writing",
  "tutor_lesson",
  "weekly_checkin",
]);

interface EntityRecord extends Record<string, unknown> {
  id?: string;
  created_at?: string;
  created_by?: string;
  skill?: unknown;
  value?: unknown;
  source?: unknown;
}

type LearnerPlanEntity = {
  filter(filters: Record<string, unknown>, sort?: string, limit?: number, skip?: number): Promise<EntityRecord[]>;
  create(record: Record<string, unknown>): Promise<EntityRecord>;
  update(id: string, record: Record<string, unknown>): Promise<EntityRecord>;
  updateWhere(id: string, record: Record<string, unknown>, filters: Record<string, unknown>): Promise<EntityRecord | null>;
  bulkCreate(records: Array<Record<string, unknown>>): Promise<EntityRecord[]>;
  delete(id: string): Promise<void>;
};

interface LearnerProfileRecord extends EntityRecord {
  user_id?: string;
  track?: string;
  main_goal?: string;
  other_goal_text?: string;
  target_per_skill?: unknown;
  target_date?: string;
  no_deadline?: boolean;
  availability?: unknown;
  tutor_windows?: unknown;
  tutor_budget_band?: string;
  self_assessed_level?: string;
  time_zone?: string;
}

interface PlacementRecord extends EntityRecord {
  user_id?: string;
  taken_at?: string;
  status?: string;
  level_per_skill?: unknown;
  skill_state_per_skill?: unknown;
  speaking_assessed?: boolean;
  self_assessed_level?: string;
}

interface StoredTaskRecord extends EntityRecord {
  user_id?: string;
  week_plan_id?: string;
  roadmap_id?: string;
  task_key?: string;
  date_local?: string;
  scheduled_at_utc?: string;
  type?: string;
  skill?: string;
  minutes?: number;
  topic?: string;
  reason?: string;
  reason_skill?: string;
  status?: string;
  rollover_count?: number;
  optional?: boolean;
  tutor_window?: string;
  content_json?: string;
  content_source?: string;
  source_ref?: string;
  completed_at_utc?: string;
  original_date_local?: string;
}

export interface PracticeCheckInItem {
  kind: string;
  demo_code: string;
  text: string;
  prompt?: string;
  options?: QuestionOption[];
  answer_option_id?: string;
  explanation?: string;
}

export interface PracticeAnswerOption {
  id: string;
  text: string;
}

export interface PracticeQuestion {
  prompt: string;
  options: PracticeAnswerOption[];
  answerOptionId: string;
  explanation?: string;
}

export interface PracticeContent extends Record<string, unknown> {
  title?: string;
  instructions?: string;
  text?: string;
  vocabulary?: Array<{ term: string; meaning: string; example: string }>;
  questions?: PracticeQuestion[];
  steps?: string[];
  items?: PracticeCheckInItem[];
}

export interface LearnerTaskView {
  id: string;
  taskKey: string;
  dateLocal: string;
  scheduledAtUtc: string;
  completedAtUtc: string;
  type: TaskType;
  skill: SkillKey | null;
  minutes: number;
  topic: string;
  reason: TaskReason;
  reasonSkill: SkillKey | null;
  status: TaskStatus;
  rolloverCount: number;
  optional: boolean;
  tutorWindow: string;
  contentSource: "generated" | "approved_bank" | "plan_only" | "unavailable" | "suggestion" | "pending";
  sourceRef: string;
  content: PracticeContent;
}

export interface LearnerTaskMinuteView {
  id: string;
  status: string;
  minutes: number;
  completedAtUtc: string | null;
}

export interface LearnerPlanView {
  userId: string;
  profileId: string;
  roadmapId: string;
  weekPlanId: string;
  track: PlannerTrack;
  goalLabel: string;
  today: string;
  timeZone: string;
  sourceLabel: string;
  hasScoredAssessment: boolean;
  speakingAssessed: boolean;
  current: SkillValues<number>;
  targets: SkillValues<number | null>;
  feasibility: FeasibilityResult;
  weekStart: string;
  weekEnd: string;
  planStartDate: string | null;
  weekNumber: number;
  totalMinutes: number;
  allocationShare: SkillValues<number>;
  allocationMinutes: SkillValues<number>;
  dailyMinutes: Record<string, number>;
  whatChangedNote: string | null;
  tutorFocusSkills: SkillKey[];
  startValues: SkillValues<number>;
  skillStates: Record<SkillKey, string>;
  tasks: LearnerTaskView[];
  taskHistory?: LearnerTaskMinuteView[];
}

export interface CheckInQuestionView {
  id: string;
  demoCode: string;
  kind: "listening" | "reading" | "grammar";
  text: string;
  prompt: string;
  options: QuestionOption[];
  answerOptionId: string;
  explanation: string;
  /** Plan 13: a listening question's prepared audio (set by the server; the transcript is never sent). */
  audioUrl?: string;
}

export interface CheckInPromptView {
  demoCode: string;
  cefrLevel: BankLevel;
  text: string;
}

export interface LearnerCheckInRecord extends EntityRecord {
  user_id?: string;
  profile_id?: string;
  roadmap_id?: string;
  week_plan_id?: string;
  checkin_key?: string;
  track?: string;
  date_local?: string;
  week_start_local?: string;
  listening_correct_count?: number;
  listening_total_count?: number;
  listening_comparison?: string;
  reading_correct_count?: number;
  reading_total_count?: number;
  reading_comparison?: string;
  grammar_correct_count?: number;
  grammar_total_count?: number;
  grammar_comparison?: string;
  grammar_evidence_only?: boolean;
  writing_status?: string;
  writing_scored_level?: string;
  writing_comparison?: string;
  speaking_self_rating?: string;
  speaking_self_rating_label?: string;
  before_values_json?: string;
  after_values_json?: string;
  deltas_json?: string;
  comparisons_json?: string;
  what_changed_note?: string;
  status?: string;
}

export interface LearnerCheckInSession {
  plan: LearnerPlanView;
  notDue: boolean;
  dueDate: string | null;
  questions: CheckInQuestionView[];
  readingWeighted: boolean;
  speakingPrompt: CheckInPromptView | null;
  writingPrompt: CheckInPromptView | null;
  existing: LearnerCheckInRecord | null;
}

export interface LearnerCheckInResult {
  record: LearnerCheckInRecord;
  note: string;
  values: SkillValues<number>;
  deltas: SkillValues<number>;
  writingScored: boolean;
  alreadySubmitted: boolean;
  nextPlan: LearnerPlanView;
}

export interface LearnerRoadmapData {
  plan: LearnerPlanView;
  milestones: Array<{
    id: string;
    skill: SkillKey;
    fromValue: number;
    toValue: number;
    canDoText: string;
    expectedDate: string;
    status: "upcoming" | "reached";
  }>;
}

export interface LearnerTaskActivity {
  id: string;
  dateLocal: string;
  type: TaskType;
  minutes: number;
  status: "done" | "skipped";
}

export interface LearnerProgressData {
  plan: LearnerPlanView;
  starts: SkillValues<number>;
  states: Record<SkillKey, string>;
  history: LearnerCheckInRecord[];
  trend: Array<{ date: string; values: SkillValues<number> }>;
  startedOn: string;
  skillProgress: SkillValues<number | null>;
  readiness: number | null;
  completedMinutesByWeek: Record<string, number>;
  streak: number;
  taskActivity: LearnerTaskActivity[];
  learnerName: string | null;
  earliestPlacementDate: string | null;
}

interface PreparedContent {
  content: PracticeContent;
  source: "generated" | "approved_bank" | "plan_only" | "unavailable" | "suggestion" | "pending";
  sourceRef: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return isObject(value) || Array.isArray(value) ? value as T : fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function recordsFromResponse<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];
  if (isObject(response) && Array.isArray(response.data)) return response.data as T[];
  throw new Error("The saved learner plan could not be read.");
}

async function ownerRows<T extends EntityRecord>(entity: LearnerPlanEntity, filters: Record<string, unknown>, sort = "-created_at", limit = 100): Promise<T[]> {
  return recordsFromResponse<T>(await entity.filter(filters, sort, limit));
}

/** Keeps only rows that match both signed-in account identifiers. */
export function filterLearnerRowsByOwner<T extends { user_id?: string; created_by?: string }>(
  rows: readonly T[],
  owner: { id: string; email: string },
): T[] {
  return rows.filter((row) => row.user_id === owner.id && row.created_by === owner.email);
}

type PlacementDateRow = {
  user_id?: string;
  created_by?: string;
  status?: string;
  taken_at?: string;
  created_at?: string;
};

function placementDateCandidate(row: PlacementDateRow, timeZone: string): { timestamp: number; localDate: string } | null {
  if (row.status !== "assessed" && row.status !== "unverified") return null;
  const safeTimeZone = isValidIanaTimeZone(timeZone) ? timeZone : "UTC";
  for (const value of [row.taken_at, row.created_at]) {
    if (typeof value !== "string" || !value.trim()) continue;
    if (validIsoDate(value)) return { timestamp: Date.parse(`${value}T12:00:00.000Z`), localDate: value };
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) continue;
    const localDate = learnerLocalDateFromUtcTimestamp(value, safeTimeZone) ?? localDateInZone(new Date(timestamp), safeTimeZone);
    if (validIsoDate(localDate)) return { timestamp, localDate };
  }
  return null;
}

/** Returns the earliest saved placement date for the specified learner in their local calendar. */
export function earliestOwnedPlacementDate(
  rows: readonly PlacementDateRow[],
  owner: { id: string; email: string },
  timeZone: string,
): string | null {
  return filterLearnerRowsByOwner(rows, owner)
    .map((row) => placementDateCandidate(row, timeZone))
    .filter((candidate): candidate is { timestamp: number; localDate: string } => candidate !== null)
    .sort((left, right) => left.timestamp - right.timestamp)[0]?.localDate ?? null;
}

function validIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function localDateInZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function mondayOfLocalWeek(value: string): string {
  if (!validIsoDate(value)) throw new Error("A local plan date must be an ISO calendar date.");
  const weekdayIndex = (new Date(`${value}T12:00:00.000Z`).getUTCDay() + 6) % 7;
  return addDays(value, -weekdayIndex);
}

/** Converts a learner-local noon to UTC so date-only tasks remain on the intended local day. */
function localNoonAsUtc(localDate: string, timeZone: string): string {
  if (!validIsoDate(localDate)) return "";
  const [year, month, day] = localDate.split("-").map(Number);
  const targetWallTime = Date.UTC(year, month - 1, day, 12, 0, 0);
  let candidate = targetWallTime;
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
  return new Date(candidate).toISOString();
}

function safeTrack(value: unknown): PlannerTrack {
  return typeof value === "string" && TRACKS.has(value as PlannerTrack) ? value as PlannerTrack : "general";
}

function scoreFromLevel(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return normalizeLevelScore(value);
  if (typeof value === "string") return cefrToScore(value) ?? parseTargetScore(value);
  return null;
}

function targetFromValue(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  return parseTargetScore(value);
}

function getProfileTargets(profile: LearnerProfileRecord): SkillValues<number | null> {
  const raw = parseJson<Record<string, unknown>>(profile.target_per_skill, {});
  const keyBySkill: Record<SkillKey, string> = { listening: "L", reading: "R", writing: "W", speaking: "S" };
  return Object.fromEntries(SKILLS.map((skill) => [skill, targetFromValue(raw[keyBySkill[skill]])])) as SkillValues<number | null>;
}

function getProfileAvailability(profile: LearnerProfileRecord): Partial<Record<Weekday, number>> {
  const raw = parseJson<Record<string, unknown>>(profile.availability, {});
  const availability: Partial<Record<Weekday, number>> = {};
  WEEKDAYS.forEach((day) => {
    const value = raw[day];
    availability[day] = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  });
  return availability;
}

function parseEstimateSource(
  profile: LearnerProfileRecord,
  placement: PlacementRecord | null,
): { current: SkillValues<number>; sourceBySkill: Record<SkillKey, string>; stateBySkill: Record<SkillKey, string>; speakingAssessed: boolean } {
  const selfLevel = scoreFromLevel(profile.self_assessed_level) ?? 0;
  const placementLevels = parseJson<Record<string, unknown>>(placement?.level_per_skill, {});
  const placementStates = parseJson<Record<string, unknown>>(placement?.skill_state_per_skill, {});
  const keyBySkill: Record<SkillKey, string> = { listening: "L", reading: "R", writing: "W", speaking: "S" };
  const current: SkillValues<number> = { listening: selfLevel, reading: selfLevel, writing: selfLevel, speaking: selfLevel };
  const sourceBySkill = {} as Record<SkillKey, string>;
  const stateBySkill = {} as Record<SkillKey, string>;
  const isVerifiedPlacement = placement?.status === "assessed";

  SKILLS.forEach((skill) => {
    const key = keyBySkill[skill];
    const placementScore = isVerifiedPlacement ? scoreFromLevel(placementLevels[key]) : null;
    if (placementScore !== null) {
      current[skill] = placementScore;
      sourceBySkill[skill] = "placement";
    } else {
      current[skill] = selfLevel;
      sourceBySkill[skill] = isVerifiedPlacement ? "self_assessment_fallback" : "self_assessment";
    }
    const state = placementStates[key];
    const validStates = new Set(["assessed", "transcript_only", "optional", "not_assessed"]);
    stateBySkill[skill] = isVerifiedPlacement
      ? typeof state === "string" && validStates.has(state) ? state : placementScore === null ? "not_assessed" : "assessed"
      : "unverified";
  });

  const speakingAssessed = isVerifiedPlacement && placement?.speaking_assessed === true && stateBySkill.speaking !== "not_assessed";
  if (isVerifiedPlacement && !speakingAssessed) stateBySkill.speaking = "not_assessed";
  return { current, sourceBySkill, stateBySkill, speakingAssessed };
}

function translationForInitialNote(placement: PlacementRecord | null, speakingAssessed: boolean): string {
  if (placement?.status !== "assessed") return t("learner.today.change.unverified");
  if (!speakingAssessed) return t("learner.today.change.speaking");
  return t("learner.today.change.initial");
}

function translatedCheckInChangeNote(deltas: Partial<SkillValues<number>>): string {
  const note = buildCheckInChangeNote(deltas);
  if (note.kind === "steady") return t("learner.checkin.change.steady");
  const changes = note.skills.map((skill) =>
    t("learner.checkin.change.item")
      .replace("{skill}", t(`learner.skill.${skill}` as TranslationKey))
      .replace("{direction}", t(deltas[skill]! > 0 ? "learner.checkin.change.up" : "learner.checkin.change.down")),
  );
  return t("learner.checkin.change.moved").replace("{changes}", changes.join("; "));
}

function translatedPersistedLearnerChangeNote(value: string): string {
  const markerPrefix = "[[parle-i18n:learner.today.change.extraPractice:";
  return value.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith(markerPrefix) || !trimmed.endsWith("]]")) return line;
    try {
      const point = decodeURIComponent(trimmed.slice(markerPrefix.length, -2)).trim().slice(0, 120);
      return point ? t("learner.today.change.extraPractice", { point }) : "";
    } catch {
      return "";
    }
  }).filter((line) => line.trim()).join(" ");
}

type SavedSkillEstimateValue = { skill?: unknown; value?: unknown; source?: unknown };

/** Reads the newest owner-sorted estimate row for each skill, using the plan input only when none was saved. */
export function latestSavedSkillEstimateValues(
  rows: readonly SavedSkillEstimateValue[],
  fallback: SkillValues<number>,
): SkillValues<number> {
  const current = { ...fallback };
  const loadedSkills = new Set<SkillKey>();
  rows.forEach((row) => {
    if (typeof row.skill !== "string" || !SKILLS.includes(row.skill as SkillKey) || loadedSkills.has(row.skill as SkillKey)) return;
    if (typeof row.value !== "number" || !Number.isFinite(row.value)) return;
    current[row.skill as SkillKey] = normalizeLevelScore(row.value);
    loadedSkills.add(row.skill as SkillKey);
  });
  return current;
}

function checkInEvidenceTimestamp(record: LearnerCheckInRecord): number {
  const createdAt = typeof record.created_at === "string" ? Date.parse(record.created_at) : Number.NaN;
  if (Number.isFinite(createdAt)) return createdAt;
  const date = validIsoDate(record.date_local)
    ? record.date_local
    : validIsoDate(record.week_start_local)
      ? record.week_start_local
      : "";
  return date ? Date.parse(`${date}T12:00:00.000Z`) : 0;
}

export function latestScoredLearnerCheckIn(
  rows: readonly LearnerCheckInRecord[] | null,
): LearnerCheckInRecord | null {
  if (!rows) return null;
  return rows
    .map((record, index) => ({ record, index, timestamp: checkInEvidenceTimestamp(record) }))
    .filter(({ record }) => record.status === "submitted")
    .sort((a, b) => b.timestamp - a.timestamp || a.index - b.index)[0]?.record ?? null;
}

export function hasScoredLearnerAssessment(
  placementStatus: unknown,
  checkIns: readonly { status?: unknown }[] | null,
  estimates: readonly { source?: unknown }[] = [],
): boolean {
  return placementStatus === "assessed" ||
    Boolean(checkIns?.some((record) => record.status === "submitted")) ||
    estimates.some((record) => record.source === "checkin");
}

export function todayLevelHeadingKey(hasScoredAssessment: boolean): TranslationKey {
  return hasScoredAssessment ? "learner.today.currentLevel" : "learner.today.startingLevel";
}

/** A saved check-in requires its own readable re-plan note; it never falls back to an older plan note. */
export function selectTodayWhatChangedNote(input: {
  checkIns: readonly LearnerCheckInRecord[] | null;
  firstPlanNote: unknown;
  latestCheckInReplanNote: unknown;
}): string | null {
  if (input.checkIns === null) return null;
  const hasScoredCheckIn = latestScoredLearnerCheckIn(input.checkIns) !== null;
  const savedNote = hasScoredCheckIn ? input.latestCheckInReplanNote : input.firstPlanNote;
  if (typeof savedNote !== "string" || !savedNote.trim()) return null;
  const translated = translatedPersistedLearnerChangeNote(savedNote).trim();
  return translated || null;
}

async function readFirstPlanNote(
  user: ParleUser,
  roadmapId: string,
  knownWeeks: readonly EntityRecord[],
): Promise<unknown> {
  const savedFirstWeek = knownWeeks.find((row) => row.roadmap_id === roadmapId && row.week_number === 1);
  if (savedFirstWeek) return savedFirstWeek.what_changed_note;
  try {
    const rows = await ownerRows<EntityRecord>(week_plan, {
      created_by: user.email,
      user_id: user.id,
      roadmap_id: roadmapId,
      week_number: 1,
    }, "created_at", 10);
    return rows.find((row) => row.roadmap_id === roadmapId && row.week_number === 1)?.what_changed_note;
  } catch (error) {
    console.warn("Parle first weekly plan note could not be loaded", error instanceof Error ? error.name : "unknown");
    return undefined;
  }
}

async function readCheckInReplanNote(
  user: ParleUser,
  record: LearnerCheckInRecord,
  knownWeeks: readonly EntityRecord[],
): Promise<unknown> {
  if (typeof record.roadmap_id !== "string" || !record.roadmap_id || !validIsoDate(record.week_start_local)) return undefined;
  const replanStart = addDays(record.week_start_local, 7);
  const replanKey = `${record.roadmap_id}:${replanStart}`;
  const isReplan = (row: EntityRecord) => row.roadmap_id === record.roadmap_id && row.plan_key === replanKey;
  const knownReplan = knownWeeks.find(isReplan);
  if (knownReplan) return knownReplan.what_changed_note;
  try {
    const rows = await ownerRows<EntityRecord>(week_plan, {
      created_by: user.email,
      user_id: user.id,
      roadmap_id: record.roadmap_id,
      plan_key: replanKey,
    }, "-created_at", 10);
    return rows.find(isReplan)?.what_changed_note;
  } catch (error) {
    console.warn("Parle check-in re-plan note could not be loaded", error instanceof Error ? error.name : "unknown");
    return undefined;
  }
}

function buildPlannerInput(
  profile: LearnerProfileRecord,
  placement: PlacementRecord | null,
  timeZone: string,
  planningDate?: string,
  weekNumber = 1,
): PlannerInput {
  const { current, speakingAssessed } = parseEstimateSource(profile, placement);
  const track = safeTrack(profile.track);
  const goals = Array.isArray(profile.goals) ? profile.goals : [];
  const generalGoal = typeof profile.other_goal_text === "string" && profile.other_goal_text.trim()
    ? profile.other_goal_text.trim()
    : typeof profile.main_goal === "string" && profile.main_goal.trim()
      ? profile.main_goal.trim()
      : goals.find((goal): goal is string => typeof goal === "string") ?? "general_conversation";
  const targetDate = !profile.no_deadline && validIsoDate(profile.target_date) ? profile.target_date : null;
  const tutorWindows = Array.isArray(profile.tutor_windows)
    ? profile.tutor_windows.filter((value): value is string => typeof value === "string")
    : [];
  const budget = typeof profile.tutor_budget_band === "string" ? profile.tutor_budget_band : "none";

  return {
    track,
    current,
    targets: getProfileTargets(profile),
    availability: getProfileAvailability(profile),
    tutorBudget: budget,
    tutorWindows,
    targetDate,
    today: planningDate && validIsoDate(planningDate) ? planningDate : localDateInZone(new Date(), timeZone),
    generalGoal,
    weekNumber,
    speakingAssessed,
    premiumFeaturesEnabled: false,
    weaknessSkill: null,
    bookedTutorHoursPerWeek: 0,
  };
}

function skillEstimateRows(userId: string, roadmapId: string, profile: LearnerProfileRecord, placement: PlacementRecord | null, input: PlannerInput) {
  const source = parseEstimateSource(profile, placement);
  return SKILLS.map((skill) => ({
    user_id: userId,
    roadmap_id: roadmapId,
    skill,
    value: input.current[skill],
    start_value: input.current[skill],
    source: source.sourceBySkill[skill],
    state: source.stateBySkill[skill],
  }));
}

function isValidPlannedTask(value: unknown): value is PlannedTask {
  if (!isObject(value)) return false;
  return typeof value.id === "string" &&
    (value.date === null || validIsoDate(value.date)) &&
    typeof value.type === "string" && TASK_TYPES.has(value.type as TaskType) &&
    (value.skill === null || SKILLS.includes(value.skill as SkillKey)) &&
    typeof value.minutes === "number" && Number.isFinite(value.minutes) && value.minutes >= 0 &&
    typeof value.topic === "string" &&
    typeof value.reason === "string" &&
    typeof value.status === "string" &&
    typeof value.rolloverCount === "number" &&
    typeof value.optional === "boolean";
}

function snapshotFromPlan(plan: WeeklyPlan): Record<string, unknown> {
  return {
    plannerVersion: plan.plannerVersion,
    planStartDate: plan.planStartDate,
    scheduledTaskMinutes: plan.scheduledTaskMinutes,
    track: plan.track,
    today: plan.today,
    weekStartDate: plan.weekStartDate,
    weekEndDate: plan.weekEndDate,
    scheduleDates: plan.scheduleDates,
    weeklyMinutes: plan.weeklyMinutes,
    scheduledAvailabilityMinutes: plan.scheduledAvailabilityMinutes,
    learningBudgetMinutes: plan.learningBudgetMinutes,
    allocationShare: plan.allocationShare,
    allocationMinutes: plan.allocationMinutes,
    plannedLearningMinutes: plan.plannedLearningMinutes,
    dailyLimits: plan.dailyLimits,
    dailyMinutes: plan.dailyMinutes,
    tasks: plan.tasks,
    tutorSuggestion: plan.tutorSuggestion,
    biggestGapSkill: plan.biggestGapSkill,
    milestones: plan.milestones,
    warnings: plan.warnings,
  };
}

function tasksFromSnapshot(allocationJson: unknown, fallback: PlannedTask[]): PlannedTask[] {
  const snapshot = parseJson<Record<string, unknown>>(allocationJson, {});
  const savedTasks = Array.isArray(snapshot.tasks) ? snapshot.tasks.filter(isValidPlannedTask) : [];
  return savedTasks.length ? savedTasks : fallback;
}

function unwrapServiceResponse(response: unknown): Record<string, unknown> | null {
  if (!isObject(response)) return null;
  if (isObject(response.result) && ("status" in response.result || "content" in response.result)) return response.result;
  return response;
}

function normalizePracticeQuestion(value: unknown): PracticeQuestion | null {
  if (!isObject(value) || typeof value.prompt !== "string") return null;
  const prompt = value.prompt.trim();
  const rawOptions = Array.isArray(value.options) ? value.options : [];
  const options = rawOptions.flatMap((option) => isObject(option) && typeof option.id === "string" && typeof option.text === "string"
    ? [{ id: option.id.trim().slice(0, 120), text: option.text.trim().slice(0, 250) }]
    : []);
  const answerOptionId = typeof value.answer_option_id === "string"
    ? value.answer_option_id.trim().slice(0, 120)
    : typeof value.answerOptionId === "string"
      ? value.answerOptionId.trim().slice(0, 120)
      : "";
  if (!prompt || prompt.length > 500 || options.length !== rawOptions.length || options.some((option) => !option.id || !option.text) || !validatePracticeAnswerKey(options, answerOptionId)) return null;
  const explanation = typeof value.explanation === "string" ? value.explanation.trim().slice(0, 500) : "";
  return {
    prompt: prompt.slice(0, 500),
    options,
    answerOptionId,
    ...(explanation ? { explanation } : {}),
  };
}

function practiceContent(value: unknown): PracticeContent | null {
  if (!isObject(value)) return null;
  if (typeof value.title !== "string" || typeof value.instructions !== "string") return null;
  const content: PracticeContent = {
    title: value.title.slice(0, 140),
    instructions: value.instructions.slice(0, 1000),
    text: typeof value.text === "string" ? value.text.slice(0, 7000) : "",
    vocabulary: Array.isArray(value.vocabulary)
      ? value.vocabulary.flatMap((entry) => isObject(entry) && typeof entry.term === "string" && typeof entry.meaning === "string" && typeof entry.example === "string"
        ? [{ term: entry.term.slice(0, 100), meaning: entry.meaning.slice(0, 250), example: entry.example.slice(0, 400) }]
        : []).slice(0, 10)
      : [],
    questions: Array.isArray(value.questions)
      ? value.questions.flatMap((entry) => {
          const question = normalizePracticeQuestion(entry);
          return question ? [question] : [];
        }).slice(0, 6)
      : [],
    steps: Array.isArray(value.steps) ? value.steps.filter((step): step is string => typeof step === "string").slice(0, 8).map((step) => step.slice(0, 500)) : [],
    items: Array.isArray(value.items)
      ? value.items.flatMap((entry) => isObject(entry) && typeof entry.kind === "string" && typeof entry.demo_code === "string" && typeof entry.text === "string"
        ? [{
            kind: entry.kind,
            demo_code: entry.demo_code,
            text: entry.text,
            prompt: typeof entry.prompt === "string" ? entry.prompt.slice(0, 1800) : undefined,
            options: Array.isArray(entry.options)
              ? entry.options.flatMap((option) => isObject(option) && typeof option.id === "string" && typeof option.text === "string"
                ? [{ id: option.id.slice(0, 120), text: option.text.slice(0, 1200) }]
                : []).slice(0, 4)
              : undefined,
            answer_option_id: typeof entry.answer_option_id === "string" ? entry.answer_option_id.slice(0, 120) : undefined,
            explanation: typeof entry.explanation === "string" ? entry.explanation.slice(0, 1800) : undefined,
          }]
        : []).slice(0, 10)
      : [],
  };
  return content;
}

function hasAnswerablePracticeQuestion(content: PracticeContent | null): boolean {
  return Boolean(content?.questions?.some((question) => validatePracticeAnswerKey(question.options, question.answerOptionId)));
}

function needsTaskPracticeRefresh(task: PlannedTask, record: StoredTaskRecord): boolean {
  if (task.type !== "vocabulary_drill" && task.type !== "listening_exercise") return false;
  const saved = practiceContent(parseJson(record.content_json, {}));
  if (task.type === "listening_exercise") return !saved?.text?.trim() || !hasAnswerablePracticeQuestion(saved);
  return !saved || (!saved.vocabulary?.length && !hasAnswerablePracticeQuestion(saved));
}

function supportsTaskPractice(task: PlannedTask, content: PracticeContent): boolean {
  if (task.type === "listening_exercise") return Boolean(content.text?.trim() && hasAnswerablePracticeQuestion(content));
  if (task.type === "vocabulary_drill") return Boolean(content.vocabulary?.length || hasAnswerablePracticeQuestion(content));
  return true;
}

function checkInBankBand(score: number): "A1" | "A2" | "B1" | "B2" {
  return bankLevelForScore(score) ?? (score < 1 ? "A1" : "B2");
}

interface CheckInBankSelection {
  questions: CheckInQuestionView[];
  speakingPrompt: CheckInPromptView | null;
  writingPrompt: CheckInPromptView | null;
}

export function selectApprovedCheckInQuestionItems(rows: unknown, source: BankSource = "demo"): QuestionItem[] {
  return selectApprovedQuestionItems(rows, source)
    .filter((item) => {
      const needsAudit = (KNOWN_DEFECTIVE_QUESTION_CODES as readonly string[]).includes(item.demo_code) && item.content_audit_version !== QUESTION_BANK_AUDIT_VERSION;
      return !needsAudit;
    })
    .sort((a, b) => a.demo_code.localeCompare(b.demo_code));
}

async function loadApprovedCheckInSelection(input: Pick<PlannerInput, "track" | "current" | "targets">): Promise<CheckInBankSelection> {
  // the bank the switch names (bank readers fix, R94): demo or real, never both, read in full
  const settingRows = await ownerRows<EntityRecord>(app_setting, { key: BANK_SOURCE_KEY }, "-updated_at", 1);
  const source = bankSourceFrom(settingRows[0]?.value);
  const [questionRows, promptRows] = await Promise.all([
    readAllRows(question_item, bankFilter(source), 2000),
    readAllRows(prompt_item, bankFilter(source), 400) as Promise<EntityRecord[]>,
  ]);
  const questions = selectApprovedCheckInQuestionItems(questionRows, source);
  const prompts = promptRows
    .filter((row) => row.status === "approved" && (row.is_test_data === true) === (source === "demo") && typeof row.text === "string" && row.text.trim())
    .map((row): EntityRecord => ({ ...row, demo_code: row.demo_code || row.id }))
    .sort((a, b) => String(a.demo_code ?? "").localeCompare(String(b.demo_code ?? "")));
  const used = new Set<string>();
  const bandRank: Record<BankLevel, number> = { A1: 1, A2: 2, B1: 3, B2: 4 };
  const selectQuestions = (skill: QuestionItem["skill"], score: number, kind: CheckInQuestionView["kind"]): CheckInQuestionView[] => {
    const band = checkInBankBand(score);
    const nearestQuestions = questions
      .filter((item) => item.skill === skill && !used.has(item.id || item.demo_code))
      .sort((a, b) => {
        const distanceA = Math.abs(bandRank[a.cefr_level] - bandRank[band]);
        const distanceB = Math.abs(bandRank[b.cefr_level] - bandRank[band]);
        return distanceA - distanceB || a.demo_code.localeCompare(b.demo_code);
      });
    return nearestQuestions
      .slice(0, 3)
      .flatMap((item) => {
        const id = item.id || item.demo_code;
        if (!id || !item.answer_option_id) return [];
        used.add(id);
        return [{
          id,
          demoCode: item.demo_code,
          kind,
          text: kind === "listening" ? item.transcript || item.prompt : item.passage || "",
          prompt: item.prompt,
          options: item.options.map((option) => ({ ...option })),
          answerOptionId: item.answer_option_id,
          explanation: item.explanation,
        }];
      });
  };
  const readingWeighted = getTrackWeights(input.track, input.targets).reading > 0;
  const selectedQuestions = [
    ...selectQuestions("listening", input.current.listening, "listening"),
    ...(readingWeighted
      ? selectQuestions("reading", input.current.reading, "reading")
      : selectQuestions("grammar_vocabulary", input.current.listening, "grammar")),
  ];
  const selectPrompt = (kind: "speaking" | "writing", score: number): CheckInPromptView | null => {
    const band = checkInBankBand(score);
    const ranked = prompts
      .filter((item) => item.kind === kind && typeof item.cefr_level === "string" && item.cefr_level in bandRank)
      .sort((a, b) => {
        const distanceA = Math.abs(bandRank[a.cefr_level as BankLevel] - bandRank[band]);
        const distanceB = Math.abs(bandRank[b.cefr_level as BankLevel] - bandRank[band]);
        return distanceA - distanceB || String(a.demo_code ?? "").localeCompare(String(b.demo_code ?? ""));
      });
    const row = ranked[0];
    if (!row || typeof row.text !== "string") return null;
    return { demoCode: String(row.demo_code ?? row.id ?? ""), cefrLevel: row.cefr_level as BankLevel, text: row.text.slice(0, 1800) };
  };

  return {
    questions: selectedQuestions,
    speakingPrompt: input.targets.speaking !== null ? selectPrompt("speaking", input.current.speaking) : null,
    writingPrompt: input.targets.writing !== null ? selectPrompt("writing", input.current.writing) : null,
  };
}

async function checkInBankContent(input: Pick<PlannerInput, "track" | "current" | "targets">): Promise<PreparedContent> {
  try {
    const selection = await loadApprovedCheckInSelection(input);
    const items: PracticeCheckInItem[] = [
      ...selection.questions.map((question) => ({
        kind: question.kind,
        demo_code: question.demoCode,
        text: question.text,
        prompt: question.prompt,
        options: question.options,
        explanation: question.explanation,
      })),
      ...(selection.speakingPrompt ? [{ kind: "speaking", demo_code: selection.speakingPrompt.demoCode, text: selection.speakingPrompt.text }] : []),
      ...(selection.writingPrompt ? [{ kind: "writing", demo_code: selection.writingPrompt.demoCode, text: selection.writingPrompt.text }] : []),
    ];
    const hasBankItems = items.length > 0;
    return {
      source: hasBankItems ? "approved_bank" : "plan_only",
      sourceRef: items.map((item) => item.demo_code).join(","),
      content: {
        title: t("learner.content.checkInTitle"),
        instructions: t("learner.content.checkInInstruction"),
        text: "",
        vocabulary: [],
        questions: [],
        steps: [],
        items,
      },
    };
  } catch (error) {
    console.error("Parle weekly check-in bank content could not be loaded", error instanceof Error ? error.name : "unknown");
    return {
      source: "plan_only",
      sourceRef: "",
      content: {
        title: t("learner.content.checkInTitle"),
        instructions: t("learner.content.checkInInstruction"),
        text: "",
        vocabulary: [],
        questions: [],
        steps: [],
        items: [],
      },
    };
  }
}

/** Practice tasks whose content the AI writes (approved bank as fallback). They are saved "pending" and written after
 * Today has shown the plan, one request per task, so the first Today no longer waits for the AI (A28, D1). */
export function needsAiContent(task: { type: string; skill: string | null }): boolean {
  return task.type !== "tutor_lesson" && task.type !== "weekly_checkin" && Boolean(task.skill);
}

const PENDING_CONTENT: PreparedContent = { source: "pending", sourceRef: "", content: {} };

async function prepareTaskContent(task: PlannedTask, input: Pick<PlannerInput, "track" | "current" | "targets">, weekPlanId: string): Promise<PreparedContent> {
  if (task.type === "tutor_lesson") {
    return {
      source: "suggestion",
      sourceRef: "",
      content: {
        title: t("learner.content.tutorSuggestionTitle"),
        instructions: t("learner.content.tutorSuggestionInstruction"),
        text: "",
        vocabulary: [],
        questions: [],
        steps: [],
      },
    };
  }
  if (task.type === "weekly_checkin") return checkInBankContent(input);

  const skill = task.skill;
  if (!skill) return { source: "unavailable", sourceRef: "", content: {} };
  const levelScore = input.current[skill];
  try {
    const response = await parleAssessmentService({
      action: "generate_practice_content",
      week_plan_id: weekPlanId,
      planned_task_id: task.id,
      task_type: task.type,
      skill,
      level_score: levelScore,
      track: input.track,
      topic: task.topic,
    });
    const payload = unwrapServiceResponse(response);
    const generated = payload?.status === "complete" ? practiceContent(payload.content) : null;
    if (generated && generated.title && generated.instructions && supportsTaskPractice(task, generated)) {
      return { source: "generated", sourceRef: "", content: generated };
    }
    throw new Error("Practice content could not be confirmed.");
  } catch (error) {
    console.error("Parle practice content generation failed; assessment-bank content is not used for practice", error);
    return { source: "unavailable", sourceRef: "", content: {} };
  }
}

async function ensureRows(entity: LearnerPlanEntity, records: Array<Record<string, unknown>>) {
  if (records.length === 0) return;
  await entity.bulkCreate(records);
}

function isContentSource(value: unknown): LearnerTaskView["contentSource"] {
  return value === "generated" || value === "approved_bank" || value === "plan_only" || value === "unavailable" || value === "suggestion" || value === "pending"
    ? value
    : "unavailable";
}

function taskFromRecord(record: StoredTaskRecord): LearnerTaskView | null {
  if (typeof record.id !== "string" || typeof record.type !== "string" || !TASK_TYPES.has(record.type as TaskType)) return null;
  const skill = typeof record.skill === "string" && SKILLS.includes(record.skill as SkillKey) ? record.skill as SkillKey : null;
  const reasonValues = new Set<TaskReason>(["biggest_gap", "weekly_practice", "speaking_check", "weekly_checkin", "tutor_suggestion"]);
  const statusValues = new Set<TaskStatus>(["planned", "done", "skipped", "rolled", "dropped", "suggested"]);
  const reason = typeof record.reason === "string" && reasonValues.has(record.reason as TaskReason) ? record.reason as TaskReason : "weekly_practice";
  const status = typeof record.status === "string" && statusValues.has(record.status as TaskStatus) ? record.status as TaskStatus : "planned";
  const content = practiceContent(parseJson(record.content_json, {})) ?? {};
  return {
    id: record.id,
    taskKey: typeof record.task_key === "string" ? record.task_key : record.id,
    dateLocal: typeof record.date_local === "string" ? record.date_local : "",
    scheduledAtUtc: typeof record.scheduled_at_utc === "string" ? record.scheduled_at_utc : "",
    completedAtUtc: typeof record.completed_at_utc === "string" ? record.completed_at_utc : "",
    type: record.type as TaskType,
    skill,
    minutes: typeof record.minutes === "number" && Number.isFinite(record.minutes) ? record.minutes : 0,
    topic: typeof record.topic === "string" ? record.topic : "",
    reason,
    reasonSkill: typeof record.reason_skill === "string" && SKILLS.includes(record.reason_skill as SkillKey) ? record.reason_skill as SkillKey : null,
    status,
    rolloverCount: typeof record.rollover_count === "number" ? record.rollover_count : 0,
    optional: record.optional === true,
    tutorWindow: typeof record.tutor_window === "string" ? record.tutor_window : "",
    contentSource: isContentSource(record.content_source),
    sourceRef: typeof record.source_ref === "string" ? record.source_ref : "",
    content,
  };
}

function plannedTaskFromRecord(record: StoredTaskRecord): PlannedTask | null {
  const view = taskFromRecord(record);
  if (!view) return null;
  return {
    id: view.taskKey,
    date: validIsoDate(view.dateLocal) ? view.dateLocal : null,
    type: view.type,
    skill: view.skill,
    minutes: view.minutes,
    topic: view.topic,
    reason: view.reason,
    reasonSkill: view.reasonSkill,
    status: view.status,
    rolloverCount: view.rolloverCount,
    optional: view.optional,
    tutorWindow: view.tutorWindow,
    originalDate: validIsoDate(record.original_date_local) ? record.original_date_local : undefined,
  };
}

function availableDatesInWeek(weekStart: string, availability: Partial<Record<Weekday, number>>): string[] {
  return Array.from({ length: 7 }, (_, offset) => addDays(weekStart, offset)).filter((date) => {
    const weekdayIndex = (new Date(`${date}T12:00:00.000Z`).getUTCDay() + 6) % 7;
    return (availability[WEEKDAYS[weekdayIndex]] ?? 0) > 0;
  });
}

function getPlanSnapshot(value: unknown, fallback: WeeklyPlan) {
  const stored = parseJson<Record<string, unknown>>(value, {});
  const allocationShare = isObject(stored.allocationShare) ? stored.allocationShare as SkillValues<number> : fallback.allocationShare;
  const allocationMinutes = isObject(stored.allocationMinutes) ? stored.allocationMinutes as SkillValues<number> : fallback.allocationMinutes;
  const dailyMinutes = isObject(stored.dailyMinutes) ? stored.dailyMinutes as Record<string, number> : fallback.dailyMinutes;
  const weekEndDate = validIsoDate(stored.weekEndDate) ? stored.weekEndDate : fallback.weekEndDate;
  const tasks = Array.isArray(stored.tasks) ? stored.tasks.filter(isValidPlannedTask) : fallback.tasks;
  const planStartDate = validIsoDate(stored.planStartDate) ? stored.planStartDate : stored.planStartDate === null ? null : fallback.planStartDate;
  const scheduledTaskMinutes = typeof stored.scheduledTaskMinutes === "number" && Number.isFinite(stored.scheduledTaskMinutes)
    ? stored.scheduledTaskMinutes
    : fallback.scheduledTaskMinutes;
  return { allocationShare, allocationMinutes, dailyMinutes, weekEndDate, planStartDate, scheduledTaskMinutes, tasks };
}

function feasibilityFromRoadmap(record: EntityRecord, fallback: FeasibilityResult): FeasibilityResult {
  const status = record.feasibility === "on_track" || record.feasibility === "tight" || record.feasibility === "unlikely" || record.feasibility === "projected"
    ? record.feasibility
    : fallback.status;
  const targetDate = validIsoDate(record.target_date) ? record.target_date : null;
  const realisticDate = validIsoDate(record.realistic_date) ? record.realistic_date : null;
  const projectedDate = validIsoDate(record.projected_date) ? record.projected_date : null;
  const requiredHours = typeof record.required_hours === "number" ? record.required_hours : fallback.requiredHours;
  const availableHours = typeof record.available_hours === "number" ? record.available_hours : fallback.availableHours;
  return {
    ...fallback,
    status,
    requiredHours,
    availableHours,
    minutesPerDayNeeded: typeof record.minutes_per_day_needed === "number" && record.minutes_per_day_needed > 0 ? record.minutes_per_day_needed : fallback.minutesPerDayNeeded,
    realisticDate,
    projectedDate,
    targetDate,
    ratio: targetDate && requiredHours > 0 ? Math.round((availableHours / requiredHours) * 10000) / 10000 : fallback.ratio,
  };
}

/** The plan engine's refusal for a learner without a profile; the service answers ONBOARDING_REQUIRED (R34). */
export class LearnerOnboardingRequiredError extends Error {
  readonly code = "ONBOARDING_REQUIRED";
  constructor() {
    super("Finish your learner onboarding before opening Today.");
    this.name = "LearnerOnboardingRequiredError";
  }
}

export async function getOrCreateMyLearnerPlan(options: {
  planningDate?: string;
  weekNumber?: number;
  whatChangedNote?: string;
  includeTaskHistory?: boolean;
  tutorFocusSkills?: SkillKey[];
} = {}): Promise<LearnerPlanView> {
  const user = await User.me() as ParleUser;
  if (!user?.id || !user.email) throw new Error("Sign in to view your learner plan.");

  const profiles = await ownerRows<LearnerProfileRecord>(learner_profile, { created_by: user.email }, "-created_at", 30);
  const profile = profiles.find((row) => row.user_id === user.id && typeof row.id === "string");
  if (!profile?.id || !profile.self_assessed_level) throw new LearnerOnboardingRequiredError();

  const placementRows = await ownerRows<PlacementRecord>(placement_result, { created_by: user.email, user_id: user.id }, "-created_at", 50);
  const placement = placementRows
    .filter((row) => row.user_id === user.id && (row.status === "assessed" || row.status === "unverified"))
    .sort((a, b) => Date.parse(b.taken_at || b.created_at || "") - Date.parse(a.taken_at || a.created_at || ""))[0] ?? null;

  const timeZone = typeof profile.time_zone === "string" && isValidIanaTimeZone(profile.time_zone) ? profile.time_zone : browserTimeZone();
  let topicMastery: TopicMasteryFocus[] = [];
  let mistakeTopics: string[] = [];
  try {
    const [masteryRows, mistakeRows] = await Promise.all([
      ownerRows<EntityRecord>(topic_mastery, { created_by: user.email, user_id: user.id }, "-created_at", 200),
      ownerRows<EntityRecord>(mistake_log, { created_by: user.email, user_id: user.id }, "-created_at", 50),
    ]);
    const latestByTopic = new Map<string, number>();
    masteryRows.forEach((row) => {
      if (typeof row.topic === "string" && row.topic.trim() && typeof row.rolling_score === "number" && Number.isFinite(row.rolling_score) && !latestByTopic.has(row.topic.trim())) {
        latestByTopic.set(row.topic.trim(), row.rolling_score);
      }
    });
    topicMastery = [...latestByTopic.entries()].map(([topic, rollingScore]) => ({ topic, rollingScore }));
    mistakeTopics = mistakeRows.flatMap((row) => typeof row.topic === "string" && row.topic.trim() ? [row.topic.trim()] : []).slice(0, 20);
  } catch (error) {
    console.warn("Parle roadmap could not load optional topic evidence", error instanceof Error ? error.name : "unknown");
  }
  let input: PlannerInput = {
    ...buildPlannerInput(profile, placement, timeZone, options.planningDate, options.weekNumber ?? 1),
    topicMastery,
    mistakeTopics,
    tutorFocusSkills: options.tutorFocusSkills ?? [],
  };
  let plan = buildWeeklyPlan(input);
  let feasibility = calculateFeasibility(input);
  const sourceLabel = placement?.status === "assessed" ? t("learner.plan.source.placement") : t("learner.plan.source.unverified");
  const roadmapKey = createRoadmapPlanKey(profile.id, placement?.id ?? null, {
    track: input.track,
    placementStatus: placement?.status === "assessed" ? "assessed" : placement?.status === "unverified" ? "unverified" : "none",
    startingLevels: input.current,
    speakingAssessed: input.speakingAssessed === true,
    targets: input.targets,
    targetDate: input.targetDate,
    availability: input.availability,
    tutorBudget: input.tutorBudget,
    tutorWindows: input.tutorWindows,
    generalGoal: input.generalGoal ?? "",
    timeZone,
  });
  const roadmapRows = await ownerRows<EntityRecord>(roadmap, {
    created_by: user.email,
    user_id: user.id,
    plan_key: roadmapKey,
  }, "-created_at", 10);
  let roadmapRecord = roadmapRows.find((row) => row.user_id === user.id && row.plan_key === roadmapKey);

  if (!roadmapRecord) {
    const existingRoadmaps = await ownerRows<EntityRecord>(roadmap, { created_by: user.email, user_id: user.id }, "-created_at", 100);
    const nextVersion = existingRoadmaps.reduce((max, row) => Math.max(max, typeof row.version === "number" ? row.version : 0), 0) + 1;
    await roadmap.create({
      user_id: user.id,
      profile_id: profile.id,
      placement_result_id: placement?.id ?? "",
      plan_key: roadmapKey,
      version: nextVersion,
      track: input.track,
      target_date: input.targetDate ?? "",
      time_zone: timeZone,
      source_label: sourceLabel,
      feasibility: feasibility.status,
      required_hours: feasibility.requiredHours,
      available_hours: feasibility.availableHours,
      minutes_per_day_needed: feasibility.minutesPerDayNeeded ?? 0,
      realistic_date: feasibility.realisticDate ?? "",
      projected_date: feasibility.projectedDate ?? "",
      current_levels: JSON.stringify(input.current),
      target_levels: JSON.stringify(input.targets),
    });
    const confirmedRoadmaps = await ownerRows<EntityRecord>(roadmap, {
      created_by: user.email,
      user_id: user.id,
      plan_key: roadmapKey,
    }, "-created_at", 10);
    roadmapRecord = confirmedRoadmaps.find((row) => row.user_id === user.id && row.plan_key === roadmapKey);
  }
  if (!roadmapRecord?.id) throw new Error("Your private roadmap could not be confirmed.");
  const roadmapId = roadmapRecord.id;

  const savedEstimates = await ownerRows<SavedSkillEstimateValue & EntityRecord>(skill_estimate, {
    created_by: user.email,
    user_id: user.id,
    roadmap_id: roadmapId,
  }, "-created_at", 40);
  const current = latestSavedSkillEstimateValues(savedEstimates, input.current);
  const savedSpeakingState = savedEstimates.find((row) => row.skill === "speaking")?.state;
  const speakingAssessed = typeof savedSpeakingState === "string"
    ? savedSpeakingState !== "not_assessed" && savedSpeakingState !== "unverified"
    : input.speakingAssessed;
  input = { ...input, current, speakingAssessed };

  const [savedWeeks, savedCheckIns] = await Promise.all([
    ownerRows<EntityRecord>(week_plan, {
      created_by: user.email,
      user_id: user.id,
      roadmap_id: roadmapId,
    }, "-created_at", 100),
    ownerRows<LearnerCheckInRecord>(checkin, {
      created_by: user.email,
      user_id: user.id,
      profile_id: profile.id,
    }, "-created_at", 300)
      .then((rows) => rows.filter((row) => row.user_id === user.id && row.profile_id === profile.id))
      .catch((error) => {
        console.warn("Parle Today could not read saved weekly check-ins", error instanceof Error ? error.name : "unknown");
        return null;
      }),
  ]);
  const preliminaryPlan = buildWeeklyPlan(input);
  const plannedWeekKey = `${roadmapId}:${preliminaryPlan.weekStartDate}`;
  const existingWeekForDate = savedWeeks.find((row) => row.plan_key === plannedWeekKey);
  let refreshTaskRows: StoredTaskRecord[] | null = null;
  let refreshSavedPlanTasks = false;
  if (typeof existingWeekForDate?.id === "string") {
    const savedSnapshot = parseJson<Record<string, unknown>>(existingWeekForDate.allocation_json, {});
    const savedVersion = typeof savedSnapshot.plannerVersion === "number" ? savedSnapshot.plannerVersion : 0;
    refreshSavedPlanTasks = savedVersion !== PLANNER_VERSION || Boolean(options.whatChangedNote?.trim());
    if (refreshSavedPlanTasks) {
      refreshTaskRows = await ownerRows<StoredTaskRecord>(learner_task, {
        created_by: user.email,
        user_id: user.id,
        week_plan_id: existingWeekForDate.id,
      }, "date_local", 250);
      const taskKeyPrefix = `${existingWeekForDate.id}:`;
      input = {
        ...input,
        existingTasks: refreshTaskRows.flatMap((row) => {
          const planned = plannedTaskFromRecord(row);
          if (!planned) return [];
          const id = typeof row.task_key === "string" && row.task_key.startsWith(taskKeyPrefix)
            ? row.task_key.slice(taskKeyPrefix.length)
            : planned.id;
          return [{ ...planned, id }];
        }),
      };
    }
  }
  const highestWeekNumber = savedWeeks.reduce((max, row) => Math.max(max, typeof row.week_number === "number" ? row.week_number : 0), 0);
  const previousWeekStart = addDays(preliminaryPlan.weekStartDate, -7);
  const emptyLegacyFirstWeek = !existingWeekForDate && preliminaryPlan.weekStartDate > input.today && savedWeeks.some((row) => {
    if (row.status !== "active" || row.week_number !== 1 || row.week_start_local !== previousWeekStart) return false;
    const snapshot = parseJson<Record<string, unknown>>(row.allocation_json, {});
    const savedVersion = typeof snapshot.plannerVersion === "number" ? snapshot.plannerVersion : 0;
    return savedVersion < PLANNER_VERSION && (!Array.isArray(snapshot.tasks) || snapshot.tasks.length === 0);
  });
  const resolvedWeekNumber = typeof existingWeekForDate?.week_number === "number"
    ? existingWeekForDate.week_number
    : typeof options.weekNumber === "number"
      ? Math.max(1, Math.floor(options.weekNumber))
      : emptyLegacyFirstWeek
        ? 1
        : Math.max(1, highestWeekNumber + 1);
  input = { ...input, weekNumber: resolvedWeekNumber };
  plan = buildWeeklyPlan(input);
  feasibility = calculateFeasibility(input);

  const roadmapUpdate = {
    track: input.track,
    target_date: input.targetDate ?? "",
    source_label: sourceLabel,
    feasibility: feasibility.status,
    required_hours: feasibility.requiredHours,
    available_hours: feasibility.availableHours,
    minutes_per_day_needed: feasibility.minutesPerDayNeeded ?? 0,
    realistic_date: feasibility.realisticDate ?? "",
    projected_date: feasibility.projectedDate ?? "",
    current_levels: JSON.stringify(input.current),
    target_levels: JSON.stringify(input.targets),
  };
  if (Object.entries(roadmapUpdate).some(([key, value]) => roadmapRecord?.[key] !== value)) {
    await roadmap.update(roadmapId, roadmapUpdate);
    roadmapRecord = { ...roadmapRecord, ...roadmapUpdate };
  }

  const estimateSeeds = skillEstimateRows(user.id, roadmapId, profile, placement, input);
  const existingSkillKeys = new Set(savedEstimates.map((row) => row.skill));
  const missingEstimates = estimateSeeds.filter((row) => !existingSkillKeys.has(row.skill));
  if (missingEstimates.length) await skill_estimate.bulkCreate(missingEstimates);

  const savedMilestones = await ownerRows<EntityRecord>(milestone, {
    created_by: user.email,
    user_id: user.id,
    roadmap_id: roadmapId,
  }, "-created_at", 200);
  const plannedMilestoneKeys = new Set(plan.milestones.map((entry) => entry.id));
  const savedMilestoneByKey = new Map<string, EntityRecord>();
  savedMilestones.forEach((row) => {
    if (typeof row.milestone_key === "string" && !savedMilestoneByKey.has(row.milestone_key)) savedMilestoneByKey.set(row.milestone_key, row);
  });
  const milestoneUpdates = plan.milestones.flatMap((entry) => {
    const existing = savedMilestoneByKey.get(entry.id);
    if (!existing?.id) return [];
    return [milestone.update(existing.id, {
      skill: entry.skill,
      from_value: entry.fromValue,
      to_value: entry.toValue,
      can_do_text: entry.canDoText,
      expected_date: entry.expectedDate ?? "",
      status: entry.status,
    })];
  });
  const milestoneCreates = plan.milestones
    .filter((entry) => !savedMilestoneByKey.has(entry.id))
    .map((entry) => ({
      user_id: user.id,
      roadmap_id: roadmapId,
      milestone_key: entry.id,
      skill: entry.skill,
      from_value: entry.fromValue,
      to_value: entry.toValue,
      can_do_text: entry.canDoText,
      expected_date: entry.expectedDate ?? "",
      status: entry.status,
    }));
  const staleMilestones = savedMilestones.filter((row) => typeof row.milestone_key === "string" && !plannedMilestoneKeys.has(row.milestone_key) && typeof row.id === "string");
  await Promise.all([
    ...milestoneUpdates,
    ...staleMilestones.map((row) => milestone.delete(row.id)),
  ]);
  if (milestoneCreates.length) await milestone.bulkCreate(milestoneCreates);

  const weekPlanKey = `${roadmapId}:${plan.weekStartDate}`;
  const weekRows = await ownerRows<EntityRecord>(week_plan, {
    created_by: user.email,
    user_id: user.id,
    roadmap_id: roadmapId,
    plan_key: weekPlanKey,
  }, "-created_at", 10);
  let weekRecord = weekRows.find((row) => row.user_id === user.id && row.plan_key === weekPlanKey);
  const fallbackNote = resolvedWeekNumber === 1
    ? translationForInitialNote(placement, input.speakingAssessed === true)
    : t("learner.today.change.next");
  const weekNote = options.whatChangedNote?.trim() || fallbackNote;
  if (!weekRecord) {
    await week_plan.create({
      user_id: user.id,
      roadmap_id: roadmapId,
      plan_key: weekPlanKey,
      week_start_local: plan.weekStartDate,
      week_start_utc: localNoonAsUtc(plan.weekStartDate, timeZone),
      time_zone: timeZone,
      allocation_json: JSON.stringify(snapshotFromPlan(plan)),
      total_minutes: plan.scheduledTaskMinutes,
      what_changed_note: weekNote,
      week_number: resolvedWeekNumber,
      premium_features_enabled: false,
      status: "active",
    });
    const confirmedWeeks = await ownerRows<EntityRecord>(week_plan, {
      created_by: user.email,
      user_id: user.id,
      roadmap_id: roadmapId,
      plan_key: weekPlanKey,
    }, "-created_at", 10);
    weekRecord = confirmedWeeks.find((row) => row.user_id === user.id && row.plan_key === weekPlanKey);
  } else {
    const savedSnapshot = parseJson<Record<string, unknown>>(weekRecord.allocation_json, {});
    const savedTaskMinutes = typeof savedSnapshot.scheduledTaskMinutes === "number" && Number.isFinite(savedSnapshot.scheduledTaskMinutes)
      ? savedSnapshot.scheduledTaskMinutes
      : plan.scheduledTaskMinutes;
    const weekUpdate: Record<string, unknown> = {};
    if (refreshSavedPlanTasks) {
      weekUpdate.allocation_json = JSON.stringify(snapshotFromPlan(plan));
      weekUpdate.total_minutes = plan.scheduledTaskMinutes;
    } else if (weekRecord.total_minutes !== savedTaskMinutes) {
      weekUpdate.total_minutes = savedTaskMinutes;
    }
    if (options.whatChangedNote?.trim() && weekRecord.what_changed_note !== options.whatChangedNote.trim()) {
      weekUpdate.what_changed_note = options.whatChangedNote.trim();
    }
    if (Object.keys(weekUpdate).length > 0 && weekRecord.id) {
      await week_plan.update(weekRecord.id, weekUpdate);
      weekRecord = { ...weekRecord, ...weekUpdate };
    }
  }
  if (typeof weekRecord?.id !== "string" || !weekRecord.id) throw new Error("Your weekly plan could not be confirmed.");
  if (weekRecord.status !== "active") {
    await week_plan.update(weekRecord.id, { status: "active" });
    weekRecord = { ...weekRecord, status: "active" };
  }
  const weekPlanId = weekRecord.id!;

  const existingTaskRows = await ownerRows<StoredTaskRecord>(learner_task, {
    created_by: user.email,
    user_id: user.id,
    week_plan_id: weekPlanId,
  }, "date_local", 250);
  const existingByTaskKey = new Map<string, StoredTaskRecord>();
  existingTaskRows.forEach((row) => {
    if (typeof row.task_key === "string" && !existingByTaskKey.has(row.task_key)) existingByTaskKey.set(row.task_key, row);
  });
  const storedPlanTasks = refreshSavedPlanTasks ? plan.tasks : tasksFromSnapshot(weekRecord.allocation_json, plan.tasks);
  const plannedTaskKeys = new Set(storedPlanTasks.map((task) => `${weekPlanId}:${task.id}`));
  const contentCache = new Map<string, Promise<PreparedContent>>();
  const preparedContentFor = (task: PlannedTask): Promise<PreparedContent> => {
    // AI practice is written after Today has shown the plan (prepareMyTaskContent), never inside this request (A28)
    if (needsAiContent(task)) return Promise.resolve(PENDING_CONTENT);
    const score = task.skill ? input.current[task.skill] : input.current.speaking;
    const cacheKey = `${task.type}:${task.skill ?? "all"}:${score}:${input.track}:${task.topic}`;
    let preparedPromise = contentCache.get(cacheKey);
    if (!preparedPromise) {
      preparedPromise = prepareTaskContent(task, input, weekPlanId);
      contentCache.set(cacheKey, preparedPromise);
    }
    return preparedPromise;
  };
  const taskFieldsFor = (task: PlannedTask) => ({
    date_local: task.date ?? "",
    scheduled_at_utc: task.date ? localNoonAsUtc(task.date, timeZone) : "",
    type: task.type,
    skill: task.skill ?? "",
    minutes: task.minutes,
    topic: task.topic,
    reason: task.reason,
    reason_skill: task.reasonSkill ?? "",
    status: task.status,
    rollover_count: task.rolloverCount,
    optional: task.optional,
    tutor_window: task.tutorWindow ?? "",
    original_date_local: task.originalDate ?? task.date ?? "",
  });
  const taskCreates: Array<Record<string, unknown>> = [];
  const taskUpdates: Promise<unknown>[] = [];

  for (const task of storedPlanTasks) {
    const taskKey = `${weekPlanId}:${task.id}`;
    const existing = existingByTaskKey.get(taskKey);
    if (!existing?.id) {
      const prepared = await preparedContentFor(task);
      taskCreates.push({
        user_id: user.id,
        roadmap_id: roadmapId,
        week_plan_id: weekPlanId,
        task_key: taskKey,
        ...taskFieldsFor(task),
        content_json: JSON.stringify(prepared.content),
        content_source: prepared.source,
        source_ref: prepared.sourceRef,
        completed_at_utc: "",
      });
      continue;
    }
    if (existing.status === "done" || existing.status === "skipped" || existing.status === "dropped") continue;

    const contentChanged = existing.type !== task.type ||
      (existing.skill ?? "") !== (task.skill ?? "") ||
      existing.topic !== task.topic ||
      typeof existing.content_json !== "string" ||
      existing.content_json.trim().length === 0;
    // a pending task is being prepared by the page: reopening Today must not reset it (Review Focus 1)
    // A49: a card left "unavailable" is prepared again when Today reopens, as its message promises
    const refreshContent = contentChanged || existing.content_source === "unavailable" || (existing.content_source !== "pending" && needsTaskPracticeRefresh(task, existing));
    if (!refreshSavedPlanTasks && !refreshContent) continue;

    const prepared = refreshContent ? await preparedContentFor(task) : null;
    taskUpdates.push(learner_task.update(existing.id, {
      ...(refreshSavedPlanTasks ? taskFieldsFor(task) : {}),
      ...(prepared ? {
        content_json: JSON.stringify(prepared.content),
        content_source: prepared.source,
        source_ref: prepared.sourceRef,
      } : {}),
    }));
  }

  if (refreshSavedPlanTasks) {
    existingTaskRows.forEach((row) => {
      const hasActiveStatus = row.status === "planned" || row.status === "rolled" || row.status === "suggested";
      if (row.id && hasActiveStatus &&
        (typeof row.task_key !== "string" || !plannedTaskKeys.has(row.task_key))) {
        taskUpdates.push(learner_task.update(row.id, { status: "dropped" }));
      }
    });
  }
  if (taskUpdates.length) await Promise.all(taskUpdates);
  if (taskCreates.length) await ensureRows(learner_task, taskCreates);

  const rowsBeforeRollover = await ownerRows<StoredTaskRecord>(learner_task, {
    created_by: user.email,
    user_id: user.id,
    week_plan_id: weekPlanId,
  }, "date_local", 300);
  const availableWeekDates = availableDatesInWeek(plan.weekStartDate, input.availability);
  const pastAvailableDates = availableWeekDates.filter((date) => date < input.today);
  if (pastAvailableDates.length > 0 && rowsBeforeRollover.length > 0) {
    let rolloverTasks = rowsBeforeRollover.flatMap((row) => {
      const planned = plannedTaskFromRecord(row);
      return planned ? [planned] : [];
    });
    const capacityByDate = Object.fromEntries(availableWeekDates.map((date) => {
      const weekdayIndex = (new Date(`${date}T12:00:00.000Z`).getUTCDay() + 6) % 7;
      return [date, input.availability[WEEKDAYS[weekdayIndex]] ?? 0];
    })) as Record<string, number>;
    let reconciliation: ReturnType<typeof reconcileMissedTasks> = { tasks: rolloverTasks, rolledTaskIds: [], droppedTaskIds: [], dailyMinutes: {}, dailyLimits: {} };
    for (const missedDate of pastAvailableDates) {
      reconciliation = reconcileMissedTasks(rolloverTasks, missedDate, availableWeekDates, capacityByDate);
      rolloverTasks = reconciliation.tasks;
    }
    {
      const rowsByTaskKey = new Map(rowsBeforeRollover.filter((row) => typeof row.task_key === "string").map((row) => [row.task_key!, row]));
      const rowUpdates = reconciliation.tasks.flatMap((task) => {
        const row = rowsByTaskKey.get(task.id);
        if (!row?.id) return [];
        const dateLocal = task.date ?? "";
        const rolloverCount = task.rolloverCount;
        const originalDate = task.originalDate ?? row.original_date_local ?? dateLocal;
        const changed = row.status !== task.status || row.date_local !== dateLocal || row.rollover_count !== rolloverCount || row.original_date_local !== originalDate;
        return changed ? [learner_task.update(row.id, {
          status: task.status,
          date_local: dateLocal,
          scheduled_at_utc: task.date ? localNoonAsUtc(task.date, timeZone) : "",
          rollover_count: rolloverCount,
          original_date_local: originalDate,
        })] : [];
      });
      if (rowUpdates.length > 0) {
        await Promise.all(rowUpdates);
        const storedSnapshot = parseJson<Record<string, unknown>>(weekRecord.allocation_json, {});
        const snapshotTasks = Array.isArray(storedSnapshot.tasks) ? storedSnapshot.tasks.filter(isValidPlannedTask) : [];
        const snapshotById = new Map(snapshotTasks.map((task) => [task.id, task]));
        const prefix = `${weekPlanId}:`;
        const updatedSnapshotTasks = reconciliation.tasks.flatMap((task) => {
          const localId = task.id.startsWith(prefix) ? task.id.slice(prefix.length) : task.id;
          const original = snapshotById.get(localId);
          return original ? [{ ...original, date: task.date, status: task.status, rolloverCount: task.rolloverCount, originalDate: task.originalDate }] : [];
        });
        const scheduledTaskMinutes = reconciliation.tasks
          .filter((task) => task.status !== "dropped")
          .reduce((total, task) => total + task.minutes, 0);
        const allocationJson = JSON.stringify({
          ...storedSnapshot,
          tasks: updatedSnapshotTasks,
          dailyMinutes: reconciliation.dailyMinutes,
          scheduledTaskMinutes,
        });
        await week_plan.update(weekPlanId, { allocation_json: allocationJson, total_minutes: scheduledTaskMinutes });
        weekRecord = { ...weekRecord, allocation_json: allocationJson, total_minutes: scheduledTaskMinutes };
      }
    }
  }

  const [confirmedEstimates, confirmedMilestones, confirmedWeekRows, confirmedTaskRows, taskHistoryRows] = await Promise.all([
    ownerRows<SavedSkillEstimateValue & EntityRecord>(skill_estimate, { created_by: user.email, user_id: user.id, roadmap_id: roadmapId }, "-created_at", 40),
    ownerRows<EntityRecord>(milestone, { created_by: user.email, user_id: user.id, roadmap_id: roadmapId }, "created_at", 100),
    ownerRows<EntityRecord>(week_plan, { created_by: user.email, user_id: user.id, roadmap_id: roadmapId, plan_key: weekPlanKey }, "-created_at", 10),
    ownerRows<StoredTaskRecord>(learner_task, { created_by: user.email, user_id: user.id, week_plan_id: weekPlanId }, "date_local", 250),
    options.includeTaskHistory
      ? ownerRows<StoredTaskRecord>(learner_task, { created_by: user.email, user_id: user.id }, "-date_local", 500)
      : Promise.resolve([] as StoredTaskRecord[]),
  ]);
  const confirmedWeek = confirmedWeekRows.find((row) => row.id === weekPlanId);
  if (confirmedEstimates.length < SKILLS.length || confirmedMilestones.length < plan.milestones.length || !confirmedWeek || confirmedTaskRows.length < storedPlanTasks.length) {
    throw new Error("The saved roadmap and weekly tasks could not be fully confirmed. Retry to finish saving the plan.");
  }

  const activeWeekRows = await ownerRows<EntityRecord>(week_plan, {
    created_by: user.email,
    user_id: user.id,
    status: "active",
  }, "-created_at", 100);
  if (!activeWeekRows.some((row) => row.id === weekPlanId)) {
    throw new Error("Your active weekly plan could not be confirmed.");
  }
  const replacedWeekRows = activeWeekRows.filter((row) => row.id !== weekPlanId && typeof row.id === "string");
  if (replacedWeekRows.length) {
    await Promise.all(replacedWeekRows.map((row) => week_plan.update(row.id, { status: "replaced" })));
    const remainingActiveWeeks = await ownerRows<EntityRecord>(week_plan, {
      created_by: user.email,
      user_id: user.id,
      status: "active",
    }, "-created_at", 100);
    if (remainingActiveWeeks.some((row) => row.id !== weekPlanId)) {
      throw new Error("A previous weekly plan could not be marked as replaced.");
    }
  }

  const tasks = confirmedTaskRows
    .map(taskFromRecord)
    .filter((task): task is LearnerTaskView => Boolean(task))
    .filter((task) => task.status !== "dropped")
    .sort((a, b) => a.dateLocal.localeCompare(b.dateLocal) || a.minutes - b.minutes || a.id.localeCompare(b.id));
  if (refreshSavedPlanTasks) {
    const listedTaskMinutes = tasks.reduce((total, task) => total + task.minutes, 0);
    if (weekRecord.total_minutes !== listedTaskMinutes) {
      const storedSnapshot = parseJson<Record<string, unknown>>(weekRecord.allocation_json, {});
      const allocationJson = JSON.stringify({ ...storedSnapshot, scheduledTaskMinutes: listedTaskMinutes });
      await week_plan.update(weekPlanId, { allocation_json: allocationJson, total_minutes: listedTaskMinutes });
      weekRecord = { ...weekRecord, allocation_json: allocationJson, total_minutes: listedTaskMinutes };
    }
  }
  const snapshot = getPlanSnapshot(weekRecord.allocation_json, plan);
  const estimateBySkill = new Map<string, EntityRecord>();
  confirmedEstimates.forEach((row) => {
    if (typeof row.skill === "string" && !estimateBySkill.has(row.skill)) estimateBySkill.set(row.skill, row);
  });
  const confirmedCurrent = latestSavedSkillEstimateValues(confirmedEstimates, input.current);
  const startValues = Object.fromEntries(SKILLS.map((skill) => {
    const value = estimateBySkill.get(skill)?.start_value;
    return [skill, typeof value === "number" && Number.isFinite(value) ? normalizeLevelScore(value) : confirmedCurrent[skill]];
  })) as SkillValues<number>;
  const skillStates = Object.fromEntries(SKILLS.map((skill) => {
    const state = estimateBySkill.get(skill)?.state;
    return [skill, typeof state === "string" ? state : input.speakingAssessed && skill === "speaking" ? "assessed" : "unverified"];
  })) as Record<SkillKey, string>;
  const targets = parseJson<SkillValues<number | null>>(roadmapRecord.target_levels, input.targets);
  const savedFeasibility = feasibilityFromRoadmap(roadmapRecord, feasibility);
  const noteWeekRowsById = new Map<string, EntityRecord>();
  savedWeeks.forEach((row) => {
    if (typeof row.id === "string") noteWeekRowsById.set(row.id, row);
  });
  if (typeof weekRecord.id === "string") noteWeekRowsById.set(weekRecord.id, weekRecord);
  const noteWeekRows = [...noteWeekRowsById.values()];
  const latestCheckIn = latestScoredLearnerCheckIn(savedCheckIns);
  const firstPlanNote = !latestCheckIn && savedCheckIns !== null
    ? await readFirstPlanNote(user, roadmapId, noteWeekRows)
    : undefined;
  const latestCheckInReplanNote = latestCheckIn
    ? await readCheckInReplanNote(user, latestCheckIn, noteWeekRows)
    : undefined;
  const whatChangedNote = selectTodayWhatChangedNote({
    checkIns: savedCheckIns,
    firstPlanNote,
    latestCheckInReplanNote,
  });
  const hasScoredAssessment = hasScoredLearnerAssessment(placement?.status, savedCheckIns, confirmedEstimates);

  return {
    userId: user.id,
    profileId: profile.id,
    roadmapId,
    weekPlanId,
    track: input.track,
    goalLabel: input.generalGoal ?? input.track,
    today: input.today,
    timeZone,
    sourceLabel: typeof roadmapRecord.source_label === "string" ? roadmapRecord.source_label : sourceLabel,
    hasScoredAssessment,
    speakingAssessed: input.speakingAssessed === true,
    current: confirmedCurrent,
    targets,
    feasibility: savedFeasibility,
    weekStart: typeof weekRecord.week_start_local === "string" ? weekRecord.week_start_local : plan.weekStartDate,
    weekEnd: snapshot.weekEndDate,
    planStartDate: snapshot.planStartDate,
    weekNumber: typeof weekRecord.week_number === "number" ? weekRecord.week_number : resolvedWeekNumber,
    totalMinutes: typeof weekRecord.total_minutes === "number" ? weekRecord.total_minutes : snapshot.scheduledTaskMinutes,
    allocationShare: snapshot.allocationShare,
    allocationMinutes: snapshot.allocationMinutes,
    dailyMinutes: snapshot.dailyMinutes,
    whatChangedNote,
    tutorFocusSkills: options.tutorFocusSkills ?? [],
    startValues,
    skillStates,
    tasks,
    taskHistory: options.includeTaskHistory
      ? taskHistoryRows.flatMap((row): LearnerTaskMinuteView[] => {
          if (typeof row.id !== "string" || row.user_id !== user.id) return [];
          return [{
            id: row.id,
            status: typeof row.status === "string" ? row.status : "",
            minutes: typeof row.minutes === "number" ? row.minutes : 0,
            completedAtUtc: typeof row.completed_at_utc === "string" ? row.completed_at_utc : null,
          }];
        })
      : undefined,
  };
}

/**
 * Writes one pending task's practice content after Today has shown the plan (A28, D1): the AI, else the approved bank,
 * else "unavailable". A task that is no longer pending, or no longer open, is returned as saved, so a repeated or late
 * request never spends AI on it. The checks in generate_practice_content (saved plan, saved estimate) are unchanged.
 */
export async function prepareMyTaskContent(taskId: string): Promise<LearnerTaskView> {
  if (!taskId.trim()) throw new Error("Choose a task to prepare.");
  const user = await User.me() as ParleUser;
  if (!user?.id || !user.email) throw new Error("Sign in to prepare a practice task.");
  // read by id, not among the newest 500 rows (A48)
  const ownTask = async () => (await ownerRows<StoredTaskRecord>(learner_task, { id: taskId, created_by: user.email, user_id: user.id }, "-created_at", 1))
    .find((row) => row.id === taskId && row.user_id === user.id) ?? null;
  const record = await ownTask();
  const view = record ? taskFromRecord(record) : null;
  if (!record?.id || !view) throw new Error("This task could not be confirmed as yours.");
  if (view.contentSource !== "pending" || (view.status !== "planned" && view.status !== "rolled")) return view;
  // A41: claim the task before the AI call, so a second tab or a reopened Today waits for the first instead of paying again
  if (preparingClaimAge(record.source_ref) < PREPARE_CLAIM_MS) return waitForPreparedContent(ownTask, view);
  const claim = `preparing:${Date.now()}`;
  const claimed = await learner_task.updateWhere(record.id, { source_ref: claim }, { content_source: "pending", source_ref: record.source_ref ?? null });
  if (!claimed) return waitForPreparedContent(ownTask, view);
  const weekPlanId = typeof record.week_plan_id === "string" ? record.week_plan_id : "";
  const planned = plannedTaskFromRecord(record);
  if (!weekPlanId || !planned) throw new Error("This task could not be confirmed as yours.");
  const prefix = `${weekPlanId}:`;
  const task: PlannedTask = { ...planned, id: planned.id.startsWith(prefix) ? planned.id.slice(prefix.length) : planned.id };
  const profiles = await ownerRows<LearnerProfileRecord>(learner_profile, { created_by: user.email }, "-created_at", 30);
  const profile = profiles.find((row) => row.user_id === user.id && typeof row.id === "string");
  if (!profile) throw new LearnerOnboardingRequiredError();
  const estimates = await ownerRows<EntityRecord & SavedSkillEstimateValue>(skill_estimate, { created_by: user.email, user_id: user.id, roadmap_id: record.roadmap_id ?? "" }, "-created_at", 40);
  const zero: SkillValues<number> = { listening: 0, reading: 0, writing: 0, speaking: 0 };
  const prepared = await prepareTaskContent(task, {
    track: safeTrack(profile.track),
    current: latestSavedSkillEstimateValues(estimates, zero),
    targets: getProfileTargets(profile),
  }, weekPlanId);
  // A47: written only while the task still holds our claim and its topic; a plan rebuilt meanwhile cleared the claim
  const update = { content_json: JSON.stringify(prepared.content), content_source: prepared.source, source_ref: prepared.sourceRef };
  const written = await learner_task.updateWhere(record.id, update,
    { content_source: "pending", source_ref: claim, type: record.type, topic: record.topic ?? null, skill: record.skill ?? null });
  if (!written) { const latest = await ownTask(); return (latest && taskFromRecord(latest)) ?? view; }
  return taskFromRecord(written) ?? view;
}

const PREPARE_CLAIM_MS = 120_000; // a claim older than this (a worker stopped at its time limit) can be taken again
function preparingClaimAge(ref: unknown): number {
  return typeof ref === "string" && ref.startsWith("preparing:") ? Date.now() - Number(ref.slice("preparing:".length)) : Infinity;
}
async function waitForPreparedContent(read: () => Promise<StoredTaskRecord | null>, view: LearnerTaskView): Promise<LearnerTaskView> {
  for (const until = Date.now() + 45_000; Date.now() < until;) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const latest = await read();
    if (latest && latest.content_source !== "pending") return taskFromRecord(latest) ?? view;
  }
  throw new Error("Practice content is still being prepared."); // the page tries again, then offers a refresh
}

export async function markMyLearnerTaskDone(taskId: string): Promise<string | null> {
  if (!taskId.trim()) throw new Error("Choose a task to update.");
  const user = await User.me() as ParleUser;
  if (!user?.id || !user.email) throw new Error("Sign in to update a practice task.");
  const rows = await ownerRows<StoredTaskRecord>(learner_task, { id: taskId, created_by: user.email, user_id: user.id }, "-created_at", 1);
  const record = rows.find((row) => row.id === taskId && row.user_id === user.id);
  if (!record?.id || typeof record.type !== "string" || !TASK_TYPES.has(record.type as TaskType)) {
    throw new Error("This task could not be confirmed as yours.");
  }
  const nextStatus = transitionLearnerTaskStatus(record.status as TaskStatus, "done", record.type as TaskType);
  if (!nextStatus) throw new Error("This task cannot be marked done from this screen.");
  if (nextStatus === record.status) {
    return typeof record.completed_at_utc === "string" && Number.isFinite(Date.parse(record.completed_at_utc))
      ? record.completed_at_utc
      : null;
  }

  const completedAt = new Date().toISOString();
  await learner_task.update(record.id, { status: nextStatus, completed_at_utc: completedAt });
  const confirmed = await ownerRows<StoredTaskRecord>(learner_task, { id: taskId, created_by: user.email, user_id: user.id }, "-created_at", 1);
  const completedTask = confirmed.find((row) => row.id === taskId && row.status === "done" && row.user_id === user.id);
  if (!completedTask) throw new Error("The completed task could not be confirmed.");
  if (typeof completedTask.completed_at_utc !== "string" || !Number.isFinite(Date.parse(completedTask.completed_at_utc))) {
    throw new Error("The completion time could not be confirmed.");
  }
  return completedTask.completed_at_utc;
}

export async function skipMyLearnerTask(taskId: string): Promise<void> {
  if (!taskId.trim()) throw new Error("Choose a task to update.");
  const user = await User.me() as ParleUser;
  if (!user?.id || !user.email) throw new Error("Sign in to update a practice task.");
  const rows = await ownerRows<StoredTaskRecord>(learner_task, { id: taskId, created_by: user.email, user_id: user.id }, "-created_at", 1);
  const record = rows.find((row) => row.id === taskId && row.user_id === user.id);
  if (!record?.id || typeof record.type !== "string" || !TASK_TYPES.has(record.type as TaskType)) {
    throw new Error("This task could not be confirmed as yours.");
  }
  const nextStatus = transitionLearnerTaskStatus(record.status as TaskStatus, "skipped", record.type as TaskType);
  if (!nextStatus) throw new Error("This task can no longer be skipped.");
  if (nextStatus === record.status) return;

  await learner_task.update(record.id, { status: nextStatus });
  const confirmed = await ownerRows<StoredTaskRecord>(learner_task, { id: taskId, created_by: user.email, user_id: user.id }, "-created_at", 1);
  if (!confirmed.some((row) => row.id === taskId && row.status === "skipped" && row.user_id === user.id)) {
    throw new Error("The skipped task could not be confirmed.");
  }
}

export interface SubmitMyWeeklyCheckInInput {
  answers: Record<string, string>;
  speakingAnswer: string;
  speakingSelfRating: CheckInComparison | null;
  writingAnswer: string;
}

export type PracticeReportCategory = "content_issue" | "wrong_answer" | "technical_problem" | "other";

const SPEAKING_SELF_RATING_LABEL = "Self-rated - not assessed";
const PRACTICE_REPORT_CATEGORIES = new Set<PracticeReportCategory>([
  "content_issue",
  "wrong_answer",
  "technical_problem",
  "other",
]);

function checkInKey(profileId: string, weekStart: string): string {
  return `${profileId}:${weekStart}`;
}

async function findMyCheckIn(user: ParleUser, plan: LearnerPlanView): Promise<LearnerCheckInRecord | null> {
  const rows = await ownerRows<LearnerCheckInRecord>(checkin, {
    created_by: user.email,
    user_id: user.id,
    profile_id: plan.profileId,
    week_plan_id: plan.weekPlanId,
    checkin_key: checkInKey(plan.profileId, plan.weekStart),
  }, "created_at", 20);
  return rows.find((row) => row.user_id === user.id && row.profile_id === plan.profileId && row.week_plan_id === plan.weekPlanId) ?? null;
}

/** Loads approved check-in material again on submission, so client-supplied answer keys are never trusted. */
export async function prepareMyWeeklyCheckIn(): Promise<LearnerCheckInSession> {
  const plan = await getOrCreateMyLearnerPlan();
  const user = await User.me() as ParleUser;
  if (!user?.id || !user.email) throw new Error("Sign in to open your weekly check-in.");
  const checkInTask = plan.tasks.find((task) => task.type === "weekly_checkin");
  const readingWeighted = getTrackWeights(plan.track, plan.targets).reading > 0;
  if (plan.weekStart > mondayOfLocalWeek(plan.today)) {
    return {
      plan,
      notDue: true,
      dueDate: checkInTask?.dateLocal && validIsoDate(checkInTask.dateLocal) ? checkInTask.dateLocal : null,
      questions: [],
      readingWeighted,
      speakingPrompt: null,
      writingPrompt: null,
      existing: null,
    };
  }
  if (!checkInTask) throw new Error("There is no weekly check-in scheduled in this plan.");
  const [selection, existing] = await Promise.all([
    loadApprovedCheckInSelection({ track: plan.track, current: plan.current, targets: plan.targets }),
    findMyCheckIn(user, plan),
  ]);
  return {
    plan,
    notDue: false,
    dueDate: checkInTask.dateLocal || null,
    questions: selection.questions,
    readingWeighted,
    speakingPrompt: selection.speakingPrompt,
    writingPrompt: selection.writingPrompt,
    existing,
  };
}

function storedSkillValues(value: unknown, fallback: SkillValues<number>): SkillValues<number> {
  const raw = parseJson<Record<string, unknown>>(value, {});
  return Object.fromEntries(SKILLS.map((skill) => [
    skill,
    typeof raw[skill] === "number" && Number.isFinite(raw[skill]) ? normalizeLevelScore(raw[skill] as number) : fallback[skill],
  ])) as SkillValues<number>;
}

function storedSkillDeltas(value: unknown): SkillValues<number> {
  const raw = parseJson<Record<string, unknown>>(value, {});
  return Object.fromEntries(SKILLS.map((skill) => [
    skill,
    typeof raw[skill] === "number" && Number.isFinite(raw[skill]) ? Math.round((raw[skill] as number) * 100) / 100 : 0,
  ])) as SkillValues<number>;
}

async function writeSavedCheckInEstimates(
  user: ParleUser,
  plan: LearnerPlanView,
  beforeValues: SkillValues<number>,
  afterValues: SkillValues<number>,
  deltas: SkillValues<number>,
): Promise<void> {
  const estimates = await ownerRows<EntityRecord>(skill_estimate, {
    created_by: user.email,
    user_id: user.id,
    roadmap_id: plan.roadmapId,
  }, "-created_at", 40);
  const updates: Array<Promise<unknown>> = [];
  for (const skill of SKILLS) {
    if (skill === "speaking" || !Number.isFinite(deltas[skill]) || deltas[skill] === 0 || Math.abs(deltas[skill]) > 0.25) continue;
    const before = normalizeLevelScore(beforeValues[skill]);
    const after = normalizeLevelScore(afterValues[skill]);
    const actualDelta = Math.round((after - before) * 100) / 100;
    if (Math.abs(actualDelta) > 0.25 || actualDelta !== deltas[skill]) continue;
    const row = estimates.find((item) => item.skill === skill && typeof item.id === "string");
    if (!row?.id) throw new Error("A saved skill estimate could not be confirmed.");
    if (typeof row.value === "number" && normalizeLevelScore(row.value) === after && row.source === "checkin") continue;
    updates.push(skill_estimate.update(row.id, { value: after, source: "checkin" }));
  }
  await Promise.all(updates);
}

async function markWeeklyCheckInTaskDone(user: ParleUser, plan: LearnerPlanView): Promise<void> {
  const tasks = await ownerRows<StoredTaskRecord>(learner_task, {
    created_by: user.email,
    user_id: user.id,
    week_plan_id: plan.weekPlanId,
  }, "date_local", 100);
  const task = tasks.find((item) => item.type === "weekly_checkin" && item.week_plan_id === plan.weekPlanId);
  if (!task?.id) throw new Error("The weekly check-in task could not be confirmed.");
  if (task.status !== "done") {
    await learner_task.update(task.id, { status: "done", completed_at_utc: new Date().toISOString() });
  }
}

async function buildNextWeekAfterCheckIn(plan: LearnerPlanView, note: string): Promise<LearnerPlanView> {
  return getOrCreateMyLearnerPlan({
    planningDate: mondayOfLocalWeek(addDays(plan.weekStart, 7)),
    weekNumber: plan.weekNumber + 1,
    whatChangedNote: note,
    tutorFocusSkills: [],
  });
}

async function resultFromSavedCheckIn(
  record: LearnerCheckInRecord,
  plan: LearnerPlanView,
  user: ParleUser,
  alreadySubmitted: boolean,
): Promise<LearnerCheckInResult> {
  const before = storedSkillValues(record.before_values_json, plan.current);
  const values = storedSkillValues(record.after_values_json, before);
  const deltas = storedSkillDeltas(record.deltas_json);
  const note = typeof record.what_changed_note === "string" && record.what_changed_note.trim()
    ? record.what_changed_note
    : translatedCheckInChangeNote(deltas);
  await writeSavedCheckInEstimates(user, plan, before, values, deltas);
  await markWeeklyCheckInTaskDone(user, plan);
  const nextPlan = await buildNextWeekAfterCheckIn(plan, note);
  return {
    record,
    note,
    values,
    deltas,
    writingScored: record.writing_status === "scored",
    alreadySubmitted,
    nextPlan,
  };
}

export { SKIPPED_AUDIO };

export function checkInCorrectCounts(questions: CheckInQuestionView[], answers: Record<string, string>): { correct: number; skipped: number } {
  let correct = 0, skipped = 0;
  for (const question of questions) {
    const selectedId = answers[question.id];
    if (!selectedId) throw new Error("Answer each displayed listening, reading, or grammar question before continuing.");
    if (selectedId === SKIPPED_AUDIO) {
      if (question.kind !== "listening") throw new Error("Only a listening question can be skipped.");
      skipped += 1;
      continue;
    }
    if (!question.options.some((option) => option.id === selectedId)) throw new Error("One selected check-in answer is not available for that question.");
    if (selectedId === question.answerOptionId) correct += 1;
  }
  return { correct, skipped };
}

export const answeredCheckInQuestionCount = (total: number, skipped: number): number => Math.max(0, total - skipped);

function extractWritingLevel(response: unknown): string | null {
  if (!isObject(response)) return null;
  const root = isObject(response.data) ? response.data : response;
  const result = isObject(root.result) ? root.result : root;
  if (typeof result.error === "string") return null;
  const assessment = isObject(result.assessment) ? result.assessment : result;
  return typeof assessment.level === "string" ? assessment.level : null;
}

/** Applies only deterministic three-item evidence and the level returned by Module 2's writing scorer. */
export async function submitMyWeeklyCheckIn(input: SubmitMyWeeklyCheckInInput): Promise<LearnerCheckInResult> {
  const session = await prepareMyWeeklyCheckIn();
  const user = await User.me() as ParleUser;
  if (!user?.id || !user.email) throw new Error("Sign in to submit your weekly check-in.");
  if (session.existing) return resultFromSavedCheckIn(session.existing, session.plan, user, true);

  const ratingValues = new Set<CheckInComparison>(["below", "at", "above"]);
  if (session.speakingPrompt && !input.speakingAnswer.trim()) throw new Error("Type a short speaking answer before continuing.");
  if (input.speakingAnswer.length > 4000) throw new Error("Keep the speaking practice answer under 4,000 characters.");
  if (session.speakingPrompt && !input.speakingSelfRating) throw new Error("Choose a speaking self-rating before continuing.");
  if (input.speakingSelfRating && !ratingValues.has(input.speakingSelfRating)) throw new Error("Choose one of the speaking self-ratings shown.");

  const listeningQuestions = session.questions.filter((question) => question.kind === "listening");
  const readingQuestions = session.questions.filter((question) => question.kind === "reading");
  const grammarQuestions = session.questions.filter((question) => question.kind === "grammar");
  const listening = checkInCorrectCounts(listeningQuestions, input.answers);
  const listeningCorrect = listening.correct;
  const readingCorrect = checkInCorrectCounts(readingQuestions, input.answers).correct;
  const grammarCorrect = checkInCorrectCounts(grammarQuestions, input.answers).correct;

  let writingLevel: string | null = null;
  let writingScore: number | null = null;
  if (session.writingPrompt && session.plan.targets.writing !== null && input.writingAnswer.trim()) {
    try {
      const response = await parleAssessmentService({
        action: "score_writing",
        response_text: input.writingAnswer.trim().slice(0, 6000),
        prompt_text: session.writingPrompt.text,
        cefr_level: session.writingPrompt.cefrLevel,
      });
      writingLevel = extractWritingLevel(response);
      writingScore = scoredWritingLevelToScore(writingLevel);
      if (writingScore === null) writingLevel = null;
    } catch (error) {
      console.error("Parle weekly writing check-in was not scored", error instanceof Error ? error.name : "unknown");
      writingLevel = null;
      writingScore = null;
    }
  }

  const scored = applyCheckInEvidence({
    track: session.plan.track,
    current: session.plan.current,
    targets: session.plan.targets,
    // Plan 13: a week with a listening question skipped for its audio leaves the listening estimate as it was
    ...(listeningQuestions.length === 3 && listening.skipped === 0 ? { listeningCorrectCount: listeningCorrect } : {}),
    ...(session.readingWeighted && readingQuestions.length === 3 ? { readingCorrectCount: readingCorrect } : {}),
    ...(!session.readingWeighted && grammarQuestions.length === 3 ? { grammarCorrectCount: grammarCorrect } : {}),
    writingScoredLevel: writingScore,
    speakingSelfRating: session.speakingPrompt ? input.speakingSelfRating : null,
  });
  const note = translatedCheckInChangeNote(scored.deltas);
  const writingStatus = session.plan.targets.writing === null
    ? "not_applicable"
    : scored.writingScored && writingLevel
      ? "scored"
      : "not_scored";
  const now = new Date();
  const dateLocal = localDateInZone(now, session.plan.timeZone);
  const recordPayload = {
    user_id: user.id,
    profile_id: session.plan.profileId,
    roadmap_id: session.plan.roadmapId,
    week_plan_id: session.plan.weekPlanId,
    checkin_key: checkInKey(session.plan.profileId, session.plan.weekStart),
    track: session.plan.track,
    date_local: dateLocal,
    week_start_local: session.plan.weekStart,
    listening_correct_count: listeningCorrect,
    listening_total_count: answeredCheckInQuestionCount(listeningQuestions.length, listening.skipped),
    listening_comparison: scored.comparisons.listening ?? "",
    reading_correct_count: readingCorrect,
    reading_total_count: readingQuestions.length,
    reading_comparison: scored.comparisons.reading ?? "",
    grammar_correct_count: grammarCorrect,
    grammar_total_count: grammarQuestions.length,
    grammar_comparison: scored.grammarComparison ?? "",
    grammar_evidence_only: !session.readingWeighted,
    writing_status: writingStatus,
    writing_scored_level: writingStatus === "scored" ? writingLevel ?? "" : "",
    writing_comparison: scored.comparisons.writing ?? "",
    speaking_self_rating: session.speakingPrompt ? input.speakingSelfRating ?? "" : "",
    speaking_self_rating_label: session.speakingPrompt ? SPEAKING_SELF_RATING_LABEL : "",
    before_values_json: JSON.stringify(session.plan.current),
    after_values_json: JSON.stringify(scored.values),
    deltas_json: JSON.stringify(scored.deltas),
    comparisons_json: JSON.stringify({
      ...scored.comparisons,
      grammar: scored.grammarComparison,
      speaking_self_rating: session.speakingPrompt ? input.speakingSelfRating : null,
    }),
    what_changed_note: note,
    status: "submitted",
  };

  // Save the scored evidence before updating estimates. A retry can replay the exact saved values without adding another quarter-step.
  await checkin.create(recordPayload);
  const savedRows = await ownerRows<LearnerCheckInRecord>(checkin, {
    created_by: user.email,
    user_id: user.id,
    profile_id: session.plan.profileId,
    week_plan_id: session.plan.weekPlanId,
    checkin_key: checkInKey(session.plan.profileId, session.plan.weekStart),
  }, "created_at", 20);
  const saved = savedRows.find((row) => row.user_id === user.id && row.profile_id === session.plan.profileId && row.week_plan_id === session.plan.weekPlanId);
  if (!saved) throw new Error("Your check-in evidence could not be confirmed. Try again; saved answers are never retained.");
  return resultFromSavedCheckIn(saved, session.plan, user, false);
}

export async function loadMyLearnerRoadmap(): Promise<LearnerRoadmapData> {
  const plan = await getOrCreateMyLearnerPlan();
  const user = await User.me() as ParleUser;
  if (!user?.id || !user.email) throw new Error("Sign in to view your roadmap.");
  const rows = await ownerRows<EntityRecord>(milestone, {
    created_by: user.email,
    user_id: user.id,
    roadmap_id: plan.roadmapId,
  }, "expected_date", 200);
  const weights = getTrackWeights(plan.track, plan.targets);
  const seen = new Set<string>();
  const milestones = rows.flatMap((row) => {
    if (typeof row.id !== "string" || typeof row.skill !== "string" || !SKILLS.includes(row.skill as SkillKey) || weights[row.skill as SkillKey] <= 0) return [];
    const key = typeof row.milestone_key === "string" ? row.milestone_key : row.id;
    if (seen.has(key)) return [];
    seen.add(key);
    if (typeof row.from_value !== "number" || typeof row.to_value !== "number" || typeof row.can_do_text !== "string") return [];
    return [{
      id: row.id,
      skill: row.skill as SkillKey,
      fromValue: normalizeLevelScore(row.from_value),
      toValue: normalizeLevelScore(row.to_value),
      canDoText: row.can_do_text,
      expectedDate: validIsoDate(row.expected_date) ? row.expected_date : "",
      status: row.status === "reached" ? "reached" as const : "upcoming" as const,
    }];
  }).sort((a, b) => a.expectedDate.localeCompare(b.expectedDate) || SKILLS.indexOf(a.skill) - SKILLS.indexOf(b.skill));
  return { plan, milestones };
}

export async function loadMyLearnerProgress(): Promise<LearnerProgressData> {
  const plan = await getOrCreateMyLearnerPlan();
  const user = await User.me() as ParleUser;
  if (!user?.id || !user.email) throw new Error("Sign in to view your progress.");
  const [historyRows, taskRows, estimateRows, placementRows] = await Promise.all([
    ownerRows<LearnerCheckInRecord>(checkin, {
      created_by: user.email,
      user_id: user.id,
      profile_id: plan.profileId,
    }, "-date_local", 300),
    ownerRows<StoredTaskRecord>(learner_task, {
      created_by: user.email,
      user_id: user.id,
    }, "-date_local", 500),
    ownerRows<EntityRecord>(skill_estimate, {
      created_by: user.email,
      user_id: user.id,
      roadmap_id: plan.roadmapId,
    }, "created_at", 40),
    ownerRows<PlacementRecord>(placement_result, {
      created_by: user.email,
      user_id: user.id,
    }, "created_at", 500),
  ]);
  const owner = { id: user.id, email: user.email };
  const ownedHistoryRows = filterLearnerRowsByOwner(historyRows, owner);
  const history = ownedHistoryRows
    .filter((row) => row.profile_id === plan.profileId)
    .sort((a, b) => (b.date_local ?? "").localeCompare(a.date_local ?? ""));
  const learnerTaskRows = filterLearnerRowsByOwner(taskRows, owner);
  const ownedEstimateRows = filterLearnerRowsByOwner(estimateRows, owner);
  const progressTasks = learnerTaskRows.map((row) => {
    const dateLocal = row.status === "done"
      ? learnerLocalDateFromUtcTimestamp(row.completed_at_utc, plan.timeZone) ?? ""
      : typeof row.date_local === "string" ? row.date_local : "";
    return {
      dateLocal,
      minutes: typeof row.minutes === "number" ? row.minutes : 0,
      status: typeof row.status === "string" ? row.status : "",
    };
  });
  const studyProgress = calculateCompletedStudyProgress(progressTasks, plan.today);
  const taskActivity = learnerTaskRows.flatMap((row): LearnerTaskActivity[] => {
    if (typeof row.id !== "string" || typeof row.type !== "string" || !TASK_TYPES.has(row.type as TaskType)) return [];
    if (row.status !== "done" && row.status !== "skipped") return [];
    const dateLocal = row.status === "done"
      ? learnerLocalDateFromUtcTimestamp(row.completed_at_utc, plan.timeZone) ?? ""
      : typeof row.date_local === "string" ? row.date_local : "";
    return [{
      id: row.id,
      dateLocal,
      type: row.type as TaskType,
      minutes: typeof row.minutes === "number" ? row.minutes : 0,
      status: row.status,
    }];
  }).sort((a, b) => b.dateLocal.localeCompare(a.dateLocal) || b.id.localeCompare(a.id)).slice(0, 8);
  const starts = plan.startValues;
  const targets = plan.targets;
  const skillProgress = Object.fromEntries(SKILLS.map((skill) => [
    skill,
    typeof targets[skill] === "number"
      ? calculateSkillProgressPercentage(plan.current[skill], starts[skill], targets[skill] as number)
      : null,
  ])) as SkillValues<number | null>;
  const readiness = calculateOverallReadiness({ track: plan.track, current: plan.current, starts, targets });
  const estimateDates = ownedEstimateRows
    .map((row) => typeof row.created_at === "string" ? Date.parse(row.created_at) : Number.NaN)
    .filter((time) => Number.isFinite(time));
  const startedOn = estimateDates.length
    ? localDateInZone(new Date(Math.min(...estimateDates)), plan.timeZone)
    : history[history.length - 1]?.week_start_local || plan.weekStart;
  const trend: Array<{ date: string; values: SkillValues<number> }> = [{ date: startedOn, values: starts }];
  history
    .filter((record) => record.roadmap_id === plan.roadmapId)
    .slice()
    .sort((a, b) => (a.date_local ?? "").localeCompare(b.date_local ?? ""))
    .forEach((record) => {
      const values = storedSkillValues(record.after_values_json, plan.current);
      trend.push({ date: validIsoDate(record.date_local) ? record.date_local : record.week_start_local ?? plan.today, values });
    });
  return {
    plan,
    starts,
    states: plan.skillStates,
    history,
    trend,
    startedOn,
    skillProgress,
    readiness,
    completedMinutesByWeek: studyProgress.completedMinutesByWeek,
    streak: studyProgress.streak,
    taskActivity,
    learnerName: typeof user.full_name === "string" && user.full_name.trim() ? user.full_name.trim() : null,
    earliestPlacementDate: earliestOwnedPlacementDate(placementRows, owner, plan.timeZone),
  };
}

export async function submitMyTaskPracticeReport(input: {
  taskId: string;
  category: PracticeReportCategory;
  note?: string;
}): Promise<void> {
  if (!input.taskId.trim()) throw new Error("Choose a practice task to report.");
  if (!PRACTICE_REPORT_CATEGORIES.has(input.category)) throw new Error("Choose a report category.");
  const user = await User.me() as ParleUser;
  if (!user?.id || !user.email) throw new Error("Sign in to report a practice problem.");
  const tasks = await ownerRows<StoredTaskRecord>(learner_task, {
    created_by: user.email,
    user_id: user.id,
  }, "-created_at", 500);
  const task = tasks.find((row) => row.id === input.taskId && row.user_id === user.id);
  if (!task?.id || !task.roadmap_id || !task.week_plan_id || !task.task_key) {
    throw new Error("This practice task could not be confirmed as yours.");
  }
  const [roadmaps, weeks] = await Promise.all([
    ownerRows<EntityRecord>(roadmap, { created_by: user.email, user_id: user.id }, "-created_at", 200),
    ownerRows<EntityRecord>(week_plan, { created_by: user.email, user_id: user.id }, "-created_at", 300),
  ]);
  const parentRoadmap = roadmaps.find((row) => row.id === task.roadmap_id && row.user_id === user.id);
  const parentWeek = weeks.find((row) => row.id === task.week_plan_id && row.user_id === user.id && row.roadmap_id === task.roadmap_id);
  if (!parentRoadmap || !parentWeek) throw new Error("This practice task’s saved plan could not be confirmed.");
  await practice_report.create({
    task_id: task.id,
    task_key: task.task_key,
    roadmap_id: task.roadmap_id,
    week_plan_id: task.week_plan_id,
    category: input.category,
    note: typeof input.note === "string" ? input.note.trim().slice(0, 240) : "",
    reported_at_utc: new Date().toISOString(),
    status: "new",
  });
}
