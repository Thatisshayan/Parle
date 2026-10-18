import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, BadgeCheck, CalendarDays, Check, CheckCircle2, CircleAlert, Clock3,
  FileCheck2, ImagePlus, LoaderCircle, LockKeyhole, RefreshCw, Video, WalletCards, X,
} from "lucide-react";
import LessonBookingCard from "@/components/parle/LessonBookingCard";
import PayoutSetupNotice from "@/components/parle/PayoutSetupNotice";
import { groupTutorLessons, loadTutorLessons, type ParleBooking } from "@/lib/parle-booking";
import { t, type TranslationKey } from "@/lib/i18n";
import { summarizeTutorAvailabilityWeek, type TutorAvailabilityInput, type TutorWeekSummary } from "@/lib/tutor-availability";
import {
  isPublishedTutorPublicProfile,
  proratedPriceCents,
  tutorApplicationGuidance,
  type ApplicationStatus,
  type TutorApplicationGuidance,
} from "../../functions/parle-marketplace.helper.ts";
import { parleMarketplaceService } from "@/functions";

type ProfileSnapshot = Record<string, unknown>;
type DashboardStatus = ApplicationStatus | "Unknown";
type DashboardData = {
  status: DashboardStatus;
  profile: ProfileSnapshot;
  latestComment: string;
  publicProfilePublished: boolean;
  publicProfileRefreshPending: boolean;
  approvedPublicProfileEditable: boolean;
  documents: Record<string, unknown>[];
};
type PublicPreview = Record<string, unknown>;
type ChecklistItem = { id: string; title: TranslationKey; complete: boolean; optional?: boolean; href: string; icon: typeof ImagePlus };

const STATUS_KEYS: Record<DashboardStatus, TranslationKey> = {
  Draft: "tutorApplication.status.draft",
  Submitted: "tutorApplication.status.submitted",
  "In review": "tutorApplication.status.inReview",
  Approved: "tutorApplication.status.approved",
  "Needs changes": "tutorApplication.status.needsChanges",
  Rejected: "tutorApplication.status.rejected",
  Suspended: "tutorApplication.status.suspended",
  Unknown: "tutorApplication.status.unknown",
};
const GUIDANCE_KEYS: Record<TutorApplicationGuidance, { title: TranslationKey; body: TranslationKey; next: TranslationKey }> = {
  draft: { title: "tutorDashboard.status.draftTitle", body: "tutorDashboard.status.draftBody", next: "tutorDashboard.status.draftNext" },
  awaiting_review: { title: "tutorDashboard.status.awaitingTitle", body: "tutorDashboard.status.awaitingBody", next: "tutorDashboard.status.awaitingNext" },
  needs_changes: { title: "tutorDashboard.status.changesTitle", body: "tutorDashboard.status.changesBody", next: "tutorDashboard.status.changesNext" },
  approved_published: { title: "tutorDashboard.status.publishedTitle", body: "tutorDashboard.status.publishedBody", next: "tutorDashboard.status.publishedNext" },
  approved_pending: { title: "tutorDashboard.status.pendingTitle", body: "tutorDashboard.status.pendingBody", next: "tutorDashboard.status.pendingNext" },
  rejected: { title: "tutorDashboard.status.rejectedTitle", body: "tutorDashboard.status.rejectedBody", next: "tutorDashboard.status.rejectedNext" },
  suspended: { title: "tutorDashboard.status.suspendedTitle", body: "tutorDashboard.status.suspendedBody", next: "tutorDashboard.status.suspendedNext" },
  unknown: { title: "tutorDashboard.status.unknownTitle", body: "tutorDashboard.status.unknownBody", next: "tutorDashboard.status.unknownNext" },
};
const DAY_KEYS: TranslationKey[] = [
  "tutorAvailability.day.monday", "tutorAvailability.day.tuesday", "tutorAvailability.day.wednesday",
  "tutorAvailability.day.thursday", "tutorAvailability.day.friday", "tutorAvailability.day.saturday",
  "tutorAvailability.day.sunday",
];
const SPECIALTY_KEYS: Record<string, TranslationKey> = {
  canada_immigration_tef_tcf: "tutorApplication.specialty.immigration",
  canadian_citizenship: "tutorApplication.specialty.citizenship",
  conversation: "tutorApplication.specialty.conversation",
  grammar: "tutorApplication.specialty.grammar",
  business_french: "tutorApplication.specialty.business",
  beginners: "tutorApplication.specialty.beginner",
};
const LEVEL_KEYS: Record<string, TranslationKey> = {
  A1: "tutorApplication.level.a1", A2: "tutorApplication.level.a2", B1: "tutorApplication.level.b1",
  B2: "tutorApplication.level.b2", C1: "tutorApplication.level.c1",
};
const LANGUAGE_KEYS: Record<string, TranslationKey> = {
  english: "language.english", french: "language.french", spanish: "language.spanish", portuguese: "language.portuguese",
  arabic: "language.arabic", persian: "language.persian", hindi: "language.hindi", punjabi: "language.punjabi",
  urdu: "language.urdu", tagalog: "language.tagalog", mandarin: "language.mandarin", vietnamese: "language.vietnamese",
  ukrainian: "language.ukrainian", russian: "language.russian", turkish: "language.turkish", other: "language.other",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unwrap(value: unknown): Record<string, unknown> {
  let current: unknown = value;
  for (let index = 0; index < 6; index += 1) {
    if (!isObject(current)) break;
    if (isObject(current.result)) { current = current.result; continue; }
    if (isObject(current.data) && ("status" in current.data || "error" in current.data)) { current = current.data; continue; }
    break;
  }
  return isObject(current) ? current : {};
}

async function marketplace(action: string): Promise<Record<string, unknown>> {
  const response = unwrap(await parleMarketplaceService({ action }));
  if (typeof response.error === "string" || response.status === "error" || response.success === false) {
    throw new Error(typeof response.code === "string" ? response.code : typeof response.error === "string" ? response.error : "REQUEST_FAILED");
  }
  return response;
}

function asStatus(value: unknown): DashboardStatus {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(STATUS_KEYS, value) ? value as DashboardStatus : "Unknown";
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function safeProfileImage(profile: Record<string, unknown>): string | null {
  const base64 = typeof profile.photo_base64 === "string" ? profile.photo_base64 : "";
  const mime = profile.photo_mime_type === "image/png" || profile.photo_mime_type === "image/jpeg" ? profile.photo_mime_type : "";
  return base64 && mime ? `data:${mime};base64,${base64}` : null;
}

function displayName(profile: Record<string, unknown>): string {
  return typeof profile.display_name === "string" && profile.display_name.trim() ? profile.display_name.trim() : t("tutorDiscovery.unnamedTutor");
}

function initials(value: string): string {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase() || "P";
}

function formatCad(cents: number | null): string {
  return cents === null ? t("tutorDashboard.rateUnavailable") : new Intl.NumberFormat("en-US", { style: "currency", currency: "CAD" }).format(cents / 100);
}

function formatWeekDate(value: string): string {
  try { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00.000Z`)); }
  catch { return value; }
}

function statusErrorKey(code: string): TranslationKey {
  if (code === "BOOKING_NOT_PENDING") return "tutorDashboard.error.alreadyHandled";
  if (code === "BOOKING_SLOT_INVALID") return "tutorDashboard.error.scheduleChanged";
  if (code === "BOOKING_NOT_FOUND") return "tutorDashboard.error.notFound";
  return "tutorDashboard.error.action";
}

function bookingErrorKeys(code: string): { title: TranslationKey; body: TranslationKey } {
  const notReady = ["APPLICATION_NOT_APPROVED", "TUTOR_REQUIRED", "PROFILE_NOT_FOUND"].includes(code);
  return notReady
    ? { title: "tutorDashboard.notReadyTitle", body: "tutorDashboard.notReadyBody" }
    : { title: "tutorDashboard.errorTitle", body: "tutorDashboard.errorBody" };
}

function dayKindKey(kind: "available" | "unavailable" | "off"): TranslationKey {
  if (kind === "off") return "tutorDashboard.week.dayOff";
  return kind === "available" ? "tutorDashboard.week.available" : "tutorDashboard.week.notAvailable";
}

function contentRate(profile: Record<string, unknown>): number | null {
  const rate = profile.hourly_rate_cents;
  return typeof rate === "number" && Number.isInteger(rate) && rate >= 1000 && rate <= 15000 ? rate : null;
}

function ratingText(preview: PublicPreview | null): { label: TranslationKey; average: number | null; count: number } {
  const value = preview && isObject(preview.rating_summary) ? preview.rating_summary : null;
  const average = value && typeof value.average === "number" && Number.isFinite(value.average) && value.average >= 1 && value.average <= 5 ? value.average : null;
  const count = value && Number.isInteger(value.count) && Number(value.count) >= 3 ? Number(value.count) : 0;
  return count >= 3 && average !== null
    ? { label: "tutorDiscovery.newTutor", average, count }
    : { label: "tutorDiscovery.newTutor", average: null, count: 0 };
}

export default function TutorDashboard() {
  const [loading, setLoading] = useState(true);
  const [pageLoadError, setPageLoadError] = useState(false);
  const [bookingLoadError, setBookingLoadError] = useState("");
  const [bookings, setBookings] = useState<ParleBooking[]>([]);
  const [timeZone, setTimeZone] = useState("UTC");
  const [availability, setAvailability] = useState<TutorAvailabilityInput>({ rules: [], exceptions: [] });
  const [availabilityTimeZone, setAvailabilityTimeZone] = useState("UTC");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [publicPreview, setPublicPreview] = useState<PublicPreview | null>(null);
  const [publicPreviewStatus, setPublicPreviewStatus] = useState<"unpublished" | "loading" | "ready" | "error">("unpublished");
  const [busyId, setBusyId] = useState("");
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const [noticeKey, setNoticeKey] = useState<TranslationKey | null>(null);
  const [reload, setReload] = useState(0);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setPageLoadError(false);
    setBookingLoadError("");
    setPublicPreview(null);
    setPublicPreviewStatus("loading");
    try {
      const [applicationResult, availabilityResult] = await Promise.all([
        marketplace("tutor_get_application"),
        marketplace("tutor_get_availability"),
      ]);
      if (!isObject(applicationResult.profile)) throw new Error("PROFILE_NOT_FOUND");
      const review = isObject(applicationResult.review) ? applicationResult.review : {};
      const applicationProfile = applicationResult.profile;
      const loaded: DashboardData = {
        status: asStatus(applicationResult.status),
        profile: applicationProfile,
        latestComment: typeof review.latest_comment === "string" ? review.latest_comment.trim() : "",
        publicProfilePublished: applicationResult.public_profile_published === true,
        publicProfileRefreshPending: applicationResult.public_profile_refresh_pending === true,
        approvedPublicProfileEditable: applicationResult.approved_public_profile_editable === true,
        documents: Array.isArray(applicationResult.documents) ? applicationResult.documents.filter(isObject) : [],
      };
      const savedTimeZone = typeof availabilityResult.time_zone === "string" ? availabilityResult.time_zone : "UTC";
      const rawRules = Array.isArray(availabilityResult.rules) ? availabilityResult.rules.filter(isObject) : [];
      const rawExceptions = Array.isArray(availabilityResult.exceptions) ? availabilityResult.exceptions.filter(isObject) : [];
      const rules = rawRules.map((row) => ({
        day_of_week: Number(row.day_of_week), start_local: String(row.start_local ?? ""), end_local: String(row.end_local ?? ""), time_zone: typeof row.time_zone === "string" ? row.time_zone : savedTimeZone,
      }));
      const exceptions = rawExceptions.flatMap((row) => {
        if (typeof row.date_local !== "string" || (row.kind !== "off" && row.kind !== "extra")) return [];
        return [{
          date_local: row.date_local,
          kind: row.kind as "off" | "extra",
          start_local: typeof row.start_local === "string" ? row.start_local : "",
          end_local: typeof row.end_local === "string" ? row.end_local : "",
          time_zone: typeof row.time_zone === "string" ? row.time_zone : savedTimeZone,
        }];
      });
      setDashboard(loaded);
      setAvailability({ rules, exceptions });
      setAvailabilityTimeZone(savedTimeZone);

      if (loaded.status === "Approved") {
        try {
          const bookingsResult = await loadTutorLessons();
          setBookings(bookingsResult.lessons);
          setTimeZone(bookingsResult.timeZone);
        } catch (error) {
          const code = error instanceof Error ? error.message : "REQUEST_FAILED";
          console.error("Tutor lesson requests could not be loaded", error);
          setBookingLoadError(code);
          setBookings([]);
        }
        if (loaded.publicProfilePublished) {
          setPublicPreviewStatus("loading");
          try {
            const previewResult = await marketplace("tutor_get_public_preview");
            if (!isPublishedTutorPublicProfile(previewResult.tutor)) throw new Error("PUBLIC_PREVIEW_INVALID");
            setPublicPreview(previewResult.tutor);
            setPublicPreviewStatus("ready");
          } catch (error) {
            console.error("Tutor public preview could not be loaded", error);
            setPublicPreview(null);
            setPublicPreviewStatus("error");
          }
        } else {
          setPublicPreview(null);
          setPublicPreviewStatus("unpublished");
        }
      } else {
        setBookings([]);
        setPublicPreview(null);
        setPublicPreviewStatus("unpublished");
        setTimeZone(savedTimeZone);
      }
    } catch (error) {
      console.error("Tutor dashboard details could not be loaded", error);
      setPageLoadError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, reload]);

  const lessonGroups = useMemo(() => groupTutorLessons(bookings), [bookings]);
  const requested = lessonGroups.toDo; // lessons waiting for attendance or notes
  const confirmed = lessonGroups.upcoming;
  const week: TutorWeekSummary | null = useMemo(
    () => summarizeTutorAvailabilityWeek(availability, availabilityTimeZone),
    [availability, availabilityTimeZone],
  );
  const status = dashboard?.status ?? "Unknown";
  const guidanceKey = tutorApplicationGuidance(status, dashboard?.publicProfilePublished === true);
  const guidance = GUIDANCE_KEYS[guidanceKey];
  const profile = dashboard?.profile ?? {};
  const previewFields = publicPreview ?? {};
  const name = displayName(previewFields);
  const image = safeProfileImage(previewFields);
  const headline = typeof previewFields.headline === "string" ? previewFields.headline : "";
  const hourlyCents = contentRate(previewFields);
  const rating = ratingText(publicPreview);
  const specialties = strings(previewFields.specialties);
  const levels = strings(previewFields.levels_taught);
  const languages = strings(previewFields.spoken_languages);
  const published = dashboard?.publicProfilePublished === true;
  const approved = status === "Approved";
  const checklist: ChecklistItem[] = [
    { id: "photo", title: "tutorDashboard.check.photo", complete: Boolean(image), href: "/tutor/application", icon: ImagePlus },
    { id: "bio", title: "tutorDashboard.check.bio", complete: typeof profile.bio === "string" && profile.bio.trim().length > 0, href: "/tutor/profile-pricing", icon: CheckCircle2 },
    { id: "video", title: "tutorDashboard.check.video", complete: typeof profile.intro_video_url === "string" && Boolean(profile.intro_video_url.trim()) && profile.intro_video_unlisted_confirmed === true, href: "/tutor/profile-pricing", icon: Video },
    { id: "meeting", title: "tutorDashboard.check.meeting", complete: typeof profile.meeting_link === "string" && Boolean(profile.meeting_link.trim()), href: "/tutor/profile-pricing", icon: LockKeyhole },
    { id: "availability", title: "tutorDashboard.check.availability", complete: (availability.rules?.length ?? 0) > 0, href: "/tutor/availability", icon: CalendarDays },
    { id: "certificate", title: "tutorDashboard.check.certificate", complete: (dashboard?.documents.length ?? 0) > 0, optional: true, href: "/tutor/application", icon: FileCheck2 },
  ];


  if (loading) {
    return <div className="flex min-h-[300px] items-center justify-center rounded-[1.6rem] border border-primary/10 bg-white p-8" role="status" aria-live="polite"><div className="text-center"><LoaderCircle aria-hidden="true" className="mx-auto h-8 w-8 animate-spin text-primary" /><p className="mt-4 text-sm font-semibold text-muted-foreground">{t("tutorDashboard.loading")}</p></div></div>;
  }

  if (pageLoadError || !dashboard) {
    return <section className="rounded-[1.6rem] border border-[#F0C5C0] bg-white p-6 sm:p-8" role="alert"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><CircleAlert aria-hidden="true" className="h-5 w-5" /></span><h2 className="mt-4 font-display text-xl font-extrabold text-primary">{t("tutorDashboard.profileLoadErrorTitle")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("tutorDashboard.profileLoadErrorBody")}</p><button type="button" onClick={() => setReload((value) => value + 1)} className="parle-button-primary mt-5 justify-center"><RefreshCw aria-hidden="true" className="h-4 w-4" />{t("tutorDashboard.retry")}</button></section>;
  }

  const bookingError = bookingLoadError ? bookingErrorKeys(bookingLoadError) : null;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }} className="min-w-0 space-y-5">
      <section className="relative overflow-hidden rounded-[1.6rem] bg-primary px-5 py-6 text-white shadow-[0_24px_58px_-42px_rgba(30,58,138,0.7)] sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute -right-10 -top-12 h-44 w-44 rounded-full border-[20px] border-white/5" />
        <div className="relative flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#FFC0B4]">{t("tutorDashboard.eyebrow")}</p><p className="mt-2 max-w-2xl text-sm leading-6 text-white/85">{t("tutorDashboard.intro")}</p></div>
          <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white sm:self-auto"><CalendarDays aria-hidden="true" className="h-4 w-4 text-[#FFC0B4]" />{t("tutorDashboard.timeZone").replace("{zone}", timeZone)}</span>
        </div>
        {approved && !bookingLoadError && <div className="relative mt-5 grid grid-cols-2 gap-2 border-t border-white/15 pt-4 sm:max-w-md">
          <div className="rounded-xl bg-white/10 px-3 py-3"><p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/70"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />{t("tutorDashboard.toReview")}</p><p className="mt-1 font-display text-2xl font-extrabold">{requested.length}</p></div>
          <div className="rounded-xl bg-white/10 px-3 py-3"><p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/70"><Check aria-hidden="true" className="h-3.5 w-3.5" />{t("tutorDashboard.confirmedCount")}</p><p className="mt-1 font-display text-2xl font-extrabold">{confirmed.length}</p></div>
        </div>}
      </section>
      {approved && <PayoutSetupNotice />}
      <p className="rounded-xl border border-[#C9D7EE] bg-[#F5F8FD] px-4 py-3 text-xs leading-5 text-primary">{t("tutorDashboard.demoNote")}</p>

      <section aria-labelledby="tutor-application-status" className="overflow-hidden rounded-[1.55rem] border border-primary/10 bg-white shadow-[0_20px_56px_-48px_rgba(30,58,138,0.45)]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.55fr)]">
          <div className="min-w-0 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#C64D43]">{t("tutorDashboard.applicationEyebrow")}</p><h2 id="tutor-application-status" className="mt-1 font-display text-xl font-extrabold text-primary">{t(guidance.title)}</h2></div><span className="rounded-full bg-[#EEF2FA] px-3 py-1.5 text-xs font-extrabold text-primary">{t(STATUS_KEYS[status])}</span></div>
            <p className="mt-2 text-sm leading-6 text-foreground">{t(guidance.body)}</p>
            {dashboard.latestComment && <div className="mt-4 rounded-xl border-l-2 border-[#F97362] bg-[#FFF8F6] px-4 py-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#A13F36]">{t("tutorDashboard.latestComment")}</p><p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{dashboard.latestComment}</p></div>}
          </div>
          <div className="min-w-0 border-t border-primary/10 bg-[#FAF9F5] p-5 sm:p-6 lg:border-l lg:border-t-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#236646]">{t("tutorDashboard.nextStepEyebrow")}</p><p className="mt-1.5 text-sm leading-6 text-foreground">{t(guidance.next)}</p><div className="mt-4 flex flex-wrap gap-2"><Link to="/tutor/application" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-primary/15 bg-white px-4 text-xs font-extrabold text-primary transition hover:bg-[#F2F4F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t("tutorDashboard.openApplication")}<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>{guidanceKey === "approved_published" && <Link to="/tutor/profile-preview" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-xs font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t("tutorDashboard.openPreview")}<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>}</div></div>
        </div>
      </section>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section aria-labelledby="tutor-completeness" className="min-w-0 rounded-[1.55rem] border border-primary/10 bg-white p-5 shadow-[0_20px_56px_-48px_rgba(30,58,138,0.45)] sm:p-6">
          <div className="mb-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#C64D43]">{t("tutorDashboard.checklistEyebrow")}</p><h2 id="tutor-completeness" className="mt-1 font-display text-xl font-extrabold text-primary">{t("tutorDashboard.checklistTitle")}</h2><p className="mt-1.5 text-sm leading-6 text-muted-foreground">{t("tutorDashboard.checklistBody")}</p></div>
          <ul className="grid min-w-0 gap-2 sm:grid-cols-2">{checklist.map((item) => {
            const Icon = item.icon;
            return <li key={item.id} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-primary/10 bg-[#FAF9F5] p-3"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.complete ? "bg-[#E8F4EC] text-[#236646]" : "bg-[#FFF0EC] text-[#A13F36]"}`}>{item.complete ? <Check aria-hidden="true" className="h-4 w-4" /> : <Icon aria-hidden="true" className="h-4 w-4" />}</span><span className="min-w-0 flex-1 text-xs font-bold leading-5 text-foreground">{t(item.title)}{item.optional && !item.complete && <span className="ml-1.5 rounded-full bg-white px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-muted-foreground">{t("tutorDashboard.optional")}</span>}</span><Link to={item.href} className="shrink-0 rounded-full px-2.5 py-1.5 text-[10px] font-extrabold text-primary underline decoration-primary/30 underline-offset-2 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t(item.complete || (approved && (item.id === "photo" || item.id === "certificate")) ? "tutorDashboard.reviewLink" : "tutorDashboard.addLink")}</Link></li>;
          })}</ul>
          {approved && <p className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#E9D7B2] bg-[#FFF9EC] px-3.5 py-3 text-xs leading-5 text-[#805916]"><BadgeCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{t("tutorDashboard.approvedPhotoCertificateNote")}</p>}
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#C9D7EE] bg-[#F5F8FD] px-3.5 py-3"><WalletCards aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p className="text-xs leading-5 text-primary"><span className="font-extrabold">{t("tutorDashboard.payoutsLabel")}</span> {t("tutorDashboard.payoutsLater")}</p></div>
        </section>

        {approved && <section aria-labelledby="tutor-public-preview-card" className="min-w-0 overflow-hidden rounded-[1.55rem] border border-primary/10 bg-white shadow-[0_20px_56px_-48px_rgba(30,58,138,0.45)]">
          <div className="flex min-w-0 items-start justify-between gap-3 border-b border-primary/10 bg-[#FAF9F5] px-5 py-4 sm:px-6"><div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#236646]">{t("tutorDashboard.previewEyebrow")}</p><h2 id="tutor-public-preview-card" className="mt-1 break-words font-display text-xl font-extrabold text-primary">{t("tutorDashboard.previewTitle")}</h2></div>{published ? <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#E8F4EC] px-3 py-1.5 text-[10px] font-extrabold text-[#205D45]"><BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />{t("tutorDashboard.visibleBadge")}</span> : <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#FFF8E9] px-3 py-1.5 text-[10px] font-extrabold text-[#805916]"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />{t("tutorDashboard.publicationPendingBadge")}</span>}</div>
          <div className="min-w-0 p-5 sm:p-6">
            {publicPreviewStatus === "ready" && publicPreview ? <>
              <div className="flex min-w-0 items-center gap-3.5"><div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-primary text-white">{image ? <img src={image} alt={t("tutorDashboard.previewPhotoAlt").replace("{name}", name)} className="h-full w-full object-cover" /> : <span aria-hidden="true" className="flex h-full w-full items-center justify-center font-display text-xl font-extrabold">{initials(name)}</span>}</div><div className="min-w-0"><h3 className="break-words font-display text-lg font-extrabold text-primary">{name}</h3><p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{headline || t("tutorDashboard.previewHeadlineMissing")}</p><p className="mt-1 text-[11px] font-bold text-[#805916]">{rating.average !== null ? <>{rating.average.toFixed(1)} · {t("tutorDiscovery.reviewCount").replace("{count}", String(rating.count))}</> : t(rating.label)}</p></div></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">{([60, 45, 30] as const).map((minutes) => {
                const cents = hourlyCents === null ? null : proratedPriceCents(hourlyCents, minutes);
                return <div key={minutes} className="flex items-center justify-between gap-2 rounded-xl bg-[#F7F8FB] px-3 py-2.5 sm:block"><span className="text-[11px] font-bold text-muted-foreground">{t(`tutorProfile.minutes${minutes}` as TranslationKey)}</span><span className="font-display text-sm font-extrabold text-primary sm:mt-1 sm:block">{formatCad(cents)}</span></div>;
              })}</div>
              <div className="mt-4 space-y-3 border-t border-primary/10 pt-4">
                <div><p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-primary">{t("tutorProfile.specialtiesHeading")}</p><div className="mt-1.5 flex flex-wrap gap-1.5">{specialties.length ? specialties.map((item) => <span key={item} className="max-w-full break-words rounded-full bg-[#EEF2FA] px-2.5 py-1.5 text-[10px] font-bold leading-4 text-primary">{t(SPECIALTY_KEYS[item] ?? "tutorDiscovery.specialtyOther")}</span>) : <span className="text-xs text-muted-foreground">{t("tutorDashboard.previewNoSpecialties")}</span>}</div></div>
                <div><p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-primary">{t("tutorProfile.levelsTaught").replace("{levels}", "")}</p><div className="mt-1.5 flex flex-wrap gap-1.5">{levels.length ? levels.map((item) => <span key={item} className="rounded-full border border-primary/10 px-2.5 py-1.5 text-[10px] font-bold text-foreground">{t(LEVEL_KEYS[item.toUpperCase()] ?? "tutorApplication.level.a1")}</span>) : <span className="text-xs text-muted-foreground">{t("tutorDashboard.previewNoLevels")}</span>}</div></div>
                <div><p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-primary">{t("tutorProfile.languagesHeading")}</p><div className="mt-1.5 flex flex-wrap gap-1.5">{languages.length ? languages.map((item) => <span key={item} className="rounded-full border border-primary/10 px-2.5 py-1.5 text-[10px] font-bold text-foreground">{t(LANGUAGE_KEYS[item.toLowerCase()] ?? "language.other")}</span>) : <span className="text-xs text-muted-foreground">{t("tutorDashboard.previewNoLanguages")}</span>}</div></div>
              </div>
              <Link to="/tutor/profile-preview" className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-xs font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t("tutorDashboard.openPreview")}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
            </> : publicPreviewStatus === "error" ? <div role="status" aria-live="polite" className="mt-1 rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] p-4"><p className="text-sm leading-6 text-[#8D342D]">{t("tutorDashboard.previewErrorBody")}</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={() => setReload((value) => value + 1)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-xs font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />{t("tutorDashboard.retry")}</button><Link to="/tutor/profile-preview" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-primary/15 bg-white px-4 text-xs font-extrabold text-primary transition hover:bg-[#F2F4F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t("tutorDashboard.openPreview")}<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></Link></div></div> : published ? <div role="status" aria-live="polite" className="mt-1 flex items-center gap-3 rounded-xl border border-primary/10 bg-[#F7F8FB] p-4"><LoaderCircle aria-hidden="true" className="h-5 w-5 shrink-0 animate-spin text-primary" /><p className="text-sm leading-6 text-muted-foreground">{t("tutorDashboard.previewLoading")}</p></div> : <p className="mt-1 rounded-xl border border-[#E9D7B2] bg-[#FFF9EC] px-3.5 py-3 text-xs leading-5 text-[#805916]">{t("tutorDashboard.publicationPendingBody")}</p>}
          </div>
        </section>}
      </div>

      <section aria-labelledby="tutor-local-week" className="min-w-0 overflow-hidden rounded-[1.55rem] border border-primary/10 bg-white shadow-[0_20px_56px_-48px_rgba(30,58,138,0.45)]">
        <div className="flex flex-col gap-3 border-b border-primary/10 bg-[#FAF9F5] p-5 sm:flex-row sm:items-end sm:justify-between sm:px-6"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#C64D43]">{t("tutorDashboard.weekEyebrow")}</p><h2 id="tutor-local-week" className="mt-1 font-display text-xl font-extrabold text-primary">{t("tutorDashboard.weekTitle")}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{week ? t("tutorDashboard.weekRange").replace("{start}", formatWeekDate(week.week_start)).replace("{end}", formatWeekDate(week.week_end)).replace("{zone}", week.time_zone) : t("tutorDashboard.weekUnavailable")}</p></div><Link to="/tutor/availability" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-primary/15 bg-white px-4 text-xs font-extrabold text-primary transition hover:bg-[#F2F4F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t("tutorDashboard.editAvailability")}<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></Link></div>
        <div className="grid min-w-0 gap-2 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3 xl:grid-cols-4">{week?.days.map((day, index) => <article key={day.date} className="min-w-0 rounded-xl border border-primary/10 bg-white p-3.5"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-xs font-extrabold text-primary">{t(DAY_KEYS[index])}</h3><p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">{formatWeekDate(day.date)}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-extrabold ${day.kind === "available" ? "bg-[#E8F4EC] text-[#205D45]" : day.kind === "off" ? "bg-[#FFF0EC] text-[#8D342D]" : "bg-[#F2F4F9] text-muted-foreground"}`}>{t(dayKindKey(day.kind))}</span></div><div className="mt-2 flex flex-wrap gap-1.5">{day.intervals.length ? day.intervals.map((interval) => <span key={`${interval.start_local}-${interval.end_local}`} className="rounded-lg bg-[#F7F8FB] px-2 py-1 text-[10px] font-bold text-foreground">{interval.start_local}–{interval.end_local}</span>) : <span className="text-[10px] leading-5 text-muted-foreground">{t("tutorDashboard.week.noHours")}</span>}</div>{day.has_extra_hours && <p className="mt-2 text-[9px] font-extrabold uppercase tracking-wide text-[#236646]">{t("tutorDashboard.week.extraHours")}</p>}</article>)}</div>
      </section>

      <p className="rounded-xl border border-primary/10 bg-white px-4 py-3 text-xs leading-5 text-muted-foreground">{t("tutorDashboard.laterStep")}</p>

      {errorKey && <p role="alert" className="flex items-start gap-2 rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-4 py-3 text-sm leading-5 text-[#8D342D]"><CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{t(errorKey)}</p>}
      {noticeKey && <p role="status" className="flex items-start gap-2 rounded-xl border border-[#B9D9CB] bg-[#F1F8F4] px-4 py-3 text-sm leading-5 text-[#236646]"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{t(noticeKey)}</p>}

      {bookingError ? <section className="rounded-[1.6rem] border border-[#F0C5C0] bg-white p-6 sm:p-8" role="alert"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><CircleAlert aria-hidden="true" className="h-5 w-5" /></span><h2 className="mt-4 font-display text-xl font-extrabold text-primary">{t(bookingError.title)}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{t(bookingError.body)}</p><button type="button" onClick={() => setReload((value) => value + 1)} className="parle-button-primary mt-5 justify-center"><RefreshCw aria-hidden="true" className="h-4 w-4" />{t("tutorDashboard.retry")}</button></section> : approved && <section aria-labelledby="tutor-next-lessons">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#236646]">{t("tutorDashboard.confirmedEyebrow")}</p><h2 id="tutor-next-lessons" className="mt-1 font-display text-xl font-extrabold text-primary">{t("tutorDashboard.nextLessonsHeading")}</h2></div><Link to="/tutor/lessons" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-primary/15 bg-white px-4 text-xs font-extrabold text-primary transition hover:bg-[#F2F4F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t("tutorDashboard.openLessons")}<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></Link></div>
        {confirmed.length ? <div className="grid gap-3 xl:grid-cols-2">{confirmed.slice(0, 4).map((booking) => <LessonBookingCard key={booking.id} booking={booking} timeZone={timeZone} audience="tutor" />)}</div> : <p className="rounded-2xl border border-dashed border-primary/15 bg-white p-4 text-sm leading-6 text-muted-foreground">{t("tutorDashboard.noConfirmed")}</p>}
        {requested.length > 0 && <p className="mt-3 rounded-xl border border-[#F1D9A9] bg-[#FFF8E9] px-4 py-3 text-xs leading-5 text-[#805916]">{t("tutorDashboard.toDoNote", { count: requested.length })}</p>}
      </section>}
    </motion.div>
  );
}

