// GENERATED from parle-app/functions/parle-marketplace-service.ts by scripts/sync-app-code.ts. Do not edit.
import { createSuperdevClient } from "../../_shared/superdev-compat.ts";
import {
  canTransitionApplicationStatus,
  canTutorEditApplication,
  approvedProfileEditEligibility,
  approvedPublicContentRefreshPatch,
  approvedPublicProfileEditRecord,
  approvedPublicProfileEditsFromRow,
  mergeApprovedPublicProfileEdits,
  isOwnApprovedTutorListing,
  validateApprovedPublicProfileEdits,
  documentBelongsToProfile,
  effectiveApplicationStatus,
  isReviewSnapshotFresh,
  isValidIanaTimeZone,
  parseHourlyRateCents,
  resolvePayoutCountryStatus,
  SEED_PAYOUT_COUNTRIES,
  validateAvailabilityException,
  validateAvailabilityRule,
  validateCertificateFile,
  validatePrivatePhotoData,
  validateTutorProfileForSubmission,
  verifiedDocumentIds,
  safePublicTutorProfileFields,
  safePublicAvailability,
  publicReviewSnapshot,
  safePublicBookingProjection,
  validateAndPersistLearnerBookingRequest,
  LEARNER_TUTOR_WINDOW_VALUES,
  TUTOR_LANGUAGES,
  TUTOR_LEVELS,
  TUTOR_SPECIALTIES,
  TUTOR_STYLES,
  type ApplicationStatus,
} from "./parle-marketplace.helper.ts";
import {
  AdminActionError,
  assertAdministrator,
  getAdminSettings,
  initializeAppSettings,
  listAdminAudit,
  saveAdminSettings,
  readAppSettings,
  updateDemoBankContent,
  writeAdminAudit,
} from "./parle-admin-settings.helper.ts";
import { listAdminParleUsers, setLearnerPremiumComp } from "./parle-admin-users.helper.ts";
import {
  AdminContentReadError,
  adminContentCoverageAction,
  adminGetContentItemAction,
  adminSaveContentItemAction,
} from "./parle-admin-content.helper.ts";
import {
  adminListReportedContentAction,
  adminResolvePracticeReportAction,
} from "./parle-admin-reports.helper.ts";
import { adminManageTutorReviewsAction } from "./parle-admin-reviews.helper.ts";
import { adminMetricsAction } from "./parle-admin-metrics.helper.ts";
import { dispatchWithAdminAccess } from "./parle-admin-access.helper.ts";
import {
  DEFAULT_BOOKING_SETTINGS,
  generateBookableSlots,
  hasBufferedOverlap,
  parseBookingSettings,
  safeBookingSettings,
  type BookingSchedule,
} from "./parle-booking-slots.helper.ts";

const appId = Deno.env.get("SUPERDEV_APP_ID");
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };
type Row = Record<string, unknown> & { id?: string; created_by?: string; updated_at?: string; created_at?: string };
type Caller = { id: string; email: string; role: string; full_name?: string | null };
type MarketplaceAction = Record<string, unknown>;

class ServiceFault extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function fault(code: string, status = 400): never {
  throw new ServiceFault(code, status);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordsFromResponse<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];
  if (isObject(response) && Array.isArray(response.data)) return response.data as T[];
  throw new Error("Unexpected marketplace entity response.");
}

function jsonResponse(body: Record<string, unknown>, status = 200, origin: string | null = null): Response {
  const headers = new Headers(jsonHeaders);
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function entityFor(client: any, name: string): any {
  const entity = (client.entities as Record<string, any>)[name];
  if (!entity?.filter || !entity?.create || !entity?.update || !entity?.delete) throw new Error(`Marketplace entity ${name} is unavailable.`);
  return entity;
}

async function rows(client: any, name: string, filters: Record<string, unknown> = {}, sort = "-created_at", limit = 200): Promise<Row[]> {
  return recordsFromResponse<Row>(await entityFor(client, name).filter(filters, sort, limit));
}

async function createRow(client: any, name: string, data: Record<string, unknown>): Promise<Row> {
  const created = await entityFor(client, name).create(data);
  if (isObject(created) && typeof created.id === "string") return created as Row;
  const found = await rows(client, name, data, "-created_at", 10);
  return found[0] ?? {};
}

async function updateRow(client: any, name: string, id: string, data: Record<string, unknown>): Promise<void> {
  await entityFor(client, name).update(id, data);
}

async function deleteRow(client: any, name: string, id: string): Promise<void> {
  await entityFor(client, name).delete(id);
}

function plainText(value: unknown, maxLength: number, multiline = false): string {
  if (typeof value !== "string") return "";
  const controlPattern = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g;
  const cleaned = value.replace(/\r\n?/g, "\n").replace(controlPattern, "");
  return (multiline ? cleaned : cleaned.replace(/\s+/g, " ")).trim().slice(0, maxLength);
}

function cleanStringArray(value: unknown, allowed: readonly string[], maximum: number, code: string): string[] {
  if (!Array.isArray(value) || value.length > maximum || value.some((entry) => typeof entry !== "string" || !allowed.includes(entry))) fault(code);
  return [...new Set(value as string[])];
}

function safeStatus(value: unknown): ApplicationStatus | null {
  const values: ApplicationStatus[] = ["Draft", "Submitted", "In review", "Approved", "Needs changes", "Rejected", "Suspended"];
  return typeof value === "string" && values.includes(value as ApplicationStatus) ? value as ApplicationStatus : null;
}

function decodeJsonArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isObject);
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isObject) : [];
  } catch { return []; }
}

function decisionHistory(review: Row | null): Record<string, unknown>[] {
  return decodeJsonArray(review?.decision_history_json).slice(-100);
}

function latestDecisionHistoryEntry(review: Row | null): { status: ApplicationStatus; comment: string; at: string } | null {
  const history = decisionHistory(review);
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    const status = safeStatus(entry.status);
    const comment = typeof entry.comment === "string" ? entry.comment : "";
    const at = typeof entry.at === "string" ? entry.at : "";
    if (!status || !comment.trim() || !Number.isFinite(Date.parse(at))) continue;
    return { status, comment, at };
  }
  return null;
}

function lastDecisionAt(review: Row | null): string {
  return latestDecisionHistoryEntry(review)?.at ?? "";
}

function snapshotFor(profile: Row): string {
  return JSON.stringify({
    display_name: profile.display_name ?? "",
    headline: profile.headline ?? "",
    country: profile.country ?? "",
    time_zone: profile.time_zone ?? "",
    spoken_languages: Array.isArray(profile.spoken_languages) ? profile.spoken_languages : [],
    years_teaching: profile.years_teaching ?? 0,
    specialties: Array.isArray(profile.specialties) ? profile.specialties : [],
    levels_taught: Array.isArray(profile.levels_taught) ? profile.levels_taught : [],
    teaching_styles: Array.isArray(profile.teaching_styles) ? profile.teaching_styles : [],
    hourly_rate_cents: profile.hourly_rate_cents ?? 0,
    intro_video_url: profile.intro_video_url ?? "",
    revision: profile.submission_revision ?? 0,
  });
}

function reviewView(review: Row | null, profile: Row): Record<string, unknown> {
  const verified = verifiedDocumentIds(review?.verified_document_ids, String(profile.id ?? ""), []);
  return {
    status: review?.status ?? null,
    latest_comment: typeof review?.latest_comment === "string" ? review.latest_comment : "",
    reviewed_revision: Number(review?.reviewed_revision ?? 0),
    verified_document_ids: verified,
    history: decisionHistory(review),
    notification_state: typeof review?.notification_state === "string" ? review.notification_state : "none",
    notification_attempts: Number(review?.notification_attempts ?? 0),
    notification_error_code: typeof review?.notification_error_code === "string" ? review.notification_error_code : "",
  };
}

async function ownTutorIdentity(client: any, user: Caller): Promise<void> {
  const identities = await rows(client, "ParleIdentity", { created_by: user.email }, "created_at", 10);
  const canonical = identities.find((record) => record.created_by === undefined || record.created_by === user.email);
  if (!canonical || canonical.role !== "tutor") fault("TUTOR_REQUIRED", 403);
}

async function defaultTimeZone(client: any, user: Caller, hint: unknown): Promise<string> {
  const profiles = await rows(client, "ParleProfile", { created_by: user.email }, "-created_at", 10);
  const saved = profiles.find((profile) => profile.created_by === undefined || profile.created_by === user.email)?.time_zone;
  if (isValidIanaTimeZone(saved)) return saved.trim();
  if (isValidIanaTimeZone(hint)) return String(hint).trim();
  return "UTC";
}

async function ownProfile(client: any, user: Caller, createIfMissing: boolean, timeZoneHint?: unknown): Promise<Row> {
  const records = await rows(client, "tutor_profile", { created_by: user.email }, "created_at", 30);
  const existing = records.find((record) => record.user_id === user.id && (record.created_by === undefined || record.created_by === user.email));
  if (existing) return existing;
  if (!createIfMissing) fault("PROFILE_NOT_FOUND", 404);
  const timeZone = await defaultTimeZone(client, user, timeZoneHint);
  return createRow(client, "tutor_profile", {
    user_id: user.id,
    display_name: "",
    headline: "",
    bio: "",
    photo_base64: "",
    photo_mime_type: "",
    country: "",
    time_zone: timeZone,
    spoken_languages: [],
    years_teaching: 0,
    specialties: [],
    levels_taught: [],
    teaching_styles: [],
    hourly_rate_cents: 0,
    intro_video_url: "",
    intro_video_unlisted_confirmed: false,
    meeting_link: "",
    agreement_accepted: false,
    application_intent: "draft",
    submission_revision: 0,
    draft_step: 0,
  });
}

async function profileById(client: any, id: string): Promise<Row> {
  const matches = await rows(client, "tutor_profile", { id }, "-created_at", 10);
  const profile = matches.find((record) => record.id === id);
  if (!profile) fault("PROFILE_NOT_FOUND", 404);
  return profile;
}

async function findReview(client: any, profile: Row, tutorEmail: string): Promise<Row | null> {
  if (!profile.id) return null;
  const matches = await rows(client, "tutor_application_review", { profile_id: profile.id, tutor_email: tutorEmail }, "-updated_at", 20);
  return matches.find((record) => record.profile_id === profile.id && record.tutor_email === tutorEmail) ?? null;
}

async function payoutCountries(client: any): Promise<Row[]> {
  return (await rows(client, "tutor_payout_country", {}, "country_code", 200)).filter((row) => typeof row.country_name === "string" && typeof row.country_code === "string");
}

function countryStatus(country: unknown, countries: Row[]): "supported" | "waitlist" {
  return resolvePayoutCountryStatus(country, countries);
}

function safeDocument(document: Row, includeContent: boolean, verifiedIds: string[] = []): Record<string, unknown> {
  const validation = validateCertificateFile({ mime_type: document.mime_type, size_bytes: document.size_bytes, content_base64: document.content_base64 });
  const result: Record<string, unknown> = {
    id: document.id ?? "",
    profile_id: document.profile_id ?? "",
    label: document.label ?? "",
    file_name: document.file_name ?? "",
    mime_type: document.mime_type ?? "",
    size_bytes: document.size_bytes ?? 0,
    created_at: document.created_at ?? "",
    valid: validation.valid,
    verified: validation.valid && typeof document.id === "string" && verifiedIds.includes(document.id),
  };
  if (includeContent && validation.valid) result.content_base64 = document.content_base64 ?? "";
  return result;
}

async function tutorDocuments(client: any, profile: Row, user: Caller): Promise<Row[]> {
  const docs = await rows(client, "tutor_document", { profile_id: profile.id, user_id: user.id }, "-created_at", 100);
  return docs.filter((doc) => doc.profile_id === profile.id && doc.user_id === user.id && (doc.created_by === undefined || doc.created_by === user.email));
}

async function ownerApprovedPublicEdits(client: any, profile: Row, user: Caller): Promise<{ row: Row; values: Record<string, unknown> } | null> {
  if (typeof profile.id !== "string" || profile.user_id !== user.id || profile.created_by !== user.email) return null;
  const matches = await rows(client, "tutor_profile_public_edits", {
    profile_id: profile.id,
    user_id: user.id,
    created_by: user.email,
  }, "-updated_at", 20);
  for (const row of matches) {
    const values = approvedPublicProfileEditsFromRow(row, profile.id, user.id, user.email);
    if (values) return { row, values };
  }
  return null;
}

async function applicationPayload(client: any, profile: Row, user: Caller, review: Row | null): Promise<Record<string, unknown>> {
  const [documents, countries, appSettings] = await Promise.all([
    tutorDocuments(client, profile, user),
    payoutCountries(client),
    readAppSettings(client),
  ]);
  const ids = verifiedDocumentIds(review?.verified_document_ids, String(profile.id ?? ""), documents);
  const editEligibility = approvedProfileEditEligibility(profile, review);
  let tutorViewProfile: Row = profile;
  let publicProfilePublished = false;
  let publicProfileRefreshPending = false;
  if (editEligibility === null && typeof profile.id === "string" && profile.user_id === user.id && profile.created_by === user.email) {
    const [storedEdits, listings] = await Promise.all([
      ownerApprovedPublicEdits(client, profile, user),
      rows(client, "tutor_public_profile", { profile_id: profile.id, is_published: true }, "-updated_at", 20),
    ]);
    if (storedEdits) tutorViewProfile = mergeApprovedPublicProfileEdits(profile, storedEdits.values) as Row;
    const published = listings.find((listing) => isOwnApprovedTutorListing({
      profile,
      review,
      listing,
      userId: user.id,
      email: user.email,
    }));
    publicProfilePublished = Boolean(published);
    if (storedEdits && published) {
      const pendingPatch = approvedPublicContentRefreshPatch(published, storedEdits.values);
      publicProfileRefreshPending = Boolean(pendingPatch && Object.keys(pendingPatch).length > 0);
    }
  }
  return {
    profile: tutorViewProfile,
    status: effectiveApplicationStatus(profile, review),
    approved_public_profile_editable: editEligibility === null,
    public_profile_published: publicProfilePublished,
    public_profile_refresh_pending: publicProfileRefreshPending,
    review: { ...reviewView(review, profile), verified_document_ids: ids },
    documents: documents.map((doc) => safeDocument(doc, false, ids)),
    countries: countries.map(({ id, country_name, country_code, status }) => ({ id, country_name, country_code, status })),
    payout_status: countryStatus(profile.country, countries),
    commission_percent: appSettings.commission_percent,
  };
}

function sanitizeProfilePatch(input: Record<string, unknown>, current: Row, draftStep: unknown, removePhoto: unknown): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const textFields: Array<[string, number, boolean?]> = [
    ["display_name", 80], ["headline", 140], ["bio", 2000, true], ["country", 100], ["time_zone", 80],
    ["intro_video_url", 500], ["meeting_link", 500],
  ];
  for (const [key, max, multiline] of textFields) {
    if (!(key in input)) continue;
    if (typeof input[key] !== "string") fault("PROFILE_INVALID");
    fields[key] = plainText(input[key], max, multiline);
  }
  if ("time_zone" in fields && fields.time_zone && !isValidIanaTimeZone(fields.time_zone)) fault("TIME_ZONE_INVALID");
  if ("spoken_languages" in input) fields.spoken_languages = cleanStringArray(input.spoken_languages, TUTOR_LANGUAGES, 16, "LANGUAGES_INVALID");
  if ("specialties" in input) fields.specialties = cleanStringArray(input.specialties, TUTOR_SPECIALTIES, TUTOR_SPECIALTIES.length, "SPECIALTIES_INVALID");
  if ("levels_taught" in input) fields.levels_taught = cleanStringArray(input.levels_taught, TUTOR_LEVELS, TUTOR_LEVELS.length, "LEVELS_INVALID");
  if ("teaching_styles" in input) fields.teaching_styles = cleanStringArray(input.teaching_styles, TUTOR_STYLES, TUTOR_STYLES.length, "STYLES_INVALID");
  if ("years_teaching" in input) {
    const years = Number(input.years_teaching);
    if (!Number.isInteger(years) || years < 0 || years > 60) fault("YEARS_INVALID");
    fields.years_teaching = years;
  }
  if ("hourly_rate_usd" in input) {
    const rawRate = input.hourly_rate_usd;
    if (rawRate === "" || rawRate === null || rawRate === undefined) fields.hourly_rate_cents = 0;
    else {
      const cents = parseHourlyRateCents(rawRate);
      if (cents === null) fault("RATE_INVALID");
      fields.hourly_rate_cents = cents;
    }
  }
  if ("intro_video_unlisted_confirmed" in input) {
    if (typeof input.intro_video_unlisted_confirmed !== "boolean") fault("PROFILE_INVALID");
    fields.intro_video_unlisted_confirmed = input.intro_video_unlisted_confirmed;
  }
  if ("agreement_accepted" in input) {
    if (typeof input.agreement_accepted !== "boolean") fault("PROFILE_INVALID");
    fields.agreement_accepted = input.agreement_accepted;
  }
  if (typeof fields.intro_video_url === "string" && fields.intro_video_url && !validVideoLink(fields.intro_video_url)) fault("VIDEO_INVALID");
  if (typeof fields.meeting_link === "string" && fields.meeting_link && !validMeetingLink(fields.meeting_link)) fault("MEETING_LINK_INVALID");

  if (removePhoto === true) {
    fields.photo_base64 = "";
    fields.photo_mime_type = "";
  } else if (typeof input.photo_base64 === "string" && input.photo_base64) {
    const validation = validatePrivatePhotoData(input.photo_mime_type, input.photo_base64);
    if (!validation.valid) fault(validation.reason === "PHOTO_SIZE" ? "PHOTO_SIZE" : "PHOTO_INVALID");
    fields.photo_base64 = input.photo_base64;
    fields.photo_mime_type = input.photo_mime_type;
  }
  if (draftStep !== undefined) {
    const step = Number(draftStep);
    if (!Number.isInteger(step) || step < 0 || step > 7) fault("PROFILE_INVALID");
    fields.draft_step = step;
  } else if (typeof current.draft_step === "number") fields.draft_step = current.draft_step;
  return fields;
}

function validVideoLink(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.protocol === "https:" && ["youtube.com", "m.youtube.com", "youtu.be", "vimeo.com", "player.vimeo.com"].includes(host) && url.pathname.length > 1;
  } catch { return false; }
}

function validMeetingLink(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "meet.google.com" || host === "zoom.us" || host.endsWith(".zoom.us")) && url.pathname.length > 1;
  } catch { return false; }
}

async function assertTutor(client: any, user: Caller): Promise<void> {
  if (user.role === "administrator") fault("TUTOR_REQUIRED", 403);
  await ownTutorIdentity(client, user);
}

async function tutorGetApplication(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await assertTutor(client, user);
  const profile = await ownProfile(client, user, true, body.browser_time_zone);
  const review = await findReview(client, profile, user.email);
  return { status: "complete", ...(await applicationPayload(client, profile, user, review)) };
}

async function tutorSaveApprovedPublicProfile(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await assertCanonicalParleRole(client, user, "tutor");
  const profile = await ownProfile(client, user, false);
  if (typeof profile.id !== "string" || profile.user_id !== user.id || profile.created_by !== user.email) fault("PROFILE_NOT_FOUND", 404);
  const { profile: freshProfile, review } = await approvedFreshSource(client, profile.id);
  if (freshProfile.user_id !== user.id || freshProfile.created_by !== user.email) fault("TUTOR_REQUIRED", 403);
  if (!isObject(body.profile)) fault("PROFILE_EDIT_INVALID");
  const validation = validateApprovedPublicProfileEdits(body.profile);
  if (!validation.ok) fault(validation.code);
  const record = approvedPublicProfileEditRecord(profile.id, user.id, validation.values);
  if (!record) fault("PROFILE_EDIT_INVALID");

  const storedRows = await rows(client, "tutor_profile_public_edits", {
    profile_id: profile.id,
    user_id: user.id,
    created_by: user.email,
  }, "-updated_at", 20);
  const ownedRows = storedRows.filter((row) => row.profile_id === profile.id && row.user_id === user.id && row.created_by === user.email);
  const validExisting = ownedRows.find((row) => row.id && approvedPublicProfileEditsFromRow(row, profile.id as string, user.id, user.email));
  if (ownedRows.length > 0 && !validExisting) fault("PROFILE_EDIT_CONFLICT", 409);
  if (validExisting?.id) await updateRow(client, "tutor_profile_public_edits", validExisting.id, record);
  else {
    const created = await createRow(client, "tutor_profile_public_edits", record);
    if (!created.id) fault("PROFILE_EDIT_SAVE_FAILED", 503);
  }

  const updatedProfile = await ownProfile(client, user, false);
  const payload = await applicationPayload(client, updatedProfile, user, review);
  return {
    status: "complete",
    ...payload,
    public_profile_refresh_status: payload.public_profile_published === true ? "pending_refresh" : "listing_not_published",
    public_display_delay_minutes: 60,
  };
}

async function tutorSaveProfile(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await assertTutor(client, user);
  const profile = await ownProfile(client, user, true, body.browser_time_zone);
  const review = await findReview(client, profile, user.email);
  const status = effectiveApplicationStatus(profile, review);
  if (!canTutorEditApplication(status)) fault("APPLICATION_LOCKED", 409);
  if (!isObject(body.profile)) fault("PROFILE_INVALID");
  const patch = sanitizeProfilePatch(body.profile, profile, body.draft_step, body.remove_photo);
  if (!profile.id) fault("PROFILE_NOT_FOUND", 404);
  await updateRow(client, "tutor_profile", profile.id, patch);
  const updated = await ownProfile(client, user, false);
  return { status: "complete", profile: updated, application_status: effectiveApplicationStatus(updated, review) };
}

async function tutorSubmit(client: any, user: Caller): Promise<Record<string, unknown>> {
  await assertTutor(client, user);
  const profile = await ownProfile(client, user, false);
  const review = await findReview(client, profile, user.email);
  const currentStatus = effectiveApplicationStatus(profile, review);
  if (!canTransitionApplicationStatus(currentStatus, "Submitted")) fault("APPLICATION_LOCKED", 409);
  const errors = validateTutorProfileForSubmission(profile);
  if (errors.length) fault("PROFILE_INCOMPLETE");
  const countries = await payoutCountries(client);
  const payoutStatus = countryStatus(profile.country, countries);
  const revision = Math.max(0, Math.floor(Number(profile.submission_revision) || 0)) + 1;
  await updateRow(client, "tutor_profile", String(profile.id), {
    application_intent: "submitted",
    submission_revision: revision,
    draft_step: 7,
  });
  const updated = await ownProfile(client, user, false);
  return { status: "complete", ...(await applicationPayload(client, updated, user, review)), payout_status: payoutStatus };
}

async function tutorUploadDocument(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await assertTutor(client, user);
  const profile = await ownProfile(client, user, false);
  const review = await findReview(client, profile, user.email);
  if (!canTutorEditApplication(effectiveApplicationStatus(profile, review))) fault("APPLICATION_LOCKED", 409);
  const label = plainText(body.label, 80);
  const rawName = typeof body.file_name === "string" ? body.file_name.split(/[\\/]/).pop() ?? "certificate" : "certificate";
  const fileName = plainText(rawName, 120).replace(/[^\p{L}\p{N}._() -]/gu, "_") || "certificate";
  const file = { mime_type: body.mime_type, size_bytes: body.size_bytes, content_base64: body.content_base64 };
  const validation = validateCertificateFile(file);
  if (!label) fault("DOCUMENT_LABEL_REQUIRED");
  if (!validation.valid) fault(validation.reason === "FILE_SIZE" ? "FILE_SIZE" : "FILE_INVALID");
  const created = await createRow(client, "tutor_document", {
    profile_id: profile.id,
    user_id: user.id,
    label,
    file_name: fileName,
    mime_type: body.mime_type,
    size_bytes: body.size_bytes,
    content_base64: body.content_base64,
  });
  if (!created.id) {
    const matches = await rows(client, "tutor_document", { profile_id: profile.id, user_id: user.id, label }, "-created_at", 10);
    const record = matches.find((doc) => doc.created_by === undefined || doc.created_by === user.email);
    if (!record) fault("SAVE_FAILED", 503);
    return { status: "complete", document: safeDocument(record, false) };
  }
  return { status: "complete", document: safeDocument(created, false) };
}

async function tutorDeleteDocument(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await assertTutor(client, user);
  const profile = await ownProfile(client, user, false);
  const review = await findReview(client, profile, user.email);
  if (!canTutorEditApplication(effectiveApplicationStatus(profile, review))) fault("APPLICATION_LOCKED", 409);
  const documentId = typeof body.document_id === "string" ? body.document_id : "";
  const documents = await tutorDocuments(client, profile, user);
  if (!documentBelongsToProfile(documentId, profile.id, documents)) fault("DOCUMENT_NOT_FOUND", 404);
  await deleteRow(client, "tutor_document", documentId);
  return { status: "complete" };
}

async function tutorGetAvailability(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await assertTutor(client, user);
  const profile = await ownProfile(client, user, true, body.browser_time_zone);
  const [rules, exceptions, settingRows] = await Promise.all([
    rows(client, "availability_rule", { profile_id: profile.id, user_id: user.id }, "day_of_week", 20),
    rows(client, "availability_exception", { profile_id: profile.id, user_id: user.id }, "date_local", 100),
    rows(client, "tutor_booking_settings", { tutor_profile_id: profile.id, tutor_user_id: user.id }, "-updated_at", 20),
  ]);
  const owned = (record: Row) => record.profile_id === profile.id && record.user_id === user.id && (record.created_by === undefined || record.created_by === user.email);
  const settingsRow = settingRows.find((record) => record.tutor_profile_id === profile.id && record.tutor_user_id === user.id && (record.created_by === undefined || record.created_by === user.email));
  return {
    status: "complete",
    time_zone: profile.time_zone,
    rules: rules.filter(owned).map(({ id, day_of_week, start_local, end_local, time_zone }) => ({ id, day_of_week, start_local, end_local, time_zone })),
    exceptions: exceptions.filter(owned).map(({ id, date_local, kind, start_local, end_local, time_zone }) => ({ id, date_local, kind, start_local, end_local, time_zone })),
    booking_settings: safeBookingSettings(settingsRow ?? DEFAULT_BOOKING_SETTINGS),
  };
}

async function tutorSaveAvailability(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await assertTutor(client, user);
  const profile = await ownProfile(client, user, true, body.browser_time_zone);
  const timeZone = typeof profile.time_zone === "string" ? profile.time_zone : "";
  if (!isValidIanaTimeZone(timeZone)) fault("TIME_ZONE_INVALID");
  if (!Array.isArray(body.rules) || !Array.isArray(body.exceptions) || body.rules.length > 7 || body.exceptions.length > 100) fault("AVAILABILITY_INVALID");
  const rules = body.rules.filter(isObject).map((item) => ({ day_of_week: item.day_of_week, start_local: item.start_local, end_local: item.end_local, time_zone: timeZone }));
  const exceptions = body.exceptions.filter(isObject).map((item) => ({
    date_local: item.date_local,
    kind: item.kind,
    start_local: item.kind === "off" ? "" : item.start_local,
    end_local: item.kind === "off" ? "" : item.end_local,
    time_zone: timeZone,
  }));
  if (rules.length !== body.rules.length || exceptions.length !== body.exceptions.length || rules.some((rule) => !validateAvailabilityRule(rule)) || exceptions.some((exception) => !validateAvailabilityException(exception))) fault("AVAILABILITY_INVALID");
  if (new Set(rules.map((rule) => rule.day_of_week)).size !== rules.length || new Set(exceptions.map((item) => item.date_local)).size !== exceptions.length) fault("AVAILABILITY_DUPLICATE");

  const [existingRules, existingExceptions] = await Promise.all([
    rows(client, "availability_rule", { profile_id: profile.id, user_id: user.id }, "day_of_week", 20),
    rows(client, "availability_exception", { profile_id: profile.id, user_id: user.id }, "date_local", 150),
  ]);
  const ownedRuleRows = existingRules.filter((row) => row.profile_id === profile.id && row.user_id === user.id && (row.created_by === undefined || row.created_by === user.email));
  const ownedExceptionRows = existingExceptions.filter((row) => row.profile_id === profile.id && row.user_id === user.id && (row.created_by === undefined || row.created_by === user.email));
  const seenDays = new Set<number>();
  for (const item of rules) {
    const day = Number(item.day_of_week);
    const existing = ownedRuleRows.find((row) => Number(row.day_of_week) === day);
    const data = { profile_id: profile.id, user_id: user.id, ...item };
    if (existing?.id) { await updateRow(client, "availability_rule", existing.id, data); seenDays.add(day); }
    else { await createRow(client, "availability_rule", data); seenDays.add(day); }
  }
  for (const existing of ownedRuleRows) if (existing.id && !seenDays.has(Number(existing.day_of_week))) await deleteRow(client, "availability_rule", existing.id);
  const seenDates = new Set<string>();
  for (const item of exceptions) {
    const date = String(item.date_local);
    const existing = ownedExceptionRows.find((row) => row.date_local === date);
    const data = { profile_id: profile.id, user_id: user.id, ...item };
    if (existing?.id) { await updateRow(client, "availability_exception", existing.id, data); seenDates.add(date); }
    else { await createRow(client, "availability_exception", data); seenDates.add(date); }
  }
  for (const existing of ownedExceptionRows) if (existing.id && typeof existing.date_local === "string" && !seenDates.has(existing.date_local)) await deleteRow(client, "availability_exception", existing.id);
  return await tutorGetAvailability(client, user, {});
}

async function tutorSaveBookingSettings(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await assertTutor(client, user);
  const profile = await ownProfile(client, user, false);
  if (typeof profile.id !== "string") fault("PROFILE_NOT_FOUND", 404);
  const settings = parseBookingSettings({
    lesson_lengths_minutes: body.lesson_lengths_minutes,
    buffer_minutes: body.buffer_minutes,
    minimum_notice_hours: body.minimum_notice_hours,
    booking_window_days: 30,
  });
  if (!settings) fault("BOOKING_SETTINGS_INVALID");

  const candidates = await rows(client, "tutor_booking_settings", { tutor_profile_id: profile.id, tutor_user_id: user.id }, "-updated_at", 20);
  const existing = candidates.find((row) => row.tutor_profile_id === profile.id && row.tutor_user_id === user.id && (row.created_by === undefined || row.created_by === user.email));
  const data = { tutor_profile_id: profile.id, tutor_user_id: user.id, ...settings };
  if (existing?.id) await updateRow(client, "tutor_booking_settings", existing.id, data);
  else {
    const saved = await createRow(client, "tutor_booking_settings", data);
    if (!saved.id) fault("BOOKING_SETTINGS_SAVE_FAILED", 503);
  }
  return { status: "complete", booking_settings: settings };
}

async function adminOnly(user: Caller): Promise<void> {
  if (user.role !== "administrator") fault("ADMIN_REQUIRED", 403);
}

async function seedCountries(client: any, user: Caller): Promise<Row[]> {
  await adminOnly(user);
  const existing = await payoutCountries(client);
  const codes = new Set(existing.map((row) => String(row.country_code).toUpperCase()));
  for (const country of SEED_PAYOUT_COUNTRIES) {
    if (codes.has(country.country_code)) continue;
    const saved = await createRow(client, "tutor_payout_country", country);
    if (!saved.id) fault("COUNTRY_SAVE_FAILED", 503);
    await writeAdminAudit(client, user, {
      action: "payout_country.initialized",
      target_type: "tutor_payout_country",
      target_id: String(saved.id),
      old_value: null,
      new_value: { country_name: country.country_name, country_code: country.country_code, status: country.status },
    });
    codes.add(country.country_code);
  }
  return await payoutCountries(client);
}

async function adminInitialize(client: any, user: Caller): Promise<Record<string, unknown>> {
  await adminOnly(user);
  await initializeAppSettings(client, user);
  const countries = await seedCountries(client, user);
  return { status: "complete", countries };
}

async function adminAuthorize(user: Caller): Promise<Record<string, unknown>> {
  await adminOnly(user);
  return { status: "complete", authorized: true };
}

async function adminGetSettings(client: any, user: Caller): Promise<Record<string, unknown>> {
  await adminOnly(user);
  await initializeAppSettings(client, user);
  return { status: "complete", ...await getAdminSettings(client, user) };
}

async function adminSaveSettings(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await adminOnly(user);
  return { status: "complete", ...await saveAdminSettings(client, user, body.settings) };
}

async function adminReadAudit(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await adminOnly(user);
  return { status: "complete", ...await listAdminAudit(client, user, {
    action_type: body.action_type,
    from_date: body.from_date,
    to_date: body.to_date,
  }) };
}

async function adminListUsers(client: any, user: Caller): Promise<Record<string, unknown>> {
  await adminOnly(user);
  return { status: "complete", ...await listAdminParleUsers(client, user) };
}

async function adminSetPremiumComp(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await adminOnly(user);
  return await setLearnerPremiumComp(client, user, {
    target_user_id: body.target_user_id,
    comp_action: body.comp_action,
    reason: body.reason,
  });
}

async function adminGetDemoBank(client: any, user: Caller): Promise<Record<string, unknown>> {
  await adminOnly(user);
  const [questions, prompts] = await Promise.all([
    rows(client, "question_item", { is_test_data: true }, "demo_code", 200),
    rows(client, "prompt_item", { is_test_data: true }, "demo_code", 100),
  ]);
  return {
    status: "complete",
    questions: questions.filter((record) => record.is_test_data === true),
    prompts: prompts.filter((record) => record.is_test_data === true),
  };
}

async function adminUpdateDemoBank(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await adminOnly(user);
  return await updateDemoBankContent(client, user, body.kind, body.record_id, body.patch);
}

async function adminListApplications(client: any, user: Caller): Promise<Record<string, unknown>> {
  await adminOnly(user);
  const [draftProfiles, submittedProfiles, reviews, countries] = await Promise.all([
    rows(client, "tutor_profile", { application_intent: "draft" }, "-updated_at", 250),
    rows(client, "tutor_profile", { application_intent: "submitted" }, "-updated_at", 250),
    rows(client, "tutor_application_review", {}, "-updated_at", 400),
    payoutCountries(client),
  ]);
  const profiles = [...draftProfiles, ...submittedProfiles];
  const latestReview = new Map<string, Row>();
  for (const review of reviews) {
    if (typeof review.profile_id === "string" && typeof review.tutor_email === "string" && !latestReview.has(review.profile_id)) latestReview.set(review.profile_id, review);
  }
  const applications = profiles
    .filter((profile) => (profile.application_intent === "draft" || profile.application_intent === "submitted") && typeof profile.id === "string" && typeof profile.created_by === "string")
    .map((profile) => {
      const review = latestReview.get(String(profile.id));
      const status = effectiveApplicationStatus(profile, review ?? null);
      return {
        id: profile.id,
        tutor_email: profile.created_by,
        display_name: profile.display_name ?? "",
        headline: profile.headline ?? "",
        country: profile.country ?? "",
        submission_revision: profile.submission_revision ?? 0,
        status,
        latest_comment: review?.latest_comment ?? "",
        notification_state: review?.notification_state ?? "none",
        last_decision_at: lastDecisionAt(review ?? null),
        payout_status: countryStatus(profile.country, countries),
        updated_at: profile.updated_at ?? profile.created_at ?? "",
      };
    });
  return { status: "complete", applications, countries };
}

function makeHistory(review: Row | null, status: ApplicationStatus, comment: string, revision: number, actor = "administrator"): string {
  const history = decisionHistory(review);
  history.push({ status, comment, revision, actor, at: new Date().toISOString() });
  return JSON.stringify(history.slice(-100));
}

async function adminOpenApplication(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await adminOnly(user);
  const profileId = typeof body.profile_id === "string" ? body.profile_id : "";
  if (!profileId) fault("PROFILE_NOT_FOUND", 404);
  const profile = await profileById(client, profileId);
  const isDraft = profile.application_intent === "draft";
  if ((!isDraft && profile.application_intent !== "submitted") || typeof profile.created_by !== "string") fault("APPLICATION_NOT_SUBMITTED", 409);
  let review = isDraft ? null : await findReview(client, profile, profile.created_by);
  let status = effectiveApplicationStatus(profile, review);
  const statusBeforeOpen = status;
  if (status === "Submitted") {
    const errors = validateTutorProfileForSubmission(profile);
    if (errors.length) fault("PROFILE_INCOMPLETE", 409);
    if (!canTransitionApplicationStatus(status, "In review")) fault("STATUS_TRANSITION_INVALID", 409);
    const revision = Math.max(0, Math.floor(Number(profile.submission_revision) || 0));
    const base = {
      profile_id: profile.id,
      tutor_email: profile.created_by,
      status: "In review",
      latest_comment: typeof review?.latest_comment === "string" ? review.latest_comment : "",
      reviewed_revision: revision,
      reviewed_profile_updated_at: typeof profile.updated_at === "string" ? profile.updated_at : "",
      reviewed_snapshot_json: snapshotFor(profile),
      verified_document_ids: Array.isArray(review?.verified_document_ids) ? review.verified_document_ids : [],
      decision_history_json: makeHistory(review, "In review", "", revision),
      notification_state: review?.notification_state ?? "none",
      notification_error_code: review?.notification_error_code ?? "",
      notification_attempts: review?.notification_attempts ?? 0,
      notification_updated_at: review?.notification_updated_at ?? "",
    };
    if (review?.id) await updateRow(client, "tutor_application_review", review.id, base);
    else review = await createRow(client, "tutor_application_review", base);
    if (!review?.id) {
      const matches = await rows(client, "tutor_application_review", { profile_id: profile.id, tutor_email: profile.created_by }, "-created_at", 10);
      review = matches.find((row) => row.profile_id === profile.id && row.tutor_email === profile.created_by) ?? null;
    } else if (review.id) review = { ...review, ...base };
    status = "In review";
    await writeAdminAudit(client, user, {
      action: "tutor_application.review_opened",
      target_type: "tutor_application_review",
      target_id: String(review?.id ?? profile.id),
      old_value: { status: statusBeforeOpen },
      new_value: { status: "In review" },
    });
  } else if (status === "In review" || status === "Approved") {
    if (!review?.id) fault("APPLICATION_NOT_IN_REVIEW", 409);
    const revision = Math.max(0, Math.floor(Number(profile.submission_revision) || 0));
    const reviewedProfile = {
      reviewed_revision: revision,
      reviewed_profile_updated_at: typeof profile.updated_at === "string" ? profile.updated_at : "",
      reviewed_snapshot_json: snapshotFor(profile),
    };
    const oldReviewedFields = {
      reviewed_revision: Number(review.reviewed_revision ?? 0),
      reviewed_profile_updated_at: typeof review.reviewed_profile_updated_at === "string" ? review.reviewed_profile_updated_at : "",
    };
    const newReviewedFields = {
      reviewed_revision: reviewedProfile.reviewed_revision,
      reviewed_profile_updated_at: reviewedProfile.reviewed_profile_updated_at,
    };
    await updateRow(client, "tutor_application_review", review.id, reviewedProfile);
    if (JSON.stringify(oldReviewedFields) !== JSON.stringify(newReviewedFields)) {
      await writeAdminAudit(client, user, {
        action: "tutor_application.review_opened",
        target_type: "tutor_application_review",
        target_id: review.id,
        old_value: oldReviewedFields,
        new_value: newReviewedFields,
      });
    }
    review = { ...review, ...reviewedProfile };
  }
  const documents = await rows(client, "tutor_document", { profile_id: profile.id, user_id: profile.user_id }, "-created_at", 100);
  const ownedDocuments = documents.filter((doc) => doc.profile_id === profile.id && doc.user_id === profile.user_id && doc.created_by === profile.created_by);
  const verified = verifiedDocumentIds(review?.verified_document_ids, profileId, ownedDocuments);
  const reviewData = { ...reviewView(review, profile), verified_document_ids: verified };
  const demoReviews = profile.created_by ? await rows(client, "tutor_review", { profile_id: profileId, tutor_email: profile.created_by }, "-created_at", 500) : [];
  return {
    status: "complete",
    application: {
      profile,
      status,
      tutor_email: profile.created_by,
      review: reviewData,
      documents: ownedDocuments.map((doc) => safeDocument(doc, true, verified)),
      demo_reviews: demoReviews.filter((item) => item.profile_id === profileId && item.is_test_review === true).map(safeDemoReview),
      payout_status: countryStatus(profile.country, await payoutCountries(client)),
    },
  };
}

async function adminVerifyDocument(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await adminOnly(user);
  const profileId = typeof body.profile_id === "string" ? body.profile_id : "";
  const documentId = typeof body.document_id === "string" ? body.document_id : "";
  const profile = await profileById(client, profileId);
  if (typeof profile.created_by !== "string" || profile.application_intent !== "submitted") fault("PROFILE_NOT_FOUND", 404);
  const documents = await rows(client, "tutor_document", { profile_id: profile.id, user_id: profile.user_id }, "-created_at", 100);
  const ownedDocuments = documents.filter((doc) => doc.profile_id === profile.id && doc.user_id === profile.user_id && doc.created_by === profile.created_by);
  const validDocuments = ownedDocuments.filter((doc) => validateCertificateFile({ mime_type: doc.mime_type, size_bytes: doc.size_bytes, content_base64: doc.content_base64 }).valid);
  if (!documentBelongsToProfile(documentId, profileId, validDocuments)) fault("DOCUMENT_NOT_FOUND", 404);
  let review = await findReview(client, profile, profile.created_by);
  if (!review?.id || effectiveApplicationStatus(profile, review) !== "In review") fault("APPLICATION_NOT_IN_REVIEW", 409);
  const ids = verifiedDocumentIds(review.verified_document_ids, profileId, ownedDocuments);
  const next = body.verified === true ? [...new Set([...ids, documentId])] : ids.filter((id) => id !== documentId);
  if (ids.length !== next.length || ids.some((id, index) => id !== next[index])) {
    await updateRow(client, "tutor_application_review", review.id, { verified_document_ids: next });
    await writeAdminAudit(client, user, {
      action: "tutor_certificate.verification_changed",
      target_type: "tutor_application_review",
      target_id: review.id,
      old_value: { verified_document_ids: ids },
      new_value: { verified_document_ids: next },
    });
  }
  return { status: "complete", verified_document_ids: next };
}

function emailCopy(value: unknown): { subject: string; bodyHtml: string } | null {
  if (!isObject(value)) return null;
  const copy = value;
  const subjectPrefix = plainText(copy.subject_prefix, 120);
  const heading = plainText(copy.heading, 180);
  const intro = plainText(copy.intro, 300);
  const statusLabel = plainText(copy.status_label, 80);
  const statusText = plainText(copy.status_text, 80);
  const commentLabel = plainText(copy.comment_label, 80);
  if (!subjectPrefix || !heading || !intro || !statusLabel || !statusText || !commentLabel) return null;
  const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
  const status = esc(statusText);
  const comment = esc(plainText(copy.comment, 1500, true)).replace(/\n/g, "<br>");
  return {
    subject: `${subjectPrefix} ${statusText}`,
    bodyHtml: `<h1>${esc(heading)}</h1><p>${esc(intro)}</p><p><strong>${esc(statusLabel)}</strong> ${status}</p><p><strong>${esc(commentLabel)}</strong><br>${comment}</p>`,
  };
}

async function sendDecisionEmail(client: any, headers: Record<string, string>, to: string, copyInput: unknown): Promise<boolean> {
  const template = isObject(copyInput) ? { ...copyInput, comment: copyInput.comment } : null;
  const copy = emailCopy(template);
  if (!copy) return false;
  try {
    const result = await client.integrations.core.sendEmail({ to, subject: copy.subject, body_html: copy.bodyHtml, from_name: "Parle" }, { headers });
    if (isObject(result) && (result.error || result.success === false)) throw new Error("The email integration did not accept the request.");
    return true;
  } catch (error) {
    console.warn("Parle tutor decision email was queued", error);
    return false;
  }
}

async function adminDecide(client: any, user: Caller, body: MarketplaceAction, headers: Record<string, string>): Promise<Record<string, unknown>> {
  await adminOnly(user);
  const profileId = typeof body.profile_id === "string" ? body.profile_id : "";
  const nextStatus = safeStatus(body.next_status);
  const comment = plainText(body.comment, 1500, true);
  if (!profileId || !nextStatus) fault("STATUS_TRANSITION_INVALID");
  if (!comment) fault("COMMENT_REQUIRED");
  const profile = await profileById(client, profileId);
  if (profile.application_intent !== "submitted" || typeof profile.created_by !== "string") fault("APPLICATION_NOT_SUBMITTED", 409);
  const review = await findReview(client, profile, profile.created_by);
  if (!review?.id) fault("APPLICATION_NOT_IN_REVIEW", 409);
  const currentStatus = effectiveApplicationStatus(profile, review);
  const allowedTarget = (currentStatus === "In review" && ["Approved", "Needs changes", "Rejected"].includes(nextStatus)) || (currentStatus === "Approved" && nextStatus === "Suspended");
  if (!allowedTarget || !canTransitionApplicationStatus(currentStatus, nextStatus)) fault("STATUS_TRANSITION_INVALID", 409);
  if (!isReviewSnapshotFresh(profile.updated_at, review.reviewed_profile_updated_at)) fault("APPLICATION_CHANGED", 409);
  const revision = Math.max(0, Math.floor(Number(profile.submission_revision) || 0));
  const attempts = Math.max(0, Math.floor(Number(review.notification_attempts) || 0)) + 1;
  let publicProfileState = nextStatus === "Approved" ? "refreshing" : "unpublished";
  if (nextStatus === "Approved") {
    await savePublicListing(client, profile, review, false);
  } else {
    // Hiding first keeps a failed suspension from leaving an approved listing visible.
    await setPublicListingPublished(client, profileId, false);
  }
  const saved = {
    status: nextStatus,
    latest_comment: comment,
    reviewed_revision: revision,
    reviewed_profile_updated_at: typeof profile.updated_at === "string" ? profile.updated_at : "",
    reviewed_snapshot_json: snapshotFor(profile),
    decision_history_json: makeHistory(review, nextStatus, comment, revision),
    notification_state: "queued",
    notification_error_code: "SEND_PENDING",
    notification_attempts: attempts,
    notification_updated_at: new Date().toISOString(),
  };
  await updateRow(client, "tutor_application_review", review.id, saved);
  if (nextStatus === "Approved") {
    try {
      await setPublicListingPublished(client, profileId, true);
      publicProfileState = "published";
    } catch {
      // Approval remains recorded but the listing stays unpublished until admin refresh succeeds.
      publicProfileState = "refresh_required";
      console.warn("Parle approved tutor profile publication is pending administrator refresh");
    }
  }

  const sent = await sendDecisionEmail(client, headers, profile.created_by, { ...(isObject(body.email_copy) ? body.email_copy : {}), comment });
  let notificationState = "queued";
  if (sent) {
    try {
      await updateRow(client, "tutor_application_review", review.id, { notification_state: "sent", notification_error_code: "", notification_updated_at: new Date().toISOString() });
      notificationState = "sent";
    } catch (error) {
      console.warn("Parle saved the tutor decision but could not confirm email state", error);
    }
  } else {
    try { await updateRow(client, "tutor_application_review", review.id, { notification_state: "queued", notification_error_code: "SEND_FAILED", notification_updated_at: new Date().toISOString() }); }
    catch (error) { console.warn("Parle could not refresh the queued tutor email state", error); }
  }
  await writeAdminAudit(client, user, {
    action: "tutor_application.status_changed",
    target_type: "tutor_application_review",
    target_id: review.id,
    old_value: {
      status: currentStatus,
      notification_state: review.notification_state ?? "none",
      notification_attempts: Number(review.notification_attempts ?? 0),
    },
    new_value: {
      status: nextStatus,
      notification_state: notificationState,
      notification_attempts: attempts,
      public_profile_state: publicProfileState,
    },
  });
  const persistedReview = await findReview(client, profile, profile.created_by);
  const persistedStatus = safeStatus(persistedReview?.status);
  const persistedComment = typeof persistedReview?.latest_comment === "string" ? persistedReview.latest_comment : null;
  const persistedNotificationState = persistedReview?.notification_state === "sent"
    ? "sent"
    : persistedReview?.notification_state === "queued" ? "queued" : null;
  const savedDecisionEntry = latestDecisionHistoryEntry(persistedReview);
  if (
    persistedReview?.profile_id !== profileId ||
    persistedReview.tutor_email !== profile.created_by ||
    persistedStatus !== nextStatus ||
    persistedComment !== comment ||
    !savedDecisionEntry ||
    savedDecisionEntry.status !== persistedStatus ||
    savedDecisionEntry.comment !== persistedComment ||
    !persistedNotificationState
  ) fault("REVIEW_SAVE_FAILED", 503);

  return {
    status: "complete",
    application_status: nextStatus,
    notification_state: notificationState,
    public_profile_state: publicProfileState,
    saved_decision: {
      profile_id: profileId,
      status: persistedStatus,
      last_decision_at: savedDecisionEntry.at,
      latest_comment: persistedComment,
      notification_state: persistedNotificationState,
    },
  };
}

async function adminRetryEmail(client: any, user: Caller, body: MarketplaceAction, headers: Record<string, string>): Promise<Record<string, unknown>> {
  await adminOnly(user);
  const profile = await profileById(client, typeof body.profile_id === "string" ? body.profile_id : "");
  if (typeof profile.created_by !== "string") fault("PROFILE_NOT_FOUND", 404);
  const review = await findReview(client, profile, profile.created_by);
  const status = safeStatus(review?.status);
  if (!review?.id || !status || review.notification_state !== "queued") fault("EMAIL_NOT_QUEUED", 409);
  const previousState = typeof review.notification_state === "string" ? review.notification_state : "none";
  const previousAttempts = Math.max(0, Math.floor(Number(review.notification_attempts) || 0));
  const attempts = previousAttempts + 1;
  await updateRow(client, "tutor_application_review", review.id, { notification_state: "queued", notification_error_code: "SEND_PENDING", notification_attempts: attempts, notification_updated_at: new Date().toISOString() });
  const sent = await sendDecisionEmail(client, headers, profile.created_by, { ...(isObject(body.email_copy) ? body.email_copy : {}), comment: review.latest_comment ?? "" });
  let notificationState = "queued";
  if (sent) {
    try {
      await updateRow(client, "tutor_application_review", review.id, { notification_state: "sent", notification_error_code: "", notification_updated_at: new Date().toISOString() });
      notificationState = "sent";
    } catch (error) { console.warn("Parle could not confirm retried tutor email state", error); }
  } else {
    try { await updateRow(client, "tutor_application_review", review.id, { notification_state: "queued", notification_error_code: "SEND_FAILED", notification_updated_at: new Date().toISOString() }); }
    catch (error) { console.warn("Parle could not refresh retried tutor email state", error); }
  }
  await writeAdminAudit(client, user, {
    action: "tutor_application.email_retry",
    target_type: "tutor_application_review",
    target_id: review.id,
    old_value: { notification_state: previousState, notification_attempts: previousAttempts },
    new_value: { notification_state: notificationState, notification_attempts: attempts },
  });
  return { status: "complete", notification_state: notificationState };
}

async function adminSaveCountry(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await adminOnly(user);
  const countryName = plainText(body.country_name, 80);
  const countryCode = typeof body.country_code === "string" ? body.country_code.trim().toUpperCase() : "";
  const status = body.status;
  if (!countryName || !/^[A-Z]{2}$/.test(countryCode)) fault("COUNTRY_INVALID");
  if (status !== "supported" && status !== "waitlist") fault("COUNTRY_INVALID");
  const existingRows = await payoutCountries(client);
  const duplicate = existingRows.find((row) => String(row.country_code).toUpperCase() === countryCode && row.id !== body.country_id);
  if (duplicate) fault("COUNTRY_DUPLICATE", 409);
  const data = { country_name: countryName, country_code: countryCode, status };
  let saved: Row;
  let auditAction: string;
  let targetId: string;
  let oldValue: Record<string, unknown> | null;
  let newValue: Record<string, unknown>;
  if (typeof body.country_id === "string" && body.country_id) {
    const row = existingRows.find((item) => item.id === body.country_id);
    if (!row) fault("COUNTRY_NOT_FOUND", 404);
    const oldChanged: Record<string, unknown> = {};
    const newChanged: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (Object.is(row[key], value)) continue;
      oldChanged[key] = row[key] === undefined ? null : row[key];
      newChanged[key] = value;
    }
    if (Object.keys(newChanged).length === 0) return { status: "complete", country: row, countries: existingRows };
    await updateRow(client, "tutor_payout_country", body.country_id, data);
    saved = { ...row, ...data };
    auditAction = "payout_country.updated";
    targetId = body.country_id;
    oldValue = oldChanged;
    newValue = newChanged;
  } else {
    saved = await createRow(client, "tutor_payout_country", data);
    if (!saved.id) fault("COUNTRY_SAVE_FAILED", 503);
    auditAction = "payout_country.created";
    targetId = String(saved.id);
    oldValue = null;
    newValue = data;
  }
  await writeAdminAudit(client, user, { action: auditAction, target_type: "tutor_payout_country", target_id: targetId, old_value: oldValue, new_value: newValue });
  return { status: "complete", country: saved, countries: await payoutCountries(client) };
}

function safeKnownStrings(value: unknown, allowed: readonly string[], maximum: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && allowed.includes(item)))].slice(0, maximum);
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  let candidate = value;
  if (typeof candidate === "string") {
    try { candidate = JSON.parse(candidate); } catch { return {}; }
  }
  return isObject(candidate) ? candidate : {};
}

function publicReviewDtos(value: unknown): Record<string, unknown>[] {
  let candidate = value;
  if (typeof candidate === "string") {
    try { candidate = JSON.parse(candidate); } catch { return []; }
  }
  if (!Array.isArray(candidate)) return [];
  return candidate.flatMap((item) => {
    if (!isObject(item) || item.is_visible === false || typeof item.id !== "string" || !Number.isInteger(item.stars) || Number(item.stars) < 1 || Number(item.stars) > 5) return [];
    const isTest = item.is_test_review === true;
    return [{
      id: item.id,
      stars: Number(item.stars),
      comment: plainText(item.comment, 700, true),
      is_test_review: isTest,
      learner_label: isTest ? "Demo learner" : "Learner",
      tutor_reply: plainText(item.tutor_reply, 1200, true),
    }];
  });
}

function publicListingDto(row: Row): Record<string, unknown> {
  const availabilitySource = parseJsonObject(row.availability_json);
  const availability = safePublicAvailability(
    decodeJsonArray(availabilitySource.rules),
    decodeJsonArray(availabilitySource.exceptions),
  );
  const bookingScheduleSource = parseJsonObject(row.booking_schedule_json);
  const hasBookingSchedule = ["rules", "exceptions", "settings", "busy_intervals"].some((field) => Object.prototype.hasOwnProperty.call(bookingScheduleSource, field));
  const scheduleRules = decodeJsonArray(hasBookingSchedule ? bookingScheduleSource.rules : availabilitySource.rules);
  const scheduleExceptions = decodeJsonArray(hasBookingSchedule ? bookingScheduleSource.exceptions : availabilitySource.exceptions);
  const bookingSchedule = safePublicBookingProjection(
    scheduleRules,
    scheduleExceptions,
    bookingScheduleSource.settings,
    decodeJsonArray(bookingScheduleSource.busy_intervals),
  );
  const reviews = publicReviewDtos(row.reviews_json);
  const count = reviews.length;
  const average = count
    ? Math.round((reviews.reduce((sum, review) => sum + Number(review.stars), 0) / count) * 10) / 10
    : 0;
  const ratingSummary = count >= 3 ? { average, count } : null;
  return {
    ...safePublicTutorProfileFields(row),
    availability,
    booking_schedule: bookingSchedule,
    reviews,
    rating_summary: ratingSummary,
    is_published: row.is_published === true,
  };
}

async function assertCanonicalParleRole(client: any, user: Caller, expectedRole: "learner" | "tutor"): Promise<void> {
  if (user.role === "administrator") fault(`${expectedRole.toUpperCase()}_REQUIRED`, 403);
  const identities = await rows(client, "ParleIdentity", { created_by: user.email }, "created_at", 100);
  const owned = identities.filter((record) => record.created_by === user.email).slice().sort((left, right) => {
    const leftAt = typeof left.created_at === "string" ? Date.parse(left.created_at) : Number.POSITIVE_INFINITY;
    const rightAt = typeof right.created_at === "string" ? Date.parse(right.created_at) : Number.POSITIVE_INFINITY;
    return leftAt - rightAt || String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });
  if (!owned[0] || owned[0].role !== expectedRole) fault(`${expectedRole.toUpperCase()}_REQUIRED`, 403);
}

async function learnerMatchContext(client: any, user: Caller): Promise<Record<string, unknown>> {
  await assertCanonicalParleRole(client, user, "learner");
  const profiles = await rows(client, "learner_profile", { user_id: user.id }, "-updated_at", 30);
  const learnerProfile = profiles.find((record) => record.user_id === user.id && record.created_by === user.email);
  if (!learnerProfile) fault("LEARNER_PROFILE_NOT_FOUND", 404);

  const [accountProfiles, activePlans] = await Promise.all([
    rows(client, "ParleProfile", { created_by: user.email }, "-created_at", 20),
    rows(client, "week_plan", { user_id: user.id, status: "active" }, "-updated_at", 30),
  ]);
  const accountProfile = accountProfiles.find((record) => record.created_by === user.email) ?? {};
  const activePlan = activePlans.find((record) => record.user_id === user.id && record.created_by === user.email && record.status === "active");
  let roadmapId = typeof activePlan?.roadmap_id === "string" ? activePlan.roadmap_id : "";
  if (!roadmapId) {
    const roadmapRows = await rows(client, "roadmap", { user_id: user.id }, "-updated_at", 20);
    const latestRoadmap = roadmapRows.find((record) => record.user_id === user.id && record.created_by === user.email);
    roadmapId = typeof latestRoadmap?.id === "string" ? latestRoadmap.id : "";
  }
  const estimates = roadmapId ? await rows(client, "skill_estimate", { user_id: user.id, roadmap_id: roadmapId }, "-updated_at", 50) : [];
  const latestBySkill = new Map<string, number>();
  for (const estimate of estimates) {
    if (estimate.user_id !== user.id || estimate.roadmap_id !== roadmapId || estimate.created_by !== user.email || typeof estimate.skill !== "string") continue;
    if (latestBySkill.has(estimate.skill)) continue;
    const value = estimate.value;
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 5) latestBySkill.set(estimate.skill, value);
  }
  const rawWindows = safeKnownStrings(learnerProfile.tutor_windows, LEARNER_TUTOR_WINDOW_VALUES, LEARNER_TUTOR_WINDOW_VALUES.length);
  const accountLanguage = typeof accountProfile.native_language === "string" ? accountProfile.native_language.trim() : "";
  const learnerLanguage = typeof learnerProfile.native_language === "string" ? learnerProfile.native_language.trim() : "";
  const accountZone = accountProfile.time_zone;
  const learnerZone = learnerProfile.time_zone;
  const timeZone = isValidIanaTimeZone(accountZone) ? String(accountZone).trim() : isValidIanaTimeZone(learnerZone) ? String(learnerZone).trim() : "UTC";
  const nativeLanguage = accountLanguage || learnerLanguage;
  const budgetOptions = ["none", "under_20", "20_35", "35_50", "50_plus", "unspecified"];
  return {
    main_goal: typeof learnerProfile.main_goal === "string" ? learnerProfile.main_goal : "other",
    current_skill_values: [...latestBySkill.values()],
    self_assessed_level: typeof learnerProfile.self_assessed_level === "string" ? learnerProfile.self_assessed_level : "",
    native_language: nativeLanguage,
    tutor_budget_band: typeof learnerProfile.tutor_budget_band === "string" && budgetOptions.includes(learnerProfile.tutor_budget_band) ? learnerProfile.tutor_budget_band : "unspecified",
    tutor_windows: rawWindows,
    time_zone: timeZone,
  };
}

async function learnerListTutors(client: any, user: Caller): Promise<Record<string, unknown>> {
  const context = await learnerMatchContext(client, user);
  const listings = await rows(client, "tutor_public_profile", { is_published: true }, "-updated_at", 500);
  const tutors = listings.filter((listing) => listing.is_published === true && typeof listing.profile_id === "string").map(publicListingDto);
  return { status: "complete", match_context: context, tutors };
}

async function learnerGetTutor(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await assertCanonicalParleRole(client, user, "learner");
  const profileId = typeof body.profile_id === "string" ? body.profile_id : "";
  if (!profileId) fault("NOT_FOUND", 404);
  const listings = await rows(client, "tutor_public_profile", { profile_id: profileId, is_published: true }, "-updated_at", 10);
  const listing = listings.find((record) => record.profile_id === profileId && record.is_published === true);
  if (!listing) fault("NOT_FOUND", 404);
  const context = await learnerMatchContext(client, user);
  return { status: "complete", tutor: publicListingDto(listing), match_context: context };
}

async function tutorGetPublicPreview(client: any, user: Caller): Promise<Record<string, unknown>> {
  await assertCanonicalParleRole(client, user, "tutor");
  const profile = await ownProfile(client, user, false);
  if (typeof profile.id !== "string" || profile.user_id !== user.id || profile.created_by !== user.email) fault("PROFILE_NOT_FOUND", 404);
  const review = await findReview(client, profile, user.email);
  if (!review || review.profile_id !== profile.id || review.tutor_email !== user.email) fault("NOT_FOUND", 404);
  const listings = await rows(client, "tutor_public_profile", { profile_id: profile.id, is_published: true }, "-updated_at", 20);
  const listing = listings.find((record) => isOwnApprovedTutorListing({
    profile,
    review,
    listing: record,
    userId: user.id,
    email: user.email,
  }));
  if (!listing) fault("NOT_FOUND", 404);
  return { status: "complete", tutor: publicListingDto(listing) };
}

type BookingStatus = "requested" | "confirmed" | "declined";
type BookingDecisionCode = "none" | "accepted" | "declined_by_tutor" | "slot_taken" | "another_request_accepted";
const BOOKING_STATUS_VALUES: BookingStatus[] = ["requested", "confirmed", "declined"];
const BOOKING_DECISION_VALUES: BookingDecisionCode[] = ["none", "accepted", "declined_by_tutor", "slot_taken", "another_request_accepted"];

function bookingStatus(value: unknown): BookingStatus | null {
  return typeof value === "string" && BOOKING_STATUS_VALUES.includes(value as BookingStatus) ? value as BookingStatus : null;
}

function bookingDecisionCode(value: unknown): BookingDecisionCode {
  return typeof value === "string" && BOOKING_DECISION_VALUES.includes(value as BookingDecisionCode) ? value as BookingDecisionCode : "none";
}

function bookingInterval(row: Row): { startUtc: string; endUtc: string } | null {
  const start = Date.parse(typeof row.start_time_utc === "string" ? row.start_time_utc : "");
  const end = Date.parse(typeof row.end_time_utc === "string" ? row.end_time_utc : "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { startUtc: new Date(start).toISOString(), endUtc: new Date(end).toISOString() };
}

function bookingDto(row: Row): Record<string, unknown> | null {
  if (typeof row.id !== "string") return null;
  const status = bookingStatus(row.status);
  const interval = bookingInterval(row);
  const duration = Number(row.duration_minutes);
  if (!status || !interval || ![30, 45, 60].includes(duration) || Date.parse(interval.endUtc) - Date.parse(interval.startUtc) !== duration * 60_000) return null;
  const decisionAt = typeof row.decision_at_utc === "string" && Number.isFinite(Date.parse(row.decision_at_utc))
    ? new Date(Date.parse(row.decision_at_utc)).toISOString()
    : "";
  return {
    id: row.id,
    tutor_profile_id: typeof row.tutor_profile_id === "string" ? row.tutor_profile_id : "",
    tutor_display_name: plainText(row.tutor_display_name, 80),
    learner_first_name: plainText(row.learner_first_name, 48),
    start_time_utc: interval.startUtc,
    end_time_utc: interval.endUtc,
    duration_minutes: duration,
    learner_message: plainText(row.learner_message, 1000, true),
    status,
    decision_message: bookingDecisionCode(row.decision_message),
    decision_at_utc: decisionAt,
  };
}

function confirmedBusyIntervals(records: Row[], profileId: unknown, tutorUserId: unknown): Array<{ start_utc: string; end_utc: string }> {
  if (typeof profileId !== "string" || !profileId || typeof tutorUserId !== "string" || !tutorUserId) return [];
  return records
    .filter((row) => row.tutor_profile_id === profileId && row.tutor_user_id === tutorUserId && row.status === "confirmed")
    .flatMap((row) => {
      const interval = bookingInterval(row);
      return interval ? [{ start_utc: interval.startUtc, end_utc: interval.endUtc }] : [];
    })
    .sort((left, right) => Date.parse(left.start_utc) - Date.parse(right.start_utc))
    .slice(0, 1000);
}

async function learnerTimeZone(client: any, user: Caller): Promise<string> {
  const [accountProfiles, learnerProfiles] = await Promise.all([
    rows(client, "ParleProfile", { created_by: user.email }, "-created_at", 20),
    rows(client, "learner_profile", { user_id: user.id }, "-updated_at", 20),
  ]);
  const accountProfile = accountProfiles.find((record) => record.created_by === user.email);
  const learnerProfile = learnerProfiles.find((record) => record.user_id === user.id && record.created_by === user.email);
  if (isValidIanaTimeZone(accountProfile?.time_zone)) return String(accountProfile.time_zone).trim();
  if (isValidIanaTimeZone(learnerProfile?.time_zone)) return String(learnerProfile.time_zone).trim();
  return "UTC";
}

async function learnerListBookings(client: any, user: Caller): Promise<Record<string, unknown>> {
  await assertCanonicalParleRole(client, user, "learner");
  const [records, timeZone] = await Promise.all([
    rows(client, "booking", { learner_user_id: user.id }, "-start_time_utc", 500),
    learnerTimeZone(client, user),
  ]);
  const bookings = records
    .filter((row) => row.learner_user_id === user.id && row.created_by === user.email)
    .map(bookingDto)
    .filter((item): item is Record<string, unknown> => item !== null)
    .sort((left, right) => Date.parse(String(left.start_time_utc)) - Date.parse(String(right.start_time_utc)));
  return { status: "complete", time_zone: timeZone, bookings };
}

async function learnerRequestBooking(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await assertCanonicalParleRole(client, user, "learner");
  const profileId = typeof body.tutor_profile_id === "string" ? body.tutor_profile_id.trim() : "";
  if (!profileId || profileId.length > 128) fault("TUTOR_NOT_AVAILABLE", 404);
  const listings = await rows(client, "tutor_public_profile", { profile_id: profileId, is_published: true }, "-updated_at", 10);
  const listing = listings.find((record) => record.profile_id === profileId && record.is_published === true);
  if (!listing) fault("TUTOR_NOT_ACCEPTING", 409);
  const tutor = publicListingDto(listing);
  const schedule = isObject(tutor.booking_schedule) ? tutor.booking_schedule as BookingSchedule : {};
  const submission = await validateAndPersistLearnerBookingRequest({
    isPublished: listing.is_published === true,
    acceptingRequests: listing.accepting_requests === false ? false : undefined,
    tutorProfileId: profileId,
    tutorUserId: listing.tutor_user_id,
    tutorDisplayName: plainText(listing.display_name, 80),
    learnerUserId: user.id,
    learnerFirstName: plainText(user.full_name ?? "", 80).split(/\s+/)[0] || "Learner",
    startTimeUtc: body.start_time_utc,
    durationMinutes: body.duration_minutes,
    learnerMessage: plainText(body.message, 1000, true),
    schedule,
    now: Date.now(),
  }, async (record) => await createRow(client, "booking", record));
  if (!submission.ok) fault(submission.code, 409);
  const booking = bookingDto(submission.booking);
  if (!submission.booking.id || !booking) fault("BOOKING_SAVE_FAILED", 503);
  return { status: "complete", booking, time_zone: await learnerTimeZone(client, user) };
}

async function approvedOwnTutorProfile(client: any, user: Caller): Promise<Row> {
  await assertCanonicalParleRole(client, user, "tutor");
  const profile = await ownProfile(client, user, false);
  if (typeof profile.id !== "string" || profile.user_id !== user.id || profile.created_by !== user.email) fault("PROFILE_NOT_FOUND", 404);
  const approved = await approvedFreshSource(client, profile.id);
  if (approved.profile.user_id !== user.id || approved.profile.created_by !== user.email) fault("TUTOR_REQUIRED", 403);
  return approved.profile;
}

async function tutorBookingSchedule(client: any, user: Caller, profile: Row): Promise<{ schedule: BookingSchedule; settings: ReturnType<typeof safeBookingSettings> }> {
  const [ruleRows, exceptionRows, settingRows] = await Promise.all([
    rows(client, "availability_rule", { profile_id: profile.id, user_id: user.id }, "day_of_week", 20),
    rows(client, "availability_exception", { profile_id: profile.id, user_id: user.id }, "date_local", 150),
    rows(client, "tutor_booking_settings", { tutor_profile_id: profile.id, tutor_user_id: user.id }, "-updated_at", 20),
  ]);
  const owns = (row: Row) => row.profile_id === profile.id && row.user_id === user.id && row.created_by === user.email;
  const rules = ruleRows.filter(owns).map((row) => ({
    day_of_week: Number(row.day_of_week),
    start_local: typeof row.start_local === "string" ? row.start_local : "",
    end_local: typeof row.end_local === "string" ? row.end_local : "",
    time_zone: typeof row.time_zone === "string" ? row.time_zone : "",
  }));
  const exceptions = exceptionRows.filter(owns).flatMap((row) => {
    if (row.kind !== "off" && row.kind !== "extra") return [];
    return [{
      date_local: typeof row.date_local === "string" ? row.date_local : "",
      kind: row.kind,
      start_local: typeof row.start_local === "string" ? row.start_local : "",
      end_local: typeof row.end_local === "string" ? row.end_local : "",
      time_zone: typeof row.time_zone === "string" ? row.time_zone : "",
    }];
  });
  const settingsRow = settingRows.find((row) => row.tutor_profile_id === profile.id && row.tutor_user_id === user.id && row.created_by === user.email);
  const settings = safeBookingSettings(settingsRow ?? DEFAULT_BOOKING_SETTINGS);
  return { schedule: { rules, exceptions, settings, busy_intervals: [] }, settings };
}

async function tutorListBookings(client: any, user: Caller): Promise<Record<string, unknown>> {
  const profile = await approvedOwnTutorProfile(client, user);
  const records = await rows(client, "booking", { tutor_profile_id: profile.id, tutor_user_id: user.id }, "start_time_utc", 500);
  const bookings = records
    .filter((row) => row.tutor_profile_id === profile.id && row.tutor_user_id === user.id)
    .map(bookingDto)
    .filter((item): item is Record<string, unknown> => item !== null)
    .sort((left, right) => Date.parse(String(left.start_time_utc)) - Date.parse(String(right.start_time_utc)));
  return {
    status: "complete",
    time_zone: isValidIanaTimeZone(profile.time_zone) ? String(profile.time_zone).trim() : "UTC",
    bookings,
  };
}

async function tutorDecideBooking(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  const profile = await approvedOwnTutorProfile(client, user);
  const bookingId = typeof body.booking_id === "string" ? body.booking_id.trim() : "";
  const decision = body.decision;
  if (!bookingId || (decision !== "accept" && decision !== "decline")) fault("BOOKING_DECISION_INVALID");
  const candidates = await rows(client, "booking", { id: bookingId, tutor_profile_id: profile.id, tutor_user_id: user.id }, "-created_at", 10);
  const target = candidates.find((row) => row.id === bookingId && row.tutor_profile_id === profile.id && row.tutor_user_id === user.id);
  if (!target) fault("BOOKING_NOT_FOUND", 404);
  if (target.status !== "requested") fault("BOOKING_NOT_PENDING", 409);
  const interval = bookingInterval(target);
  const duration = Number(target.duration_minutes);
  if (!interval || ![30, 45, 60].includes(duration) || Date.parse(interval.endUtc) - Date.parse(interval.startUtc) !== duration * 60_000) fault("BOOKING_SLOT_INVALID", 409);
  const decisionAt = new Date().toISOString();

  if (decision === "decline") {
    const patch = { status: "declined", decision_message: "declined_by_tutor", decision_at_utc: decisionAt };
    await updateRow(client, "booking", bookingId, patch);
    const booking = bookingDto({ ...target, ...patch });
    if (!booking) fault("BOOKING_SAVE_FAILED", 503);
    return { status: "complete", outcome: "declined", declined_pending_count: 0, booking };
  }

  const [{ schedule, settings }, confirmedRows] = await Promise.all([
    tutorBookingSchedule(client, user, profile),
    rows(client, "booking", { tutor_profile_id: profile.id, tutor_user_id: user.id, status: "confirmed" }, "start_time_utc", 1000),
  ]);
  const confirmed = confirmedRows.filter((row) => row.id !== bookingId && row.tutor_profile_id === profile.id && row.tutor_user_id === user.id && row.status === "confirmed");
  const proposed = { startUtc: interval.startUtc, endUtc: interval.endUtc };
  const currentlyOffered = generateBookableSlots(schedule, { now: Date.now(), windowDays: 30 })
    .some((slot) => slot.startUtc === interval.startUtc && slot.endUtc === interval.endUtc && slot.durationMinutes === duration);
  const clashes = confirmed.some((row) => {
    const existing = bookingInterval(row);
    return existing ? hasBufferedOverlap(proposed, existing, settings.buffer_minutes) : false;
  });
  if (!currentlyOffered || clashes) {
    const patch = { status: "declined", decision_message: "slot_taken", decision_at_utc: decisionAt };
    await updateRow(client, "booking", bookingId, patch);
    const booking = bookingDto({ ...target, ...patch });
    if (!booking) fault("BOOKING_SAVE_FAILED", 503);
    return { status: "complete", outcome: "slot_taken", declined_pending_count: 0, booking };
  }

  const acceptedPatch = { status: "confirmed", decision_message: "accepted", decision_at_utc: decisionAt };
  await updateRow(client, "booking", bookingId, acceptedPatch);
  let declinedPendingCount = 0;
  const pendingRows = await rows(client, "booking", { tutor_profile_id: profile.id, tutor_user_id: user.id, status: "requested" }, "start_time_utc", 1000);
  for (const pending of pendingRows) {
    if (pending.id === bookingId || pending.tutor_profile_id !== profile.id || pending.tutor_user_id !== user.id || pending.status !== "requested") continue;
    const pendingInterval = bookingInterval(pending);
    if (!pending.id || !pendingInterval || !hasBufferedOverlap(proposed, pendingInterval, settings.buffer_minutes)) continue;
    const patch = { status: "declined", decision_message: "another_request_accepted", decision_at_utc: decisionAt };
    await updateRow(client, "booking", pending.id, patch);
    declinedPendingCount += 1;
  }
  const booking = bookingDto({ ...target, ...acceptedPatch });
  if (!booking) fault("BOOKING_SAVE_FAILED", 503);
  return { status: "complete", outcome: "accepted", declined_pending_count: declinedPendingCount, booking };
}

async function privateAvailabilitySnapshot(
  client: any,
  profile: Row,
  tutorEmail: string,
): Promise<{ availability: string; bookingSchedule: string }> {
  const [ruleRows, exceptionRows, settingRows, bookingRows] = await Promise.all([
    rows(client, "availability_rule", { profile_id: profile.id, user_id: profile.user_id }, "day_of_week", 50),
    rows(client, "availability_exception", { profile_id: profile.id, user_id: profile.user_id }, "date_local", 200),
    rows(client, "tutor_booking_settings", { tutor_profile_id: profile.id, tutor_user_id: profile.user_id }, "-updated_at", 20),
    rows(client, "booking", { tutor_profile_id: profile.id, tutor_user_id: profile.user_id, status: "confirmed" }, "start_time_utc", 1000),
  ]);
  const isOwned = (record: Row) => record.profile_id === profile.id && record.user_id === profile.user_id && record.created_by === tutorEmail;
  const ownedRules = ruleRows.filter(isOwned);
  const ownedExceptions = exceptionRows.filter(isOwned);
  const availability = safePublicAvailability(ownedRules, ownedExceptions);
  const settings = settingRows.find((record) =>
    record.tutor_profile_id === profile.id && record.tutor_user_id === profile.user_id && record.created_by === tutorEmail
  );
  const busyIntervals = confirmedBusyIntervals(bookingRows, profile.id, profile.user_id);
  const bookingSchedule = safePublicBookingProjection(ownedRules, ownedExceptions, settings, busyIntervals);
  return {
    availability: JSON.stringify(availability),
    bookingSchedule: JSON.stringify(bookingSchedule),
  };
}

async function safePublicProjectionFields(client: any, profile: Row, review: Row): Promise<Record<string, unknown>> {
  if (typeof profile.id !== "string" || typeof profile.user_id !== "string" || !profile.user_id || typeof profile.created_by !== "string" || !profile.created_by) fault("PROFILE_NOT_FOUND", 404);
  const reviewMatchesProfile = review.profile_id === profile.id && review.tutor_email === profile.created_by;
  const mayApplyApprovedEdits = reviewMatchesProfile && approvedProfileEditEligibility(profile, review) === null;
  const [documents, rawReviews, replies, availabilitySnapshot, editRows] = await Promise.all([
    rows(client, "tutor_document", { profile_id: profile.id, user_id: profile.user_id }, "-created_at", 200),
    rows(client, "tutor_review", { profile_id: profile.id, tutor_email: profile.created_by }, "-created_at", 500),
    rows(client, "tutor_review_reply", { profile_id: profile.id, tutor_email: profile.created_by }, "created_at", 500),
    privateAvailabilitySnapshot(client, profile, profile.created_by),
    mayApplyApprovedEdits
      ? rows(client, "tutor_profile_public_edits", { profile_id: profile.id, user_id: profile.user_id, created_by: profile.created_by }, "-updated_at", 20)
      : Promise.resolve([] as Row[]),
  ]);
  const ownedDocuments = documents.filter((doc) => doc.profile_id === profile.id && doc.user_id === profile.user_id && doc.created_by === profile.created_by);
  const verifiedIds = verifiedDocumentIds(review.verified_document_ids, profile.id, ownedDocuments);
  const verifiedLabels = [...new Set(ownedDocuments
    .filter((document) => typeof document.id === "string" && verifiedIds.includes(document.id) && validateCertificateFile({ mime_type: document.mime_type, size_bytes: document.size_bytes, content_base64: document.content_base64 }).valid)
    .map((document) => plainText(document.label, 80))
    .filter(Boolean))].slice(0, 30);
  const reviewData = publicReviewSnapshot(rawReviews, replies, profile.id, profile.created_by);
  const edits = mayApplyApprovedEdits
    ? editRows.map((row) => approvedPublicProfileEditsFromRow(row, profile.id as string, profile.user_id as string, profile.created_by as string)).find((value) => value !== null) ?? null
    : null;
  const publicContent = edits ? mergeApprovedPublicProfileEdits(profile, edits) : profile;
  const safeFields = safePublicTutorProfileFields({
    profile_id: profile.id,
    display_name: profile.display_name,
    headline: publicContent.headline,
    bio: publicContent.bio,
    photo_base64: profile.photo_base64,
    photo_mime_type: profile.photo_mime_type,
    specialties: profile.specialties,
    levels_taught: profile.levels_taught,
    spoken_languages: publicContent.spoken_languages,
    teaching_styles: publicContent.teaching_styles,
    hourly_rate_cents: publicContent.hourly_rate_cents,
    intro_video_url: publicContent.intro_video_url,
    verified_certificate_labels: verifiedLabels,
  });
  return {
    ...safeFields,
    tutor_user_id: profile.user_id,
    availability_json: availabilitySnapshot.availability,
    booking_schedule_json: availabilitySnapshot.bookingSchedule,
    reviews_json: JSON.stringify(reviewData.reviews),
    rating_summary_json: reviewData.ratingSummary ? JSON.stringify(reviewData.ratingSummary) : "",
  };
}

async function publicListingRows(client: any, profileId: string): Promise<Row[]> {
  return (await rows(client, "tutor_public_profile", { profile_id: profileId }, "-updated_at", 100)).filter((row) => row.profile_id === profileId);
}

async function savePublicListing(client: any, profile: Row, review: Row, publish: boolean): Promise<Row> {
  const fields = await safePublicProjectionFields(client, profile, review);
  const data = { ...fields, is_published: false };
  const existing = await publicListingRows(client, String(profile.id));
  let saved: Row;
  if (existing[0]?.id) {
    await updateRow(client, "tutor_public_profile", String(existing[0].id), data);
    saved = { ...existing[0], ...data };
  } else {
    saved = await createRow(client, "tutor_public_profile", data);
  }
  if (!saved.id) fault("PUBLIC_PROFILE_SAVE_FAILED", 503);
  if (publish) {
    await updateRow(client, "tutor_public_profile", String(saved.id), { is_published: true });
    saved.is_published = true;
  }
  return saved;
}

async function setPublicListingPublished(client: any, profileId: string, published: boolean): Promise<void> {
  const listings = await publicListingRows(client, profileId);
  if (published && listings.length === 0) fault("PUBLIC_PROFILE_NOT_FOUND", 503);
  for (const listing of listings) if (listing.id && listing.is_published !== published) await updateRow(client, "tutor_public_profile", listing.id, { is_published: published });
}

async function approvedFreshSource(client: any, profileId: string): Promise<{ profile: Row; review: Row }> {
  const profile = await profileById(client, profileId);
  if (typeof profile.created_by !== "string" || profile.application_intent !== "submitted") fault("APPLICATION_NOT_APPROVED", 409);
  const review = await findReview(client, profile, profile.created_by);
  if (!review || !review.id || effectiveApplicationStatus(profile, review) !== "Approved") fault("APPLICATION_NOT_APPROVED", 409);
  if (!isReviewSnapshotFresh(profile.updated_at, review.reviewed_profile_updated_at)) fault("APPLICATION_CHANGED", 409);
  return { profile, review };
}

async function publicProfileFingerprint(row: Row | null): Promise<string | null> {
  if (!row) return null;
  const fields = [
    "display_name", "headline", "bio", "photo_base64", "photo_mime_type", "specialties", "levels_taught",
    "spoken_languages", "teaching_styles", "hourly_rate_cents", "intro_video_url", "verified_certificate_labels", "availability_json",
    "booking_schedule_json", "reviews_json", "rating_summary_json",
  ];
  const payload = JSON.stringify(fields.map((field) => row[field] ?? null));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function adminRefreshPublicProfile(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await adminOnly(user);
  const profileId = typeof body.profile_id === "string" ? body.profile_id : "";
  if (!profileId) fault("PROFILE_NOT_FOUND", 404);
  const { profile, review } = await approvedFreshSource(client, profileId);
  const tutorId = typeof profile.user_id === "string" ? profile.user_id : "";
  const tutorEmail = typeof profile.created_by === "string" ? profile.created_by : "";
  if (!tutorId || !tutorEmail) fault("PROFILE_NOT_FOUND", 404);

  const listingsBefore = await publicListingRows(client, profileId);
  const previous = listingsBefore.find((listing) => listing.profile_id === profileId && listing.is_published === true) ?? null;
  if (!previous || typeof previous.id !== "string") fault("PUBLIC_PROFILE_NOT_FOUND", 404);

  const oldFingerprint = await publicProfileFingerprint(previous);
  const [projectionFields, storedEdits] = await Promise.all([
    safePublicProjectionFields(client, profile, review),
    ownerApprovedPublicEdits(client, profile, { id: tutorId, email: tutorEmail, role: "user" }),
  ]);
  const approvedContentPatch = storedEdits
    ? approvedPublicContentRefreshPatch(previous, storedEdits.values)
    : null;
  const data = { ...projectionFields, ...(approvedContentPatch ?? {}) };
  // Keep admin publication state and review status out of this refresh update.
  await updateRow(client, "tutor_public_profile", previous.id, data);
  const saved: Row = { ...previous, ...data };

  await writeAdminAudit(client, user, {
    action: "public_profile.refreshed",
    target_type: "tutor_public_profile",
    target_id: String(saved.id),
    old_value: { is_published: true, content_sha256: oldFingerprint },
    new_value: { is_published: true, content_sha256: await publicProfileFingerprint(saved) },
  });
  return { status: "complete", public_profile_state: "published" };
}

function safeDemoReview(review: Row): Record<string, unknown> {
  return {
    id: typeof review.id === "string" ? review.id : "",
    stars: Number.isInteger(review.stars) ? Number(review.stars) : 0,
    comment: plainText(review.comment, 700, true),
    is_visible: review.is_visible !== false,
    is_test_review: review.is_test_review === true,
    created_at: typeof review.created_at === "string" ? review.created_at : "",
  };
}

async function refreshDemoReviewProjection(client: any, profileId: string): Promise<"published" | "pending_refresh"> {
  try {
    const { profile, review } = await approvedFreshSource(client, profileId);
    await savePublicListing(client, profile, review, true);
    return "published";
  } catch (error) {
    console.warn("Parle demo review is saved; public profile refresh is pending", error instanceof ServiceFault ? error.code : "PUBLIC_REFRESH_FAILED");
    return "pending_refresh";
  }
}

async function adminAddTestReview(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await adminOnly(user);
  const profileId = typeof body.profile_id === "string" ? body.profile_id : "";
  const stars = Number(body.stars);
  const comment = plainText(body.comment, 700, true);
  if (!profileId || !Number.isInteger(stars) || stars < 1 || stars > 5) fault("REVIEW_INVALID");
  const { profile } = await approvedFreshSource(client, profileId);
  const review = await createRow(client, "tutor_review", {
    profile_id: profileId,
    tutor_email: profile.created_by,
    stars,
    comment,
    is_test_review: true,
    is_visible: true,
    demo_lesson_reference: `test-review-${crypto.randomUUID()}`,
  });
  if (!review.id) fault("REVIEW_SAVE_FAILED", 503);
  await writeAdminAudit(client, user, {
    action: "demo_review.added",
    target_type: "tutor_review",
    target_id: String(review.id),
    old_value: null,
    new_value: { stars, comment, is_visible: true, is_test_review: true },
  });
  const publicState = await refreshDemoReviewProjection(client, profileId);
  return { status: "complete", review: safeDemoReview(review), public_profile_state: publicState };
}

async function adminHideTestReview(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await adminOnly(user);
  const profileId = typeof body.profile_id === "string" ? body.profile_id : "";
  const reviewId = typeof body.review_id === "string" ? body.review_id : "";
  if (!profileId || !reviewId) fault("REVIEW_NOT_FOUND", 404);
  const { profile } = await approvedFreshSource(client, profileId);
  const reviews = await rows(client, "tutor_review", { profile_id: profileId, tutor_email: profile.created_by }, "-created_at", 500);
  const review = reviews.find((row) => row.id === reviewId && row.is_test_review === true && row.profile_id === profileId && row.tutor_email === profile.created_by);
  if (!review?.id) fault("REVIEW_NOT_FOUND", 404);
  if (review.is_visible !== false) {
    await updateRow(client, "tutor_review", review.id, { is_visible: false });
    await writeAdminAudit(client, user, {
      action: "demo_review.hidden",
      target_type: "tutor_review",
      target_id: review.id,
      old_value: { is_visible: true },
      new_value: { is_visible: false },
    });
  }
  const publicState = await refreshDemoReviewProjection(client, profileId);
  return { status: "complete", review: safeDemoReview({ ...review, is_visible: false }), public_profile_state: publicState };
}

async function adminManageReviews(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  const result = await adminManageTutorReviewsAction(client, user, body);
  if (
    (body.operation !== "hide" && body.operation !== "restore")
    || result.changed !== true
    || !isObject(result.review)
    || typeof result.review.profile_id !== "string"
  ) return result;

  let publicProfileState: "published" | "pending_refresh" = "pending_refresh";
  try {
    const refreshed = await adminRefreshPublicProfile(client, user, { profile_id: result.review.profile_id });
    publicProfileState = refreshed.public_profile_state === "published" ? "published" : "pending_refresh";
  } catch (error) {
    console.warn("Parle review visibility was saved; public profile refresh is pending", error instanceof ServiceFault ? error.code : "PUBLIC_REFRESH_FAILED");
  }
  return { ...result, public_profile_state: publicProfileState };
}

async function tutorReplyableReviews(client: any, user: Caller): Promise<Record<string, unknown>> {
  await assertCanonicalParleRole(client, user, "tutor");
  const profile = await ownProfile(client, user, false);
  if (!profile.id) fault("PROFILE_NOT_FOUND", 404);
  const applicationReview = await findReview(client, profile, user.email);
  if (!applicationReview || effectiveApplicationStatus(profile, applicationReview) !== "Approved" || !isReviewSnapshotFresh(profile.updated_at, applicationReview.reviewed_profile_updated_at)) {
    return { status: "complete", reviews: [] };
  }
  const listings = await rows(client, "tutor_public_profile", { profile_id: profile.id, is_published: true }, "-updated_at", 10);
  const listing = listings.find((row) => row.profile_id === profile.id && row.is_published === true);
  if (!listing) return { status: "complete", reviews: [] };
  const reviews = publicReviewDtos(listing.reviews_json);
  const replies = await rows(client, "tutor_review_reply", { profile_id: profile.id, tutor_email: user.email }, "created_at", 500);
  const ownReplies = replies.filter((reply) => reply.profile_id === profile.id && reply.tutor_email === user.email && reply.created_by === user.email && typeof reply.review_id === "string" && typeof reply.reply_text === "string" && reply.reply_text.trim().length > 0);
  const firstReplyByReview = new Map<string, Row>();
  ownReplies.slice().sort((left, right) => {
    const leftAt = typeof left.created_at === "string" ? Date.parse(left.created_at) : Number.POSITIVE_INFINITY;
    const rightAt = typeof right.created_at === "string" ? Date.parse(right.created_at) : Number.POSITIVE_INFINITY;
    return leftAt - rightAt || String(left.id ?? "").localeCompare(String(right.id ?? ""));
  }).forEach((reply) => { if (typeof reply.review_id === "string" && !firstReplyByReview.has(reply.review_id)) firstReplyByReview.set(reply.review_id, reply); });
  return {
    status: "complete",
    reviews: reviews.map((review) => {
      const id = String(review.id);
      const pending = firstReplyByReview.get(id);
      const published = typeof review.tutor_reply === "string" && review.tutor_reply.length > 0;
      return {
        ...review,
        reply_state: published ? "published" : pending ? "pending" : "available",
        pending_reply: pending && !published ? plainText(pending.reply_text, 1200, true) : "",
      };
    }),
  };
}

async function tutorSubmitReviewReply(client: any, user: Caller, body: MarketplaceAction): Promise<Record<string, unknown>> {
  await assertCanonicalParleRole(client, user, "tutor");
  const profile = await ownProfile(client, user, false);
  if (!profile.id || profile.created_by !== user.email) fault("PROFILE_NOT_FOUND", 404);
  const applicationReview = await findReview(client, profile, user.email);
  if (!applicationReview || effectiveApplicationStatus(profile, applicationReview) !== "Approved" || !isReviewSnapshotFresh(profile.updated_at, applicationReview.reviewed_profile_updated_at)) fault("REVIEW_NOT_AVAILABLE", 409);
  const listings = await rows(client, "tutor_public_profile", { profile_id: profile.id, is_published: true }, "-updated_at", 10);
  const listing = listings.find((row) => row.profile_id === profile.id && row.is_published === true);
  if (!listing) fault("REVIEW_NOT_AVAILABLE", 409);
  const reviewId = typeof body.review_id === "string" ? body.review_id : "";
  const review = publicReviewDtos(listing.reviews_json).find((item) => item.id === reviewId);
  if (!review) fault("REVIEW_NOT_FOUND", 404);
  if (typeof review.tutor_reply === "string" && review.tutor_reply) fault("REPLY_ALREADY_SUBMITTED", 409);
  const replyText = plainText(body.reply_text, 1200, true);
  if (replyText.length < 2) fault("REPLY_INVALID");
  const previous = await rows(client, "tutor_review_reply", { profile_id: profile.id, tutor_email: user.email, review_id: reviewId }, "created_at", 100);
  if (previous.some((reply) => reply.profile_id === profile.id && reply.tutor_email === user.email && reply.review_id === reviewId && reply.created_by === user.email && typeof reply.reply_text === "string" && reply.reply_text.trim())) fault("REPLY_ALREADY_SUBMITTED", 409);
  const saved = await createRow(client, "tutor_review_reply", { profile_id: profile.id, review_id: reviewId, tutor_email: user.email, reply_text: replyText });
  if (!saved.id) fault("REPLY_SAVE_FAILED", 503);
  return { status: "complete", reply_state: "pending_publication" };
}

async function dispatch(client: any, user: Caller, body: MarketplaceAction, integrationHeaders: Record<string, string>): Promise<Record<string, unknown>> {
  const action = typeof body.action === "string" ? body.action : "";
  return await dispatchWithAdminAccess(action, user, async () => {
    switch (action) {
      case "tutor_get_application": return await tutorGetApplication(client, user, body);
      case "tutor_save_approved_public_profile": return await tutorSaveApprovedPublicProfile(client, user, body);
      case "tutor_get_public_preview": return await tutorGetPublicPreview(client, user);
      case "tutor_save_profile": return await tutorSaveProfile(client, user, body);
      case "tutor_submit": return await tutorSubmit(client, user);
      case "tutor_upload_document": return await tutorUploadDocument(client, user, body);
      case "tutor_delete_document": return await tutorDeleteDocument(client, user, body);
      case "tutor_get_availability": return await tutorGetAvailability(client, user, body);
      case "tutor_save_availability": return await tutorSaveAvailability(client, user, body);
      case "tutor_save_booking_settings": return await tutorSaveBookingSettings(client, user, body);
      case "admin_authorize": return await adminAuthorize(user);
      case "admin_get_settings": return await adminGetSettings(client, user);
      case "admin_save_settings": return await adminSaveSettings(client, user, body);
      case "admin_list_audit": return await adminReadAudit(client, user, body);
      case "admin_list_users": return await adminListUsers(client, user);
      case "admin_content_coverage": return await adminContentCoverageAction(client, user, body);
      case "admin_get_metrics": return await adminMetricsAction(client, user, body, {
        testStripeSecret: Deno.env.get("STRIPE_SECRET_KEY") ?? undefined,
        now: new Date(),
      });
      case "admin_list_reported_content": return await adminListReportedContentAction(client, user);
      case "admin_resolve_practice_report": return await adminResolvePracticeReportAction(client, user, {
        report_id: body.report_id,
        resolution: body.resolution,
        note: body.note,
      });
      case "admin_get_content_item": return await adminGetContentItemAction(client, user, body);
      case "admin_save_content_item": return await adminSaveContentItemAction(client, user, body);
      case "admin_get_demo_bank": return await adminGetDemoBank(client, user);
      case "admin_set_premium_comp": return await adminSetPremiumComp(client, user, body);
      case "admin_update_demo_bank_content": return await adminUpdateDemoBank(client, user, body);
      case "admin_initialize": return await adminInitialize(client, user);
      case "admin_list_applications": return await adminListApplications(client, user);
      case "admin_open_application": return await adminOpenApplication(client, user, body);
      case "admin_verify_document": return await adminVerifyDocument(client, user, body);
      case "admin_decide": return await adminDecide(client, user, body, integrationHeaders);
      case "admin_retry_email": return await adminRetryEmail(client, user, body, integrationHeaders);
      case "admin_save_country": return await adminSaveCountry(client, user, body);
      case "admin_refresh_public_profile": return await adminRefreshPublicProfile(client, user, body);
      case "admin_add_test_review": return await adminAddTestReview(client, user, body);
      case "admin_hide_test_review": return await adminHideTestReview(client, user, body);
      case "admin_manage_reviews": return await adminManageReviews(client, user, body);
      case "learner_list_tutors": return await learnerListTutors(client, user);
      case "learner_get_tutor": return await learnerGetTutor(client, user, body);
      case "learner_request_booking": return await learnerRequestBooking(client, user, body);
      case "learner_list_bookings": return await learnerListBookings(client, user);
      case "tutor_list_bookings": return await tutorListBookings(client, user);
      case "tutor_decide_booking": return await tutorDecideBooking(client, user, body);
      case "tutor_list_reviews_to_reply": return await tutorReplyableReviews(client, user);
      case "tutor_submit_review_reply": return await tutorSubmitReviewReply(client, user, body);
      default: fault("ACTION_INVALID");
    }
  });
}

export const handler = (async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    const headers = new Headers({
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Requested-With",
      "Access-Control-Max-Age": "86400",
    });
    if (origin) { headers.set("Access-Control-Allow-Origin", origin); headers.set("Vary", "Origin"); }
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED", code: "METHOD_NOT_ALLOWED" }, 405, origin);
  if (!appId) return jsonResponse({ error: "SERVICE_UNAVAILABLE", code: "SERVICE_UNAVAILABLE" }, 503, origin);
  const authorization = request.headers.get("Authorization");
  if (!authorization || !/^Bearer\s+\S+/i.test(authorization)) return jsonResponse({ error: "AUTH_REQUIRED", code: "AUTH_REQUIRED" }, 401, origin);
  let bodyText = "";
  try { bodyText = await request.text(); } catch { return jsonResponse({ error: "REQUEST_INVALID", code: "REQUEST_INVALID" }, 400, origin); }
  if (bodyText.length > 2 * 1024 * 1024) return jsonResponse({ error: "REQUEST_TOO_LARGE", code: "REQUEST_TOO_LARGE" }, 413, origin);
  let body: unknown;
  try { body = JSON.parse(bodyText); } catch { return jsonResponse({ error: "REQUEST_INVALID", code: "REQUEST_INVALID" }, 400, origin); }
  if (!isObject(body)) return jsonResponse({ error: "REQUEST_INVALID", code: "REQUEST_INVALID" }, 400, origin);
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const integrationHeaders: Record<string, string> = { Authorization: authorization };
  if (origin) integrationHeaders.Origin = origin;
  try {
    if (!token) fault("AUTH_REQUIRED", 401);
    const client = createSuperdevClient({ appId });
    client.auth.setToken(token);
    let user: Caller;
    try {
      const authenticated = await client.auth.me() as Record<string, unknown>;
      if (typeof authenticated?.id !== "string" || typeof authenticated?.email !== "string") fault("AUTH_REQUIRED", 401);
      user = { id: authenticated.id, email: authenticated.email, role: typeof authenticated.role === "string" ? authenticated.role : "user", full_name: typeof authenticated.full_name === "string" ? authenticated.full_name : "" };
    } catch (error) {
      if (error instanceof ServiceFault) throw error;
      console.warn("Parle marketplace caller authentication failed", error);
      fault("AUTH_REQUIRED", 401);
    }
    return jsonResponse(await dispatch(client, user, body, integrationHeaders), 200, origin);
  } catch (error) {
    if (error instanceof ServiceFault) return jsonResponse({ error: error.code, code: error.code }, error.status, origin);
    if (error instanceof AdminContentReadError) {
      return jsonResponse({ error: error.code, code: error.code, detail: error.detail }, error.status, origin);
    }
    if (error instanceof AdminActionError) return jsonResponse({ error: error.code, code: error.code }, error.status, origin);
    console.error("Parle marketplace service failed", error);
    return jsonResponse({ error: "SERVICE_UNAVAILABLE", code: "SERVICE_UNAVAILABLE" }, 500, origin);
  }
});
