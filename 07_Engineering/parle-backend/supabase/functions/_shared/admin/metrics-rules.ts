/** D24 supply and demand rules (pure; tests/admin-metrics-rules.test.ts). Bands match onboarding's tutor windows. */
export const BANDS = ["weekday_morning", "weekday_afternoon", "weekday_evening", "weekend_morning", "weekend_afternoon", "weekend_evening"] as const;
export type Band = (typeof BANDS)[number];
const PARTS: Array<[string, number, number]> = [["morning", 360, 720], ["afternoon", 720, 1020], ["evening", 1020, 1320]];
export const TRACK_SPECIALTIES = [
  { track: "immigration", specialty: "canada_immigration_tef_tcf" },
  { track: "citizenship", specialty: "canadian_citizenship" },
] as const;
const WEEKDAYS = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
const round1 = (n: number) => Math.round(n * 10) / 10;
const zero = (): Record<Band, number> => Object.fromEntries(BANDS.map((b) => [b, 0])) as Record<Band, number>;

export type Rule = { day_of_week: unknown; start_local: unknown; end_local: unknown };

export function clockMinutes(value: unknown): number | null {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

/** A rule's minutes per week; 0 for a rule that is not a valid day (1-7, Monday first) and time span. */
export function ruleMinutes(rule: Rule): number {
  const start = clockMinutes(rule.start_local), end = clockMinutes(rule.end_local), day = Number(rule.day_of_week);
  if (start === null || end === null || end <= start || !Number.isInteger(day) || day < 1 || day > 7) return 0;
  return end - start;
}

export const weeklyHours = (rules: Rule[]): number => round1(rules.reduce((sum, r) => sum + ruleMinutes(r), 0) / 60);
export const offeredHours = (rules: Rule[], days: number): number => round1((weeklyHours(rules) * days) / 7);

export function supplyByBand(rules: Rule[]): Record<Band, number> {
  const minutes = zero();
  for (const rule of rules) {
    if (!ruleMinutes(rule)) continue;
    const start = clockMinutes(rule.start_local)!, end = clockMinutes(rule.end_local)!;
    const prefix = Number(rule.day_of_week) <= 5 ? "weekday" : "weekend";
    for (const [name, from, to] of PARTS) minutes[`${prefix}_${name}` as Band] += Math.max(0, Math.min(end, to) - Math.max(start, from));
  }
  return Object.fromEntries(BANDS.map((b) => [b, round1(minutes[b] / 60)])) as Record<Band, number>;
}

function windowList(value: unknown): string[] {
  let v = value;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return []; } }
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function demandByBand(windows: unknown[]): Record<Band, number> {
  const out = zero();
  for (const value of windows) for (const w of new Set(windowList(value))) if ((BANDS as readonly string[]).includes(w)) out[w as Band] += 1;
  return out;
}

/** Onboarding's weekly study plan: minutes per weekday name. */
export function weeklyStudyMinutes(availability: unknown): number | null {
  let v = availability;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  let minutes = 0;
  for (const [day, amount] of Object.entries(v as Record<string, unknown>)) {
    if (!WEEKDAYS.has(day)) continue;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return null;
    minutes += amount;
  }
  return minutes;
}

export function trackComparison(learners: Array<{ track: unknown; availability: unknown }>, tutors: Array<{ specialties: unknown; rules: Rule[] }>) {
  return TRACK_SPECIALTIES.map(({ track, specialty }) => {
    const onTrack = learners.filter((l) => l.track === track);
    const learnerMinutes = onTrack.reduce((s, l) => s + (weeklyStudyMinutes(l.availability) ?? 0), 0);
    const matching = tutors.filter((t) => windowList(t.specialties).includes(specialty));
    const tutorHours = round1(matching.reduce((s, t) => s + t.rules.reduce((m, r) => m + ruleMinutes(r), 0), 0) / 60);
    return {
      track, specialty, learners: onTrack.length, learner_weekly_hours: round1(learnerMinutes / 60), tutors: matching.length,
      tutor_weekly_hours: tutorHours, short_of_tutors: onTrack.length > 0 && tutorHours === 0,
    };
  });
}
