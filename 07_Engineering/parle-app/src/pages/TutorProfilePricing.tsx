import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, BadgeCheck, Check, CircleAlert, Clock3, DollarSign, LoaderCircle, LockKeyhole, Save, Video } from "lucide-react";
import { parleMarketplaceService } from "@/functions";
import { browserTimeZone } from "@/lib/parle-profile";
import { t, type TranslationKey } from "@/lib/i18n";
import { approvedPublicProfileSaveState, parseHourlyRateCents, proratedPriceCents, TUTOR_LANGUAGES, TUTOR_STYLES, type ApprovedPublicProfileSaveState } from "../../functions/parle-marketplace.helper.ts";

type ApplicationStatus = "Draft" | "Submitted" | "In review" | "Approved" | "Needs changes" | "Rejected" | "Suspended";
type ProfileForm = {
  headline: string;
  bio: string;
  spokenLanguages: string[];
  teachingStyles: string[];
  hourlyRate: string;
  introVideoUrl: string;
  introVideoUnlisted: boolean;
  meetingLink: string;
};
type ApplicationData = {
  status: ApplicationStatus;
  profile: Record<string, unknown>;
  latestComment: string;
  approvedPublicProfileEditable: boolean;
  publicProfilePublished: boolean;
  publicProfileRefreshPending: boolean;
};

const LANGUAGE_KEYS: Record<string, TranslationKey> = {
  English: "language.english", French: "language.french", Spanish: "language.spanish", Portuguese: "language.portuguese",
  Arabic: "language.arabic", Persian: "language.persian", Hindi: "language.hindi", Punjabi: "language.punjabi",
  Urdu: "language.urdu", Tagalog: "language.tagalog", Mandarin: "language.mandarin", Vietnamese: "language.vietnamese",
  Ukrainian: "language.ukrainian", Russian: "language.russian", Turkish: "language.turkish", Other: "language.other",
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
const STATUS_KEYS: Record<ApplicationStatus, TranslationKey> = {
  Draft: "tutorApplication.status.draft",
  Submitted: "tutorApplication.status.submitted",
  "In review": "tutorApplication.status.inReview",
  Approved: "tutorApplication.status.approved",
  "Needs changes": "tutorApplication.status.needsChanges",
  Rejected: "tutorApplication.status.rejected",
  Suspended: "tutorApplication.status.suspended",
};
const SAVE_SUCCESS_KEYS: Record<ApprovedPublicProfileSaveState, TranslationKey> = {
  unpublished: "profilePricing.saveSuccessUnpublished",
  refresh_pending: "profilePricing.saveSuccessPending",
  current: "profilePricing.saveSuccessCurrent",
};
const INITIAL_FORM: ProfileForm = {
  headline: "", bio: "", spokenLanguages: [], teachingStyles: [], hourlyRate: "",
  introVideoUrl: "", introVideoUnlisted: false, meetingLink: "",
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

async function marketplace(action: string, values: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const response = unwrap(await parleMarketplaceService({ action, ...values }));
  if (typeof response.error === "string" || response.status === "error" || response.success === false) {
    throw new Error(typeof response.code === "string" ? response.code : typeof response.error === "string" ? response.error : "REQUEST_FAILED");
  }
  return response;
}

function safeStrings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string"))] : [];
}

function formFromProfile(profile: Record<string, unknown>): ProfileForm {
  const rate = Number(profile.hourly_rate_cents);
  return {
    headline: typeof profile.headline === "string" ? profile.headline : "",
    bio: typeof profile.bio === "string" ? profile.bio : "",
    spokenLanguages: safeStrings(profile.spoken_languages),
    teachingStyles: safeStrings(profile.teaching_styles),
    hourlyRate: Number.isInteger(rate) && rate > 0 ? (rate / 100).toFixed(2).replace(/\.00$/, "") : "",
    introVideoUrl: typeof profile.intro_video_url === "string" ? profile.intro_video_url : "",
    introVideoUnlisted: profile.intro_video_unlisted_confirmed === true,
    meetingLink: typeof profile.meeting_link === "string" ? profile.meeting_link : "",
  };
}

function statusValue(value: unknown): ApplicationStatus {
  return typeof value === "string" && value in STATUS_KEYS ? value as ApplicationStatus : "Draft";
}

function payloadFrom(result: Record<string, unknown>): ApplicationData | null {
  if (!isObject(result.profile)) return null;
  const review = isObject(result.review) ? result.review : {};
  return {
    status: statusValue(result.status),
    profile: result.profile,
    latestComment: typeof review.latest_comment === "string" ? review.latest_comment.trim() : "",
    approvedPublicProfileEditable: result.approved_public_profile_editable === true,
    publicProfilePublished: result.public_profile_published === true,
    publicProfileRefreshPending: result.public_profile_refresh_pending === true,
  };
}

function errorKey(code: string): TranslationKey {
  const keys: Record<string, TranslationKey> = {
    APPLICATION_NOT_APPROVED: "profilePricing.error.notApproved",
    APPLICATION_CHANGED: "profilePricing.error.applicationChanged",
    PROFILE_EDIT_FIELD_NOT_ALLOWED: "profilePricing.error.lockedFields",
    PROFILE_EDIT_INVALID: "profilePricing.error.form",
    HEADLINE_REQUIRED: "profilePricing.error.headline",
    BIO_REQUIRED: "profilePricing.error.bio",
    LANGUAGES_REQUIRED: "profilePricing.error.languages",
    STYLES_REQUIRED: "profilePricing.error.styles",
    RATE_INVALID: "profilePricing.error.rate",
    VIDEO_INVALID: "profilePricing.error.video",
    MEETING_LINK_INVALID: "profilePricing.error.meeting",
    PROFILE_EDIT_CONFLICT: "profilePricing.error.conflict",
    PROFILE_EDIT_SAVE_FAILED: "profilePricing.error.save",
    TUTOR_REQUIRED: "profilePricing.error.access",
  };
  return keys[code] ?? "profilePricing.error.generic";
}

function money(cents: number | null): string {
  return cents === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "CAD" }).format(cents / 100);
}

function videoLinkIsValid(value: string): boolean {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.protocol === "https:" && ["youtube.com", "m.youtube.com", "youtu.be", "vimeo.com", "player.vimeo.com"].includes(host) && url.pathname.length > 1;
  } catch { return false; }
}

function meetingLinkIsValid(value: string): boolean {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "meet.google.com" || host === "zoom.us" || host.endsWith(".zoom.us")) && url.pathname.length > 1;
  } catch { return false; }
}

function choiceLabel(value: string, keys: Record<string, TranslationKey>): string {
  const key = keys[value];
  return key ? t(key) : value;
}

function ChoiceGroup({
  options, selected, onToggle, label,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((value) => {
        const active = selected.includes(value);
        const keys = options === TUTOR_LANGUAGES ? LANGUAGE_KEYS : STYLE_KEYS;
        return <button key={value} type="button" aria-pressed={active} onClick={() => onToggle(value)} className={`min-h-10 max-w-full rounded-full border px-3.5 py-2 text-left text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] ${active ? "border-primary bg-primary text-white" : "border-primary/15 bg-white text-primary hover:border-primary/35 hover:bg-[#F2F4F9]"}`}>{choiceLabel(value, keys)}</button>;
      })}
    </div>
  );
}

const inputClass = "min-h-11 w-full min-w-0 rounded-xl border border-primary/15 bg-white px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary/40 focus:ring-2 focus:ring-[#F97362]/30";
const labelClass = "mb-1.5 block text-xs font-extrabold text-primary";

export default function TutorProfilePricing() {
  const [application, setApplication] = useState<ApplicationData | null>(null);
  const [form, setForm] = useState<ProfileForm>(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    void marketplace("tutor_get_application", { browser_time_zone: browserTimeZone() })
      .then((result) => {
        const payload = payloadFrom(result);
        if (!active || !payload) return;
        setApplication(payload);
        setForm(formFromProfile(payload.profile));
      })
      .catch((reason) => {
        console.error("Tutor public profile settings could not be loaded", reason);
        if (active) setLoadFailed(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  const rateCents = parseHourlyRateCents(form.hourlyRate);
  const sessionPrices = useMemo(() => [60, 45, 30].map((minutes) => ({
    minutes,
    cents: rateCents === null ? null : minutes === 60 ? rateCents : proratedPriceCents(rateCents, minutes as 30 | 45),
  })), [rateCents]);
  const status = application?.status ?? "Draft";
  const approvedAndFresh = status === "Approved" && application?.approvedPublicProfileEditable === true;
  const saveSuccessKey = SAVE_SUCCESS_KEYS[approvedPublicProfileSaveState(application?.publicProfilePublished, application?.publicProfileRefreshPending)];

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!approvedAndFresh || saving) return;
    setSaved(false);
    setError(null);
    const cents = parseHourlyRateCents(form.hourlyRate);
    if (!form.headline.trim()) { setError("profilePricing.error.headline"); return; }
    if (!form.bio.trim()) { setError("profilePricing.error.bio"); return; }
    if (!form.spokenLanguages.length) { setError("profilePricing.error.languages"); return; }
    if (!form.teachingStyles.length) { setError("profilePricing.error.styles"); return; }
    if (cents === null) { setError("profilePricing.error.rate"); return; }
    if (form.introVideoUrl.trim() && (!videoLinkIsValid(form.introVideoUrl) || !form.introVideoUnlisted)) { setError("profilePricing.error.video"); return; }
    if (!meetingLinkIsValid(form.meetingLink)) { setError("profilePricing.error.meeting"); return; }

    setSaving(true);
    try {
      const response = await marketplace("tutor_save_approved_public_profile", {
        profile: {
          headline: form.headline.trim(),
          bio: form.bio.trim(),
          spoken_languages: form.spokenLanguages,
          teaching_styles: form.teachingStyles,
          hourly_rate_cents: cents,
          intro_video_url: form.introVideoUrl.trim(),
          intro_video_unlisted_confirmed: form.introVideoUrl.trim() ? form.introVideoUnlisted : false,
          meeting_link: form.meetingLink.trim(),
        },
      });
      const payload = payloadFrom(response);
      if (payload) {
        setApplication(payload);
        setForm(formFromProfile(payload.profile));
      }
      setSaved(true);
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "REQUEST_FAILED";
      console.error("Approved tutor public profile could not be saved", reason);
      setError(errorKey(code));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex min-h-[320px] items-center justify-center rounded-[1.7rem] border border-primary/10 bg-white p-8" role="status" aria-live="polite"><div className="text-center"><LoaderCircle aria-hidden="true" className="mx-auto h-8 w-8 animate-spin text-primary" /><p className="mt-4 text-sm font-semibold text-muted-foreground">{t("profilePricing.loading")}</p></div></div>;

  if (loadFailed || !application) return <section className="rounded-[1.7rem] border border-[#F0C5C0] bg-white p-6 sm:p-8" role="alert"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><CircleAlert aria-hidden="true" className="h-5 w-5" /></span><h2 className="mt-4 font-display text-xl font-extrabold text-primary">{t("profilePricing.loadErrorTitle")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("profilePricing.loadErrorBody")}</p><button type="button" onClick={() => setRefresh((value) => value + 1)} className="parle-button-primary mt-5 justify-center">{t("profilePricing.retry")}</button></section>;

  if (!approvedAndFresh) {
    const approvedButStale = status === "Approved" && !application.approvedPublicProfileEditable;
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-5">
        <section className="overflow-hidden rounded-[1.7rem] bg-primary px-5 py-6 text-white shadow-[0_24px_58px_-42px_rgba(30,58,138,0.7)] sm:px-7 sm:py-8">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#FFC0B4]">{t("profilePricing.eyebrow")}</p>
          <h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-0.04em] sm:text-3xl">{t("profilePricing.title")}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/85">{t("profilePricing.intro")}</p>
        </section>
        <section className="rounded-[1.5rem] border border-[#E9D7B2] bg-[#FFF9EC] p-5 sm:p-7">
          <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#805916]"><LockKeyhole aria-hidden="true" className="h-5 w-5" /></span><div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#805916]">{t("profilePricing.statusEyebrow")}</p><h3 className="mt-1 font-display text-xl font-extrabold text-primary">{t(approvedButStale ? "profilePricing.reviewRequiredTitle" : "profilePricing.applicationStatusTitle")}</h3><p className="mt-2 text-sm leading-6 text-foreground">{t(approvedButStale ? "profilePricing.reviewRequiredBody" : "profilePricing.statusBody").replace("{status}", t(STATUS_KEYS[status]))}</p>{application.latestComment && <div className="mt-4 rounded-xl border border-primary/10 bg-white p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#A13F36]">{t("profilePricing.adminComment")}</p><p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{application.latestComment}</p></div>}<Link to="/tutor/application" className="parle-button-primary mt-5 justify-center"><ArrowRight aria-hidden="true" className="h-4 w-4" />{t("profilePricing.openApplication")}</Link></div></div>
        </section>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }} className="min-w-0 space-y-5">
      <section className="relative overflow-hidden rounded-[1.7rem] bg-primary px-5 py-6 text-white shadow-[0_24px_58px_-42px_rgba(30,58,138,0.7)] sm:px-7 sm:py-8">
        <div aria-hidden="true" className="absolute -right-8 -top-12 h-48 w-48 rounded-full border-[20px] border-white/5" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#FFC0B4]">{t("profilePricing.eyebrow")}</p><h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-0.04em] sm:text-3xl">{t("profilePricing.title")}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/85">{t("profilePricing.intro")}</p></div>
          <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white sm:self-auto"><BadgeCheck aria-hidden="true" className="h-4 w-4 text-[#FFC0B4]" />{t("tutorApplication.status.approved")}</span>
        </div>
      </section>

      {saved && <p role="status" aria-live="polite" className="flex items-start gap-2 rounded-xl border border-[#B9D9CB] bg-[#F1F8F4] px-4 py-3 text-sm leading-5 text-[#236646]"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{t(saveSuccessKey)}</p>}
      {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-4 py-3 text-sm leading-5 text-[#8D342D]"><CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{t(error)}</p>}

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(275px,0.8fr)]">
        <form onSubmit={save} aria-busy={saving} className="min-w-0 space-y-5">
          <section className="min-w-0 rounded-[1.5rem] border border-primary/10 bg-white p-4 shadow-[0_20px_56px_-48px_rgba(30,58,138,0.45)] sm:p-6">
            <div className="mb-5"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#C64D43]">{t("profilePricing.publicContentEyebrow")}</p><h3 className="mt-1 font-display text-xl font-extrabold text-primary">{t("profilePricing.publicContentTitle")}</h3><p className="mt-1.5 text-sm leading-6 text-muted-foreground">{t("profilePricing.publicContentBody")}</p></div>
            <div className="space-y-5">
              <div><label htmlFor="approved-headline" className={labelClass}>{t("tutorApplication.headline")}</label><input id="approved-headline" value={form.headline} onChange={(event) => update("headline", event.target.value.slice(0, 140))} maxLength={140} required className={inputClass} placeholder={t("tutorApplication.headlinePlaceholder")} /><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{t("tutorApplication.headlineHelp")}</p></div>
              <div><label htmlFor="approved-bio" className={labelClass}>{t("tutorApplication.bio")}</label><textarea id="approved-bio" value={form.bio} onChange={(event) => update("bio", event.target.value.slice(0, 2000))} maxLength={2000} rows={6} required className={`${inputClass} resize-y leading-6`} placeholder={t("tutorApplication.bioPlaceholder")} /><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{t("tutorApplication.bioHelp")}</p></div>
              <div><p className={labelClass}>{t("tutorApplication.spokenLanguages")}</p><p className="mb-2 text-xs leading-5 text-muted-foreground">{t("tutorApplication.selectMultiple")}</p><ChoiceGroup options={TUTOR_LANGUAGES} selected={form.spokenLanguages} label={t("tutorApplication.spokenLanguages")} onToggle={(value) => update("spokenLanguages", form.spokenLanguages.includes(value) ? form.spokenLanguages.filter((item) => item !== value) : [...form.spokenLanguages, value])} /></div>
              <div><p className={labelClass}>{t("tutorApplication.styles")}</p><p className="mb-2 text-xs leading-5 text-muted-foreground">{t("tutorApplication.selectMultiple")}</p><ChoiceGroup options={TUTOR_STYLES} selected={form.teachingStyles} label={t("tutorApplication.styles")} onToggle={(value) => update("teachingStyles", form.teachingStyles.includes(value) ? form.teachingStyles.filter((item) => item !== value) : [...form.teachingStyles, value])} /></div>
              <div className="rounded-2xl border border-[#E9D7B2] bg-[#FFF9EC] p-4"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#805916]"><LockKeyhole aria-hidden="true" className="h-4 w-4" /></span><div><p className="text-sm font-extrabold text-primary">{t("profilePricing.lockedFieldsTitle")}</p><p className="mt-1 text-sm leading-6 text-foreground">{t("profilePricing.lockedFields")}</p></div></div></div>
            </div>
          </section>

          <section className="min-w-0 rounded-[1.5rem] border border-primary/10 bg-white p-4 shadow-[0_20px_56px_-48px_rgba(30,58,138,0.45)] sm:p-6">
            <div className="mb-5"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#236646]">{t("profilePricing.lessonSetupEyebrow")}</p><h3 className="mt-1 font-display text-xl font-extrabold text-primary">{t("profilePricing.lessonSetupTitle")}</h3></div>
            <div className="space-y-5">
              <div><label htmlFor="approved-hourly-rate" className={labelClass}>{t("tutorApplication.hourlyRate")}</label><div className="relative"><DollarSign aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input id="approved-hourly-rate" type="number" min="10" max="150" step="0.01" required value={form.hourlyRate} onChange={(event) => update("hourlyRate", event.target.value)} className={`${inputClass} pl-9`} inputMode="decimal" /></div><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{t("tutorApplication.rateHelp")}</p></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4"><div className="flex items-center gap-2"><Video aria-hidden="true" className="h-4 w-4 text-primary" /><h4 className="text-xs font-extrabold text-primary">{t("profilePricing.videoTitle")}</h4></div><label htmlFor="approved-video" className={`${labelClass} mt-4`}>{t("tutorApplication.videoLink")}</label><input id="approved-video" type="url" maxLength={500} value={form.introVideoUrl} onChange={(event) => update("introVideoUrl", event.target.value.slice(0, 500))} className={inputClass} placeholder={t("tutorApplication.videoPlaceholder")} /><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{t("tutorApplication.videoHelp")}</p>{form.introVideoUrl.trim() && <label htmlFor="approved-video-unlisted" className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-primary/10 bg-white p-3"><input id="approved-video-unlisted" type="checkbox" checked={form.introVideoUnlisted} onChange={(event) => update("introVideoUnlisted", event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary focus-visible:ring-2 focus-visible:ring-[#F97362]" /><span className="text-xs font-semibold leading-5 text-foreground">{t("tutorApplication.videoUnlistedConfirm")}</span></label>}</div>
                <div className="min-w-0 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4"><div className="flex items-center gap-2"><LockKeyhole aria-hidden="true" className="h-4 w-4 text-primary" /><h4 className="text-xs font-extrabold text-primary">{t("profilePricing.privateMeetingTitle")}</h4></div><label htmlFor="approved-meeting-link" className={`${labelClass} mt-4`}>{t("tutorApplication.meetingLink")}</label><input id="approved-meeting-link" type="url" maxLength={500} value={form.meetingLink} onChange={(event) => update("meetingLink", event.target.value.slice(0, 500))} required className={inputClass} placeholder={t("tutorApplication.meetingPlaceholder")} /><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{t("tutorApplication.meetingHelp")}</p><p className="mt-3 rounded-xl border border-[#C9D7EE] bg-white px-3 py-2.5 text-xs leading-5 text-primary">{t("tutorApplication.meetingPrivate")}</p></div>
              </div>
            </div>
          </section>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-xl text-xs leading-5 text-muted-foreground">{t("profilePricing.reviewedFieldsNote")}</p><button type="submit" disabled={saving} className="parle-button-primary min-h-12 w-full justify-center sm:w-auto">{saving ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="h-4 w-4" />}{t(saving ? "profilePricing.saving" : "profilePricing.save")}</button></div>
        </form>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-[1.5rem] border border-primary/10 bg-white p-4 shadow-[0_20px_56px_-48px_rgba(30,58,138,0.45)] sm:p-5 lg:sticky lg:top-24">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#C64D43]">{t("profilePricing.priceEyebrow")}</p><h3 className="mt-1 font-display text-xl font-extrabold text-primary">{t("profilePricing.priceTitle")}</h3></div><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EC] text-[#A13F36]"><DollarSign aria-hidden="true" className="h-5 w-5" /></span></div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("profilePricing.priceBody")}</p>
            <div className="mt-4 space-y-2">{sessionPrices.map(({ minutes, cents }) => <div key={minutes} className="flex items-center justify-between gap-3 rounded-xl bg-[#F7F8FB] px-3.5 py-3"><span className="text-xs font-bold text-foreground">{t(`tutorProfile.minutes${minutes}` as TranslationKey)}</span><span className="font-display text-base font-extrabold text-primary">{money(cents)}</span></div>)}</div>
            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{t("tutorApplication.priceEstimate")}</p>
            {application.publicProfilePublished ? <Link to="/tutor/profile-preview" className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-primary/15 bg-white px-4 text-xs font-extrabold text-primary transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t("profilePricing.openPreview")}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link> : <p className="mt-5 flex items-start gap-2 rounded-xl border border-[#E9D7B2] bg-[#FFF9EC] px-3.5 py-3 text-xs leading-5 text-[#805916]"><Clock3 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{t("profilePricing.publicationPending")}</p>}
            {application.publicProfilePublished && application.publicProfileRefreshPending && <p role="status" className="mt-3 flex items-start gap-2 rounded-xl border border-[#C9D7EE] bg-[#F7F8FB] px-3.5 py-3 text-xs leading-5 text-primary"><Clock3 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{t("profilePricing.publicRefreshPending")}</p>}
          </section>
          {application.latestComment && <section className="rounded-[1.4rem] border border-primary/10 bg-[#FAF9F5] p-4 sm:p-5"><div className="flex items-center gap-2"><LockKeyhole aria-hidden="true" className="h-4 w-4 text-primary" /><h3 className="text-xs font-extrabold text-primary">{t("profilePricing.adminComment")}</h3></div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{application.latestComment}</p></section>}
        </aside>
      </div>
    </motion.div>
  );
}
