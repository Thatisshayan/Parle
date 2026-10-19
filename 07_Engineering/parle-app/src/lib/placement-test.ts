import { placement_result } from "@/entities";

export type Track = "immigration" | "citizenship" | "general";
export type BankLevel = "A1" | "A2" | "B1" | "B2";
export type SelfAssessedLevel = "A0" | BankLevel;
export type ResultLevel = BankLevel | "Below A1";
export type SkillKey = "L" | "R" | "W" | "S";
export type AutoSectionKey = "listening" | "reading" | "grammar_vocabulary";
export type SkillResultState = "assessed" | "transcript_only" | "optional" | "not_assessed";

export interface QuestionOption {
  id: string;
  text: string;
}

export interface QuestionItem {
  id: string;
  demo_code: string;
  skill: AutoSectionKey;
  cefr_level: BankLevel;
  format: "multiple_choice" | string;
  prompt: string;
  passage?: string;
  transcript?: string;
  audio_url?: string;
  options: QuestionOption[];
  answer_option_id: string;
  answer: string;
  explanation: string;
  status: string;
  is_test_data: boolean;
  content_audit_version?: string;
  [key: string]: unknown;
}

export interface StoredQuestionItem extends Omit<QuestionItem, "options" | "answer_option_id" | "answer"> {
  options: Array<string | QuestionOption>;
  answer?: string;
  answer_option_id?: string;
  content_audit_version?: string;
  [key: string]: unknown;
}

export function normalizeStoredText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/\r\n?/g, "\n");
}

function stableOptionId(demoCode: string, index: number): string {
  const slug = demoCode.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "question";
  return `${slug}-option-${index + 1}`;
}

function comparableAnswer(value: string): string {
  return normalizeStoredText(value).trim().normalize("NFC").toLocaleLowerCase();
}

export function normalizeQuestionItem(value: unknown): QuestionItem {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  // real bank items may have no demo code: their id stands in (bank readers fix)
  const demoCode = typeof raw.demo_code === "string" && raw.demo_code.trim() ? raw.demo_code : typeof raw.id === "string" && raw.id.trim() ? raw.id : "unknown-item";
  const rawOptions = Array.isArray(raw.options) ? raw.options : [];
  const options = rawOptions.flatMap((entry, index): QuestionOption[] => {
    if (typeof entry === "string") {
      return [{ id: stableOptionId(demoCode, index), text: normalizeStoredText(entry) }];
    }
    if (!entry || typeof entry !== "object") return [];
    const option = entry as Record<string, unknown>;
    const text = normalizeStoredText(option.text);
    if (!text) return [];
    return [{
      id: typeof option.id === "string" && option.id.trim() ? option.id : stableOptionId(demoCode, index),
      text,
    }];
  });
  const rawAnswerId = typeof raw.answer_option_id === "string" ? raw.answer_option_id : "";
  const suppliedAnswer = normalizeStoredText(raw.answer);
  let answerOptionId = options.some((option) => option.id === rawAnswerId) ? rawAnswerId : "";
  if (!answerOptionId && suppliedAnswer) {
    const matches = options.filter((option) => comparableAnswer(option.text) === comparableAnswer(suppliedAnswer));
    if (matches.length === 1) answerOptionId = matches[0].id;
  }
  const answer = options.find((option) => option.id === answerOptionId)?.text ?? suppliedAnswer;

  return {
    ...raw,
    id: typeof raw.id === "string" ? raw.id : "",
    demo_code: demoCode,
    skill: raw.skill as AutoSectionKey,
    cefr_level: raw.cefr_level as BankLevel,
    format: typeof raw.format === "string" ? raw.format : "multiple_choice",
    prompt: normalizeStoredText(raw.prompt),
    passage: typeof raw.passage === "string" ? normalizeStoredText(raw.passage) : undefined,
    transcript: typeof raw.transcript === "string" ? normalizeStoredText(raw.transcript) : undefined,
    audio_url: typeof raw.audio_url === "string" ? raw.audio_url : undefined,
    options,
    answer_option_id: answerOptionId,
    answer,
    explanation: normalizeStoredText(raw.explanation),
    status: typeof raw.status === "string" ? raw.status : "",
    is_test_data: raw.is_test_data === true,
    content_audit_version: typeof raw.content_audit_version === "string" ? raw.content_audit_version : undefined,
  } as QuestionItem;
}

function isQuestionRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAutoSection(value: unknown): value is AutoSectionKey {
  return value === "listening" || value === "reading" || value === "grammar_vocabulary";
}

export function isBankLevel(value: unknown): value is BankLevel {
  return value === "A1" || value === "A2" || value === "B1" || value === "B2";
}

function hasValidStoredOptions(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 2 || value.length > 4) return false;
  return value.every((entry) => {
    if (typeof entry === "string") return Boolean(normalizeStoredText(entry).trim());
    if (!isQuestionRecord(entry) || typeof entry.text !== "string" || !normalizeStoredText(entry.text).trim()) return false;
    if (!Object.prototype.hasOwnProperty.call(entry, "id")) return true;
    return typeof entry.id === "string" && Boolean(entry.id.trim()) && entry.id.trim() === entry.id;
  });
}

function hasValidExplicitAnswerOptionId(row: Record<string, unknown>, item: QuestionItem): boolean {
  const answerOptionId = row.answer_option_id;
  if (answerOptionId === undefined || answerOptionId === null) return true;
  if (typeof answerOptionId !== "string" || !answerOptionId.trim() || answerOptionId.trim() !== answerOptionId) return false;
  return item.options.filter((option) => option.id === answerOptionId).length === 1;
}

export function isQuestionItemReady(item: unknown): item is QuestionItem {
  if (!isQuestionRecord(item)) return false;
  if (
    typeof item.id !== "string" || !item.id.trim() || item.id.trim() !== item.id ||
    typeof item.demo_code !== "string" || !item.demo_code.trim() ||
    !isAutoSection(item.skill) ||
    !isBankLevel(item.cefr_level) ||
    item.format !== "multiple_choice" ||
    typeof item.prompt !== "string" || !item.prompt.trim() ||
    typeof item.status !== "string" ||
    typeof item.is_test_data !== "boolean" ||
    typeof item.answer !== "string" ||
    typeof item.explanation !== "string" ||
    (item.passage !== undefined && typeof item.passage !== "string") ||
    (item.transcript !== undefined && typeof item.transcript !== "string") ||
    (item.audio_url !== undefined && typeof item.audio_url !== "string") ||
    (item.content_audit_version !== undefined && typeof item.content_audit_version !== "string")
  ) return false;
  if (!Array.isArray(item.options) || item.options.length < 2 || item.options.length > 4) return false;

  const ids: string[] = [];
  for (const option of item.options) {
    if (
      !isQuestionRecord(option) ||
      typeof option.id !== "string" || !option.id.trim() || option.id.trim() !== option.id ||
      typeof option.text !== "string" || !option.text.trim()
    ) return false;
    ids.push(option.id);
  }

  if (
    typeof item.answer_option_id !== "string" ||
    !item.answer_option_id.trim() ||
    item.answer_option_id.trim() !== item.answer_option_id
  ) return false;
  return new Set(ids).size === ids.length && ids.filter((id) => id === item.answer_option_id).length === 1;
}

/**
 * The question bank every reader serves (bank readers fix, R94): "demo" is the demo bank (is_test_data true), "real"
 * the imported bank (is_test_data false). One app setting names it; a reader never mixes the two. A missing or
 * unreadable setting reads as "real".
 */
export type BankSource = "demo" | "real";
export const BANK_SOURCE_KEY = "question_bank_source";
export function bankSourceFrom(value: unknown): BankSource {
  return value === "demo" ? "demo" : "real";
}
/** The filter every bank reader uses for approved items of one source. */
export function bankFilter(source: BankSource): { status: "approved"; is_test_data: boolean } {
  return { status: "approved", is_test_data: source === "demo" };
}
/** The API returns at most 1,000 rows per request: read in pages, sorted by id so pages are stable, up to max rows. */
export async function readAllRows(
  entity: { filter: (query: Record<string, unknown>, sort?: string, limit?: number, skip?: number) => Promise<unknown> },
  query: Record<string, unknown>,
  max: number,
): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let skip = 0; skip < max; skip += 1000) {
    const answer = await entity.filter(query, "id", Math.min(1000, max - skip), skip);
    const page = Array.isArray(answer) ? answer : answer && typeof answer === "object" && Array.isArray((answer as { data?: unknown }).data) ? (answer as { data: unknown[] }).data : [];
    out.push(...page);
    if (page.length < Math.min(1000, max - skip)) break;
  }
  return out;
}

/** Normalizes and retains only approved questions of one source ("any": rows already read for one source) with usable answer choices. */
export function selectApprovedQuestionItems(rows: unknown, source: BankSource | "any"): QuestionItem[] {
  if (!Array.isArray(rows)) return [];
  const selected: QuestionItem[] = [];

  for (const row of rows) {
    if (!isQuestionRecord(row) || row.status !== "approved") continue;
    if (source !== "any" && (row.is_test_data === true) !== (source === "demo")) continue;
    if (typeof row.id !== "string" || !row.id.trim()) continue;
    if (!hasValidStoredOptions(row.options)) continue;

    const item = normalizeQuestionItem(row);
    if (isQuestionItemReady(item) && hasValidExplicitAnswerOptionId(row, item)) selected.push(item);
  }
  return selected;
}

/** The demo bank only (kept for older callers and tests). */
export function selectApprovedDemoQuestionItems(rows: unknown): QuestionItem[] {
  return selectApprovedQuestionItems(rows, "demo");
}

export type OptionCount = 2 | 3 | 4;
type PositionCountTuple = [number, number, number, number];
export type CorrectPositionCounts = Record<OptionCount, PositionCountTuple>;

export function emptyCorrectPositionCounts(): CorrectPositionCounts {
  return {
    2: [0, 0, 0, 0],
    3: [0, 0, 0, 0],
    4: [0, 0, 0, 0],
  };
}

export function createBalancedOptionOrder(
  item: QuestionItem,
  currentCounts: CorrectPositionCounts,
  random: () => number = Math.random,
): { options: QuestionOption[]; counts: CorrectPositionCounts } {
  if (!isQuestionItemReady(item)) throw new Error(`Question ${(item as unknown as Record<string, unknown>).demo_code ?? "item"} has no valid answer option.`);
  const optionCount = item.options.length as OptionCount;
  const availablePositions = Array.from({ length: optionCount }, (_, index) => index);
  const bucketCounts = currentCounts[optionCount];
  const minimumCount = Math.min(...availablePositions.map((index) => bucketCounts[index] ?? 0));
  const balancedPositions = availablePositions.filter((index) => bucketCounts[index] === minimumCount);
  const correctPosition = balancedPositions[Math.floor(random() * balancedPositions.length)];
  const correctOption = item.options.find((option) => option.id === item.answer_option_id)!;
  const distractors = item.options.filter((option) => option.id !== item.answer_option_id);
  for (let index = distractors.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [distractors[index], distractors[swapIndex]] = [distractors[swapIndex], distractors[index]];
  }
  const options = [...distractors];
  options.splice(correctPosition, 0, correctOption);
  const counts: CorrectPositionCounts = {
    2: [...currentCounts[2]],
    3: [...currentCounts[3]],
    4: [...currentCounts[4]],
  };
  counts[optionCount][correctPosition] += 1;
  return { options, counts };
}

export const QUESTION_BANK_AUDIT_VERSION = "placement-bank-review-2026-10-08-v1";
export const KNOWN_DEFECTIVE_QUESTION_CODES = ["R-A2-02", "L-B1-04", "GV-B1-09", "GV-B2-07", "GV-B2-10"] as const;

export interface PromptItem {
  id: string;
  demo_code: string;
  kind: "writing" | "speaking";
  cefr_level: BankLevel;
  track: "all" | string;
  text: string;
  status: string;
  is_test_data: boolean;
}

export interface AutoItemResponse {
  item_id: string;
  demo_code: string;
  section: AutoSectionKey;
  level: BankLevel;
  selected_option_id: string;
  selected_answer: string;
  is_correct: boolean;
  answered_at: string;
}

export interface LevelStats {
  total: number;
  correct: number;
}

export interface AdaptiveRun {
  section: AutoSectionKey;
  minimum: number;
  maximum: number;
  currentLevel: BankLevel;
  estimatedLevel: ResultLevel;
  correctStreak: number;
  wrongStreak: number;
  askedIds: string[];
  responses: AutoItemResponse[];
  levelStats: Record<BankLevel, LevelStats>;
  completed: boolean;
  completionReason: "maximum" | "stable" | "below_a1" | "audio_unavailable" | null;
  /** Plan 13: listening questions skipped because their audio would not load (never scored). */
  audioSkips?: number;
  /** The bank this run serves from (bank readers fix); a run saved before the switch existed served the demo bank. */
  bankSource?: BankSource;
}

export interface AdaptiveUpdate {
  run: AdaptiveRun;
  response: AutoItemResponse;
  movement: "up" | "down" | null;
  completed: boolean;
}

export interface AutoSectionSummary {
  section: AutoSectionKey;
  level: ResultLevel;
  correct: number;
  total: number;
  responses: AutoItemResponse[];
  /** Plan 13: the listening section ended because its audio would not load. */
  audioUnavailable?: boolean;
}

export interface WritingRubric {
  task_completion: number;
  grammar: number;
  vocabulary: number;
  coherence: number;
}

export interface WritingAssessment {
  level: BankLevel;
  feedback: string;
  rubric: WritingRubric;
  prompt_id: string;
  prompt_level: BankLevel;
  response_text: string;
  word_count: number;
}

/** Plan 9: a scored placement speaking answer (level clamped to the bank's bands; spoken_level keeps C1). */
export interface SpeakingAssessment {
  level: BankLevel;
  spoken_level: string;
  nclc: string;
  rubric: { task_completion: number; vocabulary: number; grammar: number; coherence_fluency: number };
  corrections: Array<{ said: string; better: string; reason: string }>;
  tip: string;
  transcript: string;
  word_count: number;
  words_per_minute: number | null;
  prompt_id: string;
}

export interface NclcRange {
  min: number;
  max: number;
  label: string;
}

export type GapDescriptor =
  | { kind: "no_target" }
  | { kind: "optional" }
  | { kind: "unassessed" }
  | { kind: "below_a1" }
  | { kind: "nclc_met"; target: number }
  | { kind: "nclc_close"; target: number }
  | { kind: "nclc_steps"; target: number; steps: number }
  | { kind: "cefr_met"; target: BankLevel }
  | { kind: "cefr_steps"; target: BankLevel; steps: number }
  | { kind: "outside_range"; target: string };

export interface PlacementResultSnapshot {
  levels: Record<SkillKey, ResultLevel | null>;
  states: Record<SkillKey, SkillResultState>;
  nclcEstimates: Record<SkillKey, NclcRange | null>;
  scores: Record<string, unknown>;
  grammarLevel: ResultLevel | null;
  grammarScore: { correct: number; total: number } | null;
  feedback: Record<string, string>;
  targetPerSkill: Record<SkillKey, string | null>;
  responses: Array<Record<string, unknown>>;
}

export interface PlacementResultRecord {
  id?: string;
  user_id?: string;
  taken_at?: string;
  created_at?: string;
  status?: string;
  level_per_skill?: string;
  nclc_estimate_per_skill?: string;
  skill_state_per_skill?: string;
  score_per_skill?: string;
  feedback_per_skill?: string;
  grammar_vocabulary_level?: string;
  grammar_vocabulary_score?: string;
  target_per_skill_at_test?: string;
  responses?: string;
  self_assessed_level?: string;
  source?: string;
  track?: string;
  speaking_assessed?: boolean;
  [key: string]: unknown;
}

export interface RetakeGate {
  blocked: boolean;
  availableAt: string | null;
  latest: PlacementResultRecord | null;
}

const LEVELS: BankLevel[] = ["A1", "A2", "B1", "B2"];
export const RETAKE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
export const AUTO_SECTION_LIMITS: Record<AutoSectionKey, { minimum: number; maximum: number }> = {
  listening: { minimum: 4, maximum: 6 },
  reading: { minimum: 4, maximum: 6 },
  grammar_vocabulary: { minimum: 6, maximum: 8 },
};

export function recordsFromResponse<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];
  if (response && typeof response === "object") {
    const records = (response as { data?: unknown }).data;
    if (Array.isArray(records)) return records as T[];
  }
  throw new Error("Unexpected entity list response.");
}

export function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return value && typeof value === "object" ? (value as T) : fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function dateValue(record: PlacementResultRecord): number {
  const value = Date.parse(record.taken_at || record.created_at || "");
  return Number.isFinite(value) ? value : 0;
}

export async function getRetakeGate(userEmail: string, now = Date.now()): Promise<RetakeGate> {
  const raw = await placement_result.filter({ created_by: userEmail, status: "assessed" }, "-created_at", 50);
  const assessed = recordsFromResponse<PlacementResultRecord>(raw)
    .filter((record) => record.status === "assessed")
    .sort((a, b) => dateValue(b) - dateValue(a));
  const latest = assessed[0] ?? null;
  if (!latest) return { blocked: false, availableAt: null, latest: null };

  const taken = dateValue(latest);
  if (!taken) return { blocked: false, availableAt: null, latest };
  const availableAt = new Date(taken + RETAKE_WINDOW_MS).toISOString();
  return { blocked: Date.parse(availableAt) > now, availableAt, latest };
}

export function formatRetakeDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function getBankLevel(level: string | null | undefined): BankLevel {
  if (level === "A2" || level === "B1" || level === "B2") return level;
  return "A1";
}

function levelIndex(level: BankLevel): number {
  return LEVELS.indexOf(level);
}

function levelAt(index: number): BankLevel {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, index))];
}

export function createAdaptiveRun(section: AutoSectionKey, selfAssessedLevel: string | null | undefined, bankSource: BankSource = "demo"): AdaptiveRun {
  const limits = AUTO_SECTION_LIMITS[section];
  const start = getBankLevel(selfAssessedLevel);
  return {
    bankSource,
    section,
    minimum: limits.minimum,
    maximum: limits.maximum,
    currentLevel: start,
    estimatedLevel: start,
    correctStreak: 0,
    wrongStreak: 0,
    askedIds: [],
    responses: [],
    levelStats: {
      A1: { total: 0, correct: 0 },
      A2: { total: 0, correct: 0 },
      B1: { total: 0, correct: 0 },
      B2: { total: 0, correct: 0 },
    },
    completed: false,
    completionReason: null,
  };
}

export function getNextQuestion(run: AdaptiveRun, items: unknown): QuestionItem | null {
  if (!run || run.completed || !Array.isArray(run.askedIds)) return null;
  return selectApprovedQuestionItems(items, run.bankSource ?? "demo")
    .filter((item) => {
      const needsVerifiedRepair = (KNOWN_DEFECTIVE_QUESTION_CODES as readonly string[]).includes(item.demo_code) && item.content_audit_version !== QUESTION_BANK_AUDIT_VERSION;
      return item.skill === run.section && item.cefr_level === run.currentLevel && !needsVerifiedRepair && !run.askedIds.includes(item.id);
    })
    .sort((a, b) => a.demo_code.localeCompare(b.demo_code))[0] ?? null;
}

export function applyAdaptiveAnswer(run: AdaptiveRun, item: QuestionItem, selectedOptionId: string): AdaptiveUpdate {
  const selectedOption = item.options.find((option) => option.id === selectedOptionId);
  const isCorrect = Boolean(selectedOption && selectedOptionId === item.answer_option_id);
  const response: AutoItemResponse = {
    item_id: item.id,
    demo_code: item.demo_code,
    section: run.section,
    level: item.cefr_level,
    selected_option_id: selectedOptionId,
    selected_answer: selectedOption?.text ?? "",
    is_correct: isCorrect,
    answered_at: new Date().toISOString(),
  };
  const levelStats = { ...run.levelStats, [item.cefr_level]: { ...run.levelStats[item.cefr_level] } };
  levelStats[item.cefr_level].total += 1;
  if (isCorrect) levelStats[item.cefr_level].correct += 1;

  let correctStreak = isCorrect ? run.correctStreak + 1 : 0;
  let wrongStreak = isCorrect ? 0 : run.wrongStreak + 1;
  let currentLevel = run.currentLevel;
  let estimatedLevel: ResultLevel = run.estimatedLevel;
  let movement: "up" | "down" | null = null;

  if (correctStreak >= 2) {
    const nextIndex = levelIndex(currentLevel) + 1;
    if (nextIndex < LEVELS.length) {
      currentLevel = levelAt(nextIndex);
      estimatedLevel = currentLevel;
      movement = "up";
      correctStreak = 0;
      wrongStreak = 0;
    }
  }

  if (wrongStreak >= 2) {
    const currentIndex = levelIndex(currentLevel);
    if (currentIndex === 0) {
      // A1 is the bank floor. Mark the estimate, but keep asking A1 items.
      estimatedLevel = "Below A1";
    } else {
      currentLevel = levelAt(currentIndex - 1);
      estimatedLevel = currentLevel;
      movement = "down";
      correctStreak = 0;
      wrongStreak = 0;
    }
  }

  const responses = [...run.responses, response];
  const askedIds = [...run.askedIds, item.id];
  const updated: AdaptiveRun = {
    ...run,
    currentLevel,
    estimatedLevel,
    correctStreak,
    wrongStreak,
    askedIds,
    responses,
    levelStats,
    completed: false,
    completionReason: null,
  };

  const currentStats = levelStats[currentLevel];
  if (responses.length >= run.minimum && currentStats.total >= 3 && currentStats.correct / currentStats.total >= 0.7) {
    updated.completed = true;
    updated.completionReason = "stable";
  } else if (responses.length >= run.maximum) {
    updated.completed = true;
    updated.completionReason = estimatedLevel === "Below A1" ? "below_a1" : "maximum";
  }

  return { run: updated, response, movement, completed: updated.completed };
}

export function summarizeAutoRun(run: AdaptiveRun): AutoSectionSummary {
  return {
    section: run.section,
    level: run.estimatedLevel,
    correct: run.responses.filter((response) => response.is_correct).length,
    total: run.responses.length,
    responses: run.responses,
    ...(run.completionReason === "audio_unavailable" ? { audioUnavailable: true } : {}),
  };
}

/** Plan 13: at most this many listening questions may be skipped for audio before the section ends unassessed. */
export const MAX_AUDIO_SKIPS = 3;

/**
 * Plan 13: the learner skipped a listening question because its audio would not load. The question is never served
 * again and never scored; after MAX_AUDIO_SKIPS the listening section ends and is reported as not assessed.
 */
export function skipListeningQuestion(run: AdaptiveRun, itemId: string): AdaptiveRun {
  if (run.section !== "listening") throw new Error("Only a listening question can be skipped for its audio.");
  const audioSkips = (run.audioSkips ?? 0) + 1;
  const ended = audioSkips >= MAX_AUDIO_SKIPS;
  return {
    ...run,
    askedIds: run.askedIds.includes(itemId) ? run.askedIds : [...run.askedIds, itemId],
    audioSkips,
    completed: run.completed || ended,
    completionReason: ended ? "audio_unavailable" : run.completionReason,
  };
}

export function countWords(value: string): number {
  return value.trim() ? value.trim().split(/\s+/u).filter(Boolean).length : 0;
}

export function bestWritingLevel(sections: AutoSectionSummary[], selfAssessedLevel: string | null | undefined): BankLevel {
  const observed = sections
    .map((section) => section.level)
    .filter((level): level is BankLevel => level !== "Below A1")
    .map(levelIndex)
    .sort((a, b) => a - b);
  if (observed.length) return levelAt(observed[Math.floor((observed.length - 1) / 2)]);
  return getBankLevel(selfAssessedLevel);
}

export function selectPrompt(prompts: PromptItem[], kind: "writing" | "speaking", level: BankLevel): PromptItem[] {
  return prompts
    .filter((prompt) => prompt.status === "approved" && prompt.kind === kind && prompt.cefr_level === level)
    .sort((a, b) => a.demo_code.localeCompare(b.demo_code));
}

export function nclcRangeForLevel(level: ResultLevel | null | undefined): NclcRange | null {
  if (level === "A1") return { min: 2, max: 2, label: "NCLC 2" };
  if (level === "A2") return { min: 3, max: 4, label: "NCLC 3–4" };
  if (level === "B1") return { min: 5, max: 7, label: "NCLC 5–7" };
  if (level === "B2") return { min: 8, max: 9, label: "NCLC 8–9" };
  return null;
}

export function assemblePlacementResult(input: {
  track: Track;
  targetPerSkill: Record<SkillKey, string | null>;
  autoSections: AutoSectionSummary[];
  writing: WritingAssessment | null;
  skippedSections: string[];
  speaking?: SpeakingAssessment | null;
}): PlacementResultSnapshot {
  const levels: PlacementResultSnapshot["levels"] = { L: null, R: null, W: null, S: null };
  const states: PlacementResultSnapshot["states"] = {
    L: "not_assessed",
    R: "not_assessed",
    W: "not_assessed",
    S: "not_assessed",
  };
  const nclcEstimates: PlacementResultSnapshot["nclcEstimates"] = { L: null, R: null, W: null, S: null };
  const scores: Record<string, unknown> = {};
  const feedback: Record<string, string> = {};
  const responses: Array<Record<string, unknown>> = [];
  let grammarLevel: ResultLevel | null = null;
  let grammarScore: { correct: number; total: number } | null = null;

  for (const summary of input.autoSections) {
    if (summary.section === "grammar_vocabulary") {
      grammarLevel = summary.level;
      grammarScore = { correct: summary.correct, total: summary.total };
      scores.GV = grammarScore;
    } else if (summary.section === "listening") {
      // Plan 13: listening questions play audio (never their transcript), so a finished section is assessed; a section
      // ended because the audio would not load is not assessed
      if (summary.audioUnavailable) {
        states.L = "not_assessed";
      } else {
        levels.L = summary.level;
        states.L = "assessed";
      }
      scores.L = { correct: summary.correct, total: summary.total };
    } else {
      levels.R = summary.level;
      states.R = "assessed";
      scores.R = { correct: summary.correct, total: summary.total };
    }
    responses.push(...summary.responses.map((response) => ({ ...response })));
  }

  if (input.skippedSections.includes("reading")) {
    states.R = "optional";
    levels.R = null;
  }
  if (input.skippedSections.includes("writing")) {
    states.W = "optional";
  } else if (input.writing) {
    levels.W = input.writing.level;
    states.W = "assessed";
    scores.W = input.writing.rubric;
    feedback.W = input.writing.feedback;
    responses.push({
      type: "writing",
      prompt_id: input.writing.prompt_id,
      prompt_level: input.writing.prompt_level,
      response_text: input.writing.response_text,
      word_count: input.writing.word_count,
      level: input.writing.level,
      rubric: input.writing.rubric,
      feedback: input.writing.feedback,
    });
  }

  if (input.speaking) {
    levels.S = input.speaking.level;
    states.S = "assessed";
    scores.S = input.speaking.rubric;
    feedback.S = input.speaking.tip;
    responses.push({
      type: "speaking",
      prompt_id: input.speaking.prompt_id,
      transcript: input.speaking.transcript,
      word_count: input.speaking.word_count,
      words_per_minute: input.speaking.words_per_minute,
      level: input.speaking.level,
      spoken_level: input.speaking.spoken_level,
      rubric: input.speaking.rubric,
      corrections: input.speaking.corrections,
      tip: input.speaking.tip,
    });
  }

  if (input.track !== "general") {
    (Object.keys(levels) as SkillKey[]).forEach((skill) => {
      const state = states[skill];
      if ((state === "assessed" || state === "transcript_only") && levels[skill]) {
        nclcEstimates[skill] = nclcRangeForLevel(levels[skill]);
      }
    });
  }

  return {
    levels,
    states,
    nclcEstimates,
    scores,
    grammarLevel,
    grammarScore,
    feedback,
    targetPerSkill: input.targetPerSkill,
    responses,
  };
}

function isSkillKey(value: string): value is SkillKey {
  return value === "L" || value === "R" || value === "W" || value === "S";
}

export function snapshotFromSavedRecord(record: PlacementResultRecord): PlacementResultSnapshot {
  const rawLevels = parseJsonValue<Record<string, unknown>>(record.level_per_skill, {});
  const rawStates = parseJsonValue<Record<string, unknown>>(record.skill_state_per_skill, {});
  const rawNclc = parseJsonValue<Record<string, unknown>>(record.nclc_estimate_per_skill, {});
  const rawScores = parseJsonValue<Record<string, unknown>>(record.score_per_skill, {});
  const rawFeedback = parseJsonValue<Record<string, unknown>>(record.feedback_per_skill, {});
  const rawTargets = parseJsonValue<Record<string, unknown>>(record.target_per_skill_at_test, {});
  const rawGrammarScore = parseJsonValue<Record<string, unknown>>(record.grammar_vocabulary_score, {});
  const levels: PlacementResultSnapshot["levels"] = { L: null, R: null, W: null, S: null };
  const states: PlacementResultSnapshot["states"] = { L: "not_assessed", R: "not_assessed", W: "not_assessed", S: "not_assessed" };
  const nclcEstimates: PlacementResultSnapshot["nclcEstimates"] = { L: null, R: null, W: null, S: null };
  const targetPerSkill: PlacementResultSnapshot["targetPerSkill"] = { L: null, R: null, W: null, S: null };

  (Object.keys(levels) as SkillKey[]).forEach((key) => {
    const level = rawLevels[key];
    if (typeof level === "string" && ([...LEVELS, "Below A1"] as string[]).includes(level)) levels[key] = level as ResultLevel;
    const state = rawStates[key];
    if (state === "assessed" || state === "transcript_only" || state === "optional" || state === "not_assessed") states[key] = state;
    const range = rawNclc[key] as NclcRange | null | undefined;
    if (range && typeof range === "object" && typeof range.min === "number" && typeof range.max === "number") {
      nclcEstimates[key] = { min: range.min, max: range.max, label: typeof range.label === "string" ? range.label : `NCLC ${range.min}–${range.max}` };
    }
    targetPerSkill[key] = typeof rawTargets[key] === "string" ? rawTargets[key] as string : null;
  });

  const feedback: Record<string, string> = {};
  Object.entries(rawFeedback).forEach(([key, value]) => {
    if (typeof value === "string") feedback[key] = value;
  });
  const grammar = typeof record.grammar_vocabulary_level === "string" && ([...LEVELS, "Below A1"] as string[]).includes(record.grammar_vocabulary_level)
    ? record.grammar_vocabulary_level as ResultLevel
    : null;
  const grammarTotal = typeof rawGrammarScore.total === "number" ? rawGrammarScore.total : 0;
  const grammarCorrect = typeof rawGrammarScore.correct === "number" ? rawGrammarScore.correct : 0;
  const responses = parseJsonValue<Array<Record<string, unknown>>>(record.responses, []);

  return {
    levels,
    states,
    nclcEstimates,
    scores: rawScores,
    grammarLevel: grammar,
    grammarScore: grammarTotal ? { correct: grammarCorrect, total: grammarTotal } : null,
    feedback,
    targetPerSkill,
    responses,
  };
}

export function describeTargetGap(
  level: ResultLevel | null,
  state: SkillResultState,
  target: string | null,
  track: Track,
): GapDescriptor {
  if (state === "optional") return { kind: "optional" };
  if (state === "not_assessed" || !level) return { kind: "unassessed" };
  if (level === "Below A1") return { kind: "below_a1" };
  if (!target) return { kind: "no_target" };

  if (track !== "general") {
    const match = target.match(/NCLC\s*(\d{1,2})/i);
    if (match) {
      const targetLevel = Number(match[1]);
      const range = nclcRangeForLevel(level);
      if (!range) return { kind: "below_a1" };
      if (range.min >= targetLevel) return { kind: "nclc_met", target: targetLevel };
      if (range.max >= targetLevel) return { kind: "nclc_close", target: targetLevel };
      return { kind: "nclc_steps", target: targetLevel, steps: targetLevel - range.max };
    }
  }

  const match = target.match(/(?:CEFR\s*)?(A1|A2|B1|B2|C1)/i);
  if (!match) return { kind: "no_target" };
  const targetLevel = match[1].toUpperCase();
  if (targetLevel === "C1") return { kind: "outside_range", target: targetLevel };
  const targetBankLevel = targetLevel as BankLevel;
  const currentIndex = levelIndex(level);
  const desiredIndex = levelIndex(targetBankLevel);
  if (currentIndex >= desiredIndex) return { kind: "cefr_met", target: targetBankLevel };
  return { kind: "cefr_steps", target: targetBankLevel, steps: desiredIndex - currentIndex };
}

export function displayLevel(level: ResultLevel | null): string {
  return level ?? "";
}

export function isSkillKeyName(value: string): value is SkillKey {
  return isSkillKey(value);
}

// Shared by the placement page and the server (backend Plan 3: the test is scored on the server).
export function parseTargetPerSkill(value: unknown): Record<SkillKey, string | null> {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = {};
    }
  }
  const record = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  return {
    L: typeof record.L === "string" && record.L ? record.L : null,
    R: typeof record.R === "string" && record.R ? record.R : null,
    W: typeof record.W === "string" && record.W ? record.W : null,
    S: typeof record.S === "string" && record.S ? record.S : null,
  };
}


export function readServicePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error("The scoring service returned no result.");
  const first = value as Record<string, unknown>;
  const data = first.data && typeof first.data === "object" ? first.data as Record<string, unknown> : first;
  const result = data.result && typeof data.result === "object" ? data.result as Record<string, unknown> : data;
  if (typeof result.error === "string") throw new Error(result.error);
  return result;
}

export function validateWritingAssessment(value: unknown, prompt: PromptItem, text: string): WritingAssessment {
  const result = readServicePayload(value);
  const assessment = result.assessment && typeof result.assessment === "object"
    ? result.assessment as Record<string, unknown>
    : result;
  const rubricSource = assessment.rubric && typeof assessment.rubric === "object"
    ? assessment.rubric as Record<string, unknown>
    : assessment;
  const keys: (keyof WritingRubric)[] = ["task_completion", "grammar", "vocabulary", "coherence"];
  const rubric = {} as WritingRubric;
  keys.forEach((key) => {
    const score = rubricSource[key];
    if (typeof score !== "number" || score < 0 || score > 4) throw new Error("The writing rubric could not be read. Please try again.");
    rubric[key] = score;
  });
  if (!isBankLevel(assessment.level) || typeof assessment.feedback !== "string" || !assessment.feedback.trim()) {
    throw new Error("The writing result could not be read. Please try again.");
  }
  return {
    level: assessment.level,
    feedback: assessment.feedback.trim(),
    rubric,
    prompt_id: prompt.id,
    prompt_level: prompt.cefr_level,
    response_text: text.trim(),
    word_count: countWords(text),
  };
}

export function validateQuestionBank(items: QuestionItem[]): boolean {
  const skills: AutoSectionKey[] = ["listening", "reading", "grammar_vocabulary"];
  const levels: BankLevel[] = ["A1", "A2", "B1", "B2"];
  return skills.every((skill) => levels.every((level) => items.filter((item) => item.skill === skill && item.cefr_level === level).length >= 10));
}

export function validatePromptBank(items: PromptItem[]): boolean {
  const kinds = ["writing", "speaking"] as const;
  const levels: BankLevel[] = ["A1", "A2", "B1", "B2"];
  return kinds.every((kind) => levels.every((level) => items.filter((item) => item.kind === kind && item.cefr_level === level && item.status === "approved").length >= 2));
}
