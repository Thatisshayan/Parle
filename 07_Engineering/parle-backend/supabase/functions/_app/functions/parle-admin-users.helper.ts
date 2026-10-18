// GENERATED from parle-app/functions/parle-admin-users.helper.ts by scripts/sync-app-code.ts. Do not edit.
import {
  AdminActionError,
  assertAdministrator,
  writeAdminAudit,
  type AdminActor,
} from "./parle-admin-settings.helper.ts";
import {
  effectiveApplicationStatus,
  MAX_HOURLY_RATE_CENTS,
  MIN_HOURLY_RATE_CENTS,
  TUTOR_SPECIALTIES,
  validateAvailabilityRule,
  type ApplicationStatus,
} from "./parle-marketplace.helper.ts";

export const ADMIN_USER_SOURCE_LIMIT = 500;
export const PREMIUM_COMP_REASON_LIMIT = 500;

const PREMIUM_COMP_ACTIONS = {
  grant: "user.premium_comp_granted",
  remove: "user.premium_comp_removed",
} as const;

const USER_FIELDS = ["id", "full_name", "email", "role", "created_at"];
const IDENTITY_FIELDS = ["id", "created_by", "role", "created_at", "updated_at", "premium_comp_active"];
const PROFILE_FIELDS = ["id", "created_by", "native_language", "time_zone", "created_at", "updated_at"];
const COMP_AUDIT_FIELDS = ["id", "action", "target_type", "target_id", "new_value", "occurred_at_utc"];
const COMP_STATUS_FIELDS = ["id", "user_id", "plan", "status", "created_at"];
const TUTOR_PROFILE_FIELDS = ["id", "user_id", "created_by", "application_intent", "submission_revision", "hourly_rate_cents", "specialties", "created_at", "updated_at"];
const TUTOR_REVIEW_FIELDS = ["id", "profile_id", "tutor_email", "status", "reviewed_revision", "created_at", "updated_at"];
const AVAILABILITY_FIELDS = ["id", "profile_id", "user_id", "created_by", "day_of_week", "start_local", "end_local", "time_zone", "created_at", "updated_at"];
const PUBLIC_EDIT_FIELDS = ["id", "profile_id", "user_id", "created_by", "created_at", "updated_at"];
const BOOKING_FIELDS = ["id", "tutor_profile_id", "tutor_id", "learner_id", "created_at", "updated_at"];

const ADMIN_UNAVAILABLE = "unavailable" as const;
const ADMIN_NOT_RECORDED = "not_recorded" as const;
type AdminUnavailable = typeof ADMIN_UNAVAILABLE;
type AdminNotRecorded = typeof ADMIN_NOT_RECORDED;
type AdminSkill = "listening" | "reading" | "writing" | "speaking";

type AdminLearnerDetails = {
  goal: AdminUnavailable;
  track: AdminUnavailable;
  target_level: AdminUnavailable;
  target_date: AdminUnavailable;
  starting_level: AdminUnavailable;
  current_estimates: Record<AdminSkill, AdminUnavailable>;
  weekly_study_time: AdminUnavailable;
  today_ai_messages_used: AdminUnavailable;
  today_ai_messages_limit: AdminUnavailable;
};

type AdminTutorDetails = {
  application_status: ApplicationStatus | AdminUnavailable;
  hourly_rate_usd: number | AdminNotRecorded | AdminUnavailable;
  specialties: string[] | AdminNotRecorded | AdminUnavailable;
  weekly_availability_hours: number | AdminNotRecorded | AdminUnavailable;
};

type Row = Record<string, unknown> & {
  id?: string;
  created_by?: string;
  created_at?: string;
  occurred_at_utc?: string;
  updated_at?: string;
  action?: string;
  target_id?: string;
  target_type?: string;
  new_value?: unknown;
  user_id?: string;
  plan?: string;
  status?: string;
};

type Page = { rows: Row[]; total: number };
type ParleRole = "learner" | "tutor";
type CompEvent = {
  id: string;
  target_id: string;
  active: boolean;
  reason: string;
  occurred_at_utc: string;
  timestamp: number;
};

type CompState = { active: boolean; reason: string; updated_at: string };

export type AdminParleAccount = {
  id: string;
  full_name: string;
  email: string;
  account_role: "administrator" | "user";
  created_at: string;
  parle_role: ParleRole;
  native_language: string;
  time_zone: string;
  comp_active: boolean;
  comp_reason: string;
  comp_updated_at: string;
  plan_status: "premium_complimentary" | AdminUnavailable;
  latest_parle_record_at: string | AdminUnavailable;
  learner_details: AdminLearnerDetails;
  tutor_details: AdminTutorDetails;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(code: string, status = 400): never {
  throw new AdminActionError(code, status);
}

function entityFor(client: unknown, name: string, requiredMethods: string[]): Record<string, any> {
  let entity: unknown = null;
  if (isObject(client) && typeof client.entity === "function") {
    try {
      entity = (client.entity as (entityName: string) => unknown)(name);
    } catch {
      entity = null;
    }
  }
  if (!isObject(entity) && isObject(client) && isObject(client.entities)) {
    entity = client.entities[name];
  }
  if (!isObject(entity) || requiredMethods.some((method) => typeof entity[method] !== "function")) {
    const code = name === "User" ? "USER_DIRECTORY_UNAVAILABLE" : "ADMIN_USER_DATA_UNAVAILABLE";
    throw new AdminActionError(code, 503);
  }
  return entity;
}

function pageFromResponse(value: unknown, errorCode: string): Page {
  if (Array.isArray(value)) return { rows: value.filter(isObject) as Row[], total: value.length };
  if (isObject(value) && Array.isArray(value.data)) {
    const total = typeof value.total === "number" && Number.isFinite(value.total) && value.total >= 0
      ? value.total
      : value.data.length;
    return { rows: value.data.filter(isObject) as Row[], total };
  }
  throw new AdminActionError(errorCode, 503);
}

function projectFields(row: Row, fields: readonly string[]): Row {
  const projected: Row = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(row, field)) projected[field] = row[field];
  }
  return projected;
}

function sortRows(rows: Row[], sort: string): Row[] {
  const descending = sort.startsWith("-");
  const field = descending ? sort.slice(1) : sort;
  const direction = descending ? -1 : 1;
  return [...rows].sort((left, right) => {
    const leftTime = timestamp(left[field]);
    const rightTime = timestamp(right[field]);
    if (leftTime === null && rightTime !== null) return 1;
    if (leftTime !== null && rightTime === null) return -1;
    if (leftTime !== null && rightTime !== null && leftTime !== rightTime) return direction * (leftTime - rightTime);

    const comparison = String(left[field] ?? "").localeCompare(String(right[field] ?? ""));
    if (comparison !== 0) return direction * comparison;
    return direction * String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });
}

function projectedPage(page: Page, fields: readonly string[], sort: string, limit: number): Page {
  return {
    rows: sortRows(page.rows.map((row) => projectFields(row, fields)), sort).slice(0, limit),
    total: Math.max(page.total, page.rows.length),
  };
}

function userAuthFacade(client: unknown): Record<string, any> {
  const auth = isObject(client) && isObject(client.auth) ? client.auth : null;
  if (!auth || typeof auth.list !== "function") {
    throw new AdminActionError("USER_DIRECTORY_UNAVAILABLE", 503);
  }
  return auth;
}

async function listUserPage(auth: Record<string, any>): Promise<Page> {
  try {
    const response: unknown = await auth.list();
    return projectedPage(
      pageFromResponse(response, "ADMIN_USERS_READ_FAILED"),
      USER_FIELDS,
      "created_at",
      ADMIN_USER_SOURCE_LIMIT,
    );
  } catch (error) {
    if (error instanceof AdminActionError) throw error;
    console.error("Parle administrator account list could not be read", error);
    throw new AdminActionError("ADMIN_USERS_READ_FAILED", 503);
  }
}

async function filteredPage(
  client: unknown,
  entityName: string,
  filters: Record<string, unknown>,
  sort: string,
  limit: number,
  fields: string[],
  errorCode: string,
): Promise<Page> {
  const entity = entityFor(client, entityName, ["filter"]);
  try {
    const response: unknown = await entity.filter(filters, sort, limit);
    return projectedPage(pageFromResponse(response, errorCode), fields, sort, limit);
  } catch (error) {
    if (error instanceof AdminActionError) throw error;
    console.error(`Parle administrator ${entityName} records could not be read`, error);
    throw new AdminActionError(errorCode, 503);
  }
}

async function optionalFilteredPage(
  client: unknown,
  entityName: string,
  filters: Record<string, unknown>,
  sort: string,
  limit: number,
  fields: string[],
): Promise<Page | null> {
  try {
    return await filteredPage(client, entityName, filters, sort, limit, fields, "ADMIN_USERS_READ_FAILED");
  } catch (error) {
    console.error(`Parle administrator supplemental ${entityName} data could not be read`, error);
    return null;
  }
}

function reachedSourceLimit(page: Page, limit: number): boolean {
  return page.rows.length >= limit || page.total > page.rows.length;
}

function sourceIsComplete(page: Page | null): page is Page {
  return page !== null && !reachedSourceLimit(page, ADMIN_USER_SOURCE_LIMIT);
}

function cleanText(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function timestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeTimestamp(value: unknown): string {
  const parsed = timestamp(value);
  return parsed === null ? "" : new Date(parsed).toISOString();
}

function canonicalRowsByEmail(rows: Row[], order: "earliest" | "latest"): Map<string, Row> {
  const direction = order === "earliest" ? 1 : -1;
  const sorted = [...rows].sort((left, right) => {
    const leftTime = timestamp(left.created_at);
    const rightTime = timestamp(right.created_at);
    if (leftTime === null && rightTime !== null) return 1;
    if (leftTime !== null && rightTime === null) return -1;
    if (leftTime !== null && rightTime !== null && leftTime !== rightTime) return direction * (leftTime - rightTime);
    return direction * String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });
  const canonical = new Map<string, Row>();
  for (const row of sorted) {
    const email = typeof row.created_by === "string" ? row.created_by.trim() : "";
    if (email && !canonical.has(email)) canonical.set(email, row);
  }
  return canonical;
}

function storedValue(value: unknown): Record<string, unknown> | null {
  if (isObject(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function compEvent(row: Row): CompEvent | null {
  const action = row.action;
  if (action !== PREMIUM_COMP_ACTIONS.grant && action !== PREMIUM_COMP_ACTIONS.remove) return null;
  if (typeof row.target_id !== "string" || !row.target_id.trim()) return null;
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  if (typeof row.target_type === "string" && row.target_type.toLowerCase() !== "user") return null;
  const occurred = timestamp(row.occurred_at_utc);
  if (occurred === null) return null;
  const value = storedValue(row.new_value);
  return {
    id: row.id,
    target_id: row.target_id,
    active: action === PREMIUM_COMP_ACTIONS.grant,
    reason: cleanText(value?.reason, PREMIUM_COMP_REASON_LIMIT),
    occurred_at_utc: new Date(occurred).toISOString(),
    timestamp: occurred,
  };
}

function newestFirst(left: CompEvent, right: CompEvent): number {
  return right.timestamp - left.timestamp || right.id.localeCompare(left.id);
}

function compStatesFromRows(rows: Row[]): Map<string, CompState> {
  const latest = new Map<string, CompState>();
  const events = rows.map(compEvent).filter((event): event is CompEvent => event !== null).sort(newestFirst);
  for (const event of events) {
    if (latest.has(event.target_id)) continue;
    latest.set(event.target_id, {
      active: event.active,
      reason: event.reason,
      updated_at: event.occurred_at_utc,
    });
  }
  return latest;
}

function tutorProfileSelection(rows: Row[], userId: string, email: string): {
  profile: Row | null;
  profiles: Row[];
  trustworthy: boolean;
} {
  const linkedRows = rows.filter((row) => row.user_id === userId || row.created_by === email);
  const trustworthy = !linkedRows.some((row) =>
    row.user_id !== userId || (row.created_by !== undefined && row.created_by !== email)
  );
  const profiles = linkedRows.filter((row) =>
    row.user_id === userId && (row.created_by === undefined || row.created_by === email)
  );
  const ordered = [...profiles].sort((left, right) => {
    const leftTime = timestamp(left.created_at);
    const rightTime = timestamp(right.created_at);
    if (leftTime === null && rightTime !== null) return 1;
    if (leftTime !== null && rightTime === null) return -1;
    if (leftTime !== null && rightTime !== null && leftTime !== rightTime) return leftTime - rightTime;
    return String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });
  return { profile: ordered[0] ?? null, profiles, trustworthy };
}

function tutorRateValue(profile: Row | null, sourceAvailable: boolean): number | AdminNotRecorded | AdminUnavailable {
  if (!sourceAvailable) return ADMIN_UNAVAILABLE;
  if (!profile) return ADMIN_NOT_RECORDED;
  const cents = profile.hourly_rate_cents;
  if (cents === undefined || cents === null) return ADMIN_NOT_RECORDED;
  if (typeof cents !== "number" || !Number.isInteger(cents) || cents < 0 || cents > MAX_HOURLY_RATE_CENTS) {
    return ADMIN_UNAVAILABLE;
  }
  if (cents === 0) return ADMIN_NOT_RECORDED;
  if (cents < MIN_HOURLY_RATE_CENTS) return ADMIN_UNAVAILABLE;
  return cents / 100;
}

function tutorSpecialtiesValue(
  profile: Row | null,
  sourceAvailable: boolean,
): string[] | AdminNotRecorded | AdminUnavailable {
  if (!sourceAvailable) return ADMIN_UNAVAILABLE;
  if (!profile) return ADMIN_NOT_RECORDED;
  const specialties = profile.specialties;
  if (specialties === undefined) return ADMIN_NOT_RECORDED;
  if (!Array.isArray(specialties) || specialties.some((value) =>
    typeof value !== "string" || !TUTOR_SPECIALTIES.includes(value as typeof TUTOR_SPECIALTIES[number])
  )) return ADMIN_UNAVAILABLE;
  const unique = [...new Set(specialties as string[])];
  return unique.length ? unique : ADMIN_NOT_RECORDED;
}

function tutorApplicationStatusValue(
  profile: Row | null,
  profileSourceAvailable: boolean,
  reviewPage: Page | null,
  email: string,
): ApplicationStatus | AdminUnavailable {
  if (!profileSourceAvailable || !sourceIsComplete(reviewPage)) return ADMIN_UNAVAILABLE;
  if (profile && (typeof profile.id !== "string" || !profile.id.trim())) return ADMIN_UNAVAILABLE;
  const review = profile
    ? sortRows((reviewPage?.rows ?? []).filter((row) => row.profile_id === profile.id && row.tutor_email === email), "-updated_at")[0] ?? null
    : null;
  return effectiveApplicationStatus(profile, review);
}

function localMinutes(value: unknown): number | null {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

function weeklyAvailabilityHoursValue(
  page: Page | null,
  profile: Row | null,
  profileSourceAvailable: boolean,
  userId: string,
  email: string,
): number | AdminNotRecorded | AdminUnavailable {
  if (!profileSourceAvailable || !sourceIsComplete(page)) return ADMIN_UNAVAILABLE;
  if (!profile) {
    const orphanedRules = page.rows.some((row) => row.user_id === userId || row.created_by === email);
    return orphanedRules ? ADMIN_UNAVAILABLE : ADMIN_NOT_RECORDED;
  }
  const profileId = typeof profile.id === "string" ? profile.id.trim() : "";
  if (!profileId) return ADMIN_UNAVAILABLE;
  const rowsForProfile = page.rows.filter((row) => row.profile_id === profileId);
  if (rowsForProfile.some((row) =>
    row.user_id !== userId || (row.created_by !== undefined && row.created_by !== email)
  )) return ADMIN_UNAVAILABLE;
  const rules = rowsForProfile.filter((row) =>
    row.user_id === userId && (row.created_by === undefined || row.created_by === email)
  );
  if (!rules.length) return ADMIN_NOT_RECORDED;
  if (rules.length > 7 || rules.some((row) => !validateAvailabilityRule(row))) return ADMIN_UNAVAILABLE;
  const days = rules.map((row) => row.day_of_week);
  if (new Set(days).size !== days.length) return ADMIN_UNAVAILABLE;
  let totalMinutes = 0;
  for (const rule of rules) {
    const start = localMinutes(rule.start_local);
    const end = localMinutes(rule.end_local);
    if (start === null || end === null || end <= start) return ADMIN_UNAVAILABLE;
    totalMinutes += end - start;
  }
  const hours = Math.round(totalMinutes / 60 * 100) / 100;
  return Number.isFinite(hours) && hours > 0 ? hours : ADMIN_UNAVAILABLE;
}

function latestParleRecordDate(input: {
  accountId: string;
  email: string;
  profileIds: Set<string>;
  identityRows: Row[];
  profileRows: Row[];
  compAuditRows: Row[];
  tutorProfileRows: Row[];
  reviewPage: Page | null;
  availabilityPage: Page | null;
  publicEditPage: Page | null;
  bookingPage: Page | null;
  dateSources: Array<Page | null>;
  tutorProfileTrustworthy: boolean;
}): string | AdminUnavailable {
  if (!input.tutorProfileTrustworthy || input.dateSources.some((page) => !sourceIsComplete(page))) {
    return ADMIN_UNAVAILABLE;
  }
  let latest: number | null = null;
  const consider = (rows: Row[], matches: (row: Row) => boolean) => {
    for (const row of rows) {
      if (!matches(row)) continue;
      for (const field of ["created_at", "updated_at"]) {
        const value = timestamp(row[field]);
        if (value !== null && (latest === null || value > latest)) latest = value;
      }
    }
  };
  const { accountId, email, profileIds } = input;
  consider(input.identityRows, (row) => row.created_by === email);
  consider(input.profileRows, (row) => row.created_by === email);
  consider(input.tutorProfileRows, (row) =>
    row.user_id === accountId && (row.created_by === undefined || row.created_by === email)
  );
  consider(input.reviewPage?.rows ?? [], (row) =>
    row.tutor_email === email && typeof row.profile_id === "string" && profileIds.has(row.profile_id)
  );
  consider(input.availabilityPage?.rows ?? [], (row) =>
    (row.user_id === accountId || (typeof row.profile_id === "string" && profileIds.has(row.profile_id))) &&
    (row.created_by === undefined || row.created_by === email)
  );
  consider(input.publicEditPage?.rows ?? [], (row) =>
    row.user_id === accountId && (row.created_by === undefined || row.created_by === email)
  );
  consider(input.bookingPage?.rows ?? [], (row) =>
    row.learner_id === accountId || row.tutor_id === accountId ||
    (typeof row.tutor_profile_id === "string" && profileIds.has(row.tutor_profile_id))
  );
  for (const row of input.compAuditRows) {
    const event = compEvent(row);
    if (event?.target_id === accountId && (latest === null || event.timestamp > latest)) latest = event.timestamp;
  }
  return latest === null ? ADMIN_UNAVAILABLE : new Date(latest).toISOString();
}

function planStatusFor(identity: Row | undefined, email: string, parleRole: ParleRole): AdminParleAccount["plan_status"] {
  return parleRole === "learner" &&
      typeof identity?.id === "string" && Boolean(identity.id.trim()) &&
      identity.created_by === email && identity.role === "learner" && identity.premium_comp_active === true
    ? "premium_complimentary"
    : ADMIN_UNAVAILABLE;
}

function unavailableLearnerDetails(): AdminLearnerDetails {
  return {
    goal: ADMIN_UNAVAILABLE,
    track: ADMIN_UNAVAILABLE,
    target_level: ADMIN_UNAVAILABLE,
    target_date: ADMIN_UNAVAILABLE,
    starting_level: ADMIN_UNAVAILABLE,
    current_estimates: {
      listening: ADMIN_UNAVAILABLE,
      reading: ADMIN_UNAVAILABLE,
      writing: ADMIN_UNAVAILABLE,
      speaking: ADMIN_UNAVAILABLE,
    },
    weekly_study_time: ADMIN_UNAVAILABLE,
    today_ai_messages_used: ADMIN_UNAVAILABLE,
    today_ai_messages_limit: ADMIN_UNAVAILABLE,
  };
}

function unavailableTutorDetails(): AdminTutorDetails {
  return {
    application_status: ADMIN_UNAVAILABLE,
    hourly_rate_usd: ADMIN_UNAVAILABLE,
    specialties: ADMIN_UNAVAILABLE,
    weekly_availability_hours: ADMIN_UNAVAILABLE,
  };
}

async function maintainCurrentCompStatus(client: unknown, userId: string, active: boolean): Promise<void> {
  const entity = entityFor(client, "ParleCompStatus", ["filter", "create", "update", "delete"]);
  const readRows = async (): Promise<Row[]> => {
    const response: unknown = await entity.filter({ user_id: userId }, "-created_at", ADMIN_USER_SOURCE_LIMIT);
    return pageFromResponse(response, "COMP_STATUS_READ_FAILED").rows.filter((row) => row.user_id === userId);
  };

  try {
    let rows = await readRows();
    if (active) {
      const validRows = rows.filter((row) => row.plan === "premium_comp" && row.status === "active");
      if (validRows.length === 1 && rows.length === 1) return;

      let keepId = typeof validRows[0]?.id === "string" ? validRows[0].id : "";
      if (!keepId) {
        const repairable = rows.find((row) => typeof row.id === "string" && row.id.trim());
        if (repairable?.id) {
          await entity.update(repairable.id, { plan: "premium_comp", status: "active" });
          keepId = repairable.id;
        } else if (!rows.length) {
          await entity.create({ user_id: userId, plan: "premium_comp", status: "active" });
        } else {
          throw new AdminActionError("COMP_STATUS_MAINTENANCE_FAILED", 503);
        }
      }
      if (keepId) {
        for (const row of rows) {
          if (row.id !== keepId) {
            if (typeof row.id !== "string" || !row.id) throw new AdminActionError("COMP_STATUS_MAINTENANCE_FAILED", 503);
            await entity.delete(row.id);
          }
        }
      }
      rows = await readRows();
      const verified = rows.filter((row) => row.plan === "premium_comp" && row.status === "active");
      if (rows.length !== 1 || verified.length !== 1 || typeof verified[0].id !== "string") {
        throw new AdminActionError("COMP_STATUS_MAINTENANCE_FAILED", 503);
      }
      return;
    }

    if (!rows.length) return;
    for (const row of rows) {
      if (typeof row.id !== "string" || !row.id) throw new AdminActionError("COMP_STATUS_MAINTENANCE_FAILED", 503);
      await entity.delete(row.id);
    }
    rows = await readRows();
    if (rows.length) throw new AdminActionError("COMP_STATUS_MAINTENANCE_FAILED", 503);
  } catch (error) {
    if (error instanceof AdminActionError && error.code === "COMP_STATUS_MAINTENANCE_FAILED") throw error;
    console.error("Parle learner Premium status could not be maintained", error);
    throw new AdminActionError("COMP_STATUS_MAINTENANCE_FAILED", 503);
  }
}

async function maintainIdentityPremiumProjection(client: unknown, identity: Row | undefined, active: boolean): Promise<void> {
  const identityId = typeof identity?.id === "string" ? identity.id.trim() : "";
  if (!identityId) throw new AdminActionError("COMP_PROJECTION_MAINTENANCE_FAILED", 503);
  if (identity?.premium_comp_active === active) return;

  const entity = entityFor(client, "ParleIdentity", ["update"]);
  try {
    await entity.update(identityId, { premium_comp_active: active });
  } catch {
    console.error("Parle learner Premium identity projection could not be maintained");
    throw new AdminActionError("COMP_PROJECTION_MAINTENANCE_FAILED", 503);
  }
}

export async function listAdminParleUsers(
  client: unknown,
  actor: AdminActor,
): Promise<{
  users: AdminParleAccount[];
  count: number;
  limit: number;
  source_limit: number;
  limit_reached: boolean;
}> {
  assertAdministrator(actor);
  const auth = userAuthFacade(client);

  const [
    accountsPage,
    identityPage,
    profilePage,
    grantsPage,
    removalsPage,
    statusPage,
    tutorProfilePage,
    reviewPage,
    availabilityPage,
    publicEditPage,
    bookingPage,
  ] = await Promise.all([
    listUserPage(auth),
    filteredPage(client, "ParleIdentity", {}, "created_at", ADMIN_USER_SOURCE_LIMIT, IDENTITY_FIELDS, "ADMIN_USERS_READ_FAILED"),
    filteredPage(client, "ParleProfile", {}, "-created_at", ADMIN_USER_SOURCE_LIMIT, PROFILE_FIELDS, "ADMIN_USERS_READ_FAILED"),
    filteredPage(client, "admin_audit_log", { action: PREMIUM_COMP_ACTIONS.grant }, "-occurred_at_utc", ADMIN_USER_SOURCE_LIMIT, COMP_AUDIT_FIELDS, "ADMIN_USERS_READ_FAILED"),
    filteredPage(client, "admin_audit_log", { action: PREMIUM_COMP_ACTIONS.remove }, "-occurred_at_utc", ADMIN_USER_SOURCE_LIMIT, COMP_AUDIT_FIELDS, "ADMIN_USERS_READ_FAILED"),
    filteredPage(client, "ParleCompStatus", {}, "-created_at", ADMIN_USER_SOURCE_LIMIT, COMP_STATUS_FIELDS, "ADMIN_USERS_READ_FAILED"),
    optionalFilteredPage(client, "tutor_profile", {}, "created_at", ADMIN_USER_SOURCE_LIMIT, TUTOR_PROFILE_FIELDS),
    optionalFilteredPage(client, "tutor_application_review", {}, "-updated_at", ADMIN_USER_SOURCE_LIMIT, TUTOR_REVIEW_FIELDS),
    optionalFilteredPage(client, "availability_rule", {}, "-created_at", ADMIN_USER_SOURCE_LIMIT, AVAILABILITY_FIELDS),
    optionalFilteredPage(client, "tutor_profile_public_edits", {}, "-updated_at", ADMIN_USER_SOURCE_LIMIT, PUBLIC_EDIT_FIELDS),
    optionalFilteredPage(client, "booking", {}, "-updated_at", ADMIN_USER_SOURCE_LIMIT, BOOKING_FIELDS),
  ]);

  const identities = canonicalRowsByEmail(identityPage.rows, "earliest");
  const profiles = canonicalRowsByEmail(profilePage.rows, "latest");
  const compAuditRows = [...grantsPage.rows, ...removalsPage.rows];
  const compStates = compStatesFromRows(compAuditRows);
  const dateSources = [
    identityPage,
    profilePage,
    grantsPage,
    removalsPage,
    tutorProfilePage,
    reviewPage,
    availabilityPage,
    publicEditPage,
    bookingPage,
  ];
  const users: AdminParleAccount[] = [];

  for (const account of accountsPage.rows) {
    const id = typeof account.id === "string" ? account.id.trim() : "";
    const email = typeof account.email === "string" ? account.email.trim() : "";
    const platformRole = account.role === "administrator" || account.role === "user" ? account.role : null;
    if (!id || !email || !platformRole) continue;
    const identity = identities.get(email);
    const parleRole = identity?.role === "learner" || identity?.role === "tutor" ? identity.role : null;
    if (!parleRole) continue;

    const profile = profiles.get(email);
    const comp = compStates.get(id);
    const tutorSelection = tutorProfileSelection(tutorProfilePage?.rows ?? [], id, email);
    const tutorProfileSourceAvailable = sourceIsComplete(tutorProfilePage) && tutorSelection.trustworthy;
    const tutorProfileIds = new Set(tutorSelection.profiles
      .map((row) => typeof row.id === "string" ? row.id.trim() : "")
      .filter(Boolean));
    const tutorProfile = tutorSelection.profile;
    const tutorDetails: AdminTutorDetails = {
      application_status: tutorApplicationStatusValue(tutorProfile, tutorProfileSourceAvailable, reviewPage, email),
      hourly_rate_usd: tutorRateValue(tutorProfile, tutorProfileSourceAvailable),
      specialties: tutorSpecialtiesValue(tutorProfile, tutorProfileSourceAvailable),
      weekly_availability_hours: weeklyAvailabilityHoursValue(
        availabilityPage,
        tutorProfile,
        tutorProfileSourceAvailable,
        id,
        email,
      ),
    };
    const latestParleRecordAt = latestParleRecordDate({
      accountId: id,
      email,
      profileIds: tutorProfileIds,
      identityRows: identityPage.rows,
      profileRows: profilePage.rows,
      compAuditRows,
      tutorProfileRows: tutorProfilePage?.rows ?? [],
      reviewPage,
      availabilityPage,
      publicEditPage,
      bookingPage,
      dateSources,
      tutorProfileTrustworthy: tutorSelection.trustworthy,
    });

    users.push({
      id,
      full_name: cleanText(account.full_name, 120),
      email: cleanText(email, 320),
      account_role: platformRole,
      created_at: safeTimestamp(account.created_at),
      parle_role: parleRole,
      native_language: cleanText(profile?.native_language, 80),
      time_zone: cleanText(profile?.time_zone, 80),
      comp_active: comp?.active ?? false,
      comp_reason: comp?.reason ?? "",
      comp_updated_at: comp?.updated_at ?? "",
      plan_status: planStatusFor(identity, email, parleRole),
      latest_parle_record_at: latestParleRecordAt,
      learner_details: unavailableLearnerDetails(),
      tutor_details: parleRole === "tutor" ? tutorDetails : unavailableTutorDetails(),
    });
  }

  const currentStatusUserIds = new Set(statusPage.rows.map((row) => typeof row.user_id === "string" ? row.user_id : "").filter(Boolean));
  for (const user of users) {
    if (user.account_role !== "user" || user.parle_role !== "learner") continue;
    const identity = identities.get(user.email);
    const historicalState = compStates.get(user.id);
    const active = historicalState?.active === true;
    await maintainIdentityPremiumProjection(client, identity, active);
    if (identity) {
      identity.premium_comp_active = active;
      user.plan_status = planStatusFor(identity, user.email, user.parle_role);
    }
    if (active || currentStatusUserIds.has(user.id)) {
      await maintainCurrentCompStatus(client, user.id, active);
    }
  }

  const limitReached = [accountsPage, identityPage, profilePage, grantsPage, removalsPage, statusPage]
    .some((page) => reachedSourceLimit(page, ADMIN_USER_SOURCE_LIMIT));
  return {
    users,
    count: users.length,
    limit: ADMIN_USER_SOURCE_LIMIT,
    source_limit: ADMIN_USER_SOURCE_LIMIT,
    limit_reached: limitReached,
  };
}

function validateReason(value: unknown): string {
  if (typeof value !== "string") fail("COMP_REASON_REQUIRED");
  const normalized = value
    .replace(/\r\n?/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) fail("COMP_REASON_REQUIRED");
  if (normalized.length > PREMIUM_COMP_REASON_LIMIT) fail("COMP_REASON_TOO_LONG");
  return normalized;
}

function parseCompAction(value: unknown): "grant" | "remove" {
  if (value === "grant" || value === "remove") return value;
  return fail("COMP_ACTION_INVALID");
}

function parseTargetId(value: unknown): string {
  if (typeof value !== "string") return fail("USER_ID_INVALID");
  const id = value.trim();
  if (!id || id.length > 160 || /[\u0000-\u001f\u007f]/.test(id)) return fail("USER_ID_INVALID");
  return id;
}

async function readAllowlistedUserById(auth: Record<string, any>, id: string): Promise<Row> {
  const page = await listUserPage(auth);
  const account = page.rows.find((row) => row.id === id);
  if (!account) return fail("USER_NOT_FOUND", 404);
  return account;
}

async function latestCompForUser(client: unknown, userId: string): Promise<CompState> {
  const [grants, removals] = await Promise.all([
    filteredPage(client, "admin_audit_log", { action: PREMIUM_COMP_ACTIONS.grant, target_id: userId }, "-occurred_at_utc", ADMIN_USER_SOURCE_LIMIT, COMP_AUDIT_FIELDS, "AUDIT_READ_FAILED"),
    filteredPage(client, "admin_audit_log", { action: PREMIUM_COMP_ACTIONS.remove, target_id: userId }, "-occurred_at_utc", ADMIN_USER_SOURCE_LIMIT, COMP_AUDIT_FIELDS, "AUDIT_READ_FAILED"),
  ]);
  return compStatesFromRows([...grants.rows, ...removals.rows]).get(userId) ?? {
    active: false,
    reason: "",
    updated_at: "",
  };
}

export async function setLearnerPremiumComp(
  client: unknown,
  actor: AdminActor,
  input: { target_user_id?: unknown; comp_action?: unknown; reason?: unknown },
): Promise<{ status: "complete"; comp_active: boolean; comp_updated_at: string }> {
  assertAdministrator(actor);
  const userId = parseTargetId(input.target_user_id);
  const action = parseCompAction(input.comp_action);
  const reason = validateReason(input.reason);

  const auth = userAuthFacade(client);
  const account = await readAllowlistedUserById(auth, userId);
  if (account.role !== "user" || typeof account.email !== "string" || !account.email.trim()) {
    return fail("COMP_LEARNERS_ONLY", 403);
  }

  const identityPage = await filteredPage(
    client,
    "ParleIdentity",
    { created_by: account.email.trim() },
    "created_at",
    100,
    IDENTITY_FIELDS,
    "ADMIN_USERS_READ_FAILED",
  );
  const identity = canonicalRowsByEmail(identityPage.rows, "earliest").get(account.email.trim());
  if (!identity || (identity.role !== "learner" && identity.role !== "tutor")) return fail("PARLE_ACCOUNT_NOT_FOUND", 404);
  if (identity.role !== "learner") return fail("COMP_LEARNERS_ONLY", 403);

  const current = await latestCompForUser(client, userId);
  const nextActive = action === "grant";
  if (current.active === nextActive) return fail(nextActive ? "COMP_ALREADY_ACTIVE" : "COMP_NOT_ACTIVE", 409);

  const occurredAt = new Date().toISOString();
  await writeAdminAudit(client, actor, {
    action: PREMIUM_COMP_ACTIONS[action],
    target_type: "user",
    target_id: userId,
    old_value: { active: current.active },
    new_value: { active: nextActive, reason },
    occurred_at_utc: occurredAt,
  });
  await maintainCurrentCompStatus(client, userId, nextActive);
  await maintainIdentityPremiumProjection(client, identity, nextActive);

  return { status: "complete", comp_active: nextActive, comp_updated_at: occurredAt };
}
