import { parleLessonService } from "@/functions";
import type { TranslationKey } from "@/lib/i18n";
import { lessonPriceCents } from "../../functions/parle-booking-slots.helper.ts";

export type LessonStatus = "pending_payment" | "confirmed" | "expired" | "cancelled_learner" | "cancelled_tutor" | "completed" | "learner_no_show" | "disputed";
export type LessonSkill = "listening" | "reading" | "writing" | "speaking";
export type NoteLevel = "struggling" | "ok" | "strong";
export const LESSON_SKILLS: LessonSkill[] = ["listening", "reading", "writing", "speaking"];

export interface LessonNotes { skills: Partial<Record<LessonSkill, NoteLevel>>; notes: string; homework: string }
export interface ParleLesson {
  id: string; tutor_profile_id: string; tutor_name: string; learner_name: string; start_at: string; end_at: string;
  minutes: 30 | 45 | 60; price_cents: number; status: LessonStatus; learner_message: string; meeting_link: string;
  reschedule_count: number; hold_expires_at: string | null; cancelled_by: string | null; late_cancel: boolean;
  dispute_kind: string | null; can_cancel: boolean; cancel_refund_cents: number; can_reschedule: boolean;
  can_mark_attendance: boolean; can_report: boolean; can_review: boolean; review_stars: number | null;
  notes: LessonNotes | null; can_write_notes: boolean; has_brief: boolean;
}
export type ParleBooking = ParleLesson;
export interface LessonList { lessons: ParleLesson[]; timeZone: string }
export interface BookingOptions {
  canBook: boolean; reason: string | null; timeZone: string; busyIntervals: Array<{ start_utc: string; end_utc: string }>;
  offeredLengths: Array<30 | 45 | 60>; prices: Record<string, number>; minimumNoticeHours: number; horizonDays: number; holdMinutes: number;
}
export interface LessonBrief {
  learner_name: string; goal: string; track: string; levels: Partial<Record<LessonSkill, number | null>>;
  latest_checkin: { date: string; note: string } | null;
  recent_mistakes: Array<{ area: string; original: string; corrected: string }>;
  earlier_notes: Array<{ date: string; skills: Partial<Record<LessonSkill, NoteLevel>>; notes: string; homework: string }>;
  learner_message: string;
}
export interface TutorStudent { learner_id: string; name: string; lessons: number; last_lesson_at: string | null; next_lesson_at: string | null; latest_notes: (LessonNotes & { date: string }) | null }
export interface DisputedLesson { id: string; start_at: string; tutor_name: string; learner_name: string; dispute_kind: string; dispute_details: string; disputed_at: string; disputed_from: string; price_cents: number }
export interface FlaggedTutor { tutor_id: string; name: string; cancellations: number }

const STATUSES: LessonStatus[] = ["pending_payment", "confirmed", "expired", "cancelled_learner", "cancelled_tutor", "completed", "learner_no_show", "disputed"];
function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
const str = (value: unknown, max = 2000) => (typeof value === "string" ? value.slice(0, max) : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

function safeTimeZone(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.trim() });
    return value.trim();
  } catch {
    return "UTC";
  }
}

function safeNotes(value: unknown): LessonNotes | null {
  if (!isObject(value)) return null;
  const raw = isObject(value.skills) ? value.skills : {};
  const skills: Partial<Record<LessonSkill, NoteLevel>> = {};
  for (const skill of LESSON_SKILLS) {
    const level = raw[skill];
    if (level === "struggling" || level === "ok" || level === "strong") skills[skill] = level;
  }
  return { skills, notes: str(value.notes), homework: str(value.homework, 1000) };
}

export function safeLesson(value: unknown): ParleLesson | null {
  if (!isObject(value) || typeof value.id !== "string" || !value.id) return null;
  if (!STATUSES.includes(value.status as LessonStatus)) return null;
  const minutes = value.minutes;
  if (minutes !== 30 && minutes !== 45 && minutes !== 60) return null;
  const start = Date.parse(str(value.start_at)), end = Date.parse(str(value.end_at));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return {
    id: value.id, tutor_profile_id: str(value.tutor_profile_id, 128), tutor_name: str(value.tutor_name, 80), learner_name: str(value.learner_name, 80),
    start_at: new Date(start).toISOString(), end_at: new Date(end).toISOString(), minutes, price_cents: num(value.price_cents),
    status: value.status as LessonStatus, learner_message: str(value.learner_message, 1000), meeting_link: str(value.meeting_link, 500),
    reschedule_count: num(value.reschedule_count), hold_expires_at: typeof value.hold_expires_at === "string" ? value.hold_expires_at : null,
    cancelled_by: typeof value.cancelled_by === "string" ? value.cancelled_by : null, late_cancel: value.late_cancel === true,
    dispute_kind: typeof value.dispute_kind === "string" ? value.dispute_kind : null, can_cancel: value.can_cancel === true,
    cancel_refund_cents: num(value.cancel_refund_cents), can_reschedule: value.can_reschedule === true,
    can_mark_attendance: value.can_mark_attendance === true, can_report: value.can_report === true, can_review: value.can_review === true,
    review_stars: typeof value.review_stars === "number" ? value.review_stars : null, notes: safeNotes(value.notes),
    can_write_notes: value.can_write_notes === true, has_brief: value.has_brief === true,
  };
}

/** Calls the lesson service; a refusal becomes an Error whose message is the service's code (for lessonErrorKey). */
async function lessons(action: string, values: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  try {
    const response = await parleLessonService({ action, ...values });
    return isObject(response) ? response : {};
  } catch (error) {
    const body = isObject(error) && isObject((error as { body?: unknown }).body) ? (error as { body: Record<string, unknown> }).body : {};
    const fromMessage = error instanceof Error ? error.message.match(/API request failed: ([A-Z_]+)/)?.[1] : undefined;
    throw new Error(typeof body.error_code === "string" ? body.error_code : fromMessage ?? "REQUEST_FAILED");
  }
}

const lessonList = (result: Record<string, unknown>): LessonList => ({
  lessons: Array.isArray(result.lessons) ? result.lessons.map(safeLesson).filter((lesson): lesson is ParleLesson => lesson !== null) : [],
  timeZone: safeTimeZone(result.time_zone),
});
function oneLesson(result: Record<string, unknown>): ParleLesson {
  const lesson = safeLesson(result.lesson);
  if (!lesson) throw new Error("REQUEST_FAILED");
  return lesson;
}
const checkoutUrl = (value: unknown) => {
  const url = str(value, 2000);
  return url.startsWith("https://checkout.stripe.com/") ? url : "";
};

export const loadLearnerLessons = async () => lessonList(await lessons("learner_list_lessons"));
export const loadTutorLessons = async () => lessonList(await lessons("tutor_list_lessons"));

export async function loadBookingOptions(profileId: string): Promise<BookingOptions> {
  const r = await lessons("booking_options", { tutor_profile_id: profileId });
  const offered = Array.isArray(r.offered_lengths) ? r.offered_lengths.filter((m): m is 30 | 45 | 60 => m === 30 || m === 45 || m === 60) : [];
  const prices: Record<string, number> = {};
  if (isObject(r.prices)) for (const [key, value] of Object.entries(r.prices)) if (typeof value === "number") prices[key] = value;
  return {
    canBook: r.can_book === true, reason: typeof r.reason === "string" ? r.reason : null, timeZone: safeTimeZone(r.time_zone),
    busyIntervals: Array.isArray(r.busy_intervals) ? r.busy_intervals.filter(isObject).map((b) => ({ start_utc: str(b.start_utc), end_utc: str(b.end_utc) })) : [],
    offeredLengths: offered, prices, minimumNoticeHours: num(r.minimum_notice_hours), horizonDays: num(r.horizon_days) || 30, holdMinutes: num(r.hold_minutes) || 30,
  };
}

export async function bookLesson(input: { profileId: string; startUtc: string; minutes: number; message: string }): Promise<{ bookingId: string; checkoutUrl: string }> {
  const r = await lessons("book_lesson", { tutor_profile_id: input.profileId, start_utc: input.startUtc, minutes: input.minutes, message: input.message });
  const url = checkoutUrl(r.checkout_url);
  if (!url || typeof r.booking_id !== "string") throw new Error("PAYMENT_UNAVAILABLE");
  return { bookingId: r.booking_id, checkoutUrl: url };
}

export const lessonStatus = async (id: string) => oneLesson(await lessons("lesson_status", { booking_id: id }));
export async function resumeCheckout(id: string): Promise<string> {
  const url = checkoutUrl((await lessons("resume_checkout", { booking_id: id })).checkout_url);
  if (!url) throw new Error("HOLD_EXPIRED");
  return url;
}
export async function cancelLesson(id: string, expectedRefundCents: number): Promise<{ lesson: ParleLesson; refundedCents: number }> {
  const r = await lessons("cancel_lesson", { booking_id: id, expected_refund_cents: expectedRefundCents });
  return { lesson: oneLesson(r), refundedCents: num(r.refunded_cents) };
}
export async function rescheduleOptions(id: string): Promise<string[]> {
  const r = await lessons("reschedule_options", { booking_id: id });
  return Array.isArray(r.slots) ? r.slots.filter((slot): slot is string => typeof slot === "string") : [];
}
export const rescheduleLesson = async (id: string, startUtc: string) => oneLesson(await lessons("reschedule_lesson", { booking_id: id, start_utc: startUtc }));
export const markAttendance = async (id: string, outcome: "completed" | "learner_no_show") => oneLesson(await lessons("mark_attendance", { booking_id: id, outcome }));
export const saveLessonNotes = async (id: string, notes: LessonNotes) => oneLesson(await lessons("save_lesson_notes", { booking_id: id, skills: notes.skills, notes: notes.notes, homework: notes.homework }));
export const reportProblem = async (id: string, kind: "tutor_no_show" | "no_show_dispute" | "other", details: string) => oneLesson(await lessons("report_problem", { booking_id: id, kind, details }));
export const submitReview = async (id: string, stars: number, comment: string) => oneLesson(await lessons("submit_review", { booking_id: id, stars, comment }));

export async function loadLessonBrief(id: string): Promise<LessonBrief | null> {
  const r = await lessons("tutor_lesson_brief", { booking_id: id });
  if (!isObject(r.brief)) return null;
  const b = r.brief;
  return {
    learner_name: str(b.learner_name, 80), goal: str(b.goal, 80), track: str(b.track, 40),
    levels: isObject(b.levels) ? Object.fromEntries(LESSON_SKILLS.map((skill) => [skill, typeof (b.levels as Record<string, unknown>)[skill] === "number" ? (b.levels as Record<string, number>)[skill] : null])) : {},
    latest_checkin: isObject(b.latest_checkin) ? { date: str(b.latest_checkin.date, 20), note: str(b.latest_checkin.note, 600) } : null,
    recent_mistakes: Array.isArray(b.recent_mistakes) ? b.recent_mistakes.filter(isObject).map((m) => ({ area: str(m.area, 40), original: str(m.original, 400), corrected: str(m.corrected, 400) })) : [],
    earlier_notes: Array.isArray(b.earlier_notes) ? b.earlier_notes.filter(isObject).map((n) => ({ date: str(n.date, 20), ...(safeNotes(n) ?? { skills: {}, notes: "", homework: "" }) })) : [],
    learner_message: str(b.learner_message, 1000),
  };
}

export async function loadTutorStudents(): Promise<{ students: TutorStudent[]; timeZone: string }> {
  const r = await lessons("tutor_list_students");
  const students = Array.isArray(r.students) ? r.students.filter(isObject).map((s) => ({
    learner_id: str(s.learner_id, 64), name: str(s.name, 80), lessons: num(s.lessons),
    last_lesson_at: typeof s.last_lesson_at === "string" ? s.last_lesson_at : null, next_lesson_at: typeof s.next_lesson_at === "string" ? s.next_lesson_at : null,
    latest_notes: isObject(s.latest_notes) ? { ...(safeNotes(s.latest_notes) ?? { skills: {}, notes: "", homework: "" }), date: str(s.latest_notes.date, 20) } : null,
  })) : [];
  return { students, timeZone: safeTimeZone(r.time_zone) };
}

export async function loadDisputedLessons(): Promise<{ lessons: DisputedLesson[]; flaggedTutors: FlaggedTutor[] }> {
  const r = await lessons("admin_list_disputed");
  return {
    lessons: Array.isArray(r.lessons) ? r.lessons.filter(isObject).map((l) => ({
      id: str(l.id, 64), start_at: str(l.start_at, 40), tutor_name: str(l.tutor_name, 80), learner_name: str(l.learner_name, 80),
      dispute_kind: str(l.dispute_kind, 40), dispute_details: str(l.dispute_details), disputed_at: str(l.disputed_at, 40), disputed_from: str(l.disputed_from, 40), price_cents: num(l.price_cents),
    })) : [],
    flaggedTutors: Array.isArray(r.flagged_tutors) ? r.flagged_tutors.filter(isObject).map((f) => ({ tutor_id: str(f.tutor_id, 64), name: str(f.name, 80), cancellations: num(f.cancellations) })) : [],
  };
}

const ERROR_KEYS: Record<string, TranslationKey> = {
  SLOT_TAKEN: "lessons.error.slotTaken", NOTICE_TOO_SHORT: "lessons.error.noticeTooShort", HOLD_LIMIT: "lessons.error.holdLimit",
  RATE_LIMITED: "lessons.error.rateLimited", PAYMENT_UNAVAILABLE: "lessons.error.paymentUnavailable", BOOKING_NOT_OPEN: "lessons.error.bookingNotOpen",
  TUTOR_NOT_AVAILABLE: "lessons.error.tutorUnavailable", HOLD_EXPIRED: "lessons.error.holdExpired", CANCEL_TERMS_CHANGED: "lessons.error.cancelTermsChanged",
  REFUND_UNAVAILABLE: "lessons.error.refundUnavailable", CANNOT_CANCEL: "lessons.error.cannotCancel", RESCHEDULE_NOT_ALLOWED: "lessons.error.rescheduleNotAllowed",
  REPORT_CLOSED: "lessons.error.reportClosed", REVIEW_EXISTS: "lessons.error.reviewExists", ATTENDANCE_NOT_OPEN: "lessons.error.attendanceNotOpen",
  NOTES_INVALID: "lessons.error.notesInvalid",
};
export function lessonErrorKey(code: string): TranslationKey {
  return ERROR_KEYS[code] ?? "lessons.error.generic";
}

export function formatUsdCents(cents: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

export function formatClock(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: safeTimeZone(timeZone) }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** Lengths the tutor enabled whose price at their rate is under the minimum charge (shown on Availability). */
export function lengthsBelowMinimum(lengths: number[], rateCents: number, minimumCents: number): number[] {
  return rateCents > 0 ? lengths.filter((minutes) => lessonPriceCents(rateCents, minutes) < minimumCents) : [];
}

const byStart = (a: ParleLesson, b: ParleLesson) => Date.parse(a.start_at) - Date.parse(b.start_at);
const CANCELLED: LessonStatus[] = ["cancelled_learner", "cancelled_tutor", "expired"];

export function groupLearnerLessons(list: ParleLesson[], now = Date.now()) {
  const isUpcoming = (l: ParleLesson) => l.status === "pending_payment" || (l.status === "confirmed" && Date.parse(l.end_at) > now);
  return {
    upcoming: list.filter(isUpcoming).sort(byStart),
    past: list.filter((l) => !isUpcoming(l)).sort((a, b) => byStart(b, a)),
  };
}

export function groupTutorLessons(list: ParleLesson[], now = Date.now()) {
  const toDo = (l: ParleLesson) => l.can_mark_attendance || (l.can_write_notes && !l.notes);
  return {
    upcoming: list.filter((l) => l.status === "confirmed" && Date.parse(l.end_at) > now).sort(byStart),
    toDo: list.filter(toDo).sort(byStart),
    past: list.filter((l) => !toDo(l) && !CANCELLED.includes(l.status) && !(l.status === "confirmed" && Date.parse(l.end_at) > now)).sort((a, b) => byStart(b, a)),
    cancelled: list.filter((l) => CANCELLED.includes(l.status)).sort((a, b) => byStart(b, a)),
  };
}

export function dateKeyInTimeZone(value: string, timeZone: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: safeTimeZone(timeZone), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
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
    return startDate === endDate
      ? `${startDate} · ${time.format(start)} – ${time.format(end)}`
      : `${startDate} · ${time.format(start)} – ${endDate} · ${time.format(end)}`;
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
