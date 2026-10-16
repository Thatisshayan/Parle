import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Check,
  CircleAlert,
  Clock3,
  GraduationCap,
  Languages,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  UserRound,
  Video,
} from "lucide-react";
import { parleMarketplaceService } from "@/functions";
import { bookLesson, dateKeyInTimeZone, formatCadCents, lessonErrorKey, loadBookingOptions, type BookingOptions } from "@/lib/parle-booking";
import { t, type TranslationKey } from "@/lib/i18n";
import {
  tutorProfileFailurePresentation,
  tutorProfileLoadFailureKindFromError,
  type TutorProfileFailureKind,
} from "@/lib/tutor-profile-load-state";
import {
  generateBookableSlots,
  safeBookingSettings,
  type BookingSchedule,
  type BookableSlot,
} from "../../functions/parle-booking-slots.helper.ts";
import { canRequestTutorLessonFromProfile, isPublishedTutorPublicProfile, TUTOR_STYLES } from "../../functions/parle-marketplace.helper.ts";

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
  teaching_styles: string[];
  hourly_rate_cents: number;
  intro_video_url: string;
  verified_certificate_labels: string[];
  availability: unknown;
  booking_schedule: BookingSchedule;
  reviews: PublicReview[];
  rating_summary: RatingSummary;
};
type MatchContext = { time_zone: string };

const SPECIALTY_KEYS: Record<string, TranslationKey> = {
  canada_immigration_tef_tcf: "tutorApplication.specialty.immigration",
  canadian_citizenship: "tutorApplication.specialty.citizenship",
  conversation: "tutorApplication.specialty.conversation",
  grammar: "tutorApplication.specialty.grammar",
  business_french: "tutorApplication.specialty.business",
  beginners: "tutorApplication.specialty.beginner",
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
const STYLE_KEYS: Record<string, TranslationKey> = {
  patient: "tutorApplication.style.patient",
  structured: "tutorApplication.style.structured",
  conversation_led: "tutorApplication.style.conversationLed",
  exam_focused: "tutorApplication.style.examFocused",
  correction_focused: "tutorApplication.style.correctionFocused",
  confidence_building: "tutorApplication.style.confidence",
  practical_examples: "tutorApplication.style.practical",
};

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

function safeTeachingStyles(value: unknown): string[] {
  const allowed = new Set<string>(TUTOR_STYLES);
  return [...new Set(safeStrings(value).filter((style) => allowed.has(style)))];
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
  const summary = isObject(value.rating_summary) && typeof value.rating_summary.average === "number" && Number.isFinite(value.rating_summary.average) && typeof value.rating_summary.count === "number" && Number.isInteger(value.rating_summary.count) && value.rating_summary.count >= 3
    ? { average: value.rating_summary.average, count: value.rating_summary.count }
    : null;
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
    teaching_styles: safeTeachingStyles(value.teaching_styles),
    hourly_rate_cents: typeof value.hourly_rate_cents === "number" && Number.isInteger(value.hourly_rate_cents) && value.hourly_rate_cents >= 1000 && value.hourly_rate_cents <= 15000 ? value.hourly_rate_cents : 0,
    intro_video_url: typeof value.intro_video_url === "string" ? value.intro_video_url : "",
    verified_certificate_labels: safeStrings(value.verified_certificate_labels),
    availability: value.availability,
    booking_schedule: safeBookingSchedule(value.booking_schedule, value.availability),
    reviews,
    rating_summary: summary,
  };
}

function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value.trim() }); return true; } catch { return false; }
}

function safeTimeZone(value: unknown): string {
  return validTimeZone(value) ? value.trim() : "UTC";
}

function validCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function safeBookingSchedule(value: unknown, fallbackAvailability: unknown): BookingSchedule {
  const source = isObject(value) ? value : {};
  const fallback = isObject(fallbackAvailability) ? fallbackAvailability : {};
  const rawRules = Array.isArray(source.rules) ? source.rules : fallback.rules;
  const rawExceptions = Array.isArray(source.exceptions) ? source.exceptions : fallback.exceptions;
  const rules = (Array.isArray(rawRules) ? rawRules : []).flatMap((item) => {
    if (!isObject(item) || typeof item.day_of_week !== "number" || !Number.isInteger(item.day_of_week) || item.day_of_week < 1 || item.day_of_week > 7 || typeof item.start_local !== "string" || typeof item.end_local !== "string" || item.start_local >= item.end_local || !validTimeZone(item.time_zone)) return [];
    return [{ day_of_week: item.day_of_week, start_local: item.start_local, end_local: item.end_local, time_zone: item.time_zone.trim() }];
  });
  const exceptions = (Array.isArray(rawExceptions) ? rawExceptions : []).flatMap((item) => {
    if (!isObject(item) || !validCalendarDate(item.date_local) || !validTimeZone(item.time_zone)) return [];
    if (item.kind === "off") return [{ date_local: item.date_local, kind: "off" as const, time_zone: item.time_zone.trim() }];
    if (item.kind === "extra" && typeof item.start_local === "string" && typeof item.end_local === "string" && item.start_local < item.end_local) {
      return [{ date_local: item.date_local, kind: "extra" as const, start_local: item.start_local, end_local: item.end_local, time_zone: item.time_zone.trim() }];
    }
    return [];
  });
  const busyIntervals = (Array.isArray(source.busy_intervals) ? source.busy_intervals : []).flatMap((item) => {
    if (!isObject(item) || typeof item.start_utc !== "string" || typeof item.end_utc !== "string") return [];
    const start = Date.parse(item.start_utc);
    const end = Date.parse(item.end_utc);
    return Number.isFinite(start) && Number.isFinite(end) && end > start
      ? [{ start_utc: new Date(start).toISOString(), end_utc: new Date(end).toISOString() }]
      : [];
  }).slice(0, 1000);
  return { rules, exceptions, settings: safeBookingSettings(source.settings), busy_intervals: busyIntervals };
}

function languageLabel(value: string): string {
  const key = LANGUAGE_KEYS[value.trim().toLowerCase()];
  return key ? t(key) : value;
}

function styleLabel(value: string): string {
  const key = STYLE_KEYS[value];
  return key ? t(key) : value;
}

function levelLabel(value: string): string {
  const key = LEVEL_KEYS[value.trim().toUpperCase()];
  return key ? t(key) : value;
}

function levelLabels(values: readonly string[]): string {
  return values.map(levelLabel).join(", ");
}

function embedUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (["youtube.com", "m.youtube.com", "youtu.be"].includes(host)) {
      const segments = url.pathname.split("/").filter(Boolean);
      const videoId = host === "youtu.be"
        ? segments[0]
        : url.searchParams.get("v") || (segments[0] === "embed" || segments[0] === "shorts" ? segments[1] : "");
      return videoId && /^[A-Za-z0-9_-]{6,20}$/.test(videoId) ? `https://www.youtube-nocookie.com/embed/${videoId}` : null;
    }
    if (["vimeo.com", "player.vimeo.com"].includes(host)) {
      const videoId = url.pathname.split("/").filter(Boolean).find((segment) => /^\d{5,15}$/.test(segment));
      return videoId ? `https://player.vimeo.com/video/${videoId}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(cents / 100);
}

function sessionPrice(hourlyCents: number, minutes: 30 | 45 | 60): string {
  return formatMoney(Math.round(hourlyCents * minutes / 60));
}

function photoSource(tutor: PublicTutor): string | null {
  return tutor.photo_base64 && tutor.photo_mime_type ? `data:${tutor.photo_mime_type};base64,${tutor.photo_base64}` : null;
}

function initials(value: string): string {
  return value.trim().split(/\s+/).slice(0, 2).map((word) => word[0] ?? "").join("").toUpperCase() || "P";
}

function formatSlot(slot: Pick<BookableSlot, "startUtc" | "endUtc">, timeZone: string): string {
  try {
    const start = new Date(slot.startUtc);
    const end = new Date(slot.endUtc);
    const dateFormatter = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric", timeZone });
    const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone });
    const startDate = dateFormatter.format(start);
    const endDate = dateFormatter.format(end);
    return startDate === endDate
      ? `${startDate} · ${timeFormatter.format(start)}–${timeFormatter.format(end)}`
      : `${startDate} · ${timeFormatter.format(start)} – ${endDate} · ${timeFormatter.format(end)}`;
  } catch {
    return t("tutorProfile.timeUnavailable");
  }
}

function formatLocalDay(value: string): string {
  if (!validCalendarDate(value)) return value;
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })
      .format(new Date(`${value}T12:00:00.000Z`));
  } catch {
    return value;
  }
}

function formatSlotStart(value: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(value));
  } catch {
    return t("tutorProfile.timeUnavailable");
  }
}

function ReviewStars({ stars, label }: { stars: number; label: string }) {
  return <div className="flex items-center gap-0.5 text-[#9A6B20]" role="img" aria-label={label}>{Array.from({ length: 5 }, (_, index) => <Star key={index} aria-hidden="true" className={`h-3.5 w-3.5 ${index < stars ? "fill-current" : ""}`} />)}</div>;
}

function ratingLabel(rating: RatingSummary): string {
  return rating
    ? t("tutorDiscovery.ratingSummary").replace("{rating}", rating.average.toFixed(1)).replace("{count}", String(rating.count))
    : t("tutorDiscovery.newTutor");
}

export function TutorProfileFailureCard({
  kind,
  tutorPreview = false,
  onRetry,
}: {
  kind: TutorProfileFailureKind;
  tutorPreview?: boolean;
  onRetry: () => void;
}) {
  const presentation = tutorProfileFailurePresentation(kind, tutorPreview);
  if (kind === "not_found") {
    return (
      <section className="w-full min-w-0 rounded-[1.7rem] border border-primary/10 bg-white p-5 text-center shadow-[0_20px_56px_-48px_rgba(30,58,138,0.45)] sm:p-10">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary"><UserRound aria-hidden="true" className="h-6 w-6" /></span>
        <h2 className="mt-4 break-words font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{t(presentation.titleKey)}</h2>
        <p className="mx-auto mt-2 max-w-md break-words text-sm leading-6 text-muted-foreground">{t(presentation.bodyKey)}</p>
        <Link to={presentation.destination ?? "/learner/tutors"} className="parle-button-primary mt-6 w-full justify-center sm:w-auto"><ArrowLeft aria-hidden="true" className="h-4 w-4" />{t(presentation.actionKey)}</Link>
      </section>
    );
  }

  return (
    <section className="w-full min-w-0 rounded-[1.7rem] border border-[#F0C5C0] bg-white p-5 sm:p-8" role="alert">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><CircleAlert aria-hidden="true" className="h-5 w-5" /></span>
      <h2 className="mt-4 break-words font-display text-xl font-extrabold text-primary">{t(presentation.titleKey)}</h2>
      <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">{t(presentation.bodyKey)}</p>
      <button type="button" onClick={onRetry} className="parle-button-primary mt-5 w-full justify-center sm:w-auto"><RefreshCw aria-hidden="true" className="h-4 w-4" />{t(presentation.actionKey)}</button>
    </section>
  );
}

export default function LearnerTutorProfile({ profileId = "", tutorPreview = false }: { profileId?: string; tutorPreview?: boolean }) {
  const [status, setStatus] = useState<"loading" | "ready" | "not_found" | "error">("loading");
  const [tutor, setTutor] = useState<PublicTutor | null>(null);
  const [timeZone, setTimeZone] = useState("UTC");
  const [asOf, setAsOf] = useState(new Date().toISOString());
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedStartUtc, setSelectedStartUtc] = useState("");
  const [learnerMessage, setLearnerMessage] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState<TranslationKey | null>(null);
  const [options, setOptions] = useState<BookingOptions | null>(null);
  const requestInFlight = useRef(false);
  const canRequestLesson = canRequestTutorLessonFromProfile(tutorPreview ? "tutor-preview" : "learner");

  const loadProfile = useCallback(async () => {
    setStatus("loading");
    try {
      if (!tutorPreview && !profileId) throw new Error("NOT_FOUND");
      const result = tutorPreview
        ? await marketplace("tutor_get_public_preview")
        : await marketplace("learner_get_tutor", { profile_id: profileId });
      if (!isPublishedTutorPublicProfile(result.tutor)) throw new Error("NOT_FOUND");
      const safe = safeTutor(result.tutor);
      if (!safe) throw new Error("NOT_FOUND");
      const context = isObject(result.match_context) ? result.match_context : {};
      const scheduleTimeZone = safe.booking_schedule.rules.find((rule) => validTimeZone(rule.time_zone))?.time_zone
        ?? safe.booking_schedule.exceptions.find((exception) => validTimeZone(exception.time_zone))?.time_zone;
      // live busy times, offered lengths and prices (Plan 7A); the tutor's own preview has none
      const bookingOptions = tutorPreview ? null : await loadBookingOptions(profileId).catch((error) => {
        console.error("Booking times could not be loaded", error);
        return null;
      });
      setTutor(safe);
      setOptions(bookingOptions);
      setTimeZone(safeTimeZone(bookingOptions?.timeZone ?? context.time_zone ?? (tutorPreview ? scheduleTimeZone : undefined)));
      setAsOf(new Date().toISOString());
      setStatus("ready");
    } catch (error) {
      console.error("Approved tutor profile could not be loaded", error);
      setTutor(null);
      setStatus(await tutorProfileLoadFailureKindFromError(error));
    }
  }, [profileId, tutorPreview]);

  useEffect(() => {
    setSelectedDuration(null);
    setSelectedDay("");
    setSelectedStartUtc("");
    setLearnerMessage("");
    setRequestError(null);
    setOptions(null);
    void loadProfile();
  }, [loadProfile]);

  const bookableSlots = useMemo(() => {
    if (!tutor) return [];
    if (!options) return generateBookableSlots(tutor.booking_schedule, { now: asOf, windowDays: 30 });
    return generateBookableSlots(
      { ...tutor.booking_schedule, busy_intervals: options.busyIntervals },
      { now: asOf, windowDays: options.horizonDays, minimumNoticeHours: options.minimumNoticeHours, lengths: options.offeredLengths },
    );
  }, [asOf, tutor, options]);
  const enabledLessonLengths = useMemo(() => options
    ? options.offeredLengths
    : tutor ? safeBookingSettings(tutor.booking_schedule.settings).lesson_lengths_minutes : [], [tutor, options]);
  const activeDuration = selectedDuration !== null && enabledLessonLengths.includes(selectedDuration)
    ? selectedDuration
    : enabledLessonLengths[0] ?? null;
  const durationSlots = activeDuration === null
    ? []
    : bookableSlots.filter((slot) => slot.durationMinutes === activeDuration);
  const availableDays = [...new Set(durationSlots.map((slot) => dateKeyInTimeZone(slot.startUtc, timeZone)).filter(Boolean))];
  const activeDay = availableDays.includes(selectedDay) ? selectedDay : availableDays[0] ?? "";
  const slotsForDay = durationSlots.filter((slot) => dateKeyInTimeZone(slot.startUtc, timeZone) === activeDay);
  const activeSlot = slotsForDay.find((slot) => slot.startUtc === selectedStartUtc) ?? slotsForDay[0] ?? null;
  const videoEmbed = tutor ? embedUrl(tutor.intro_video_url) : null;
  const photo = tutor ? photoSource(tutor) : null;

  // Back from Stripe's page with the browser's Back button restores this page as it was ("Booking..."): reset it.
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      requestInFlight.current = false;
      setRequestBusy(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canRequestLesson || requestInFlight.current || !tutor || !activeSlot || !options?.canBook) return;
    requestInFlight.current = true;
    setRequestBusy(true);
    setRequestError(null);
    try {
      const booked = await bookLesson({ profileId: tutor.profile_id, startUtc: activeSlot.startUtc, minutes: activeSlot.durationMinutes, message: learnerMessage });
      window.location.assign(booked.checkoutUrl); // Stripe's page; only Stripe's payment event confirms the lesson
    } catch (error) {
      const code = error instanceof Error ? error.message : "REQUEST_FAILED";
      console.error("Lesson could not be booked", code);
      if (code === "SLOT_TAKEN" || code === "NOTICE_TOO_SHORT" || code === "TUTOR_NOT_AVAILABLE") await loadProfile();
      setRequestError(lessonErrorKey(code));
      requestInFlight.current = false;
      setRequestBusy(false);
    }
  }

  if (status === "loading") {
    return <div className="flex min-h-[320px] items-center justify-center rounded-[1.7rem] border border-primary/10 bg-white p-8" role="status" aria-live="polite"><div className="text-center"><LoaderCircle aria-hidden="true" className="mx-auto h-8 w-8 animate-spin text-primary" /><p className="mt-4 text-sm font-semibold text-muted-foreground">{t("tutorProfile.loading")}</p></div></div>;
  }
  if (status === "not_found") {
    return <TutorProfileFailureCard kind="not_found" tutorPreview={tutorPreview} onRetry={() => void loadProfile()} />;
  }
  if (status === "error" || !tutor) {
    return <TutorProfileFailureCard kind="error" tutorPreview={tutorPreview} onRetry={() => void loadProfile()} />;
  }

  const rating = tutor.rating_summary && tutor.rating_summary.count >= 3 ? tutor.rating_summary : null;
  const visibleSlots = bookableSlots.slice(0, 12);
  const verified = tutor.verified_certificate_labels.length > 0;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="min-w-0 space-y-5">
      <Link to={tutorPreview ? "/tutor" : "/learner/tutors"} className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-xs font-extrabold text-primary transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><ArrowLeft aria-hidden="true" className="h-4 w-4" />{t(tutorPreview ? "tutorProfile.backToDashboard" : "tutorProfile.backToTutors")}</Link>

      <section className="overflow-hidden rounded-[1.75rem] border border-primary/10 bg-white shadow-[0_26px_65px_-52px_rgba(30,58,138,0.55)]">
        <div className="relative overflow-hidden bg-primary px-5 py-6 text-white sm:px-8 sm:py-8">
          <div aria-hidden="true" className="absolute -right-12 -top-16 h-56 w-56 rounded-full border-[26px] border-white/5" />
          <div aria-hidden="true" className="absolute -bottom-16 right-20 h-40 w-40 rounded-full bg-[#F97362]/20 blur-2xl" />
          <div className="relative flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
            <div className="h-28 w-28 shrink-0 overflow-hidden rounded-[1.7rem] border border-white/20 bg-white/10 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.8)] sm:h-32 sm:w-32">
              {photo ? <img src={photo} alt={t("tutorProfile.photoAlt").replace("{name}", tutor.display_name)} className="h-full w-full object-cover" /> : <span aria-hidden="true" className="flex h-full w-full items-center justify-center font-display text-3xl font-extrabold text-white">{initials(tutor.display_name)}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#FFC0B4]">{t(tutorPreview ? "tutorProfile.previewEyebrow" : "tutorProfile.eyebrow")}</p>
              <h2 className="mt-2 break-words font-display text-3xl font-extrabold leading-tight tracking-[-0.05em] sm:text-4xl">{tutor.display_name || t("tutorDiscovery.unnamedTutor")}</h2>
              <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-white/80">{tutor.headline}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {verified && <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[#E8F4EC] px-3 text-xs font-extrabold text-[#205D45]"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />{t("tutorProfile.verified")}</span>}
                <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 text-xs font-bold text-white">
                  {rating ? <Star aria-hidden="true" className="h-3.5 w-3.5 fill-current text-[#FFC96B]" /> : <UserRound aria-hidden="true" className="h-3.5 w-3.5" />}
                  {ratingLabel(rating)}
                </span>
                <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 text-xs font-bold text-white"><GraduationCap aria-hidden="true" className="h-3.5 w-3.5" />{t("tutorProfile.levelsTaught").replace("{levels}", levelLabels(tutor.levels_taught))}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(245px,0.42fr)] lg:p-8">
          <div className="min-w-0 space-y-5">
            <section className="min-w-0">
              <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF0EC] text-[#A13F36]"><UserRound aria-hidden="true" className="h-4 w-4" /></span><h3 className="font-display text-lg font-extrabold text-primary">{t("tutorProfile.aboutHeading")}</h3></div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-foreground">{tutor.bio}</p>
            </section>

            {videoEmbed && <section className="overflow-hidden rounded-[1.4rem] border border-primary/10 bg-[#F7F8FB]">
              <div className="flex items-center gap-2 px-4 py-3"><Video aria-hidden="true" className="h-4 w-4 text-primary" /><h3 className="font-display text-sm font-extrabold text-primary">{t("tutorProfile.introVideo")}</h3></div>
              <div className="aspect-video bg-black"><iframe src={videoEmbed} title={t("tutorProfile.videoFrameTitle").replace("{name}", tutor.display_name)} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen className="h-full w-full border-0" /></div>
            </section>}

            <section className="rounded-[1.4rem] border border-primary/10 bg-[#FAF9F5] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-primary"><CalendarDays aria-hidden="true" className="h-4 w-4" /></span><div><h3 className="font-display text-base font-extrabold text-primary">{t("tutorProfile.availabilityHeading")}</h3><p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{t("tutorProfile.timeZoneLabel").replace("{zone}", timeZone)}</p></div></div><span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-primary">{t("tutorProfile.listedAvailability")}</span></div>
              {visibleSlots.length > 0 ? <ul className="mt-4 grid gap-2 sm:grid-cols-2">{visibleSlots.map((slot) => <li key={`${slot.startUtc}-${slot.durationMinutes}`} className="flex min-w-0 items-start gap-2.5 rounded-xl border border-primary/10 bg-white px-3 py-3 text-xs font-semibold leading-5 text-foreground"><Clock3 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /><span className="min-w-0 flex-1 break-words">{formatSlot(slot, timeZone)}</span><span className="shrink-0 rounded-full bg-[#EEF2FA] px-2 py-1 text-[10px] font-extrabold text-primary">{t(`tutorProfile.minutes${slot.durationMinutes}` as TranslationKey)}</span></li>)}</ul> : <p className="mt-4 rounded-xl border border-dashed border-primary/15 bg-white px-3.5 py-4 text-sm leading-6 text-muted-foreground">{t(enabledLessonLengths.length === 0 ? "tutorProfile.noEnabledDurations" : "tutorProfile.noAvailability")}</p>}
              {bookableSlots.length > visibleSlots.length && <p className="mt-3 text-xs font-semibold text-muted-foreground">{t("tutorProfile.moreWindows").replace("{count}", String(bookableSlots.length))}</p>}

              {canRequestLesson && <div className="mt-5 border-t border-primary/10 pt-4">
                <h4 className="font-display text-sm font-extrabold text-primary">{t("booking.bookHeading")}</h4>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{t("booking.bookIntro", { minutes: options?.holdMinutes ?? 30 })}</p>
                <Link to="/help/cancellations-refunds" className="mt-1.5 inline-block text-xs font-bold text-primary underline underline-offset-2">{t("lessons.policyLink")}</Link>
                {options === null ? (
                  <p className="mt-4 rounded-xl border border-dashed border-primary/15 bg-white px-3.5 py-4 text-sm leading-6 text-muted-foreground">{t("booking.optionsError")}</p>
                ) : !options.canBook ? (
                  <p className="mt-4 rounded-xl border border-[#E9D7B2] bg-[#FFF9EC] px-3.5 py-4 text-sm leading-6 text-[#805916]">{t(options.reason === "OWN_PROFILE" ? "booking.ownProfile" : "booking.opensSoon")}</p>
                ) : enabledLessonLengths.length === 0 ? (
                  <p className="mt-4 rounded-xl border border-dashed border-primary/15 bg-white px-3.5 py-4 text-sm leading-6 text-muted-foreground">{t("tutorProfile.noEnabledDurations")}</p>
                ) : (
                  <form onSubmit={submitBooking} aria-busy={requestBusy} className="mt-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="min-w-0">
                        <label htmlFor="lesson-duration" className="mb-1.5 block text-xs font-bold text-foreground">{t("tutorProfile.chooseDuration")}</label>
                        <select id="lesson-duration" name="duration" required value={activeDuration ?? ""} onChange={(event) => { setSelectedDuration(Number(event.target.value) || null); setSelectedDay(""); setSelectedStartUtc(""); setRequestError(null); }} className="min-h-11 w-full rounded-xl border border-primary/15 bg-white px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15">
                          {enabledLessonLengths.slice().sort((a, b) => a - b).map((minutes) => <option key={minutes} value={minutes}>{t("booking.lengthPrice", { length: t(`tutorProfile.minutes${minutes}` as TranslationKey), price: formatCadCents(options.prices[String(minutes)] ?? 0) })}</option>)}
                        </select>
                      </div>
                      <div className="min-w-0">
                        <label htmlFor="lesson-day" className="mb-1.5 block text-xs font-bold text-foreground">{t("tutorProfile.chooseDate")}</label>
                        <select id="lesson-day" name="day" required value={activeDay} disabled={availableDays.length === 0} onChange={(event) => { setSelectedDay(event.target.value); setSelectedStartUtc(""); setRequestError(null); }} className="min-h-11 w-full rounded-xl border border-primary/15 bg-white px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-[#F7F8FB]">
                          {availableDays.length === 0 && <option value="">{t("tutorProfile.chooseDate")}</option>}
                          {availableDays.map((day) => <option key={day} value={day}>{formatLocalDay(day)}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="lesson-start" className="mb-1.5 block text-xs font-bold text-foreground">{t("tutorProfile.chooseTime")}</label>
                      <select id="lesson-start" name="start_time" required value={activeSlot?.startUtc ?? ""} disabled={slotsForDay.length === 0} onChange={(event) => { setSelectedStartUtc(event.target.value); setRequestError(null); }} className="min-h-11 w-full rounded-xl border border-primary/15 bg-white px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-[#F7F8FB]">
                        {slotsForDay.length === 0 && <option value="">{t("tutorProfile.chooseTime")}</option>}
                        {slotsForDay.map((slot) => <option key={slot.startUtc} value={slot.startUtc}>{formatSlotStart(slot.startUtc, timeZone)}</option>)}
                      </select>
                    </div>
                    {durationSlots.length === 0 && <p className="rounded-xl border border-dashed border-primary/15 bg-white px-3.5 py-3 text-xs leading-5 text-muted-foreground">{t("tutorProfile.noTimesForLength")}</p>}
                    <div>
                      <label htmlFor="lesson-message" className="mb-1.5 block text-xs font-bold text-foreground">{t("tutorProfile.messageLabel")}</label>
                      <textarea id="lesson-message" name="message" value={learnerMessage} onChange={(event) => { setLearnerMessage(event.target.value.slice(0, 1000)); setRequestError(null); }} maxLength={1000} rows={3} aria-describedby="lesson-message-count" placeholder={t("tutorProfile.messagePlaceholder")} className="w-full resize-y rounded-xl border border-primary/15 bg-white px-3 py-2.5 text-sm leading-5 text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15" />
                      <p id="lesson-message-count" aria-live="polite" className="mt-1 text-right text-[10px] text-muted-foreground">{t("tutorProfile.messageCount").replace("{count}", String(learnerMessage.length))}</p>
                    </div>
                    {requestError && <p role="alert" className="rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-3.5 py-3 text-xs leading-5 text-[#8D342D]">{t(requestError)}</p>}
                    <button type="submit" disabled={requestBusy || !activeSlot} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55">
                      {requestBusy && <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />}
                      {requestBusy ? t("booking.booking") : t("booking.bookButton", { amount: formatCadCents(activeSlot ? options.prices[String(activeSlot.durationMinutes)] ?? 0 : 0) })}
                    </button>
                  </form>
                )}
              </div>}
            </section>

            <section aria-labelledby="tutor-reviews-heading">
              <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#C64D43]">{t("tutorProfile.reviewsEyebrow")}</p><h3 id="tutor-reviews-heading" className="mt-1 font-display text-xl font-extrabold tracking-[-0.035em] text-primary">{t("tutorProfile.reviewsHeading")}</h3></div>{rating ? <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF8E9] px-3 py-1.5 text-xs font-extrabold text-[#805916]"><Star aria-hidden="true" className="h-3.5 w-3.5 fill-current" />{rating.average.toFixed(1)} · {t("tutorDiscovery.reviewCount").replace("{count}", String(rating.count))}</span> : <span className="rounded-full bg-[#EEF2FA] px-3 py-1.5 text-xs font-extrabold text-primary">{t("tutorDiscovery.newTutor")}</span>}</div>
              {tutor.reviews.length > 0 ? <div className="mt-4 space-y-3">{tutor.reviews.map((review) => <article key={review.id} className="rounded-[1.25rem] border border-primary/10 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-extrabold text-primary">{review.is_test_review ? t("tutorProfile.demoLearner") : review.learner_label || t("tutorProfile.learner")}</p>{review.is_test_review && <span className="rounded-full bg-[#FFF0EC] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#8D342D]">{t("tutorProfile.testReview")}</span>}</div><p className="mt-1 text-[11px] text-muted-foreground">{t("tutorProfile.reviewStars").replace("{stars}", String(review.stars))}</p></div><ReviewStars stars={review.stars} label={t("tutorProfile.reviewStars").replace("{stars}", String(review.stars))} /></div>{review.comment && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{review.comment}</p>}{review.tutor_reply && <div className="mt-4 rounded-xl border-l-2 border-[#F97362] bg-[#FFF8F6] px-3.5 py-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#A13F36]">{t("tutorProfile.tutorReply")}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{review.tutor_reply}</p></div>}</article>)}</div> : <div className="mt-4 rounded-[1.25rem] border border-dashed border-primary/20 bg-white p-5"><p className="text-sm font-bold text-primary">{t("tutorProfile.noReviewsTitle")}</p><p className="mt-1.5 text-sm leading-6 text-muted-foreground">{t("tutorProfile.noReviewsBody")}</p></div>}
            </section>
          </div>

          <aside className="min-w-0 space-y-4">
            <section className="rounded-[1.45rem] border border-primary/10 bg-white p-4 shadow-[0_18px_44px_-40px_rgba(30,58,138,0.48)] sm:p-5 lg:sticky lg:top-24">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#C64D43]">{t("tutorProfile.pricingEyebrow")}</p><h3 className="mt-1 font-display text-lg font-extrabold text-primary">{t("tutorProfile.pricingHeading")}</h3>
              {enabledLessonLengths.length > 0 ? <div className="mt-4 space-y-2">{[...enabledLessonLengths].sort((a, b) => b - a).map((minutes) => <div key={minutes} className="flex items-center justify-between gap-3 rounded-xl bg-[#F7F8FB] px-3.5 py-3"><span className="text-xs font-bold text-foreground">{t(`tutorProfile.minutes${minutes}` as TranslationKey)}</span><span className="font-display text-base font-extrabold text-primary">{sessionPrice(tutor.hourly_rate_cents, minutes)}</span></div>)}</div> : <p className="mt-4 rounded-xl border border-dashed border-primary/15 bg-[#F7F8FB] px-3.5 py-3 text-xs leading-5 text-muted-foreground">{t("tutorProfile.noEnabledDurations")}</p>}
              {enabledLessonLengths.some((minutes) => minutes < 60) && <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{t("tutorProfile.priceNote")}</p>}
              <div className="mt-5 border-t border-primary/10 pt-4"><div className="flex items-center gap-2"><Languages aria-hidden="true" className="h-4 w-4 text-primary" /><h4 className="text-xs font-extrabold text-primary">{t("tutorProfile.languagesHeading")}</h4></div><div className="mt-2 flex flex-wrap gap-1.5">{tutor.spoken_languages.map((language) => <span key={language} className="rounded-full border border-primary/10 bg-white px-2.5 py-1.5 text-[11px] font-bold text-foreground">{languageLabel(language)}</span>)}</div></div>
              {tutor.teaching_styles.length > 0 && <div className="mt-4 border-t border-primary/10 pt-4"><div className="flex items-center gap-2"><Sparkles aria-hidden="true" className="h-4 w-4 text-primary" /><h4 className="text-xs font-extrabold text-primary">{t("tutorProfile.teachingStylesHeading")}</h4></div><div className="mt-2 flex flex-wrap gap-1.5">{tutor.teaching_styles.map((style) => <span key={style} className="rounded-full border border-[#F1D6D0] bg-[#FFF8F6] px-2.5 py-1.5 text-[11px] font-bold leading-4 text-[#8D342D]">{styleLabel(style)}</span>)}</div></div>}
              <div className="mt-4 border-t border-primary/10 pt-4"><div className="flex items-center gap-2"><GraduationCap aria-hidden="true" className="h-4 w-4 text-primary" /><h4 className="text-xs font-extrabold text-primary">{t("tutorProfile.specialtiesHeading")}</h4></div><div className="mt-2 flex flex-wrap gap-1.5">{tutor.specialties.map((specialty) => <span key={specialty} className="rounded-full bg-[#EEF2FA] px-2.5 py-1.5 text-[11px] font-bold leading-4 text-primary">{t(SPECIALTY_KEYS[specialty] ?? "tutorDiscovery.specialtyOther")}</span>)}</div></div>
              {verified && <div className="mt-4 border-t border-primary/10 pt-4"><div className="flex items-center gap-2"><BadgeCheck aria-hidden="true" className="h-4 w-4 text-[#236646]" /><h4 className="text-xs font-extrabold text-primary">{t("tutorProfile.verifiedCertificates")}</h4></div><div className="mt-2 space-y-2">{tutor.verified_certificate_labels.map((label) => <span key={label} className="flex items-start gap-2 rounded-xl border border-[#B9D9CB] bg-[#F1F8F4] px-3 py-2.5 text-xs font-bold leading-5 text-[#205D45]"><Check aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{label}</span>)}</div></div>}
            </section>
          </aside>
        </div>
      </section>
    </motion.div>
  );
}
