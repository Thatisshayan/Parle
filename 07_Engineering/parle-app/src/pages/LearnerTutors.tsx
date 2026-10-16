import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Filter,
  Languages,
  LoaderCircle,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Star,
  UserRound,
} from "lucide-react";
import { parleMarketplaceService } from "@/functions";
import { t, type TranslationKey } from "@/lib/i18n";
import {
  deriveOverallLevel,
  eligibleRatingAverage,
  scoreTutorMatch,
  topMatchReason,
  type LearnerMatchProfile,
  type MatchReason,
} from "@/lib/tutor-match-score";
import {
  calculateAvailabilityOverlap,
  expandTutorAvailability,
  findEarliestLearnerOverlap,
  parseTutorAvailability,
  type AvailabilityOverlap,
  type AvailabilityWindow,
  type LearnerTutorWindow,
} from "@/lib/tutor-availability";

type RatingSummary = { average: number; count: number } | null;
type PublicReview = {
  id: string;
  stars: number;
  comment: string;
  is_test_review: boolean;
  learner_label: string;
  tutor_reply: string;
};
type PublicTutor = {
  profile_id: string;
  display_name: string;
  headline: string;
  bio: string;
  photo_base64: string;
  photo_mime_type: string;
  specialties: string[];
  levels_taught: string[];
  spoken_languages: string[];
  hourly_rate_cents: number;
  intro_video_url: string;
  verified_certificate_labels: string[];
  availability: unknown;
  reviews: PublicReview[];
  rating_summary: RatingSummary;
};
type MatchContext = {
  main_goal: string;
  current_skill_values: number[];
  self_assessed_level: string;
  native_language: string;
  tutor_budget_band: string;
  tutor_windows: LearnerTutorWindow[];
  time_zone: string;
};
type MatchEntry = {
  tutor: PublicTutor;
  windows: AvailabilityWindow[];
  overlap: AvailabilityOverlap;
  score: number;
  rating: number | null;
  reason: string;
};

const SPECIALTY_KEYS: Record<string, TranslationKey> = {
  canada_immigration_tef_tcf: "tutorApplication.specialty.immigration",
  canadian_citizenship: "tutorApplication.specialty.citizenship",
  conversation: "tutorApplication.specialty.conversation",
  grammar: "tutorApplication.specialty.grammar",
  business_french: "tutorApplication.specialty.business",
  beginners: "tutorApplication.specialty.beginner",
};
const GOAL_KEYS: Record<string, TranslationKey> = {
  canada_immigration: "onboarding.goal.immigration",
  canadian_citizenship: "onboarding.goal.citizenship",
  conversation: "onboarding.goal.conversation",
  general_fluency: "onboarding.goal.general",
  work: "onboarding.goal.work",
  job_interview: "onboarding.goal.interview",
  school: "onboarding.goal.school",
  other: "onboarding.goal.other",
};
const LANGUAGE_KEYS: Record<string, TranslationKey> = {
  english: "language.english",
  french: "language.french",
  spanish: "language.spanish",
  portuguese: "language.portuguese",
  arabic: "language.arabic",
  persian: "language.persian",
  hindi: "language.hindi",
  punjabi: "language.punjabi",
  urdu: "language.urdu",
  tagalog: "language.tagalog",
  mandarin: "language.mandarin",
  vietnamese: "language.vietnamese",
  ukrainian: "language.ukrainian",
  russian: "language.russian",
  turkish: "language.turkish",
  other: "language.other",
};
const LEVEL_KEYS: Record<string, TranslationKey> = {
  A0: "tutorApplication.level.a0",
  A1: "tutorApplication.level.a1",
  A2: "tutorApplication.level.a2",
  B1: "tutorApplication.level.b1",
  B2: "tutorApplication.level.b2",
  C1: "tutorApplication.level.c1",
};
const VALID_WINDOWS: LearnerTutorWindow[] = [
  "weekday_morning",
  "weekday_afternoon",
  "weekday_evening",
  "weekend_morning",
  "weekend_afternoon",
  "weekend_evening",
];

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

async function marketplace(action: string, values: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const result = unwrap(await parleMarketplaceService({ action, ...values }));
  if (typeof result.error === "string" || result.status === "error") {
    throw new Error(typeof result.code === "string" ? result.code : typeof result.error === "string" ? result.error : "REQUEST_FAILED");
  }
  return result;
}

function safeStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function safeReview(value: unknown): PublicReview | null {
  if (!isObject(value) || typeof value.id !== "string" || !Number.isInteger(value.stars) || Number(value.stars) < 1 || Number(value.stars) > 5) return null;
  return {
    id: value.id,
    stars: Number(value.stars),
    comment: typeof value.comment === "string" ? value.comment : "",
    is_test_review: value.is_test_review === true,
    learner_label: typeof value.learner_label === "string" ? value.learner_label : "",
    tutor_reply: typeof value.tutor_reply === "string" ? value.tutor_reply : "",
  };
}

function safeTutor(value: unknown): PublicTutor | null {
  if (!isObject(value) || typeof value.profile_id !== "string" || !value.profile_id) return null;
  const summary = isObject(value.rating_summary) && Number.isFinite(value.rating_summary.average) && Number.isInteger(value.rating_summary.count) && Number(value.rating_summary.count) >= 3
    ? { average: Number(value.rating_summary.average), count: Number(value.rating_summary.count) }
    : null;
  const availability = value.availability;
  const reviews = Array.isArray(value.reviews) ? value.reviews.map(safeReview).filter((item): item is PublicReview => item !== null) : [];
  return {
    profile_id: value.profile_id,
    display_name: typeof value.display_name === "string" ? value.display_name : "",
    headline: typeof value.headline === "string" ? value.headline : "",
    bio: typeof value.bio === "string" ? value.bio : "",
    photo_base64: typeof value.photo_base64 === "string" ? value.photo_base64 : "",
    photo_mime_type: value.photo_mime_type === "image/png" ? "image/png" : value.photo_mime_type === "image/jpeg" ? "image/jpeg" : "",
    specialties: safeStrings(value.specialties),
    levels_taught: safeStrings(value.levels_taught),
    spoken_languages: safeStrings(value.spoken_languages),
    hourly_rate_cents: Number.isInteger(value.hourly_rate_cents) && Number(value.hourly_rate_cents) >= 1000 && Number(value.hourly_rate_cents) <= 15000 ? Number(value.hourly_rate_cents) : 0,
    intro_video_url: typeof value.intro_video_url === "string" ? value.intro_video_url : "",
    verified_certificate_labels: safeStrings(value.verified_certificate_labels),
    availability,
    reviews,
    rating_summary: summary,
  };
}

function safeMatchContext(value: unknown): MatchContext | null {
  if (!isObject(value)) return null;
  const windows = safeStrings(value.tutor_windows).filter((item): item is LearnerTutorWindow => VALID_WINDOWS.includes(item as LearnerTutorWindow));
  const skills = Array.isArray(value.current_skill_values)
    ? value.current_skill_values.filter((item): item is number => typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 5)
    : [];
  return {
    main_goal: typeof value.main_goal === "string" ? value.main_goal : "other",
    current_skill_values: skills,
    self_assessed_level: typeof value.self_assessed_level === "string" ? value.self_assessed_level : "",
    native_language: typeof value.native_language === "string" ? value.native_language : "",
    tutor_budget_band: typeof value.tutor_budget_band === "string" ? value.tutor_budget_band : "unspecified",
    tutor_windows: windows,
    time_zone: typeof value.time_zone === "string" && value.time_zone ? value.time_zone : "UTC",
  };
}

function specialtyLabel(value: string): string {
  return t(SPECIALTY_KEYS[value] ?? "tutorDiscovery.specialtyOther");
}

function goalLabel(value: string): string {
  return t(GOAL_KEYS[value] ?? "onboarding.goal.other");
}

function languageLabel(value: string): string {
  const key = LANGUAGE_KEYS[value.trim().toLowerCase()];
  return key ? t(key) : value;
}

function languageLabels(values: readonly string[]): string {
  return values.map(languageLabel).join(", ");
}

function levelLabel(value: string): string {
  const key = LEVEL_KEYS[value.trim().toUpperCase()];
  return key ? t(key) : value;
}

function levelLabels(values: readonly string[]): string {
  return values.map(levelLabel).join(", ");
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(cents / 100);
}

function formatListedTime(value: AvailabilityWindow, timeZone: string): string {
  try {
    const start = new Date(value.startUtc);
    const end = new Date(value.endUtc);
    const dateText = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", timeZone }).format(start);
    const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone });
    return `${dateText} · ${time.format(start)}–${time.format(end)}`;
  } catch {
    return t("tutorDiscovery.timeUnavailable");
  }
}

function photoSource(tutor: PublicTutor): string | null {
  if (!tutor.photo_base64 || !tutor.photo_mime_type) return null;
  return `data:${tutor.photo_mime_type};base64,${tutor.photo_base64}`;
}

function initials(value: string): string {
  return value.trim().split(/\s+/).slice(0, 2).map((word) => word[0] ?? "").join("").toUpperCase() || "P";
}

function ratingText(rating: number | null): string {
  return rating === null ? t("tutorDiscovery.newTutor") : t("tutorDiscovery.ratingValue").replace("{rating}", rating.toFixed(1));
}

function reasonText(
  reason: MatchReason,
  tutor: PublicTutor,
  earliest: AvailabilityWindow | null,
  timeZone: string,
  level: string | null,
  learner: MatchContext,
): string {
  const time = earliest ? formatListedTime(earliest, timeZone) : "";
  if ((reason.kind === "exact_specialty" || reason.kind === "related_specialty") && reason.specialty) {
    const specialty = specialtyLabel(reason.specialty);
    const key = reason.kind === "exact_specialty" ? "tutorDiscovery.reason.exactSpecialty" : "tutorDiscovery.reason.relatedSpecialty";
    return (time
      ? t("tutorDiscovery.reason.specialtyWithTime").replace("{specialty}", specialty).replace("{time}", time)
      : t(key).replace("{specialty}", specialty));
  }
  if (time) return t("tutorDiscovery.reason.listedTime").replace("{time}", time);
  if (reason.kind === "level" && level) return t("tutorDiscovery.reason.level").replace("{level}", levelLabel(level));
  if (reason.kind === "price") return t("tutorDiscovery.reason.price");
  if (reason.kind === "language") return t("tutorDiscovery.reason.language").replace("{language}", languageLabel(reason.language ?? t("tutorDiscovery.english")));
  return t("tutorDiscovery.reason.goal").replace("{goal}", goalLabel(learner.main_goal));
}

function parseCents(value: string): number | null {
  if (!value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

function TutorCard({ entry, timeZone }: { entry: MatchEntry; timeZone: string }) {
  const tutor = entry.tutor;
  const image = photoSource(tutor);
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.25 }}
      className="min-w-0 rounded-[1.55rem] border border-primary/10 bg-white p-4 shadow-[0_20px_50px_-42px_rgba(30,58,138,0.55)] transition hover:border-primary/25 sm:p-5"
    >
      <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
        <div className="relative h-[4.25rem] w-[4.25rem] shrink-0 overflow-hidden rounded-[1.25rem] bg-[#EEF2FA] sm:h-[4.75rem] sm:w-[4.75rem]">
          {image ? <img src={image} alt={t("tutorDiscovery.photoAlt").replace("{name}", tutor.display_name)} className="h-full w-full object-cover" /> : <span aria-hidden="true" className="flex h-full w-full items-center justify-center font-display text-lg font-extrabold text-primary">{initials(tutor.display_name)}</span>}
          {tutor.verified_certificate_labels.length > 0 && <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#236646] text-white" title={t("tutorDiscovery.verified")}><BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" /></span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="break-words font-display text-lg font-extrabold leading-tight tracking-[-0.035em] text-primary">{tutor.display_name || t("tutorDiscovery.unnamedTutor")}</h3>
              <p className="mt-1 break-words text-sm leading-5 text-foreground">{tutor.headline}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#F5F7FC] px-2.5 py-1.5 text-[10px] font-extrabold text-primary" aria-label={t("tutorDiscovery.matchScoreLabel").replace("{score}", String(entry.score))}>
              <Sparkles aria-hidden="true" className="h-3 w-3 text-[#C64D43]" />{entry.score}<span className="font-bold text-muted-foreground">{t("tutorDiscovery.scoreDenominator")}</span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-semibold">
            <span className={`inline-flex items-center gap-1.5 ${entry.rating === null ? "text-muted-foreground" : "text-[#865E1D]"}`}>
              {entry.rating === null ? <UserRound aria-hidden="true" className="h-3.5 w-3.5" /> : <Star aria-hidden="true" className="h-3.5 w-3.5 fill-current" />}
              {ratingText(entry.rating)}
              {entry.rating !== null && <span className="text-muted-foreground">· {t("tutorDiscovery.reviewCount").replace("{count}", String(tutor.rating_summary?.count ?? 0))}</span>}
            </span>
            {tutor.verified_certificate_labels.length > 0 && <span className="inline-flex items-center gap-1 text-[#236646]"><BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />{t("tutorDiscovery.verified")}</span>}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-t border-primary/10 pt-4">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-muted-foreground">{t("tutorDiscovery.rateLabel")}</p>
          <p className="mt-1 break-words font-display text-xl font-extrabold leading-tight text-primary">{formatMoney(tutor.hourly_rate_cents)}<span className="ml-1 text-xs font-bold text-muted-foreground">{t("tutorDiscovery.perHour")}</span></p>
        </div>
        <Link to={`/learner/tutors/${encodeURIComponent(tutor.profile_id)}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-primary px-3.5 text-xs font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 sm:px-4">
          {t("tutorDiscovery.viewProfile")}<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-[#FFF8F6] px-3.5 py-3 text-xs leading-5 text-[#75413D]">
        <Sparkles aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#A13F36]" />
        <p className="min-w-0 break-words">{entry.reason}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-semibold text-muted-foreground">
        {tutor.levels_taught.length > 0 && <span className="inline-flex items-center gap-1.5"><Check aria-hidden="true" className="h-3.5 w-3.5 text-[#236646]" />{t("tutorDiscovery.levels").replace("{levels}", levelLabels(tutor.levels_taught))}</span>}
        {tutor.spoken_languages.length > 0 && <span className="inline-flex items-center gap-1.5"><Languages aria-hidden="true" className="h-3.5 w-3.5" />{languageLabels(tutor.spoken_languages)}</span>}
      </div>
      <p className="sr-only">{t("tutorDiscovery.timeZoneForCard").replace("{zone}", timeZone)}</p>
    </motion.article>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0 space-y-1.5"><p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>{children}</div>;
}

const selectClass = "min-h-11 w-full min-w-0 rounded-xl border border-primary/15 bg-white px-3 text-sm text-foreground outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-[#F97362]/30";
const inputClass = "min-h-11 w-full min-w-0 rounded-xl border border-primary/15 bg-white px-3 text-sm text-foreground outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-[#F97362]/30";

export default function LearnerTutors() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tutors, setTutors] = useState<PublicTutor[]>([]);
  const [learner, setLearner] = useState<MatchContext | null>(null);
  const [asOf, setAsOf] = useState(new Date().toISOString());
  const [specialty, setSpecialty] = useState("all");
  const [language, setLanguage] = useState("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [ratingOnly, setRatingOnly] = useState(false);

  const loadTutors = useCallback(async () => {
    setState("loading");
    try {
      const result = await marketplace("learner_list_tutors");
      const context = safeMatchContext(result.match_context);
      if (!context) throw new Error("MATCH_CONTEXT_UNAVAILABLE");
      const listings = Array.isArray(result.tutors) ? result.tutors.map(safeTutor).filter((item): item is PublicTutor => item !== null) : [];
      setLearner(context);
      setTutors(listings);
      setAsOf(new Date().toISOString());
      setState("ready");
    } catch (error) {
      console.error("Approved tutors could not be loaded", error);
      setState("error");
    }
  }, []);

  useEffect(() => { void loadTutors(); }, [loadTutors]);

  const learnerLevel = useMemo(() => learner
    ? deriveOverallLevel(learner.current_skill_values, learner.self_assessed_level)
    : null, [learner]);
  const entries = useMemo<MatchEntry[]>(() => {
    if (!learner) return [];
    const learnerForScore: LearnerMatchProfile = {
      mainGoal: learner.main_goal,
      currentLevel: learnerLevel,
      nativeLanguage: learner.native_language,
      tutorBudgetBand: learner.tutor_budget_band,
    };
    const scored = tutors.map((tutor) => {
      const availability = parseTutorAvailability(tutor.availability);
      const windows = expandTutorAvailability(availability, { now: asOf, days: 14 });
      const overlap = calculateAvailabilityOverlap(windows, learner.tutor_windows, learner.time_zone, { now: asOf, days: 14 });
      const tutorForScore = {
        specialties: tutor.specialties,
        levelsTaught: tutor.levels_taught,
        spokenLanguages: tutor.spoken_languages,
        hourlyRateCents: tutor.hourly_rate_cents,
        ratingAverage: tutor.rating_summary?.average ?? null,
        ratingCount: tutor.rating_summary?.count ?? 0,
      };
      const score = scoreTutorMatch({ learner: learnerForScore, tutor: tutorForScore, availabilityOverlapRatio: overlap.ratio });
      const rating = eligibleRatingAverage(tutor.rating_summary?.average, tutor.rating_summary?.count);
      const reason = topMatchReason({ learner: learnerForScore, tutor: tutorForScore, availabilityOverlapRatio: overlap.ratio });
      const earliest = learner.tutor_windows.length
        ? findEarliestLearnerOverlap(windows, learner.tutor_windows, learner.time_zone, { now: asOf, days: 14 })
        : null;
      return {
        tutor,
        windows,
        overlap,
        score: score.total,
        rating,
        reason: reasonText(reason, tutor, earliest, learner.time_zone, learnerLevel, learner),
      };
    });
    return scored.sort((left, right) => right.score - left.score || (right.rating ?? -1) - (left.rating ?? -1) || left.tutor.profile_id.localeCompare(right.tutor.profile_id));
  }, [asOf, learner, learnerLevel, tutors]);

  const minCents = parseCents(minPrice);
  const maxCents = parseCents(maxPrice);
  const invalidPriceRange = minCents !== null && maxCents !== null && minCents > maxCents;
  const languages = useMemo(() => [...new Set(tutors.flatMap((tutor) => tutor.spoken_languages))].sort((a, b) => a.localeCompare(b)), [tutors]);
  const filteredEntries = useMemo(() => {
    if (invalidPriceRange) return [];
    return entries.filter((entry) => {
      if (specialty !== "all" && !entry.tutor.specialties.includes(specialty)) return false;
      if (language !== "all" && !entry.tutor.spoken_languages.includes(language)) return false;
      if (minCents !== null && entry.tutor.hourly_rate_cents < minCents) return false;
      if (maxCents !== null && entry.tutor.hourly_rate_cents > maxCents) return false;
      if (availableOnly && !entry.overlap.hasOverlap) return false;
      if (ratingOnly && !(entry.rating !== null && entry.rating >= 4)) return false;
      return true;
    });
  }, [availableOnly, entries, invalidPriceRange, language, maxCents, minCents, ratingOnly, specialty]);
  const hasFilters = specialty !== "all" || language !== "all" || minPrice !== "" || maxPrice !== "" || availableOnly || ratingOnly;

  function clearFilters() {
    setSpecialty("all");
    setLanguage("all");
    setMinPrice("");
    setMaxPrice("");
    setAvailableOnly(false);
    setRatingOnly(false);
  }

  if (state === "loading") {
    return <div className="flex min-h-[320px] items-center justify-center rounded-[1.7rem] border border-primary/10 bg-white p-8" role="status" aria-live="polite"><div className="text-center"><LoaderCircle aria-hidden="true" className="mx-auto h-8 w-8 animate-spin text-primary" /><p className="mt-4 text-sm font-semibold text-muted-foreground">{t("tutorDiscovery.loading")}</p></div></div>;
  }
  if (state === "error") {
    return <section className="rounded-[1.7rem] border border-[#F0C5C0] bg-white p-6 sm:p-8" role="alert"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><CircleAlert aria-hidden="true" className="h-5 w-5" /></span><h2 className="mt-4 font-display text-xl font-extrabold text-primary">{t("tutorDiscovery.loadErrorTitle")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("tutorDiscovery.loadErrorBody")}</p><button type="button" onClick={() => void loadTutors()} className="parle-button-primary mt-5 justify-center"><RefreshCw aria-hidden="true" className="h-4 w-4" />{t("tutorDiscovery.retry")}</button></section>;
  }

  const noWindows = !learner?.tutor_windows.length;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }} className="min-w-0 space-y-5">
      <section className="relative overflow-hidden rounded-[1.7rem] bg-primary px-5 py-6 text-white shadow-[0_26px_70px_-42px_rgba(30,58,138,0.72)] sm:px-7 sm:py-8">
        <div aria-hidden="true" className="absolute -right-12 -top-16 h-48 w-48 rounded-full border-[22px] border-white/5" />
        <div aria-hidden="true" className="absolute -bottom-16 right-20 h-36 w-36 rounded-full bg-[#F97362]/20 blur-2xl" />
        <div className="relative max-w-3xl">
          <p className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#FFC0B4]"><Sparkles aria-hidden="true" className="h-3.5 w-3.5" />{t("tutorDiscovery.eyebrow")}</p>
          <h2 className="mt-3 font-display text-2xl font-extrabold leading-tight tracking-[-0.045em] sm:text-3xl">{t("tutorDiscovery.heading")}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">{t("tutorDiscovery.intro")}</p>
          {learner && <p className="mt-4 inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-bold text-white"><span>{t("tutorDiscovery.matchingFor").replace("{goal}", goalLabel(learner.main_goal))}</span><span aria-hidden="true" className="text-white/50">·</span><span>{learnerLevel ? levelLabel(learnerLevel) : t("tutorDiscovery.levelNotSet")}</span><span aria-hidden="true" className="text-white/50">·</span><span>{learner.time_zone}</span></p>}
        </div>
      </section>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(230px,0.34fr)_minmax(0,1fr)]">
        <aside className="min-w-0 self-start rounded-[1.45rem] border border-primary/10 bg-white p-4 shadow-[0_18px_46px_-40px_rgba(30,58,138,0.5)] sm:p-5 lg:sticky lg:top-24" aria-labelledby="tutor-filter-heading">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEF2FA] text-primary"><SlidersHorizontal aria-hidden="true" className="h-4 w-4" /></span><h2 id="tutor-filter-heading" className="font-display text-base font-extrabold text-primary">{t("tutorDiscovery.filtersTitle")}</h2></div>
            {hasFilters && <button type="button" onClick={clearFilters} className="min-h-9 rounded-full px-2 text-xs font-bold text-[#A13F36] transition hover:bg-[#FFF0EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362]">{t("tutorDiscovery.clearFilters")}</button>}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <FilterField label={t("tutorDiscovery.specialtyFilter")}>
              <div className="relative"><select aria-label={t("tutorDiscovery.specialtyFilter")} value={specialty} onChange={(event) => setSpecialty(event.target.value)} className={selectClass}><option value="all">{t("tutorDiscovery.anySpecialty")}</option>{Object.entries(SPECIALTY_KEYS).map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /></div>
            </FilterField>
            <FilterField label={t("tutorDiscovery.priceFilter")}>
              <div className="grid grid-cols-2 gap-2"><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">$</span><input aria-label={t("tutorDiscovery.minimumPrice")} type="number" inputMode="decimal" min="0" max="150" step="0.01" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder={t("tutorDiscovery.minPlaceholder")} className={`${inputClass} pl-7`} /></div><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">$</span><input aria-label={t("tutorDiscovery.maximumPrice")} type="number" inputMode="decimal" min="0" max="150" step="0.01" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder={t("tutorDiscovery.maxPlaceholder")} className={`${inputClass} pl-7`} /></div></div>
              <p className={`text-[11px] leading-4 ${invalidPriceRange ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{t(invalidPriceRange ? "tutorDiscovery.invalidPriceRange" : "tutorDiscovery.priceRangeHelp")}</p>
            </FilterField>
            <FilterField label={t("tutorDiscovery.languageFilter")}>
              <div className="relative"><select aria-label={t("tutorDiscovery.languageFilter")} value={language} onChange={(event) => setLanguage(event.target.value)} className={selectClass}><option value="all">{t("tutorDiscovery.anyLanguage")}</option>{languages.map((item) => <option key={item} value={item}>{languageLabel(item)}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /></div>
            </FilterField>
          </div>
          <div className="mt-4 space-y-2.5 border-t border-primary/10 pt-4">
            <label className={`flex min-h-11 items-start gap-3 rounded-xl px-2 py-2 text-sm leading-5 ${noWindows ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-[#F7F8FB]"}`}>
              <input type="checkbox" checked={availableOnly} disabled={noWindows} onChange={(event) => setAvailableOnly(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#1E3A8A]" />
              <span className="min-w-0"><span className="block font-bold text-foreground">{t("tutorDiscovery.availableInWindows")}</span>{noWindows && <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{t("tutorDiscovery.windowsSetupNote")}</span>}</span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-2 py-2 text-sm leading-5 transition hover:bg-[#F7F8FB]"><input type="checkbox" checked={ratingOnly} onChange={(event) => setRatingOnly(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#1E3A8A]" /><span className="font-bold text-foreground">{t("tutorDiscovery.ratingFilter")}</span></label>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#F7F8FB] px-3 py-3 text-[11px] leading-5 text-muted-foreground"><Filter aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /><p>{t("tutorDiscovery.filtersCombineNote")}</p></div>
        </aside>

        <section className="min-w-0" aria-labelledby="tutor-results-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#C64D43]">{t("tutorDiscovery.resultsEyebrow")}</p><h2 id="tutor-results-heading" className="mt-1 font-display text-xl font-extrabold tracking-[-0.035em] text-primary">{t("tutorDiscovery.resultsTitle")}</h2></div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF2FA] px-3 py-1.5 text-xs font-extrabold text-primary"><CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />{t("tutorDiscovery.resultCount").replace("{count}", String(filteredEntries.length))}</span>
          </div>
          {tutors.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-primary/20 bg-white p-6 text-center sm:p-8"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary"><UserRound aria-hidden="true" className="h-6 w-6" /></span><h3 className="mt-4 font-display text-lg font-extrabold text-primary">{t("tutorDiscovery.emptyDirectoryTitle")}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t("tutorDiscovery.emptyDirectoryBody")}</p></div>
          ) : filteredEntries.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-primary/20 bg-white p-6 text-center sm:p-8"><h3 className="font-display text-lg font-extrabold text-primary">{t("tutorDiscovery.noMatchesTitle")}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t("tutorDiscovery.noMatchesBody")}</p><button type="button" onClick={clearFilters} className="parle-button-secondary mt-5 justify-center">{t("tutorDiscovery.clearFilters")}</button></div>
          ) : (
            <div className="space-y-3.5">{filteredEntries.map((entry) => <TutorCard key={entry.tutor.profile_id} entry={entry} timeZone={learner?.time_zone ?? "UTC"} />)}</div>
          )}
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-[#C9D7EE] bg-[#F5F8FD] px-3.5 py-3 text-xs leading-5 text-primary"><Clock3 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("tutorDiscovery.availabilityIsListed")}</p>
        </section>
      </div>
    </motion.div>
  );
}
