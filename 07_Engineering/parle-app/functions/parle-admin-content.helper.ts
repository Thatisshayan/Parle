import { AdminActionError, assertAdministrator, type AdminActor, writeAdminAudit } from "./parle-admin-settings.helper.ts";

export const ADMIN_CONTENT_CATEGORIES = [
  "listening",
  "reading",
  "writing_prompts",
  "speaking_prompts",
  "grammar_vocabulary",
] as const;
export const ADMIN_CONTENT_LEVELS = ["A1", "A2", "B1", "B2"] as const;
export const ADMIN_CONTENT_STATUSES = ["approved", "draft", "retired"] as const;
export const ADMIN_CONTENT_LAUNCH_TARGET = 360;
export const ADMIN_CONTENT_MINIMUM_PER_CELL = 10;
export const ADMIN_CONTENT_PAGE_SIZE = 200;

export type AdminContentCategory = (typeof ADMIN_CONTENT_CATEGORIES)[number];
export type AdminContentLevel = (typeof ADMIN_CONTENT_LEVELS)[number];
export type AdminContentStatus = (typeof ADMIN_CONTENT_STATUSES)[number];
export type AdminContentIssue = "unknown_category" | "unknown_level" | "unknown_status" | "test_data_unverified";
export type AdminContentSource = "question" | "prompt";

export interface AdminContentItem {
  id: string;
  source: AdminContentSource;
  code: string;
  category: AdminContentCategory | null;
  category_value: string;
  level: AdminContentLevel | null;
  level_value: string;
  status: AdminContentStatus | null;
  status_value: string;
  is_test_data: boolean | null;
  text: string;
  passage: string;
  transcript: string;
  issues: AdminContentIssue[];
}

export interface AdminContentCell {
  total_count: number;
  non_demo_count: number;
  demo_count: number;
  unverified_count: number;
  launch_ready_count: number;
  under_minimum: boolean;
}

export type AdminContentMatrix = Record<
  AdminContentCategory,
  Record<AdminContentLevel, Record<AdminContentStatus, AdminContentCell>>
>;

export interface AdminContentCoverage {
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
  matrix: AdminContentMatrix;
}

export type AdminContentFilter =
  | { type: "cell"; category: AdminContentCategory; level: AdminContentLevel; status: AdminContentStatus }
  | { type: "unmapped" };

const QUESTION_FIELDS = [
  "id",
  "demo_code",
  "skill",
  "cefr_level",
  "status",
  "is_test_data",
  "prompt",
  "passage",
  "transcript",
];
const PROMPT_FIELDS = ["id", "demo_code", "kind", "cefr_level", "status", "is_test_data", "text"];
const QUESTION_CATEGORIES = new Set(["listening", "reading", "grammar_vocabulary"]);
const LEVEL_SET = new Set<string>(ADMIN_CONTENT_LEVELS);
const STATUS_SET = new Set<string>(ADMIN_CONTENT_STATUSES);
const CATEGORY_SET = new Set<string>(ADMIN_CONTENT_CATEGORIES);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeField(value: unknown, maxLength = 1200, preserveLineBreaks = true): string {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\r\n?/g, "\n");
  const controlPattern = preserveLineBreaks
// eslint-disable-next-line no-control-regex -- Intentional control-character validation or stripping for untrusted text.
    ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g
// eslint-disable-next-line no-control-regex -- Intentional control-character validation or stripping for untrusted text.
    : /[\u0000-\u001f\u007f]/g;
  return normalized.replace(controlPattern, "").trim().slice(0, maxLength);
}

function categoryFor(source: AdminContentSource, value: unknown): AdminContentCategory | null {
  if (typeof value !== "string") return null;
  if (source === "question" && QUESTION_CATEGORIES.has(value)) return value as AdminContentCategory;
  if (source === "prompt" && value === "writing") return "writing_prompts";
  if (source === "prompt" && value === "speaking") return "speaking_prompts";
  return null;
}

function levelFor(value: unknown): AdminContentLevel | null {
  return typeof value === "string" && LEVEL_SET.has(value) ? value as AdminContentLevel : null;
}

function statusFor(value: unknown): AdminContentStatus | null {
  return typeof value === "string" && STATUS_SET.has(value) ? value as AdminContentStatus : null;
}

function normalizeRecord(raw: Record<string, unknown>, source: AdminContentSource, index: number): AdminContentItem {
  const categoryValue = safeField(source === "question" ? raw.skill : raw.kind, 80, false);
  const levelValue = safeField(raw.cefr_level, 40, false);
  const statusValue = safeField(raw.status, 40, false);
  const category = categoryFor(source, source === "question" ? raw.skill : raw.kind);
  const level = levelFor(raw.cefr_level);
  const status = statusFor(raw.status);
  const isTestData = typeof raw.is_test_data === "boolean" ? raw.is_test_data : null;
  const id = safeField(raw.id, 160, false) || `${source}-${index + 1}`;
  const code = safeField(raw.demo_code, 120, false) || id;
  const issues: AdminContentIssue[] = [];

  if (!category) issues.push("unknown_category");
  if (!level) issues.push("unknown_level");
  if (!status) issues.push("unknown_status");
  if (isTestData === null) issues.push("test_data_unverified");

  return {
    id,
    source,
    code,
    category,
    category_value: categoryValue,
    level,
    level_value: levelValue,
    status,
    status_value: statusValue,
    is_test_data: isTestData,
    text: safeField(source === "question" ? raw.prompt : raw.text),
    passage: source === "question" ? safeField(raw.passage) : "",
    transcript: source === "question" ? safeField(raw.transcript) : "",
    issues,
  };
}

export function normalizeAdminContentInventory(
  questions: readonly Record<string, unknown>[],
  prompts: readonly Record<string, unknown>[],
): AdminContentItem[] {
  return [
    ...questions.map((record, index) => normalizeRecord(record, "question", index)),
    ...prompts.map((record, index) => normalizeRecord(record, "prompt", index)),
  ];
}

function emptyCell(): AdminContentCell {
  return {
    total_count: 0,
    non_demo_count: 0,
    demo_count: 0,
    unverified_count: 0,
    launch_ready_count: 0,
    under_minimum: false,
  };
}

function emptyMatrix(): AdminContentMatrix {
  return Object.fromEntries(ADMIN_CONTENT_CATEGORIES.map((category) => [
    category,
    Object.fromEntries(ADMIN_CONTENT_LEVELS.map((level) => [
      level,
      Object.fromEntries(ADMIN_CONTENT_STATUSES.map((status) => [status, emptyCell()])),
    ])),
  ])) as AdminContentMatrix;
}

function hasUnmappedFields(item: AdminContentItem): boolean {
  return item.issues.some((issue) => issue === "unknown_category" || issue === "unknown_level" || issue === "unknown_status");
}

export function buildAdminContentCoverage(items: readonly AdminContentItem[]): AdminContentCoverage {
  const matrix = emptyMatrix();
  for (const item of items) {
    if (!item.category || !item.level || !item.status) continue;
    const cell = matrix[item.category][item.level][item.status];
    cell.total_count += 1;
    if (item.is_test_data === true) cell.demo_count += 1;
    else if (item.is_test_data === false) cell.non_demo_count += 1;
    else cell.unverified_count += 1;
    if (item.status === "approved" && item.is_test_data === false) cell.launch_ready_count += 1;
  }

  let launchReadyCount = 0;
  let lowCoverageCellCount = 0;
  for (const category of ADMIN_CONTENT_CATEGORIES) {
    for (const level of ADMIN_CONTENT_LEVELS) {
      for (const status of ADMIN_CONTENT_STATUSES) {
        const cell = matrix[category][level][status];
        if (status === "approved") {
          launchReadyCount += cell.launch_ready_count;
          cell.under_minimum = cell.launch_ready_count < ADMIN_CONTENT_MINIMUM_PER_CELL;
          if (cell.under_minimum) lowCoverageCellCount += 1;
        }
      }
    }
  }

  const unmappedCount = items.filter(hasUnmappedFields).length;
  const unverifiedCount = items.filter((item) => item.issues.includes("test_data_unverified")).length;
  const unmappedOrUnverifiedCount = items.filter((item) => item.issues.length > 0).length;

  return {
    launch_target: ADMIN_CONTENT_LAUNCH_TARGET,
    minimum_per_cell: ADMIN_CONTENT_MINIMUM_PER_CELL,
    cell_count: ADMIN_CONTENT_CATEGORIES.length * ADMIN_CONTENT_LEVELS.length,
    launch_ready_count: launchReadyCount,
    demo_test_count: items.filter((item) => item.is_test_data === true).length,
    unmapped_count: unmappedCount,
    unverified_count: unverifiedCount,
    unmapped_or_unverified_count: unmappedOrUnverifiedCount,
    low_coverage_cell_count: lowCoverageCellCount,
    total_record_count: items.length,
    matrix,
  };
}

export function parseAdminContentFilter(value: unknown): AdminContentFilter {
  if (!isObject(value)) throw new AdminActionError("CONTENT_FILTER_INVALID", 400);
  const keys = Object.keys(value);
  if (value.type === "unmapped" && keys.length === 1) return { type: "unmapped" };

  if (
    value.type === "cell"
    && keys.length === 4
    && CATEGORY_SET.has(String(value.category))
    && LEVEL_SET.has(String(value.level))
    && STATUS_SET.has(String(value.status))
  ) {
    return {
      type: "cell",
      category: value.category as AdminContentCategory,
      level: value.level as AdminContentLevel,
      status: value.status as AdminContentStatus,
    };
  }

  throw new AdminActionError("CONTENT_FILTER_INVALID", 400);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function filterAdminContentItems(
  items: readonly AdminContentItem[],
  requestedFilter: unknown,
): AdminContentItem[] {
  const filter = parseAdminContentFilter(requestedFilter);
  const matching = filter.type === "unmapped"
    ? items.filter((item) => item.issues.length > 0)
    : items.filter((item) => item.category === filter.category && item.level === filter.level && item.status === filter.status);
  return [...matching].sort((left, right) => compareText(left.code, right.code) || compareText(left.id, right.id));
}

export type AdminContentEntityName = "question_item" | "prompt_item";

export interface AdminContentReadDetail {
  entity: AdminContentEntityName;
  page: number;
  offset: number;
  reason_code: string;
  message: string;
}

export interface AdminContentInventoryRead {
  inventory: AdminContentItem[];
  inventory_complete: boolean;
  read_details: AdminContentReadDetail[];
}

export class AdminContentReadError extends AdminActionError {
  detail: AdminContentReadDetail;

  constructor(detail: AdminContentReadDetail) {
    super("CONTENT_READ_FAILED", 503);
    this.detail = detail;
  }
}

type ContentReadEntity = { filter: (...args: any[]) => Promise<unknown> };
type PageParseResult =
  | { ok: true; rows: Record<string, unknown>[] }
  | { ok: false; reason_code: "CONTENT_PAGE_RESPONSE_INVALID" | "CONTENT_PAGE_ROW_INVALID"; message: string };
type PageReadResult = { rows: Record<string, unknown>[]; terminal: boolean } | { detail: AdminContentReadDetail };
type EntityReadResult = { rows: Record<string, unknown>[]; detail?: AdminContentReadDetail };

function readDetail(
  entity: AdminContentEntityName,
  offset: number,
  reasonCode: string,
  message: string,
): AdminContentReadDetail {
  return {
    entity,
    page: Math.floor(offset / ADMIN_CONTENT_PAGE_SIZE) + 1,
    offset,
    reason_code: reasonCode,
    message,
  };
}

function parseContentPage(response: unknown): PageParseResult {
  const candidate = Array.isArray(response)
    ? response
    : isObject(response) && Array.isArray(response.data)
      ? response.data
      : null;
  if (!candidate) {
    return {
      ok: false,
      reason_code: "CONTENT_PAGE_RESPONSE_INVALID",
      message: "The bank returned an unsupported response shape after one retry.",
    };
  }

  const rows: Record<string, unknown>[] = [];
  for (const value of candidate) {
    if (!isObject(value)) {
      return {
        ok: false,
        reason_code: "CONTENT_PAGE_ROW_INVALID",
        message: "The bank returned an invalid record after one retry.",
      };
    }
    rows.push(value);
  }
  return { ok: true, rows };
}

function readOnlyEntity(
  client: unknown,
  entityName: AdminContentEntityName,
): { entity?: ContentReadEntity; detail?: AdminContentReadDetail } {
  if (!isObject(client) || !isObject(client.entities)) {
    return {
      detail: readDetail(entityName, 0, "CONTENT_ENTITY_UNAVAILABLE", "This question-bank record type is unavailable to the content service."),
    };
  }
  const entity = client.entities[entityName];
  if (!isObject(entity)) {
    return {
      detail: readDetail(entityName, 0, "CONTENT_ENTITY_UNAVAILABLE", "This question-bank record type is unavailable to the content service."),
    };
  }
  if (typeof entity.filter !== "function") {
    return {
      detail: readDetail(entityName, 0, "CONTENT_READ_METHOD_UNAVAILABLE", "This question-bank record type does not support reads."),
    };
  }
  return { entity: entity as ContentReadEntity };
}

async function readContentPage(
  entity: ContentReadEntity,
  entityName: AdminContentEntityName,
  offset: number,
  fields: string[],
  seenIds: Set<string>,
): Promise<PageReadResult> {
  let lastDetail: AdminContentReadDetail | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: unknown;
    try {
      // This is the same caller-token entity filter used by the working admin_get_demo_bank action.
      response = await entity.filter({}, "id", ADMIN_CONTENT_PAGE_SIZE, offset, fields);
    } catch {
      lastDetail = readDetail(
        entityName,
        offset,
        "CONTENT_PAGE_REQUEST_FAILED",
        "The bank page request failed after one retry.",
      );
      continue;
    }

    const parsed = parseContentPage(response);
    if (!parsed.ok) {
      lastDetail = readDetail(entityName, offset, parsed.reason_code, parsed.message);
      continue;
    }

    if (parsed.rows.length === 0) {
      if (attempt === 0) continue;
      return { rows: [], terminal: true };
    }

    const pageIds = new Set<string>();
    let invalidIds = false;
    for (const row of parsed.rows) {
      const id = safeField(row.id, 160, false);
      if (!id || seenIds.has(id) || pageIds.has(id)) {
        invalidIds = true;
        break;
      }
      pageIds.add(id);
    }
    if (invalidIds) {
      lastDetail = readDetail(
        entityName,
        offset,
        "CONTENT_PAGE_RECORDS_INVALID",
        "The bank page contains a missing or repeated record ID after one retry.",
      );
      continue;
    }

    for (const id of pageIds) seenIds.add(id);
    return { rows: parsed.rows, terminal: parsed.rows.length < ADMIN_CONTENT_PAGE_SIZE };
  }

  return {
    detail: lastDetail ?? readDetail(
      entityName,
      offset,
      "CONTENT_PAGE_REQUEST_FAILED",
      "The bank page request failed after one retry.",
    ),
  };
}

async function readAllEntityRows(
  client: unknown,
  entityName: AdminContentEntityName,
  fields: string[],
): Promise<EntityReadResult> {
  const available = readOnlyEntity(client, entityName);
  if (!available.entity) return { rows: [], detail: available.detail };

  const records: Record<string, unknown>[] = [];
  const seenIds = new Set<string>();
  let offset = 0;

  while (true) {
    const page = await readContentPage(available.entity, entityName, offset, fields, seenIds);
    if ("detail" in page) return { rows: records, detail: page.detail };
    if (page.rows.length === 0 || page.terminal) {
      records.push(...page.rows);
      break;
    }
    records.push(...page.rows);
    offset += page.rows.length;
  }

  return { rows: records };
}

export async function readAdminContentInventoryResult(client: unknown): Promise<AdminContentInventoryRead> {
  const [questionResult, promptResult] = await Promise.all([
    readAllEntityRows(client, "question_item", QUESTION_FIELDS),
    readAllEntityRows(client, "prompt_item", PROMPT_FIELDS),
  ]);
  const readDetails = [questionResult.detail, promptResult.detail].filter(
    (detail): detail is AdminContentReadDetail => Boolean(detail),
  );
  for (const detail of readDetails) {
    console.error("Parle administrator content bank page remained unavailable", detail);
  }
  return {
    inventory: normalizeAdminContentInventory(questionResult.rows, promptResult.rows),
    inventory_complete: readDetails.length === 0,
    read_details: readDetails,
  };
}

export async function readAdminContentInventory(client: unknown): Promise<AdminContentItem[]> {
  const result = await readAdminContentInventoryResult(client);
  if (!result.inventory_complete) throw new AdminContentReadError(result.read_details[0]);
  return result.inventory;
}

export async function adminContentCoverageAction(
  client: unknown,
  actor: AdminActor,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  assertAdministrator(actor);

  if (body.view === "coverage") {
    const result = await readAdminContentInventoryResult(client);
    return {
      status: "complete",
      view: "coverage",
      inventory_complete: result.inventory_complete,
      read_details: result.read_details,
      coverage: buildAdminContentCoverage(result.inventory),
    };
  }

  if (body.view === "items") {
    const filter = parseAdminContentFilter(body.filter);
    const result = await readAdminContentInventoryResult(client);
    if (!result.inventory_complete) throw new AdminContentReadError(result.read_details[0]);
    const items = filterAdminContentItems(result.inventory, filter);
    return {
      status: "complete",
      view: "items",
      count: items.length,
      items,
    };
  }

  throw new AdminActionError("CONTENT_VIEW_INVALID", 400);
}

export interface AdminContentEditorOption {
  id: string;
  text: string;
}

export interface AdminContentEditorItem {
  id: string;
  source: AdminContentSource;
  code: string;
  category: AdminContentCategory | null;
  category_value: string;
  level: AdminContentLevel | null;
  level_value: string;
  status: AdminContentStatus | null;
  status_value: string;
  is_test_data: boolean | null;
  created_by_type: string;
  reviewed_by: string;
  text: string;
  passage: string;
  transcript: string;
  explanation: string;
  options: AdminContentEditorOption[];
  answer_option_id: string;
  correct_answer_text: string;
  format: string;
  revision: string;
}

const QUESTION_EDITOR_FIELDS = [
  "id", "demo_code", "skill", "cefr_level", "status", "is_test_data", "created_by_type", "reviewed_by", "format", "prompt", "passage", "transcript",
  "options", "answer_option_id", "answer", "explanation", "content_audit_version", "updated_at",
];
const PROMPT_EDITOR_FIELDS = [
  "id", "demo_code", "kind", "cefr_level", "status", "is_test_data", "created_by_type", "reviewed_by", "text", "content_audit_version", "updated_at",
];
const CONTENT_EDITOR_STATUSES = new Set<string>(ADMIN_CONTENT_STATUSES);

type EditableContentEntity = {
  filter: (...args: any[]) => Promise<unknown>;
  update?: (id: string, data: Record<string, unknown>) => Promise<unknown>;
};

function contentEntityName(source: AdminContentSource): AdminContentEntityName {
  return source === "question" ? "question_item" : "prompt_item";
}

function parseEditorSource(value: unknown): AdminContentSource {
  if (value === "question" || value === "prompt") return value;
  throw new AdminActionError("CONTENT_SOURCE_INVALID", 400);
}

function parseEditorRecordId(value: unknown): string {
  if (typeof value !== "string") throw new AdminActionError("CONTENT_NOT_FOUND", 404);
  const id = value.trim();
  if (!id || id.length > 160) throw new AdminActionError("CONTENT_NOT_FOUND", 404);
  return id;
}

function editorEntity(client: unknown, source: AdminContentSource, requireUpdate = false): EditableContentEntity {
  const name = contentEntityName(source);
  if (!isObject(client) || !isObject(client.entities)) throw new AdminActionError("CONTENT_ENTITY_UNAVAILABLE", 503);
  const value = client.entities[name];
  if (!isObject(value) || typeof value.filter !== "function" || (requireUpdate && typeof value.update !== "function")) {
    throw new AdminActionError("CONTENT_ENTITY_UNAVAILABLE", 503);
  }
  return value as EditableContentEntity;
}

function editorFieldText(value: unknown): string {
  if (typeof value !== "string") return "";
// eslint-disable-next-line no-control-regex -- Intentional control-character validation or stripping for untrusted text.
  return value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

function uniqueFallbackOptionId(index: number, used: Set<string>): string {
  let candidate = `legacy-option-${index + 1}`;
  let suffix = 1;
  while (used.has(candidate)) {
    suffix += 1;
    candidate = `legacy-option-${index + 1}-${suffix}`;
  }
  return candidate;
}

function questionOptionsForRecord(raw: Record<string, unknown>): {
  options: AdminContentEditorOption[];
  answerOptionId: string;
} {
  const rawOptions = Array.isArray(raw.options) ? raw.options : [];
  const usedIds = new Set<string>();
  const sourceIds = rawOptions.map((entry) => isObject(entry) ? safeField(entry.id, 80, false) : "");
  const sourceIdCounts = new Map<string, number>();
  for (const id of sourceIds) if (id) sourceIdCounts.set(id, (sourceIdCounts.get(id) ?? 0) + 1);

  const options = rawOptions.map((entry, index) => {
    const sourceId = sourceIds[index];
    const id = sourceId && sourceIdCounts.get(sourceId) === 1 && !usedIds.has(sourceId)
      ? sourceId
      : uniqueFallbackOptionId(index, usedIds);
    usedIds.add(id);
    const text = typeof entry === "string" ? editorFieldText(entry) : isObject(entry) ? editorFieldText(entry.text) : "";
    return { id, text };
  });

  const rawAnswerId = safeField(raw.answer_option_id, 80, false);
  let answerOptionId = "";
  if (rawAnswerId) {
    const originalIndex = sourceIds.findIndex((id) => id === rawAnswerId && sourceIdCounts.get(id) === 1);
    if (originalIndex >= 0) answerOptionId = options[originalIndex]?.id ?? "";
    if (!answerOptionId) {
      const normalizedMatches = options.filter((option) => option.id === rawAnswerId);
      if (normalizedMatches.length === 1) answerOptionId = normalizedMatches[0].id;
    }
  }
  if (!answerOptionId) {
    const legacyAnswer = editorFieldText(raw.answer);
    const matches = options.filter((option) => option.text === legacyAnswer);
    if (legacyAnswer && matches.length === 1) answerOptionId = matches[0].id;
  }
  return { options, answerOptionId };
}

function stableSnapshotValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableSnapshotValue);
  if (isObject(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) result[key] = stableSnapshotValue(value[key]);
    return result;
  }
  return value === undefined ? null : value;
}

function editorRevision(source: AdminContentSource, raw: Record<string, unknown>): string {
  const identity = {
    source,
    id: raw.id ?? null,
    category: source === "question" ? raw.skill ?? null : raw.kind ?? null,
    level: raw.cefr_level ?? null,
    status: raw.status ?? null,
    is_test_data: raw.is_test_data ?? null,
    created_by_type: raw.created_by_type ?? null,
    reviewed_by: raw.reviewed_by ?? null,
    format: source === "question" ? raw.format ?? null : null,
    text: source === "question" ? raw.prompt ?? null : raw.text ?? null,
    passage: source === "question" ? raw.passage ?? null : null,
    transcript: source === "question" ? raw.transcript ?? null : null,
    options: source === "question" ? raw.options ?? null : null,
    answer_option_id: source === "question" ? raw.answer_option_id ?? null : null,
    answer: source === "question" ? raw.answer ?? null : null,
    explanation: source === "question" ? raw.explanation ?? null : null,
    content_audit_version: raw.content_audit_version ?? null,
    updated_at: raw.updated_at ?? null,
  };
  return JSON.stringify(stableSnapshotValue(identity));
}

async function readCanonicalContentRecord(
  client: unknown,
  source: AdminContentSource,
  recordId: string,
): Promise<Record<string, unknown>> {
  const entity = editorEntity(client, source);
  const fields = source === "question" ? QUESTION_EDITOR_FIELDS : PROMPT_EDITOR_FIELDS;
  let response: unknown;
  try {
    response = await entity.filter({ id: recordId }, "id", 10, 0, fields);
  } catch (error) {
    console.error("Parle administrator content item could not be read", { entity: contentEntityName(source), recordId, error });
    throw new AdminActionError("CONTENT_READ_FAILED", 503);
  }
  const parsed = parseContentPage(response);
  if (!parsed.ok) throw new AdminActionError("CONTENT_READ_FAILED", 503);
  const matches = parsed.rows.filter((row) => row.id === recordId);
  if (matches.length !== 1) throw new AdminActionError("CONTENT_NOT_FOUND", 404);
  return matches[0];
}

function contentEditorItem(source: AdminContentSource, raw: Record<string, unknown>): AdminContentEditorItem {
  const categoryValue = safeField(source === "question" ? raw.skill : raw.kind, 80, false);
  const levelValue = safeField(raw.cefr_level, 40, false);
  const statusValue = safeField(raw.status, 40, false);
  const options = source === "question" ? questionOptionsForRecord(raw) : { options: [], answerOptionId: "" };
  const correctOption = options.options.find((option) => option.id === options.answerOptionId);
  return {
    id: String(raw.id),
    source,
    code: safeField(raw.demo_code, 120, false) || String(raw.id),
    category: categoryFor(source, source === "question" ? raw.skill : raw.kind),
    category_value: categoryValue,
    level: levelFor(raw.cefr_level),
    level_value: levelValue,
    status: statusFor(raw.status),
    status_value: statusValue,
    is_test_data: typeof raw.is_test_data === "boolean" ? raw.is_test_data : null,
    created_by_type: safeField(raw.created_by_type, 40, false),
    reviewed_by: safeField(raw.reviewed_by, 500),
    text: editorFieldText(source === "question" ? raw.prompt : raw.text),
    passage: source === "question" ? editorFieldText(raw.passage) : "",
    transcript: source === "question" ? editorFieldText(raw.transcript) : "",
    explanation: source === "question" ? editorFieldText(raw.explanation) : "",
    options: options.options,
    answer_option_id: options.answerOptionId,
    correct_answer_text: correctOption?.text ?? "",
    format: source === "question" ? safeField(raw.format, 80, false) : "",
    revision: editorRevision(source, raw),
  };
}

export async function adminGetContentItemAction(
  client: unknown,
  actor: AdminActor,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  assertAdministrator(actor);
  const source = parseEditorSource(body.source);
  const recordId = parseEditorRecordId(body.item_id);
  const raw = await readCanonicalContentRecord(client, source, recordId);
  return { status: "complete", item: contentEditorItem(source, raw) };
}

function cleanEditorText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") throw new AdminActionError("CONTENT_PATCH_INVALID", 400);
  const clean = editorFieldText(value);
  if (clean.length > maxLength) throw new AdminActionError("CONTENT_PATCH_INVALID", 400);
  return clean;
}

function parseEditorOptions(value: unknown): AdminContentEditorOption[] {
  if (!Array.isArray(value) || value.length > 8) throw new AdminActionError("CONTENT_PATCH_INVALID", 400);
  return value.map((entry) => {
    if (!isObject(entry) || Object.keys(entry).some((key) => key !== "id" && key !== "text")
      || typeof entry.id !== "string" || typeof entry.text !== "string") {
      throw new AdminActionError("CONTENT_PATCH_INVALID", 400);
    }
    const id = safeField(entry.id, 80, false);
    const text = cleanEditorText(entry.text, 500);
    if (!id || id !== entry.id.trim()) throw new AdminActionError("CONTENT_PATCH_INVALID", 400);
    return { id, text };
  });
}

function parseEditorPatch(source: AdminContentSource, value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new AdminActionError("CONTENT_PATCH_INVALID", 400);
  const allowed = source === "question"
    ? new Set(["prompt", "passage", "transcript", "explanation", "options", "answer_option_id", "status", "is_test_data"])
    : new Set(["text", "status", "is_test_data"]);
  const keys = Object.keys(value);
  if (!keys.length || keys.some((key) => !allowed.has(key))) throw new AdminActionError("CONTENT_PATCH_INVALID", 400);
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const item = value[key];
    if (key === "options") {
      result.options = parseEditorOptions(item);
    } else if (key === "status") {
      if (typeof item !== "string" || !CONTENT_EDITOR_STATUSES.has(item)) throw new AdminActionError("CONTENT_STATUS_INVALID", 400);
      result.status = item;
    } else if (key === "is_test_data") {
      if (typeof item !== "boolean") throw new AdminActionError("CONTENT_TEST_FLAG_INVALID", 400);
      result.is_test_data = item;
    } else if (key === "answer_option_id") {
      if (typeof item !== "string" || item.length > 80) throw new AdminActionError("CONTENT_PATCH_INVALID", 400);
      result.answer_option_id = safeField(item, 80, false);
    } else {
      const maxLength = key === "text" ? 5000 : key === "explanation" ? 3000 : 7000;
      result[key] = cleanEditorText(item, maxLength);
    }
  }
  if (JSON.stringify(result).length > 30000) throw new AdminActionError("CONTENT_PATCH_INVALID", 400);
  return result;
}

function deepEqualContent(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function canonicalStoredText(value: unknown): string {
  return typeof value === "string" ? editorFieldText(value) : "";
}

export function validateMergedContent(
  source: AdminContentSource,
  record: Record<string, unknown>,
  options: AdminContentEditorOption[],
  answerOptionId: string,
): { correctAnswerText: string } {
  const status = statusFor(record.status);
  if (!status) throw new AdminActionError("CONTENT_STATUS_INVALID", 400);
  if (typeof record.is_test_data !== "boolean") throw new AdminActionError("CONTENT_TEST_FLAG_INVALID", 400);

  if (source === "question") {
    if (record.format !== "multiple_choice") throw new AdminActionError("CONTENT_FORMAT_INVALID", 400);
    if (options.length < 2 || options.length > 4) throw new AdminActionError("CONTENT_OPTIONS_INVALID", 400);
    const ids = new Set<string>();
    for (const option of options) {
      if (typeof option.id !== "string" || !option.id.trim() || option.id.length > 80 || ids.has(option.id)
        || typeof option.text !== "string" || !option.text.trim() || option.text.length > 500) {
        throw new AdminActionError("CONTENT_OPTIONS_INVALID", 400);
      }
      ids.add(option.id);
    }
    const correctMatches = options.filter((option) => option.id === answerOptionId);
    if (correctMatches.length !== 1) throw new AdminActionError("CONTENT_OPTIONS_INVALID", 400);
    if (status === "approved") {
      if (!categoryFor(source, record.skill)) throw new AdminActionError("CONTENT_CATEGORY_REQUIRED", 400);
      if (!levelFor(record.cefr_level)) throw new AdminActionError("CONTENT_LEVEL_REQUIRED", 400);
      if (!canonicalStoredText(record.prompt).trim()) throw new AdminActionError("CONTENT_APPROVED_TEXT_REQUIRED", 400);
    }
    return { correctAnswerText: correctMatches[0].text };
  }

  if (status === "approved") {
    if (!categoryFor(source, record.kind)) throw new AdminActionError("CONTENT_CATEGORY_REQUIRED", 400);
    if (!levelFor(record.cefr_level)) throw new AdminActionError("CONTENT_LEVEL_REQUIRED", 400);
    if (!canonicalStoredText(record.text).trim()) throw new AdminActionError("CONTENT_APPROVED_TEXT_REQUIRED", 400);
  }
  return { correctAnswerText: "" };
}

function rawOptionsAreLegacyText(rawOptions: unknown): boolean {
  return Array.isArray(rawOptions) && rawOptions.every((entry) => typeof entry === "string");
}

function rawOptionsHaveValidIds(rawOptions: unknown): boolean {
  if (!Array.isArray(rawOptions) || rawOptions.some((entry) => !isObject(entry)
    || typeof entry.id !== "string"
    || !entry.id.trim()
    || entry.id.length > 80
    || safeField(entry.id, 80, false) !== entry.id
    || typeof entry.text !== "string")) return false;
  const ids = rawOptions.map((entry) => (entry as Record<string, unknown>).id as string);
  return new Set(ids).size === ids.length;
}

async function assertDemoInventoryFloor(
  client: unknown,
  source: AdminContentSource,
  current: Record<string, unknown>,
  merged: Record<string, unknown>,
  recordId: string,
): Promise<void> {
  const wasApprovedTest = current.status === "approved" && current.is_test_data === true;
  const remainsApprovedTest = merged.status === "approved" && merged.is_test_data === true;
  if (!wasApprovedTest || remainsApprovedTest) return;

  const categoryValue = source === "question" ? current.skill : current.kind;
  const category = categoryFor(source, categoryValue);
  const level = levelFor(current.cefr_level);
  if (!category || !level) return;

  const inventory = await readAdminContentInventoryResult(client);
  if (!inventory.inventory_complete) throw new AdminContentReadError(inventory.read_details[0]);
  const remaining = inventory.inventory.filter((item) => item.id !== recordId
    && item.source === source
    && item.category === category
    && item.level === level
    && item.status === "approved"
    && item.is_test_data === true).length;
  const minimum = source === "question" ? 10 : 2;
  if (remaining < minimum) {
    throw new AdminActionError(source === "question" ? "CONTENT_MINIMUM_QUESTION_FLOOR" : "CONTENT_MINIMUM_PROMPT_FLOOR", 409);
  }
}

export async function adminSaveContentItemAction(
  client: unknown,
  actor: AdminActor,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  assertAdministrator(actor);
  const source = parseEditorSource(body.source);
  const recordId = parseEditorRecordId(body.item_id);
  if (typeof body.expected_revision !== "string" || body.expected_revision.length < 2 || body.expected_revision.length > 60000) {
    throw new AdminActionError("CONTENT_PATCH_INVALID", 400);
  }
  const prepared = parseEditorPatch(source, body.content);
  const entity = editorEntity(client, source, true);
  const current = await readCanonicalContentRecord(client, source, recordId);
  if (editorRevision(source, current) !== body.expected_revision) throw new AdminActionError("CONTENT_STALE", 409);

  const currentEditor = contentEditorItem(source, current);
  const merged: Record<string, unknown> = { ...current };
  const textKeys = source === "question"
    ? ["prompt", "passage", "transcript", "explanation"]
    : ["text"];
  for (const key of textKeys) if (Object.prototype.hasOwnProperty.call(prepared, key)) merged[key] = prepared[key];
  if (Object.prototype.hasOwnProperty.call(prepared, "status")) merged.status = prepared.status;
  if (Object.prototype.hasOwnProperty.call(prepared, "is_test_data")) merged.is_test_data = prepared.is_test_data;

  const submittedOptions = source === "question" && Array.isArray(prepared.options)
    ? prepared.options as AdminContentEditorOption[]
    : currentEditor.options;
  const submittedAnswerId = source === "question" && typeof prepared.answer_option_id === "string"
    ? prepared.answer_option_id
    : currentEditor.answer_option_id;
  const optionsChanged = source === "question" && !deepEqualContent(submittedOptions, currentEditor.options);
  const answerChanged = source === "question" && submittedAnswerId !== currentEditor.answer_option_id;

  if (source === "question") {
    if (!optionsChanged && !rawOptionsAreLegacyText(current.options) && !rawOptionsHaveValidIds(current.options)) {
      throw new AdminActionError("CONTENT_OPTIONS_INVALID", 400);
    }
    merged.options = submittedOptions;
    merged.answer_option_id = submittedAnswerId;
  }

  const { correctAnswerText } = validateMergedContent(source, merged, submittedOptions, submittedAnswerId);

  const patch: Record<string, unknown> = {};
  for (const key of textKeys) {
    if (!Object.prototype.hasOwnProperty.call(prepared, key)) continue;
    const value = prepared[key];
    if (canonicalStoredText(current[key]) !== value) patch[key] = value;
  }
  if (Object.prototype.hasOwnProperty.call(prepared, "status") && current.status !== prepared.status) patch.status = prepared.status;
  if (Object.prototype.hasOwnProperty.call(prepared, "is_test_data") && current.is_test_data !== prepared.is_test_data) patch.is_test_data = prepared.is_test_data;

  if (source === "question") {
    if (optionsChanged && !deepEqualContent(current.options, submittedOptions)) patch.options = submittedOptions;
    if ((optionsChanged || answerChanged || (!rawOptionsAreLegacyText(current.options) && rawOptionsHaveValidIds(current.options)))
      && current.answer_option_id !== submittedAnswerId) {
      patch.answer_option_id = submittedAnswerId;
    }
    if (current.answer !== correctAnswerText) patch.answer = correctAnswerText;
  }

  const changedFields = Object.keys(patch);
  if (!changedFields.length) {
    return { status: "complete", changed: false, audit_status: "unchanged", changed_fields: [] };
  }

  await assertDemoInventoryFloor(client, source, current, merged, recordId);
  const latest = await readCanonicalContentRecord(client, source, recordId);
  if (editorRevision(source, latest) !== body.expected_revision) throw new AdminActionError("CONTENT_STALE", 409);

  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  for (const key of changedFields) {
    oldValue[key] = current[key] === undefined ? null : current[key];
    newValue[key] = patch[key];
  }

  try {
    await entity.update?.(recordId, patch);
  } catch (error) {
    console.error("Parle administrator content item could not be saved", { entity: contentEntityName(source), recordId, error });
    throw new AdminActionError("CONTENT_SAVE_FAILED", 503);
  }

  try {
    await writeAdminAudit(client, actor, {
      action: "question_bank.content_updated",
      target_type: contentEntityName(source),
      target_id: recordId,
      old_value: oldValue,
      new_value: newValue,
    });
  } catch (error) {
    const auditErrorCode = error instanceof AdminActionError ? error.code : "AUDIT_WRITE_FAILED";
    console.error("Parle content item was saved but its audit entry could not be recorded", {
      entity: contentEntityName(source),
      recordId,
      auditErrorCode,
      error,
    });
    return {
      status: "partial",
      changed: true,
      audit_status: "failed",
      audit_error_code: auditErrorCode,
      changed_fields: changedFields,
    };
  }

  return { status: "complete", changed: true, audit_status: "written", changed_fields: changedFields };
}
