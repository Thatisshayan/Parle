export type GoalFit = "exact" | "related" | "none";
export type MatchReasonKind = "exact_specialty" | "related_specialty" | "availability" | "level" | "price" | "language" | "goal";

export interface LearnerMatchProfile {
  mainGoal: string;
  currentLevel?: string | null;
  nativeLanguage?: string | null;
  tutorBudgetBand?: string | null;
}

export interface TutorMatchProfile {
  specialties?: readonly unknown[];
  levelsTaught?: readonly unknown[];
  spokenLanguages?: readonly unknown[];
  hourlyRateCents?: number | null;
  ratingAverage?: number | null;
  ratingCount?: number | null;
}

export interface MatchScoreBreakdown {
  goal: number;
  level: number;
  availability: number;
  price: number;
  language: number;
  total: number;
}

export interface MatchReason {
  kind: MatchReasonKind;
  specialty?: string;
  language?: string;
}

/** Curated goal-to-specialty links. Unknown and learner-written goals never fuzzy-match. */
export const GOAL_SPECIALTY_FIT: Readonly<Record<string, { exact: readonly string[]; related: readonly string[] }>> = {
  canada_immigration: {
    exact: ["canada_immigration_tef_tcf"],
    related: ["canadian_citizenship", "grammar", "conversation"],
  },
  canadian_citizenship: {
    exact: ["canadian_citizenship"],
    related: ["canada_immigration_tef_tcf", "conversation"],
  },
  conversation: {
    exact: ["conversation"],
    related: ["beginners", "grammar"],
  },
  general_fluency: {
    exact: [],
    related: ["conversation", "grammar", "beginners"],
  },
  work: {
    exact: ["business_french"],
    related: ["conversation", "grammar"],
  },
  job_interview: {
    exact: ["business_french"],
    related: ["conversation", "grammar"],
  },
  school: {
    exact: ["grammar"],
    related: ["beginners", "conversation"],
  },
  other: { exact: [], related: [] },
};

export const CEFR_ANCHORS = ["A0", "A1", "A2", "B1", "B2", "C1"] as const;

function normalizedTokens(values: readonly unknown[] | undefined): Set<string> {
  return new Set((values ?? []).filter((value): value is string => typeof value === "string").map((value) => value.trim().toLocaleLowerCase()).filter(Boolean));
}

/** Returns the curated match class for a learner goal and the tutor's specialty keys. */
export function goalSpecialtyFit(goal: unknown, specialties: readonly unknown[] | undefined): GoalFit {
  if (typeof goal !== "string") return "none";
  const definition = GOAL_SPECIALTY_FIT[goal.trim()];
  if (!definition) return "none";
  const tutor = normalizedTokens(specialties);
  if (definition.exact.some((item) => tutor.has(item.toLocaleLowerCase()))) return "exact";
  if (definition.related.some((item) => tutor.has(item.toLocaleLowerCase()))) return "related";
  return "none";
}

function validLevel(value: unknown): value is typeof CEFR_ANCHORS[number] {
  return typeof value === "string" && CEFR_ANCHORS.includes(value.trim().toUpperCase() as typeof CEFR_ANCHORS[number]);
}

/** Average finite 0–5 skill scores and snap to a CEFR anchor, rounding ties up like learner displays. */
export function deriveOverallLevel(skillValues: readonly unknown[], fallbackLevel?: unknown): string | null {
  const values = skillValues.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 5);
  if (values.length) {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const anchorIndex = Math.min(CEFR_ANCHORS.length - 1, Math.floor(mean + 0.5));
    return CEFR_ANCHORS[anchorIndex];
  }
  return validLevel(fallbackLevel) ? fallbackLevel.trim().toUpperCase() : null;
}

/** Tutors start at A1, so a learner's A0 estimate is compared against A1. */
export function levelForTutorMatching(level: unknown): string | null {
  if (!validLevel(level)) return null;
  const normalized = level.trim().toUpperCase();
  return normalized === "A0" ? "A1" : normalized;
}

export function priceFitPoints(hourlyRateCents: unknown, budgetBand: unknown): number {
  const cents = typeof hourlyRateCents === "number" && Number.isFinite(hourlyRateCents) ? hourlyRateCents : Number.NaN;
  if (!Number.isFinite(cents) || cents < 0) return 0;
  const band = typeof budgetBand === "string" ? budgetBand : "";
  if (band === "none") return 0;
  if (!band || band === "unspecified" || band === "50_plus") return 15;
  const ceilingByBand: Record<string, number> = { under_20: 20, "20_35": 35, "35_50": 50 };
  const ceiling = ceilingByBand[band];
  if (ceiling === undefined) return 15;
  const hourlyDollars = cents / 100;
  if (hourlyDollars <= ceiling) return 15;
  if (hourlyDollars <= ceiling * 1.2) return 7.5;
  return 0;
}

function matchedLanguage(nativeLanguage: unknown, spokenLanguages: readonly unknown[] | undefined): { label: string; isNative: boolean } | null {
  const spoken = normalizedTokens(spokenLanguages);
  const nativeLabel = typeof nativeLanguage === "string" ? nativeLanguage.trim() : "";
  const native = nativeLabel.toLocaleLowerCase();
  if (nativeLabel && native !== "other" && spoken.has(native)) return { label: nativeLabel, isNative: true };
  if (spoken.has("english")) return { label: "English", isNative: false };
  return null;
}

export function sharedLanguagePoints(nativeLanguage: unknown, spokenLanguages: readonly unknown[] | undefined): number {
  const match = matchedLanguage(nativeLanguage, spokenLanguages);
  if (!match) return 0;
  return match.isNative ? 10 : 5;
}

export function eligibleRatingAverage(ratingAverage: unknown, ratingCount: unknown): number | null {
  const average = typeof ratingAverage === "number" && Number.isFinite(ratingAverage) ? ratingAverage : Number.NaN;
  const count = typeof ratingCount === "number" && Number.isFinite(ratingCount) ? ratingCount : 0;
  return count >= 3 && average >= 1 && average <= 5 ? average : null;
}

export function scoreTutorMatch(input: {
  learner: LearnerMatchProfile;
  tutor: TutorMatchProfile;
  availabilityOverlapRatio?: number | null;
}): MatchScoreBreakdown {
  const goalFit = goalSpecialtyFit(input.learner.mainGoal, input.tutor.specialties);
  const goal = goalFit === "exact" ? 30 : goalFit === "related" ? 15 : 0;
  const matchLevel = levelForTutorMatching(input.learner.currentLevel);
  const taught = normalizedTokens(input.tutor.levelsTaught);
  const level = matchLevel && taught.has(matchLevel.toLocaleLowerCase()) ? 20 : 0;
  const rawOverlap = typeof input.availabilityOverlapRatio === "number" && Number.isFinite(input.availabilityOverlapRatio)
    ? Math.max(0, Math.min(1, input.availabilityOverlapRatio))
    : 0;
  const availability = 25 * rawOverlap;
  const price = priceFitPoints(input.tutor.hourlyRateCents, input.learner.tutorBudgetBand);
  const language = sharedLanguagePoints(input.learner.nativeLanguage, input.tutor.spokenLanguages);
  const total = Math.max(0, Math.min(100, Math.round(goal + level + availability + price + language)));
  return { goal, level, availability, price, language, total };
}

/** Deterministic reason hierarchy, independent of rating and AI. */
export function topMatchReason(input: {
  learner: LearnerMatchProfile;
  tutor: TutorMatchProfile;
  availabilityOverlapRatio?: number | null;
}): MatchReason {
  const fit = goalSpecialtyFit(input.learner.mainGoal, input.tutor.specialties);
  if (fit !== "none") {
    const definition = GOAL_SPECIALTY_FIT[input.learner.mainGoal];
    const tokens = normalizedTokens(input.tutor.specialties);
    const specialty = fit === "exact"
      ? definition.exact.find((item) => tokens.has(item.toLocaleLowerCase()))
      : definition.related.find((item) => tokens.has(item.toLocaleLowerCase()));
    return { kind: fit === "exact" ? "exact_specialty" : "related_specialty", specialty };
  }
  if (typeof input.availabilityOverlapRatio === "number" && input.availabilityOverlapRatio > 0) return { kind: "availability" };
  const matchLevel = levelForTutorMatching(input.learner.currentLevel);
  if (matchLevel && normalizedTokens(input.tutor.levelsTaught).has(matchLevel.toLocaleLowerCase())) return { kind: "level" };
  if (priceFitPoints(input.tutor.hourlyRateCents, input.learner.tutorBudgetBand) > 0) return { kind: "price" };
  const language = matchedLanguage(input.learner.nativeLanguage, input.tutor.spokenLanguages);
  if (language) return { kind: "language", language: language.label };
  return { kind: "goal" };
}
