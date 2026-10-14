import {
  safeBookingSettings,
  validateBookableSlot,
  type BookingSchedule,
  type BookableSlot,
} from "./parle-booking-slots.helper.ts";

export type ApplicationStatus = "Draft" | "Submitted" | "In review" | "Approved" | "Needs changes" | "Rejected" | "Suspended";
export type PayoutCountryStatus = "supported" | "waitlist";

export const APPLICATION_STATUSES: ApplicationStatus[] = ["Draft", "Submitted", "In review", "Approved", "Needs changes", "Rejected", "Suspended"];
export const SEED_PAYOUT_COUNTRIES = [
  { country_name: "Canada", country_code: "CA", status: "supported" as const },
  { country_name: "United States", country_code: "US", status: "supported" as const },
  { country_name: "France", country_code: "FR", status: "supported" as const },
  { country_name: "United Kingdom", country_code: "GB", status: "supported" as const },
  { country_name: "Senegal", country_code: "SN", status: "waitlist" as const },
];

export const TUTOR_SPECIALTIES = ["canada_immigration_tef_tcf", "canadian_citizenship", "conversation", "grammar", "business_french", "beginners"] as const;
export const TUTOR_LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
export const TUTOR_STYLES = ["patient", "structured", "conversation_led", "exam_focused", "correction_focused", "confidence_building", "practical_examples"] as const;
export const TUTOR_LANGUAGES = ["English", "French", "Spanish", "Portuguese", "Arabic", "Persian", "Hindi", "Punjabi", "Urdu", "Tagalog", "Mandarin", "Vietnamese", "Ukrainian", "Russian", "Turkish", "Other"] as const;
export const MAX_CERTIFICATE_BYTES = 512 * 1024;
export const MAX_PHOTO_BASE64_CHARS = 512 * 1024;
export const MIN_HOURLY_RATE_CENTS = 1000;
export const MAX_HOURLY_RATE_CENTS = 15000;

export interface CountryRow {
  country_name?: unknown;
  country_code?: unknown;
  status?: unknown;
}

export function isValidIanaTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

/** Accepts a dollar amount with at most two decimal places and returns stored USD cents. */
export function parseHourlyRateCents(value: unknown): number | null {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(raw)) return null;
  const dollars = Number(raw);
  if (!Number.isFinite(dollars) || dollars < 10 || dollars > 150) return null;
  const cents = Math.round(dollars * 100);
  return cents >= MIN_HOURLY_RATE_CENTS && cents <= MAX_HOURLY_RATE_CENTS ? cents : null;
}

export function proratedPriceCents(hourlyRateCents: number, minutes: 30 | 45 | 60): number | null {
  if (!Number.isInteger(hourlyRateCents) || hourlyRateCents < MIN_HOURLY_RATE_CENTS || hourlyRateCents > MAX_HOURLY_RATE_CENTS) return null;
  return Math.round(hourlyRateCents * minutes / 60);
}

function countryToken(value: unknown): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "") : "";
}

/** Unknown countries remain eligible to apply, but are treated as payout waitlist. */
export function resolvePayoutCountryStatus(country: unknown, rows: CountryRow[]): PayoutCountryStatus {
  const token = countryToken(country);
  if (!token) return "waitlist";
  const found = rows.find((row) => countryToken(row.country_name) === token || countryToken(row.country_code) === token);
  return found?.status === "supported" ? "supported" : "waitlist";
}

const transitions: Record<ApplicationStatus, ApplicationStatus[]> = {
  Draft: ["Submitted"],
  Submitted: ["In review"],
  "In review": ["Approved", "Needs changes", "Rejected"],
  Approved: ["Suspended"],
  "Needs changes": ["Submitted"],
  Rejected: [],
  Suspended: [],
};

export function canTransitionApplicationStatus(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return transitions[from].includes(to);
}

function asStatus(value: unknown): ApplicationStatus | null {
  return typeof value === "string" && APPLICATION_STATUSES.includes(value as ApplicationStatus) ? value as ApplicationStatus : null;
}

/** A revised Needs changes application returns to Submitted; approval never comes from tutor-editable fields. */
export function effectiveApplicationStatus(profile: Record<string, unknown> | null, review: Record<string, unknown> | null): ApplicationStatus {
  if (!profile) return "Draft";
  const intent = profile.application_intent === "submitted" ? "submitted" : "draft";
  const reviewStatus = asStatus(review?.status);
  if (!reviewStatus) return intent === "submitted" ? "Submitted" : "Draft";
  if (reviewStatus === "Needs changes" && intent === "submitted") {
    const revision = Number(profile.submission_revision ?? 0);
    const reviewed = Number(review?.reviewed_revision ?? 0);
    if (Number.isFinite(revision) && Number.isFinite(reviewed) && revision > reviewed) return "Submitted";
  }
  return reviewStatus;
}

export function canTutorEditApplication(status: ApplicationStatus): boolean {
  return status === "Draft" || status === "Needs changes";
}

export type TutorApplicationGuidance =
  | "draft"
  | "awaiting_review"
  | "needs_changes"
  | "approved_published"
  | "approved_pending"
  | "rejected"
  | "suspended"
  | "unknown";

export function tutorApplicationGuidance(status: unknown, publicProfilePublished: boolean): TutorApplicationGuidance {
  if (status === "Draft") return "draft";
  if (status === "Submitted" || status === "In review") return "awaiting_review";
  if (status === "Needs changes") return "needs_changes";
  if (status === "Approved") return publicProfilePublished ? "approved_published" : "approved_pending";
  if (status === "Rejected") return "rejected";
  if (status === "Suspended") return "suspended";
  return "unknown";
}

/** Accept only a published public DTO, never private application fields, for learner-facing previews. */
export function isPublishedTutorPublicProfile(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return profile.is_published === true && typeof profile.profile_id === "string" && profile.profile_id.trim().length > 0;
}

/** Tutor preview mode reuses the learner profile design without exposing lesson-request controls. */
export function canRequestTutorLessonFromProfile(mode: "learner" | "tutor-preview"): boolean {
  return mode === "learner";
}

/** Requires an administrator's reviewed profile timestamp to match the current profile. */
export function isReviewSnapshotFresh(currentProfileUpdatedAt: unknown, reviewedProfileUpdatedAt: unknown): boolean {
  return typeof currentProfileUpdatedAt === "string" && currentProfileUpdatedAt.trim().length > 0 &&
    typeof reviewedProfileUpdatedAt === "string" && reviewedProfileUpdatedAt.trim().length > 0 &&
    currentProfileUpdatedAt === reviewedProfileUpdatedAt;
}

function decodeBase64(value: unknown): Uint8Array | null {
  if (typeof value !== "string" || !value || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function isPngSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

function isJpegSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function imageSignatureMatches(mimeType: unknown, bytes: Uint8Array): boolean {
  return mimeType === "image/jpeg" ? isJpegSignature(bytes) : mimeType === "image/png" ? isPngSignature(bytes) : false;
}

function imageDimensions(bytes: Uint8Array, mimeType: string): { width: number; height: number } | null {
  if (mimeType === "image/png" && isPngSignature(bytes) && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mimeType !== "image/jpeg" || !isJpegSignature(bytes)) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    let markerOffset = offset + 1;
    while (markerOffset < bytes.length && bytes[markerOffset] === 0xff) markerOffset += 1;
    const marker = bytes[markerOffset];
    if (marker === undefined) break;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { offset = markerOffset + 1; continue; }
    if (markerOffset + 2 >= bytes.length) break;
    const length = bytes[markerOffset + 1] * 256 + bytes[markerOffset + 2];
    if (length < 2 || markerOffset + length + 1 >= bytes.length) break;
    const isStartOfFrame = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
    if (isStartOfFrame && length >= 7) {
      return { height: bytes[markerOffset + 4] * 256 + bytes[markerOffset + 5], width: bytes[markerOffset + 6] * 256 + bytes[markerOffset + 7] };
    }
    offset = markerOffset + length + 1;
  }
  return null;
}

export function validatePrivatePhotoData(mimeType: unknown, contentBase64: unknown): { valid: boolean; reason: string } {
  if (mimeType !== "image/jpeg" && mimeType !== "image/png") return { valid: false, reason: "PHOTO_MIME" };
  if (typeof contentBase64 !== "string" || contentBase64.length > MAX_PHOTO_BASE64_CHARS) return { valid: false, reason: "PHOTO_SIZE" };
  const bytes = decodeBase64(contentBase64);
  if (!bytes || !imageSignatureMatches(mimeType, bytes)) return { valid: false, reason: "PHOTO_SIGNATURE" };
  const dimensions = imageDimensions(bytes, mimeType);
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 320 || dimensions.height > 320) return { valid: false, reason: "PHOTO_DIMENSIONS" };
  return { valid: true, reason: "" };
}

export interface CertificateInput {
  mime_type?: unknown;
  content_base64?: unknown;
  size_bytes?: unknown;
}

export function validateCertificateFile(input: CertificateInput): { valid: boolean; reason: string } {
  const mimeType = input.mime_type;
  const size = input.size_bytes;
  if (mimeType !== "application/pdf" && mimeType !== "image/jpeg" && mimeType !== "image/png") return { valid: false, reason: "FILE_MIME" };
  if (!Number.isInteger(size) || Number(size) < 1 || Number(size) > MAX_CERTIFICATE_BYTES) return { valid: false, reason: "FILE_SIZE" };
  const bytes = decodeBase64(input.content_base64);
  if (!bytes || bytes.length !== Number(size)) return { valid: false, reason: "FILE_ENCODING" };
  const signatureOkay = mimeType === "application/pdf"
    ? bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d
    : imageSignatureMatches(mimeType, bytes);
  return signatureOkay ? { valid: true, reason: "" } : { valid: false, reason: "FILE_SIGNATURE" };
}

export interface PrivateDocumentRow {
  id?: unknown;
  profile_id?: unknown;
}

export function documentBelongsToProfile(documentId: unknown, profileId: unknown, documents: PrivateDocumentRow[]): boolean {
  return typeof documentId === "string" && typeof profileId === "string" && documents.some((doc) => doc.id === documentId && doc.profile_id === profileId);
}

export function verifiedDocumentIds(documentIds: unknown, profileId: string, documents: PrivateDocumentRow[]): string[] {
  if (!Array.isArray(documentIds)) return [];
  const allowed = new Set(documents.filter((doc) => doc.profile_id === profileId && typeof doc.id === "string").map((doc) => doc.id as string));
  return [...new Set(documentIds.filter((id): id is string => typeof id === "string" && allowed.has(id)))];
}

export function isValidLocalTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function validateAvailabilityRule(rule: { day_of_week?: unknown; start_local?: unknown; end_local?: unknown; time_zone?: unknown }): boolean {
  return Number.isInteger(rule.day_of_week) && Number(rule.day_of_week) >= 1 && Number(rule.day_of_week) <= 7 &&
    isValidLocalTime(rule.start_local) && isValidLocalTime(rule.end_local) && String(rule.start_local) < String(rule.end_local) &&
    isValidIanaTimeZone(rule.time_zone);
}

function validCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateAvailabilityException(exception: { date_local?: unknown; kind?: unknown; start_local?: unknown; end_local?: unknown; time_zone?: unknown }): boolean {
  if (!validCalendarDate(exception.date_local) || (exception.kind !== "off" && exception.kind !== "extra") || !isValidIanaTimeZone(exception.time_zone)) return false;
  if (exception.kind === "off") return (exception.start_local === "" || exception.start_local === undefined) && (exception.end_local === "" || exception.end_local === undefined);
  return isValidLocalTime(exception.start_local) && isValidLocalTime(exception.end_local) && String(exception.start_local) < String(exception.end_local);
}

export function validIntroVideoUrl(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.protocol === "https:" && ["youtube.com", "m.youtube.com", "youtu.be", "vimeo.com", "player.vimeo.com"].includes(host) && url.pathname.length > 1;
  } catch { return false; }
}

export function validMeetingUrl(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    const supported = host === "meet.google.com" || host === "zoom.us" || host.endsWith(".zoom.us");
    return url.protocol === "https:" && supported && url.pathname.length > 1;
  } catch { return false; }
}

export function validateTutorProfileForSubmission(profile: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const text = (key: string, max: number) => typeof profile[key] === "string" && (profile[key] as string).trim().length > 0 && (profile[key] as string).trim().length <= max;
  if (!text("display_name", 80)) errors.push("DISPLAY_NAME_REQUIRED");
  if (!text("headline", 140)) errors.push("HEADLINE_REQUIRED");
  if (!text("bio", 2000)) errors.push("BIO_REQUIRED");
  if (!text("country", 100)) errors.push("COUNTRY_REQUIRED");
  if (!isValidIanaTimeZone(profile.time_zone)) errors.push("TIME_ZONE_INVALID");
  if (!Array.isArray(profile.spoken_languages) || profile.spoken_languages.length < 1 || profile.spoken_languages.some((item) => typeof item !== "string" || !TUTOR_LANGUAGES.includes(item as typeof TUTOR_LANGUAGES[number]))) errors.push("LANGUAGES_REQUIRED");
  if (!Number.isInteger(profile.years_teaching) || Number(profile.years_teaching) < 0 || Number(profile.years_teaching) > 60) errors.push("YEARS_INVALID");
  if (!Array.isArray(profile.specialties) || profile.specialties.length < 1 || profile.specialties.some((item) => typeof item !== "string" || !TUTOR_SPECIALTIES.includes(item as typeof TUTOR_SPECIALTIES[number]))) errors.push("SPECIALTIES_REQUIRED");
  if (!Array.isArray(profile.levels_taught) || profile.levels_taught.length < 1 || profile.levels_taught.some((item) => typeof item !== "string" || !TUTOR_LEVELS.includes(item as typeof TUTOR_LEVELS[number]))) errors.push("LEVELS_REQUIRED");
  if (!Array.isArray(profile.teaching_styles) || profile.teaching_styles.length < 1 || profile.teaching_styles.some((item) => typeof item !== "string" || !TUTOR_STYLES.includes(item as typeof TUTOR_STYLES[number]))) errors.push("STYLES_REQUIRED");
  const rate = Number(profile.hourly_rate_cents);
  if (!Number.isInteger(rate) || rate < MIN_HOURLY_RATE_CENTS || rate > MAX_HOURLY_RATE_CENTS) errors.push("RATE_INVALID");
  const video = typeof profile.intro_video_url === "string" ? profile.intro_video_url.trim() : "";
  if (video && (!validIntroVideoUrl(video) || profile.intro_video_unlisted_confirmed !== true)) errors.push("VIDEO_INVALID");
  if (!validMeetingUrl(profile.meeting_link)) errors.push("MEETING_LINK_INVALID");
  if (profile.agreement_accepted !== true) errors.push("AGREEMENT_REQUIRED");
  if (profile.photo_base64 || profile.photo_mime_type) {
    const photoValidation = validatePrivatePhotoData(profile.photo_mime_type, profile.photo_base64);
    if (!photoValidation.valid) errors.push("PHOTO_INVALID");
  }
  return errors;
}

export const APPROVED_PUBLIC_PROFILE_EDIT_FIELDS = [
  "headline",
  "bio",
  "spoken_languages",
  "teaching_styles",
  "hourly_rate_cents",
  "intro_video_url",
  "intro_video_unlisted_confirmed",
  "meeting_link",
] as const;

export const APPROVED_PUBLIC_PROFILE_CONTENT_FIELDS = [
  "headline",
  "bio",
  "spoken_languages",
  "teaching_styles",
  "hourly_rate_cents",
  "intro_video_url",
] as const;

export interface ApprovedPublicProfileEdits {
  headline: string;
  bio: string;
  spoken_languages: string[];
  teaching_styles: string[];
  hourly_rate_cents: number;
  intro_video_url: string;
  intro_video_unlisted_confirmed: boolean;
  meeting_link: string;
}

export type ApprovedPublicProfileContent = Pick<ApprovedPublicProfileEdits, typeof APPROVED_PUBLIC_PROFILE_CONTENT_FIELDS[number]>;
export type ApprovedPublicProfileEditValidation =
  | { ok: true; values: ApprovedPublicProfileEdits }
  | { ok: false; code: string };

function approvedEditText(value: unknown, maximum: number, multiline = false): string | null {
  if (typeof value !== "string") return null;
  const controls = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g;
  const cleaned = value.replace(/\r\n?/g, "\n").replace(controls, "");
  const normalized = (multiline ? cleaned : cleaned.replace(/\s+/g, " ")).trim();
  return normalized.length <= maximum ? normalized : null;
}

/** Validate a complete approved-profile edit and reject every field outside its explicit allowlist. */
export function validateApprovedPublicProfileEdits(input: unknown): ApprovedPublicProfileEditValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, code: "PROFILE_EDIT_INVALID" };
  const source = input as Record<string, unknown>;
  if (Object.keys(source).some((key) => !APPROVED_PUBLIC_PROFILE_EDIT_FIELDS.includes(key as typeof APPROVED_PUBLIC_PROFILE_EDIT_FIELDS[number]))) {
    return { ok: false, code: "PROFILE_EDIT_FIELD_NOT_ALLOWED" };
  }
  if (APPROVED_PUBLIC_PROFILE_EDIT_FIELDS.some((key) => !Object.prototype.hasOwnProperty.call(source, key))) {
    return { ok: false, code: "PROFILE_EDIT_INVALID" };
  }

  const headline = approvedEditText(source.headline, 140);
  if (!headline) return { ok: false, code: "HEADLINE_REQUIRED" };
  const bio = approvedEditText(source.bio, 2000, true);
  if (!bio) return { ok: false, code: "BIO_REQUIRED" };
  if (!Array.isArray(source.spoken_languages) || source.spoken_languages.length < 1 || source.spoken_languages.length > TUTOR_LANGUAGES.length || source.spoken_languages.some((item) => typeof item !== "string" || !TUTOR_LANGUAGES.includes(item as typeof TUTOR_LANGUAGES[number]))) {
    return { ok: false, code: "LANGUAGES_REQUIRED" };
  }
  if (!Array.isArray(source.teaching_styles) || source.teaching_styles.length < 1 || source.teaching_styles.length > TUTOR_STYLES.length || source.teaching_styles.some((item) => typeof item !== "string" || !TUTOR_STYLES.includes(item as typeof TUTOR_STYLES[number]))) {
    return { ok: false, code: "STYLES_REQUIRED" };
  }
  const hourlyRate = source.hourly_rate_cents;
  if (!Number.isInteger(hourlyRate) || Number(hourlyRate) < MIN_HOURLY_RATE_CENTS || Number(hourlyRate) > MAX_HOURLY_RATE_CENTS) {
    return { ok: false, code: "RATE_INVALID" };
  }
  const introVideoUrl = approvedEditText(source.intro_video_url, 500);
  if (introVideoUrl === null || (introVideoUrl && (!validIntroVideoUrl(introVideoUrl) || source.intro_video_unlisted_confirmed !== true))) {
    return { ok: false, code: "VIDEO_INVALID" };
  }
  if (typeof source.intro_video_unlisted_confirmed !== "boolean") return { ok: false, code: "VIDEO_INVALID" };
  const meetingLink = approvedEditText(source.meeting_link, 500);
  if (!meetingLink || !validMeetingUrl(meetingLink)) return { ok: false, code: "MEETING_LINK_INVALID" };

  return {
    ok: true,
    values: {
      headline,
      bio,
      spoken_languages: [...new Set(source.spoken_languages as string[])],
      teaching_styles: [...new Set(source.teaching_styles as string[])],
      hourly_rate_cents: Number(hourlyRate),
      intro_video_url: introVideoUrl,
      intro_video_unlisted_confirmed: source.intro_video_unlisted_confirmed,
      meeting_link: meetingLink,
    },
  };
}

const APPROVED_EDIT_ROW_METADATA = new Set(["id", "profile_id", "user_id", "created_by", "created_at", "updated_at"]);

/** Accept an edit row only when its owner bindings match and it contains no extra fields. */
export function approvedPublicProfileEditsFromRow(
  row: unknown,
  profileId: string,
  userId: string,
  email: string,
): ApprovedPublicProfileEdits | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const source = row as Record<string, unknown>;
  if (source.profile_id !== profileId || source.user_id !== userId || source.created_by !== email) return null;
  if (Object.keys(source).some((key) => !APPROVED_EDIT_ROW_METADATA.has(key) && !APPROVED_PUBLIC_PROFILE_EDIT_FIELDS.includes(key as typeof APPROVED_PUBLIC_PROFILE_EDIT_FIELDS[number]))) return null;
  const candidate = Object.fromEntries(APPROVED_PUBLIC_PROFILE_EDIT_FIELDS.map((key) => [key, source[key]]));
  const validation = validateApprovedPublicProfileEdits(candidate);
  return validation.ok ? validation.values : null;
}

/** Build the exact tutor-editable row payload without any application or review status fields. */
export function approvedPublicProfileEditRecord(
  profileId: string,
  userId: string,
  input: unknown,
): Record<string, unknown> | null {
  if (!profileId || !userId) return null;
  const validation = validateApprovedPublicProfileEdits(input);
  return validation.ok ? { profile_id: profileId, user_id: userId, ...validation.values } : null;
}

/** Preserve the administrator-reviewed base while applying only the approved editable fields. */
export function mergeApprovedPublicProfileEdits(
  profile: Record<string, unknown>,
  edits: unknown,
): Record<string, unknown> {
  const validation = validateApprovedPublicProfileEdits(edits);
  if (!validation.ok) return { ...profile };
  return { ...profile, ...validation.values };
}

/** Content fields safe for learner snapshots; private meeting and confirmation fields are omitted. */
export function approvedPublicProfileContent(edits: unknown): ApprovedPublicProfileContent | null {
  const validation = validateApprovedPublicProfileEdits(edits);
  if (!validation.ok) return null;
  return {
    headline: validation.values.headline,
    bio: validation.values.bio,
    spoken_languages: validation.values.spoken_languages,
    teaching_styles: validation.values.teaching_styles,
    hourly_rate_cents: validation.values.hourly_rate_cents,
    intro_video_url: validation.values.intro_video_url,
  };
}

/** Return an idempotent allowlisted patch for a previously published listing, or null for invalid edits. */
export function approvedPublicContentRefreshPatch(
  listing: Record<string, unknown>,
  edits: unknown,
): Partial<ApprovedPublicProfileContent> | null {
  if (listing.is_published !== true) return null;
  const content = approvedPublicProfileContent(edits);
  if (!content) return null;
  const patch: Partial<ApprovedPublicProfileContent> = {};
  for (const field of APPROVED_PUBLIC_PROFILE_CONTENT_FIELDS) {
    const current = listing[field];
    const next = content[field];
    if (Array.isArray(next) ? JSON.stringify(current) !== JSON.stringify(next) : current !== next) {
      (patch as Record<string, unknown>)[field] = next;
    }
  }
  return patch;
}

/** Approved edits never change the application status or the admin-reviewed profile timestamp. */
export function approvedProfileEditEligibility(profile: Record<string, unknown>, review: Record<string, unknown> | null): string | null {
  if (profile.application_intent !== "submitted" || effectiveApplicationStatus(profile, review) !== "Approved") return "APPLICATION_NOT_APPROVED";
  if (!isReviewSnapshotFresh(profile.updated_at, review?.reviewed_profile_updated_at)) return "APPLICATION_CHANGED";
  return null;
}

export type ApprovedPublicProfileSaveState = "unpublished" | "refresh_pending" | "current";

export function approvedPublicProfileSaveState(published: unknown, refreshPending: unknown): ApprovedPublicProfileSaveState {
  if (published !== true) return "unpublished";
  return refreshPending === true ? "refresh_pending" : "current";
}

export function isOwnApprovedTutorListing(input: {
  profile: Record<string, unknown>;
  review: Record<string, unknown> | null;
  listing: Record<string, unknown>;
  userId: string;
  email: string;
}): boolean {
  const { profile, review, listing, userId, email } = input;
  return typeof profile.id === "string" && profile.user_id === userId && profile.created_by === email && profile.application_intent === "submitted" &&
    Boolean(review) && review?.profile_id === profile.id && review?.tutor_email === email && effectiveApplicationStatus(profile, review) === "Approved" &&
    isReviewSnapshotFresh(profile.updated_at, review?.reviewed_profile_updated_at) && listing.profile_id === profile.id &&
    listing.tutor_user_id === userId && listing.is_published === true;
}

function publicText(value: unknown, maximum: number, multiline = false): string {
  if (typeof value !== "string") return "";
  const controls = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g;
  const cleaned = value.replace(/\r\n?/g, "\n").replace(controls, "");
  return (multiline ? cleaned : cleaned.replace(/\s+/g, " ")).trim().slice(0, maximum);
}

function publicKnownStrings(value: unknown, allowed: readonly string[], maximum: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && allowed.includes(item)))].slice(0, maximum);
}

/** Builds the shared safe learner/tutor-preview DTO content without account or private application fields. */
export function safePublicTutorProfileFields(row: Record<string, unknown>): Record<string, unknown> {
  const photo = validatePrivatePhotoData(row.photo_mime_type, row.photo_base64);
  const hourly = row.hourly_rate_cents;
  const certificateLabels = Array.isArray(row.verified_certificate_labels)
    ? [...new Set(row.verified_certificate_labels.filter((label): label is string => typeof label === "string").map((label) => publicText(label, 80)).filter(Boolean))].slice(0, 30)
    : [];
  return {
    profile_id: typeof row.profile_id === "string" ? row.profile_id : "",
    display_name: publicText(row.display_name, 80),
    headline: publicText(row.headline, 140),
    bio: publicText(row.bio, 2000, true),
    photo_base64: photo.valid ? row.photo_base64 : "",
    photo_mime_type: photo.valid ? row.photo_mime_type : "",
    specialties: publicKnownStrings(row.specialties, TUTOR_SPECIALTIES, TUTOR_SPECIALTIES.length),
    levels_taught: publicKnownStrings(row.levels_taught, TUTOR_LEVELS, TUTOR_LEVELS.length),
    spoken_languages: publicKnownStrings(row.spoken_languages, TUTOR_LANGUAGES, TUTOR_LANGUAGES.length),
    teaching_styles: publicKnownStrings(row.teaching_styles, TUTOR_STYLES, TUTOR_STYLES.length),
    hourly_rate_cents: Number.isInteger(hourly) && Number(hourly) >= MIN_HOURLY_RATE_CENTS && Number(hourly) <= MAX_HOURLY_RATE_CENTS ? Number(hourly) : 0,
    intro_video_url: typeof row.intro_video_url === "string" && validIntroVideoUrl(row.intro_video_url) ? row.intro_video_url : "",
    verified_certificate_labels: certificateLabels,
  };
}

export const LEARNER_TUTOR_WINDOW_VALUES = [
  "weekday_morning", "weekday_afternoon", "weekday_evening",
  "weekend_morning", "weekend_afternoon", "weekend_evening",
] as const;

export interface PublicReviewSnapshot {
  id: string;
  stars: number;
  comment: string;
  is_test_review: boolean;
  learner_label: string;
  tutor_reply: string;
}

/** Copies only safe tutor-local hours into the published projection. */
export function safePublicAvailability(
  rules: readonly Record<string, unknown>[],
  exceptions: readonly Record<string, unknown>[],
): { rules: Record<string, unknown>[]; exceptions: Record<string, unknown>[] } {
  const safeRules = rules.flatMap((row) => {
    const candidate = { day_of_week: row.day_of_week, start_local: row.start_local, end_local: row.end_local, time_zone: row.time_zone };
    return validateAvailabilityRule(candidate) ? [candidate] : [];
  });
  const safeExceptions = exceptions.flatMap((row) => {
    const candidate = {
      date_local: row.date_local,
      kind: row.kind,
      start_local: row.kind === "off" ? "" : row.start_local,
      end_local: row.kind === "off" ? "" : row.end_local,
      time_zone: row.time_zone,
    };
    return validateAvailabilityException(candidate) ? [candidate] : [];
  });
  return { rules: safeRules, exceptions: safeExceptions };
}

/** Allowlisted public booking projection. It contains schedule, safe settings, and accepted UTC intervals only. */
export function safePublicBookingProjection(
  rules: readonly Record<string, unknown>[],
  exceptions: readonly Record<string, unknown>[],
  settings: unknown,
  busyIntervals: readonly Record<string, unknown>[],
  now = Date.now(),
): Record<string, unknown> {
  const availability = safePublicAvailability(rules, exceptions);
  const nowMs = Number.isFinite(now) ? now : Date.now();
  const windowEnd = nowMs + 30 * 24 * 60 * 60 * 1000;
  const busy = busyIntervals.flatMap((item) => {
    const start = Date.parse(String(item.start_utc ?? item.start_time_utc ?? ""));
    const end = Date.parse(String(item.end_utc ?? item.end_time_utc ?? ""));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end <= nowMs || start >= windowEnd) return [];
    return [{ start_utc: new Date(start).toISOString(), end_utc: new Date(end).toISOString() }];
  }).slice(0, 1000);
  return {
    ...availability,
    settings: safeBookingSettings(settings),
    busy_intervals: busy,
  };
}

function earliestFirst(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const leftTime = typeof left.created_at === "string" ? Date.parse(left.created_at) : Number.POSITIVE_INFINITY;
  const rightTime = typeof right.created_at === "string" ? Date.parse(right.created_at) : Number.POSITIVE_INFINITY;
  return leftTime - rightTime || String(left.id ?? "").localeCompare(String(right.id ?? ""));
}

/** Returns visible, allowlisted reviews and the earliest valid tutor reply for each one. */
export function publicReviewSnapshot(
  reviewRows: readonly Record<string, unknown>[],
  replyRows: readonly Record<string, unknown>[],
  profileId: string,
  tutorEmail: string,
): { reviews: PublicReviewSnapshot[]; ratingSummary: { average: number; count: number } | null } {
  const visible = reviewRows
    .filter((row) => row.profile_id === profileId && row.tutor_email === tutorEmail && row.is_visible !== false && Number.isInteger(row.stars) && Number(row.stars) >= 1 && Number(row.stars) <= 5 && typeof row.id === "string")
    .slice()
    .sort((a, b) => earliestFirst(b, a));
  const safeReviews = visible.map((row) => {
    const isTest = row.is_test_review === true;
    const validReplies = replyRows
      .filter((reply) => reply.profile_id === profileId && reply.tutor_email === tutorEmail && reply.review_id === row.id && reply.created_by === tutorEmail && typeof reply.reply_text === "string" && reply.reply_text.trim().length > 0 && reply.reply_text.length <= 1200)
      .slice()
      .sort(earliestFirst);
    return {
      id: String(row.id),
      stars: Number(row.stars),
      comment: typeof row.comment === "string" ? row.comment.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 700) : "",
      is_test_review: isTest,
      learner_label: isTest ? "Demo learner" : "Learner",
      tutor_reply: validReplies[0] ? String(validReplies[0].reply_text).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 1200) : "",
    };
  });
  if (safeReviews.length < 3) return { reviews: safeReviews, ratingSummary: null };
  const average = Math.round((safeReviews.reduce((sum, review) => sum + review.stars, 0) / safeReviews.length) * 10) / 10;
  return { reviews: safeReviews, ratingSummary: { average, count: safeReviews.length } };
}

export type LearnerBookingRequestFailureCode =
  | "TUTOR_NOT_ACCEPTING"
  | "TUTOR_LISTING_STALE"
  | "BOOKING_SLOT_INVALID"
  | "BOOKING_NOTICE_TOO_SHORT";

export type LearnerBookingRequestResult =
  | { ok: true; slot: BookableSlot; booking: Record<string, unknown> }
  | { ok: false; code: LearnerBookingRequestFailureCode };

/** Production validation and persistence seam shared with the request regression test. */
export async function validateAndPersistLearnerBookingRequest(
  input: {
    isPublished: boolean;
    acceptingRequests?: boolean;
    tutorProfileId: string;
    tutorUserId: unknown;
    tutorDisplayName: string;
    learnerUserId: string;
    learnerFirstName: string;
    startTimeUtc: unknown;
    durationMinutes: unknown;
    learnerMessage: string;
    schedule: BookingSchedule | null | undefined;
    now?: Date | number | string;
  },
  persist: (record: Record<string, unknown>) => Promise<Record<string, unknown>>,
): Promise<LearnerBookingRequestResult> {
  const reject = (code: LearnerBookingRequestFailureCode): LearnerBookingRequestResult => ({ ok: false, code });
  if (!input.isPublished || input.acceptingRequests === false) return reject("TUTOR_NOT_ACCEPTING");
  const tutorUserId = typeof input.tutorUserId === "string" ? input.tutorUserId.trim() : "";
  if (!tutorUserId) return reject("TUTOR_LISTING_STALE");

  const startUtc = typeof input.startTimeUtc === "string" ? input.startTimeUtc : "";
  const durationMinutes = typeof input.durationMinutes === "number" ? input.durationMinutes : Number.NaN;
  const validation = validateBookableSlot(input.schedule, startUtc, durationMinutes, { now: input.now, windowDays: 30 });
  if (validation.status === "not_accepting") return reject("TUTOR_NOT_ACCEPTING");
  if (validation.status === "notice_too_short") return reject("BOOKING_NOTICE_TOO_SHORT");
  if (validation.status === "not_offered") return reject("BOOKING_SLOT_INVALID");

  const booking = await persist({
    tutor_profile_id: input.tutorProfileId,
    tutor_user_id: tutorUserId,
    tutor_display_name: input.tutorDisplayName,
    learner_user_id: input.learnerUserId,
    learner_first_name: input.learnerFirstName,
    start_time_utc: validation.slot.startUtc,
    end_time_utc: validation.slot.endUtc,
    duration_minutes: validation.slot.durationMinutes,
    learner_message: input.learnerMessage,
    status: "requested",
    decision_message: "none",
    decision_at_utc: "",
  });
  return { ok: true, slot: validation.slot, booking };
}
