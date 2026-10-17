// GENERATED from parle-app/functions/parle-public-level-check.helper.ts by scripts/sync-app-code.ts. Do not edit.
export type PublicCheckSkill = "reading" | "listening";
export type BankLevel = "A1" | "A2" | "B1" | "B2";
export type EstimatedLevel = BankLevel | "Below A1";

export interface PublicChoice {
  id: string;
  text: string;
}

export interface PublicLevelCheckQuestion {
  id: string;
  skill: PublicCheckSkill;
  prompt: string;
  options: PublicChoice[];
  passage?: string;
  /** Plan 13: a listening question's prepared audio; its transcript never reaches the browser. */
  audioUrl?: string;
}

export interface PublicLevelCheckSubmission {
  questionId: string;
  choiceId: string;
}

export interface PublicLevelCheckScore {
  reading: EstimatedLevel;
  listening: EstimatedLevel;
  isDemo: boolean;
}

export interface PublicLevelCheckQuestionScoreMapping {
  questionId: string;
  skill: PublicCheckSkill;
  level: BankLevel;
  options: Array<{
    choiceId: string;
    isCorrect: boolean;
  }>;
}

export interface PrivatePublicLevelCheckMapping {
  isDemo: boolean;
  questions: PublicLevelCheckQuestionScoreMapping[];
}

export interface PublicQuestionProjection {
  questions: PublicLevelCheckQuestion[];
  isDemo: boolean;
}

export interface PublicQuestionSet {
  publicProjection: PublicQuestionProjection;
  privateMapping: PrivatePublicLevelCheckMapping;
}

interface BankChoice {
  id: string;
  text: string;
}

interface BankQuestion {
  id: string;
  skill: PublicCheckSkill;
  level: BankLevel;
  isDemo: boolean;
  prompt: string;
  passage: string;
  transcript: string;
  options: BankChoice[];
  answerOptionId: string;
}

interface SkillResponse {
  level: BankLevel;
  isCorrect: boolean;
}

export interface PublicLevelCheckRunStore {
  findByRunId(runId: string): Promise<unknown | null>;
  deleteById(recordId: string): Promise<void>;
}

const LEVELS: BankLevel[] = ["A1", "A2", "B1", "B2"];
const QUESTIONS_PER_SKILL = 5;
const TOTAL_QUESTIONS = QUESTIONS_PER_SKILL * 2;
const MAX_PROMPT_LENGTH = 1800;
const MAX_CONTEXT_LENGTH = 6000;
const MAX_CHOICE_LENGTH = 1200;
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_MAPPING_JSON_LENGTH = 32_000;
const OPAQUE_CHOICE_ID_PATTERN = /^opt_[0-9a-f]{32}$/;
const PUBLIC_RUN_ID_PATTERN = /^run_[0-9a-f]{32}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/\r\n?/g, "\n");
}

function stableOptionId(sourceId: string, index: number): string {
  const slug = sourceId.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "question";
  return `${slug}-option-${index + 1}`;
}

function secureRandomHex(): string {
  const secureCrypto = globalThis.crypto;
  if (!secureCrypto || typeof secureCrypto.getRandomValues !== "function") {
    throw new Error("Secure random values are unavailable.");
  }
  const bytes = secureCrypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function uniqueOpaqueChoiceId(usedIds: Set<string>): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = `opt_${secureRandomHex()}`;
    if (!usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
  }
  throw new Error("Could not create a unique secure choice ID.");
}

/** Creates the opaque run identifier returned to the level-check browser. */
export function createPublicLevelCheckRunId(): string {
  return `run_${secureRandomHex()}`;
}

/** Accepts only identifiers created by the secure run-ID generator. */
export function parsePublicLevelCheckRunId(value: unknown): string | null {
  return typeof value === "string" && PUBLIC_RUN_ID_PATTERN.test(value) ? value : null;
}

function comparableAnswer(value: string): string {
  return normalizedText(value).trim().normalize("NFC").toLocaleLowerCase();
}

function isSkill(value: unknown): value is PublicCheckSkill {
  return value === "reading" || value === "listening";
}

function isBankLevel(value: unknown): value is BankLevel {
  return value === "A1" || value === "A2" || value === "B1" || value === "B2";
}

function normalizeBankQuestion(value: unknown): BankQuestion | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const skill = value.skill;
  const level = value.cefr_level;
  if (!id || id.length > MAX_IDENTIFIER_LENGTH || !isSkill(skill) || !isBankLevel(level)) return null;
  if (value.status !== "approved" || typeof value.is_test_data !== "boolean") return null;
  const format = typeof value.format === "string" ? value.format : "multiple_choice";
  if (format !== "multiple_choice") return null;

  const prompt = normalizedText(value.prompt);
  const passage = normalizedText(value.passage);
  const transcript = normalizedText(value.transcript);
  if (!prompt.trim() || prompt.length > MAX_PROMPT_LENGTH) return null;
  if (passage.length > MAX_CONTEXT_LENGTH || transcript.length > MAX_CONTEXT_LENGTH) return null;
  if (skill === "listening" && !transcript.trim()) return null;

  const sourceOptions = Array.isArray(value.options) ? value.options : [];
  if (sourceOptions.length < 2 || sourceOptions.length > 4) return null;
  const optionSourceId = typeof value.demo_code === "string" && value.demo_code.trim()
    ? value.demo_code
    : id;
  const options: BankChoice[] = sourceOptions.flatMap((entry, index) => {
    if (typeof entry === "string") {
      const text = normalizedText(entry);
      return text.trim() && text.length <= MAX_CHOICE_LENGTH
        ? [{ id: stableOptionId(optionSourceId, index), text }]
        : [];
    }
    if (!isRecord(entry)) return [];
    const text = normalizedText(entry.text);
    const optionId = typeof entry.id === "string" && entry.id.trim()
      ? entry.id.trim()
      : stableOptionId(optionSourceId, index);
    return text.trim() && text.length <= MAX_CHOICE_LENGTH && optionId.length <= MAX_IDENTIFIER_LENGTH
      ? [{ id: optionId, text }]
      : [];
  });
  if (options.length !== sourceOptions.length || options.length < 2 || options.length > 4) return null;
  const optionIds = options.map((option) => option.id);
  if (new Set(optionIds).size !== optionIds.length) return null;

  const suppliedAnswerId = typeof value.answer_option_id === "string" ? value.answer_option_id.trim() : "";
  let answerOptionId = options.some((option) => option.id === suppliedAnswerId) ? suppliedAnswerId : "";
  if (!answerOptionId && typeof value.answer === "string" && value.answer.trim()) {
    const matches = options.filter((option) => comparableAnswer(option.text) === comparableAnswer(value.answer as string));
    if (matches.length === 1) answerOptionId = matches[0].id;
  }
  if (!answerOptionId || options.filter((option) => option.id === answerOptionId).length !== 1) return null;

  return {
    id,
    skill,
    level,
    isDemo: value.is_test_data,
    prompt,
    passage,
    transcript,
    options,
    answerOptionId,
  };
}

function normalizeApprovedBank(rows: unknown[]): BankQuestion[] {
  const seen = new Set<string>();
  const items: BankQuestion[] = [];
  for (const row of rows) {
    const item = normalizeBankQuestion(row);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items;
}

function randomIndex(length: number, random: () => number): number {
  if (length <= 1) return 0;
  const supplied = random();
  const bounded = Number.isFinite(supplied)
    ? Math.max(0, Math.min(supplied, 0.9999999999999999))
    : Math.random();
  return Math.floor(bounded * length);
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1, random);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function pickOne<T>(items: T[], random: () => number): T {
  return items[randomIndex(items.length, random)];
}

function hasBalancedSet(items: BankQuestion[]): boolean {
  return (items.filter((item) => item.skill === "reading").length >= QUESTIONS_PER_SKILL) &&
    (items.filter((item) => item.skill === "listening").length >= QUESTIONS_PER_SKILL);
}

function selectFive(items: BankQuestion[], random: () => number): BankQuestion[] {
  const levelGroups = LEVELS
    .map((level) => items.filter((item) => item.level === level))
    .filter((group) => group.length > 0);
  const selected = levelGroups.slice(0, QUESTIONS_PER_SKILL).map((group) => pickOne(group, random));
  const selectedIds = new Set(selected.map((item) => item.id));
  const remaining = items.filter((item) => !selectedIds.has(item.id));
  const needed = QUESTIONS_PER_SKILL - selected.length;
  selected.push(...shuffled(remaining, random).slice(0, needed));
  return shuffled(selected, random);
}

function toPublicQuestionAndMapping(
  item: BankQuestion,
  random: () => number,
  usedChoiceIds: Set<string>,
  audio: Map<string, string> = new Map(),
): { question: PublicLevelCheckQuestion; mapping: PublicLevelCheckQuestionScoreMapping } {
  const displayedOptions = shuffled(item.options, random).map((option) => {
    const choiceId = uniqueOpaqueChoiceId(usedChoiceIds);
    return {
      publicChoice: { id: choiceId, text: option.text },
      scoreChoice: { choiceId, isCorrect: option.id === item.answerOptionId },
    };
  });
  const question: PublicLevelCheckQuestion = {
    id: item.id,
    skill: item.skill,
    prompt: item.prompt,
    options: displayedOptions.map(({ publicChoice }) => publicChoice),
  };
  if (item.skill === "reading" && item.passage.trim()) question.passage = item.passage;
  if (item.skill === "listening") question.audioUrl = audio.get(item.id) ?? "";

  return {
    question,
    mapping: {
      questionId: item.id,
      skill: item.skill,
      level: item.level,
      options: displayedOptions.map(({ scoreChoice }) => scoreChoice),
    },
  };
}

/**
 * Returns a fresh balanced set from one bank. With a source (the question_bank_source switch, bank readers fix) only
 * that bank is used; without one, approved non-demo items are preferred when five of each skill exist.
 */
export function selectPublicLevelCheckQuestions(
  rows: unknown[],
  random: () => number = Math.random,
  source?: "demo" | "real",
  /** Plan 13: prepared audio per item; only these items can be listening questions (the check is used signed out). */
  audio: Map<string, string> = new Map(),
): PublicQuestionSet | null {
  const questions = normalizeApprovedBank(rows).filter((item) => item.skill !== "listening" || audio.has(item.id));
  const nonDemo = questions.filter((item) => !item.isDemo);
  const demo = questions.filter((item) => item.isDemo);
  const useDemo = source ? source === "demo" : !hasBalancedSet(nonDemo);
  const pool = useDemo ? demo : nonDemo;
  if (!hasBalancedSet(pool)) return null;

  const reading = selectFive(pool.filter((item) => item.skill === "reading"), random);
  const listening = selectFive(pool.filter((item) => item.skill === "listening"), random);
  if (reading.length !== QUESTIONS_PER_SKILL || listening.length !== QUESTIONS_PER_SKILL) return null;
  const selected = shuffled([...reading, ...listening], random);
  if (selected.length !== TOTAL_QUESTIONS || new Set(selected.map((item) => item.id)).size !== TOTAL_QUESTIONS) return null;

  const usedChoiceIds = new Set<string>();
  const displayed = selected.map((item) => toPublicQuestionAndMapping(item, random, usedChoiceIds, audio));
  return {
    publicProjection: {
      questions: displayed.map(({ question }) => question),
      isDemo: useDemo,
    },
    privateMapping: {
      isDemo: useDemo,
      questions: displayed.map(({ mapping }) => mapping),
    },
  };
}

/** Rejects malformed or duplicate answers before any protected record read occurs. */
export function parsePublicLevelCheckSubmissions(value: unknown): PublicLevelCheckSubmission[] | null {
  if (!Array.isArray(value) || value.length !== TOTAL_QUESTIONS) return null;
  const seenQuestions = new Set<string>();
  const seenChoices = new Set<string>();
  const submissions: PublicLevelCheckSubmission[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.questionId !== "string" || typeof entry.choiceId !== "string") return null;
    const questionId = entry.questionId.trim();
    const choiceId = entry.choiceId.trim();
    if (!questionId || !choiceId || questionId.length > MAX_IDENTIFIER_LENGTH || choiceId.length > MAX_IDENTIFIER_LENGTH) return null;
    if (!OPAQUE_CHOICE_ID_PATTERN.test(choiceId) || seenQuestions.has(questionId) || seenChoices.has(choiceId)) return null;
    seenQuestions.add(questionId);
    seenChoices.add(choiceId);
    submissions.push({ questionId, choiceId });
  }
  return submissions;
}

/** Validates the private run mapping before using it as the score source. */
export function parsePrivatePublicLevelCheckMapping(value: unknown): PrivatePublicLevelCheckMapping | null {
  if (!isRecord(value) || typeof value.isDemo !== "boolean" || !Array.isArray(value.questions)) return null;
  if (value.questions.length !== TOTAL_QUESTIONS) return null;

  const questionIds = new Set<string>();
  const choiceIds = new Set<string>();
  const questions: PublicLevelCheckQuestionScoreMapping[] = [];
  let readingCount = 0;
  let listeningCount = 0;

  for (const entry of value.questions) {
    if (!isRecord(entry)) return null;
    const questionId = typeof entry.questionId === "string" ? entry.questionId : "";
    const skill = entry.skill;
    const level = entry.level;
    if (!questionId || questionId.trim() !== questionId || questionId.length > MAX_IDENTIFIER_LENGTH) return null;
    if (questionIds.has(questionId) || !isSkill(skill) || !isBankLevel(level)) return null;
    if (skill === "reading") readingCount += 1;
    else listeningCount += 1;
    if (!Array.isArray(entry.options) || entry.options.length < 2 || entry.options.length > 4) return null;

    const options: Array<{ choiceId: string; isCorrect: boolean }> = [];
    let correctCount = 0;
    for (const rawOption of entry.options) {
      if (!isRecord(rawOption) || typeof rawOption.choiceId !== "string" || typeof rawOption.isCorrect !== "boolean") return null;
      const choiceId = rawOption.choiceId;
      if (!OPAQUE_CHOICE_ID_PATTERN.test(choiceId) || choiceIds.has(choiceId)) return null;
      if (rawOption.isCorrect) correctCount += 1;
      choiceIds.add(choiceId);
      options.push({ choiceId, isCorrect: rawOption.isCorrect });
    }
    if (correctCount !== 1) return null;
    questionIds.add(questionId);
    questions.push({ questionId, skill, level, options });
  }

  if (readingCount !== QUESTIONS_PER_SKILL || listeningCount !== QUESTIONS_PER_SKILL) return null;
  return { isDemo: value.isDemo, questions };
}

function estimateSkill(responses: SkillResponse[]): EstimatedLevel {
  const byLevel = new Map<BankLevel, SkillResponse[]>();
  for (const response of responses) {
    const group = byLevel.get(response.level) ?? [];
    group.push(response);
    byLevel.set(response.level, group);
  }

  const floor = byLevel.get("A1") ?? [];
  if (floor.length >= 2 && floor.every((response) => !response.isCorrect)) return "Below A1";

  let estimate: BankLevel = "A1";
  for (const level of LEVELS) {
    const atLevel = byLevel.get(level) ?? [];
    if (!atLevel.length) break;
    const correctRate = atLevel.filter((response) => response.isCorrect).length / atLevel.length;
    if (correctRate < 0.7) break;
    estimate = level;
  }
  return estimate;
}

/** Scores only by the trusted mapping saved for one run, never by the current bank order. */
export function scorePublicLevelCheck(
  mappingValue: unknown,
  submittedValue: unknown,
): PublicLevelCheckScore | null {
  const mapping = parsePrivatePublicLevelCheckMapping(mappingValue);
  const submissions = parsePublicLevelCheckSubmissions(submittedValue);
  if (!mapping || !submissions) return null;

  const byQuestionId = new Map(mapping.questions.map((question) => [question.questionId, question]));
  const selected: Array<{ question: PublicLevelCheckQuestionScoreMapping; isCorrect: boolean }> = [];
  for (const submission of submissions) {
    const question = byQuestionId.get(submission.questionId);
    if (!question) return null;
    const option = question.options.find((candidate) => candidate.choiceId === submission.choiceId);
    if (!option) return null;
    selected.push({ question, isCorrect: option.isCorrect });
  }

  const reading = selected.filter((entry) => entry.question.skill === "reading");
  const listening = selected.filter((entry) => entry.question.skill === "listening");
  if (reading.length !== QUESTIONS_PER_SKILL || listening.length !== QUESTIONS_PER_SKILL) return null;

  const skillResponses = (items: typeof selected): SkillResponse[] => items.map(({ question, isCorrect }) => ({
    level: question.level,
    isCorrect,
  }));
  return {
    reading: estimateSkill(skillResponses(reading)),
    listening: estimateSkill(skillResponses(listening)),
    isDemo: mapping.isDemo,
  };
}

interface StoredPublicLevelCheckRun {
  id: string;
  runId: string;
  expiresAt: string;
  questionMappingJson: string;
}

function normalizeStoredRun(value: unknown, expectedRunId: string): StoredPublicLevelCheckRun | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const runId = parsePublicLevelCheckRunId(value.run_id);
  const expiresAt = typeof value.expires_at === "string" ? value.expires_at : "";
  const questionMappingJson = typeof value.question_mapping_json === "string" ? value.question_mapping_json : "";
  if (!id || id.length > MAX_IDENTIFIER_LENGTH || runId !== expectedRunId) return null;
  if (!expiresAt || !questionMappingJson || questionMappingJson.length > MAX_MAPPING_JSON_LENGTH) return null;
  return { id, runId, expiresAt, questionMappingJson };
}

/** Scores a valid unexpired run and deletes its private mapping before returning the result. */
export async function scorePublicLevelCheckRun(
  runIdValue: unknown,
  submittedValue: unknown,
  store: PublicLevelCheckRunStore,
  nowMs = Date.now(),
): Promise<PublicLevelCheckScore | null> {
  const runId = parsePublicLevelCheckRunId(runIdValue);
  const submissions = parsePublicLevelCheckSubmissions(submittedValue);
  if (!runId || !submissions || !Number.isFinite(nowMs)) return null;

  const rawRun = await store.findByRunId(runId);
  const run = normalizeStoredRun(rawRun, runId);
  if (!run) return null;
  const expiresAt = Date.parse(run.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) return null;

  let privateMapping: unknown;
  try {
    privateMapping = JSON.parse(run.questionMappingJson);
  } catch {
    return null;
  }
  const score = scorePublicLevelCheck(privateMapping, submissions);
  if (!score) return null;

  await store.deleteById(run.id);
  return score;
}
