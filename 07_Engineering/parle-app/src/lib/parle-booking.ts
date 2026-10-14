import { parleMarketplaceService } from "@/functions";

export type BookingStatus = "requested" | "confirmed" | "declined";
export type BookingDecision = "none" | "accepted" | "declined_by_tutor" | "slot_taken" | "another_request_accepted";
export type BookingOutcome = "accepted" | "declined" | "slot_taken";

export interface ParleBooking {
  id: string;
  tutor_profile_id: string;
  tutor_display_name: string;
  learner_first_name: string;
  start_time_utc: string;
  end_time_utc: string;
  duration_minutes: 30 | 45 | 60;
  learner_message: string;
  status: BookingStatus;
  decision_message: BookingDecision;
  decision_at_utc: string;
}

export interface BookingListResult {
  bookings: ParleBooking[];
  timeZone: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unwrap(value: unknown): Record<string, unknown> {
  let current: unknown = value;
  for (let index = 0; index < 5; index += 1) {
    if (!isObject(current)) break;
    if (isObject(current.result)) { current = current.result; continue; }
    if (isObject(current.data) && ("status" in current.data || "error" in current.data)) { current = current.data; continue; }
    break;
  }
  return isObject(current) ? current : {};
}

const BOOKING_REQUEST_ERROR_CODES = [
  "BOOKING_SLOT_INVALID",
  "BOOKING_NOTICE_TOO_SHORT",
  "TUTOR_NOT_ACCEPTING",
  "TUTOR_LISTING_STALE",
  "TUTOR_NOT_AVAILABLE",
  "BOOKING_SAVE_FAILED",
] as const;

function codeFromErrorText(value: string): string | null {
  const text = value.trim();
  if ((BOOKING_REQUEST_ERROR_CODES as readonly string[]).includes(text)) return text;
  return BOOKING_REQUEST_ERROR_CODES.find((code) => new RegExp(`\\b${code}\\b`).test(text)) ?? null;
}

/** Reads stable booking codes from resolved bodies and common HTTP SDK error shapes. */
export function extractBookingRequestErrorCode(value: unknown): string | null {
  const seen = new Set<object>();
  const visit = (candidate: unknown, depth: number): string | null => {
    if (depth > 8 || candidate === null || candidate === undefined) return null;
    if (typeof candidate === "string") {
      const code = codeFromErrorText(candidate);
      if (code) return code;
      const trimmed = candidate.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try { return visit(JSON.parse(trimmed), depth + 1); } catch { return null; }
      }
      return null;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const code = visit(item, depth + 1);
        if (code) return code;
      }
      return null;
    }
    if (!isObject(candidate) || seen.has(candidate)) return null;
    seen.add(candidate);
    const record = candidate as Record<string, unknown>;
    for (const key of ["code", "error_code", "errorCode", "error", "data", "result", "response", "body", "details", "payload", "cause", "message"]) {
      if (!(key in record)) continue;
      const code = visit(record[key], depth + 1);
      if (code) return code;
    }
    return null;
  };
  return visit(value, 0);
}

export function bookingRequestErrorCode(error: unknown): string {
  return extractBookingRequestErrorCode(error) ?? (error instanceof Error ? error.message : "REQUEST_FAILED");
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength)
    : "";
}

function safeTimeZone(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.trim() });
    return value.trim();
  } catch {
    return "UTC";
  }
}

export function safeBooking(value: unknown): ParleBooking | null {
  if (!isObject(value) || typeof value.id !== "string" || !value.id) return null;
  if (value.status !== "requested" && value.status !== "confirmed" && value.status !== "declined") return null;
  const duration = value.duration_minutes;
  if (typeof duration !== "number" || ![30, 45, 60].includes(duration)) return null;
  const startMs = Date.parse(typeof value.start_time_utc === "string" ? value.start_time_utc : "");
  const endMs = Date.parse(typeof value.end_time_utc === "string" ? value.end_time_utc : "");
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs - startMs !== duration * 60_000) return null;
  const decisions: BookingDecision[] = ["none", "accepted", "declined_by_tutor", "slot_taken", "another_request_accepted"];
  const decision = typeof value.decision_message === "string" && decisions.includes(value.decision_message as BookingDecision)
    ? value.decision_message as BookingDecision
    : "none";
  const decisionAt = typeof value.decision_at_utc === "string" && Number.isFinite(Date.parse(value.decision_at_utc))
    ? new Date(Date.parse(value.decision_at_utc)).toISOString()
    : "";
  return {
    id: value.id,
    tutor_profile_id: cleanText(value.tutor_profile_id, 128),
    tutor_display_name: cleanText(value.tutor_display_name, 80),
    learner_first_name: cleanText(value.learner_first_name, 48),
    start_time_utc: new Date(startMs).toISOString(),
    end_time_utc: new Date(endMs).toISOString(),
    duration_minutes: duration as 30 | 45 | 60,
    learner_message: cleanText(value.learner_message, 1000),
    status: value.status,
    decision_message: decision,
    decision_at_utc: decisionAt,
  };
}

async function marketplace(action: string, values: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  let rawResponse: unknown;
  try {
    rawResponse = await parleMarketplaceService({ action, ...values });
  } catch (error) {
    throw new Error(extractBookingRequestErrorCode(error) ?? "REQUEST_FAILED");
  }
  const response = unwrap(rawResponse);
  const code = extractBookingRequestErrorCode(rawResponse) ?? extractBookingRequestErrorCode(response);
  const statusCode = Number(response.status_code ?? response.status);
  const isError = response.status === "error" || response.success === false || response.ok === false ||
    (Number.isFinite(statusCode) && statusCode >= 400) || Boolean(response.error);
  if (isError || code) throw new Error(code ?? "REQUEST_FAILED");
  return response;
}

function bookingsFrom(value: unknown): ParleBooking[] {
  return Array.isArray(value)
    ? value.map(safeBooking).filter((booking): booking is ParleBooking => booking !== null)
    : [];
}

export async function loadLearnerBookings(): Promise<BookingListResult> {
  const result = await marketplace("learner_list_bookings");
  return { bookings: bookingsFrom(result.bookings), timeZone: safeTimeZone(result.time_zone) };
}

export async function loadTutorBookings(): Promise<BookingListResult> {
  const result = await marketplace("tutor_list_bookings");
  return { bookings: bookingsFrom(result.bookings), timeZone: safeTimeZone(result.time_zone) };
}

export async function requestTutorLesson(input: {
  tutorProfileId: string;
  startTimeUtc: string;
  durationMinutes: number;
  message: string;
}): Promise<ParleBooking> {
  const result = await marketplace("learner_request_booking", {
    tutor_profile_id: input.tutorProfileId,
    start_time_utc: input.startTimeUtc,
    duration_minutes: input.durationMinutes,
    message: input.message,
  });
  const booking = safeBooking(result.booking);
  if (!booking) throw new Error("BOOKING_SAVE_FAILED");
  return booking;
}

export async function decideTutorLesson(bookingId: string, decision: "accept" | "decline"): Promise<{
  booking: ParleBooking;
  outcome: BookingOutcome;
  declinedPendingCount: number;
}> {
  const result = await marketplace("tutor_decide_booking", { booking_id: bookingId, decision });
  const booking = safeBooking(result.booking);
  if (!booking || (result.outcome !== "accepted" && result.outcome !== "declined" && result.outcome !== "slot_taken")) {
    throw new Error("BOOKING_SAVE_FAILED");
  }
  return {
    booking,
    outcome: result.outcome,
    declinedPendingCount: Number.isInteger(result.declined_pending_count) ? Number(result.declined_pending_count) : 0,
  };
}

export function dateKeyInTimeZone(value: string, timeZone: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: safeTimeZone(timeZone),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${fields.year}-${fields.month}-${fields.day}`;
  } catch {
    return "";
  }
}

export function formatLessonTime(startUtc: string, endUtc: string, timeZone: string): string {
  const start = new Date(startUtc);
  const end = new Date(endUtc);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return "";
  try {
    const zone = safeTimeZone(timeZone);
    const date = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: zone });
    const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: zone });
    const startDate = date.format(start);
    const endDate = date.format(end);
    const startTime = time.format(start);
    const endTime = time.format(end);
    return startDate === endDate
      ? `${startDate} · ${startTime} – ${endTime}`
      : `${startDate} · ${startTime} – ${endDate} · ${endTime}`;
  } catch {
    return "";
  }
}

export function formatLocalDateLabel(utcInstant: string, timeZone: string): string {
  const date = new Date(utcInstant);
  if (!Number.isFinite(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: safeTimeZone(timeZone) }).format(date);
  } catch {
    return "";
  }
}
