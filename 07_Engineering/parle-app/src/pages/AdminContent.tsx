import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, BookOpen, CircleCheck, Database, LoaderCircle, Pencil, Plus, RefreshCw, Save, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { parleAssessmentService, parleMarketplaceService } from "@/functions";
import { t, type TranslationKey } from "@/lib/i18n";
import { AdminListeningAudio } from "@/components/parle/AdminListeningAudio";
import QuestionBankSwitch from "@/components/parle/QuestionBankSwitch";

type CategoryKey = "listening" | "reading" | "writing_prompts" | "speaking_prompts" | "grammar_vocabulary";
type LevelKey = "A1" | "A2" | "B1" | "B2";
type StatusKey = "approved" | "draft" | "retired";
type ItemSource = "question" | "prompt";
type ItemIssue = "unknown_category" | "unknown_level" | "unknown_status" | "test_data_unverified";
type ContentFilter =
  | { type: "cell"; category: CategoryKey; level: LevelKey; status: StatusKey }
  | { type: "unmapped" };

type CoverageCell = {
  total_count: number;
  non_demo_count: number;
  demo_count: number;
  unverified_count: number;
  launch_ready_count: number;
  under_minimum: boolean;
};
type CoverageMatrix = Record<CategoryKey, Record<LevelKey, Record<StatusKey, CoverageCell>>>;
type Coverage = {
  launch_target: number;
  minimum_per_cell: number;
  cell_count: number;
  launch_ready_count: number;
  demo_test_count: number;
  unmapped_count: number;
  unverified_count: number;
  unmapped_or_unverified_count: number;
  low_coverage_cell_count: number;
  total_record_count: number;
  matrix: CoverageMatrix;
};
type ContentItem = {
  id: string;
  source: ItemSource;
  code: string;
  category: CategoryKey | null;
  category_value: string;
  level: LevelKey | null;
  level_value: string;
  status: StatusKey | null;
  status_value: string;
  is_test_data: boolean | null;
  text: string;
  passage: string;
  transcript: string;
  issues: ItemIssue[];
};
type EditorOption = { id: string; text: string };
type EditorItem = {
  id: string;
  source: ItemSource;
  code: string;
  category: CategoryKey | null;
  category_value: string;
  level: LevelKey | null;
  level_value: string;
  status: StatusKey | null;
  status_value: string;
  is_test_data: boolean | null;
  created_by_type: string;
  reviewed_by: string;
  text: string;
  passage: string;
  transcript: string;
  explanation: string;
  options: EditorOption[];
  answer_option_id: string;
  correct_answer_text: string;
  format: string;
  revision: string;
};
type EditorDraft = {
  text: string;
  passage: string;
  transcript: string;
  explanation: string;
  options: EditorOption[];
  answer_option_id: string;
  status: StatusKey | "";
  is_test_data: "true" | "false" | "";
};
type LoadState = "loading" | "ready" | "error";
type DetailState = "loading" | "ready" | "error";
type EditorLoadState = "loading" | "ready" | "error";
type DraftGenerationState = "idle" | "loading" | "success" | "partial" | "error";
type DraftGenerationResult = {
  category: CategoryKey;
  level: LevelKey;
  requested_count: number;
  saved_count: number;
};
type ContentReadDetail = {
  entity: "question_item" | "prompt_item";
  page: number;
  offset: number;
  reason_code: string;
  message: string;
};

class ContentActionError extends Error {
  code: string;
  detail: ContentReadDetail | null;

  constructor(code: string, detail: ContentReadDetail | null) {
    super(code);
    this.name = "ContentActionError";
    this.code = code;
    this.detail = detail;
  }
}

const CATEGORIES: CategoryKey[] = ["listening", "reading", "writing_prompts", "speaking_prompts", "grammar_vocabulary"];
const LEVELS: LevelKey[] = ["A1", "A2", "B1", "B2"];
const STATUSES: StatusKey[] = ["approved", "draft", "retired"];
const CATEGORY_LABELS: Record<CategoryKey, TranslationKey> = {
  listening: "adminContent.category.listening",
  reading: "adminContent.category.reading",
  writing_prompts: "adminContent.category.writingPrompts",
  speaking_prompts: "adminContent.category.speakingPrompts",
  grammar_vocabulary: "adminContent.category.grammarVocabulary",
};
const LEVEL_LABELS: Record<LevelKey, TranslationKey> = {
  A1: "adminContent.level.A1",
  A2: "adminContent.level.A2",
  B1: "adminContent.level.B1",
  B2: "adminContent.level.B2",
};
const STATUS_LABELS: Record<StatusKey, TranslationKey> = {
  approved: "adminContent.status.approved",
  draft: "adminContent.status.draft",
  retired: "adminContent.status.retired",
};
const STATUS_HINTS: Record<StatusKey, TranslationKey> = {
  approved: "adminContent.statusHint.approved",
  draft: "adminContent.statusHint.draft",
  retired: "adminContent.statusHint.retired",
};
const ISSUE_LABELS: Record<ItemIssue, TranslationKey> = {
  unknown_category: "adminContent.detail.issue.category",
  unknown_level: "adminContent.detail.issue.level",
  unknown_status: "adminContent.detail.issue.status",
  test_data_unverified: "adminContent.detail.issue.testData",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unwrapResponse(value: unknown): Record<string, unknown> {
  let current: unknown = value;
  for (let index = 0; index < 6; index += 1) {
    if (!isObject(current)) break;
    if (isObject(current.result)) {
      current = current.result;
      continue;
    }
    if (isObject(current.data) && ("status" in current.data || "error" in current.data || "coverage" in current.data || "items" in current.data)) {
      current = current.data;
      continue;
    }
    break;
  }
  return isObject(current) ? current : {};
}

function contentReadDetailFromValue(value: unknown): ContentReadDetail | null {
  if (!isObject(value)) return null;
  const entity = value.entity;
  if (entity !== "question_item" && entity !== "prompt_item") return null;
  if (!Number.isSafeInteger(value.page) || Number(value.page) < 1) return null;
  if (!Number.isSafeInteger(value.offset) || Number(value.offset) < 0) return null;
  if (typeof value.reason_code !== "string" || !/^[A-Z0-9_]{1,80}$/.test(value.reason_code)) return null;
  if (typeof value.message !== "string" || value.message.length > 240) return null;
  const message = value.message.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return {
    entity,
    page: Number(value.page),
    offset: Number(value.offset),
    reason_code: value.reason_code,
    message,
  };
}

function contentReadDetailsFromValue(value: unknown): ContentReadDetail[] {
  if (!Array.isArray(value)) throw new Error("CONTENT_RESPONSE_INVALID");
  const details = value.map(contentReadDetailFromValue);
  if (details.some((detail) => detail === null)) throw new Error("CONTENT_RESPONSE_INVALID");
  return details as ContentReadDetail[];
}

function readDetailText(detail: ContentReadDetail): string {
  return t("adminContent.error.readDetail", {
    entity: t(detail.entity === "question_item" ? "adminContent.error.questionEntity" : "adminContent.error.promptEntity"),
    page: detail.page,
    offset: detail.offset,
    code: detail.reason_code,
    reason: detail.message,
  });
}

async function contentAction(values: Record<string, unknown>, action = "admin_content_coverage"): Promise<Record<string, unknown>> {
  const response = unwrapResponse(await parleMarketplaceService({ action, ...values }));
  if (typeof response.error === "string" || response.status === "error") {
    const code = typeof response.code === "string" ? response.code : typeof response.error === "string" ? response.error : "REQUEST_FAILED";
    throw new ContentActionError(code, contentReadDetailFromValue(response.detail));
  }
  if (response.status !== "complete" && response.status !== "partial") throw new Error("CONTENT_RESPONSE_INVALID");
  return response;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

async function generateContentDrafts(category: CategoryKey, level: LevelKey, count: number): Promise<Record<string, unknown>> {
  let rawResponse: unknown;
  try {
    rawResponse = await parleAssessmentService({
      action: "admin_generate_content_drafts",
      category,
      level,
      count,
    });
  } catch {
    throw new ContentActionError("CONTENT_DRAFT_GENERATION_FAILED", null);
  }

  const response = unwrapResponse(rawResponse);
  if (response.status === "error" || typeof response.error === "string") {
    const code = typeof response.code === "string"
      ? response.code
      : typeof response.error === "string" ? response.error : "CONTENT_DRAFT_GENERATION_FAILED";
    throw new ContentActionError(code, null);
  }
  if (response.status !== "complete" && response.status !== "partial") throw new Error("CONTENT_RESPONSE_INVALID");
  return response;
}

function draftGenerationResultFromResponse(
  response: Record<string, unknown>,
  category: CategoryKey,
  level: LevelKey,
  count: number,
): DraftGenerationResult {
  const requestedCount = nonNegativeInteger(response.requested_count);
  const savedCount = nonNegativeInteger(response.saved_count);
  const auditedCount = nonNegativeInteger(response.audited_count);
  if (
    response.status !== "complete" && response.status !== "partial"
    || response.category !== category
    || response.level !== level
    || requestedCount !== count
    || savedCount === null || savedCount > count
    || auditedCount === null || auditedCount > savedCount
    || (response.status === "complete" && (savedCount !== count || auditedCount !== savedCount))
  ) {
    throw new Error("CONTENT_RESPONSE_INVALID");
  }
  return { category, level, requested_count: requestedCount, saved_count: savedCount };
}

function draftGenerationErrorKey(error: unknown): TranslationKey {
  const code = error instanceof ContentActionError ? error.code
    : isObject(error) && typeof error.code === "string" ? error.code
    : error instanceof Error ? error.message : "";
  const errorKeys: Record<string, TranslationKey> = {
    CONTENT_DRAFT_GENERATION_FAILED: "adminContent.generator.error.generation",
    CONTENT_DRAFT_REQUEST_INVALID: "adminContent.generator.error.request",
    CONTENT_DRAFT_STORAGE_UNAVAILABLE: "adminContent.generator.error.storage",
  };
  return errorKeys[code] ?? "adminContent.generator.error.generic";
}

function coverageFromResponse(response: Record<string, unknown>): Coverage {
  if (!isObject(response.coverage) || !isObject(response.coverage.matrix)) throw new Error("CONTENT_RESPONSE_INVALID");
  const raw = response.coverage;
  const rawMatrix = raw.matrix as Record<string, unknown>;
  const matrix = Object.fromEntries(CATEGORIES.map((category) => {
    const categoryRows = rawMatrix[category];
    if (!isObject(categoryRows)) throw new Error("CONTENT_RESPONSE_INVALID");
    return [category, Object.fromEntries(LEVELS.map((level) => {
      const levelRows = categoryRows[level];
      if (!isObject(levelRows)) throw new Error("CONTENT_RESPONSE_INVALID");
      return [level, Object.fromEntries(STATUSES.map((status) => {
        const cell = levelRows[status];
        if (!isObject(cell)) throw new Error("CONTENT_RESPONSE_INVALID");
        const total = nonNegativeInteger(cell.total_count);
        const nonDemo = nonNegativeInteger(cell.non_demo_count);
        const demo = nonNegativeInteger(cell.demo_count);
        const unverified = nonNegativeInteger(cell.unverified_count);
        const launch = nonNegativeInteger(cell.launch_ready_count);
        if (total === null || nonDemo === null || demo === null || unverified === null || launch === null || typeof cell.under_minimum !== "boolean") {
          throw new Error("CONTENT_RESPONSE_INVALID");
        }
        return [status, {
          total_count: total,
          non_demo_count: nonDemo,
          demo_count: demo,
          unverified_count: unverified,
          launch_ready_count: launch,
          under_minimum: cell.under_minimum,
        }];
      }))];
    }))];
  })) as CoverageMatrix;

  const launchTarget = nonNegativeInteger(raw.launch_target);
  const minimumPerCell = nonNegativeInteger(raw.minimum_per_cell);
  const cellCount = nonNegativeInteger(raw.cell_count);
  const launchReady = nonNegativeInteger(raw.launch_ready_count);
  const demoCount = nonNegativeInteger(raw.demo_test_count);
  const unmappedCount = nonNegativeInteger(raw.unmapped_count);
  const unverifiedCount = nonNegativeInteger(raw.unverified_count);
  const flaggedCount = nonNegativeInteger(raw.unmapped_or_unverified_count);
  const lowCellCount = nonNegativeInteger(raw.low_coverage_cell_count);
  const totalRecords = nonNegativeInteger(raw.total_record_count);
  if ([launchTarget, minimumPerCell, cellCount, launchReady, demoCount, unmappedCount, unverifiedCount, flaggedCount, lowCellCount, totalRecords].some((value) => value === null)) {
    throw new Error("CONTENT_RESPONSE_INVALID");
  }

  return {
    launch_target: launchTarget as number,
    minimum_per_cell: minimumPerCell as number,
    cell_count: cellCount as number,
    launch_ready_count: launchReady as number,
    demo_test_count: demoCount as number,
    unmapped_count: unmappedCount as number,
    unverified_count: unverifiedCount as number,
    unmapped_or_unverified_count: flaggedCount as number,
    low_coverage_cell_count: lowCellCount as number,
    total_record_count: totalRecords as number,
    matrix,
  };
}

function itemFromResponse(value: unknown): ContentItem {
  if (!isObject(value) || (value.source !== "question" && value.source !== "prompt") || typeof value.id !== "string" || typeof value.code !== "string") {
    throw new Error("CONTENT_RESPONSE_INVALID");
  }
  const category = CATEGORIES.includes(value.category as CategoryKey) ? value.category as CategoryKey : null;
  const level = LEVELS.includes(value.level as LevelKey) ? value.level as LevelKey : null;
  const status = STATUSES.includes(value.status as StatusKey) ? value.status as StatusKey : null;
  const issues = Array.isArray(value.issues) && value.issues.every((issue) => Object.prototype.hasOwnProperty.call(ISSUE_LABELS, issue))
    ? value.issues as ItemIssue[]
    : null;
  if (
    issues === null
    || (value.is_test_data !== true && value.is_test_data !== false && value.is_test_data !== null)
    || typeof value.text !== "string"
    || typeof value.passage !== "string"
    || typeof value.transcript !== "string"
    || typeof value.category_value !== "string"
    || typeof value.level_value !== "string"
    || typeof value.status_value !== "string"
  ) {
    throw new Error("CONTENT_RESPONSE_INVALID");
  }
  return {
    id: value.id,
    source: value.source,
    code: value.code,
    category,
    category_value: value.category_value,
    level,
    level_value: value.level_value,
    status,
    status_value: value.status_value,
    is_test_data: value.is_test_data,
    text: value.text,
    passage: value.passage,
    transcript: value.transcript,
    issues,
  };
}

function itemsFromResponse(response: Record<string, unknown>): ContentItem[] {
  if (response.view !== "items" || !Array.isArray(response.items)) throw new Error("CONTENT_RESPONSE_INVALID");
  const items = response.items.map(itemFromResponse);
  if (nonNegativeInteger(response.count) !== items.length) throw new Error("CONTENT_RESPONSE_INVALID");
  return items;
}

function editorItemFromResponse(value: unknown): EditorItem {
  if (!isObject(value) || (value.source !== "question" && value.source !== "prompt")
    || typeof value.id !== "string" || typeof value.code !== "string"
    || typeof value.category_value !== "string" || typeof value.level_value !== "string"
    || typeof value.status_value !== "string" || typeof value.text !== "string"
    || typeof value.passage !== "string" || typeof value.transcript !== "string"
    || typeof value.explanation !== "string" || !Array.isArray(value.options)
    || typeof value.answer_option_id !== "string" || typeof value.correct_answer_text !== "string"
    || typeof value.format !== "string" || typeof value.revision !== "string"
    || typeof value.created_by_type !== "string" || typeof value.reviewed_by !== "string"
    || value.revision.length < 2 || value.revision.length > 60000
    || (value.is_test_data !== true && value.is_test_data !== false && value.is_test_data !== null)) {
    throw new Error("CONTENT_RESPONSE_INVALID");
  }
  const options = value.options.map((option) => {
    if (!isObject(option) || typeof option.id !== "string" || typeof option.text !== "string") throw new Error("CONTENT_RESPONSE_INVALID");
    return { id: option.id, text: option.text };
  });
  return {
    id: value.id,
    source: value.source,
    code: value.code,
    category: CATEGORIES.includes(value.category as CategoryKey) ? value.category as CategoryKey : null,
    category_value: value.category_value,
    level: LEVELS.includes(value.level as LevelKey) ? value.level as LevelKey : null,
    level_value: value.level_value,
    status: STATUSES.includes(value.status as StatusKey) ? value.status as StatusKey : null,
    status_value: value.status_value,
    is_test_data: value.is_test_data,
    created_by_type: value.created_by_type,
    reviewed_by: value.reviewed_by,
    text: value.text,
    passage: value.passage,
    transcript: value.transcript,
    explanation: value.explanation,
    options,
    answer_option_id: value.answer_option_id,
    correct_answer_text: value.correct_answer_text,
    format: value.format,
    revision: value.revision,
  };
}

function editorDraftFromItem(item: EditorItem): EditorDraft {
  return {
    text: item.text,
    passage: item.passage,
    transcript: item.transcript,
    explanation: item.explanation,
    options: item.options.map((option) => ({ ...option })),
    answer_option_id: item.answer_option_id,
    status: item.status ?? "",
    is_test_data: item.is_test_data === null ? "" : String(item.is_test_data) as "true" | "false",
  };
}

function editorErrorKey(error: unknown): TranslationKey {
  const code = error instanceof ContentActionError ? error.code
    : isObject(error) && typeof error.code === "string" ? error.code
    : error instanceof Error ? error.message : "";
  const errorKeys: Record<string, TranslationKey> = {
    ADMIN_REQUIRED: "adminContent.error.access",
    AUTH_REQUIRED: "adminContent.error.access",
    CONTENT_NOT_FOUND: "adminContent.editor.error.notFound",
    CONTENT_READ_FAILED: "adminContent.editor.error.read",
    CONTENT_ENTITY_UNAVAILABLE: "adminContent.editor.error.read",
    CONTENT_STALE: "adminContent.editor.error.stale",
    CONTENT_OPTIONS_INVALID: "adminContent.editor.error.options",
    CONTENT_CATEGORY_REQUIRED: "adminContent.editor.error.category",
    CONTENT_LEVEL_REQUIRED: "adminContent.editor.error.level",
    CONTENT_APPROVED_TEXT_REQUIRED: "adminContent.editor.error.approvedText",
    CONTENT_STATUS_INVALID: "adminContent.editor.error.status",
    CONTENT_TEST_FLAG_INVALID: "adminContent.editor.error.testFlag",
    CONTENT_FORMAT_INVALID: "adminContent.editor.error.format",
    CONTENT_PATCH_INVALID: "adminContent.editor.error.patch",
    CONTENT_MINIMUM_QUESTION_FLOOR: "adminContent.editor.error.questionFloor",
    CONTENT_MINIMUM_PROMPT_FLOOR: "adminContent.editor.error.promptFloor",
    CONTENT_SAVE_FAILED: "adminContent.editor.error.save",
    AUDIT_WRITE_FAILED: "adminContent.editor.error.audit",
    AUDIT_UNAVAILABLE: "adminContent.editor.error.audit",
  };
  return errorKeys[code] ?? "adminContent.editor.error.generic";
}

function contentErrorKey(error: unknown, context: "coverage" | "detail" = "coverage"): TranslationKey {
  const code = error instanceof ContentActionError ? error.code : error instanceof Error ? error.message : "";
  if (code === "ADMIN_REQUIRED" || code === "AUTH_REQUIRED") return "adminContent.error.access";
  if (code === "CONTENT_READ_FAILED") return context === "detail" ? "adminContent.detail.error.incomplete" : "adminContent.error.incomplete";
  return "adminContent.error.generic";
}

function categoryText(category: CategoryKey): string {
  return t(CATEGORY_LABELS[category]);
}

function statusText(status: StatusKey): string {
  return t(STATUS_LABELS[status]);
}

function ItemCard({ item, onEdit }: { item: ContentItem; onEdit: (item: ContentItem) => void }) {
  const category = item.category ? categoryText(item.category) : t("adminContent.detail.unmappedValue", { value: item.category_value || t("adminContent.detail.notSet") });
  const level = item.level ? t(LEVEL_LABELS[item.level]) : t("adminContent.detail.unmappedValue", { value: item.level_value || t("adminContent.detail.notSet") });
  const status = item.status ? statusText(item.status) : t("adminContent.detail.unmappedValue", { value: item.status_value || t("adminContent.detail.notSet") });
  const testLabel = item.is_test_data === true
    ? t("adminContent.detail.demo")
    : item.is_test_data === false
      ? t("adminContent.detail.nonDemo")
      : t("adminContent.detail.unverified");
  const sourceLabel = item.source === "question" ? "adminContent.detail.questionSource" : "adminContent.detail.promptSource";

  return (
    <article className="rounded-2xl border border-[#E7EAF0] bg-white p-4 shadow-[0_12px_30px_-28px_rgba(23,43,91,0.5)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 break-all font-mono text-xs font-bold tracking-wide text-[#1E3A8A]">{t("adminContent.detail.itemCode", { code: item.code })}</p>
        <span className="rounded-full bg-[#F2F4F8] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#5E6A80]">{t(sourceLabel)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full border border-[#DDE3EE] bg-[#F8F9FB] px-2.5 py-1 text-[11px] font-semibold text-[#4B5972]">{category}</span>
        <span className="rounded-full border border-[#DDE3EE] bg-[#F8F9FB] px-2.5 py-1 text-[11px] font-semibold text-[#4B5972]">{level}</span>
        <span className="rounded-full border border-[#DDE3EE] bg-[#F8F9FB] px-2.5 py-1 text-[11px] font-semibold text-[#4B5972]">{status}</span>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.is_test_data === true ? "bg-[#FFF1E8] text-[#8A4A21]" : item.is_test_data === false ? "bg-[#E9F4F0] text-[#28634F]" : "bg-[#FFF5D9] text-[#755417]"}`}>{testLabel}</span>
      </div>
      <p className="mt-3 break-words text-xs leading-5 text-[#65718A]">
        {t("adminContent.detail.metadata", { category, level, status })}
      </p>
      <div className="mt-3 rounded-xl bg-[#F8F9FB] px-3.5 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#68758B]">
          {t(item.source === "question" ? "adminContent.detail.questionText" : "adminContent.detail.promptText")}
        </p>
        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-[#252F43]">
          {item.text || t("adminContent.detail.textUnavailable")}
        </p>
      </div>
      {item.passage && (
        <div className="mt-2.5 rounded-xl border border-[#EDF0F4] px-3.5 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#68758B]">{t("adminContent.detail.passageLabel")}</p>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-[#252F43]">{item.passage}</p>
        </div>
      )}
      {item.transcript && (
        <div className="mt-2.5 rounded-xl border border-[#EDF0F4] px-3.5 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#68758B]">{t("adminContent.detail.transcriptLabel")}</p>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-[#252F43]">{item.transcript}</p>
        </div>
      )}
      {item.issues.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label={t("adminContent.detail.issueListLabel")}>
          {item.issues.map((issue) => (
            <span key={issue} className="rounded-lg border border-[#E9D7A8] bg-[#FFF8E7] px-2.5 py-1 text-[10px] font-semibold text-[#73551B]">{t(ISSUE_LABELS[issue])}</span>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => onEdit(item)}
        aria-label={t("adminContent.detail.editItemAria", { code: item.code })}
        className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#1E3A8A] px-4 text-xs font-bold text-white shadow-sm transition hover:bg-[#172B5B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2"
      >
        <Pencil aria-hidden="true" className="h-3.5 w-3.5" />{t("adminContent.detail.editItem")}
      </button>
    </article>
  );
}

function CoverageCountButton({
  category,
  level,
  status,
  cell,
  minimum,
  onClick,
}: {
  category: CategoryKey;
  level: LevelKey;
  status: StatusKey;
  cell: CoverageCell;
  minimum: number;
  onClick: () => void;
}) {
  const isApproved = status === "approved";
  const low = isApproved && cell.under_minimum;
  const mainCount = isApproved ? cell.launch_ready_count : cell.non_demo_count;
  const labelKey = isApproved ? "adminContent.cell.launchReady" : "adminContent.cell.nonDemo";
  const ariaLabel = t("adminContent.cell.open", {
    category: categoryText(category),
    level: t(LEVEL_LABELS[level]),
    status: statusText(status),
    launch: cell.launch_ready_count,
    nonDemo: cell.non_demo_count,
    demo: cell.demo_count,
    unverified: cell.unverified_count,
  });

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`group flex min-h-[6.25rem] w-full flex-col rounded-xl border px-2.5 py-2 text-left transition duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-1 ${low ? "border-[#E9C981] bg-[#FFF8E7] hover:bg-[#FFF2D5]" : "border-[#E6EAF0] bg-white hover:border-[#B8C4D8] hover:bg-[#FAFBFD]"}`}
    >
      <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#6E7A8E]">{t(labelKey)}</span>
      <span className="mt-0.5 flex w-full items-center justify-between gap-1">
        <span className={`font-display text-[1.35rem] font-extrabold leading-none tracking-[-0.04em] ${low ? "text-[#815D18]" : "text-[#1E3A8A]"}`}>{mainCount}</span>
        {low && <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[#996F1C]" />}
      </span>
      <span className="mt-1.5 flex flex-col text-[9px] font-semibold leading-3.5 text-[#627087]">
        <span>{t("adminContent.cell.demo", { count: cell.demo_count })}</span>
        <span>{t("adminContent.cell.unverified", { count: cell.unverified_count })}</span>
      </span>
      {low && <span className="mt-1 inline-flex items-center rounded-full bg-[#F5E5BC] px-2 py-0.5 text-[9px] font-bold leading-3 text-[#684C12]">{t("adminContent.cell.low", { minimum })}</span>}
    </button>
  );
}

function contentFilterFor(category: CategoryKey, level: LevelKey, status: StatusKey): ContentFilter {
  return { type: "cell", category, level, status };
}

export default function AdminContent() {
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [coverageState, setCoverageState] = useState<LoadState>("loading");
  const [coverageError, setCoverageError] = useState<TranslationKey | null>(null);
  const [coverageReadDetails, setCoverageReadDetails] = useState<ContentReadDetail[]>([]);
  const [reloadCount, setReloadCount] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState<ContentFilter | null>(null);
  const [detailItems, setDetailItems] = useState<ContentItem[]>([]);
  const [detailState, setDetailState] = useState<DetailState>("loading");
  const [detailError, setDetailError] = useState<TranslationKey | null>(null);
  const [detailReadDetail, setDetailReadDetail] = useState<ContentReadDetail | null>(null);
  const [detailRetryCount, setDetailRetryCount] = useState(0);
  const [editorTarget, setEditorTarget] = useState<ContentItem | null>(null);
  const [editorItem, setEditorItem] = useState<EditorItem | null>(null);
  const [editorDraft, setEditorDraft] = useState<EditorDraft | null>(null);
  const [editorLoadState, setEditorLoadState] = useState<EditorLoadState>("loading");
  const [editorError, setEditorError] = useState<TranslationKey | null>(null);
  const [editorNotice, setEditorNotice] = useState<TranslationKey | null>(null);
  const [editorNoticeTone, setEditorNoticeTone] = useState<"success" | "warning" | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [draftCategory, setDraftCategory] = useState<CategoryKey>("listening");
  const [draftLevel, setDraftLevel] = useState<LevelKey>("A1");
  const [draftCount, setDraftCount] = useState(1);
  const [draftGenerationState, setDraftGenerationState] = useState<DraftGenerationState>("idle");
  const [draftGenerationError, setDraftGenerationError] = useState<TranslationKey | null>(null);
  const [draftGenerationResult, setDraftGenerationResult] = useState<DraftGenerationResult | null>(null);
  const editorRequestRef = useRef(0);

  useEffect(() => {
    let active = true;
    setCoverageState("loading");
    setCoverageError(null);
    setCoverageReadDetails([]);
    void contentAction({ view: "coverage" }).then((response) => {
      if (response.view !== "coverage" || typeof response.inventory_complete !== "boolean") throw new Error("CONTENT_RESPONSE_INVALID");
      const readDetails = contentReadDetailsFromValue(response.read_details);
      if ((!response.inventory_complete && readDetails.length === 0) || (response.inventory_complete && readDetails.length > 0)) {
        throw new Error("CONTENT_RESPONSE_INVALID");
      }
      const loaded = coverageFromResponse(response);
      if (!active) return;
      setCoverage(loaded);
      setCoverageReadDetails(readDetails);
      setCoverageState("ready");
    }).catch((error) => {
      console.error("Parle administrator content coverage could not be loaded", error);
      if (!active) return;
      setCoverageReadDetails(error instanceof ContentActionError && error.detail ? [error.detail] : []);
      setCoverageError(contentErrorKey(error));
      setCoverageState("error");
    });
    return () => { active = false; };
  }, [reloadCount]);

  useEffect(() => {
    if (!selectedFilter) return;
    let active = true;
    setDetailState("loading");
    setDetailError(null);
    setDetailReadDetail(null);
    setDetailItems([]);
    void contentAction({ view: "items", filter: selectedFilter }).then((response) => {
      const items = itemsFromResponse(response);
      if (!active) return;
      setDetailItems(items);
      setDetailState("ready");
    }).catch((error) => {
      console.error("Parle administrator content item list could not be loaded", error);
      if (!active) return;
      setDetailReadDetail(error instanceof ContentActionError ? error.detail : null);
      setDetailError(contentErrorKey(error, "detail"));
      setDetailState("error");
    });
    return () => { active = false; };
  }, [selectedFilter, detailRetryCount]);

  function openCell(category: CategoryKey, level: LevelKey, status: StatusKey) {
    setDetailItems([]);
    setDetailError(null);
    setDetailReadDetail(null);
    setDetailRetryCount(0);
    setSelectedFilter(contentFilterFor(category, level, status));
  }

  async function handleGenerateDrafts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draftGenerationState === "loading") return;
    setDraftGenerationState("loading");
    setDraftGenerationError(null);
    setDraftGenerationResult(null);
    try {
      const response = await generateContentDrafts(draftCategory, draftLevel, draftCount);
      const result = draftGenerationResultFromResponse(response, draftCategory, draftLevel, draftCount);
      setDraftGenerationResult(result);
      setDraftGenerationState(response.status === "partial" ? "partial" : "success");
      setReloadCount((current) => current + 1);
    } catch (error) {
      console.error("Parle administrator AI draft request could not be completed", error);
      setDraftGenerationError(draftGenerationErrorKey(error));
      setDraftGenerationState("error");
    }
  }

  function openUnmapped() {
    setDetailItems([]);
    setDetailError(null);
    setDetailReadDetail(null);
    setDetailRetryCount(0);
    setSelectedFilter({ type: "unmapped" });
  }

  function closeDetail() {
    if (editorSaving) return;
    if (editorDirty && !window.confirm(t("adminContent.editor.confirmDiscard"))) return;
    editorRequestRef.current += 1;
    setSelectedFilter(null);
    setDetailItems([]);
    setDetailError(null);
    setDetailReadDetail(null);
    setEditorTarget(null);
    setEditorItem(null);
    setEditorDraft(null);
    setEditorDirty(false);
    setEditorError(null);
    setEditorNotice(null);
    setEditorNoticeTone(null);
  }

  async function loadCanonicalEditorItem(target: ContentItem) {
    const requestId = ++editorRequestRef.current;
    setEditorLoadState("loading");
    setEditorError(null);
    try {
      const response = await contentAction({ source: target.source, item_id: target.id }, "admin_get_content_item");
      const loaded = editorItemFromResponse(response.item);
      if (loaded.id !== target.id || loaded.source !== target.source) throw new Error("CONTENT_RESPONSE_INVALID");
      if (editorRequestRef.current !== requestId) return;
      setEditorItem(loaded);
      setEditorDraft(editorDraftFromItem(loaded));
      setEditorDirty(false);
      setEditorLoadState("ready");
    } catch (error) {
      console.error("Parle administrator content item details could not be loaded", error);
      if (editorRequestRef.current !== requestId) return;
      setEditorError(editorErrorKey(error));
      setEditorLoadState("error");
    }
  }

  function openEditor(target: ContentItem) {
    if (editorDirty && !window.confirm(t("adminContent.editor.confirmDiscard"))) return;
    editorRequestRef.current += 1;
    setEditorTarget(target);
    setEditorItem(null);
    setEditorDraft(null);
    setEditorError(null);
    setEditorNotice(null);
    setEditorNoticeTone(null);
    setEditorDirty(false);
    void loadCanonicalEditorItem(target);
  }

  function closeEditor() {
    if (editorSaving) return;
    if (editorDirty && !window.confirm(t("adminContent.editor.confirmDiscard"))) return;
    editorRequestRef.current += 1;
    setEditorTarget(null);
    setEditorItem(null);
    setEditorDraft(null);
    setEditorError(null);
    setEditorNotice(null);
    setEditorNoticeTone(null);
    setEditorDirty(false);
  }

  function retryEditorLoad() {
    if (!editorTarget) return;
    if (editorDirty && !window.confirm(t("adminContent.editor.confirmReload"))) return;
    void loadCanonicalEditorItem(editorTarget);
  }

  function updateEditorDraft(update: (draft: EditorDraft) => EditorDraft) {
    setEditorDraft((current) => current ? update(current) : current);
    setEditorDirty(true);
    if (editorError !== "adminContent.editor.error.stale") setEditorError(null);
    setEditorNotice(null);
    setEditorNoticeTone(null);
  }

  function addEditorOption() {
    const id = `editor-option-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    updateEditorDraft((draft) => ({ ...draft, options: [...draft.options, { id, text: "" }] }));
  }

  function removeEditorOption(index: number) {
    updateEditorDraft((draft) => {
      if (draft.options.length <= 2) return draft;
      const options = draft.options.filter((_, optionIndex) => optionIndex !== index);
      const answer_option_id = options.some((option) => option.id === draft.answer_option_id)
        ? draft.answer_option_id
        : options[0]?.id ?? "";
      return { ...draft, options, answer_option_id };
    });
  }

  async function saveEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editorTarget || !editorItem || !editorDraft || editorSaving || !editorDraft.status || !editorDraft.is_test_data) return;
    setEditorSaving(true);
    setEditorError(null);
    setEditorNotice(null);
    setEditorNoticeTone(null);
    const content = editorItem.source === "question"
      ? {
        prompt: editorDraft.text,
        passage: editorDraft.passage,
        transcript: editorDraft.transcript,
        explanation: editorDraft.explanation,
        options: editorDraft.options,
        answer_option_id: editorDraft.answer_option_id,
        status: editorDraft.status,
        is_test_data: editorDraft.is_test_data === "true",
      }
      : {
        text: editorDraft.text,
        status: editorDraft.status,
        is_test_data: editorDraft.is_test_data === "true",
      };
    try {
      const response = await contentAction({
        source: editorItem.source,
        item_id: editorItem.id,
        expected_revision: editorItem.revision,
        content,
      }, "admin_save_content_item");
      if (response.status !== "complete" && response.status !== "partial") throw new Error("CONTENT_RESPONSE_INVALID");
      const auditFailed = response.status === "partial" || response.audit_status === "failed";
      setEditorNotice(auditFailed
        ? "adminContent.editor.auditPartial"
        : response.changed === false ? "adminContent.editor.successUnchanged" : "adminContent.editor.success");
      setEditorNoticeTone(auditFailed ? "warning" : "success");
      setEditorDirty(false);
      setReloadCount((count) => count + 1);
      setDetailRetryCount((count) => count + 1);
      await loadCanonicalEditorItem(editorTarget);
    } catch (error) {
      console.error("Parle administrator content item could not be saved", error);
      setEditorError(editorErrorKey(error));
    } finally {
      setEditorSaving(false);
    }
  }

  const progressPercent = coverage && coverage.launch_target > 0
    ? Math.min(100, (coverage.launch_ready_count / coverage.launch_target) * 100)
    : 0;
  const detailTitle = selectedFilter?.type === "cell"
    ? t("adminContent.detail.cellTitle", {
      category: categoryText(selectedFilter.category),
      level: t(LEVEL_LABELS[selectedFilter.level]),
      status: statusText(selectedFilter.status),
    })
    : t("adminContent.detail.unmappedTitle");

  return (
    <section className="min-w-0 space-y-5 sm:space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: "easeOut" }}>
        <div className="flex flex-col gap-4 border-b border-[#E1E5EC] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#B64C42]">
              <BookOpen aria-hidden="true" className="h-3.5 w-3.5" />{t("adminContent.eyebrow")}
            </p>
            <h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-0.045em] text-[#1E315C] sm:text-3xl">{t("adminContent.title")}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5B667C]">{t("adminContent.intro")}</p>
          </div>
          <button
            type="button"
            onClick={() => setReloadCount((count) => count + 1)}
            disabled={coverageState === "loading"}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#CFD7E5] bg-white px-4 text-sm font-bold text-[#1E3A8A] shadow-sm transition hover:border-[#AEBBD0] hover:bg-[#F8F9FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] disabled:cursor-wait disabled:opacity-65"
          >
            {coverageState === "loading" ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}
            {t(coverageState === "loading" ? "adminContent.refreshing" : "adminContent.refresh")}
          </button>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#DFE6F0] bg-[#F2F5FA] px-3.5 py-3 text-xs leading-5 text-[#4D5B75] sm:items-center">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#315184] sm:mt-0" />
          <p>{t("adminContent.editingNote")}</p>
        </div>
      </motion.div>

      <AdminListeningAudio />
      <QuestionBankSwitch />

      <motion.section
        aria-labelledby="admin-content-generator-title"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05, ease: "easeOut" }}
        className="overflow-hidden rounded-[1.6rem] border border-[#DCE3EE] bg-[linear-gradient(135deg,#FFFFFF_0%,#F5F7FB_100%)] shadow-[0_18px_40px_-35px_rgba(23,43,91,0.5)]"
      >
        <div className="border-l-[3px] border-[#F97362] p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#172B5B] text-[#FFD4CD] shadow-sm">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#B64C42]">{t("adminContent.generator.eyebrow")}</p>
              <h3 id="admin-content-generator-title" className="mt-1 font-display text-lg font-extrabold tracking-[-0.03em] text-[#1E315C] sm:text-xl">{t("adminContent.generator.title")}</h3>
              <p className="mt-1.5 max-w-3xl text-xs leading-5 text-[#5F6B80] sm:text-sm sm:leading-6">{t("adminContent.generator.body")}</p>
            </div>
          </div>

          <form onSubmit={handleGenerateDrafts} className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.75fr)_minmax(0,0.9fr)_auto]">
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="admin-content-generator-category" className="block text-xs font-bold text-[#34435F]">{t("adminContent.generator.categoryLabel")}</label>
              <select
                id="admin-content-generator-category"
                value={draftCategory}
                onChange={(event) => setDraftCategory(event.currentTarget.value as CategoryKey)}
                disabled={draftGenerationState === "loading"}
                className="min-h-11 w-full rounded-xl border border-[#CAD3E2] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#25324A] shadow-sm outline-none transition focus:border-[#315184] focus:ring-2 focus:ring-[#315184]/20 disabled:bg-[#F2F4F7]"
              >
                {CATEGORIES.map((category) => <option key={category} value={category}>{t(CATEGORY_LABELS[category])}</option>)}
              </select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="admin-content-generator-level" className="block text-xs font-bold text-[#34435F]">{t("adminContent.generator.levelLabel")}</label>
              <select
                id="admin-content-generator-level"
                value={draftLevel}
                onChange={(event) => setDraftLevel(event.currentTarget.value as LevelKey)}
                disabled={draftGenerationState === "loading"}
                className="min-h-11 w-full rounded-xl border border-[#CAD3E2] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#25324A] shadow-sm outline-none transition focus:border-[#315184] focus:ring-2 focus:ring-[#315184]/20 disabled:bg-[#F2F4F7]"
              >
                {LEVELS.map((level) => <option key={level} value={level}>{t(LEVEL_LABELS[level])}</option>)}
              </select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="admin-content-generator-count" className="block text-xs font-bold text-[#34435F]">{t("adminContent.generator.countLabel")}</label>
              <select
                id="admin-content-generator-count"
                value={draftCount}
                onChange={(event) => setDraftCount(Number(event.currentTarget.value))}
                disabled={draftGenerationState === "loading"}
                className="min-h-11 w-full rounded-xl border border-[#CAD3E2] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#25324A] shadow-sm outline-none transition focus:border-[#315184] focus:ring-2 focus:ring-[#315184]/20 disabled:bg-[#F2F4F7]"
              >
                {Array.from({ length: 5 }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>{t(count === 1 ? "adminContent.generator.countOne" : "adminContent.generator.countMany", { count })}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={draftGenerationState === "loading"}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 self-end rounded-xl bg-[#1E3A8A] px-5 text-sm font-bold text-white shadow-[0_10px_24px_-16px_rgba(23,43,91,0.8)] transition hover:-translate-y-0.5 hover:bg-[#172B5B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2 disabled:cursor-wait disabled:translate-y-0 disabled:opacity-65 xl:w-auto"
            >
              {draftGenerationState === "loading" ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Sparkles aria-hidden="true" className="h-4 w-4" />}
              {t(draftGenerationState === "loading" ? "adminContent.generator.submitting" : "adminContent.generator.submit")}
            </button>
          </form>

          <div id="admin-content-generator-safety" className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#E9D7A8] bg-[#FFFBF1] px-3.5 py-3 text-xs leading-5 text-[#6D531B]">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#8A681D]" />
            <p>{t("adminContent.generator.safetyNote")}</p>
          </div>

          <div className="mt-3 space-y-2" aria-live="polite" aria-atomic="true">
            {draftGenerationState === "loading" && (
              <div role="status" className="flex items-start gap-2.5 rounded-xl border border-[#CFD9E8] bg-white px-3.5 py-3 text-xs leading-5 text-[#43536F]">
                <LoaderCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[#315184]" />
                <p>{t("adminContent.generator.loading")}</p>
              </div>
            )}
            {draftGenerationState === "error" && (
              <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-3.5 py-3 text-sm leading-5 text-[#8D342D]">
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{t(draftGenerationError ?? "adminContent.generator.error.generic")}</p>
              </div>
            )}
            {draftGenerationState === "success" && draftGenerationResult && (
              <div role="status" className="flex flex-col gap-3 rounded-xl border border-[#D8E8DF] bg-[#F4FAF6] px-3.5 py-3 text-sm leading-5 text-[#28634F] sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2.5">
                  <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{t("adminContent.generator.success", { count: draftGenerationResult.saved_count })}</p>
                </div>
                <button type="button" onClick={() => openCell(draftGenerationResult.category, draftGenerationResult.level, "draft")} className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-[#B9D8C5] bg-white px-3.5 text-xs font-bold text-[#28634F] transition hover:bg-[#EAF5EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362]">
                  {t("adminContent.generator.viewDrafts", { category: categoryText(draftGenerationResult.category), level: t(LEVEL_LABELS[draftGenerationResult.level]) })}
                </button>
              </div>
            )}
            {draftGenerationState === "partial" && draftGenerationResult && (
              <div role="alert" className="flex flex-col gap-3 rounded-xl border border-[#E9D7A8] bg-[#FFFBF1] px-3.5 py-3 text-sm leading-5 text-[#6D531B] sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{t("adminContent.generator.partial", { saved: draftGenerationResult.saved_count, requested: draftGenerationResult.requested_count })}</p>
                </div>
                <button type="button" onClick={() => openCell(draftGenerationResult.category, draftGenerationResult.level, "draft")} className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-[#D9C17F] bg-white px-3.5 text-xs font-bold text-[#624A18] transition hover:bg-[#FFF6DF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362]">
                  {t("adminContent.generator.viewDrafts", { category: categoryText(draftGenerationResult.category), level: t(LEVEL_LABELS[draftGenerationResult.level]) })}
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.section>

      <AnimatePresence mode="wait" initial={false}>
        {coverageState === "loading" && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status" className="flex min-h-56 items-center justify-center gap-2 rounded-[1.5rem] border border-[#E1E5EC] bg-white px-4 text-center text-sm font-semibold text-[#5F6B80]">
            <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin text-[#1E3A8A]" />{t("adminContent.matrix.loading")}
          </motion.div>
        )}
        {coverageState === "error" && (
          <motion.div key="error" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="rounded-[1.5rem] border border-[#F0C5C0] bg-[#FFF5F2] p-5 text-sm leading-6 text-[#8D342D] sm:p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <h3 className="font-display text-lg font-extrabold">{t("adminContent.matrix.errorTitle")}</h3>
                <p className="mt-1">{t(coverageError ?? "adminContent.error.generic")}</p>
                {coverageReadDetails.map((detail, index) => (
                  <p key={`${detail.entity}-${detail.offset}-${index}`} className="mt-1.5 text-xs font-semibold">{readDetailText(detail)}</p>
                ))}
                <button type="button" onClick={() => setReloadCount((count) => count + 1)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#8D342D] px-4 text-sm font-bold text-white transition hover:bg-[#702921] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2">
                  <RefreshCw aria-hidden="true" className="h-4 w-4" />{t("adminContent.matrix.retry")}
                </button>
              </div>
            </div>
          </motion.div>
        )}
        {coverageState === "ready" && coverage && (
          <motion.div key="ready" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="min-w-0 space-y-5 sm:space-y-6">
            {coverageReadDetails.length > 0 && (
              <div role="alert" className="rounded-2xl border border-[#E9D7A8] bg-[#FFFBF1] p-4 text-sm leading-6 text-[#6D531B] sm:p-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#8A681D]" />
                  <div className="min-w-0">
                    <h3 className="font-display font-extrabold">{t("adminContent.error.incompleteTitle")}</h3>
                    <p className="mt-1">{t("adminContent.error.incomplete")}</p>
                    <ul className="mt-2 space-y-1.5 text-xs font-semibold" aria-label={t("adminContent.error.incompleteTitle")}>
                      {coverageReadDetails.map((detail, index) => (
                        <li key={`${detail.entity}-${detail.offset}-${index}`} className="break-words">{readDetailText(detail)}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
            <div className="grid min-w-0 gap-3 lg:grid-cols-[1.45fr_0.8fr]">
              <section className="relative isolate overflow-hidden rounded-[1.6rem] bg-[#172B5B] p-5 text-white shadow-[0_22px_50px_-30px_rgba(23,43,91,0.55)] sm:p-7">
                <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 -z-10 h-64 w-64 rounded-full border border-white/10" />
                <div aria-hidden="true" className="pointer-events-none absolute -right-2 top-5 -z-10 h-40 w-40 rounded-full border border-[#F97362]/30" />
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#F4B2A9]">{t("adminContent.launch.label")}</p>
                <p className="mt-3 font-display text-4xl font-extrabold tracking-[-0.055em] sm:text-5xl">{t("adminContent.launch.metric", { count: coverage.launch_ready_count, target: coverage.launch_target })}</p>
                <p className="mt-2 max-w-xl text-xs leading-5 text-white/75 sm:text-sm sm:leading-6">{t("adminContent.launch.description")}</p>
                <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label={t("adminContent.launch.progressAria")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPercent)}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} transition={{ duration: 0.8, ease: "easeOut" }} className="h-full rounded-full bg-[#F97362]" />
                </div>
                <p className="mt-2 text-[11px] font-semibold text-white/75">{t("adminContent.launch.percent", { percent: Math.round(progressPercent) })}</p>
              </section>

              <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <section className="flex min-w-0 items-start gap-3 rounded-[1.35rem] border border-[#E1E5EC] bg-white p-4 shadow-[0_14px_34px_-30px_rgba(23,43,91,0.45)] sm:p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EDF2FA] text-[#315184]"><Database aria-hidden="true" className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-[#65718A]">{t("adminContent.demo.title")}</h3>
                    <p className="mt-1 font-display text-2xl font-extrabold tracking-[-0.04em] text-[#1E315C]">{t("adminContent.demo.count", { count: coverage.demo_test_count })}</p>
                    <p className="mt-1 text-xs leading-5 text-[#69758A]">{t("adminContent.demo.description")}</p>
                  </div>
                </section>

                <section className={`flex min-w-0 items-start gap-3 rounded-[1.35rem] border p-4 shadow-[0_14px_34px_-30px_rgba(23,43,91,0.45)] sm:p-5 ${coverage.unmapped_or_unverified_count > 0 ? "border-[#E9D7A8] bg-[#FFFBF1]" : "border-[#D8E8DF] bg-[#F7FBF8]"}`}>
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${coverage.unmapped_or_unverified_count > 0 ? "bg-[#F7E8BF] text-[#755417]" : "bg-[#E3F1E9] text-[#28634F]"}`}>
                    {coverage.unmapped_or_unverified_count > 0 ? <AlertTriangle aria-hidden="true" className="h-5 w-5" /> : <CircleCheck aria-hidden="true" className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-[#65718A]">{t("adminContent.mapping.title")}</h3>
                    <p className="mt-1 font-display text-2xl font-extrabold tracking-[-0.04em] text-[#1E315C]">{t("adminContent.mapping.count", { count: coverage.unmapped_or_unverified_count })}</p>
                    <p className="mt-1 text-xs leading-5 text-[#69758A]">{coverage.unmapped_or_unverified_count > 0
                      ? t("adminContent.mapping.breakdown", { unmapped: coverage.unmapped_count, unverified: coverage.unverified_count })
                      : t("adminContent.mapping.complete")}</p>
                    {coverage.unmapped_or_unverified_count > 0 && (
                      <button type="button" onClick={openUnmapped} className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#D9C17F] bg-white px-3 text-xs font-bold text-[#624A18] transition hover:bg-[#FFF6DF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362]">
                        {t("adminContent.mapping.inspect")}
                      </button>
                    )}
                  </div>
                </section>
              </div>
            </div>

            {coverage.total_record_count === 0 && coverageReadDetails.length === 0 && (
              <div className="flex items-start gap-3 rounded-2xl border border-[#DDE3EE] bg-white px-4 py-4 text-sm leading-6 text-[#5B667C] sm:items-center">
                <BookOpen aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#315184] sm:mt-0" />
                <p>{t("adminContent.matrix.emptyBank")}</p>
              </div>
            )}

            <section aria-labelledby="admin-content-matrix-title" className="min-w-0 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 id="admin-content-matrix-title" className="font-display text-xl font-extrabold tracking-[-0.035em] text-[#1E315C]">{t("adminContent.matrix.title")}</h3>
                  <p className="mt-1 text-xs leading-5 text-[#68758B]">{t("adminContent.matrix.editDescription")}</p>
                </div>
                <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#785B20]">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm border border-[#E9C981] bg-[#FFF2D5]" />{t("adminContent.matrix.lowLegend")}
                </p>
              </div>
              <div className="rounded-2xl border border-[#E9D7A8] bg-[#FFFBF1] px-3.5 py-3 text-xs leading-5 text-[#6D531B] sm:px-4">
                {t("adminContent.matrix.lowSummary", {
                  count: coverage.low_coverage_cell_count,
                  total: coverage.cell_count,
                  minimum: coverage.minimum_per_cell,
                })}
              </div>

              <div className="hidden overflow-hidden rounded-[1.45rem] border border-[#DFE4EC] bg-white shadow-[0_18px_44px_-38px_rgba(23,43,91,0.55)] md:block">
                <table className="w-full table-fixed border-collapse">
                  <caption className="sr-only">{t("adminContent.matrix.tableCaption")}</caption>
                  <thead>
                    <tr className="bg-[#F4F6FA] text-left">
                      <th scope="col" className="w-[22%] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#67748B]">{t("adminContent.matrix.categoryHeader")}</th>
                      <th scope="col" className="w-[9%] px-2 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#67748B]">{t("adminContent.matrix.levelHeader")}</th>
                      {STATUSES.map((status) => (
                        <th key={status} scope="col" className="w-[23%] px-2 py-3 text-left">
                          <span className="block text-xs font-bold text-[#34435F]">{t(STATUS_LABELS[status])}</span>
                          <span className="mt-0.5 block text-[10px] font-medium text-[#778197]">{t(STATUS_HINTS[status])}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {CATEGORIES.flatMap((category) => LEVELS.map((level, levelIndex) => (
                      <tr key={`${category}-${level}`} className={levelIndex === 0 ? "border-t-2 border-[#DCE2EC]" : "border-t border-[#EEF0F4]"}>
                        {levelIndex === 0 && (
                          <th scope="rowgroup" rowSpan={LEVELS.length} className="align-middle border-r border-[#EEF0F4] bg-[#FAFBFD] px-4 py-3 text-left">
                            <span className="flex items-start gap-2.5">
                              <BookOpen aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#315184]" />
                              <span className="text-sm font-bold leading-5 text-[#273858]">{t(CATEGORY_LABELS[category])}</span>
                            </span>
                          </th>
                        )}
                        <th scope="row" className="border-r border-[#EEF0F4] px-2 py-2 text-left text-xs font-bold text-[#4E5B73]">{t(LEVEL_LABELS[level])}</th>
                        {STATUSES.map((status) => (
                          <td key={status} className="border-l border-[#F0F2F6] px-2 py-2 align-top">
                            <CoverageCountButton category={category} level={level} status={status} cell={coverage.matrix[category][level][status]} minimum={coverage.minimum_per_cell} onClick={() => openCell(category, level, status)} />
                          </td>
                        ))}
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {CATEGORIES.map((category) => (
                  <section key={category} className="rounded-[1.35rem] border border-[#DFE4EC] bg-white p-3.5 shadow-[0_14px_36px_-32px_rgba(23,43,91,0.55)]">
                    <h4 className="flex items-center gap-2 font-display text-sm font-extrabold leading-5 text-[#273858]">
                      <BookOpen aria-hidden="true" className="h-4 w-4 shrink-0 text-[#315184]" />{t(CATEGORY_LABELS[category])}
                    </h4>
                    <div className="mt-3 space-y-2.5">
                      {LEVELS.map((level) => (
                        <div key={level} className="rounded-xl border border-[#EEF0F4] bg-[#FAFBFD] p-2.5">
                          <h5 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#68758B]">{t(LEVEL_LABELS[level])}</h5>
                          <div className="grid grid-cols-3 gap-1.5">
                            {STATUSES.map((status) => (
                              <div key={status} className="min-w-0">
                                <p className="mb-1 min-h-4 px-0.5 text-[9px] font-bold text-[#59667D]">{t(STATUS_LABELS[status])}</p>
                                <CoverageCountButton category={category} level={level} status={status} cell={coverage.matrix[category][level][status]} minimum={coverage.minimum_per_cell} onClick={() => openCell(category, level, status)} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      <DialogPrimitive.Root open={Boolean(selectedFilter)} onOpenChange={(open) => { if (!open) closeDetail(); }}>
        {selectedFilter && (
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#121B32]/55 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
            <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 flex max-h-[88vh] w-[calc(100vw-1.25rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[1.6rem] border border-[#DDE3EC] bg-[#FCFCFA] shadow-[0_30px_100px_-35px_rgba(15,28,58,0.55)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95">
              <div className="relative border-b border-[#E1E5EC] px-4 py-4 pr-14 sm:px-6 sm:py-5 sm:pr-16">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#B64C42]">{t(editorTarget ? "adminContent.editor.eyebrow" : "adminContent.detail.eyebrow")}</p>
                <DialogPrimitive.Title className="mt-1.5 font-display text-lg font-extrabold leading-6 tracking-[-0.035em] text-[#1E315C] sm:text-xl">{editorTarget ? t("adminContent.editor.title") : detailTitle}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1.5 text-xs leading-5 text-[#667287]">{t(editorTarget ? "adminContent.editor.description" : "adminContent.detail.description")}</DialogPrimitive.Description>
                <DialogPrimitive.Close className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-xl border border-[#DDE3EC] bg-white text-[#40506B] transition hover:bg-[#F1F3F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] sm:right-4 sm:top-4" aria-label={t("adminContent.detail.close")}>
                  <X aria-hidden="true" className="h-4 w-4" />
                  <span className="sr-only">{t("adminContent.detail.close")}</span>
                </DialogPrimitive.Close>
              </div>
              <div className="flex min-h-10 items-center justify-between gap-3 border-b border-[#E9ECF1] bg-white px-4 py-2.5 sm:px-6">
                <p className="text-xs font-semibold text-[#617087]">{editorTarget ? t("adminContent.editor.itemCode", { code: editorTarget.code }) : detailState === "ready" ? t("adminContent.detail.count", { count: detailItems.length }) : detailState === "loading" ? t("adminContent.detail.loading") : t("adminContent.detail.listUnavailable")}</p>
                {!editorTarget && detailState === "ready" && detailItems.length > 0 && <span className="rounded-full bg-[#EEF2FA] px-2.5 py-1 text-[10px] font-bold text-[#315184]">{t("adminContent.detail.editorAvailable")}</span>}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
                {editorTarget ? (
                  <div className="space-y-4">
                    {editorNotice && (
                      <div role={editorNoticeTone === "warning" ? "alert" : "status"} className={`rounded-xl border px-3.5 py-3 text-sm leading-6 ${editorNoticeTone === "warning" ? "border-[#E9D7A8] bg-[#FFFBF1] text-[#6D531B]" : "border-[#D8E8DF] bg-[#F4FAF6] text-[#28634F]"}`}>
                        {t(editorNotice)}
                      </div>
                    )}
                    {editorLoadState === "loading" && (
                      <div role="status" className="flex min-h-48 items-center justify-center gap-2 rounded-2xl border border-[#E1E5EC] bg-white text-sm font-semibold text-[#59677E]">
                        <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin text-[#1E3A8A]" />{t("adminContent.editor.loading")}
                      </div>
                    )}
                    {editorLoadState === "error" && (
                      <div role="alert" className="rounded-2xl border border-[#F0C5C0] bg-[#FFF5F2] p-4 text-sm leading-6 text-[#8D342D] sm:p-5">
                        <div className="flex items-start gap-3">
                          <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
                          <div>
                            <h3 className="font-bold">{t("adminContent.editor.loadErrorTitle")}</h3>
                            <p className="mt-1">{t(editorError ?? "adminContent.editor.error.read")}</p>
                            {editorNotice && <p className="mt-2 text-xs font-semibold">{t("adminContent.editor.savedReloadHelp")}</p>}
                            <button type="button" onClick={retryEditorLoad} disabled={editorSaving} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#8D342D] px-4 text-xs font-bold text-white transition hover:bg-[#702921] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
                              <RefreshCw aria-hidden="true" className="h-4 w-4" />{t("adminContent.editor.retryLoad")}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {editorLoadState === "ready" && editorItem && editorDraft && (
                      <form onSubmit={saveEditor} className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <button type="button" onClick={closeEditor} disabled={editorSaving} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#CFD7E5] bg-white px-3.5 text-xs font-bold text-[#315184] transition hover:bg-[#F3F6FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] disabled:cursor-wait disabled:opacity-60">
                            <X aria-hidden="true" className="h-3.5 w-3.5 rotate-45" />{t("adminContent.editor.backToItems")}
                          </button>
                          <span className="font-mono text-[10px] font-semibold text-[#758096]">{t("adminContent.editor.itemCode", { code: editorItem.code })}</span>
                        </div>
                        {editorError && (
                          <div role="alert" className="rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-3.5 py-3 text-sm leading-6 text-[#8D342D]">
                            <p>{t(editorError)}</p>
                            {editorError === "adminContent.editor.error.stale" && (
                              <button type="button" onClick={retryEditorLoad} className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#DDAEA9] bg-white px-3 text-xs font-bold text-[#803A33] transition hover:bg-[#FFF0ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362]">
                                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />{t("adminContent.editor.reloadAfterConflict")}
                              </button>
                            )}
                          </div>
                        )}
                        <section className="rounded-2xl border border-[#DDE3EC] bg-[#F5F7FA] p-4 sm:p-5" aria-labelledby="content-editor-metadata-title">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                            <h3 id="content-editor-metadata-title" className="font-display text-sm font-extrabold text-[#273858]">{t("adminContent.editor.classificationTitle")}</h3>
                            {editorItem.source === "question" && <span className="text-[10px] font-semibold text-[#6B7589]">{t("adminContent.editor.format", { format: editorItem.format || t("adminContent.detail.notSet") })}</span>}
                          </div>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border border-[#E1E6EF] bg-white px-3.5 py-3">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#68758B]">{t("adminContent.editor.category")}</p>
                              <p className="mt-1 text-sm font-semibold text-[#273858]">{editorItem.category ? categoryText(editorItem.category) : t("adminContent.detail.unmappedValue", { value: editorItem.category_value || t("adminContent.detail.notSet") })}</p>
                            </div>
                            <div className="rounded-xl border border-[#E1E6EF] bg-white px-3.5 py-3">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#68758B]">{t("adminContent.editor.level")}</p>
                              <p className="mt-1 text-sm font-semibold text-[#273858]">{editorItem.level ? t(LEVEL_LABELS[editorItem.level]) : t("adminContent.detail.unmappedValue", { value: editorItem.level_value || t("adminContent.detail.notSet") })}</p>
                            </div>
                            <div className="rounded-xl border border-[#E1E6EF] bg-white px-3.5 py-3">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#68758B]">{t("adminContent.editor.currentStatus")}</p>
                              <p className="mt-1 text-sm font-semibold text-[#273858]">{editorItem.status ? statusText(editorItem.status) : t("adminContent.detail.unmappedValue", { value: editorItem.status_value || t("adminContent.detail.notSet") })}</p>
                            </div>
                            <div className="rounded-xl border border-[#E1E6EF] bg-white px-3.5 py-3">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#68758B]">{t("adminContent.editor.currentTestFlag")}</p>
                              <p className="mt-1 text-sm font-semibold text-[#273858]">{editorItem.is_test_data === true ? t("adminContent.detail.demo") : editorItem.is_test_data === false ? t("adminContent.detail.nonDemo") : t("adminContent.detail.unverified")}</p>
                            </div>
                          </div>
                          <p className="mt-3 text-xs leading-5 text-[#5F6D83]">{t("adminContent.editor.classificationNote")}</p>
                        </section>

                        {(editorItem.created_by_type || editorItem.reviewed_by) && (
                          <section className="rounded-2xl border border-[#DDE3EC] bg-white p-4 sm:p-5" aria-labelledby="content-editor-provenance-title">
                            <h3 id="content-editor-provenance-title" className="font-display text-sm font-extrabold text-[#273858]">{t("adminContent.generator.provenanceTitle")}</h3>
                            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                              {editorItem.created_by_type && (
                                <div className="rounded-xl border border-[#E1E6EF] bg-[#F8F9FB] px-3.5 py-3">
                                  <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#68758B]">{t("adminContent.generator.originLabel")}</dt>
                                  <dd className="mt-1 text-sm font-semibold text-[#273858]">
                                    {editorItem.created_by_type === "ai"
                                      ? t("adminContent.generator.origin.ai")
                                      : editorItem.created_by_type === "admin"
                                        ? t("adminContent.generator.origin.admin")
                                        : editorItem.created_by_type}
                                  </dd>
                                </div>
                              )}
                              {editorItem.reviewed_by && (
                                <div className="rounded-xl border border-[#E1E6EF] bg-[#F8F9FB] px-3.5 py-3 sm:col-span-2">
                                  <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#68758B]">{t("adminContent.generator.reviewNote")}</dt>
                                  <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[#273858]">{editorItem.reviewed_by}</dd>
                                </div>
                              )}
                            </dl>
                          </section>
                        )}

                        <div className="space-y-2">
                          <label htmlFor="content-editor-main-text" className="block text-xs font-bold text-[#34435F]">{t(editorItem.source === "question" ? "adminContent.detail.questionText" : "adminContent.detail.promptText")}</label>
                          <textarea id="content-editor-main-text" required maxLength={editorItem.source === "question" ? 7000 : 5000} rows={4} value={editorDraft.text} onChange={(event) => { const value = event.currentTarget.value; updateEditorDraft((draft) => ({ ...draft, text: value })); }} disabled={editorSaving} className="w-full rounded-xl border border-[#CAD3E2] bg-white px-3.5 py-3 text-sm leading-6 text-[#25324A] shadow-sm outline-none transition focus:border-[#315184] focus:ring-2 focus:ring-[#315184]/20 disabled:bg-[#F2F4F7] disabled:text-[#667287]" />
                          <p className="text-[11px] leading-5 text-[#758096]">{t("adminContent.editor.textHelp")}</p>
                        </div>

                        {editorItem.source === "question" && (
                          <>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="space-y-2">
                                <label htmlFor="content-editor-passage" className="block text-xs font-bold text-[#34435F]">{t("adminContent.detail.passageLabel")}</label>
                                <textarea id="content-editor-passage" maxLength={7000} rows={4} value={editorDraft.passage} onChange={(event) => { const value = event.currentTarget.value; updateEditorDraft((draft) => ({ ...draft, passage: value })); }} disabled={editorSaving} className="w-full rounded-xl border border-[#CAD3E2] bg-white px-3.5 py-3 text-sm leading-6 text-[#25324A] shadow-sm outline-none transition focus:border-[#315184] focus:ring-2 focus:ring-[#315184]/20 disabled:bg-[#F2F4F7] disabled:text-[#667287]" />
                              </div>
                              <div className="space-y-2">
                                <label htmlFor="content-editor-transcript" className="block text-xs font-bold text-[#34435F]">{t("adminContent.detail.transcriptLabel")}</label>
                                <textarea id="content-editor-transcript" maxLength={7000} rows={4} value={editorDraft.transcript} onChange={(event) => { const value = event.currentTarget.value; updateEditorDraft((draft) => ({ ...draft, transcript: value })); }} disabled={editorSaving} className="w-full rounded-xl border border-[#CAD3E2] bg-white px-3.5 py-3 text-sm leading-6 text-[#25324A] shadow-sm outline-none transition focus:border-[#315184] focus:ring-2 focus:ring-[#315184]/20 disabled:bg-[#F2F4F7] disabled:text-[#667287]" />
                              </div>
                            </div>

                            <fieldset className="rounded-2xl border border-[#DDE3EC] bg-white p-4 sm:p-5">
                              <legend className="px-1 text-sm font-extrabold text-[#273858]">{t("adminContent.editor.optionsTitle")}</legend>
                              <p className="mb-3 text-xs leading-5 text-[#65718A]">{t("adminContent.editor.optionsHelp")}</p>
                              {editorItem.correct_answer_text && !editorDirty && <p className="mb-3 rounded-lg bg-[#F2F6F4] px-3 py-2 text-xs text-[#3E6555]">{t("adminContent.editor.currentAnswer", { answer: editorItem.correct_answer_text })}</p>}
                              <div className="space-y-3">
                                {editorDraft.options.map((option, index) => (
                                  <div key={`${option.id}-${index}`} className="rounded-xl border border-[#E4E8EF] bg-[#FAFBFD] p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <label htmlFor={`content-editor-option-${index}`} className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#65718A]">{t("adminContent.editor.optionLabel", { index: index + 1 })}</label>
                                      <button type="button" onClick={() => removeEditorOption(index)} disabled={editorSaving || editorDraft.options.length <= 2} aria-label={t("adminContent.editor.removeOption", { index: index + 1 })} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#DDE3EC] bg-white text-[#6A7486] transition hover:border-[#E0B8B3] hover:text-[#8D342D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] disabled:cursor-not-allowed disabled:opacity-40">
                                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                                      </button>
                                    </div>
                                    <textarea id={`content-editor-option-${index}`} required maxLength={500} rows={2} value={option.text} onChange={(event) => { const value = event.currentTarget.value; updateEditorDraft((draft) => ({ ...draft, options: draft.options.map((entry, optionIndex) => optionIndex === index ? { ...entry, text: value } : entry) })); }} disabled={editorSaving} className="mt-2 w-full rounded-lg border border-[#CAD3E2] bg-white px-3 py-2.5 text-sm leading-5 text-[#25324A] outline-none transition focus:border-[#315184] focus:ring-2 focus:ring-[#315184]/20 disabled:bg-[#F2F4F7] disabled:text-[#667287]" />
                                    <label className="mt-2 inline-flex min-h-8 cursor-pointer items-center gap-2 text-xs font-semibold text-[#41516C]">
                                      <input type="radio" required={index === 0} name={`content-correct-answer-${editorItem.id}`} checked={editorDraft.answer_option_id === option.id} onChange={() => updateEditorDraft((draft) => ({ ...draft, answer_option_id: option.id }))} disabled={editorSaving} className="h-4 w-4 accent-[#1E3A8A]" />
                                      {t("adminContent.editor.correctAnswer")}
                                    </label>
                                  </div>
                                ))}
                              </div>
                              <button type="button" onClick={addEditorOption} disabled={editorSaving || editorDraft.options.length >= 4} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#CFD7E5] bg-white px-3.5 text-xs font-bold text-[#315184] transition hover:bg-[#F3F6FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] disabled:cursor-not-allowed disabled:opacity-45">
                                <Plus aria-hidden="true" className="h-4 w-4" />{t("adminContent.editor.addOption")}
                              </button>
                            </fieldset>

                            <div className="space-y-2">
                              <label htmlFor="content-editor-explanation" className="block text-xs font-bold text-[#34435F]">{t("adminContent.editor.explanation")}</label>
                              <textarea id="content-editor-explanation" maxLength={3000} rows={3} value={editorDraft.explanation} onChange={(event) => { const value = event.currentTarget.value; updateEditorDraft((draft) => ({ ...draft, explanation: value })); }} disabled={editorSaving} className="w-full rounded-xl border border-[#CAD3E2] bg-white px-3.5 py-3 text-sm leading-6 text-[#25324A] shadow-sm outline-none transition focus:border-[#315184] focus:ring-2 focus:ring-[#315184]/20 disabled:bg-[#F2F4F7] disabled:text-[#667287]" />
                            </div>
                          </>
                        )}

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <label htmlFor="content-editor-status" className="block text-xs font-bold text-[#34435F]">{t("adminContent.editor.status")}</label>
                            <select id="content-editor-status" required value={editorDraft.status} onChange={(event) => { const value = event.currentTarget.value as EditorDraft["status"]; updateEditorDraft((draft) => ({ ...draft, status: value })); }} disabled={editorSaving} className="w-full rounded-xl border border-[#CAD3E2] bg-white px-3.5 py-3 text-sm font-semibold text-[#25324A] outline-none transition focus:border-[#315184] focus:ring-2 focus:ring-[#315184]/20 disabled:bg-[#F2F4F7]">
                              <option value="">{t("adminContent.editor.chooseStatus")}</option>
                              {STATUSES.map((status) => <option key={status} value={status}>{statusText(status)}</option>)}
                            </select>
                            <p className="text-[11px] leading-5 text-[#758096]">{t(editorDraft.status ? STATUS_HINTS[editorDraft.status] : "adminContent.editor.statusHelp")}</p>
                          </div>
                          <div className="space-y-2">
                            <label htmlFor="content-editor-test-flag" className="block text-xs font-bold text-[#34435F]">{t("adminContent.editor.testFlag")}</label>
                            <select id="content-editor-test-flag" required value={editorDraft.is_test_data} onChange={(event) => { const value = event.currentTarget.value as EditorDraft["is_test_data"]; updateEditorDraft((draft) => ({ ...draft, is_test_data: value })); }} disabled={editorSaving} className="w-full rounded-xl border border-[#CAD3E2] bg-white px-3.5 py-3 text-sm font-semibold text-[#25324A] outline-none transition focus:border-[#315184] focus:ring-2 focus:ring-[#315184]/20 disabled:bg-[#F2F4F7]">
                              <option value="">{t("adminContent.editor.chooseTestFlag")}</option>
                              <option value="true">{t("adminContent.editor.demoTest")}</option>
                              <option value="false">{t("adminContent.editor.nonDemo")}</option>
                            </select>
                            <p className="text-[11px] leading-5 text-[#758096]">{t("adminContent.editor.testFlagHelp")}</p>
                          </div>
                        </div>

                        <div className="flex flex-col-reverse gap-2 border-t border-[#E3E7EE] pt-4 sm:flex-row sm:justify-end">
                          <button type="button" onClick={closeEditor} disabled={editorSaving} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#CFD7E5] bg-white px-5 text-sm font-bold text-[#4D5B75] transition hover:bg-[#F3F6FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] disabled:cursor-wait disabled:opacity-60">
                            {t("adminContent.editor.cancel")}
                          </button>
                          <button type="submit" disabled={editorSaving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1E3A8A] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#172B5B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-65">
                            {editorSaving ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="h-4 w-4" />}
                            {t(editorSaving ? "adminContent.editor.saving" : "adminContent.editor.save")}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                ) : (
                  <>
                    {detailState === "loading" && (
                      <div role="status" className="flex min-h-40 items-center justify-center gap-2 text-sm font-semibold text-[#59677E]">
                        <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin text-[#1E3A8A]" />{t("adminContent.detail.loading")}
                      </div>
                    )}
                    {detailState === "error" && (
                      <div role="alert" className="rounded-2xl border border-[#F0C5C0] bg-[#FFF5F2] p-4 text-sm leading-6 text-[#8D342D] sm:p-5">
                        <div className="flex items-start gap-3">
                          <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
                          <div>
                            <h3 className="font-bold">{t("adminContent.detail.errorTitle")}</h3>
                            <p className="mt-1">{t(detailError ?? "adminContent.error.generic")}</p>
                            {detailReadDetail && <p className="mt-1.5 text-xs font-semibold">{readDetailText(detailReadDetail)}</p>}
                            <button type="button" onClick={() => setDetailRetryCount((count) => count + 1)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#8D342D] px-4 text-xs font-bold text-white transition hover:bg-[#702921] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2">
                              <RefreshCw aria-hidden="true" className="h-4 w-4" />{t("adminContent.detail.retry")}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {detailState === "ready" && detailItems.length === 0 && (
                      <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-[#D5DDE9] bg-white px-5 text-center">
                        <CircleCheck aria-hidden="true" className="h-7 w-7 text-[#6B8496]" />
                        <p className="mt-2 max-w-sm text-sm leading-6 text-[#59677E]">{t(selectedFilter?.type === "unmapped" ? "adminContent.detail.emptyUnmapped" : "adminContent.detail.emptyCell")}</p>
                      </div>
                    )}
                    {detailState === "ready" && detailItems.length > 0 && (
                      <div className="space-y-3">
                        {detailItems.map((item, index) => <ItemCard key={`${item.source}:${item.id}:${index}`} item={item} onEdit={openEditor} />)}
                      </div>
                    )}
                  </>
                )}
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </DialogPrimitive.Root>
    </section>
  );
}
