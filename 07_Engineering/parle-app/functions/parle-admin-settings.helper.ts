export type AdminActor = {
  id?: string;
  email?: string;
  role?: string;
  full_name?: string | null;
};

export const APP_SETTING_DEFAULTS = {
  free_ai_messages_per_day: 10,
  premium_fair_use_ai_messages_per_day: 300,
  premium_live_voice_minutes_per_month: 60,
  commission_percent: 20,
  payout_delay_hours: 72,
  cancellation_window_hours: 24,
  minimum_lesson_charge_usd: 8,
  founding_commission_percent: 10,
  min_notice_hours: 12,
  booking_horizon_days: 30,
  slot_hold_minutes: 30,
  auto_complete_hours: 48,
  tutor_cancellation_flag_count: 3,
  live_voice_enabled: false,
  premium_roadmap_triggers_enabled: false,
  // Plan 9 (spec 6): daily voice limits, per learner and day in their time zone
  free_voice_answers_per_day: 2,
  premium_voice_answers_per_day: 15,
  free_voice_messages_per_day: 5,
  premium_voice_messages_per_day: 60,
  free_voice_replies_per_day: 20,
  premium_voice_replies_per_day: 200,
} as const;

export type AppSettingKey = keyof typeof APP_SETTING_DEFAULTS;
export type AppSettings = { [Key in AppSettingKey]: (typeof APP_SETTING_DEFAULTS)[Key] };
export type SettingScalar = number | boolean;

type SettingRule = { type: "integer" | "decimal" | "boolean"; min?: number; max?: number; decimals?: number };

export const APP_SETTING_RULES: Record<AppSettingKey, SettingRule> = {
  free_ai_messages_per_day: { type: "integer", min: 0, max: 100 },
  premium_fair_use_ai_messages_per_day: { type: "integer", min: 1, max: 5000 },
  premium_live_voice_minutes_per_month: { type: "integer", min: 0, max: 600 },
  commission_percent: { type: "decimal", min: 0, max: 50, decimals: 2 },
  payout_delay_hours: { type: "integer", min: 0, max: 720 },
  cancellation_window_hours: { type: "integer", min: 0, max: 168 },
  minimum_lesson_charge_usd: { type: "decimal", min: 8, max: 500, decimals: 2 },
  founding_commission_percent: { type: "decimal", min: 0, max: 50, decimals: 2 },
  min_notice_hours: { type: "integer", min: 0, max: 48 },
  booking_horizon_days: { type: "integer", min: 1, max: 30 },
  slot_hold_minutes: { type: "integer", min: 30, max: 120 },
  auto_complete_hours: { type: "integer", min: 24, max: 168 },
  tutor_cancellation_flag_count: { type: "integer", min: 1, max: 20 },
  live_voice_enabled: { type: "boolean" },
  premium_roadmap_triggers_enabled: { type: "boolean" },
  free_voice_answers_per_day: { type: "integer", min: 0, max: 50 },
  premium_voice_answers_per_day: { type: "integer", min: 1, max: 500 },
  free_voice_messages_per_day: { type: "integer", min: 0, max: 200 },
  premium_voice_messages_per_day: { type: "integer", min: 1, max: 2000 },
  free_voice_replies_per_day: { type: "integer", min: 0, max: 500 },
  premium_voice_replies_per_day: { type: "integer", min: 1, max: 5000 },
};

/** Each Premium allowance is at least its Free allowance (AI messages, and the Plan 9 voice limits). */
export const FREE_PREMIUM_PAIRS: ReadonlyArray<readonly [AppSettingKey, AppSettingKey]> = [
  ["free_ai_messages_per_day", "premium_fair_use_ai_messages_per_day"],
  ["free_voice_answers_per_day", "premium_voice_answers_per_day"],
  ["free_voice_messages_per_day", "premium_voice_messages_per_day"],
  ["free_voice_replies_per_day", "premium_voice_replies_per_day"],
];

export class AdminActionError extends Error {
  code: string;
  status: number;

  constructor(code: string, status = 400) {
    super(code);
    this.name = "AdminActionError";
    this.code = code;
    this.status = status;
  }
}

type SettingRow = Record<string, unknown> & { id?: string; key?: string; value?: unknown; updated_at?: string };
type AuditRow = Record<string, unknown> & { id?: string; action?: string; occurred_at_utc?: string; created_at?: string };

const SETTING_KEYS = Object.keys(APP_SETTING_DEFAULTS) as AppSettingKey[];

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordsFromResponse<T>(response: unknown, failureCode: string): T[] {
  if (Array.isArray(response)) return response as T[];
  if (isObject(response) && Array.isArray(response.data)) return response.data as T[];
  throw new AdminActionError(failureCode, 503);
}

function entityFor(client: unknown, name: string, requiredMethods: string[]): Record<string, any> {
  const entities = isObject(client) && isObject(client.entities) ? client.entities : null;
  const entity = entities && isObject(entities[name]) ? entities[name] as Record<string, any> : null;
  if (!entity || requiredMethods.some((method) => typeof entity[method] !== "function")) {
    const auditSource = name === "admin_audit_log" || name === "tutor_application_review";
    throw new AdminActionError(auditSource ? "AUDIT_UNAVAILABLE" : "SETTINGS_UNAVAILABLE", 503);
  }
  return entity;
}

function sortByUpdatedAt(rows: SettingRow[]): SettingRow[] {
  return [...rows].sort((left, right) => {
    const leftTime = typeof left.updated_at === "string" ? Date.parse(left.updated_at) : 0;
    const rightTime = typeof right.updated_at === "string" ? Date.parse(right.updated_at) : 0;
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });
}

function decodeSettingValue(key: AppSettingKey, value: unknown): SettingScalar | undefined {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return undefined;
    }
  }
  const rule = APP_SETTING_RULES[key];
  if (rule.type === "boolean") return typeof candidate === "boolean" ? candidate : undefined;
  if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate < Number(rule.min) || candidate > Number(rule.max)) return undefined;
  if (rule.type === "integer" && !Number.isInteger(candidate)) return undefined;
  if (rule.type === "decimal") {
    const scale = 10 ** Number(rule.decimals ?? 2);
    if (Math.abs(candidate - Math.round(candidate * scale) / scale) > 1e-8) return undefined;
  }
  return candidate;
}

export function validateAdminSettings(
  input: unknown,
  current: AppSettings = APP_SETTING_DEFAULTS,
): { valid: true; values: AppSettings } | { valid: false; key: AppSettingKey | null; code: "SETTINGS_INVALID" } {
  if (!isObject(input)) return { valid: false, key: null, code: "SETTINGS_INVALID" };
  const known = new Set<string>(SETTING_KEYS);
  if (Object.keys(input).some((key) => !known.has(key))) return { valid: false, key: null, code: "SETTINGS_INVALID" };

  const values: Record<string, SettingScalar> = { ...current };
  for (const key of SETTING_KEYS) {
    const value = Object.prototype.hasOwnProperty.call(input, key) ? input[key] : current[key];
    const rule = APP_SETTING_RULES[key];
    if (rule.type === "boolean") {
      if (typeof value !== "boolean") return { valid: false, key, code: "SETTINGS_INVALID" };
      values[key] = value;
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < Number(rule.min) || value > Number(rule.max)) {
      return { valid: false, key, code: "SETTINGS_INVALID" };
    }
    if (rule.type === "integer" && !Number.isInteger(value)) return { valid: false, key, code: "SETTINGS_INVALID" };
    if (rule.type === "decimal") {
      const scale = 10 ** Number(rule.decimals ?? 2);
      if (Math.abs(value - Math.round(value * scale) / scale) > 1e-8) return { valid: false, key, code: "SETTINGS_INVALID" };
    }
    values[key] = value;
  }
  for (const [free, premium] of FREE_PREMIUM_PAIRS) {
    if (Number(values[premium]) < Number(values[free])) return { valid: false, key: premium, code: "SETTINGS_INVALID" };
  }
  return { valid: true, values: values as AppSettings };
}

async function readSettingRows(client: unknown): Promise<SettingRow[]> {
  const entity = entityFor(client, "app_setting", ["filter"]);
  const response = await entity.filter({}, "-updated_at", 100);
  return sortByUpdatedAt(recordsFromResponse<SettingRow>(response, "SETTINGS_READ_FAILED"));
}

function settingsFromRows(rows: SettingRow[]): AppSettings {
  const values: Record<string, SettingScalar> = { ...APP_SETTING_DEFAULTS };
  const seen = new Set<string>();
  for (const row of sortByUpdatedAt(rows)) {
    const key = typeof row.key === "string" && Object.prototype.hasOwnProperty.call(APP_SETTING_DEFAULTS, row.key)
      ? row.key as AppSettingKey
      : null;
    if (!key || seen.has(key)) continue;
    const parsed = decodeSettingValue(key, row.value);
    if (parsed === undefined) continue;
    values[key] = parsed;
    seen.add(key);
  }
  for (const [free, premium] of FREE_PREMIUM_PAIRS) {
    if (Number(values[premium]) < Number(values[free])) {
      values[premium] = Math.max(Number(APP_SETTING_DEFAULTS[premium]), Number(values[free]));
    }
  }
  return values as AppSettings;
}

export async function readAppSettings(client: unknown): Promise<AppSettings> {
  return settingsFromRows(await readSettingRows(client));
}

export function assertAdministrator(actor: AdminActor): asserts actor is AdminActor & { id: string; email: string } {
  if (actor?.role !== "administrator" || typeof actor.id !== "string" || !actor.id || typeof actor.email !== "string" || !actor.email) {
    throw new AdminActionError("ADMIN_REQUIRED", 403);
  }
}

function safeJson(value: unknown): string {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value === undefined ? null : value);
  } catch {
    throw new AdminActionError("AUDIT_VALUE_INVALID", 400);
  }
  if (!serialized || serialized.length > 50000) throw new AdminActionError("AUDIT_VALUE_TOO_LARGE", 400);
  return serialized;
}

type AuditEntry = {
  action: string;
  target_type: string;
  target_id: string;
  old_value: unknown;
  new_value: unknown;
  occurred_at_utc?: string;
};

/** The audit row an administrator action writes (shared by the normal and the atomic save paths). */
export function buildAuditRow(actor: AdminActor, entry: AuditEntry): Record<string, string> {
  assertAdministrator(actor);
  if (!entry.action || !entry.target_type || !entry.target_id) throw new AdminActionError("AUDIT_ENTRY_INVALID", 400);
  const occurredAt = entry.occurred_at_utc ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(occurredAt))) throw new AdminActionError("AUDIT_ENTRY_INVALID", 400);
// eslint-disable-next-line no-control-regex -- Intentional control-character validation or stripping for untrusted text.
  const actorLabel = (typeof actor.full_name === "string" && actor.full_name.trim() ? actor.full_name : actor.email).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 160);
  return {
    actor_user_id: actor.id,
    actor_label: actorLabel,
    action: entry.action.slice(0, 120),
    target_type: entry.target_type.slice(0, 100),
    target_id: entry.target_id.slice(0, 160),
    old_value: safeJson(entry.old_value),
    new_value: safeJson(entry.new_value),
    occurred_at_utc: new Date(occurredAt).toISOString(),
  };
}

type AtomicSettingSave = (input: { key: string; value: string; updatedBy: string; audit: Record<string, string> }) => Promise<void>;

/** On our backend the server client saves a setting and its audit row in one transaction (S24). */
function atomicSettingSave(client: unknown): AtomicSettingSave | null {
  const atomic = isObject(client) ? (client as Record<string, unknown>).atomic : null;
  const fn = isObject(atomic) ? atomic.saveSettingWithAudit : null;
  return typeof fn === "function" ? (fn as AtomicSettingSave) : null;
}

export async function writeAdminAudit(client: unknown, actor: AdminActor, entry: AuditEntry): Promise<void> {
  const row = buildAuditRow(actor, entry);
  const entity = entityFor(client, "admin_audit_log", ["create"]);
  try {
    await entity.create(row);
  } catch (error) {
    console.error("Parle administrator audit entry could not be written", error);
    throw new AdminActionError("AUDIT_WRITE_FAILED", 503);
  }
}

export async function initializeAppSettings(client: unknown, actor: AdminActor): Promise<AppSettings> {
  assertAdministrator(actor);
  const existingRows = await readSettingRows(client);
  const existingKeys = new Set(existingRows.filter((row) => typeof row.key === "string").map((row) => row.key));
  const entity = entityFor(client, "app_setting", ["create"]);
  for (const key of SETTING_KEYS) {
    if (existingKeys.has(key)) continue;
    const value = APP_SETTING_DEFAULTS[key];
    const atomic = atomicSettingSave(client);
    if (atomic) {
      const audit = buildAuditRow(actor, { action: "setting.initialized", target_type: "app_setting", target_id: key, old_value: null, new_value: value });
      try {
        await atomic({ key, value: JSON.stringify(value), updatedBy: actor.id, audit });
      } catch (error) {
        console.error("Parle default setting could not be initialized", { key, error });
        throw new AdminActionError("SETTING_SAVE_FAILED", 503);
      }
      existingKeys.add(key);
      continue;
    }
    try {
      await entity.create({ key, value: JSON.stringify(value), updated_by: actor.id });
    } catch (error) {
      console.error("Parle default setting could not be initialized", { key, error });
      throw new AdminActionError("SETTING_SAVE_FAILED", 503);
    }
    await writeAdminAudit(client, actor, {
      action: "setting.initialized",
      target_type: "app_setting",
      target_id: key,
      old_value: null,
      new_value: value,
    });
    existingKeys.add(key);
  }
  return readAppSettings(client);
}

export async function getAdminSettings(client: unknown, actor: AdminActor): Promise<{ settings: AppSettings; updated_at: string | null }> {
  assertAdministrator(actor);
  const rows = await readSettingRows(client);
  const latestUpdate = rows
    .map((row) => typeof row.updated_at === "string" ? row.updated_at : "")
    .filter(Boolean)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
  return { settings: settingsFromRows(rows), updated_at: latestUpdate };
}

export async function saveAdminSettings(
  client: unknown,
  actor: AdminActor,
  input: unknown,
): Promise<{ settings: AppSettings; changed_keys: AppSettingKey[] }> {
  assertAdministrator(actor);
  const rows = await readSettingRows(client);
  const current = settingsFromRows(rows);
  const validated = validateAdminSettings(input, current);
  if ("code" in validated) throw new AdminActionError(validated.code, 400);
  const entity = entityFor(client, "app_setting", ["create", "update"]);
  const latestByKey = new Map<AppSettingKey, SettingRow>();
  for (const row of rows) {
    if (typeof row.key === "string" && (SETTING_KEYS as string[]).includes(row.key) && !latestByKey.has(row.key as AppSettingKey)) {
      latestByKey.set(row.key as AppSettingKey, row);
    }
  }
  const changedKeys: AppSettingKey[] = [];
  for (const key of SETTING_KEYS) {
    const nextValue = validated.values[key] as SettingScalar;
    const existing = latestByKey.get(key);
    const previousParsed = existing ? decodeSettingValue(key, existing.value) : undefined;
    const needsWrite = !existing || previousParsed === undefined || !Object.is(previousParsed, nextValue);
    if (!needsWrite) continue;
    const atomic = atomicSettingSave(client);
    if (atomic) {
      const audit = buildAuditRow(actor, {
        action: "setting.updated",
        target_type: "app_setting",
        target_id: key,
        old_value: existing ? previousParsed ?? existing.value : null,
        new_value: nextValue,
      });
      try {
        await atomic({ key, value: JSON.stringify(nextValue), updatedBy: actor.id, audit });
      } catch (error) {
        console.error("Parle administrator setting could not be saved", { key, error });
        throw new AdminActionError("SETTING_SAVE_FAILED", 503);
      }
      changedKeys.push(key);
      continue;
    }
    try {
      const data = { value: JSON.stringify(nextValue), updated_by: actor.id };
      if (existing?.id) await entity.update(existing.id, data);
      else await entity.create({ key, ...data });
    } catch (error) {
      console.error("Parle administrator setting could not be saved", { key, error });
      throw new AdminActionError("SETTING_SAVE_FAILED", 503);
    }
    await writeAdminAudit(client, actor, {
      action: "setting.updated",
      target_type: "app_setting",
      target_id: key,
      old_value: existing ? previousParsed ?? existing.value : null,
      new_value: nextValue,
    });
    changedKeys.push(key);
  }
  return { settings: validated.values, changed_keys: changedKeys };
}

const ADMIN_AUDIT_LIMIT = 500;
const ADMIN_AUDIT_REVIEW_LIMIT = 500;
const HISTORY_DEDUPE_WINDOW_MS = 15 * 60 * 1000;
const APPLICATION_STATUSES = new Set(["Draft", "Submitted", "In review", "Approved", "Needs changes", "Rejected", "Suspended"]);
const DECISION_STATUSES = new Set(["Approved", "Needs changes", "Rejected", "Suspended"]);
const AUDIT_ACTIONS = {
  settings: ["setting.updated", "setting.initialized"],
  tutor_decisions: ["tutor_application.status_changed"],
  certificate_verification: ["tutor_certificate.verification_changed"],
  premium_comp: ["user.premium_comp_granted", "user.premium_comp_removed"],
} as const;

type AuditQueryFilters = { actionType: string; from: number | null; to: number | null };
type HistoricalDecision = Record<string, unknown> & { target_id: string; decision_status: string; history_at_ms: number };

function parseDateFilter(value: unknown, endOfDay: boolean): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AdminActionError("AUDIT_FILTER_INVALID", 400);
  const time = Date.parse(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new AdminActionError("AUDIT_FILTER_INVALID", 400);
  return time;
}

function cleanAuditText(value: unknown, maxLength = 160): string {
  if (typeof value !== "string") return "";
// eslint-disable-next-line no-control-regex -- Intentional control-character validation or stripping for untrusted text.
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function decodeAuditValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return undefined; }
}

function auditValueObject(value: unknown): Record<string, unknown> | null {
  const parsed = decodeAuditValue(value);
  return isObject(parsed) ? parsed : null;
}

function auditStatus(value: unknown): string | null {
  const record = auditValueObject(value);
  const status = typeof record?.status === "string" ? record.status : "";
  return APPLICATION_STATUSES.has(status) ? status : null;
}

function auditActionCategory(action: string): "settings" | "tutor_decisions" | "certificate_verification" | "premium_comp" | "other" {
  if (action.startsWith("setting.")) return "settings";
  if (action === "tutor_application.status_changed") return "tutor_decisions";
  if (action === "tutor_certificate.verification_changed") return "certificate_verification";
  if (action === "user.premium_comp_granted" || action === "user.premium_comp_removed") return "premium_comp";
  return "other";
}

function auditActionMatchesFilter(action: string, actionType: string): boolean {
  if (!actionType || actionType === "all") return true;
  if (actionType === "other") return auditActionCategory(action) === "other";
  if (actionType in AUDIT_ACTIONS) {
    return (AUDIT_ACTIONS as Record<string, readonly string[]>)[actionType].includes(action);
  }
  return action === actionType;
}

function actionCodesForFilter(actionType: string): string[] | null {
  if (!actionType || actionType === "all" || actionType === "other") return null;
  if (actionType in AUDIT_ACTIONS) return [...(AUDIT_ACTIONS as Record<string, readonly string[]>)[actionType]];
  return [actionType];
}

function eventDateMatches(value: unknown, from: number | null, to: number | null): boolean {
  const date = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(date) && (from === null || date >= from) && (to === null || date <= to);
}

function queryMethod(query: any, method: string, ...args: unknown[]): any {
  const result = query[method](...args);
  return result && typeof result === "object" ? result : query;
}

async function readPersistedAuditRows(
  client: unknown,
  filters: AuditQueryFilters,
): Promise<{ rows: AuditRow[]; limitReached: boolean }> {
  const entity = entityFor(client, "admin_audit_log", ["filter"]);
  const actionCodes = actionCodesForFilter(filters.actionType);
  if (typeof entity.query === "function") {
    const originalQuery = entity.query();
    const actionMethod = actionCodes?.length === 1 ? "where" : actionCodes && actionCodes.length > 1 ? "in" : null;
    const supportsQuery = originalQuery
      && typeof originalQuery.sort === "function"
      && typeof originalQuery.limit === "function"
      && typeof originalQuery.exec === "function"
      && (!actionMethod || typeof originalQuery[actionMethod] === "function")
      && (filters.from === null || typeof originalQuery.gte === "function")
      && (filters.to === null || typeof originalQuery.lte === "function");
    if (supportsQuery) {
      let query = originalQuery;
      if (actionCodes?.length === 1) query = queryMethod(query, "where", "action", actionCodes[0]);
      else if (actionCodes && actionCodes.length > 1) query = queryMethod(query, "in", "action", actionCodes);
      if (filters.from !== null) query = queryMethod(query, "gte", "occurred_at_utc", new Date(filters.from).toISOString());
      if (filters.to !== null) query = queryMethod(query, "lte", "occurred_at_utc", new Date(filters.to).toISOString());
      query = queryMethod(query, "sort", "-occurred_at_utc");
      query = queryMethod(query, "limit", ADMIN_AUDIT_LIMIT);
      const response = await query.exec();
      const rows = recordsFromResponse<AuditRow>(response, "AUDIT_READ_FAILED");
      return { rows, limitReached: rows.length >= ADMIN_AUDIT_LIMIT };
    }
  }

  // The basic filter API supports equality but not category/date ranges. Fetch each exact action where possible, then filter locally.
  const exactFilters = actionCodes?.length ? actionCodes.map((action) => ({ action })) : [{}];
  const rows: AuditRow[] = [];
  let limitReached = false;
  for (const queryFilters of exactFilters) {
    const response = await entity.filter(queryFilters, "-occurred_at_utc", ADMIN_AUDIT_LIMIT);
    const matching = recordsFromResponse<AuditRow>(response, "AUDIT_READ_FAILED");
    if (matching.length >= ADMIN_AUDIT_LIMIT) limitReached = true;
    rows.push(...matching);
  }
  return { rows, limitReached };
}

async function readHistoricalReviewRows(
  client: unknown,
  actionType: string,
): Promise<{ rows: Array<Record<string, unknown>>; limitReached: boolean }> {
  const includeHistory = !actionType || actionType === "all" || actionType === "tutor_decisions" || actionType === "tutor_application.status_changed";
  if (!includeHistory) return { rows: [], limitReached: false };
  const entity = entityFor(client, "tutor_application_review", ["filter"]);
  const response = await entity.filter({}, "-updated_at", ADMIN_AUDIT_REVIEW_LIMIT);
  const rows = recordsFromResponse<Record<string, unknown>>(response, "AUDIT_READ_FAILED");
  return { rows, limitReached: rows.length >= ADMIN_AUDIT_REVIEW_LIMIT };
}

function decodeHistory(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isObject);
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isObject) : [];
  } catch { return []; }
}

function historicalDecisions(
  reviews: Array<Record<string, unknown>>,
  filters: AuditQueryFilters,
): HistoricalDecision[] {
  const decisions: HistoricalDecision[] = [];
  for (const review of reviews) {
    const reviewId = typeof review.id === "string" ? review.id : "";
    if (!reviewId) continue;
    const history = decodeHistory(review.decision_history_json);
    history.forEach((item, index) => {
      const status = typeof item.status === "string" ? item.status : "";
      if (!DECISION_STATUSES.has(status) || !auditActionMatchesFilter("tutor_application.status_changed", filters.actionType)) return;
      const at = typeof item.at === "string" ? item.at : "";
      const atMs = Date.parse(at);
      if (!Number.isFinite(atMs) || (filters.from !== null && atMs < filters.from) || (filters.to !== null && atMs > filters.to)) return;
      const previousItem = index > 0 ? history[index - 1] : null;
      const previousStatus = typeof previousItem?.status === "string" && APPLICATION_STATUSES.has(previousItem.status)
        ? previousItem.status
        : null;
      const actorLabel = cleanAuditText(item.actor, 160);
      decisions.push({
        id: `history:${reviewId}:${index}`,
        actor_label: actorLabel,
        action: "tutor_application.status_changed",
        target_type: "tutor_application_review",
        target_id: reviewId,
        old_value: JSON.stringify(previousStatus ? { status: previousStatus } : null),
        new_value: JSON.stringify({ status }),
        occurred_at_utc: at,
        source: "decision_history",
        decision_status: status,
        history_at_ms: atMs,
      });
    });
  }
  return decisions;
}

function dedupeHistoricalDecisions(
  decisions: HistoricalDecision[],
  auditRows: AuditRow[],
): HistoricalDecision[] {
  const persistedByReviewAndStatus = new Map<string, Array<{ key: string; at: number }>>();
  auditRows.forEach((row, index) => {
    if (row.action !== "tutor_application.status_changed") return;
    const targetId = typeof row.target_id === "string" ? row.target_id : "";
    const status = auditStatus(row.new_value);
    const at = typeof row.occurred_at_utc === "string" ? Date.parse(row.occurred_at_utc) : Number.NaN;
    if (!targetId || !status || !Number.isFinite(at)) return;
    const key = `${targetId}\u0000${status}`;
    const stored = persistedByReviewAndStatus.get(key) ?? [];
    stored.push({ key: typeof row.id === "string" && row.id ? row.id : `audit-index-${index}`, at });
    persistedByReviewAndStatus.set(key, stored);
  });

  const used = new Set<string>();
  return decisions.filter((decision) => {
    const key = `${decision.target_id}\u0000${decision.decision_status}`;
    const possibleMatches = persistedByReviewAndStatus.get(key) ?? [];
    const duplicate = possibleMatches
      .filter((item) => !used.has(item.key) && Math.abs(item.at - decision.history_at_ms) <= HISTORY_DEDUPE_WINDOW_MS)
      .sort((left, right) => Math.abs(left.at - decision.history_at_ms) - Math.abs(right.at - decision.history_at_ms))[0];
    if (!duplicate) return true;
    used.add(duplicate.key);
    return false;
  });
}

function certificateVerificationValues(oldValue: unknown, newValue: unknown): { old: string; next: string } {
  const oldRecord = auditValueObject(oldValue);
  const newRecord = auditValueObject(newValue);
  const oldIds = Array.isArray(oldRecord?.verified_document_ids) ? oldRecord.verified_document_ids.filter((value) => typeof value === "string") as string[] : [];
  const newIds = Array.isArray(newRecord?.verified_document_ids) ? newRecord.verified_document_ids.filter((value) => typeof value === "string") as string[] : [];
  const added = newIds.some((id) => !oldIds.includes(id));
  const removed = oldIds.some((id) => !newIds.includes(id));
  const oldVerified = added && !removed ? false : removed && !added ? true : oldIds.length > 0;
  const newVerified = added && !removed ? true : removed && !added ? false : newIds.length > 0;
  return {
    old: JSON.stringify({ verified: oldVerified }),
    next: JSON.stringify({ verified: newVerified }),
  };
}

function projectPersistedAuditRow(row: AuditRow, index: number): Record<string, unknown> {
  const action = cleanAuditText(row.action, 120);
  const oldRaw = row.old_value;
  const newRaw = row.new_value;
  let oldValue = "null";
  let newValue = "null";
  let targetId = "";

  if (action.startsWith("setting.")) {
    oldValue = typeof oldRaw === "string" ? oldRaw : JSON.stringify(oldRaw ?? null) ?? "null";
    newValue = typeof newRaw === "string" ? newRaw : JSON.stringify(newRaw ?? null) ?? "null";
    targetId = cleanAuditText(row.target_id, 120);
  } else if (action === "tutor_application.status_changed") {
    const oldStatus = auditStatus(oldRaw);
    const nextStatus = auditStatus(newRaw);
    oldValue = JSON.stringify(oldStatus ? { status: oldStatus } : null);
    newValue = JSON.stringify(nextStatus ? { status: nextStatus } : null);
  } else if (action === "tutor_certificate.verification_changed") {
    const values = certificateVerificationValues(oldRaw, newRaw);
    oldValue = values.old;
    newValue = values.next;
  } else if (action === "question_bank.ai_draft_created") {
    targetId = cleanAuditText(row.target_id, 160);
  } else if (action === "user.premium_comp_granted" || action === "user.premium_comp_removed") {
    const oldComp = auditValueObject(oldRaw);
    const newComp = auditValueObject(newRaw);
    const actionActive = action === "user.premium_comp_granted";
    oldValue = JSON.stringify({ active: typeof oldComp?.active === "boolean" ? oldComp.active : !actionActive });
    newValue = JSON.stringify({
      active: actionActive,
      reason: cleanAuditText(newComp?.reason, 500),
    });
    targetId = cleanAuditText(row.target_id, 160);
  }

  return {
    id: typeof row.id === "string" && row.id ? row.id : `audit:${index}`,
    actor_label: cleanAuditText(row.actor_label, 160),
    action,
    target_type: cleanAuditText(row.target_type, 100),
    target_id: targetId,
    old_value: oldValue,
    new_value: newValue,
    occurred_at_utc: typeof row.occurred_at_utc === "string" ? row.occurred_at_utc : "",
    source: "admin_audit_log",
  };
}

function sortAuditEntries(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return [...rows].sort((left, right) => {
    const leftAt = Date.parse(String(left.occurred_at_utc ?? ""));
    const rightAt = Date.parse(String(right.occurred_at_utc ?? ""));
    return rightAt - leftAt || String(right.id ?? "").localeCompare(String(left.id ?? ""));
  });
}

export async function listAdminAudit(
  client: unknown,
  actor: AdminActor,
  filters: { action_type?: unknown; from_date?: unknown; to_date?: unknown } = {},
): Promise<{ entries: Array<Record<string, unknown>>; count: number; limit: number; limit_reached: boolean; audit_source_limit: number; history_source_limit: number }> {
  assertAdministrator(actor);
  const actionType = typeof filters.action_type === "string" ? filters.action_type.trim() : "all";
  if (actionType.length > 120) throw new AdminActionError("AUDIT_FILTER_INVALID", 400);
  const from = parseDateFilter(filters.from_date, false);
  const to = parseDateFilter(filters.to_date, true);
  if (from !== null && to !== null && from > to) throw new AdminActionError("AUDIT_FILTER_INVALID", 400);

  const [auditResult, reviewResult] = await Promise.all([
    readPersistedAuditRows(client, { actionType, from, to }),
    readHistoricalReviewRows(client, actionType),
  ]);
  const persistedRows = auditResult.rows.filter((row) => {
    const action = typeof row.action === "string" ? row.action : "";
    return auditActionMatchesFilter(action, actionType)
      && eventDateMatches(row.occurred_at_utc, from, to);
  });
  const legacyRows = dedupeHistoricalDecisions(historicalDecisions(reviewResult.rows, { actionType, from, to }), persistedRows);
  const projectedPersisted = persistedRows.map(projectPersistedAuditRow);
  const projectedHistory = legacyRows.map((entry) => ({
    id: entry.id,
    actor_label: entry.actor_label,
    action: entry.action,
    target_type: entry.target_type,
    target_id: "",
    old_value: entry.old_value,
    new_value: entry.new_value,
    occurred_at_utc: entry.occurred_at_utc,
    source: entry.source,
  }));
  const matchingEntries = sortAuditEntries([...projectedPersisted, ...projectedHistory]);
  const limitReached = auditResult.limitReached
    || reviewResult.limitReached
    || matchingEntries.length > ADMIN_AUDIT_LIMIT;
  const entries = matchingEntries.slice(0, ADMIN_AUDIT_LIMIT);
  return {
    entries,
    count: entries.length,
    limit: ADMIN_AUDIT_LIMIT,
    limit_reached: limitReached,
    audit_source_limit: ADMIN_AUDIT_LIMIT,
    history_source_limit: ADMIN_AUDIT_REVIEW_LIMIT,
  };
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateContentPatch(kind: "question" | "prompt", patch: unknown): Record<string, unknown> {
  if (!isObject(patch)) throw new AdminActionError("CONTENT_PATCH_INVALID", 400);
  const allowed = kind === "question"
    ? new Set(["prompt", "passage", "transcript", "explanation", "options", "answer_option_id", "answer", "content_audit_version"])
    : new Set(["text", "content_audit_version"]);
  const keys = Object.keys(patch);
  if (!keys.length || keys.some((key) => !allowed.has(key))) throw new AdminActionError("CONTENT_PATCH_INVALID", 400);
  const clean: Record<string, unknown> = {};
  for (const key of keys) {
    const value = patch[key];
    if (key === "options") {
      if (!Array.isArray(value) || value.length < 2 || value.length > 4 || value.some((entry) => !isObject(entry) || typeof entry.id !== "string" || typeof entry.text !== "string" || entry.id.length > 80 || entry.text.length > 500)) {
        throw new AdminActionError("CONTENT_PATCH_INVALID", 400);
      }
      clean[key] = value.map((entry) => ({ id: (entry as Record<string, string>).id, text: (entry as Record<string, string>).text }));
      continue;
    }
    const maxLength = key === "content_audit_version" ? 120 : key === "answer_option_id" ? 80 : kind === "prompt" ? 5000 : 7000;
    if (typeof value !== "string" || value.length > maxLength) throw new AdminActionError("CONTENT_PATCH_INVALID", 400);
// eslint-disable-next-line no-control-regex -- Intentional control-character validation or stripping for untrusted text.
    clean[key] = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  }
  if (JSON.stringify(clean).length > 15000) throw new AdminActionError("CONTENT_PATCH_INVALID", 400);
  if (kind === "question" && Array.isArray(clean.options)) {
    const answerId = typeof clean.answer_option_id === "string" ? clean.answer_option_id : "";
    if (answerId && !(clean.options as Array<{ id: string }>).some((option) => option.id === answerId)) {
      throw new AdminActionError("CONTENT_PATCH_INVALID", 400);
    }
  }
  return clean;
}

export async function updateDemoBankContent(
  client: unknown,
  actor: AdminActor,
  kind: unknown,
  recordId: unknown,
  patch: unknown,
): Promise<{ status: "complete"; changed: boolean; changed_fields: string[] }> {
  assertAdministrator(actor);
  if ((kind !== "question" && kind !== "prompt") || typeof recordId !== "string" || !recordId.trim() || recordId.length > 120) {
    throw new AdminActionError("CONTENT_NOT_FOUND", 404);
  }
  const normalizedKind = kind as "question" | "prompt";
  const recordType = normalizedKind === "question" ? "question_item" : "prompt_item";
  const entity = entityFor(client, recordType, ["filter", "update"]);
  const prepared = validateContentPatch(normalizedKind, patch);
  const response = await entity.filter({ id: recordId }, "-created_at", 10);
  const rows = recordsFromResponse<SettingRow>(response, "CONTENT_READ_FAILED");
  const current = rows.find((row) => row.id === recordId && row.is_test_data === true);
  if (!current) throw new AdminActionError("CONTENT_NOT_FOUND", 404);
  const oldChanged: Record<string, unknown> = {};
  const newChanged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(prepared)) {
    if (deepEqual(current[key], value)) continue;
    oldChanged[key] = current[key] === undefined ? null : current[key];
    newChanged[key] = value;
  }
  const changedFields = Object.keys(newChanged);
  if (!changedFields.length) return { status: "complete", changed: false, changed_fields: [] };
  try {
    await entity.update(recordId, prepared);
  } catch (error) {
    console.error("Parle demo question-bank content could not be updated", { recordType, recordId, error });
    throw new AdminActionError("CONTENT_SAVE_FAILED", 503);
  }
  await writeAdminAudit(client, actor, {
    action: "question_bank.content_updated",
    target_type: recordType,
    target_id: recordId,
    old_value: oldChanged,
    new_value: newChanged,
  });
  return { status: "complete", changed: true, changed_fields: changedFields };
}
