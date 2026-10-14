import { FormEvent, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  CircleAlert,
  FileCheck2,
  FileText,
  LoaderCircle,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  Star,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { User } from "@/entities";
import { parleMarketplaceService } from "@/functions";
import { t, type TranslationKey } from "@/lib/i18n";
import {
  APPLICATION_STATUSES,
  applySavedDecisionToApplications,
  applySavedDecisionToSelected,
  countApplicationsByStatus,
  saveAndApplyAdminDecision,
  type ApplicationStatus,
} from "@/lib/admin-applications-state";

type CountryStatus = "supported" | "waitlist";
type Summary = { id: string; tutor_email: string; display_name: string; headline: string; country: string; submission_revision: number; status: ApplicationStatus; latest_comment: string; notification_state: string; last_decision_at: string; payout_status: CountryStatus; updated_at: string };
type Country = { id?: string; country_name: string; country_code: string; status: CountryStatus };
type ApplicationProfile = Record<string, unknown> & { id?: string; photo_base64?: string; photo_mime_type?: string };
type Document = { id: string; profile_id: string; label: string; file_name: string; mime_type: string; size_bytes: number; content_base64: string; valid: boolean; verified: boolean };
type Review = { status?: ApplicationStatus; latest_comment?: string; notification_state?: string; notification_attempts?: number; verified_document_ids?: string[] };
type DemoReview = { id: string; stars: number; comment: string; is_visible: boolean; is_test_review: true; created_at: string };
type OpenApplication = { profile: ApplicationProfile; status: ApplicationStatus; tutor_email: string; review: Review; documents: Document[]; demo_reviews: DemoReview[]; payout_status: CountryStatus };

const statusFilters: Array<"all" | ApplicationStatus> = ["all", ...APPLICATION_STATUSES];
const teachingStyleKeys: Record<string, TranslationKey> = {
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
  const response = unwrap(await parleMarketplaceService({ action, ...values }));
  if (typeof response.error === "string" || response.status === "error") throw new Error(typeof response.code === "string" ? response.code : typeof response.error === "string" ? response.error : "REQUEST_FAILED");
  return response;
}

function errorCode(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (isObject(error) && typeof error.code === "string") return error.code;
  return "REQUEST_FAILED";
}

function statusKey(status: ApplicationStatus): TranslationKey {
  const keys: Record<ApplicationStatus, TranslationKey> = {
    Draft: "tutorApplication.status.draft",
    Submitted: "tutorApplication.status.submitted",
    "In review": "tutorApplication.status.inReview",
    Approved: "tutorApplication.status.approved",
    "Needs changes": "tutorApplication.status.needsChanges",
    Rejected: "tutorApplication.status.rejected",
    Suspended: "tutorApplication.status.suspended",
  };
  return keys[status];
}

function statusEmailLabel(status: ApplicationStatus): string {
  return t(statusKey(status));
}

function errorKey(code: string): TranslationKey {
  const keys: Record<string, TranslationKey> = {
    COUNTRY_INVALID: "adminApplications.error.countryInvalid",
    COUNTRY_DUPLICATE: "adminApplications.error.countryDuplicate",
    COUNTRY_NOT_FOUND: "adminApplications.error.countryMissing",
    COMMENT_REQUIRED: "adminApplications.error.commentRequired",
    STATUS_TRANSITION_INVALID: "adminApplications.error.transition",
    APPLICATION_NOT_IN_REVIEW: "adminApplications.error.notInReview",
    APPLICATION_CHANGED: "adminApplications.error.applicationChanged",
    EMAIL_NOT_QUEUED: "adminApplications.error.emailNotQueued",
    REVIEW_INVALID: "adminApplications.error.reviewInvalid",
    REVIEW_SAVE_FAILED: "adminApplications.error.reviewSave",
    REVIEW_NOT_FOUND: "adminApplications.error.reviewMissing",
    APPLICATION_NOT_APPROVED: "adminApplications.error.notApproved",
    PUBLIC_PROFILE_NOT_FOUND: "adminApplications.error.publicProfileMissing",
    PUBLIC_PROFILE_SAVE_FAILED: "adminApplications.error.publicProfileRefresh",
  };
  return keys[code] ?? "adminApplications.error.generic";
}

function valueText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeDemoReview(value: unknown): DemoReview | null {
  if (!isObject(value) || typeof value.id !== "string" || !value.id || value.is_test_review !== true || !Number.isInteger(value.stars) || Number(value.stars) < 1 || Number(value.stars) > 5) return null;
  return {
    id: value.id,
    stars: Number(value.stars),
    comment: valueText(value.comment),
    is_visible: value.is_visible === true,
    is_test_review: true,
    created_at: valueText(value.created_at),
  };
}

function displayRate(profile: ApplicationProfile): string {
  const cents = Number(profile.hourly_rate_cents);
  return Number.isInteger(cents) && cents > 0 ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100) : "—";
}

function lastDecisionLabel(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return t("adminApplications.lastDecisionPending");
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
  return t("adminApplications.lastDecision", { date });
}

function bytesToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function PrivateDocument({ document }: { document: Document }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const blobUrl = URL.createObjectURL(bytesToBlob(document.content_base64, document.mime_type));
    setUrl(blobUrl);
    return () => URL.revokeObjectURL(blobUrl);
  }, [document.content_base64, document.mime_type]);
  return (
    <div className="mt-3 rounded-xl border border-primary/10 bg-[#FAF9F5] p-3">
      {document.mime_type.startsWith("image/") && url && <img src={url} alt={document.label} className="mb-3 max-h-64 w-full rounded-lg object-contain" />}
      {document.mime_type === "application/pdf" && url && <iframe src={url} title={document.label} className="mb-3 h-64 w-full rounded-lg border border-primary/10" />}
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="break-all text-xs text-muted-foreground">{document.file_name}</span>{url && <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-full border border-primary/20 bg-white px-3 text-xs font-bold text-primary hover:bg-[#EEF2FA]">{t("adminApplications.openCertificate")}</a>}</div>
    </div>
  );
}

function inputClass(): string {
  return "min-h-11 w-full min-w-0 rounded-xl border border-primary/15 bg-white px-3.5 py-2.5 text-sm text-foreground outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-[#F97362]/30";
}

export default function AdminApplications() {
  const [adminReady, setAdminReady] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [applications, setApplications] = useState<Summary[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [filter, setFilter] = useState<"all" | ApplicationStatus>("all");
  const [selected, setSelected] = useState<OpenApplication | null>(null);
  const [comment, setComment] = useState("");
  const [demoReviewStars, setDemoReviewStars] = useState("5");
  const [demoReviewComment, setDemoReviewComment] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [noticeKey, setNoticeKey] = useState<TranslationKey | null>(null);
  const [errorNotice, setErrorNotice] = useState<TranslationKey | null>(null);
  const [staleApplicationId, setStaleApplicationId] = useState<string | null>(null);
  const [countryName, setCountryName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [countryStatus, setCountryStatus] = useState<CountryStatus>("supported");
  const [countryEdits, setCountryEdits] = useState<Record<string, Country>>({});

  async function loadAll() {
    setLoading(true);
    setLoadError(false);
    setErrorNotice(null);
    try {
      const account = await User.me() as { role?: string };
      if (account?.role !== "administrator") {
        setAccessDenied(true);
        setLoading(false);
        return;
      }
      setAdminReady(true);
      await marketplace("admin_initialize");
      const result = await marketplace("admin_list_applications");
      const rows = Array.isArray(result.applications) ? result.applications.filter(isObject) as unknown as Summary[] : [];
      const countryRows = Array.isArray(result.countries) ? result.countries.filter(isObject).map((row) => ({ id: typeof row.id === "string" ? row.id : undefined, country_name: valueText(row.country_name), country_code: valueText(row.country_code), status: row.status === "supported" ? "supported" as const : "waitlist" as const })) : [];
      setApplications(rows);
      setCountries(countryRows);
      setLoading(false);
    } catch (error) {
      console.error("Tutor applications could not be loaded", error);
      setLoadError(true);
      setLoading(false);
    }
  }

  useEffect(() => { void loadAll(); }, []);

  const visibleApplications = useMemo(() => filter === "all" ? applications : applications.filter((application) => application.status === filter), [applications, filter]);
  const statusCounts = useMemo(() => countApplicationsByStatus(applications), [applications]);

  async function openApplication(profileId: string) {
    const keepComment = selected?.profile.id === profileId;
    const commentDraft = comment;
    setBusyAction(`open:${profileId}`);
    setErrorNotice(null);
    setNoticeKey(null);
    try {
      const result = await marketplace("admin_open_application", { profile_id: profileId });
      if (!isObject(result.application)) throw new Error("APPLICATION_NOT_FOUND");
      const record = result.application;
      const profile = isObject(record.profile) ? record.profile as ApplicationProfile : {};
      const review = isObject(record.review) ? record.review as Review : {};
      const docs = Array.isArray(record.documents) ? record.documents.filter(isObject).map((doc) => ({ id: valueText(doc.id), profile_id: valueText(doc.profile_id), label: valueText(doc.label), file_name: valueText(doc.file_name), mime_type: valueText(doc.mime_type), size_bytes: Number(doc.size_bytes ?? 0), content_base64: valueText(doc.content_base64), valid: doc.valid === true, verified: doc.verified === true })) : [];
      const demoReviews = Array.isArray(record.demo_reviews) ? record.demo_reviews.map(safeDemoReview).filter((item): item is DemoReview => item !== null) : [];
      const opened: OpenApplication = { profile, status: (typeof record.status === "string" ? record.status : "Submitted") as ApplicationStatus, tutor_email: valueText(record.tutor_email), review, documents: docs, demo_reviews: demoReviews, payout_status: record.payout_status === "supported" ? "supported" : "waitlist" };
      setSelected(opened);
      setComment(keepComment ? commentDraft : valueText(review.latest_comment));
      setStaleApplicationId(null);
      setApplications((current) => current.map((item) => item.id === profileId ? {
        ...item,
        display_name: valueText(profile.display_name),
        headline: valueText(profile.headline),
        country: valueText(profile.country),
        submission_revision: Number(profile.submission_revision ?? 0),
        status: opened.status,
        latest_comment: valueText(review.latest_comment),
        payout_status: opened.payout_status,
        updated_at: valueText(profile.updated_at) || item.updated_at,
      } : item));
    } catch (error) {
      console.error("Tutor application review could not be opened", error);
      setErrorNotice(errorKey(errorCode(error)));
    } finally {
      setBusyAction("");
    }
  }

  async function refreshApplications() {
    try {
      const result = await marketplace("admin_list_applications");
      if (Array.isArray(result.applications)) setApplications(result.applications.filter(isObject) as unknown as Summary[]);
      if (Array.isArray(result.countries)) setCountries(result.countries.filter(isObject).map((row) => ({ id: typeof row.id === "string" ? row.id : undefined, country_name: valueText(row.country_name), country_code: valueText(row.country_code), status: row.status === "supported" ? "supported" as const : "waitlist" as const })));
    } catch (error) {
      console.error("Tutor application list could not be refreshed", error);
      setErrorNotice(errorKey(errorCode(error)));
    }
  }

  const emailCopy = (status: ApplicationStatus, applicationComment: string) => ({
    subject_prefix: t("adminApplications.email.subjectPrefix"),
    heading: t("adminApplications.email.heading"),
    intro: t("adminApplications.email.intro"),
    status_label: t("adminApplications.email.statusLabel"),
    status_text: statusEmailLabel(status),
    comment_label: t("adminApplications.email.commentLabel"),
    comment: applicationComment,
  });

  async function decide(nextStatus: ApplicationStatus) {
    if (!selected?.profile.id) return;
    const profileId = selected.profile.id;
    if (!comment.trim()) {
      setErrorNotice("adminApplications.error.commentRequired");
      return;
    }
    setBusyAction(`decision:${nextStatus}`);
    setErrorNotice(null);
    setNoticeKey(null);
    try {
      const saved = await saveAndApplyAdminDecision(
        () => marketplace("admin_decide", { profile_id: profileId, next_status: nextStatus, comment, email_copy: emailCopy(nextStatus, comment) }),
        profileId,
        (decision) => {
          setApplications((current) => applySavedDecisionToApplications(current, decision));
          setSelected((current) => applySavedDecisionToSelected(current, decision));
          setStaleApplicationId(null);
        },
      );
      setNoticeKey(saved.decision.notification_state === "sent" ? "adminApplications.emailAccepted" : "adminApplications.emailQueued");
    } catch (error) {
      console.error("Tutor application decision could not be saved", error);
      const code = errorCode(error);
      setErrorNotice(errorKey(code));
      setStaleApplicationId(code === "APPLICATION_CHANGED" ? profileId : null);
    } finally {
      setBusyAction("");
    }
  }

  async function toggleCertificate(document: Document) {
    if (!selected?.profile.id || !document.id) return;
    setBusyAction(`document:${document.id}`);
    setErrorNotice(null);
    try {
      const result = await marketplace("admin_verify_document", { profile_id: selected.profile.id, document_id: document.id, verified: !document.verified });
      const verifiedIds = Array.isArray(result.verified_document_ids) ? result.verified_document_ids.filter((id): id is string => typeof id === "string") : [];
      setSelected((current) => current ? { ...current, documents: current.documents.map((item) => ({ ...item, verified: verifiedIds.includes(item.id) })), review: { ...current.review, verified_document_ids: verifiedIds } } : current);
    } catch (error) {
      console.error("Tutor certificate verification could not be saved", error);
      setErrorNotice(errorKey(errorCode(error)));
    } finally {
      setBusyAction("");
    }
  }

  async function retryEmail() {
    if (!selected?.profile.id) return;
    const status = selected.status;
    setBusyAction("email");
    setErrorNotice(null);
    setNoticeKey(null);
    try {
      const result = await marketplace("admin_retry_email", { profile_id: selected.profile.id, email_copy: emailCopy(status, valueText(selected.review.latest_comment)) });
      const notification = result.notification_state === "sent" ? "sent" : "queued";
      setSelected((current) => current ? { ...current, review: { ...current.review, notification_state: notification } } : current);
      setNoticeKey(notification === "sent" ? "adminApplications.emailAccepted" : "adminApplications.emailQueued");
      await refreshApplications();
    } catch (error) {
      console.error("Tutor decision email retry could not be completed", error);
      setErrorNotice(errorKey(errorCode(error)));
    } finally {
      setBusyAction("");
    }
  }

  async function addDemoReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected?.profile.id || selected.status !== "Approved" || busyAction) return;
    const stars = Number(demoReviewStars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      setErrorNotice("adminApplications.error.reviewInvalid");
      return;
    }
    setBusyAction("demo-review-add");
    setErrorNotice(null);
    setNoticeKey(null);
    try {
      const result = await marketplace("admin_add_test_review", {
        profile_id: selected.profile.id,
        stars,
        comment: demoReviewComment.trim(),
      });
      const savedReview = safeDemoReview(result.review);
      if (!savedReview) throw new Error("REVIEW_SAVE_FAILED");
      setSelected((current) => current ? {
        ...current,
        demo_reviews: [savedReview, ...current.demo_reviews.filter((item) => item.id !== savedReview.id)],
      } : current);
      setDemoReviewStars("5");
      setDemoReviewComment("");
      setNoticeKey(result.public_profile_state === "published" ? "adminApplications.demoReviewAdded" : "adminApplications.demoReviewRefreshPending");
    } catch (error) {
      console.error("Demo tutor review could not be saved", error);
      const code = errorCode(error);
      setErrorNotice(errorKey(code));
      setStaleApplicationId(code === "APPLICATION_CHANGED" ? selected.profile.id : null);
    } finally {
      setBusyAction("");
    }
  }

  async function hideDemoReview(reviewId: string) {
    if (!selected?.profile.id || selected.status !== "Approved" || busyAction) return;
    setBusyAction(`demo-review-hide:${reviewId}`);
    setErrorNotice(null);
    setNoticeKey(null);
    try {
      const result = await marketplace("admin_hide_test_review", { profile_id: selected.profile.id, review_id: reviewId });
      const hiddenReview = safeDemoReview(result.review);
      if (!hiddenReview) throw new Error("REVIEW_NOT_FOUND");
      setSelected((current) => current ? {
        ...current,
        demo_reviews: current.demo_reviews.map((item) => item.id === hiddenReview.id ? hiddenReview : item),
      } : current);
      setNoticeKey(result.public_profile_state === "published" ? "adminApplications.demoReviewHidden" : "adminApplications.demoReviewHideRefreshPending");
    } catch (error) {
      console.error("Demo tutor review could not be hidden", error);
      const code = errorCode(error);
      setErrorNotice(errorKey(code));
      setStaleApplicationId(code === "APPLICATION_CHANGED" ? selected.profile.id : null);
    } finally {
      setBusyAction("");
    }
  }

  async function refreshPublicProfile() {
    if (!selected?.profile.id || selected.status !== "Approved" || busyAction) return;
    setBusyAction("public-profile-refresh");
    setErrorNotice(null);
    setNoticeKey(null);
    try {
      await marketplace("admin_refresh_public_profile", { profile_id: selected.profile.id });
      setNoticeKey("adminApplications.publicProfileRefreshed");
    } catch (error) {
      console.error("Public tutor profile refresh could not be completed", error);
      const code = errorCode(error);
      setErrorNotice(errorKey(code));
      setStaleApplicationId(code === "APPLICATION_CHANGED" ? selected.profile.id : null);
    } finally {
      setBusyAction("");
    }
  }

  function changeCountry(countryId: string, field: keyof Country, value: string) {
    const original = countries.find((item) => item.id === countryId);
    if (!original) return;
    setCountryEdits((current) => ({ ...current, [countryId]: { ...current[countryId] ?? original, [field]: value } as Country }));
  }

  async function saveCountry(country?: Country) {
    const target = country ?? { country_name: countryName, country_code: countryCode, status: countryStatus };
    if (!target.country_name.trim() || !/^[A-Za-z]{2}$/.test(target.country_code.trim())) {
      setErrorNotice("adminApplications.error.countryInvalid");
      return;
    }
    setBusyAction(target.id ?? "country-new");
    setErrorNotice(null);
    setNoticeKey(null);
    try {
      const result = await marketplace("admin_save_country", { country_id: target.id, country_name: target.country_name, country_code: target.country_code.toUpperCase(), status: target.status });
      const rows = Array.isArray(result.countries) ? result.countries.filter(isObject).map((row) => ({ id: typeof row.id === "string" ? row.id : undefined, country_name: valueText(row.country_name), country_code: valueText(row.country_code), status: row.status === "supported" ? "supported" as const : "waitlist" as const })) : [];
      setCountries(rows);
      if (target.id) setCountryEdits((current) => { const next = { ...current }; delete next[target.id!]; return next; });
      else { setCountryName(""); setCountryCode(""); setCountryStatus("supported"); }
      setNoticeKey("adminApplications.countrySaved");
    } catch (error) {
      console.error("Payout country setting could not be saved", error);
      setErrorNotice(errorKey(errorCode(error)));
    } finally {
      setBusyAction("");
    }
  }

  const notificationQueued = selected?.review.notification_state === "queued";
  const statusLabel = (status: ApplicationStatus) => t(statusKey(status));

  if (accessDenied) return <section className="rounded-[1.75rem] border border-[#F3C9C3] bg-white p-6 text-sm leading-6 text-[#8D342D]">{t("adminApplications.accessDenied")}</section>;
  if (loading) return <div className="rounded-[1.75rem] border border-primary/10 bg-white p-7 text-sm font-semibold text-muted-foreground">{t("adminApplications.loading")}</div>;
  if (loadError || !adminReady) return <section className="rounded-[1.75rem] border border-[#F3C9C3] bg-white p-6"><p role="alert" className="text-sm leading-6 text-[#8D342D]">{t("adminApplications.loadError")}</p><button type="button" onClick={() => void loadAll()} className="parle-button-primary mt-5 justify-center">{t("adminApplications.retry")}</button></section>;

  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-primary/10 bg-white p-5 shadow-[0_20px_60px_-50px_rgba(30,58,138,0.35)] sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FA] text-primary"><UsersRound aria-hidden="true" className="h-5 w-5" /></span><div><p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#C64D43]">{t("adminApplications.eyebrow")}</p><h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{t("adminApplications.title")}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("adminApplications.intro")}</p></div></div><div className="rounded-2xl bg-[#FAF9F5] px-4 py-3 text-sm font-bold text-primary">{t("adminApplications.applicationCount").replace("{count}", String(applications.length))}</div></div>
        <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label={t("adminApplications.filterLabel")}>
          {statusFilters.map((item) => {
            const label = item === "all" ? t("adminApplications.filterAll") : statusLabel(item);
            return <button key={item} type="button" onClick={() => setFilter(item)} aria-pressed={filter === item} className={`min-h-9 rounded-full border px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] ${filter === item ? "border-primary bg-primary text-white" : "border-primary/15 bg-white text-primary hover:bg-[#EEF2FA]"}`}>{t("adminApplications.filterOptionWithCount", { label, count: statusCounts[item] })}</button>;
          })}
        </div>
        {visibleApplications.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-primary/20 p-6 text-center"><p className="font-display text-lg font-extrabold text-primary">{t("adminApplications.emptyTitle")}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("adminApplications.emptyBody")}</p></div> : <div className="mt-5 grid gap-3 lg:grid-cols-2">{visibleApplications.map((application) => <motion.article layout key={application.id} className="rounded-2xl border border-primary/10 bg-white p-4 transition hover:border-primary/25 hover:shadow-sm sm:p-5"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-display text-lg font-extrabold text-primary">{application.display_name || t("adminApplications.unnamedTutor")}</p><p className="mt-1 break-all text-xs leading-5 text-muted-foreground">{application.tutor_email}</p><p className="mt-2 break-words text-sm leading-5 text-foreground">{application.headline}</p></div><span className="shrink-0 rounded-full bg-[#EEF2FA] px-2.5 py-1 text-[10px] font-extrabold text-primary">{statusLabel(application.status)}</span></div><div className="mt-4 border-t border-primary/10 pt-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0 space-y-1"><div className="flex flex-wrap gap-2 text-[11px] font-semibold text-muted-foreground"><span>{application.country}</span><span aria-hidden="true">·</span><span>{t(application.payout_status === "supported" ? "adminApplications.payoutSupported" : "adminApplications.payoutWaitlist")}</span></div><p className="break-words text-[11px] leading-5 text-muted-foreground">{lastDecisionLabel(application.last_decision_at)}</p></div><button type="button" onClick={() => void openApplication(application.id)} disabled={busyAction === `open:${application.id}`} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-primary/20 px-4 text-xs font-bold text-primary transition hover:bg-[#EEF2FA] disabled:opacity-60">{busyAction === `open:${application.id}` ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <FileCheck2 aria-hidden="true" className="h-4 w-4" />}{t("adminApplications.open")}</button></div></div>{application.latest_comment && <p className="mt-3 line-clamp-2 border-l-2 border-[#F97362] pl-3 text-xs leading-5 text-muted-foreground">{application.latest_comment}</p>}</motion.article>)}</div>}
      </section>

      <section className="rounded-[1.75rem] border border-primary/10 bg-white p-5 shadow-[0_20px_60px_-50px_rgba(30,58,138,0.35)] sm:p-8">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0ED] text-[#A13F36]"><WalletCards aria-hidden="true" className="h-5 w-5" /></span><div><h2 className="font-display text-xl font-extrabold tracking-[-0.035em] text-primary">{t("adminApplications.countriesTitle")}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{t("adminApplications.countriesHelp")}</p></div></div>
        <div className="mt-5 space-y-3">
          {countries.map((country) => {
            const editableCountry = country.id ? countryEdits[country.id] ?? country : country;
            const rowId = country.id ?? country.country_code;
            return <article key={rowId} className="grid gap-3 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4 sm:grid-cols-[minmax(0,1.2fr)_100px_minmax(0,0.8fr)_auto] sm:items-end"><div className="space-y-1.5"><label htmlFor={`country-name-${rowId}`} className="text-xs font-bold text-muted-foreground">{t("adminApplications.countryName")}</label><input id={`country-name-${rowId}`} className={inputClass()} maxLength={80} value={editableCountry.country_name} onChange={(event) => country.id && changeCountry(country.id, "country_name", event.target.value)} /></div><div className="space-y-1.5"><label htmlFor={`country-code-${rowId}`} className="text-xs font-bold text-muted-foreground">{t("adminApplications.countryCode")}</label><input id={`country-code-${rowId}`} className={inputClass()} maxLength={2} value={editableCountry.country_code} onChange={(event) => country.id && changeCountry(country.id, "country_code", event.target.value.toUpperCase())} /></div><div className="space-y-1.5"><label htmlFor={`country-status-${rowId}`} className="text-xs font-bold text-muted-foreground">{t("adminApplications.payoutStatus")}</label><select id={`country-status-${rowId}`} className={inputClass()} value={editableCountry.status} onChange={(event) => country.id && changeCountry(country.id, "status", event.target.value)}><option value="supported">{t("adminApplications.payoutSupported")}</option><option value="waitlist">{t("adminApplications.payoutWaitlist")}</option></select></div><button type="button" onClick={() => void saveCountry(editableCountry)} disabled={busyAction === country.id} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-primary/20 bg-white px-4 text-xs font-bold text-primary hover:bg-[#EEF2FA] disabled:opacity-60">{busyAction === country.id ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}{t("adminApplications.saveCountry")}</button></article>;
          })}
          <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void saveCountry(); }} className="grid gap-3 rounded-2xl border border-dashed border-primary/20 p-4 sm:grid-cols-[minmax(0,1.2fr)_100px_minmax(0,0.8fr)_auto] sm:items-end"><div className="space-y-1.5"><label htmlFor="new-country-name" className="text-xs font-bold text-muted-foreground">{t("adminApplications.countryName")}</label><input id="new-country-name" className={inputClass()} maxLength={80} value={countryName} onChange={(event) => setCountryName(event.target.value)} placeholder={t("adminApplications.newCountryName")} /></div><div className="space-y-1.5"><label htmlFor="new-country-code" className="text-xs font-bold text-muted-foreground">{t("adminApplications.countryCode")}</label><input id="new-country-code" className={inputClass()} maxLength={2} value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} placeholder={t("adminApplications.newCountryCode")} /></div><div className="space-y-1.5"><label htmlFor="new-country-status" className="text-xs font-bold text-muted-foreground">{t("adminApplications.payoutStatus")}</label><select id="new-country-status" className={inputClass()} value={countryStatus} onChange={(event) => setCountryStatus(event.target.value === "waitlist" ? "waitlist" : "supported")}><option value="supported">{t("adminApplications.payoutSupported")}</option><option value="waitlist">{t("adminApplications.payoutWaitlist")}</option></select></div><button type="submit" disabled={busyAction === "country-new"} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-xs font-extrabold text-white hover:bg-primary/90 disabled:opacity-60">{busyAction === "country-new" ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <WalletCards aria-hidden="true" className="h-4 w-4" />}{t("adminApplications.addCountry")}</button></form>
        </div>
      </section>

      <AnimatePresence>
        {selected && <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="rounded-[1.75rem] border border-primary/10 bg-white p-5 shadow-[0_20px_60px_-50px_rgba(30,58,138,0.35)] sm:p-8">
          <div className="flex flex-col gap-3 border-b border-primary/10 pb-5 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F4EC] text-[#236646]"><ShieldCheck aria-hidden="true" className="h-5 w-5" /></span><div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#C64D43]">{t("adminApplications.privateReview")}</p><h2 className="mt-1 break-words font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{valueText(selected.profile.display_name) || t("adminApplications.unnamedTutor")}</h2><p className="mt-1 break-all text-sm text-muted-foreground">{selected.tutor_email}</p></div></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#EEF2FA] px-3 py-1.5 text-xs font-extrabold text-primary">{statusLabel(selected.status)}</span><button type="button" onClick={() => { setSelected(null); setErrorNotice(null); setNoticeKey(null); }} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-primary/15 px-3 text-xs font-bold text-primary hover:bg-[#EEF2FA]"><ArrowLeft aria-hidden="true" className="h-4 w-4" />{t("adminApplications.closeReview")}</button></div></div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
            <div className="space-y-4">
              <article className="rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4 sm:p-5"><h3 className="font-display text-lg font-extrabold text-primary">{t("adminApplications.profileDetails")}</h3><div className="mt-4 flex flex-col gap-4 sm:flex-row">{selected.profile.photo_base64 ? <img src={`data:${valueText(selected.profile.photo_mime_type) || "image/jpeg"};base64,${selected.profile.photo_base64}`} alt={t("adminApplications.photoAlt")} className="h-24 w-24 shrink-0 rounded-full border border-primary/10 object-cover" /> : <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-white text-primary"><UsersRound aria-hidden="true" className="h-8 w-8" /></div>}<div className="min-w-0"><p className="break-words font-bold text-foreground">{valueText(selected.profile.headline)}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{valueText(selected.profile.bio)}</p></div></div><dl className="mt-4 grid gap-3 border-t border-primary/10 pt-4 sm:grid-cols-2"><div><dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{t("adminApplications.country")}</dt><dd className="mt-1 break-words text-sm font-semibold text-foreground">{valueText(selected.profile.country)}</dd></div><div><dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{t("adminApplications.timeZone")}</dt><dd className="mt-1 break-all text-sm font-semibold text-foreground">{valueText(selected.profile.time_zone)}</dd></div><div><dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{t("adminApplications.languages")}</dt><dd className="mt-1 break-words text-sm font-semibold text-foreground">{Array.isArray(selected.profile.spoken_languages) ? (selected.profile.spoken_languages as string[]).join(", ") : ""}</dd></div><div><dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{t("adminApplications.yearsTeaching")}</dt><dd className="mt-1 text-sm font-semibold text-foreground">{String(selected.profile.years_teaching ?? 0)}</dd></div><div><dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{t("adminApplications.hourlyRate")}</dt><dd className="mt-1 text-sm font-semibold text-foreground">{displayRate(selected.profile)}</dd></div><div><dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{t("adminApplications.payoutStatus")}</dt><dd className="mt-1 text-sm font-semibold text-foreground">{t(selected.payout_status === "supported" ? "adminApplications.payoutSupported" : "adminApplications.payoutWaitlist")}</dd></div></dl>
                <div className="mt-4 space-y-3 border-t border-primary/10 pt-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{t("adminApplications.specialties")}</p><p className="mt-1 break-words text-sm leading-6 text-foreground">{Array.isArray(selected.profile.specialties) ? (selected.profile.specialties as string[]).map((value) => t(({
                  canada_immigration_tef_tcf: "tutorApplication.specialty.immigration",
                  canadian_citizenship: "tutorApplication.specialty.citizenship",
                  conversation: "tutorApplication.specialty.conversation",
                  grammar: "tutorApplication.specialty.grammar",
                  business_french: "tutorApplication.specialty.business",
                  beginners: "tutorApplication.specialty.beginner",
                } as Record<string, TranslationKey>)[value] ?? "tutorApplication.specialties")).join(", ") : ""}</p></div><div><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{t("adminApplications.levels")}</p><p className="mt-1 break-words text-sm text-foreground">{Array.isArray(selected.profile.levels_taught) ? (selected.profile.levels_taught as string[]).join(", ") : ""}</p></div><div><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{t("adminApplications.styles")}</p><p className="mt-1 break-words text-sm text-foreground">{Array.isArray(selected.profile.teaching_styles) ? (selected.profile.teaching_styles as string[]).map((value) => t(teachingStyleKeys[value] ?? "adminApplications.notProvided")).join(", ") : ""}</p></div></div>
                <div className="mt-4 space-y-3 border-t border-primary/10 pt-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{t("adminApplications.introVideo")}</p>{valueText(selected.profile.intro_video_url) ? <a href={valueText(selected.profile.intro_video_url)} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-sm font-bold text-primary underline-offset-4 hover:underline">{valueText(selected.profile.intro_video_url)}</a> : <p className="mt-1 text-sm text-muted-foreground">{t("adminApplications.notProvided")}</p>}</div><div><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{t("adminApplications.meetingLink")}</p><p className="mt-1 break-all text-sm text-foreground">{valueText(selected.profile.meeting_link) || t("adminApplications.notProvided")}</p></div></div>
              </article>

              <article className="rounded-2xl border border-primary/10 p-4 sm:p-5"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EEF2FA] text-primary"><FileText aria-hidden="true" className="h-4 w-4" /></span><div><h3 className="font-display text-lg font-extrabold text-primary">{t("adminApplications.certificatesTitle")}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("adminApplications.certificatePrivateHelp")}</p></div></div><div className="mt-4 space-y-3">{selected.documents.length === 0 ? <p className="rounded-xl border border-dashed border-primary/20 p-4 text-sm text-muted-foreground">{t("adminApplications.noCertificates")}</p> : selected.documents.map((document) => <div key={document.id} className="rounded-xl border border-primary/10 p-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-words text-sm font-extrabold text-foreground">{document.label}</p><p className="mt-1 text-xs text-muted-foreground">{document.size_bytes} · {document.mime_type}</p></div>{selected.status !== "Draft" && <button type="button" disabled={busyAction === `document:${document.id}` || !document.valid || selected.status !== "In review"} onClick={() => void toggleCertificate(document)} className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-full border px-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 ${document.verified ? "border-[#B9D9CB] bg-[#F1F8F4] text-[#236646]" : "border-primary/20 bg-white text-primary hover:bg-[#EEF2FA]"}`}>{busyAction === `document:${document.id}` ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <BadgeCheck aria-hidden="true" className="h-4 w-4" />}{t(document.verified ? "adminApplications.unverifyCertificate" : "adminApplications.verifyCertificate")}</button>}</div>{document.valid ? <PrivateDocument document={document} /> : <p role="status" className="mt-3 rounded-lg bg-[#FFF8E9] p-3 text-xs leading-5 text-[#6D531F]">{t("adminApplications.invalidCertificate")}</p>}</div>)}</div></article>
            </div>

            <aside className="space-y-4">
              <article className="rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4 sm:p-5"><div className="flex items-start justify-between gap-2"><div><h3 className="font-display text-lg font-extrabold text-primary">{t("adminApplications.decisionTitle")}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("adminApplications.decisionHelp")}</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-extrabold text-primary">{statusLabel(selected.status)}</span></div>{selected.status !== "Draft" && <><label htmlFor="review-comment" className="mt-4 block text-sm font-bold text-foreground">{t("adminApplications.commentLabel")}</label><textarea id="review-comment" maxLength={1500} value={comment} onChange={(event) => { setComment(event.target.value); setErrorNotice(null); }} placeholder={t("adminApplications.commentPlaceholder")} className={`${inputClass()} mt-2 min-h-32 resize-y`} /><p className="mt-1 text-right text-[11px] text-muted-foreground">{comment.length} / 1500</p></>}
                {selected.status === "In review" && <div className="mt-4 grid gap-2"><button type="button" onClick={() => void decide("Approved")} disabled={Boolean(busyAction) || !comment.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#236646] px-4 text-sm font-extrabold text-white hover:bg-[#18543A] disabled:opacity-50">{busyAction === "decision:Approved" ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}{t("adminApplications.approve")}</button><button type="button" onClick={() => void decide("Needs changes")} disabled={Boolean(busyAction) || !comment.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-primary/20 bg-white px-4 text-sm font-bold text-primary hover:bg-[#EEF2FA] disabled:opacity-50">{t("adminApplications.needsChanges")}</button><button type="button" onClick={() => void decide("Rejected")} disabled={Boolean(busyAction) || !comment.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#E9BDB6] bg-[#FFF5F2] px-4 text-sm font-bold text-[#8D342D] hover:bg-[#FFE9E4] disabled:opacity-50">{t("adminApplications.reject")}</button></div>}
                {selected.status === "Approved" && <button type="button" onClick={() => void decide("Suspended")} disabled={Boolean(busyAction) || !comment.trim()} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#E9BDB6] bg-[#FFF5F2] px-4 text-sm font-bold text-[#8D342D] hover:bg-[#FFE9E4] disabled:opacity-50">{busyAction === "decision:Suspended" ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <CircleAlert aria-hidden="true" className="h-4 w-4" />}{t("adminApplications.suspend")}</button>}
                {selected.status !== "In review" && selected.status !== "Approved" && <p className="mt-4 rounded-xl border border-primary/10 bg-white p-3 text-xs leading-5 text-muted-foreground">{t("adminApplications.noDecisionAvailable")}</p>}
              </article>
              {selected.status === "Approved" && <article className="rounded-2xl border border-[#C9D7EE] bg-[#F8FAFE] p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-lg font-extrabold text-primary">{t("adminApplications.demoReviewSectionTitle")}</h3><span className="rounded-full bg-[#FFF0EC] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#8D342D]">{t("adminApplications.demoReviewTag")}</span></div>
                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{t("adminApplications.demoReviewSectionHelp")}</p>
                  </div>
                  <button type="button" onClick={() => void refreshPublicProfile()} disabled={Boolean(busyAction)} aria-label={t("adminApplications.publicProfileRefresh")} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-primary/20 bg-white px-3.5 text-xs font-extrabold text-primary transition hover:bg-[#EEF2FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] disabled:cursor-wait disabled:opacity-60">
                    {busyAction === "public-profile-refresh" ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}
                    {t(busyAction === "public-profile-refresh" ? "adminApplications.publicProfileRefreshing" : errorNotice === "adminApplications.error.publicProfileRefresh" ? "adminApplications.publicProfileRetry" : "adminApplications.publicProfileRefresh")}
                  </button>
                </div>
                <p className="mt-3 rounded-xl border border-white bg-white/80 px-3 py-2.5 text-[11px] leading-5 text-muted-foreground">{t("adminApplications.publicProfileHelp")}</p>

                <form onSubmit={addDemoReview} className="mt-4 space-y-3 border-t border-primary/10 pt-4">
                  <div className="space-y-1.5"><label htmlFor="demo-review-stars" className="text-xs font-bold text-foreground">{t("adminApplications.demoReviewStarsLabel")}</label><select id="demo-review-stars" value={demoReviewStars} onChange={(event) => { setDemoReviewStars(event.target.value); setErrorNotice(null); }} disabled={Boolean(busyAction)} className={inputClass()}>{[1, 2, 3, 4, 5].map((stars) => <option key={stars} value={stars}>{stars} {t(stars === 1 ? "adminApplications.demoReview.star" : "adminApplications.demoReview.stars")}</option>)}</select></div>
                  <div className="space-y-1.5"><label htmlFor="demo-review-comment" className="text-xs font-bold text-foreground">{t("adminApplications.demoReviewCommentLabel")}</label><textarea id="demo-review-comment" value={demoReviewComment} onChange={(event) => { setDemoReviewComment(event.target.value.slice(0, 700)); setErrorNotice(null); }} maxLength={700} rows={3} disabled={Boolean(busyAction)} placeholder={t("adminApplications.demoReviewCommentPlaceholder")} className={`${inputClass()} min-h-24 resize-y`} /><p className="text-right text-[10px] text-muted-foreground">{t("adminApplications.demoReviewCommentCount").replace("{count}", String(demoReviewComment.length))}</p></div>
                  <button type="submit" disabled={Boolean(busyAction)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-xs font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait disabled:opacity-55">
                    {busyAction === "demo-review-add" ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Star aria-hidden="true" className="h-4 w-4" />}
                    {t(busyAction === "demo-review-add" ? "adminApplications.demoReviewAdding" : "adminApplications.demoReviewAdd")}
                  </button>
                </form>

                <div className="mt-5 border-t border-primary/10 pt-4">
                  <h4 className="font-display text-sm font-extrabold text-primary">{t("adminApplications.demoReviewListTitle")}</h4>
                  {selected.demo_reviews.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-primary/15 bg-white p-3 text-xs leading-5 text-muted-foreground">{t("adminApplications.demoReviewEmpty")}</p> : <ul className="mt-3 space-y-2.5">{selected.demo_reviews.map((review) => <li key={review.id} className="min-w-0 rounded-xl border border-primary/10 bg-white p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5"><span className="rounded-full bg-[#FFF0EC] px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#8D342D]">{t("adminApplications.demoReviewTag")}</span><span className={`rounded-full px-2 py-1 text-[9px] font-extrabold ${review.is_visible ? "bg-[#E8F4EC] text-[#205D45]" : "bg-[#F1F2F5] text-[#555D6B]"}`}>{t(review.is_visible ? "adminApplications.demoReviewVisible" : "adminApplications.demoReviewHiddenStatus")}</span></div>
                        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#FFF8E9] px-2.5 py-1 text-xs font-extrabold text-[#805916]" aria-label={t("adminApplications.demoReviewStarsAria").replace("{stars}", String(review.stars))}><Star aria-hidden="true" className="h-3.5 w-3.5 fill-current" />{review.stars}/5</p>
                        <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-foreground">{review.comment || t("adminApplications.demoReviewNoComment")}</p>
                      </div>
                      {review.is_visible && <button type="button" onClick={() => void hideDemoReview(review.id)} disabled={Boolean(busyAction)} aria-label={t("adminApplications.demoReviewHideLabel").replace("{stars}", String(review.stars))} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-full border border-[#E9BDB6] bg-[#FFF5F2] px-3 text-[11px] font-bold text-[#8D342D] transition hover:bg-[#FFE9E4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] disabled:cursor-wait disabled:opacity-60">{busyAction === `demo-review-hide:${review.id}` ? <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <CircleAlert aria-hidden="true" className="h-3.5 w-3.5" />}{t(busyAction === `demo-review-hide:${review.id}` ? "adminApplications.demoReviewHiding" : "adminApplications.demoReviewHide")}</button>}
                    </div>
                  </li>)}</ul>}
                </div>
              </article>}
              <article className="rounded-2xl border border-primary/10 p-4 sm:p-5"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EEF2FA] text-primary"><MailCheck aria-hidden="true" className="h-4 w-4" /></span><div><h3 className="font-display text-base font-extrabold text-primary">{t("adminApplications.emailStateTitle")}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{t(notificationQueued ? "adminApplications.emailQueued" : selected.review.notification_state === "sent" ? "adminApplications.emailAccepted" : "adminApplications.emailNotSent")}</p></div></div>{notificationQueued && <button type="button" onClick={() => void retryEmail()} disabled={Boolean(busyAction)} className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-primary/20 px-4 text-xs font-bold text-primary hover:bg-[#EEF2FA] disabled:opacity-60">{busyAction === "email" ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}{t("adminApplications.retryEmail")}</button>}</article>
              <p className="rounded-xl border border-[#C9D7EE] bg-[#F5F8FD] p-4 text-xs leading-5 text-primary">{t("adminApplications.emailPrivacyNote")}</p>
            </aside>
          </div>
        </motion.section>}
      </AnimatePresence>

      {errorNotice && <div role="alert" className="flex items-start gap-2 rounded-xl border border-[#F3C9C3] bg-[#FFF5F2] p-3 text-sm leading-6 text-[#8D342D]"><CircleAlert aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" /><div className="min-w-0 flex-1"><p>{t(errorNotice)}</p>{staleApplicationId && selected?.profile.id === staleApplicationId && <button type="button" onClick={() => void openApplication(staleApplicationId)} disabled={Boolean(busyAction)} className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-full border border-[#E9BDB6] bg-white px-3 text-xs font-bold text-[#8D342D] transition hover:bg-[#FFE9E4] disabled:opacity-60"><RefreshCw aria-hidden="true" className="h-4 w-4" />{t("adminApplications.open")}</button>}</div></div>}
      {noticeKey && <p role="status" className="flex items-start gap-2 rounded-xl border border-[#B9D9CB] bg-[#F1F8F4] p-3 text-sm leading-6 text-[#236646]"><Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />{t(noticeKey)}</p>}
      <p className="px-1 text-xs leading-5 text-muted-foreground">{t("adminApplications.demoNote")}</p>
    </div>
  );
}
