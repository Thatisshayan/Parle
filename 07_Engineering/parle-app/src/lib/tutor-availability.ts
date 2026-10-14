export type LearnerTutorWindow =
  | "weekday_morning"
  | "weekday_afternoon"
  | "weekday_evening"
  | "weekend_morning"
  | "weekend_afternoon"
  | "weekend_evening";

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

export interface TutorAvailabilityInput {
  rules?: TutorAvailabilityRule[];
  exceptions?: TutorAvailabilityException[];
}

export interface AvailabilityWindow {
  startUtc: string;
  endUtc: string;
}

export interface AvailabilityOverlap {
  ratio: number;
  overlappedMinutes: number;
  learnerWindowMinutes: number;
  hasOverlap: boolean;
}

export const LEARNER_TUTOR_WINDOWS: readonly LearnerTutorWindow[] = [
  "weekday_morning",
  "weekday_afternoon",
  "weekday_evening",
  "weekend_morning",
  "weekend_afternoon",
  "weekend_evening",
];

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const RANGE_MS = 14 * DAY_MS;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

type WallParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };
type NumericInterval = { start: number; end: number };

function isValidTimeZone(value: unknown): value is string {
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
  return Math.round((wallEpoch(parts) - Math.floor(instantMs / 60_000) * 60_000) / 60_000);
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
    .map((offset) => wallMs - offset * 60_000)
    .filter((instant) => sameWall(wallPartsAt(instant, timeZone), date, hour, minute))
    .sort((a, b) => a - b);
}

/**
 * Resolves a local wall-clock time. During a fall-back fold, starts choose the first
 * occurrence and ends choose the second. A spring-forward gap shifts forward by
 * the size of the clock jump, matching the common "compatible" calendar behavior.
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
  const shiftedWall = new Date(naiveWallMs + gapMinutes * 60_000);
  const shiftedDate = shiftedWall.toISOString().slice(0, 10);
  const shiftedClock = `${String(shiftedWall.getUTCHours()).padStart(2, "0")}:${String(shiftedWall.getUTCMinutes()).padStart(2, "0")}`;
  const shiftedCandidates = candidateInstants(shiftedWall.getTime(), shiftedDate, shiftedWall.getUTCHours(), shiftedWall.getUTCMinutes(), timeZone);
  if (shiftedCandidates.length) return disambiguation === "end" ? shiftedCandidates[shiftedCandidates.length - 1] : shiftedCandidates[0];

  // A locale can skip unusual historical minutes; use the pre-transition offset only
  // when its normalized wall time is exactly the requested time plus the DST gap.
  const compatible = naiveWallMs - beforeOffset * 60_000;
  const compatibleParts = wallPartsAt(compatible, timeZone);
  if (compatibleParts && wallEpoch(compatibleParts) === naiveWallMs + gapMinutes * 60_000) return compatible;
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

function validRule(rule: TutorAvailabilityRule): boolean {
  return Number.isInteger(rule.day_of_week) && rule.day_of_week >= 1 && rule.day_of_week <= 7 &&
    isValidClock(rule.start_local) && isValidClock(rule.end_local) && rule.start_local < rule.end_local &&
    isValidTimeZone(rule.time_zone);
}

function validException(exception: TutorAvailabilityException): boolean {
  if (!isValidDate(exception.date_local) || !isValidTimeZone(exception.time_zone)) return false;
  if (exception.kind === "off") return true;
  return exception.kind === "extra" && isValidClock(exception.start_local) && isValidClock(exception.end_local) && exception.start_local < exception.end_local;
}

function mergeIntervals(intervals: NumericInterval[]): NumericInterval[] {
  const sorted = intervals.filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: NumericInterval[] = [];
  for (const item of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && item.start <= previous.end) previous.end = Math.max(previous.end, item.end);
    else merged.push({ ...item });
  }
  return merged;
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

function resolveWindow(date: string, start: string, end: string, zone: string): NumericInterval | null {
  const startMs = resolveLocalDateTime(date, start, zone, "start");
  const endMs = resolveLocalDateTime(date, end, zone, "end");
  if (startMs === null || endMs === null || endMs <= startMs) return null;
  return { start: startMs, end: endMs };
}

function windowFor(zone: string, date: string, start: string, end: string): NumericInterval | null {
  return resolveWindow(date, start, end, zone);
}

/** Expand tutor-local weekly hours and date overrides into UTC windows for the next 14 days. */
export function expandTutorAvailability(
  input: TutorAvailabilityInput | null | undefined,
  options: { now?: Date | number | string; days?: number } = {},
): AvailabilityWindow[] {
  const nowMs = normalizedNow(options.now);
  const days = Number.isInteger(options.days) ? Math.max(1, Math.min(Number(options.days), 31)) : 14;
  const endMs = nowMs + days * DAY_MS;
  const rules = (Array.isArray(input?.rules) ? input.rules : []).filter(validRule);
  const exceptions = (Array.isArray(input?.exceptions) ? input.exceptions : []).filter(validException);
  const zones = new Set([...rules.map((rule) => rule.time_zone), ...exceptions.map((item) => item.time_zone)]);
  const intervals: NumericInterval[] = [];

  for (const zone of zones) {
    const firstDate = dateAt(nowMs, zone);
    const lastDate = dateAt(endMs - 1, zone);
    if (!firstDate || !lastDate) continue;
    const exceptionsByDate = new Map(exceptions.filter((item) => item.time_zone === zone).map((item) => [item.date_local, item]));
    let date = firstDate;
    while (date <= lastDate) {
      const exception = exceptionsByDate.get(date);
      if (exception?.kind !== "off") {
        const day = isoWeekday(date);
        for (const rule of rules) {
          if (rule.time_zone !== zone || rule.day_of_week !== day) continue;
          const interval = windowFor(zone, date, rule.start_local, rule.end_local);
          if (interval) intervals.push(interval);
        }
      }
      if (exception?.kind === "extra") {
        const interval = windowFor(zone, date, String(exception.start_local), String(exception.end_local));
        if (interval) intervals.push(interval);
      }
      date = addCalendarDays(date, 1);
    }
  }

  return mergeIntervals(intervals)
    .map((interval) => ({ start: Math.max(nowMs, interval.start), end: Math.min(endMs, interval.end) }))
    .filter((interval) => interval.end > interval.start)
    .map((interval) => ({ startUtc: new Date(interval.start).toISOString(), endUtc: new Date(interval.end).toISOString() }));
}

/** Summarize the tutor's Monday-to-Sunday local calendar week, applying date exceptions. */
export interface TutorWeekDaySummary {
  date: string;
  day_of_week: number;
  kind: "available" | "unavailable" | "off";
  has_extra_hours: boolean;
  intervals: Array<{ start_local: string; end_local: string }>;
}

export interface TutorWeekSummary {
  time_zone: string;
  week_start: string;
  week_end: string;
  days: TutorWeekDaySummary[];
}

export function summarizeTutorAvailabilityWeek(
  input: TutorAvailabilityInput | null | undefined,
  timeZone: string,
  now: Date | number | string = Date.now(),
): TutorWeekSummary | null {
  if (!isValidTimeZone(timeZone)) return null;
  const nowMs = normalizedNow(now);
  const localToday = dateAt(nowMs, timeZone);
  if (!localToday) return null;
  const weekStart = addCalendarDays(localToday, 1 - isoWeekday(localToday));
  const rules = (Array.isArray(input?.rules) ? input.rules : []).filter((rule) => validRule(rule) && rule.time_zone === timeZone);
  const exceptions = (Array.isArray(input?.exceptions) ? input.exceptions : []).filter((item) => validException(item) && item.time_zone === timeZone);
  const byDate = new Map(exceptions.map((item) => [item.date_local, item]));
  const days = Array.from({ length: 7 }, (_, index): TutorWeekDaySummary => {
    const date = addCalendarDays(weekStart, index);
    const dayOfWeek = index + 1;
    const exception = byDate.get(date);
    if (exception?.kind === "off") {
      return { date, day_of_week: dayOfWeek, kind: "off", has_extra_hours: false, intervals: [] };
    }
    const intervals = rules.filter((rule) => rule.day_of_week === dayOfWeek)
      .map((rule) => ({ start_local: rule.start_local, end_local: rule.end_local }));
    const hasExtraHours = exception?.kind === "extra";
    if (hasExtraHours) intervals.push({ start_local: String(exception.start_local), end_local: String(exception.end_local) });
    intervals.sort((left, right) => left.start_local.localeCompare(right.start_local) || left.end_local.localeCompare(right.end_local));
    const merged: Array<{ start_local: string; end_local: string }> = [];
    for (const interval of intervals) {
      const previous = merged[merged.length - 1];
      if (previous && interval.start_local <= previous.end_local) {
        if (interval.end_local > previous.end_local) previous.end_local = interval.end_local;
      } else merged.push({ ...interval });
    }
    return {
      date,
      day_of_week: dayOfWeek,
      kind: merged.length ? "available" : "unavailable",
      has_extra_hours: hasExtraHours,
      intervals: merged,
    };
  });
  return { time_zone: timeZone, week_start: weekStart, week_end: addCalendarDays(weekStart, 6), days };
}

function learnerIntervals(
  selectedWindows: readonly string[],
  timeZone: string,
  nowMs: number,
  endMs: number,
): NumericInterval[] {
  if (!isValidTimeZone(timeZone)) return [];
  const selected = new Set(selectedWindows.filter((value): value is LearnerTutorWindow => LEARNER_TUTOR_WINDOWS.includes(value as LearnerTutorWindow)));
  if (!selected.size) return [];
  const firstDate = dateAt(nowMs, timeZone);
  const lastDate = dateAt(endMs - 1, timeZone);
  if (!firstDate || !lastDate) return [];
  const bands: Array<{ suffix: "morning" | "afternoon" | "evening"; start: string; end: string }> = [
    { suffix: "morning", start: "06:00", end: "12:00" },
    { suffix: "afternoon", start: "12:00", end: "17:00" },
    { suffix: "evening", start: "17:00", end: "22:00" },
  ];
  const intervals: NumericInterval[] = [];
  let date = firstDate;
  while (date <= lastDate) {
    const weekday = isoWeekday(date);
    const dayPrefix = weekday <= 5 ? "weekday" : "weekend";
    for (const band of bands) {
      if (!selected.has(`${dayPrefix}_${band.suffix}` as LearnerTutorWindow)) continue;
      const interval = resolveWindow(date, band.start, band.end, timeZone);
      if (!interval) continue;
      const start = Math.max(nowMs, interval.start);
      const end = Math.min(endMs, interval.end);
      if (end > start) intervals.push({ start, end });
    }
    date = addCalendarDays(date, 1);
  }
  return mergeIntervals(intervals);
}

/** Compare listed tutor availability with the learner's broad local time windows. */
export function calculateAvailabilityOverlap(
  tutorWindows: readonly AvailabilityWindow[],
  selectedLearnerWindows: readonly string[],
  learnerTimeZone: string,
  options: { now?: Date | number | string; days?: number } = {},
): AvailabilityOverlap {
  const nowMs = normalizedNow(options.now);
  const days = Number.isInteger(options.days) ? Math.max(1, Math.min(Number(options.days), 31)) : 14;
  const endMs = nowMs + days * DAY_MS;
  const learner = learnerIntervals(selectedLearnerWindows, learnerTimeZone, nowMs, endMs);
  const tutor = mergeIntervals(tutorWindows.flatMap((window) => {
    const start = Date.parse(window.startUtc);
    const end = Date.parse(window.endUtc);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? [{ start: Math.max(start, nowMs), end: Math.min(end, endMs) }] : [];
  }));
  const learnerMinutes = learner.reduce((total, item) => total + (item.end - item.start) / 60_000, 0);
  let overlappedMinutes = 0;
  for (const wanted of learner) {
    for (const offered of tutor) {
      const start = Math.max(wanted.start, offered.start);
      const end = Math.min(wanted.end, offered.end);
      if (end > start) overlappedMinutes += (end - start) / 60_000;
    }
  }
  const ratio = learnerMinutes > 0 ? Math.max(0, Math.min(1, overlappedMinutes / learnerMinutes)) : 0;
  return {
    ratio,
    overlappedMinutes,
    learnerWindowMinutes: learnerMinutes,
    hasOverlap: overlappedMinutes > 0,
  };
}

/** Return the earliest actual overlap, suitable for showing a listed window reason. */
export function findEarliestLearnerOverlap(
  tutorWindows: readonly AvailabilityWindow[],
  selectedLearnerWindows: readonly string[],
  learnerTimeZone: string,
  options: { now?: Date | number | string; days?: number } = {},
): AvailabilityWindow | null {
  const nowMs = normalizedNow(options.now);
  const days = Number.isInteger(options.days) ? Math.max(1, Math.min(Number(options.days), 31)) : 14;
  const endMs = nowMs + days * DAY_MS;
  const learner = learnerIntervals(selectedLearnerWindows, learnerTimeZone, nowMs, endMs);
  const tutor = mergeIntervals(tutorWindows.flatMap((window) => {
    const start = Date.parse(window.startUtc);
    const end = Date.parse(window.endUtc);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? [{ start: Math.max(start, nowMs), end: Math.min(end, endMs) }] : [];
  }));
  const overlaps: NumericInterval[] = [];
  for (const wanted of learner) {
    for (const offered of tutor) {
      const start = Math.max(wanted.start, offered.start);
      const end = Math.min(wanted.end, offered.end);
      if (end > start) overlaps.push({ start, end });
    }
  }
  const earliest = mergeIntervals(overlaps)[0];
  return earliest ? { startUtc: new Date(earliest.start).toISOString(), endUtc: new Date(earliest.end).toISOString() } : null;
}

/** Accept either an already-parsed availability object or its safe snapshot JSON string. */
export function parseTutorAvailability(value: unknown): TutorAvailabilityInput {
  let candidate: unknown = value;
  if (typeof candidate === "string") {
    try { candidate = JSON.parse(candidate); } catch { return { rules: [], exceptions: [] }; }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return { rules: [], exceptions: [] };
  const source = candidate as Record<string, unknown>;
  const rules = Array.isArray(source.rules) ? source.rules.filter((item): item is TutorAvailabilityRule => Boolean(item) && typeof item === "object" && !Array.isArray(item) &&
    Number.isInteger((item as TutorAvailabilityRule).day_of_week) && typeof (item as TutorAvailabilityRule).start_local === "string" && typeof (item as TutorAvailabilityRule).end_local === "string" && typeof (item as TutorAvailabilityRule).time_zone === "string") : [];
  const exceptions = Array.isArray(source.exceptions) ? source.exceptions.filter((item): item is TutorAvailabilityException => Boolean(item) && typeof item === "object" && !Array.isArray(item) &&
    typeof (item as TutorAvailabilityException).date_local === "string" && ((item as TutorAvailabilityException).kind === "off" || (item as TutorAvailabilityException).kind === "extra") && typeof (item as TutorAvailabilityException).time_zone === "string") : [];
  return { rules, exceptions };
}
