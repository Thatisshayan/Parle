import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CircleAlert,
  Clock3,
  FileCheck2,
  FileText,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  WalletCards,
} from "lucide-react";
import { parleMarketplaceService } from "@/functions";
import { t, type TranslationKey } from "@/lib/i18n";
import { browserTimeZone } from "@/lib/parle-profile";

const steps = [
  "profile",
  "teaching",
  "pricing",
  "certificates",
  "video",
  "meeting",
  "agreement",
  "payouts",
] as const;

type StepName = (typeof steps)[number];
type ApplicationStatus = "Draft" | "Submitted" | "In review" | "Approved" | "Needs changes" | "Rejected" | "Suspended";
type CountryStatus = "supported" | "waitlist";
type AppProfile = Record<string, unknown> & { id?: string; photo_base64?: string; photo_mime_type?: string; draft_step?: number };
type DocumentMeta = Record<string, unknown> & { id?: string; label?: string; file_name?: string; mime_type?: string; size_bytes?: number; verified?: boolean };
type Country = { id?: string; country_name?: string; country_code?: string; status?: CountryStatus };
type ApplicationPayload = {
  profile: AppProfile;
  status: ApplicationStatus;
  commission_percent: number;
  review?: { latest_comment?: string; verified_document_ids?: string[] };
  documents: DocumentMeta[];
  countries: Country[];
  payout_status: CountryStatus;
};

type ApplicationForm = {
  displayName: string;
  headline: string;
  bio: string;
  country: string;
  timeZone: string;
  spokenLanguages: string[];
  yearsTeaching: string;
  specialties: string[];
  levelsTaught: string[];
  teachingStyles: string[];
  hourlyRate: string;
  introVideoUrl: string;
  introVideoUnlisted: boolean;
  meetingLink: string;
  agreementAccepted: boolean;
  photoBase64: string;
  photoMimeType: string;
};

const languageChoices: Array<{ value: string; key: TranslationKey }> = [
  { value: "English", key: "language.english" },
  { value: "French", key: "language.french" },
  { value: "Spanish", key: "language.spanish" },
  { value: "Portuguese", key: "language.portuguese" },
  { value: "Arabic", key: "language.arabic" },
  { value: "Persian", key: "language.persian" },
  { value: "Hindi", key: "language.hindi" },
  { value: "Punjabi", key: "language.punjabi" },
  { value: "Urdu", key: "language.urdu" },
  { value: "Tagalog", key: "language.tagalog" },
  { value: "Mandarin", key: "language.mandarin" },
  { value: "Vietnamese", key: "language.vietnamese" },
  { value: "Ukrainian", key: "language.ukrainian" },
  { value: "Russian", key: "language.russian" },
  { value: "Turkish", key: "language.turkish" },
  { value: "Other", key: "language.other" },
];

const specialtyChoices: Array<{ value: string; key: TranslationKey }> = [
  { value: "canada_immigration_tef_tcf", key: "tutorApplication.specialty.immigration" },
  { value: "canadian_citizenship", key: "tutorApplication.specialty.citizenship" },
  { value: "conversation", key: "tutorApplication.specialty.conversation" },
  { value: "grammar", key: "tutorApplication.specialty.grammar" },
  { value: "business_french", key: "tutorApplication.specialty.business" },
  { value: "beginners", key: "tutorApplication.specialty.beginner" },
];

const levelChoices: Array<{ value: string; key: TranslationKey }> = [
  { value: "A1", key: "tutorApplication.level.a1" },
  { value: "A2", key: "tutorApplication.level.a2" },
  { value: "B1", key: "tutorApplication.level.b1" },
  { value: "B2", key: "tutorApplication.level.b2" },
  { value: "C1", key: "tutorApplication.level.c1" },
];

const styleChoices: Array<{ value: string; key: TranslationKey }> = [
  { value: "patient", key: "tutorApplication.style.patient" },
  { value: "structured", key: "tutorApplication.style.structured" },
  { value: "conversation_led", key: "tutorApplication.style.conversationLed" },
  { value: "exam_focused", key: "tutorApplication.style.examFocused" },
  { value: "correction_focused", key: "tutorApplication.style.correctionFocused" },
  { value: "confidence_building", key: "tutorApplication.style.confidence" },
  { value: "practical_examples", key: "tutorApplication.style.practical" },
];

const initialForm: ApplicationForm = {
  displayName: "",
  headline: "",
  bio: "",
  country: "",
  timeZone: browserTimeZone(),
  spokenLanguages: [],
  yearsTeaching: "0",
  specialties: [],
  levelsTaught: [],
  teachingStyles: [],
  hourlyRate: "",
  introVideoUrl: "",
  introVideoUnlisted: false,
  meetingLink: "",
  agreementAccepted: false,
  photoBase64: "",
  photoMimeType: "",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unwrapResponse(value: unknown): Record<string, unknown> {
  let current: unknown = value;
  for (let index = 0; index < 5; index += 1) {
    if (!isObject(current)) break;
    if (isObject(current.result)) {
      current = current.result;
      continue;
    }
    if (isObject(current.data) && ("status" in current.data || "error" in current.data)) {
      current = current.data;
      continue;
    }
    break;
  }
  return isObject(current) ? current : {};
}

async function marketplace(action: string, values: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const response = unwrapResponse(await parleMarketplaceService({ action, ...values }));
  if (typeof response.error === "string" || response.status === "error") {
    throw new Error(typeof response.code === "string" ? response.code : typeof response.error === "string" ? response.error : "REQUEST_FAILED");
  }
  return response;
}

function errorCode(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (isObject(error) && typeof error.code === "string") return error.code;
  if (isObject(error) && typeof error.message === "string") return error.message;
  return "REQUEST_FAILED";
}

function profileForm(profile: AppProfile): ApplicationForm {
  const strings = (key: string) => Array.isArray(profile[key]) ? (profile[key] as unknown[]).filter((item): item is string => typeof item === "string") : [];
  const rate = Number(profile.hourly_rate_cents ?? 0);
  return {
    displayName: typeof profile.display_name === "string" ? profile.display_name : "",
    headline: typeof profile.headline === "string" ? profile.headline : "",
    bio: typeof profile.bio === "string" ? profile.bio : "",
    country: typeof profile.country === "string" ? profile.country : "",
    timeZone: typeof profile.time_zone === "string" ? profile.time_zone : browserTimeZone(),
    spokenLanguages: strings("spoken_languages"),
    yearsTeaching: String(Number.isInteger(profile.years_teaching) ? profile.years_teaching : 0),
    specialties: strings("specialties"),
    levelsTaught: strings("levels_taught"),
    teachingStyles: strings("teaching_styles"),
    hourlyRate: rate > 0 ? (rate / 100).toFixed(2).replace(/\.00$/, "") : "",
    introVideoUrl: typeof profile.intro_video_url === "string" ? profile.intro_video_url : "",
    introVideoUnlisted: profile.intro_video_unlisted_confirmed === true,
    meetingLink: typeof profile.meeting_link === "string" ? profile.meeting_link : "",
    agreementAccepted: profile.agreement_accepted === true,
    photoBase64: typeof profile.photo_base64 === "string" ? profile.photo_base64 : "",
    photoMimeType: typeof profile.photo_mime_type === "string" ? profile.photo_mime_type : "image/jpeg",
  };
}

function validTimeZone(value: string): boolean {
  try {
    if (!value.trim()) return false;
    new Intl.DateTimeFormat("en", { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

function validVideoLink(value: string): boolean {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.protocol === "https:" && ["youtube.com", "m.youtube.com", "youtu.be", "vimeo.com", "player.vimeo.com"].includes(host) && url.pathname.length > 1;
  } catch {
    return false;
  }
}

function validMeetingLink(value: string): boolean {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "meet.google.com" || host === "zoom.us" || host.endsWith(".zoom.us")) && url.pathname.length > 1;
  } catch {
    return false;
  }
}

function rateCents(value: string): number | null {
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 10 || amount > 150) return null;
  return Math.round(amount * 100);
}

function formatCad(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "CAD" }).format(cents / 100);
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

function messageKey(code: string): TranslationKey {
  const keys: Record<string, TranslationKey> = {
    PROFILE_INCOMPLETE: "tutorApplication.error.incomplete",
    PROFILE_INVALID: "tutorApplication.error.invalid",
    RATE_INVALID: "tutorApplication.error.rate",
    TIME_ZONE_INVALID: "tutorApplication.error.timeZone",
    YEARS_INVALID: "tutorApplication.error.years",
    LANGUAGES_INVALID: "tutorApplication.error.language",
    SPECIALTIES_INVALID: "tutorApplication.error.specialty",
    LEVELS_INVALID: "tutorApplication.error.level",
    STYLES_INVALID: "tutorApplication.error.style",
    PHOTO_SIZE: "tutorApplication.error.photoSize",
    PHOTO_INVALID: "tutorApplication.error.photoType",
    PHOTO_DIMENSIONS: "tutorApplication.error.photoType",
    VIDEO_INVALID: "tutorApplication.error.video",
    MEETING_LINK_INVALID: "tutorApplication.error.meeting",
    AGREEMENT_REQUIRED: "tutorApplication.error.agreement",
    DOCUMENT_LABEL_REQUIRED: "tutorApplication.error.documentLabel",
    FILE_SIZE: "tutorApplication.error.certificateSize",
    FILE_INVALID: "tutorApplication.error.certificateType",
    APPLICATION_LOCKED: "tutorApplication.error.locked",
    TUTOR_REQUIRED: "tutorApplication.error.access",
    SAVE_FAILED: "tutorApplication.error.save",
  };
  return keys[code] ?? "tutorApplication.error.generic";
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function signatureMatches(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  return false;
}

function imageBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PHOTO_PROCESSING")), "image/jpeg", quality);
  });
}

async function resizePrivatePhoto(file: File): Promise<{ base64: string; mimeType: string }> {
  if (file.type !== "image/jpeg" && file.type !== "image/png") throw new Error("PHOTO_TYPE");
  if (file.size > 10 * 1024 * 1024) throw new Error("PHOTO_SOURCE_SIZE");
  const sourceBytes = new Uint8Array(await file.arrayBuffer());
  if (!signatureMatches(sourceBytes, file.type)) throw new Error("PHOTO_SIGNATURE");
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const loaded = new Image();
      loaded.onload = () => resolve(loaded);
      loaded.onerror = () => reject(new Error("PHOTO_PROCESSING"));
      loaded.src = sourceUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("PHOTO_PROCESSING");
    const scale = Math.min(1, 320 / image.naturalWidth, 320 / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PHOTO_PROCESSING");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.8, 0.7, 0.58, 0.45]) {
      const blob = await imageBlob(canvas, quality);
      const base64 = encodeBase64(new Uint8Array(await blob.arrayBuffer()));
      if (base64.length <= 512 * 1024) return { base64, mimeType: "image/jpeg" };
    }
    throw new Error("PHOTO_SIZE");
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function multiToggle<T extends string>(current: T[], value: T): T[] {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

function ChipChoices({
  options,
  selected,
  onChange,
  disabled,
  label,
}: {
  options: Array<{ value: string; key: TranslationKey }>;
  selected: string[];
  onChange: (value: string) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`min-h-10 rounded-full border px-3.5 py-2 text-left text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] disabled:cursor-not-allowed disabled:opacity-60 ${active ? "border-primary bg-primary text-white shadow-sm" : "border-primary/15 bg-white text-primary hover:border-primary/40 hover:bg-[#F2F4F9]"}`}
          >
            {t(option.key)}
          </button>
        );
      })}
    </div>
  );
}

function ToggleField({
  id,
  checked,
  onChange,
  disabled,
  label,
  help,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
  label: string;
  help?: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4">
      <input id={id} type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362]" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="min-w-0 text-sm font-semibold leading-6 text-foreground">
        {label}
        {help && <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">{help}</span>}
      </span>
    </label>
  );
}

function inputClass(disabled: boolean): string {
  return `min-h-11 w-full min-w-0 rounded-xl border border-primary/15 bg-white px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary/40 focus:ring-2 focus:ring-[#F97362]/30 disabled:bg-[#F2F4F9] disabled:text-muted-foreground ${disabled ? "cursor-not-allowed" : ""}`;
}

export default function TutorApplication() {
  const photoInput = useRef<HTMLInputElement>(null);
  const certificateInput = useRef<HTMLInputElement>(null);
  const [application, setApplication] = useState<ApplicationPayload | null>(null);
  const [form, setForm] = useState<ApplicationForm>(initialForm);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedNotice, setSavedNotice] = useState<TranslationKey | null>(null);
  const [errorNotice, setErrorNotice] = useState<TranslationKey | null>(null);
  const [documentLabel, setDocumentLabel] = useState("");
  const [photoChanged, setPhotoChanged] = useState(false);
  const [photoRemoved, setPhotoRemoved] = useState(false);

  useEffect(() => {
    let active = true;
    void marketplace("tutor_get_application", { browser_time_zone: browserTimeZone() })
      .then((result) => {
        if (!active || !isObject(result.profile)) return;
        const profile = result.profile as AppProfile;
        const loadedStatus = (typeof result.status === "string" ? result.status : "Draft") as ApplicationStatus;
        const review = isObject(result.review) ? result.review : {};
        const payload: ApplicationPayload = {
          profile,
          status: loadedStatus,
          commission_percent: typeof result.commission_percent === "number" && Number.isFinite(result.commission_percent) ? result.commission_percent : 20,
          review: { latest_comment: typeof review.latest_comment === "string" ? review.latest_comment : "", verified_document_ids: Array.isArray(review.verified_document_ids) ? review.verified_document_ids.filter((id): id is string => typeof id === "string") : [] },
          documents: Array.isArray(result.documents) ? result.documents.filter(isObject) as DocumentMeta[] : [],
          countries: Array.isArray(result.countries) ? result.countries.filter(isObject) as Country[] : [],
          payout_status: result.payout_status === "supported" ? "supported" : "waitlist",
        };
        setApplication(payload);
        setForm(profileForm(profile));
        const savedStep = Number(profile.draft_step);
        setStep(Number.isInteger(savedStep) && savedStep >= 0 && savedStep < steps.length ? savedStep : 0);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Tutor application could not be loaded", error instanceof Error ? error.name : "unknown");
        if (active) {
          setLoadError(true);
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, []);

  const status = application?.status ?? "Draft";
  const editable = status === "Draft" || status === "Needs changes";
  const currentStep = steps[step];
  const rateInCents = rateCents(form.hourlyRate);
  const commissionPercent = typeof application?.commission_percent === "number" && Number.isFinite(application.commission_percent) ? application.commission_percent : 20;
  const tutorSharePercent = Math.round((100 - commissionPercent) * 100) / 100;
  const localPayoutStatus = useMemo<CountryStatus>(() => {
    const country = form.country.trim().toLocaleLowerCase();
    if (!country) return application?.payout_status ?? "waitlist";
    const matching = application?.countries.find((item) => item.country_name?.trim().toLocaleLowerCase() === country || item.country_code?.trim().toLocaleLowerCase() === country);
    return matching?.status === "supported" ? "supported" : "waitlist";
  }, [application?.countries, application?.payout_status, form.country]);

  function setField<K extends keyof ApplicationForm>(key: K, value: ApplicationForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSavedNotice(null);
    setErrorNotice(null);
  }

  function validationFor(index: number): TranslationKey | null {
    if (index === 0) {
      if (!form.displayName.trim()) return "tutorApplication.error.displayName";
      if (!form.headline.trim()) return "tutorApplication.error.headline";
      if (!form.bio.trim()) return "tutorApplication.error.bio";
      if (!form.country.trim()) return "tutorApplication.error.country";
      if (!validTimeZone(form.timeZone)) return "tutorApplication.error.timeZone";
      if (form.spokenLanguages.length === 0) return "tutorApplication.error.language";
      const years = Number(form.yearsTeaching);
      if (!Number.isInteger(years) || years < 0 || years > 60) return "tutorApplication.error.years";
    }
    if (index === 1) {
      if (!form.specialties.length) return "tutorApplication.error.specialty";
      if (!form.levelsTaught.length) return "tutorApplication.error.level";
      if (!form.teachingStyles.length) return "tutorApplication.error.style";
    }
    if (index === 2 && rateCents(form.hourlyRate) === null) return "tutorApplication.error.rate";
    if (index === 4 && form.introVideoUrl.trim() && (!validVideoLink(form.introVideoUrl) || !form.introVideoUnlisted)) return "tutorApplication.error.video";
    if (index === 5 && !validMeetingLink(form.meetingLink)) return "tutorApplication.error.meeting";
    if (index === 6 && !form.agreementAccepted) return "tutorApplication.error.agreement";
    return null;
  }

  function profilePatchFor(index: number): Record<string, unknown> {
    if (index === 0) {
      const patch: Record<string, unknown> = {
        display_name: form.displayName,
        headline: form.headline,
        bio: form.bio,
        country: form.country,
        time_zone: form.timeZone,
        spoken_languages: form.spokenLanguages,
        years_teaching: Number(form.yearsTeaching),
      };
      if (photoChanged) {
        patch.photo_base64 = form.photoBase64;
        patch.photo_mime_type = form.photoMimeType;
      }
      return patch;
    }
    if (index === 1) return { specialties: form.specialties, levels_taught: form.levelsTaught, teaching_styles: form.teachingStyles };
    if (index === 2) return { hourly_rate_usd: form.hourlyRate };
    if (index === 4) return { intro_video_url: form.introVideoUrl, intro_video_unlisted_confirmed: form.introVideoUnlisted };
    if (index === 5) return { meeting_link: form.meetingLink };
    if (index === 6) return { agreement_accepted: form.agreementAccepted };
    return {};
  }

  async function saveStep(targetStep = step, resumeStep = step, announce = true): Promise<boolean> {
    if (!editable || !application?.profile.id) return false;
    setSaving(true);
    setSavedNotice(null);
    setErrorNotice(null);
    try {
      const response = await marketplace("tutor_save_profile", {
        profile: profilePatchFor(targetStep),
        draft_step: resumeStep,
        remove_photo: targetStep === 0 && photoRemoved,
      });
      const savedProfile = isObject(response.profile) ? response.profile as AppProfile : { ...application.profile, ...profilePatchFor(targetStep), draft_step: resumeStep };
      setApplication((current) => current ? { ...current, profile: savedProfile, status: (typeof response.application_status === "string" ? response.application_status : current.status) as ApplicationStatus } : current);
      if (targetStep === 0) {
        setPhotoChanged(false);
        setPhotoRemoved(false);
      }
      if (announce) setSavedNotice("tutorApplication.saved");
      return true;
    } catch (error) {
      console.error("Tutor draft could not be saved", error instanceof Error ? error.name : "unknown");
      setErrorNotice(messageKey(errorCode(error)));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    await saveStep(step, step, true);
  }

  async function handleContinue() {
    const invalid = validationFor(step);
    if (invalid) {
      setErrorNotice(invalid);
      setSavedNotice(null);
      return;
    }
    const next = Math.min(step + 1, steps.length - 1);
    if (await saveStep(step, next, true)) setStep(next);
  }

  async function handleSubmit() {
    for (let index = 0; index <= 6; index += 1) {
      const invalid = validationFor(index);
      if (invalid) {
        setStep(index);
        setErrorNotice(invalid);
        setSavedNotice(null);
        return;
      }
    }
    if (!application?.profile.id) return;
    setSaving(true);
    setErrorNotice(null);
    setSavedNotice(null);
    try {
      await marketplace("tutor_save_profile", { profile: {}, draft_step: 7 });
      const response = await marketplace("tutor_submit");
      if (isObject(response.profile)) {
        const profile = response.profile as AppProfile;
        setApplication({
          profile,
          status: (typeof response.status === "string" ? response.status : "Submitted") as ApplicationStatus,
          commission_percent: application?.commission_percent ?? 20,
          review: application.review,
          documents: Array.isArray(response.documents) ? response.documents.filter(isObject) as DocumentMeta[] : application.documents,
          countries: Array.isArray(response.countries) ? response.countries.filter(isObject) as Country[] : application.countries,
          payout_status: response.payout_status === "supported" ? "supported" : "waitlist",
        });
        setForm(profileForm(profile));
      } else setApplication((current) => current ? { ...current, status: "Submitted" } : current);
      setStep(7);
      setSavedNotice("tutorApplication.submitSuccess");
    } catch (error) {
      console.error("Tutor application could not be submitted", error instanceof Error ? error.name : "unknown");
      setErrorNotice(messageKey(errorCode(error)));
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !editable) return;
    setErrorNotice(null);
    try {
      const photo = await resizePrivatePhoto(file);
      setForm((current) => ({ ...current, photoBase64: photo.base64, photoMimeType: photo.mimeType }));
      setPhotoChanged(true);
      setPhotoRemoved(false);
    } catch (error) {
      console.error("Private tutor photo could not be prepared", error instanceof Error ? error.name : "unknown");
      const code = errorCode(error);
      setErrorNotice(code === "PHOTO_SIZE" || code === "PHOTO_SOURCE_SIZE" ? "tutorApplication.error.photoSize" : "tutorApplication.error.photoType");
    }
  }

  async function handleCertificateChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !editable || !application?.profile.id) return;
    if (!documentLabel.trim()) {
      setErrorNotice("tutorApplication.error.documentLabel");
      return;
    }
    if (file.size > 512 * 1024) {
      setErrorNotice("tutorApplication.error.certificateSize");
      return;
    }
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      setErrorNotice("tutorApplication.error.certificateType");
      return;
    }
    setUploading(true);
    setErrorNotice(null);
    try {
      const contentBase64 = encodeBase64(new Uint8Array(await file.arrayBuffer()));
      const response = await marketplace("tutor_upload_document", {
        label: documentLabel.trim(),
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        content_base64: contentBase64,
      });
      if (!isObject(response.document)) throw new Error("SAVE_FAILED");
      setApplication((current) => current ? { ...current, documents: [response.document as DocumentMeta, ...current.documents] } : current);
      setDocumentLabel("");
      setSavedNotice("tutorApplication.documentSaved");
    } catch (error) {
      console.error("Private tutor certificate could not be saved", error instanceof Error ? error.name : "unknown");
      setErrorNotice(messageKey(errorCode(error)));
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteDocument(documentId: string) {
    if (!editable || !documentId) return;
    setErrorNotice(null);
    try {
      await marketplace("tutor_delete_document", { document_id: documentId });
      setApplication((current) => current ? { ...current, documents: current.documents.filter((document) => document.id !== documentId) } : current);
    } catch (error) {
      console.error("Tutor certificate could not be removed", error instanceof Error ? error.name : "unknown");
      setErrorNotice(messageKey(errorCode(error)));
    }
  }

  function toggleList(field: "spokenLanguages" | "specialties" | "levelsTaught" | "teachingStyles", value: string) {
    setForm((current) => ({ ...current, [field]: multiToggle(current[field] as string[], value) }));
    setErrorNotice(null);
    setSavedNotice(null);
  }

  async function selectStep(index: number) {
    if (index < 0 || index >= steps.length || index === step) return;
    if (editable && application?.profile.id && !(await saveStep(step, index, true))) return;
    setStep(index);
    setSavedNotice(null);
    setErrorNotice(null);
  }

  const titleKey = (name: StepName): TranslationKey => `tutorApplication.step.${name}` as TranslationKey;
  const stepTitle = t(titleKey(currentStep));
  const photoSrc = form.photoBase64 ? `data:${form.photoMimeType || "image/jpeg"};base64,${form.photoBase64}` : "";
  const profileError = errorNotice;

  if (loading) return <div className="rounded-[1.75rem] border border-primary/10 bg-white p-7 text-sm font-semibold text-muted-foreground">{t("tutorApplication.loading")}</div>;
  if (loadError || !application) {
    return (
      <section className="rounded-[1.75rem] border border-[#F3C9C3] bg-white p-6 sm:p-8">
        <div className="flex items-start gap-3 text-[#8D342D]"><CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" /><p className="text-sm leading-6">{t("tutorApplication.loadError")}</p></div>
        <button type="button" onClick={() => window.location.reload()} className="parle-button-primary mt-5 justify-center">{t("tutorApplication.retry")}</button>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[1.75rem] border border-primary/10 bg-white shadow-[0_20px_60px_-50px_rgba(30,58,138,0.35)]">
        <div className="bg-primary px-5 py-6 text-white sm:px-8 sm:py-8">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#FFC0B4]">{t("tutorApplication.eyebrow")}</p>
          <h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-0.04em] sm:text-3xl">{t("tutorApplication.title")}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80">{t("tutorApplication.intro")}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-semibold text-white/85">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5"><LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" />{t("tutorApplication.privateApplication")}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />{t("tutorApplication.savedAsDraft")}</span>
          </div>
        </div>

        <div className="p-4 sm:p-7">
          <div className="flex flex-col gap-3 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">{t("tutorApplication.statusLabel")}</p>
              <span className={`mt-2 inline-flex items-center rounded-full px-3 py-1.5 text-xs font-extrabold ${status === "Approved" ? "bg-[#E8F4EC] text-[#236646]" : status === "Needs changes" || status === "Rejected" || status === "Suspended" ? "bg-[#FFF0ED] text-[#8D342D]" : "bg-[#EEF2FA] text-primary"}`}>{t(statusKey(status))}</span>
              {application.review?.latest_comment && (
                <div className="mt-3 border-l-2 border-[#F97362] pl-3">
                  <p className="text-xs font-bold text-foreground">{t("tutorApplication.adminComment")}</p>
                  <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{application.review.latest_comment}</p>
                </div>
              )}
            </div>
            <p className="max-w-sm text-xs leading-5 text-muted-foreground">{t(editable ? "tutorApplication.editableNote" : "tutorApplication.lockedNote")}</p>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-8" role="navigation" aria-label={t("tutorApplication.stepNavigation")}>
            {steps.map((item, index) => (
              <button key={item} type="button" onClick={() => selectStep(index)} aria-current={step === index ? "step" : undefined} className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] ${step === index ? "border-primary bg-primary text-white" : index < step ? "border-primary/15 bg-[#EEF2FA] text-primary" : "border-primary/10 bg-white text-muted-foreground hover:border-primary/25"}`}>
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em]">{String(index + 1).padStart(2, "0")}</span>
                <span className="line-clamp-2 text-[10px] font-bold leading-3 sm:text-[11px]">{t(titleKey(item))}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#EEF2FA]" aria-label={t("tutorApplication.progressLabel").replace("{current}", String(step + 1)).replace("{total}", String(steps.length))}>
            <div className="h-full rounded-full bg-[#F97362] transition-[width] duration-500" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-bold text-muted-foreground"><span>{t("tutorApplication.progressLabel").replace("{current}", String(step + 1)).replace("{total}", String(steps.length))}</span><span className="max-w-[58%] truncate text-right text-primary">{stepTitle}</span></div>

          <AnimatePresence mode="wait">
            <motion.section key={currentStep} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }} className="mt-6 rounded-2xl border border-primary/10 bg-white p-4 sm:p-6">
              <div className="flex items-start gap-3 border-b border-primary/10 pb-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FA] text-primary">
                  {currentStep === "profile" ? <UserRound aria-hidden="true" className="h-5 w-5" /> : currentStep === "certificates" ? <FileCheck2 aria-hidden="true" className="h-5 w-5" /> : currentStep === "payouts" ? <WalletCards aria-hidden="true" className="h-5 w-5" /> : <BadgeCheck aria-hidden="true" className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <h3 className="font-display text-xl font-extrabold tracking-[-0.035em] text-primary">{stepTitle}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{t(`tutorApplication.help.${currentStep}` as TranslationKey)}</p>
                </div>
              </div>

              <div className="mt-5 space-y-5">
                {currentStep === "profile" && (
                  <>
                    <div className="flex flex-col gap-4 rounded-2xl bg-[#FAF9F5] p-4 sm:flex-row sm:items-center">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/15 bg-white text-primary">
                        {photoSrc ? <img src={photoSrc} alt={t("tutorApplication.photoAlt")} className="h-full w-full object-cover" /> : <UserRound aria-hidden="true" className="h-8 w-8" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-extrabold text-foreground">{t("tutorApplication.photoLabel")}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("tutorApplication.photoHelp")}</p>
                        <input ref={photoInput} type="file" accept="image/jpeg,image/png" className="sr-only" onChange={handlePhotoChange} aria-label={t("tutorApplication.photoLabel")} />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" disabled={!editable} onClick={() => photoInput.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/20 bg-white px-4 text-xs font-bold text-primary transition hover:bg-[#EEF2FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] disabled:cursor-not-allowed disabled:opacity-60"><ImagePlus aria-hidden="true" className="h-4 w-4" />{t("tutorApplication.choosePhoto")}</button>
                          {form.photoBase64 && editable && <button type="button" onClick={() => { setForm((current) => ({ ...current, photoBase64: "", photoMimeType: "" })); setPhotoRemoved(true); setPhotoChanged(false); }} className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-xs font-bold text-[#8D342D] hover:bg-[#FFF0ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362]"><Trash2 aria-hidden="true" className="h-4 w-4" />{t("tutorApplication.removePhoto")}</button>}
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2"><label htmlFor="tutor-display-name" className="text-sm font-bold text-foreground">{t("tutorApplication.displayName")}</label><input id="tutor-display-name" className={inputClass(!editable)} maxLength={80} value={form.displayName} disabled={!editable} onChange={(event) => setField("displayName", event.target.value)} placeholder={t("tutorApplication.displayNamePlaceholder")} /></div>
                      <div className="space-y-2"><label htmlFor="tutor-country" className="text-sm font-bold text-foreground">{t("tutorApplication.country")}</label><input id="tutor-country" list="tutor-country-options" className={inputClass(!editable)} maxLength={100} value={form.country} disabled={!editable} onChange={(event) => setField("country", event.target.value)} placeholder={t("tutorApplication.countryPlaceholder")} /><datalist id="tutor-country-options">{application.countries.map((country) => <option key={country.country_code} value={country.country_name} />)}</datalist></div>
                      <div className="space-y-2 sm:col-span-2"><label htmlFor="tutor-headline" className="text-sm font-bold text-foreground">{t("tutorApplication.headline")}</label><input id="tutor-headline" className={inputClass(!editable)} maxLength={140} value={form.headline} disabled={!editable} onChange={(event) => setField("headline", event.target.value)} placeholder={t("tutorApplication.headlinePlaceholder")} /><p className="text-xs leading-5 text-muted-foreground">{t("tutorApplication.headlineHelp")}</p></div>
                      <div className="space-y-2 sm:col-span-2"><label htmlFor="tutor-bio" className="text-sm font-bold text-foreground">{t("tutorApplication.bio")}</label><textarea id="tutor-bio" className={`${inputClass(!editable)} min-h-32 resize-y`} maxLength={2000} value={form.bio} disabled={!editable} onChange={(event) => setField("bio", event.target.value)} placeholder={t("tutorApplication.bioPlaceholder")} /><p className="text-xs leading-5 text-muted-foreground">{t("tutorApplication.bioHelp")}</p></div>
                      <div className="space-y-2"><label htmlFor="tutor-time-zone" className="text-sm font-bold text-foreground">{t("tutorApplication.timeZone")}</label><input id="tutor-time-zone" className={inputClass(!editable)} value={form.timeZone} disabled={!editable} onChange={(event) => setField("timeZone", event.target.value)} placeholder={t("tutorApplication.timeZonePlaceholder")} /><p className="text-xs leading-5 text-muted-foreground">{t("tutorApplication.timeZoneHelp")}</p></div>
                      <div className="space-y-2"><label htmlFor="tutor-years" className="text-sm font-bold text-foreground">{t("tutorApplication.yearsTeaching")}</label><input id="tutor-years" className={inputClass(!editable)} type="number" min={0} max={60} step={1} value={form.yearsTeaching} disabled={!editable} onChange={(event) => setField("yearsTeaching", event.target.value)} /></div>
                    </div>
                    <fieldset className="space-y-3"><legend className="text-sm font-bold text-foreground">{t("tutorApplication.spokenLanguages")}</legend><ChipChoices options={languageChoices} selected={form.spokenLanguages} onChange={(value) => toggleList("spokenLanguages", value)} disabled={!editable} label={t("tutorApplication.spokenLanguages")} /></fieldset>
                    {localPayoutStatus === "waitlist" && <p className="rounded-xl border border-[#F2D9A6] bg-[#FFF8E9] p-3 text-xs leading-5 text-[#6D531F]">{t("tutorApplication.payoutWaitlist")}</p>}
                  </>
                )}

                {currentStep === "teaching" && (
                  <>
                    <fieldset className="space-y-3"><legend className="text-sm font-bold text-foreground">{t("tutorApplication.specialties")}</legend><p className="text-xs leading-5 text-muted-foreground">{t("tutorApplication.selectMultiple")}</p><ChipChoices options={specialtyChoices} selected={form.specialties} onChange={(value) => toggleList("specialties", value)} disabled={!editable} label={t("tutorApplication.specialties")} /></fieldset>
                    <fieldset className="space-y-3 border-t border-primary/10 pt-5"><legend className="text-sm font-bold text-foreground">{t("tutorApplication.levels")}</legend><ChipChoices options={levelChoices} selected={form.levelsTaught} onChange={(value) => toggleList("levelsTaught", value)} disabled={!editable} label={t("tutorApplication.levels")} /></fieldset>
                    <fieldset className="space-y-3 border-t border-primary/10 pt-5"><legend className="text-sm font-bold text-foreground">{t("tutorApplication.styles")}</legend><ChipChoices options={styleChoices} selected={form.teachingStyles} onChange={(value) => toggleList("teachingStyles", value)} disabled={!editable} label={t("tutorApplication.styles")} /></fieldset>
                  </>
                )}

                {currentStep === "pricing" && (
                  <>
                    <div className="max-w-md space-y-2"><label htmlFor="tutor-rate" className="text-sm font-bold text-foreground">{t("tutorApplication.hourlyRate")}</label><div className="relative"><span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">$</span><input id="tutor-rate" className={`${inputClass(!editable)} pl-8`} type="number" min={10} max={150} step="0.01" inputMode="decimal" value={form.hourlyRate} disabled={!editable} onChange={(event) => setField("hourlyRate", event.target.value)} placeholder="35" /></div><p className="text-xs leading-5 text-muted-foreground">{t("tutorApplication.rateHelp")}</p></div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">{t("tutorApplication.price30Label")}</p><p className="mt-2 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{rateInCents === null ? "—" : formatCad(Math.round(rateInCents * 30 / 60))}</p><p className="mt-1 text-xs text-muted-foreground">{t("tutorApplication.priceEstimate")}</p></div>
                      <div className="rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">{t("tutorApplication.price45Label")}</p><p className="mt-2 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{rateInCents === null ? "—" : formatCad(Math.round(rateInCents * 45 / 60))}</p><p className="mt-1 text-xs text-muted-foreground">{t("tutorApplication.priceEstimate")}</p></div>
                    </div>
                    <p className="rounded-xl bg-[#EEF2FA] p-4 text-sm leading-6 text-muted-foreground">{t("tutorApplication.commissionPreview", { commission: commissionPercent })}</p>
                  </>
                )}

                {currentStep === "certificates" && (
                  <>
                    <div className="rounded-2xl border border-[#C9D7EE] bg-[#F5F8FD] p-4"><div className="flex items-start gap-3"><ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p className="text-sm leading-6 text-primary">{t("tutorApplication.certificatePrivacy")}</p></div></div>
                    <p className="text-sm leading-6 text-muted-foreground">{t("tutorApplication.certificateOptional")}</p>
                    <p className="rounded-xl border border-[#F3C9C3] bg-[#FFF5F2] p-3 text-xs leading-5 text-[#8D342D]">{t("tutorApplication.noGovernmentId")}</p>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><div className="space-y-2"><label htmlFor="certificate-label" className="text-sm font-bold text-foreground">{t("tutorApplication.certificateLabel")}</label><input id="certificate-label" className={inputClass(!editable)} maxLength={80} value={documentLabel} disabled={!editable} onChange={(event) => setDocumentLabel(event.target.value)} placeholder={t("tutorApplication.certificateLabelPlaceholder")} /></div><div><input ref={certificateInput} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" onChange={handleCertificateChange} aria-label={t("tutorApplication.chooseCertificate")} /><button type="button" disabled={!editable || uploading} onClick={() => certificateInput.current?.click()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-primary/20 px-4 py-2 text-sm font-bold text-primary transition hover:bg-[#EEF2FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">{uploading ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Upload aria-hidden="true" className="h-4 w-4" />}{t(uploading ? "tutorApplication.uploadingCertificate" : "tutorApplication.chooseCertificate")}</button></div></div>
                    <p className="text-xs leading-5 text-muted-foreground">{t("tutorApplication.certificateFileHelp")}</p>
                    <div className="space-y-2">
                      {application.documents.length === 0 ? <p className="rounded-xl border border-dashed border-primary/20 p-4 text-sm text-muted-foreground">{t("tutorApplication.noCertificates")}</p> : application.documents.map((document) => (
                        <article key={String(document.id)} className="flex min-w-0 items-start gap-3 rounded-xl border border-primary/10 bg-white p-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EEF2FA] text-primary"><FileText aria-hidden="true" className="h-4 w-4" /></span>
                          <div className="min-w-0 flex-1"><p className="break-words text-sm font-bold text-foreground">{String(document.label ?? "")}</p><p className="mt-1 break-all text-xs leading-5 text-muted-foreground">{String(document.file_name ?? "")}</p>{document.verified === true && <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#E8F4EC] px-2.5 py-1 text-[11px] font-extrabold text-[#236646]"><BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />{t("tutorApplication.certificateVerified")}</span>}{document.verified !== true && <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{t("tutorApplication.certificatePending")}</p>}</div>
                          {editable && typeof document.id === "string" && <button type="button" onClick={() => void handleDeleteDocument(document.id!)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#8D342D] transition hover:bg-[#FFF0ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362]" aria-label={t("tutorApplication.removeCertificate")}><Trash2 aria-hidden="true" className="h-4 w-4" /></button>}
                        </article>
                      ))}
                    </div>
                  </>
                )}

                {currentStep === "video" && (
                  <>
                    <div className="space-y-2"><label htmlFor="intro-video" className="text-sm font-bold text-foreground">{t("tutorApplication.videoLink")}</label><input id="intro-video" className={inputClass(!editable)} type="url" value={form.introVideoUrl} disabled={!editable} onChange={(event) => setField("introVideoUrl", event.target.value)} placeholder={t("tutorApplication.videoPlaceholder")} /><p className="text-xs leading-5 text-muted-foreground">{t("tutorApplication.videoHelp")}</p></div>
                    {form.introVideoUrl.trim() && <ToggleField id="video-unlisted" checked={form.introVideoUnlisted} onChange={(value) => setField("introVideoUnlisted", value)} disabled={!editable} label={t("tutorApplication.videoUnlistedConfirm")} help={t("tutorApplication.videoUnlistedHelp")} />}
                  </>
                )}

                {currentStep === "meeting" && (
                  <>
                    <div className="space-y-2"><label htmlFor="meeting-link" className="text-sm font-bold text-foreground">{t("tutorApplication.meetingLink")}</label><input id="meeting-link" className={inputClass(!editable)} type="url" value={form.meetingLink} disabled={!editable} onChange={(event) => setField("meetingLink", event.target.value)} placeholder={t("tutorApplication.meetingPlaceholder")} /><p className="text-xs leading-5 text-muted-foreground">{t("tutorApplication.meetingHelp")}</p></div>
                    <p className="rounded-xl border border-primary/10 bg-[#FAF9F5] p-4 text-sm leading-6 text-muted-foreground"><LockKeyhole aria-hidden="true" className="mr-2 inline h-4 w-4 align-[-3px] text-primary" />{t("tutorApplication.meetingPrivate")}</p>
                  </>
                )}

                {currentStep === "agreement" && (
                  <>
                    <div className="space-y-3 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4 sm:p-5">
                      <p className="text-sm font-extrabold text-primary">{t("tutorApplication.agreementCommissionTitle")}</p><p className="text-sm leading-6 text-muted-foreground">{t("tutorApplication.agreementCommission", { commission: commissionPercent, tutorShare: tutorSharePercent })}</p>
                      <p className="border-t border-primary/10 pt-3 text-sm font-extrabold text-primary">{t("tutorApplication.agreementCancellationTitle")}</p><p className="text-sm leading-6 text-muted-foreground">{t("tutorApplication.agreementCancellation")}</p>
                      <p className="border-t border-primary/10 pt-3 text-sm font-extrabold text-primary">{t("tutorApplication.agreementConductTitle")}</p><p className="text-sm leading-6 text-muted-foreground">{t("tutorApplication.agreementConduct")}</p>
                    </div>
                    <ToggleField id="tutor-agreement" checked={form.agreementAccepted} onChange={(value) => setField("agreementAccepted", value)} disabled={!editable} label={t("tutorApplication.agreementAccept")} />
                  </>
                )}

                {currentStep === "payouts" && (
                  <>
                    <div className="flex items-start gap-3 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4 sm:p-5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary"><WalletCards aria-hidden="true" className="h-5 w-5" /></span><div><h4 className="font-display text-base font-extrabold text-primary">{t("tutorApplication.payoutsTitle")}</h4><p className="mt-1 text-sm leading-6 text-muted-foreground">{t("tutorApplication.payoutsHelp")}</p></div></div>
                    <button type="button" disabled className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#DDE3ED] px-5 py-2.5 text-sm font-extrabold text-[#5D6A81] sm:w-auto"><WalletCards aria-hidden="true" className="h-4 w-4" />{t("tutorApplication.connectStripeComing")}</button>
                    <p className="rounded-xl border border-[#C9D7EE] bg-[#F5F8FD] p-4 text-sm leading-6 text-primary">{t("tutorApplication.stripeIdentityNote")}</p>
                    {localPayoutStatus === "waitlist" ? <p className="rounded-xl border border-[#F2D9A6] bg-[#FFF8E9] p-4 text-sm leading-6 text-[#6D531F]">{t("tutorApplication.payoutWaitlist")}</p> : <p className="rounded-xl border border-[#B9D9CB] bg-[#F1F8F4] p-4 text-sm leading-6 text-[#236646]">{t("tutorApplication.payoutSupported")}</p>}
                    {editable && <p className="text-sm leading-6 text-muted-foreground">{t("tutorApplication.submitReadyNote")}</p>}
                  </>
                )}
              </div>
            </motion.section>
          </AnimatePresence>

          {profileError && <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-[#F3C9C3] bg-[#FFF5F2] p-3 text-sm leading-6 text-[#8D342D]"><CircleAlert aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />{t(profileError)}</p>}
          {savedNotice && <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-[#B9D9CB] bg-[#F1F8F4] p-3 text-sm leading-6 text-[#236646]"><Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />{t(savedNotice)}</p>}

          <div className="mt-5 flex flex-col-reverse gap-3 border-t border-primary/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => selectStep(Math.max(0, step - 1))} disabled={step === 0} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-primary/20 px-5 py-2.5 text-sm font-bold text-primary transition hover:bg-[#EEF2FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] disabled:cursor-not-allowed disabled:opacity-40"><ArrowLeft aria-hidden="true" className="h-4 w-4" />{t("tutorApplication.previous")}</button>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {editable && <button type="button" disabled={saving || uploading} onClick={() => void handleSaveDraft()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-primary/20 px-5 py-2.5 text-sm font-bold text-primary transition hover:bg-[#EEF2FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] disabled:cursor-not-allowed disabled:opacity-60">{saving ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <FileText aria-hidden="true" className="h-4 w-4" />}{t(saving ? "tutorApplication.saving" : "tutorApplication.saveDraft")}</button>}
              {editable && step < steps.length - 1 && <button type="button" disabled={saving || uploading} onClick={() => void handleContinue()} className="parle-button-primary justify-center">{t("tutorApplication.continue")}<ArrowRight aria-hidden="true" className="h-4 w-4" /></button>}
              {editable && step === steps.length - 1 && <button type="button" disabled={saving || uploading} onClick={() => void handleSubmit()} className="parle-button-primary justify-center">{saving ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}{t(saving ? "tutorApplication.submitting" : status === "Needs changes" ? "tutorApplication.resubmit" : "tutorApplication.submit")}</button>}
            </div>
          </div>
        </div>
      </section>
      <p className="px-1 text-xs leading-5 text-muted-foreground">{t("tutorApplication.privacyFootnote")}</p>
    </div>
  );
}
