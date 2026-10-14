import { AdminActionError, assertAdministrator, type AdminActor } from "./parle-admin-settings.helper.ts";
import { effectiveApplicationStatus, isValidIanaTimeZone } from "./parle-marketplace.helper.ts";
import { lookupPremiumStatus } from "./parle-premium-status.helper.ts";
import {
  isPremiumSubscriptionPlan,
  mapStripeSubscriptionStatus,
  verifySubscriptionCache,
  type PremiumSubscriptionPlan,
  type SignedSubscriptionCache,
} from "./parle-stripe-subscription.logic.helper.ts";

export const ADMIN_METRICS_PAGE_SIZE = 200;
export const ADMIN_METRICS_DAY_MS = 24 * 60 * 60 * 1000;

export interface AdminMetricsDateRange {
  start_date: string;
  end_date: string;
  start_ms: number;
  end_exclusive_ms: number;
}

export type AdminMetricsSourceName =
  | "ParleIdentity"
  | "ParleProfile"
  | "tutor_profile"
  | "tutor_application_review"
  | "availability_rule"
  | "booking"
  | "learner_profile"
  | "learner_task"
  | "ai_message"
  | "checkin"
  | "Subscriber";

export type AdminMetricsRow = Record<string, unknown> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
};

/** A null source means its rows could not be read or are not readable by administrators. */
export type AdminMetricsSources = Partial<Record<AdminMetricsSourceName, readonly AdminMetricsRow[] | null>>;

export interface AdminMetricsCounts {
  new_learner_accounts: number | null;
  new_tutor_applications: number | null;
  currently_approved_new_tutor_applications: number | null;
  distinct_learners_with_completed_practice: number | null;
  completed_practice_task_records: number | null;
  ai_tutor_assistant_messages: number | null;
  completed_weekly_checkins: number | null;
  lesson_requests: number | null;
  complimentary_premium_learners: number | null;
  paid_premium_learners: number | null;
  total_premium_learners: number | null;
}

export interface AdminMetricsComparisonRow {
  label: string | null;
  track?: "immigration" | "citizenship";
  active_learners: number | null;
  learner_weekly_study_hours: number | null;
  approved_tutors: number | null;
  tutor_recurring_weekly_hours: number | null;
  short_of_tutors: boolean;
}

export interface AdminMetricsSnapshot {
  status: "complete" | "partial";
  range: { start_date: string; end_date: string };
  metrics: AdminMetricsCounts;
  comparisons: {
    time_zones: { available: boolean; rows: AdminMetricsComparisonRow[] };
    tracks: { available: boolean; rows: AdminMetricsComparisonRow[] };
  };
  unavailable_metrics: string[];
}

const READABLE_SOURCES = [
  "ParleIdentity",
  "ParleProfile",
  "tutor_profile",
  "tutor_application_review",
  "availability_rule",
  "booking",
] as const satisfies readonly AdminMetricsSourceName[];

const SOURCE_FIELDS: Record<(typeof READABLE_SOURCES)[number], string[]> = {
  ParleIdentity: ["id", "created_by", "role", "premium_comp_active", "created_at", "updated_at"],
  ParleProfile: ["id", "created_by", "time_zone", "created_at", "updated_at"],
  tutor_profile: ["id", "user_id", "created_by", "application_intent", "submission_revision", "time_zone", "specialties", "created_at", "updated_at"],
  tutor_application_review: ["id", "profile_id", "status", "reviewed_revision", "created_at", "updated_at"],
  availability_rule: ["id", "profile_id", "user_id", "day_of_week", "start_local", "end_local", "time_zone", "created_at"],
  booking: ["id", "created_at"],
};

/*
 * The current entity rules allow administrator reads for the six sources above.
 * learner_profile, learner_task, ai_message, checkin, and Subscriber are owner-only.
 * They are deliberately left unread here. In particular, a policy-filtered empty
 * response from an owner-only table must never be mistaken for a verified zero.
 */
const OWNER_ONLY_SOURCES: readonly AdminMetricsSourceName[] = [
  "learner_profile",
  "learner_task",
  "ai_message",
  "checkin",
  "Subscriber",
];

const TRACK_SPECIALTY_MATCHES = [
  { track: "immigration", specialty: "canada_immigration_tef_tcf" },
  { track: "citizenship", specialty: "canadian_citizenship" },
] as const;

const LEARNER_WEEKDAYS = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function calendarDateIsValid(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function parseAdminMetricsDateRange(input: unknown): AdminMetricsDateRange {
  const body = isObject(input) ? input : {};
  const startDate = body.start_date;
  const endDate = body.end_date;
  if (!calendarDateIsValid(startDate) || !calendarDateIsValid(endDate) || startDate > endDate) {
    throw new AdminActionError("METRICS_DATE_RANGE_INVALID", 400);
  }
  const startMs = Date.parse(`${startDate}T00:00:00.000Z`);
  const endExclusiveMs = Date.parse(`${endDate}T00:00:00.000Z`) + ADMIN_METRICS_DAY_MS;
  if (!Number.isFinite(startMs) || !Number.isFinite(endExclusiveMs) || endExclusiveMs <= startMs) {
    throw new AdminActionError("METRICS_DATE_RANGE_INVALID", 400);
  }
  return {
    start_date: startDate,
    end_date: endDate,
    start_ms: startMs,
    end_exclusive_ms: endExclusiveMs,
  };
}

export function adminMetricsTimestampIsInRange(value: unknown, range: AdminMetricsDateRange): boolean {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= range.start_ms && timestamp < range.end_exclusive_ms;
}

function parsedRows(value: unknown): { rows: AdminMetricsRow[]; total: number | null } {
  let source: unknown;
  let total: number | null = null;
  if (Array.isArray(value)) source = value;
  else if (isObject(value) && Array.isArray(value.data)) {
    source = value.data;
    total = typeof value.total === "number" && Number.isSafeInteger(value.total) && value.total >= 0 ? value.total : null;
  } else {
    throw new Error("METRICS_ENTITY_RESPONSE_INVALID");
  }
  if (!(source as unknown[]).every(isObject)) throw new Error("METRICS_ENTITY_ROW_INVALID");
  return { rows: source as AdminMetricsRow[], total };
}

async function readAllAdminReadableRows(client: unknown, source: (typeof READABLE_SOURCES)[number]): Promise<AdminMetricsRow[]> {
  const entities = isObject(client) && isObject(client.entities) ? client.entities : null;
  const entity = entities && isObject(entities[source]) ? entities[source] : null;
  if (!entity || typeof entity.filter !== "function") throw new Error("METRICS_ENTITY_UNAVAILABLE");

  const all: AdminMetricsRow[] = [];
  const seenIds = new Set<string>();
  let offset = 0;
  while (true) {
    const response = await entity.filter({}, "id", ADMIN_METRICS_PAGE_SIZE, offset, SOURCE_FIELDS[source]);
    const page = parsedRows(response);
    if (page.rows.length > ADMIN_METRICS_PAGE_SIZE) throw new Error("METRICS_PAGE_INVALID");
    if (page.rows.length === 0) {
      if (page.total !== null && page.total > offset) throw new Error("METRICS_PAGE_INCOMPLETE");
      break;
    }

    for (const row of page.rows) {
      if (typeof row.id !== "string" || !row.id.trim() || seenIds.has(row.id)) throw new Error("METRICS_RECORD_ID_INVALID");
      seenIds.add(row.id);
    }
    all.push(...page.rows);
    offset += page.rows.length;
    if (page.total !== null) {
      if (offset >= page.total) break;
      if (offset > page.total) throw new Error("METRICS_PAGE_INVALID");
    } else if (page.rows.length < ADMIN_METRICS_PAGE_SIZE) {
      break;
    }
    if (offset > 100_000) throw new Error("METRICS_SOURCE_TOO_LARGE");
  }
  return all;
}

export async function readAdminMetricsSources(client: unknown): Promise<AdminMetricsSources> {
  const sources: AdminMetricsSources = {
    learner_profile: null,
    learner_task: null,
    ai_message: null,
    checkin: null,
    Subscriber: null,
  };
  await Promise.all(READABLE_SOURCES.map(async (source) => {
    try {
      sources[source] = await readAllAdminReadableRows(client, source);
    } catch (error) {
      console.error("Parle administrator metrics source could not be read", {
        source,
        error_type: error instanceof Error ? error.name : "UnknownError",
      });
      sources[source] = null;
    }
  }));
  return sources;
}

function sourceRows(sources: AdminMetricsSources, source: AdminMetricsSourceName): readonly AdminMetricsRow[] | null {
  return Array.isArray(sources[source]) ? sources[source] as readonly AdminMetricsRow[] : null;
}

function normalizedEmail(value: unknown): string {
  return typeof value === "string" && value.trim().length <= 320 ? value.trim().toLocaleLowerCase() : "";
}

function timestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function latestRowByEmail(rows: readonly AdminMetricsRow[]): Map<string, AdminMetricsRow> {
  const result = new Map<string, AdminMetricsRow>();
  for (const row of rows) {
    const email = normalizedEmail(row.created_by);
    if (!email) continue;
    const existing = result.get(email);
    const currentTime = timestamp(row.updated_at) ?? timestamp(row.created_at) ?? 0;
    const existingTime = existing ? timestamp(existing.updated_at) ?? timestamp(existing.created_at) ?? 0 : Number.NEGATIVE_INFINITY;
    if (!existing || currentTime >= existingTime) result.set(email, row);
  }
  return result;
}

function earliestLearnerAccountCreation(rows: readonly AdminMetricsRow[]): Map<string, AdminMetricsRow> {
  const result = new Map<string, AdminMetricsRow>();
  for (const row of rows) {
    if (row.role !== "learner") continue;
    const email = normalizedEmail(row.created_by);
    if (!email) continue;
    const existing = result.get(email);
    const currentTime = timestamp(row.created_at) ?? Number.POSITIVE_INFINITY;
    const existingTime = existing ? timestamp(existing.created_at) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
    if (!existing || currentTime < existingTime) result.set(email, row);
  }
  return result;
}

function countLearnerAccountsCreatedInRange(rows: readonly AdminMetricsRow[] | null, range: AdminMetricsDateRange): number | null {
  if (!rows) return null;
  const learnerRows = rows.filter((row) => row.role === "learner");
  if (learnerRows.some((row) => !normalizedEmail(row.created_by) || timestamp(row.created_at) === null)) return null;
  return [...earliestLearnerAccountCreation(learnerRows).values()]
    .filter((row) => adminMetricsTimestampIsInRange(row.created_at, range)).length;
}

function latestReviewsByProfile(rows: readonly AdminMetricsRow[]): Map<string, AdminMetricsRow> {
  const result = new Map<string, AdminMetricsRow>();
  for (const row of rows) {
    const profileId = typeof row.profile_id === "string" ? row.profile_id.trim() : "";
    if (!profileId) continue;
    const existing = result.get(profileId);
    const currentTime = timestamp(row.updated_at) ?? timestamp(row.created_at) ?? 0;
    const existingTime = existing ? timestamp(existing.updated_at) ?? timestamp(existing.created_at) ?? 0 : Number.NEGATIVE_INFINITY;
    if (!existing || currentTime >= existingTime) result.set(profileId, row);
  }
  return result;
}

function tutorApplicationsInRange(
  profiles: readonly AdminMetricsRow[] | null,
  reviews: readonly AdminMetricsRow[] | null,
  range: AdminMetricsDateRange,
): { total: number | null; approved: number | null } {
  if (!profiles) return { total: null, approved: null };
  const submitted = profiles.filter((row) => row.application_intent === "submitted");
  if (submitted.some((row) => typeof row.id !== "string" || timestamp(row.created_at) === null)) {
    return { total: null, approved: null };
  }
  const inRange = submitted.filter((row) => adminMetricsTimestampIsInRange(row.created_at, range));
  if (!reviews) return { total: inRange.length, approved: null };
  const latestReview = latestReviewsByProfile(reviews);
  const approved = inRange.filter((profile) => {
    const review = latestReview.get(String(profile.id)) ?? null;
    return effectiveApplicationStatus(profile, review) === "Approved";
  }).length;
  return { total: inRange.length, approved };
}

function countTimestampedRows(
  rows: readonly AdminMetricsRow[] | null,
  predicate: (row: AdminMetricsRow) => boolean,
  dateField: string,
  range: AdminMetricsDateRange,
): number | null {
  if (!rows) return null;
  const matching = rows.filter(predicate);
  if (matching.some((row) => timestamp(row[dateField]) === null)) return null;
  return matching.filter((row) => adminMetricsTimestampIsInRange(row[dateField], range)).length;
}

function completedPracticeCounts(
  rows: readonly AdminMetricsRow[] | null,
  range: AdminMetricsDateRange,
): { learners: number | null; records: number | null } {
  if (!rows) return { learners: null, records: null };
  const done = rows.filter((row) => row.status === "done");
  if (done.some((row) => timestamp(row.completed_at_utc) === null)) return { learners: null, records: null };
  const completedInRange = done.filter((row) => adminMetricsTimestampIsInRange(row.completed_at_utc, range));
  if (completedInRange.some((row) => typeof row.id !== "string" || !row.id.trim())) return { learners: null, records: null };
  const learners = completedInRange.map((row) => typeof row.user_id === "string" ? row.user_id.trim() : "");
  return {
    learners: learners.some((userId) => !userId) ? null : new Set(learners).size,
    records: completedInRange.length,
  };
}

function parseAvailabilityObject(value: unknown): Record<string, unknown> | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try { candidate = JSON.parse(candidate); } catch { return null; }
  }
  return isObject(candidate) ? candidate : null;
}

function learnerWeeklyMinutes(value: unknown): number | null {
  const availability = parseAvailabilityObject(value);
  if (!availability) return null;
  let minutes = 0;
  for (const [day, amount] of Object.entries(availability)) {
    if (!LEARNER_WEEKDAYS.has(day)) continue;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return null;
    minutes += amount;
  }
  return Number.isFinite(minutes) ? minutes : null;
}

function hoursFromMinutes(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

function validClockMinutes(value: unknown): number | null {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

interface ApprovedTutor {
  profile_id: string;
  user_id: string;
  time_zone: string | null;
  specialties: string[] | null;
}

function approvedTutorRecords(
  profiles: readonly AdminMetricsRow[] | null,
  reviews: readonly AdminMetricsRow[] | null,
): { tutors: ApprovedTutor[] | null; specialties_complete: boolean; time_zones_complete: boolean } {
  if (!profiles || !reviews) return { tutors: null, specialties_complete: false, time_zones_complete: false };
  const reviewByProfile = latestReviewsByProfile(reviews);
  const current = profiles.filter((profile) => effectiveApplicationStatus(profile, reviewByProfile.get(String(profile.id)) ?? null) === "Approved");
  const tutors: ApprovedTutor[] = [];
  const seenUsers = new Set<string>();
  let valid = true;
  let specialtiesComplete = true;
  let timeZonesComplete = true;
  for (const profile of current) {
    const profileId = typeof profile.id === "string" ? profile.id.trim() : "";
    const userId = typeof profile.user_id === "string" ? profile.user_id.trim() : "";
    if (!profileId || !userId || seenUsers.has(userId)) {
      valid = false;
      continue;
    }
    seenUsers.add(userId);
    const zoneValue = typeof profile.time_zone === "string" ? profile.time_zone.trim() : "";
    const zone = isValidIanaTimeZone(zoneValue) ? zoneValue : null;
    if (!zone) timeZonesComplete = false;
    if (!Array.isArray(profile.specialties) || profile.specialties.some((value) => typeof value !== "string")) specialtiesComplete = false;
    const specialties = Array.isArray(profile.specialties)
      ? [...new Set(profile.specialties.filter((value): value is string => typeof value === "string"))]
      : null;
    tutors.push({ profile_id: profileId, user_id: userId, time_zone: zone, specialties });
  }
  return {
    tutors: valid ? tutors : null,
    specialties_complete: specialtiesComplete && valid,
    time_zones_complete: timeZonesComplete && valid,
  };
}

function tutorWeeklyMinutesByProfile(
  tutors: readonly ApprovedTutor[] | null,
  rules: readonly AdminMetricsRow[] | null,
): Map<string, number | null> | null {
  if (!tutors || !rules) return null;
  const result = new Map<string, number | null>(tutors.map((tutor) => [tutor.profile_id, 0]));
  const intervals = new Map<string, Map<number, Array<{ start: number; end: number }>>>();
  const ruleZone = new Map<string, string>();
  for (const rule of rules) {
    const profileId = typeof rule.profile_id === "string" ? rule.profile_id.trim() : "";
    if (!profileId || !result.has(profileId)) continue;
    if (result.get(profileId) === null) continue;

    const day = rule.day_of_week;
    const start = validClockMinutes(rule.start_local);
    const end = validClockMinutes(rule.end_local);
    const zoneValue = typeof rule.time_zone === "string" ? rule.time_zone.trim() : "";
    const zone = isValidIanaTimeZone(zoneValue) ? zoneValue : "";
    const tutor = tutors.find((item) => item.profile_id === profileId);
    if (!Number.isInteger(day) || Number(day) < 1 || Number(day) > 7 || start === null || end === null || end <= start || !zone
      || (tutor?.time_zone && tutor.time_zone !== zone)
      || (ruleZone.has(profileId) && ruleZone.get(profileId) !== zone)) {
      result.set(profileId, null);
      continue;
    }

    ruleZone.set(profileId, zone);
    const byDay = intervals.get(profileId) ?? new Map<number, Array<{ start: number; end: number }>>();
    const dayIntervals = byDay.get(Number(day)) ?? [];
    dayIntervals.push({ start, end });
    byDay.set(Number(day), dayIntervals);
    intervals.set(profileId, byDay);
  }

  for (const tutor of tutors) {
    if (result.get(tutor.profile_id) === null) continue;
    let weeklyMinutes = 0;
    for (const dayIntervals of (intervals.get(tutor.profile_id) ?? new Map()).values()) {
      const sorted = [...dayIntervals].sort((left, right) => left.start - right.start || left.end - right.end);
      let start: number | null = null;
      let end: number | null = null;
      for (const interval of sorted) {
        if (start === null || end === null) {
          start = interval.start;
          end = interval.end;
        } else if (interval.start <= end) {
          end = Math.max(end, interval.end);
        } else {
          weeklyMinutes += end - start;
          start = interval.start;
          end = interval.end;
        }
      }
      if (start !== null && end !== null) weeklyMinutes += end - start;
    }
    result.set(tutor.profile_id, weeklyMinutes);
  }
  return result;
}

function learnerGroupsByTimeZone(
  identities: readonly AdminMetricsRow[] | null,
  profiles: readonly AdminMetricsRow[] | null,
): { available: boolean; groups: Map<string, { label: string | null; emails: Set<string> }> } {
  const groups = new Map<string, { label: string | null; emails: Set<string> }>();
  if (!identities || !profiles) return { available: false, groups };
  const learners = latestRowByEmail(identities.filter((row) => row.role === "learner"));
  if (identities.some((row) => row.role === "learner" && !normalizedEmail(row.created_by))) return { available: false, groups };
  const profileByEmail = latestRowByEmail(profiles);
  for (const [email] of learners) {
    const savedProfile = profileByEmail.get(email);
    const zoneValue = typeof savedProfile?.time_zone === "string" ? savedProfile.time_zone.trim() : "";
    const zone = isValidIanaTimeZone(zoneValue) ? zoneValue : "";
    const groupKey = zone || "__unknown_time_zone__";
    const group = groups.get(groupKey) ?? { label: zone || null, emails: new Set<string>() };
    group.emails.add(email);
    groups.set(groupKey, group);
  }
  return { available: true, groups };
}

function currentLearnerProfileByEmail(rows: readonly AdminMetricsRow[] | null): Map<string, AdminMetricsRow> | null {
  if (!rows) return null;
  if (rows.some((row) => !normalizedEmail(row.created_by))) return null;
  return latestRowByEmail(rows);
}

function demandHoursForEmails(emails: ReadonlySet<string>, learnerProfiles: Map<string, AdminMetricsRow> | null): number | null {
  if (!learnerProfiles) return null;
  let minutes = 0;
  for (const email of emails) {
    const profile = learnerProfiles.get(email);
    if (!profile) continue;
    const weeklyMinutes = learnerWeeklyMinutes(profile.availability);
    if (weeklyMinutes === null) return null;
    minutes += weeklyMinutes;
  }
  return Number.isFinite(minutes) ? hoursFromMinutes(minutes) : null;
}

function supplyForTimeZone(
  zone: string | null,
  tutorState: ReturnType<typeof approvedTutorRecords>,
  weeklyMinutes: Map<string, number | null> | null,
): { approvedTutors: number | null; hours: number | null; short: boolean } {
  if (!zone || !tutorState.tutors || !tutorState.time_zones_complete) return { approvedTutors: null, hours: null, short: false };
  const tutors = tutorState.tutors.filter((tutor) => tutor.time_zone === zone);
  if (!weeklyMinutes) return { approvedTutors: tutors.length, hours: null, short: false };
  const tutorMinutes = tutors.map((tutor) => weeklyMinutes.get(tutor.profile_id));
  if (tutorMinutes.some((value) => value === null || value === undefined)) return { approvedTutors: tutors.length, hours: null, short: false };
  const totalMinutes = tutorMinutes.reduce<number>((sum, value) => sum + Number(value), 0);
  const hours = hoursFromMinutes(totalMinutes);
  return { approvedTutors: tutors.length, hours, short: true && hours === 0 };
}

function buildTimeZoneComparisons(sources: AdminMetricsSources): { available: boolean; rows: AdminMetricsComparisonRow[] } {
  const groups = learnerGroupsByTimeZone(sourceRows(sources, "ParleIdentity"), sourceRows(sources, "ParleProfile"));
  if (!groups.available) return { available: false, rows: [] };

  const learnerProfiles = currentLearnerProfileByEmail(sourceRows(sources, "learner_profile"));
  const tutorState = approvedTutorRecords(sourceRows(sources, "tutor_profile"), sourceRows(sources, "tutor_application_review"));
  const weeklyMinutes = tutorWeeklyMinutesByProfile(tutorState.tutors, sourceRows(sources, "availability_rule"));
  const rows: AdminMetricsComparisonRow[] = [...groups.groups.values()]
    .sort((left, right) => String(left.label ?? "").localeCompare(String(right.label ?? "")))
    .map((group) => {
      const weeklyHours = demandHoursForEmails(group.emails, learnerProfiles);
      const supply = supplyForTimeZone(group.label, tutorState, weeklyMinutes);
      return {
        label: group.label,
        active_learners: group.emails.size,
        learner_weekly_study_hours: weeklyHours,
        approved_tutors: supply.approvedTutors,
        tutor_recurring_weekly_hours: supply.hours,
        short_of_tutors: group.emails.size > 0 && supply.short,
      };
    });
  return { available: true, rows };
}

function buildTrackComparisons(sources: AdminMetricsSources): { available: boolean; rows: AdminMetricsComparisonRow[] } {
  const identities = sourceRows(sources, "ParleIdentity");
  const learnerProfiles = currentLearnerProfileByEmail(sourceRows(sources, "learner_profile"));
  if (!identities || !learnerProfiles) return { available: false, rows: [] };
  if (identities.some((row) => row.role === "learner" && !normalizedEmail(row.created_by))) return { available: false, rows: [] };

  const activeLearners = latestRowByEmail(identities.filter((row) => row.role === "learner"));
  const tutorState = approvedTutorRecords(sourceRows(sources, "tutor_profile"), sourceRows(sources, "tutor_application_review"));
  const tutorHours = tutorWeeklyMinutesByProfile(tutorState.tutors, sourceRows(sources, "availability_rule"));
  const rows: AdminMetricsComparisonRow[] = [];

  for (const mapping of TRACK_SPECIALTY_MATCHES) {
    const matchedEmails = new Set<string>();
    const trackProfiles: AdminMetricsRow[] = [];
    for (const email of activeLearners.keys()) {
      const profile = learnerProfiles.get(email);
      if (profile?.track === mapping.track) {
        matchedEmails.add(email);
        trackProfiles.push(profile);
      }
    }
    if (!matchedEmails.size) continue;

    let learnerMinutes = 0;
    let learnerHoursKnown = true;
    for (const profile of trackProfiles) {
      const minutes = learnerWeeklyMinutes(profile.availability);
      if (minutes === null) learnerHoursKnown = false;
      else learnerMinutes += minutes;
    }

    let approvedTutors: number | null = null;
    let tutorMinutes: number | null = null;
    if (tutorState.tutors && tutorState.specialties_complete) {
      const matches = tutorState.tutors.filter((tutor) => tutor.specialties?.includes(mapping.specialty));
      approvedTutors = matches.length;
      if (tutorHours) {
        const values = matches.map((tutor) => tutorHours.get(tutor.profile_id));
        if (!values.some((value) => value === null || value === undefined)) {
          tutorMinutes = values.reduce<number>((sum, value) => sum + Number(value), 0);
        }
      }
    }
    const tutorWeeklyHours = tutorMinutes === null ? null : hoursFromMinutes(tutorMinutes);
    rows.push({
      label: mapping.specialty,
      track: mapping.track,
      active_learners: matchedEmails.size,
      learner_weekly_study_hours: learnerHoursKnown ? hoursFromMinutes(learnerMinutes) : null,
      approved_tutors: approvedTutors,
      tutor_recurring_weekly_hours: tutorWeeklyHours,
      short_of_tutors: matchedEmails.size > 0 && tutorWeeklyHours === 0,
    });
  }
  return { available: true, rows };
}

export interface CurrentPremiumSplit {
  complimentary_learners: number | null;
  paid_learners: number | null;
  total_learners: number | null;
}

function signedCacheFromSubscriber(row: AdminMetricsRow): SignedSubscriptionCache | null {
  if (
    typeof row.user_id !== "string" || !row.user_id.trim() ||
    typeof row.stripe_customer_id !== "string" || !row.stripe_customer_id.trim() ||
    typeof row.stripe_subscription_id !== "string" || !row.stripe_subscription_id.trim() ||
    !isPremiumSubscriptionPlan(row.plan) ||
    typeof row.stripe_status !== "string" || !row.stripe_status.trim() ||
    typeof row.cancel_at_period_end !== "boolean" ||
    typeof row.current_period_end !== "string" ||
    typeof row.last_confirmed_at !== "string" ||
    typeof row.cache_signature !== "string"
  ) return null;
  return {
    userId: row.user_id,
    customerId: row.stripe_customer_id,
    subscriptionId: row.stripe_subscription_id,
    plan: row.plan as PremiumSubscriptionPlan,
    status: row.stripe_status,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    currentPeriodEnd: row.current_period_end,
    lastConfirmedAt: row.last_confirmed_at,
    signature: row.cache_signature,
  };
}

export async function buildCurrentPremiumSplit(input: {
  identities: readonly AdminMetricsRow[] | null;
  subscribers: readonly AdminMetricsRow[] | null;
  testStripeSecret?: string;
  now?: Date;
}): Promise<CurrentPremiumSplit> {
  if (!input.identities) return { complimentary_learners: null, paid_learners: null, total_learners: null };
  const learnerRows = input.identities.filter((row) => row.role === "learner");
  if (learnerRows.some((row) => !normalizedEmail(row.created_by) || typeof row.id !== "string" || !row.id.trim())) {
    return { complimentary_learners: null, paid_learners: null, total_learners: null };
  }
  const learnersByEmail = latestRowByEmail(learnerRows);
  const complimentaryEmails = new Set<string>();
  for (const [email, identity] of learnersByEmail) {
    const exactEmail = typeof identity.created_by === "string" ? identity.created_by.trim() : "";
    if (lookupPremiumStatus(identity, exactEmail).premium) complimentaryEmails.add(email);
  }
  const complimentary = complimentaryEmails.size;
  if (!input.subscribers) return { complimentary_learners: complimentary, paid_learners: null, total_learners: null };

  const rowsByEmail = new Map<string, AdminMetricsRow[]>();
  for (const row of input.subscribers) {
    const email = normalizedEmail(row.created_by);
    if (!email || !learnersByEmail.has(email) || complimentaryEmails.has(email)) continue;
    const matching = rowsByEmail.get(email) ?? [];
    matching.push(row);
    rowsByEmail.set(email, matching);
  }

  let paid = 0;
  for (const [email] of learnersByEmail) {
    if (complimentaryEmails.has(email)) continue;
    const subscriberRows = rowsByEmail.get(email) ?? [];
    if (!subscriberRows.length) continue;
    let foundActive = false;
    let allCandidatesVerified = true;
    for (const row of subscriberRows) {
      const emailOnRow = typeof row.email === "string" ? row.email.trim() : "";
      const cache = signedCacheFromSubscriber(row);
      if (!cache || normalizedEmail(emailOnRow) !== email || !input.testStripeSecret) {
        allCandidatesVerified = false;
        continue;
      }
      const validSignature = await verifySubscriptionCache(cache, input.testStripeSecret, cache.userId, input.now ?? new Date());
      if (!validSignature) {
        allCandidatesVerified = false;
        continue;
      }
      if (mapStripeSubscriptionStatus(cache.plan, cache.status, cache.cancelAtPeriodEnd, cache.currentPeriodEnd, input.now ?? new Date()).premium) {
        foundActive = true;
        break;
      }
    }
    if (foundActive) paid += 1;
    else if (!allCandidatesVerified) return { complimentary_learners: complimentary, paid_learners: null, total_learners: null };
  }
  return { complimentary_learners: complimentary, paid_learners: paid, total_learners: complimentary + paid };
}

function metricValuesUnavailable(metrics: AdminMetricsCounts, timeZones: AdminMetricsSnapshot["comparisons"]["time_zones"], tracks: AdminMetricsSnapshot["comparisons"]["tracks"]): string[] {
  const unavailable = Object.entries(metrics)
    .filter(([, value]) => value === null)
    .map(([name]) => name);
  if (!timeZones.available) unavailable.push("time_zone_comparisons");
  else {
    if (timeZones.rows.some((row) => row.learner_weekly_study_hours === null)) unavailable.push("time_zone_learner_weekly_study_hours");
    if (timeZones.rows.some((row) => row.approved_tutors === null)) unavailable.push("time_zone_approved_tutors");
    if (timeZones.rows.some((row) => row.tutor_recurring_weekly_hours === null)) unavailable.push("time_zone_tutor_recurring_weekly_hours");
  }
  if (!tracks.available) unavailable.push("track_comparisons");
  else {
    if (tracks.rows.some((row) => row.learner_weekly_study_hours === null)) unavailable.push("track_learner_weekly_study_hours");
    if (tracks.rows.some((row) => row.approved_tutors === null)) unavailable.push("track_approved_tutors");
    if (tracks.rows.some((row) => row.tutor_recurring_weekly_hours === null)) unavailable.push("track_tutor_recurring_weekly_hours");
  }
  return [...new Set(unavailable)];
}

export async function buildAdminMetricsSnapshot(
  sources: AdminMetricsSources,
  range: AdminMetricsDateRange,
  options: { testStripeSecret?: string; now?: Date } = {},
): Promise<AdminMetricsSnapshot> {
  const identities = sourceRows(sources, "ParleIdentity");
  const tutorProfiles = sourceRows(sources, "tutor_profile");
  const reviews = sourceRows(sources, "tutor_application_review");
  const practice = completedPracticeCounts(sourceRows(sources, "learner_task"), range);
  const applications = tutorApplicationsInRange(tutorProfiles, reviews, range);
  const premium = await buildCurrentPremiumSplit({
    identities,
    subscribers: sourceRows(sources, "Subscriber"),
    testStripeSecret: options.testStripeSecret,
    now: options.now,
  });

  const metrics: AdminMetricsCounts = {
    new_learner_accounts: countLearnerAccountsCreatedInRange(identities, range),
    new_tutor_applications: applications.total,
    currently_approved_new_tutor_applications: applications.approved,
    distinct_learners_with_completed_practice: practice.learners,
    completed_practice_task_records: practice.records,
    ai_tutor_assistant_messages: countTimestampedRows(
      sourceRows(sources, "ai_message"),
      (row) => row.sender === "tutor_ai",
      "created_at",
      range,
    ),
    completed_weekly_checkins: countTimestampedRows(
      sourceRows(sources, "checkin"),
      (row) => row.status === "submitted",
      "created_at",
      range,
    ),
    lesson_requests: countTimestampedRows(sourceRows(sources, "booking"), () => true, "created_at", range),
    complimentary_premium_learners: premium.complimentary_learners,
    paid_premium_learners: premium.paid_learners,
    total_premium_learners: premium.total_learners,
  };
  const comparisons = {
    time_zones: buildTimeZoneComparisons(sources),
    tracks: buildTrackComparisons(sources),
  };
  const unavailable = metricValuesUnavailable(metrics, comparisons.time_zones, comparisons.tracks);
  return {
    status: unavailable.length ? "partial" : "complete",
    range: { start_date: range.start_date, end_date: range.end_date },
    metrics,
    comparisons,
    unavailable_metrics: unavailable,
  };
}

export async function adminMetricsAction(
  client: unknown,
  actor: AdminActor,
  body: Record<string, unknown>,
  options: { testStripeSecret?: string; now?: Date } = {},
): Promise<AdminMetricsSnapshot> {
  assertAdministrator(actor);
  const range = parseAdminMetricsDateRange(body);
  const sources = await readAdminMetricsSources(client);
  return await buildAdminMetricsSnapshot(sources, range, options);
}
