import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { User } from "@/entities";
import { parleAssessmentService, parleMarketplaceService } from "@/functions";
import { t } from "@/lib/i18n";
import {
  isQuestionItemReady,
  normalizeQuestionItem,
  normalizeStoredText,
  QUESTION_BANK_AUDIT_VERSION,
  recordsFromResponse,
  type QuestionItem,
  type QuestionOption,
} from "@/lib/placement-test";

const EXPECTED_QUESTIONS = 120;
const EXPECTED_PROMPTS = 16;
const AUDIT_BATCH_SIZE = 10;
const QUESTION_CONTENT_FIELDS = ["prompt", "passage", "transcript", "options", "answer_option_id", "answer", "explanation"] as const;
const QUESTION_TEXT_FIELDS = ["prompt", "passage", "transcript", "explanation"] as const;
const KNOWN_DEFECTIVE_CODES = new Set(["R-A2-02", "L-B1-04", "GV-B1-09", "GV-B2-07", "GV-B2-10"]);

type BankKind = "question" | "prompt";
type ReviewDecision = "pending" | "accepted" | "kept" | "clean";
type KnownIssue = "nora" | "train" | "excluded" | null;
type GenericRecord = Record<string, unknown> & { id: string; demo_code: string };
type RecordPatch = Record<string, unknown>;

interface AuditFinding {
  issue_found: boolean;
  issue_summary: string;
  needs_human_review: boolean;
  patch: Record<string, unknown>;
}

interface ReviewedRecord {
  key: string;
  kind: BankKind;
  recordId: string;
  demoCode: string;
  raw: GenericRecord;
  basePatch: RecordPatch;
  suggestedPatch: RecordPatch;
  patch: RecordPatch;
  finding: AuditFinding;
  knownIssue: KnownIssue;
  flagged: boolean;
  decision: ReviewDecision;
  validationError: string;
}

interface BankSnapshot {
  questions: GenericRecord[];
  prompts: GenericRecord[];
}

interface AdminAccount {
  id?: string;
  email?: string;
  full_name?: string;
  role?: string;
  [key: string]: unknown;
}

interface ApplyFailure {
  code: string;
  message: string;
}

interface ApplyReport {
  updated: number;
  failures: ApplyFailure[];
  countVerified: boolean;
  idsVerified: boolean;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function messageForError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Unknown error";
}

function unwrapBankServiceResponse(value: unknown): Record<string, unknown> {
  let current: unknown = value;
  for (let index = 0; index < 6; index += 1) {
    const record = objectValue(current);
    if (!record) break;
    if (objectValue(record.result)) {
      current = record.result;
      continue;
    }
    const data = objectValue(record.data);
    if (data && ("status" in data || "error" in data || "questions" in data || "prompts" in data)) {
      current = data;
      continue;
    }
    break;
  }
  return objectValue(current) ?? {};
}

async function bankServiceAction(values: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = unwrapBankServiceResponse(await parleMarketplaceService(values));
  if (typeof response.error === "string" || response.status === "error") {
    const code = typeof response.code === "string" && response.code
      ? response.code
      : typeof response.error === "string" ? response.error : "BANK_ACTION_FAILED";
    throw new Error(code);
  }
  if (response.status !== "complete") throw new Error("BANK_RESPONSE_INVALID");
  return response;
}

function stableOptionId(demoCode: string, index: number): string {
  const slug = demoCode.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "question";
  return `${slug}-option-${index + 1}`;
}

function comparableText(value: string): string {
  return normalizeStoredText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase();
}

function prepareQuestion(raw: GenericRecord): QuestionItem {
  const normalized = normalizeQuestionItem(raw);
  const usedIds = new Set<string>();
  const options = normalized.options.map((option, index) => {
    let id = option.id.trim() || stableOptionId(normalized.demo_code, index);
    if (usedIds.has(id)) {
      id = stableOptionId(normalized.demo_code, index);
      let suffix = 2;
      while (usedIds.has(id)) {
        id = `${stableOptionId(normalized.demo_code, index)}-${suffix}`;
        suffix += 1;
      }
    }
    usedIds.add(id);
    return { id, text: normalizeStoredText(option.text) };
  });

  const rawAnswerId = typeof raw.answer_option_id === "string" ? raw.answer_option_id : "";
  const rawAnswerText = typeof raw.answer === "string" ? normalizeStoredText(raw.answer) : "";
  const rawOptionRows = Array.isArray(raw.options) ? raw.options : [];
  const rawAnswerIdCount = rawOptionRows.filter((entry) => {
    const option = objectValue(entry);
    return option?.id === rawAnswerId;
  }).length;
  let answerOptionId = rawAnswerId && rawAnswerIdCount === 1 && options.some((option) => option.id === rawAnswerId)
    ? rawAnswerId
    : "";

  if (!answerOptionId && rawAnswerText) {
    const answerMatches = options.filter((option) => comparableText(option.text) === comparableText(rawAnswerText));
    if (answerMatches.length === 1) answerOptionId = answerMatches[0].id;
  }
  if (!answerOptionId && rawAnswerId && normalized.options.filter((option) => option.id === rawAnswerId).length === 1) {
    const originalIndex = normalized.options.findIndex((option) => option.id === rawAnswerId);
    answerOptionId = options[originalIndex]?.id ?? "";
  }

  const answer = options.find((option) => option.id === answerOptionId)?.text ?? rawAnswerText;
  return { ...normalized, options, answer_option_id: answerOptionId, answer };
}

function questionBasePatch(raw: GenericRecord, question: QuestionItem): RecordPatch {
  const patch: RecordPatch = {};
  for (const field of QUESTION_TEXT_FIELDS) {
    const saved = raw[field];
    if (typeof saved === "string") {
      const normalized = normalizeStoredText(saved);
      if (normalized !== saved) patch[field] = normalized;
    }
  }

  if (JSON.stringify(raw.options) !== JSON.stringify(question.options)) patch.options = question.options;
  if (question.answer_option_id && raw.answer_option_id !== question.answer_option_id) {
    patch.answer_option_id = question.answer_option_id;
  }
  if (typeof raw.answer === "string") {
    const normalizedAnswer = normalizeStoredText(raw.answer);
    const alignedAnswer = question.answer_option_id ? question.answer : normalizedAnswer;
    if (alignedAnswer !== raw.answer) patch.answer = alignedAnswer;
  }
  return patch;
}

function promptBasePatch(raw: GenericRecord): RecordPatch {
  const patch: RecordPatch = {};
  if (typeof raw.text === "string") {
    const normalized = normalizeStoredText(raw.text);
    if (normalized !== raw.text) patch.text = normalized;
  }
  return patch;
}

function knownIssueFor(raw: GenericRecord, question: QuestionItem | null): KnownIssue {
  if (KNOWN_DEFECTIVE_CODES.has(raw.demo_code)) return "excluded";
  if (!question) return null;
  const prompt = comparableText(question.prompt);
  const passage = comparableText(`${question.passage ?? ""}\n${question.transcript ?? ""}`);
  if (prompt.includes("nora") && prompt.includes("autre chemin") && /(lieu|rendez.?vous|rencontre|retrouver|endroit)/.test(passage)) return "nora";

  const correct = question.options.find((option) => option.id === question.answer_option_id);
  const explanation = comparableText(question.explanation);
  if (correct && explanation.includes("elle arrive plus tard") && comparableText(correct.text).includes("il arrive plus tard")) return "train";
  return null;
}

function hasNonNullPatch(patch: unknown): boolean {
  const value = objectValue(patch);
  return Boolean(value && Object.values(value).some((field) => field !== null && field !== undefined));
}

function auditInput(kind: BankKind, raw: GenericRecord): Record<string, unknown> {
  if (kind === "prompt") {
    return {
      demo_code: raw.demo_code,
      kind: typeof raw.kind === "string" ? raw.kind : "",
      cefr_level: typeof raw.cefr_level === "string" ? raw.cefr_level : "",
      text: typeof raw.text === "string" ? normalizeStoredText(raw.text) : "",
    };
  }
  const question = prepareQuestion(raw);
  return {
    demo_code: raw.demo_code,
    skill: question.skill,
    cefr_level: question.cefr_level,
    prompt: question.prompt,
    passage: question.passage ?? "",
    transcript: question.transcript ?? "",
    options: question.options,
    answer_option_id: typeof raw.answer_option_id === "string" ? raw.answer_option_id : "",
    stored_answer_text: typeof raw.answer === "string" ? normalizeStoredText(raw.answer) : "",
    explanation: question.explanation,
  };
}

function sanitizeQuestionSuggestion(
  rawPatch: Record<string, unknown>,
  raw: GenericRecord,
  question: QuestionItem,
  basePatch: RecordPatch,
): { patch: RecordPatch; invalid: boolean } {
  const patch: RecordPatch = { ...basePatch };
  let invalid = false;
  for (const field of QUESTION_TEXT_FIELDS) {
    const value = rawPatch[field];
    if (value === null || value === undefined) continue;
    if (typeof value === "string") patch[field] = normalizeStoredText(value);
    else invalid = true;
  }

  const suggestedOptions = rawPatch.options;
  if (suggestedOptions !== null && suggestedOptions !== undefined) {
    if (!Array.isArray(suggestedOptions) || suggestedOptions.length !== question.options.length) {
      invalid = true;
    } else {
      const expectedIds = new Set(question.options.map((option) => option.id));
      const seenIds = new Set<string>();
      const safeOptions: QuestionOption[] = [];
      for (const value of suggestedOptions) {
        const option = objectValue(value);
        if (!option || typeof option.id !== "string" || typeof option.text !== "string" || !expectedIds.has(option.id) || seenIds.has(option.id)) {
          invalid = true;
          break;
        }
        seenIds.add(option.id);
        safeOptions.push({ id: option.id, text: normalizeStoredText(option.text) });
      }
      if (!invalid && safeOptions.length === question.options.length && seenIds.size === expectedIds.size) patch.options = safeOptions;
    }
  }

  const suggestedAnswerId = rawPatch.answer_option_id;
  if (suggestedAnswerId !== null && suggestedAnswerId !== undefined) {
    if (typeof suggestedAnswerId !== "string" || !question.options.some((option) => option.id === suggestedAnswerId)) invalid = true;
    else patch.answer_option_id = suggestedAnswerId;
  }
  const suggestedAnswer = rawPatch.answer;
  if (suggestedAnswer !== null && suggestedAnswer !== undefined) {
    if (typeof suggestedAnswer === "string") patch.answer = normalizeStoredText(suggestedAnswer);
    else invalid = true;
  }

  const candidateOptions = Array.isArray(patch.options) ? patch.options as QuestionOption[] : question.options;
  const candidateAnswerId = typeof patch.answer_option_id === "string" ? patch.answer_option_id : question.answer_option_id;
  const selectedAnswer = candidateOptions.find((option) => option.id === candidateAnswerId);
  if (candidateAnswerId && selectedAnswer) {
    if (raw.answer !== selectedAnswer.text || patch.answer !== undefined) patch.answer = selectedAnswer.text;
    else delete patch.answer;
  }

  if (raw.answer_option_id !== candidateAnswerId && candidateAnswerId) patch.answer_option_id = candidateAnswerId;
  if (!candidateAnswerId || candidateOptions.filter((option) => option.id === candidateAnswerId).length !== 1) invalid = true;
  return { patch, invalid };
}

function sanitizePromptSuggestion(rawPatch: Record<string, unknown>, basePatch: RecordPatch): { patch: RecordPatch; invalid: boolean } {
  const patch: RecordPatch = { ...basePatch };
  const value = rawPatch.text;
  let invalid = false;
  if (value !== null && value !== undefined) {
    if (typeof value === "string") patch.text = normalizeStoredText(value);
    else invalid = true;
  }
  return { patch, invalid };
}

function extractAuditResults(value: unknown): Record<string, unknown>[] {
  let current: unknown = value;
  for (let index = 0; index < 6; index += 1) {
    const record = objectValue(current);
    if (!record) break;
    if (typeof record.error === "string" && record.error) throw new Error(record.error);
    if (objectValue(record.data)) {
      current = record.data;
      continue;
    }
    if (objectValue(record.result)) {
      current = record.result;
      continue;
    }
    if (objectValue(record.body)) {
      current = record.body;
      continue;
    }
    break;
  }
  const response = objectValue(current);
  if (!response) throw new Error("The audit returned no record list.");
  if (typeof response.error === "string") throw new Error(response.error);
  const audit = objectValue(response.audit) ?? response;
  if (!Array.isArray(audit.results)) throw new Error("The audit did not return a complete result list.");
  return audit.results.map((entry) => {
    const result = objectValue(entry);
    if (!result || typeof result.demo_code !== "string" || typeof result.issue_found !== "boolean" || typeof result.needs_human_review !== "boolean") {
      throw new Error("The audit returned an incomplete item result.");
    }
    if (typeof result.issue_summary !== "string" || !objectValue(result.patch)) throw new Error("The audit returned an invalid correction preview.");
    return result;
  });
}

function makeReviewedRecord(kind: BankKind, raw: GenericRecord, rawFinding: Record<string, unknown>): ReviewedRecord {
  const question = kind === "question" ? prepareQuestion(raw) : null;
  const basePatch = kind === "question" && question ? questionBasePatch(raw, question) : promptBasePatch(raw);
  const knownIssue = knownIssueFor(raw, question);
  const modelPatch = objectValue(rawFinding.patch) ?? {};
  const suggestionExists = hasNonNullPatch(modelPatch);
  const sanitized = kind === "question" && question
    ? sanitizeQuestionSuggestion(modelPatch, raw, question, basePatch)
    : sanitizePromptSuggestion(modelPatch, basePatch);
  const patch: RecordPatch = { ...sanitized.patch, content_audit_version: QUESTION_BANK_AUDIT_VERSION };
  const summary = typeof rawFinding.issue_summary === "string" ? rawFinding.issue_summary.trim() : "";
  const issueFound = rawFinding.issue_found === true || suggestionExists || Boolean(knownIssue) || sanitized.invalid;
  const needsHumanReview = rawFinding.needs_human_review === true || Boolean(knownIssue) || sanitized.invalid;
  const validationCandidate: QuestionItem | null = question ? {
    ...question,
    prompt: typeof patch.prompt === "string" ? patch.prompt : question.prompt,
    passage: typeof patch.passage === "string" ? patch.passage : question.passage,
    transcript: typeof patch.transcript === "string" ? patch.transcript : question.transcript,
    explanation: typeof patch.explanation === "string" ? patch.explanation : question.explanation,
    options: Array.isArray(patch.options) ? patch.options as QuestionOption[] : question.options,
    answer_option_id: typeof patch.answer_option_id === "string" ? patch.answer_option_id : question.answer_option_id,
    answer: typeof patch.answer === "string" ? patch.answer : question.answer,
  } : null;
  const validationError = validationCandidate && !isQuestionItemReady(validationCandidate) ? "question.invalidKey" : "";
  const flagged = issueFound || needsHumanReview || Boolean(validationError);
  const finding: AuditFinding = {
    issue_found: issueFound,
    issue_summary: summary,
    needs_human_review: needsHumanReview,
    patch: modelPatch,
  };
  return {
    key: `${kind}:${raw.demo_code}`,
    kind,
    recordId: raw.id,
    demoCode: raw.demo_code,
    raw,
    basePatch: { ...basePatch, content_audit_version: QUESTION_BANK_AUDIT_VERSION },
    suggestedPatch: { ...patch },
    patch,
    finding,
    knownIssue,
    flagged,
    decision: flagged ? "pending" : "clean",
    validationError,
  };
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    prompt: t("adminBank.promptLabel"),
    passage: t("adminBank.passageLabel"),
    transcript: t("adminBank.transcriptLabel"),
    explanation: t("adminBank.explanationLabel"),
    options: t("placement.question.chooseAnswer"),
    answer_option_id: t("adminBank.answerLabel"),
    answer: t("adminBank.answerLabel"),
    text: t("adminBank.promptTextLabel"),
    content_audit_version: t("adminBank.auditVersion"),
  };
  return labels[field] ?? field;
}

function displayValue(value: unknown, options?: QuestionOption[]): string {
  if (Array.isArray(value)) {
    const safe = value.flatMap((entry, index) => {
      const record = objectValue(entry);
      if (record && typeof record.text === "string") {
        const letter = String.fromCharCode(65 + index);
        return [`${letter}. ${record.text}`];
      }
      if (typeof entry === "string") return [`${String.fromCharCode(65 + index)}. ${entry}`];
      return [];
    });
    return safe.join("\n");
  }
  if (typeof value === "string") {
    if ((value.startsWith("option") || value.includes("-option-")) && options) {
      return options.find((option) => option.id === value)?.text ?? value;
    }
    return value;
  }
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function sourceValue(row: ReviewedRecord, field: string): unknown {
  if (row.kind === "question") {
    const question = prepareQuestion(row.raw);
    if (field === "options") return row.raw.options;
    if (field === "answer_option_id" || field === "answer") {
      return field === "answer_option_id" ? row.raw.answer_option_id : row.raw.answer;
    }
    return row.raw[field] ?? question[field as keyof QuestionItem];
  }
  return row.raw[field];
}

function proposedValue(row: ReviewedRecord, field: string): unknown {
  if (field in row.patch) return row.patch[field];
  if (row.kind === "question") {
    const question = prepareQuestion(row.raw);
    if (field === "options") return question.options;
    if (field === "answer_option_id") return question.answer_option_id;
    if (field === "answer") return question.answer;
    return question[field as keyof QuestionItem];
  }
  return row.raw[field];
}

function questionForRow(row: ReviewedRecord): QuestionItem {
  const base = prepareQuestion(row.raw);
  const options = Array.isArray(row.patch.options) ? row.patch.options as QuestionOption[] : base.options;
  const answerOptionId = typeof row.patch.answer_option_id === "string" ? row.patch.answer_option_id : base.answer_option_id;
  return {
    ...base,
    prompt: typeof row.patch.prompt === "string" ? row.patch.prompt : base.prompt,
    passage: typeof row.patch.passage === "string" ? row.patch.passage : base.passage,
    transcript: typeof row.patch.transcript === "string" ? row.patch.transcript : base.transcript,
    explanation: typeof row.patch.explanation === "string" ? row.patch.explanation : base.explanation,
    options,
    answer_option_id: answerOptionId,
    answer: typeof row.patch.answer === "string" ? row.patch.answer : base.answer,
  };
}

function hasContentCorrection(row: ReviewedRecord): boolean {
  if (row.kind !== "question") return Object.keys(row.patch).some((field) => field !== "content_audit_version");
  const prepared = prepareQuestion(row.raw);
  return QUESTION_CONTENT_FIELDS.some((field) => {
    const current = field === "options" ? prepared.options : prepared[field as keyof QuestionItem];
    const proposed = field in row.patch ? row.patch[field] : current;
    return JSON.stringify(proposed) !== JSON.stringify(current);
  });
}

function requiredCorrectionMissing(row: ReviewedRecord): boolean {
  if (!row.knownIssue) return false;
  const prepared = prepareQuestion(row.raw);
  if (row.knownIssue === "nora") {
    const proposed = typeof row.patch.prompt === "string" ? comparableText(row.patch.prompt) : "";
    const mentionsMeetingPlace = /(lieu|rendez.?vous|rencontre|retrouver|endroit|point de rencontre)/.test(proposed);
    return !row.patch.prompt || row.patch.prompt === prepared.prompt || !mentionsMeetingPlace || proposed.includes("autre chemin");
  }
  if (row.knownIssue === "train") {
    return !row.patch.explanation || row.patch.explanation === prepared.explanation || comparableText(String(row.patch.explanation)).includes("elle arrive plus tard");
  }
  return !hasContentCorrection(row);
}

function contentSnapshot(record: GenericRecord, kind: BankKind): string {
  const fields = kind === "question"
    ? ["demo_code", "skill", "cefr_level", "prompt", "passage", "transcript", "options", "answer_option_id", "answer", "explanation", "status", "is_test_data"]
    : ["demo_code", "kind", "cefr_level", "text", "status", "is_test_data"];
  return JSON.stringify(Object.fromEntries(fields.map((field) => [field, record[field] ?? null])));
}

function hasUniqueBankIdentity(snapshot: BankSnapshot): boolean {
  const all = [...snapshot.questions, ...snapshot.prompts];
  return all.every((record) => Boolean(record.id && record.demo_code)) &&
    new Set(all.map((record) => record.id)).size === all.length &&
    new Set(all.map((record) => record.demo_code)).size === all.length;
}

function sameRecordIds(expected: GenericRecord[], actual: GenericRecord[]): boolean {
  const expectedIds = new Set(expected.map((record) => record.id));
  const actualIds = new Set(actual.map((record) => record.id));
  return expected.length === actual.length &&
    expectedIds.size === expected.length &&
    actualIds.size === actual.length &&
    expectedIds.size === actualIds.size &&
    [...expectedIds].every((id) => actualIds.has(id));
}

function sameBankRecordIds(expected: BankSnapshot, actual: BankSnapshot): boolean {
  return sameRecordIds(expected.questions, actual.questions) && sameRecordIds(expected.prompts, actual.prompts);
}

function cleanPatch(kind: BankKind, patch: RecordPatch): RecordPatch {
  const allowed = kind === "question"
    ? [...QUESTION_TEXT_FIELDS, "options", "answer_option_id", "answer", "content_audit_version"]
    : ["text", "content_audit_version"];
  return Object.fromEntries(allowed.filter((field) => field in patch && patch[field] !== undefined).map((field) => [field, patch[field]]));
}

export default function AdminQuestionBankRepair() {
  const [account, setAccount] = useState<AdminAccount | null>(null);
  const [accessState, setAccessState] = useState<"checking" | "ready" | "denied">("checking");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [bank, setBank] = useState<BankSnapshot>({ questions: [], prompts: [] });
  const [loadError, setLoadError] = useState("");
  const [auditRows, setAuditRows] = useState<ReviewedRecord[]>([]);
  const [auditState, setAuditState] = useState<"idle" | "running" | "partial" | "complete">("idle");
  const [auditProgress, setAuditProgress] = useState({ done: 0, total: EXPECTED_QUESTIONS + EXPECTED_PROMPTS });
  const [auditError, setAuditError] = useState("");
  const [activeTab, setActiveTab] = useState<BankKind>("question");
  const [search, setSearch] = useState("");
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [applyState, setApplyState] = useState<"idle" | "running" | "complete" | "partial" | "error">("idle");
  const [applyProgress, setApplyProgress] = useState({ done: 0, total: 0 });
  const [applyError, setApplyError] = useState("");
  const [applyReport, setApplyReport] = useState<ApplyReport | null>(null);

  const fetchBank = useCallback(async (): Promise<BankSnapshot> => {
    const response = await bankServiceAction({ action: "admin_get_demo_bank" });
    const questions = recordsFromResponse<GenericRecord>(response.questions).filter((record) => record.is_test_data === true);
    const prompts = recordsFromResponse<GenericRecord>(response.prompts).filter((record) => record.is_test_data === true);
    return { questions, prompts };
  }, []);

  const loadBank = useCallback(async (resetAudit = true) => {
    setLoadState("loading");
    setLoadError("");
    try {
      const loaded = await fetchBank();
      setBank(loaded);
      setLoadState("ready");
      if (resetAudit) {
        setAuditRows([]);
        setAuditState("idle");
        setAuditProgress({ done: 0, total: loaded.questions.length + loaded.prompts.length });
        setAuditError("");
        setConfirmApply(false);
        setApplyState("idle");
        setApplyReport(null);
        setApplyError("");
      }
      return loaded;
    } catch (error) {
      console.error("Parle question-bank records could not be loaded", error instanceof Error ? error.name : "unknown");
      setLoadError(messageForError(error));
      setLoadState("error");
      throw error;
    }
  }, [fetchBank]);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      let current: AdminAccount;
      try {
        current = await User.me() as AdminAccount;
      } catch (error) {
        console.error("Parle administrator question-bank access failed", error instanceof Error ? error.name : "unknown");
        if (active) {
          setAccessState("denied");
          setLoadState("ready");
        }
        return;
      }
      if (!active) return;
      if (current?.role !== "administrator") {
        setAccessState("denied");
        setLoadState("ready");
        return;
      }
      setAccount(current);
      setAccessState("ready");
      try {
        await loadBank();
      } catch {
        // loadBank presents its own recoverable error state.
      }
    };
    void initialize();
    return () => {
      active = false;
    };
  }, [loadBank]);

  const countMatches = bank.questions.length === EXPECTED_QUESTIONS && bank.prompts.length === EXPECTED_PROMPTS;
  const recordIdsValid = useMemo(() => hasUniqueBankIdentity(bank), [bank]);
  const auditComplete = auditState === "complete" && auditRows.length === EXPECTED_QUESTIONS + EXPECTED_PROMPTS;
  const pendingDecisionCount = auditRows.filter((row) => row.flagged && row.decision === "pending").length;
  const unresolvedCorrectionCount = auditRows.filter(requiredCorrectionMissing).length;
  const invalidQuestionCount = auditRows.filter((row) => Boolean(row.validationError)).length;
  const updateCount = auditRows.filter((row) => Object.keys(cleanPatch(row.kind, row.patch)).length > 0).length;
  const rowsForTab = useMemo(() => auditRows.filter((row) => row.kind === activeTab), [auditRows, activeTab]);
  const filteredRows = useMemo(() => {
    const searchTerm = comparableText(search);
    return rowsForTab.filter((row) => {
      if (issuesOnly && !row.flagged && !Object.keys(row.patch).some((field) => field !== "content_audit_version")) return false;
      if (!searchTerm) return true;
      const searchable = comparableText([
        row.demoCode,
        row.finding.issue_summary,
        ...Object.entries(row.raw).filter(([, value]) => typeof value === "string").map(([, value]) => value as string),
        ...Object.entries(row.patch).filter(([, value]) => typeof value === "string").map(([, value]) => value as string),
      ].join(" "));
      return searchable.includes(searchTerm);
    });
  }, [rowsForTab, search, issuesOnly]);
  const issueCount = auditRows.filter((row) => row.flagged).length;
  const canStartAudit = accessState === "ready" && loadState === "ready" && countMatches && recordIdsValid && auditState !== "running" && auditState !== "complete" && applyState !== "running";
  const canApply = auditComplete && countMatches && recordIdsValid && pendingDecisionCount === 0 && unresolvedCorrectionCount === 0 && invalidQuestionCount === 0 && confirmApply && applyState !== "running" && applyState !== "partial" && applyState !== "error";

  function replaceAuditRow(key: string, update: (row: ReviewedRecord) => ReviewedRecord) {
    setAuditRows((current) => current.map((row) => row.key === key ? update(row) : row));
  }

  function reviewFinding(row: ReviewedRecord, decision: "accepted" | "kept") {
    replaceAuditRow(row.key, (current) => ({
      ...current,
      decision,
      patch: decision === "kept"
        ? { ...current.basePatch, content_audit_version: QUESTION_BANK_AUDIT_VERSION }
        : { ...current.suggestedPatch },
    }));
  }

  function markManualReview(row: ReviewedRecord) {
    replaceAuditRow(row.key, (current) => ({ ...current, decision: "accepted" }));
  }

  function markRowChanged(current: ReviewedRecord, patch: RecordPatch): ReviewedRecord {
    const updated: ReviewedRecord = {
      ...current,
      patch,
      flagged: true,
      finding: { ...current.finding, needs_human_review: true },
      decision: "pending",
    };
    if (updated.kind === "question") {
      updated.validationError = isQuestionItemReady(questionForRow(updated)) ? "" : "question.invalidKey";
    }
    return updated;
  }

  function updateTextField(row: ReviewedRecord, field: string, value: string) {
    replaceAuditRow(row.key, (current) => {
      const nextPatch = { ...current.patch };
      const normalized = normalizeStoredText(value);
      if (field in current.basePatch) nextPatch[field] = current.basePatch[field];
      else delete nextPatch[field];
      const baseValue = current.kind === "question"
        ? prepareQuestion(current.raw)[field as keyof QuestionItem]
        : normalizeStoredText(typeof current.raw[field] === "string" ? current.raw[field] as string : "");
      if (normalized !== baseValue) nextPatch[field] = normalized;
      return markRowChanged(current, nextPatch);
    });
  }

  function updateQuestionOption(row: ReviewedRecord, index: number, value: string) {
    replaceAuditRow(row.key, (current) => {
      const question = questionForRow(current);
      const options = question.options.map((option, optionIndex) => optionIndex === index ? { ...option, text: normalizeStoredText(value) } : option);
      const baseline = prepareQuestion(current.raw).options;
      const nextPatch = { ...current.patch };
      if (JSON.stringify(options) === JSON.stringify(baseline) && !("options" in current.basePatch)) delete nextPatch.options;
      else nextPatch.options = options;
      const answer = options.find((option) => option.id === question.answer_option_id);
      if (answer && (answer.text !== current.raw.answer || "answer" in current.basePatch || "answer" in current.patch)) nextPatch.answer = answer.text;
      return markRowChanged(current, nextPatch);
    });
  }

  function updateCorrectOption(row: ReviewedRecord, optionId: string) {
    replaceAuditRow(row.key, (current) => {
      const question = questionForRow(current);
      const selected = question.options.find((option) => option.id === optionId);
      if (!selected) return current;
      const baseline = prepareQuestion(current.raw);
      const nextPatch = { ...current.patch };
      if (optionId === baseline.answer_option_id && !("answer_option_id" in current.basePatch)) delete nextPatch.answer_option_id;
      else nextPatch.answer_option_id = optionId;
      if (selected.text === current.raw.answer && !("answer" in current.basePatch)) delete nextPatch.answer;
      else nextPatch.answer = selected.text;
      return markRowChanged(current, nextPatch);
    });
  }

  async function runFullAudit() {
    if (!canStartAudit) return;
    setAuditError("");
    setAuditState("running");
    setConfirmApply(false);
    setApplyState("idle");
    setApplyReport(null);

    const workingRows = [...auditRows];
    const existingKeys = new Set(workingRows.map((row) => row.key));
    const allToAudit: Array<{ kind: BankKind; raw: GenericRecord }> = [
      ...bank.questions.map((raw) => ({ kind: "question" as const, raw })),
      ...bank.prompts.map((raw) => ({ kind: "prompt" as const, raw })),
    ].filter(({ kind, raw }) => !existingKeys.has(`${kind}:${raw.demo_code}`));
    const total = bank.questions.length + bank.prompts.length;
    setAuditProgress({ done: workingRows.length, total });

    try {
      for (const kind of ["question", "prompt"] as const) {
        const source = allToAudit.filter((record) => record.kind === kind);
        for (let offset = 0; offset < source.length; offset += AUDIT_BATCH_SIZE) {
          const batch = source.slice(offset, offset + AUDIT_BATCH_SIZE);
          const response = await parleAssessmentService({
            action: "audit_question_bank",
            kind,
            items: batch.map(({ raw }) => auditInput(kind, raw)),
          });
          const results = extractAuditResults(response);
          const byCode = new Map(results.map((result) => [result.demo_code as string, result]));
          if (byCode.size !== batch.length || batch.some(({ raw }) => !byCode.has(raw.demo_code))) {
            throw new Error("The audit did not return one finding for every item in this batch.");
          }
          for (const { raw } of batch) {
            const result = byCode.get(raw.demo_code)!;
            workingRows.push(makeReviewedRecord(kind, raw, result));
          }
          setAuditRows([...workingRows]);
          setAuditProgress({ done: workingRows.length, total });
        }
      }
      const ordered = [
        ...bank.questions.map((raw) => workingRows.find((row) => row.key === `question:${raw.demo_code}`)).filter((row): row is ReviewedRecord => Boolean(row)),
        ...bank.prompts.map((raw) => workingRows.find((row) => row.key === `prompt:${raw.demo_code}`)).filter((row): row is ReviewedRecord => Boolean(row)),
      ];
      setAuditRows(ordered);
      if (ordered.length !== total) throw new Error("The audit did not cover every loaded record.");
      setAuditProgress({ done: total, total });
      setAuditState("complete");
    } catch (error) {
      console.error("Parle administrator question-bank audit failed", error instanceof Error ? error.name : "unknown");
      setAuditError(messageForError(error));
      setAuditProgress({ done: workingRows.length, total });
      setAuditState("partial");
    }
  }

  async function applyReviewedChanges() {
    if (!canApply || account?.role !== "administrator") return;
    setApplyState("running");
    setApplyError("");
    setApplyReport(null);
    const all = [...auditRows];
    const total = all.length;
    setApplyProgress({ done: 0, total });
    const failures: ApplyFailure[] = [];
    let updated = 0;

    try {
      const currentUser = await User.me() as AdminAccount;
      if (currentUser?.role !== "administrator") throw new Error(t("adminBank.accessRequired"));
      const latestBank = await fetchBank();
      if (
        latestBank.questions.length !== EXPECTED_QUESTIONS ||
        latestBank.prompts.length !== EXPECTED_PROMPTS ||
        !hasUniqueBankIdentity(latestBank) ||
        !sameBankRecordIds(bank, latestBank)
      ) {
        throw new Error(t("adminBank.stale"));
      }
      const latestQuestionById = new Map(latestBank.questions.map((record) => [record.id, record]));
      const latestPromptById = new Map(latestBank.prompts.map((record) => [record.id, record]));
      for (const row of all) {
        const current = row.kind === "question"
          ? latestQuestionById.get(row.recordId)
          : latestPromptById.get(row.recordId);
        if (!current || contentSnapshot(current, row.kind) !== contentSnapshot(row.raw, row.kind)) {
          throw new Error(t("adminBank.stale"));
        }
      }

      for (const row of all) {
        const patch = cleanPatch(row.kind, row.patch);
        if (Object.keys(patch).length === 0) {
          failures.push({ code: row.demoCode, message: "No update fields were prepared." });
          setApplyProgress({ done: updated + failures.length, total });
          continue;
        }
        try {
          await bankServiceAction({
            action: "admin_update_demo_bank_content",
            kind: row.kind,
            record_id: row.recordId,
            patch,
          });
          updated += 1;
        } catch (error) {
          failures.push({ code: row.demoCode, message: messageForError(error) });
        }
        setApplyProgress({ done: updated + failures.length, total });
      }

      const verifiedBank = await fetchBank();
      const countVerified = verifiedBank.questions.length === EXPECTED_QUESTIONS && verifiedBank.prompts.length === EXPECTED_PROMPTS;
      const idsVerified = hasUniqueBankIdentity(verifiedBank) && sameBankRecordIds(bank, verifiedBank);
      const report = { updated, failures, countVerified, idsVerified };
      setApplyReport(report);
      setBank(verifiedBank);
      if (failures.length || !countVerified || !idsVerified) {
        setApplyState("partial");
        if (!countVerified || !idsVerified) setApplyError(t("adminBank.verifyFail"));
      } else {
        setApplyState("complete");
        setConfirmApply(false);
      }
    } catch (error) {
      console.error("Parle administrator question-bank repair could not be applied", error instanceof Error ? error.name : "unknown");
      setApplyError(messageForError(error));
      setApplyState("error");
    }
  }

  const currentTabRows = filteredRows;
  const readyToAuditCount = bank.questions.length + bank.prompts.length;
  const visibleName = account?.full_name || account?.email || "Administrator";

  if (accessState === "checking") {
    return (
      <div role="status" aria-live="polite" className="flex min-h-64 items-center justify-center rounded-[1.6rem] border border-primary/10 bg-white p-8 text-sm font-semibold text-muted-foreground">
        <Loader2 aria-hidden="true" className="mr-3 h-5 w-5 animate-spin text-primary" />{t("role.loading")}
      </div>
    );
  }

  if (accessState === "denied") {
    return (
      <section className="mx-auto max-w-2xl rounded-[1.7rem] border border-[#F0C5C0] bg-white p-6 shadow-sm sm:p-8" role="alert">
        <ShieldAlert aria-hidden="true" className="h-7 w-7 text-[#A13F36]" />
        <h2 className="mt-4 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{t("adminBank.accessTitle")}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("adminBank.accessRequired")}</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[1.8rem] bg-primary p-5 text-white shadow-[0_24px_68px_-46px_rgba(30,58,138,0.65)] sm:p-8"
      >
        <div aria-hidden="true" className="absolute -right-16 -top-24 h-64 w-64 rounded-full border border-white/10" />
        <div aria-hidden="true" className="absolute -right-2 -top-14 h-44 w-44 rounded-full border border-[#FFC0B4]/20" />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-[#FFC0B4]"><FileSearch aria-hidden="true" className="h-5 w-5" /></span>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#FFC0B4]">{t("adminBank.eyebrow")}</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white/90">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-[#FFC0B4]" />{t("adminBank.signedIn").replace("{email}", account?.email ?? visibleName)}
            </span>
          </div>
          <h2 className="mt-5 max-w-3xl font-display text-3xl font-extrabold leading-tight tracking-[-0.05em] sm:text-4xl">{t("adminBank.title")}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-white/80 sm:text-base">{t("adminBank.intro")}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold">{t("adminBank.questionsCount").replace("{count}", String(bank.questions.length))}</span>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold">{t("adminBank.promptsCount").replace("{count}", String(bank.prompts.length))}</span>
            <span className="rounded-full border border-[#FFC0B4]/30 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/90">{t("adminBank.testOnly")}</span>
          </div>
        </div>
      </motion.section>

      {loadState === "loading" ? (
        <section role="status" aria-live="polite" className="flex min-h-48 items-center justify-center rounded-[1.6rem] border border-primary/10 bg-white p-8 text-sm font-semibold text-muted-foreground">
          <Loader2 aria-hidden="true" className="mr-3 h-5 w-5 animate-spin text-primary" />{t("adminBank.loading")}
        </section>
      ) : loadState === "error" ? (
        <section className="rounded-[1.6rem] border border-[#F0C5C0] bg-white p-6" role="alert">
          <p className="font-bold text-[#8D342D]">{t("adminBank.loadError")}</p>
          {loadError && <p className="mt-2 break-words text-xs leading-5 text-muted-foreground">{loadError}</p>}
          <button type="button" onClick={() => void loadBank()} className="parle-button-secondary mt-5 justify-center"><RefreshCw aria-hidden="true" className="h-4 w-4" />{t("adminBank.reload")}</button>
        </section>
      ) : (
        <>
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
            <div className="rounded-[1.6rem] border border-primary/10 bg-white p-5 shadow-[0_18px_46px_-38px_rgba(30,58,138,0.3)] sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary"><Sparkles aria-hidden="true" className="h-5 w-5" /></span>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#C64D43]">{t("adminBank.auditTitle")}</p>
                  <h3 className="mt-1 font-display text-xl font-extrabold tracking-[-0.035em] text-primary">{t("adminBank.auditBody")}</h3>
                </div>
              </div>
              <p className="mt-4 rounded-xl border border-primary/10 bg-[#FAF9F5] px-4 py-3 text-xs leading-5 text-muted-foreground">{t("adminBank.auditSafe")}</p>
              {!countMatches && <p role="alert" className="mt-4 rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-4 py-3 text-sm font-semibold leading-6 text-[#8D342D]">{t("adminBank.countMismatch").replace("{questions}", String(bank.questions.length)).replace("{prompts}", String(bank.prompts.length))}</p>}
              {countMatches && !recordIdsValid && <p role="alert" className="mt-4 rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-4 py-3 text-sm font-semibold leading-6 text-[#8D342D]">{t("adminBank.recordIdentityError")}</p>}
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" onClick={() => void runFullAudit()} disabled={!canStartAudit} className="parle-button-primary justify-center disabled:cursor-not-allowed disabled:opacity-50">
                  {auditState === "running" ? <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />{t("adminBank.auditRunning").replace("{done}", String(auditProgress.done)).replace("{total}", String(auditProgress.total))}</> : auditState === "complete" ? <><CheckCircle2 aria-hidden="true" className="h-4 w-4" />{t("adminBank.auditCompleteButton")}</> : <><ClipboardCheck aria-hidden="true" className="h-4 w-4" />{auditRows.length ? t("adminBank.continueAudit") : t("adminBank.auditButton")}</>}
                </button>
                <span className="text-xs font-semibold text-muted-foreground">{auditRows.length} / {readyToAuditCount} {t("adminBank.recordsAudited")}</span>
              </div>
              {auditState === "running" && (
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#E9EDF5]" role="progressbar" aria-label={t("adminBank.auditProgressLabel")} aria-valuemin={0} aria-valuemax={auditProgress.total} aria-valuenow={auditProgress.done}>
                  <motion.div className="h-full rounded-full bg-[#F97362]" initial={false} animate={{ width: `${auditProgress.total ? auditProgress.done / auditProgress.total * 100 : 0}%` }} transition={{ duration: 0.25 }} />
                </div>
              )}
              {auditState === "complete" && <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-[#B9D9CB] bg-[#F0F8F4] px-4 py-3 text-sm font-semibold leading-6 text-[#236146]"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{t("adminBank.auditComplete")}</p>}
              {auditError && <p role="alert" className="mt-4 rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-4 py-3 text-sm leading-6 text-[#8D342D]">{t("adminBank.auditError")} {auditError}</p>}
            </div>

            <div className="rounded-[1.6rem] border border-primary/10 bg-white p-5 shadow-[0_18px_46px_-38px_rgba(30,58,138,0.3)] sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><ShieldCheck aria-hidden="true" className="h-5 w-5" /></span>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#C64D43]">{t("adminBank.reviewTitle")}</p>
                  <h3 className="mt-1 font-display text-xl font-extrabold tracking-[-0.035em] text-primary">{t("adminBank.issueCount").replace("{count}", String(issueCount))}</h3>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">{t("adminBank.reviewBody")}</p>
              <div className="mt-5 space-y-2 border-t border-primary/10 pt-4 text-xs font-semibold leading-5 text-muted-foreground">
                <p>{t("adminBank.reviewedCount").replace("{done}", String(Math.max(0, issueCount - pendingDecisionCount))).replace("{total}", String(issueCount))}</p>
                {unresolvedCorrectionCount > 0 && <p className="text-[#8D342D]">{t("adminBank.correctionRequired").replace("{count}", String(unresolvedCorrectionCount))}</p>}
                {invalidQuestionCount > 0 && <p className="text-[#8D342D]">{t("adminBank.invalidQuestionCount").replace("{count}", String(invalidQuestionCount))}</p>}
              </div>
            </div>
          </section>

          <AnimatePresence initial={false}>
            {auditRows.length > 0 && (
              <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="overflow-hidden rounded-[1.7rem] border border-primary/10 bg-white shadow-[0_20px_56px_-42px_rgba(30,58,138,0.35)]">
                <div className="border-b border-primary/10 p-5 sm:p-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#C64D43]">{t("adminBank.previewTitle")}</p>
                      <h3 className="mt-1 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{t("adminBank.previewBody").replace("{count}", String(updateCount))}</h3>
                      <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">{t("adminBank.auditMarkerNote")}</p>
                    </div>
                    <label className="relative block w-full xl:max-w-sm">
                      <span className="sr-only">{t("adminBank.search")}</span>
                      <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" aria-label={t("adminBank.search")} placeholder={t("adminBank.search")} className="min-h-11 w-full rounded-xl border border-input bg-white pl-10 pr-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
                    </label>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <div role="tablist" aria-label={t("adminBank.bankTabs")} className="inline-flex rounded-full border border-primary/10 bg-[#F7F8FB] p-1">
                      {(["question", "prompt"] as const).map((kind) => (
                        <button key={kind} id={`bank-tab-${kind}`} type="button" role="tab" aria-selected={activeTab === kind} aria-controls={`bank-panel-${kind}`} onClick={() => setActiveTab(kind)} className={`min-h-10 rounded-full px-4 text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${activeTab === kind ? "bg-primary text-white shadow-sm" : "text-primary hover:bg-white"}`}>
                          {t(kind === "question" ? "adminBank.tabQuestions" : "adminBank.tabPrompts")}
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <input type="checkbox" checked={issuesOnly} onChange={(event) => setIssuesOnly(event.target.checked)} className="h-4 w-4 rounded border-input accent-primary" />
                      {t("adminBank.findingsOnly")}
                    </label>
                  </div>
                </div>

                <div id={`bank-panel-${activeTab}`} role="tabpanel" aria-labelledby={`bank-tab-${activeTab}`} className="divide-y divide-primary/10">
                  {currentTabRows.length === 0 || filteredRows.length === 0 ? (
                    <p className="p-6 text-sm leading-6 text-muted-foreground">{t("adminBank.noMatchingRecords")}</p>
                  ) : filteredRows.map((row) => {
                    const question = row.kind === "question" ? questionForRow(row) : null;
                    const fields = row.kind === "question"
                      ? ["prompt", "passage", "transcript", "options", "answer_option_id", "answer", "explanation"]
                      : ["text"];
                    const changedFields = fields.filter((field) => field in row.patch && JSON.stringify(row.patch[field]) !== JSON.stringify(sourceValue(row, field)));
                    const knownMessageKey = row.knownIssue === "nora" ? "adminBank.knownNora" : row.knownIssue === "train" ? "adminBank.knownTrain" : row.knownIssue === "excluded" ? "adminBank.knownNeedsChange" : null;
                    const hasSuggestion = hasNonNullPatch(row.finding.patch);
                    const contentNeedsCorrection = requiredCorrectionMissing(row);
                    const itemTitle = `${row.demoCode}${typeof row.raw.cefr_level === "string" ? ` · ${row.raw.cefr_level}` : ""}`;
                    return (
                      <article key={row.key} className={`p-5 sm:p-6 ${row.flagged && row.decision === "pending" ? "bg-[#FFFDFC]" : "bg-white"}`}>
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-display text-lg font-extrabold tracking-[-0.025em] text-primary">{itemTitle}</h4>
                              <span className="rounded-full bg-[#EEF2FA] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-primary">{t(row.kind === "question" ? "adminBank.questionType" : "adminBank.promptType")}</span>
                              {row.decision === "pending" && <span className="rounded-full bg-[#FFF0EC] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#8D342D]">{t("adminBank.pending")}</span>}
                              {row.decision === "accepted" && <span className="rounded-full bg-[#EAF5EF] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#236146]">{t("adminBank.approved")}</span>}
                              {row.decision === "kept" && <span className="rounded-full bg-[#EEF2FA] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-primary">{t("adminBank.kept")}</span>}
                              {row.decision === "clean" && <span className="rounded-full bg-[#F1F3F7] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{t("adminBank.clear")}</span>}
                            </div>
                            {knownMessageKey && <p className="mt-3 flex items-start gap-2 rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-3.5 py-3 text-xs font-semibold leading-5 text-[#75413D]"><AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#A13F36]" />{t(knownMessageKey)}</p>}
                            {row.finding.issue_summary && <p className="mt-3 text-sm leading-6 text-foreground">{row.finding.issue_summary}</p>}
                            {!row.finding.issue_summary && !row.flagged && <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("adminBank.noIssues")}</p>}
                            {row.finding.needs_human_review && <p className="mt-2 text-xs font-bold leading-5 text-[#8D342D]">{t("adminBank.needsHumanReview")}</p>}
                            {row.validationError && <p role="alert" className="mt-2 text-xs font-bold leading-5 text-[#8D342D]">{t("adminBank.invalidQuestion")}</p>}
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row xl:shrink-0">
                            {row.flagged && hasSuggestion && row.decision !== "kept" && (
                              <button type="button" onClick={() => reviewFinding(row, "accepted")} className="parle-button-secondary min-h-10 justify-center px-4 text-xs">
                                <Check aria-hidden="true" className="h-4 w-4" />{t("adminBank.useSuggestion")}
                              </button>
                            )}
                            {row.flagged && !row.knownIssue && (
                              <button type="button" onClick={() => reviewFinding(row, "kept")} className="min-h-10 rounded-full border border-primary/15 bg-white px-4 text-xs font-bold text-primary transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                                {t("adminBank.keepCurrent")}
                              </button>
                            )}
                            {row.flagged && row.decision === "pending" && (
                              <button type="button" onClick={() => markManualReview(row)} className="parle-button-secondary min-h-10 justify-center px-4 text-xs">
                                <Check aria-hidden="true" className="h-4 w-4" />{t("adminBank.markEdited")}
                              </button>
                            )}
                          </div>
                        </div>

                        <details className="group mt-4 rounded-2xl border border-primary/10 bg-[#FAF9F5]">
                          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-extrabold text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent">
                            <span className="flex items-center gap-2"><FileSearch aria-hidden="true" className="h-4 w-4" />{t("adminBank.editContent")}</span>
                            <span aria-hidden="true" className="text-base transition group-open:rotate-180">⌄</span>
                          </summary>
                          <div className="space-y-5 border-t border-primary/10 p-4 sm:p-5">
                            {changedFields.length > 0 ? (
                              <div>
                                <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-primary">{t("adminBank.currentContent")} / {t("adminBank.suggestedContent")}</p>
                                <div className="mt-3 space-y-3">
                                  {changedFields.map((field) => (
                                    <div key={field} className="grid gap-2 rounded-xl border border-primary/10 bg-white p-3 md:grid-cols-2">
                                      <div className="min-w-0">
                                        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">{t("adminBank.currentContent")} · {fieldLabel(field)}</p>
                                        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-foreground">{displayValue(sourceValue(row, field), prepareQuestion(row.raw).options)}</p>
                                      </div>
                                      <div className="min-w-0 border-t border-primary/10 pt-2 md:border-l md:border-t-0 md:pl-3 md:pt-0">
                                        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#236146]">{t("adminBank.suggestedContent")} · {fieldLabel(field)}</p>
                                        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-foreground">{displayValue(proposedValue(row, field), question?.options)}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : !hasSuggestion && row.flagged ? (
                              <p className="rounded-xl border border-[#E8EAF0] bg-white px-4 py-3 text-xs leading-5 text-muted-foreground">{t("adminBank.noPatch")}</p>
                            ) : null}

                            {row.kind === "question" && question ? (
                              <div className="grid gap-4">
                                <label className="block text-xs font-extrabold text-primary">
                                  {t("adminBank.promptLabel")}
                                  <textarea value={question.prompt} onChange={(event) => updateTextField(row, "prompt", event.target.value)} rows={3} className="mt-2 w-full resize-y rounded-xl border border-input bg-white px-3.5 py-3 text-sm font-normal leading-6 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
                                </label>
                                <label className="block text-xs font-extrabold text-primary">
                                  {t("adminBank.passageLabel")}
                                  <textarea value={question.passage ?? ""} onChange={(event) => updateTextField(row, "passage", event.target.value)} rows={5} className="mt-2 w-full resize-y rounded-xl border border-input bg-white px-3.5 py-3 text-sm font-normal leading-6 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
                                </label>
                                <label className="block text-xs font-extrabold text-primary">
                                  {t("adminBank.transcriptLabel")}
                                  <textarea value={question.transcript ?? ""} onChange={(event) => updateTextField(row, "transcript", event.target.value)} rows={4} className="mt-2 w-full resize-y rounded-xl border border-input bg-white px-3.5 py-3 text-sm font-normal leading-6 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
                                </label>
                                <div className="space-y-3">
                                  <p className="text-xs font-extrabold text-primary">{t("placement.question.chooseAnswer")}</p>
                                  {question.options.map((option, index) => (
                                    <label key={option.id} className="block text-xs font-bold text-primary">
                                      {t("adminBank.optionLabel").replace("{letter}", String.fromCharCode(65 + index))}
                                      <textarea value={option.text} onChange={(event) => updateQuestionOption(row, index, event.target.value)} rows={2} className="mt-2 w-full resize-y rounded-xl border border-input bg-white px-3.5 py-3 text-sm font-normal leading-6 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
                                    </label>
                                  ))}
                                </div>
                                <label className="block text-xs font-extrabold text-primary">
                                  {t("adminBank.answerLabel")}
                                  <select value={question.answer_option_id} onChange={(event) => updateCorrectOption(row, event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-input bg-white px-3.5 text-sm font-semibold text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15">
                                    <option value="">{t("adminBank.selectCorrectOption")}</option>
                                    {question.options.map((option, index) => <option key={option.id} value={option.id}>{String.fromCharCode(65 + index)} · {option.text}</option>)}
                                  </select>
                                </label>
                                <label className="block text-xs font-extrabold text-primary">
                                  {t("adminBank.explanationLabel")}
                                  <textarea value={question.explanation} onChange={(event) => updateTextField(row, "explanation", event.target.value)} rows={3} className="mt-2 w-full resize-y rounded-xl border border-input bg-white px-3.5 py-3 text-sm font-normal leading-6 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
                                </label>
                              </div>
                            ) : (
                              <label className="block text-xs font-extrabold text-primary">
                                {t("adminBank.promptTextLabel")}
                                <textarea value={normalizeStoredText(typeof row.patch.text === "string" ? row.patch.text : typeof row.raw.text === "string" ? row.raw.text : "")} onChange={(event) => updateTextField(row, "text", event.target.value)} rows={4} className="mt-2 w-full resize-y rounded-xl border border-input bg-white px-3.5 py-3 text-sm font-normal leading-6 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
                              </label>
                            )}
                            {row.flagged && row.decision === "pending" && (
                              <p className="rounded-xl border border-[#F2CDC7] bg-[#FFF5F2] px-4 py-3 text-xs font-semibold leading-5 text-[#75413D]">{t("adminBank.pendingDecision")}</p>
                            )}
                            {contentNeedsCorrection && <p className="rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-4 py-3 text-xs font-semibold leading-5 text-[#8D342D]">{t("adminBank.requiredContentCorrection")}</p>}
                          </div>
                        </details>
                      </article>
                    );
                  })}
                </div>

                <div className="border-t border-primary/10 bg-[#F9FAFC] p-5 sm:p-6">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-primary/10 bg-white p-3">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">{t("adminBank.rowCountLabel")}</p>
                      <p className="mt-1 font-display text-xl font-extrabold text-primary">{updateCount} / 136</p>
                    </div>
                    <div className="rounded-xl border border-primary/10 bg-white p-3">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">{t("adminBank.pendingReviewLabel")}</p>
                      <p className="mt-1 font-display text-xl font-extrabold text-primary">{pendingDecisionCount}</p>
                    </div>
                    <div className="rounded-xl border border-primary/10 bg-white p-3">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">{t("adminBank.unresolvedCorrectionsLabel")}</p>
                      <p className={`mt-1 font-display text-xl font-extrabold ${unresolvedCorrectionCount ? "text-[#A13F36]" : "text-[#236146]"}`}>{unresolvedCorrectionCount}</p>
                    </div>
                  </div>

                  <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-primary/10 bg-white p-4 text-sm font-semibold leading-6 text-foreground">
                    <input type="checkbox" checked={confirmApply} onChange={(event) => setConfirmApply(event.target.checked)} disabled={!auditComplete} className="mt-1 h-4 w-4 shrink-0 rounded border-input accent-primary" />
                    <span>{t("adminBank.confirmLabel")}</span>
                  </label>
                  {!auditComplete && <p className="mt-3 text-xs font-semibold text-muted-foreground">{t("adminBank.auditRequired")}</p>}
                  {auditComplete && pendingDecisionCount > 0 && <p className="mt-3 text-xs font-semibold text-[#8D342D]">{t("adminBank.pendingDecision")}</p>}
                  {unresolvedCorrectionCount > 0 && <p className="mt-2 text-xs font-semibold text-[#8D342D]">{t("adminBank.requiredContentCorrection")}</p>}
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-5 text-muted-foreground">{t("adminBank.applyNoInsertDelete")}</p>
                    <button type="button" onClick={() => void applyReviewedChanges()} disabled={!canApply} aria-busy={applyState === "running"} className="parle-button-primary justify-center disabled:cursor-not-allowed disabled:opacity-50">
                      {applyState === "running" ? <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />{t("adminBank.applyProgress").replace("{done}", String(applyProgress.done)).replace("{total}", String(applyProgress.total))}</> : <><Check aria-hidden="true" className="h-4 w-4" />{t("adminBank.applyButton").replace("{count}", String(updateCount))}</>}
                    </button>
                  </div>
                  {applyState === "running" && (
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#E9EDF5]" role="progressbar" aria-label={t("adminBank.applyProgressLabel")} aria-valuemin={0} aria-valuemax={applyProgress.total} aria-valuenow={applyProgress.done}>
                      <motion.div className="h-full rounded-full bg-[#F97362]" initial={false} animate={{ width: `${applyProgress.total ? applyProgress.done / applyProgress.total * 100 : 0}%` }} transition={{ duration: 0.2 }} />
                    </div>
                  )}
                  {applyState === "complete" && applyReport && <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-[#B9D9CB] bg-[#F0F8F4] px-4 py-3 text-sm font-semibold leading-6 text-[#236146]"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{t("adminBank.applySuccess").replace("{updated}", String(applyReport.updated))}</p>}
                  {(applyState === "partial" || applyState === "error") && (
                    <div role="alert" className="mt-4 rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-4 py-3 text-sm leading-6 text-[#8D342D]">
                      <p className="font-bold">{applyError || t("adminBank.applyPartial").replace("{updated}", String(applyReport?.updated ?? 0)).replace("{failed}", String(applyReport?.failures.length ?? 0)).replace("{total}", String((bank.questions.length + bank.prompts.length)))}</p>
                      {applyReport?.failures.map((failure) => <p key={`${failure.code}-${failure.message}`} className="mt-2 break-words text-xs">{t("adminBank.rowError").replace("{code}", failure.code).replace("{message}", failure.message)}</p>)}
                      {applyReport && <p className="mt-2 text-xs">{applyReport.countVerified ? t("adminBank.countVerified") : t("adminBank.verifyFail")} · {applyReport.idsVerified ? t("adminBank.idsVerified") : t("adminBank.idsNotVerified")}</p>}
                    </div>
                  )}
                  {applyState !== "running" && applyState !== "complete" && applyState !== "idle" && <button type="button" onClick={() => void loadBank()} className="parle-button-secondary mt-4 justify-center"><RefreshCw aria-hidden="true" className="h-4 w-4" />{t("adminBank.reloadBeforeAudit")}</button>}
                  {applyError && applyState === "error" && <p role="alert" className="mt-3 text-xs leading-5 text-[#8D342D]">{applyError}</p>}
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
