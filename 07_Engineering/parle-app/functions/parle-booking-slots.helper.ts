export const BOOKING_DURATIONS = [30, 45, 60] as const;
export const BOOKING_BUFFERS = [0, 10, 15] as const;
export const BOOKING_NOTICE_HOURS = [12, 24, 48] as const;
export const BOOKING_WINDOW_DAYS = 30 as const;

export type LessonDuration = (typeof BOOKING_DURATIONS)[number];
export type BookingBufferMinutes = (typeof BOOKING_BUFFERS)[number];
export type BookingNoticeHours = (typeof BOOKING_NOTICE_HOURS)[number];

export interface BookingSettings {
  lesson_lengths_minutes: LessonDuration[];
  buffer_minutes: BookingBufferMinutes;
  minimum_notice_hours: BookingNoticeHours;
  booking_window_days: typeof BOOKING_WINDOW_DAYS;
}

export const DEFAULT_BOOKING_SETTINGS: Readonly<BookingSettings> = Object.freeze({
  lesson_lengths_minutes: [...BOOKING_DURATIONS],
  buffer_minutes: 0,
  minimum_notice_hours: 12,
  booking_window_days: BOOKING_WINDOW_DAYS,
});

export interface TutorAvailabilityRule {
  day_of_week: number;
  start_local: string;
  end_local: string;
  time_zone: string;
}

export interface TutorAvailabilityException {
  date_local: string;
  kind: "off" | "extra";
  start_local?: string;
  end_local?: string;
  time_zone: string;
}

export interface TutorLocalSchedule {
  rules?: readonly TutorAvailabilityRule[];
  exceptions?: readonly TutorAvailabilityException[];
}

export interface PublicBusyInterval {
  start_utc: string;
  end_utc: string;
}

export interface BookingSchedule extends TutorLocalSchedule {
  settings?: unknown;
  busy_intervals?: readonly PublicBusyInterval[];
}

export interface BookableSlot {
  startUtc: string;
  endUtc: string;
  durationMinutes: LessonDuration;
}

export interface AvailabilityWindow {
  startUtc: string;
  endUtc: string;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

type WallParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };
type NumericInterval = { start: number; end: number };
type LocalWindow = { date: string; start_local: string; end_local: string; time_zone: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidClock(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function wallPartsAt(instantMs: number, timeZone: string): WallParts | null {
  try {
    const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(new Date(instantMs)).map((part) => [part.type, part.value]));
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      second: Number(parts.second),
    };
  } catch {
    return null;
  }
}

function wallEpoch(parts: WallParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function offsetAt(instantMs: number, timeZone: string): number | null {
  const parts = wallPartsAt(instantMs, timeZone);
  if (!parts) return null;
  return Math.round((wallEpoch(parts) - Math.floor(instantMs / MINUTE_MS) * MINUTE_MS) / MINUTE_MS);
}

function sameWall(parts: WallParts | null, date: string, hour: number, minute: number): boolean {
  if (!parts) return false;
  const [year, month, day] = date.split("-").map(Number);
  return parts.year === year && parts.month === month && parts.day === day && parts.hour === hour && parts.minute === minute && parts.second === 0;
}

function candidateInstants(wallMs: number, date: string, hour: number, minute: number, timeZone: string): number[] {
  const offsets = new Set<number>();
  for (const hours of [-36, -24, -12, -6, 0, 6, 12, 24, 36]) {
    const offset = offsetAt(wallMs + hours * HOUR_MS, timeZone);
    if (offset !== null) offsets.add(offset);
  }
  return [...offsets]
    .map((offset) => wallMs - offset * MINUTE_MS)
    .filter((instant) => sameWall(wallPartsAt(instant, timeZone), date, hour, minute))
    .sort((a, b) => a - b);
}

/**
 * Resolves a tutor-local wall time without using the browser or server's local zone.
 * Repeated fall-back times choose the first start and the last end; a skipped
 * spring-forward boundary shifts forward by the clock change, deterministically.
 */
export function resolveLocalDateTime(
  date: string,
  clock: string,
  timeZone: string,
  disambiguation: "start" | "end" = "start",
): number | null {
  if (!isValidDate(date) || !isValidClock(clock) || !isValidTimeZone(timeZone)) return null;
  const [hour, minute] = clock.split(":").map(Number);
  const [year, month, day] = date.split("-").map(Number);
  const naiveWallMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const exact = candidateInstants(naiveWallMs, date, hour, minute, timeZone);
  if (exact.length) return disambiguation === "end" ? exact[exact.length - 1] : exact[0];

  const beforeOffset = offsetAt(naiveWallMs - 12 * HOUR_MS, timeZone);
  const afterOffset = offsetAt(naiveWallMs + 12 * HOUR_MS, timeZone);
  if (beforeOffset === null || afterOffset === null) return null;
  const gapMinutes = afterOffset - beforeOffset;
  if (gapMinutes <= 0 || gapMinutes > 180) return null;
  const shiftedWall = new Date(naiveWallMs + gapMinutes * MINUTE_MS);
  const shiftedDate = shiftedWall.toISOString().slice(0, 10);
  const shiftedClock = `${String(shiftedWall.getUTCHours()).padStart(2, "0")}:${String(shiftedWall.getUTCMinutes()).padStart(2, "0")}`;
  const shiftedCandidates = candidateInstants(shiftedWall.getTime(), shiftedDate, shiftedWall.getUTCHours(), shiftedWall.getUTCMinutes(), timeZone);
  if (shiftedCandidates.length) return disambiguation === "end" ? shiftedCandidates[shiftedCandidates.length - 1] : shiftedCandidates[0];

  const compatible = naiveWallMs - beforeOffset * MINUTE_MS;
  const compatibleParts = wallPartsAt(compatible, timeZone);
  if (compatibleParts && wallEpoch(compatibleParts) === naiveWallMs + gapMinutes * MINUTE_MS) return compatible;
  return null;
}

function dateAt(instantMs: number, timeZone: string): string | null {
  const parts = wallPartsAt(instantMs, timeZone);
  if (!parts) return null;
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function addCalendarDays(date: string, amount: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function isValidRule(rule: TutorAvailabilityRule): boolean {
  return Number.isInteger(rule.day_of_week) && rule.day_of_week >= 1 && rule.day_of_week <= 7 &&
    isValidClock(rule.start_local) && isValidClock(rule.end_local) && rule.start_local < rule.end_local &&
    isValidTimeZone(rule.time_zone);
}

function isValidException(exception: TutorAvailabilityException): boolean {
  if (!isValidDate(exception.date_local) || !isValidTimeZone(exception.time_zone)) return false;
  if (exception.kind === "off") return true;
  return exception.kind === "extra" && isValidClock(exception.start_local) && isValidClock(exception.end_local) && exception.start_local < exception.end_local;
}

function normalizedNow(now: Date | number | string | undefined): number {
  if (now instanceof Date) return Number.isFinite(now.getTime()) ? now.getTime() : Date.now();
  if (typeof now === "number" && Number.isFinite(now)) return now;
  if (typeof now === "string") {
    const parsed = Date.parse(now);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function windowDays(value: unknown, fallback: number): number {
  return Number.isInteger(value) ? Math.max(1, Math.min(Number(value), fallback, BOOKING_WINDOW_DAYS)) : fallback;
}

function mergeIntervals(intervals: NumericInterval[]): NumericInterval[] {
  const sorted = intervals
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: NumericInterval[] = [];
  for (const item of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && item.start <= previous.end) previous.end = Math.max(previous.end, item.end);
    else merged.push({ ...item });
  }
  return merged;
}

function resolveWindow(date: string, start: string, end: string, zone: string): NumericInterval | null {
  const startMs = resolveLocalDateTime(date, start, zone, "start");
  const endMs = resolveLocalDateTime(date, end, zone, "end");
  if (startMs === null || endMs === null || endMs <= startMs) return null;
  return { start: startMs, end: endMs };
}

/** Validate a stored or submitted set of tutor booking preferences. The booking window is fixed at 30 days. */
export function parseBookingSettings(value: unknown): BookingSettings | null {
  if (!isObject(value)) return null;
  const rawDurations = value.lesson_lengths_minutes;
  if (!Array.isArray(rawDurations) || rawDurations.some((item) => !BOOKING_DURATIONS.includes(item as LessonDuration))) return null;
  const durations = [...new Set(rawDurations as LessonDuration[])].sort((a, b) => a - b);
  if (!BOOKING_BUFFERS.includes(value.buffer_minutes as BookingBufferMinutes)) return null;
  if (!BOOKING_NOTICE_HOURS.includes(value.minimum_notice_hours as BookingNoticeHours)) return null;
  if (value.booking_window_days !== undefined && value.booking_window_days !== BOOKING_WINDOW_DAYS) return null;
  return {
    lesson_lengths_minutes: durations,
    buffer_minutes: value.buffer_minutes as BookingBufferMinutes,
    minimum_notice_hours: value.minimum_notice_hours as BookingNoticeHours,
    booking_window_days: BOOKING_WINDOW_DAYS,
  };
}

/** Returns demo defaults when a snapshot or older tutor record contains no valid booking settings. */
export function safeBookingSettings(value: unknown): BookingSettings {
  const parsed = parseBookingSettings(value);
  return parsed ?? {
    lesson_lengths_minutes: [...DEFAULT_BOOKING_SETTINGS.lesson_lengths_minutes],
    buffer_minutes: DEFAULT_BOOKING_SETTINGS.buffer_minutes,
    minimum_notice_hours: DEFAULT_BOOKING_SETTINGS.minimum_notice_hours,
    booking_window_days: BOOKING_WINDOW_DAYS,
  };
}

function scheduleWindowsBetween(schedule: TutorLocalSchedule, startMs: number, endMs: number): LocalWindow[] {
  const rules = (Array.isArray(schedule.rules) ? schedule.rules : []).filter(isValidRule);
  const exceptions = (Array.isArray(schedule.exceptions) ? schedule.exceptions : []).filter(isValidException);
  const zones = new Set([...rules.map((rule) => rule.time_zone), ...exceptions.map((item) => item.time_zone)]);
  const windows: LocalWindow[] = [];

  for (const zone of zones) {
    const firstDate = dateAt(startMs, zone);
    const lastDate = dateAt(endMs - 1, zone);
    if (!firstDate || !lastDate) continue;
    let date = firstDate;
    while (date <= lastDate) {
      const dateExceptions = exceptions.filter((item) => item.time_zone === zone && item.date_local === date);
      const dayOff = dateExceptions.some((item) => item.kind === "off");
      if (!dayOff) {
        const day = isoWeekday(date);
        for (const rule of rules) {
          if (rule.time_zone === zone && rule.day_of_week === day) {
            windows.push({ date, start_local: rule.start_local, end_local: rule.end_local, time_zone: zone });
          }
        }
      }
      for (const exception of dateExceptions) {
        if (exception.kind === "extra" && exception.start_local && exception.end_local) {
          windows.push({ date, start_local: exception.start_local, end_local: exception.end_local, time_zone: zone });
        }
      }
      date = addCalendarDays(date, 1);
    }
  }
  return windows;
}

/** Expand weekly rules and one-date exceptions to clipped UTC intervals. */
export function expandTutorLocalAvailability(
  schedule: TutorLocalSchedule | null | undefined,
  options: { now?: Date | number | string; windowDays?: number } = {},
): AvailabilityWindow[] {
  const nowMs = normalizedNow(options.now);
  const days = windowDays(options.windowDays, BOOKING_WINDOW_DAYS);
  const endMs = nowMs + days * DAY_MS;
  const intervals = scheduleWindowsBetween(schedule ?? {}, nowMs, endMs)
    .map((window) => resolveWindow(window.date, window.start_local, window.end_local, window.time_zone))
    .filter((window): window is NumericInterval => window !== null)
    .map((window) => ({ start: Math.max(nowMs, window.start), end: Math.min(endMs, window.end) }))
    .filter((window) => window.end > window.start);
  return mergeIntervals(intervals).map((window) => ({
    startUtc: new Date(window.start).toISOString(),
    endUtc: new Date(window.end).toISOString(),
  }));
}

function normalizedBusyIntervals(value: unknown): NumericInterval[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isObject(item)) return [];
    const start = Date.parse(String(item.start_utc ?? item.startUtc ?? ""));
    const end = Date.parse(String(item.end_utc ?? item.endUtc ?? ""));
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? [{ start, end }] : [];
  });
}

/** True when the proposed interval overlaps an existing interval or its required buffer on either side. */
export function hasBufferedOverlap(
  proposed: { startUtc: string; endUtc: string },
  existing: { startUtc: string; endUtc: string } | readonly { startUtc: string; endUtc: string }[],
  bufferMinutes: number,
): boolean {
  const start = Date.parse(proposed.startUtc);
  const end = Date.parse(proposed.endUtc);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return true;
  const buffer = Number.isFinite(bufferMinutes) ? Math.max(0, bufferMinutes) * MINUTE_MS : 0;
  const intervals = Array.isArray(existing) ? existing : [existing];
  return intervals.some((interval) => {
    const otherStart = Date.parse(interval.startUtc);
    const otherEnd = Date.parse(interval.endUtc);
    if (!Number.isFinite(otherStart) || !Number.isFinite(otherEnd) || otherEnd <= otherStart) return false;
    return start < otherEnd + buffer && end + buffer > otherStart;
  });
}

type SlotGenerationOptions = {
  now?: Date | number | string;
  windowDays?: number;
  /** Platform minimum notice (spec: min_notice_hours); the larger of this and the tutor's setting applies. */
  minimumNoticeHours?: number;
  /** Lesson lengths decided by the server (price floor, or a booked length when moving a lesson). */
  lengths?: readonly number[];
};

/** Mirrors the database rule: [start, end + this lesson's buffer) may not meet a booked [start, blocked_until). */
export function overlapsBlockedRange(startMs: number, endMs: number, bufferMinutes: number, blocked: readonly { start: number; end: number }[]): boolean {
  const end = endMs + Math.max(0, Number.isFinite(bufferMinutes) ? bufferMinutes : 0) * MINUTE_MS;
  return blocked.some((range) => startMs < range.end && end > range.start);
}

function lengthsFor(settings: BookingSettings, options: SlotGenerationOptions): LessonDuration[] {
  if (!options.lengths) return settings.lesson_lengths_minutes;
  return [...new Set(options.lengths.filter((value): value is LessonDuration => BOOKING_DURATIONS.includes(value as LessonDuration)))].sort((a, b) => a - b);
}

/** Shared slot calculation for previews and current server-side request validation. */
function calculateBookableSlots(
  schedule: BookingSchedule | null | undefined,
  options: SlotGenerationOptions,
  enforceMinimumNotice: boolean,
): BookableSlot[] {
  const settings = safeBookingSettings(schedule?.settings);
  const nowMs = normalizedNow(options.now);
  const days = windowDays(options.windowDays, settings.booking_window_days);
  const rangeEnd = nowMs + days * DAY_MS;
  const noticeHours = Math.max(settings.minimum_notice_hours, Number.isFinite(options.minimumNoticeHours) ? Number(options.minimumNoticeHours) : 0);
  const noticeStart = nowMs + noticeHours * HOUR_MS;
  const lengths = lengthsFor(settings, options);
  const busy = normalizedBusyIntervals(schedule?.busy_intervals);
  const localWindows = scheduleWindowsBetween(schedule ?? {}, nowMs, rangeEnd);
  const slotsByKey = new Map<string, BookableSlot>();

  for (const window of localWindows) {
    const availability = resolveWindow(window.date, window.start_local, window.end_local, window.time_zone);
    if (!availability) continue;
    const [startHour, startMinute] = window.start_local.split(":").map(Number);
    const [endHour, endMinute] = window.end_local.split(":").map(Number);
    const startLocalMinutes = startHour * 60 + startMinute;
    const endLocalMinutes = endHour * 60 + endMinute;
    const firstGridMinute = Math.ceil(startLocalMinutes / 15) * 15;

    for (let localMinute = firstGridMinute; localMinute < endLocalMinutes; localMinute += 15) {
      const hour = Math.floor(localMinute / 60);
      const minute = localMinute % 60;
      const clock = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      const start = resolveLocalDateTime(window.date, clock, window.time_zone, "start");
      if (start === null || start < availability.start || start < nowMs || (enforceMinimumNotice && start < noticeStart) || start >= rangeEnd) continue;
      if (!sameWall(wallPartsAt(start, window.time_zone), window.date, hour, minute)) continue;

      for (const duration of lengths) {
        const end = start + duration * MINUTE_MS;
        if (end > availability.end || end > rangeEnd) continue;
        const startUtc = new Date(start).toISOString();
        const endUtc = new Date(end).toISOString();
        if (overlapsBlockedRange(start, end, settings.buffer_minutes, busy)) continue;
        const key = `${startUtc}|${duration}`;
        slotsByKey.set(key, { startUtc, endUtc, durationMinutes: duration });
      }
    }
  }

  return [...slotsByKey.values()].sort((left, right) => Date.parse(left.startUtc) - Date.parse(right.startUtc) || left.durationMinutes - right.durationMinutes);
}

/** Build deterministic UTC lesson starts from tutor-local hours, current settings and accepted bookings. */
export function generateBookableSlots(
  schedule: BookingSchedule | null | undefined,
  options: SlotGenerationOptions = {},
): BookableSlot[] {
  return calculateBookableSlots(schedule, options, true);
}

export type BookableSlotValidation =
  | { status: "offered"; slot: BookableSlot }
  | { status: "notice_too_short" }
  | { status: "not_offered" }
  | { status: "not_accepting" };

/** Classifies a requested start with the same rules used by the learner preview. */
export function validateBookableSlot(
  schedule: BookingSchedule | null | undefined,
  startUtc: string,
  durationMinutes: number,
  options: SlotGenerationOptions = {},
): BookableSlotValidation {
  const settings = safeBookingSettings(schedule?.settings);
  if (lengthsFor(settings, options).length === 0) return { status: "not_accepting" };
  const startMs = Date.parse(startUtc);
  if (!Number.isFinite(startMs) || new Date(startMs).toISOString() !== startUtc || !Number.isInteger(durationMinutes) || !BOOKING_DURATIONS.includes(durationMinutes as LessonDuration)) {
    return { status: "not_offered" };
  }

  const matchesRequest = (slots: BookableSlot[]) => slots.find((slot) => slot.startUtc === startUtc && slot.durationMinutes === durationMinutes);
  const offered = matchesRequest(calculateBookableSlots(schedule, options, true));
  if (offered) return { status: "offered", slot: offered };
  if (matchesRequest(calculateBookableSlots(schedule, options, false))) return { status: "notice_too_short" };
  return { status: "not_offered" };
}

/** Lesson price from the tutor's hourly rate, in US cents (spec section 2: tutors set the price in USD). */
export function lessonPriceCents(hourlyRateCents: number, minutes: number): number {
  return Math.round((hourlyRateCents * minutes) / 60);
}

/** The tutor's enabled lengths whose price reaches the minimum charge ($8, spec section 4). */
export function offeredLessonLengths(settings: BookingSettings, hourlyRateCents: number, minimumChargeCents: number): LessonDuration[] {
  if (!Number.isFinite(hourlyRateCents) || hourlyRateCents <= 0) return [];
  return settings.lesson_lengths_minutes.filter((minutes) => lessonPriceCents(hourlyRateCents, minutes) >= minimumChargeCents);
}
