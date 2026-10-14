import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  GraduationCap,
  LoaderCircle,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { parleMarketplaceService } from "@/functions";
import { t, type TranslationKey } from "@/lib/i18n";

type ParleRole = "learner" | "tutor";
type CompAction = "grant" | "remove";
type LearnerSkill = "listening" | "reading" | "writing" | "speaking";
type DetailText = string | "unavailable" | "not_recorded";
type DetailNumber = number | "unavailable" | "not_recorded";
type TutorApplicationStatus = "Draft" | "Submitted" | "In review" | "Approved" | "Needs changes" | "Rejected" | "Suspended" | "unavailable";
type AdminLearnerDetails = {
  goal: DetailText;
  track: DetailText;
  target_level: DetailText;
  target_date: DetailText;
  starting_level: DetailText;
  current_estimates: Record<LearnerSkill, DetailText>;
  weekly_study_time: DetailText;
  today_ai_messages_used: DetailNumber;
  today_ai_messages_limit: DetailNumber;
};
type AdminTutorDetails = {
  application_status: TutorApplicationStatus;
  hourly_rate_usd: DetailNumber;
  specialties: string[] | "unavailable" | "not_recorded";
  weekly_availability_hours: DetailNumber;
};
type AdminUser = {
  id: string;
  full_name: string;
  email: string;
  account_role: "administrator" | "user";
  created_at: string;
  parle_role: ParleRole;
  native_language: string;
  time_zone: string;
  comp_active: boolean;
  comp_reason: string;
  comp_updated_at: string;
  plan_status: "premium_complimentary" | "unavailable";
  latest_parle_record_at: string | "unavailable";
  learner_details: AdminLearnerDetails;
  tutor_details: AdminTutorDetails;
};

type DirectoryState = "loading" | "ready" | "error";
type RoleFilter = "all" | ParleRole;

const INPUT_CLASS = "mt-2 min-h-12 w-full rounded-xl border border-[#D8DEEA] bg-white px-3.5 text-sm font-semibold text-[#1E3A8A] outline-none transition placeholder:text-[#9BA5B8] focus:border-[#F97362] focus:ring-2 focus:ring-[#F97362]/25";
const REASON_LIMIT = 500;
const LEARNER_SKILL_LABELS: Record<LearnerSkill, TranslationKey> = {
  listening: "learner.skill.listening",
  reading: "learner.skill.reading",
  writing: "learner.skill.writing",
  speaking: "learner.skill.speaking",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unwrapResponse(value: unknown): Record<string, unknown> {
  let current: unknown = value;
  for (let index = 0; index < 6; index += 1) {
    if (!isObject(current)) break;
    if (isObject(current.result)) {
      current = current.result;
      continue;
    }
    if (isObject(current.data) && ("status" in current.data || "error" in current.data || "users" in current.data)) {
      current = current.data;
      continue;
    }
    break;
  }
  return isObject(current) ? current : {};
}

async function adminAction(action: string, values: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const response = unwrapResponse(await parleMarketplaceService({ action, ...values }));
  if (typeof response.error === "string" || response.status === "error") {
    throw new Error(typeof response.code === "string" ? response.code : typeof response.error === "string" ? response.error : "REQUEST_FAILED");
  }
  return response;
}

function adminTextValue(value: unknown): DetailText {
  if (value === "unavailable" || value === "not_recorded") return value;
  return typeof value === "string" && value.trim() ? value.trim() : "unavailable";
}

function adminNumberValue(value: unknown): DetailNumber {
  if (value === "unavailable" || value === "not_recorded") return value;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : "unavailable";
}

function adminCountValue(value: unknown): DetailNumber {
  if (value === "unavailable" || value === "not_recorded") return value;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : "unavailable";
}

function adminLearnerDetails(value: unknown): AdminLearnerDetails {
  const raw = isObject(value) ? value : {};
  const estimates = isObject(raw.current_estimates) ? raw.current_estimates : {};
  return {
    goal: adminTextValue(raw.goal),
    track: adminTextValue(raw.track),
    target_level: adminTextValue(raw.target_level),
    target_date: adminTextValue(raw.target_date),
    starting_level: adminTextValue(raw.starting_level),
    current_estimates: {
      listening: adminTextValue(estimates.listening),
      reading: adminTextValue(estimates.reading),
      writing: adminTextValue(estimates.writing),
      speaking: adminTextValue(estimates.speaking),
    },
    weekly_study_time: adminTextValue(raw.weekly_study_time),
    today_ai_messages_used: adminCountValue(raw.today_ai_messages_used),
    today_ai_messages_limit: adminCountValue(raw.today_ai_messages_limit),
  };
}

function adminTutorDetails(value: unknown): AdminTutorDetails {
  const raw = isObject(value) ? value : {};
  const statuses: TutorApplicationStatus[] = ["Draft", "Submitted", "In review", "Approved", "Needs changes", "Rejected", "Suspended"];
  const status = statuses.includes(raw.application_status as TutorApplicationStatus)
    ? raw.application_status as TutorApplicationStatus
    : "unavailable";
  const rawSpecialties = raw.specialties;
  const specialties = rawSpecialties === "unavailable" || rawSpecialties === "not_recorded"
    ? rawSpecialties
    : Array.isArray(rawSpecialties) && rawSpecialties.length === 0
      ? "not_recorded"
      : Array.isArray(rawSpecialties) && rawSpecialties.every((item) => typeof item === "string")
        ? rawSpecialties as string[]
        : "unavailable";
  return {
    application_status: status,
    hourly_rate_usd: hourlyRateValue(raw.hourly_rate_usd),
    specialties,
    weekly_availability_hours: positiveHoursValue(raw.weekly_availability_hours),
  };
}

function adminLatestDate(value: unknown): string | "unavailable" {
  if (typeof value !== "string" || value === "unavailable") return "unavailable";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "unavailable";
}

function adminUsersFrom(value: unknown): AdminUser[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> =>
    isObject(item)
      && typeof item.id === "string"
      && typeof item.email === "string"
      && (item.parle_role === "learner" || item.parle_role === "tutor"),
  ).map((item) => ({
    id: String(item.id),
    full_name: typeof item.full_name === "string" ? item.full_name : "",
    email: String(item.email),
    account_role: item.account_role === "administrator" ? "administrator" : "user",
    created_at: typeof item.created_at === "string" ? item.created_at : "",
    parle_role: item.parle_role as ParleRole,
    native_language: typeof item.native_language === "string" ? item.native_language : "",
    time_zone: typeof item.time_zone === "string" ? item.time_zone : "",
    comp_active: item.comp_active === true,
    comp_reason: typeof item.comp_reason === "string" ? item.comp_reason : "",
    comp_updated_at: typeof item.comp_updated_at === "string" ? item.comp_updated_at : "",
    plan_status: item.plan_status === "premium_complimentary" ? "premium_complimentary" : "unavailable",
    latest_parle_record_at: adminLatestDate(item.latest_parle_record_at),
    learner_details: adminLearnerDetails(item.learner_details),
    tutor_details: adminTutorDetails(item.tutor_details),
  }));
}

async function fetchAccounts(): Promise<{ users: AdminUser[]; limitReached: boolean; sourceLimit: number }> {
  const response = await adminAction("admin_list_users");
  if (!Array.isArray(response.users)) throw new Error("ADMIN_USERS_READ_FAILED");
  const sourceLimit = typeof response.source_limit === "number" && Number.isFinite(response.source_limit) && response.source_limit > 0
    ? response.source_limit
    : 500;
  return {
    users: adminUsersFrom(response.users),
    limitReached: response.limit_reached === true,
    sourceLimit,
  };
}

function loadErrorTranslation(error: unknown): TranslationKey {
  const code = error instanceof Error ? error.message : "";
  if (code === "ADMIN_REQUIRED" || code === "AUTH_REQUIRED") return "adminUsers.error.access";
  if (code === "USER_DIRECTORY_UNAVAILABLE") return "adminUsers.error.directoryUnavailable";
  return "adminUsers.error.loadBody";
}

function actionErrorTranslation(error: unknown): TranslationKey {
  const code = error instanceof Error ? error.message : "";
  if (code === "ADMIN_REQUIRED" || code === "AUTH_REQUIRED") return "adminUsers.error.access";
  if (code === "COMP_REASON_REQUIRED") return "adminUsers.error.reasonRequired";
  if (code === "COMP_REASON_TOO_LONG") return "adminUsers.error.reasonTooLong";
  if (code === "COMP_LEARNERS_ONLY") return "adminUsers.error.learnersOnly";
  if (code === "USER_NOT_FOUND" || code === "PARLE_ACCOUNT_NOT_FOUND") return "adminUsers.error.accountUnavailable";
  if (code === "COMP_ALREADY_ACTIVE" || code === "COMP_NOT_ACTIVE") return "adminUsers.error.statusChanged";
  if (code === "AUDIT_WRITE_FAILED") return "adminUsers.error.audit";
  if (code === "USER_DIRECTORY_UNAVAILABLE" || code === "ADMIN_USER_DATA_UNAVAILABLE") return "adminUsers.error.directoryUnavailable";
  return "adminUsers.error.action";
}

function dateLabel(value: string): string {
  if (!value) return t("adminUsers.notRecorded");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return t("adminUsers.notRecorded");
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function detailValue(value: DetailText | DetailNumber): string {
  if (value === "unavailable") return t("adminUsers.notAvailable");
  if (value === "not_recorded") return t("adminUsers.notRecorded");
  return String(value);
}

function detailDateLabel(value: DetailText): string {
  if (value === "unavailable" || value === "not_recorded") return detailValue(value);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return t("adminUsers.notAvailable");
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(parsed));
}

function latestParleDateLabel(value: AdminUser["latest_parle_record_at"]): string {
  return value === "unavailable" ? t("adminUsers.notAvailable") : dateLabel(value);
}

function tutorStatusLabel(value: TutorApplicationStatus): string {
  if (value === "unavailable") return t("adminUsers.notAvailable");
  switch (value) {
    case "Draft": return t("adminUsers.tutor.status.draft");
    case "Submitted": return t("adminUsers.tutor.status.submitted");
    case "In review": return t("adminUsers.tutor.status.inReview");
    case "Approved": return t("adminUsers.tutor.status.approved");
    case "Needs changes": return t("adminUsers.tutor.status.needsChanges");
    case "Rejected": return t("adminUsers.tutor.status.rejected");
    case "Suspended": return t("adminUsers.tutor.status.suspended");
  }
}

function specialtyTranslation(value: string): TranslationKey | null {
  switch (value) {
    case "canada_immigration_tef_tcf": return "tutorApplication.specialty.immigration";
    case "canadian_citizenship": return "tutorApplication.specialty.citizenship";
    case "conversation": return "tutorApplication.specialty.conversation";
    case "grammar": return "tutorApplication.specialty.grammar";
    case "business_french": return "tutorApplication.specialty.business";
    case "beginners": return "tutorApplication.specialty.beginner";
    default: return null;
  }
}

function specialtyLabels(value: AdminTutorDetails["specialties"]): string[] | null {
  if (value === "unavailable" || value === "not_recorded") return null;
  const keys = value.map(specialtyTranslation);
  return keys.every((key): key is TranslationKey => key !== null) ? keys.map((key) => t(key)) : null;
}

function formattedNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function hourlyRateValue(value: unknown): DetailNumber {
  const parsed = adminNumberValue(value);
  if (parsed === "unavailable" || parsed === "not_recorded") return parsed;
  if (parsed === 0) return "not_recorded";
  return parsed >= 10 && parsed <= 150 ? parsed : "unavailable";
}

function positiveHoursValue(value: unknown): DetailNumber {
  const parsed = adminNumberValue(value);
  if (parsed === "unavailable" || parsed === "not_recorded") return parsed;
  return parsed > 0 ? parsed : "unavailable";
}

function initials(user: AdminUser): string {
  const source = user.full_name.trim() || user.email;
  return source.slice(0, 1).toUpperCase() || "P";
}

function accountRoleText(role: AdminUser["account_role"]): string {
  return t(role === "administrator" ? "adminUsers.platformRole.administrator" : "adminUsers.platformRole.user");
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [directoryState, setDirectoryState] = useState<DirectoryState>("loading");
  const [directoryError, setDirectoryError] = useState<TranslationKey | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [sourceLimit, setSourceLimit] = useState(500);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [selectedId, setSelectedId] = useState("");
  const [reloadCount, setReloadCount] = useState(0);
  const [pendingAction, setPendingAction] = useState<CompAction | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<TranslationKey | null>(null);
  const [actionSuccess, setActionSuccess] = useState<TranslationKey | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<TranslationKey | null>(null);

  useEffect(() => {
    let active = true;
    setDirectoryState("loading");
    setDirectoryError(null);
    void fetchAccounts().then((result) => {
      if (!active) return;
      setUsers(result.users);
      setLimitReached(result.limitReached);
      setSourceLimit(result.sourceLimit);
      setDirectoryState("ready");
    }).catch((error) => {
      console.error("Parle administrator account directory could not be loaded", error);
      if (!active) return;
      setDirectoryError(loadErrorTranslation(error));
      setDirectoryState("error");
    });
    return () => { active = false; };
  }, [reloadCount]);

  const visibleUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return users.filter((user) => {
      const matchesRole = roleFilter === "all" || user.parle_role === roleFilter;
      const matchesSearch = !query
        || user.full_name.toLocaleLowerCase().includes(query)
        || user.email.toLocaleLowerCase().includes(query);
      return matchesRole && matchesSearch;
    }).sort((left, right) =>
      (left.full_name || left.email).localeCompare(right.full_name || right.email)
      || left.email.localeCompare(right.email),
    );
  }, [users, search, roleFilter]);

  const selectedUser = visibleUsers.find((user) => user.id === selectedId) ?? visibleUsers[0] ?? null;
  const trimmedReason = reason.trim();

  function chooseUser(user: AdminUser) {
    setSelectedId(user.id);
    setPendingAction(null);
    setReason("");
    setActionError(null);
    setActionSuccess(null);
    setRefreshWarning(null);
  }

  function beginAction(action: CompAction) {
    setPendingAction(action);
    setReason("");
    setActionError(null);
    setActionSuccess(null);
    setRefreshWarning(null);
  }

  async function submitCompAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser || !pendingAction || submitting) return;
    setActionError(null);
    setActionSuccess(null);
    if (!trimmedReason) {
      setActionError("adminUsers.error.reasonRequired");
      return;
    }
    if (trimmedReason.length > REASON_LIMIT) {
      setActionError("adminUsers.error.reasonTooLong");
      return;
    }

    setSubmitting(true);
    try {
      const response = await adminAction("admin_set_premium_comp", {
        target_user_id: selectedUser.id,
        comp_action: pendingAction,
        reason: trimmedReason,
      });
      const nextActive = pendingAction === "grant";
      const updatedAt = typeof response.comp_updated_at === "string" ? response.comp_updated_at : new Date().toISOString();
      const selectedIdAtSubmit = selectedUser.id;
      setUsers((current) => current.map((user) => user.id === selectedIdAtSubmit
        ? { ...user, comp_active: nextActive, comp_reason: trimmedReason, comp_updated_at: updatedAt }
        : user,
      ));
      setActionSuccess(pendingAction === "grant" ? "adminUsers.action.granted" : "adminUsers.action.removed");
      setPendingAction(null);
      setReason("");

      try {
        const refreshed = await fetchAccounts();
        setUsers(refreshed.users);
        setLimitReached(refreshed.limitReached);
        setSourceLimit(refreshed.sourceLimit);
        setRefreshWarning(null);
      } catch (error) {
        console.error("Parle administrator account status refresh failed after comp action", error);
        setRefreshWarning("adminUsers.refreshAfterAction");
      }
    } catch (error) {
      console.error("Parle administrator Premium-comp action could not be recorded", error);
      setActionError(actionErrorTranslation(error));
    } finally {
      setSubmitting(false);
    }
  }

  function retryDirectory() {
    setReloadCount((count) => count + 1);
    setRefreshWarning(null);
  }

  return (
    <div className="min-w-0 space-y-5">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
        className="relative isolate overflow-hidden rounded-[1.8rem] bg-[#1E3A8A] px-5 py-6 text-white shadow-[0_24px_64px_-38px_rgba(30,58,138,0.8)] sm:px-8 sm:py-8"
      >
        <div aria-hidden="true" className="absolute -right-12 -top-16 -z-10 h-56 w-56 rounded-full bg-[#F97362]/25 blur-3xl" />
        <div aria-hidden="true" className="absolute bottom-0 right-1/3 -z-10 h-28 w-28 rounded-full border border-white/10" />
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-[#FFD5CA]"><Users aria-hidden="true" className="h-6 w-6" /></span>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#FFD5CA]">{t("adminUsers.eyebrow")}</p>
            <h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-0.04em] sm:text-3xl">{t("adminUsers.title")}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80">{t("adminUsers.intro")}</p>
          </div>
        </div>
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-xs leading-5 text-white/85">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#FFD5CA]" />
          <p>{t("adminUsers.compBoundary")}</p>
        </div>
      </motion.section>

      {limitReached && (
        <p role="status" className="rounded-xl border border-[#E8D7A9] bg-[#FFF9E8] px-4 py-3 text-xs leading-5 text-[#705822]">
          {t("adminUsers.limitNotice", { limit: sourceLimit })}
        </p>
      )}
      {refreshWarning && (
        <div role="status" className="flex flex-col gap-3 rounded-xl border border-[#E8D7A9] bg-[#FFF9E8] px-4 py-3 text-sm leading-5 text-[#705822] sm:flex-row sm:items-center sm:justify-between">
          <p>{t(refreshWarning)}</p>
          <button type="button" onClick={retryDirectory} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-[#D9C788] bg-white px-4 text-xs font-extrabold transition hover:bg-[#FFFDF5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362]"><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />{t("adminUsers.refresh")}</button>
        </div>
      )}

      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <section aria-labelledby="admin-users-directory-heading" className="min-w-0 overflow-hidden rounded-[1.5rem] border border-[#E2E6EE] bg-white shadow-[0_16px_42px_-32px_rgba(30,58,138,0.4)]">
          <div className="border-b border-[#EEF0F4] p-4 sm:p-5">
            <div className="flex items-center gap-2 text-[#C64D43]"><Users aria-hidden="true" className="h-4 w-4" /><p className="text-[10px] font-extrabold uppercase tracking-[0.18em]">{t("adminUsers.directoryEyebrow")}</p></div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <h3 id="admin-users-directory-heading" className="font-display text-lg font-extrabold text-[#1E3A8A]">{t("adminUsers.directoryTitle")}</h3>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#D8DEEA] bg-[#F7F8FB] px-2.5 py-1 text-[10px] font-extrabold text-[#53617A]"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-[#1E3A8A]" />{t("adminUsers.readOnly")}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-[#65718A]">{t("adminUsers.directoryHelp")}</p>

            <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
              <label htmlFor="admin-users-search" className="min-w-0 text-xs font-bold text-[#53617A]">
                {t("adminUsers.searchLabel")}
                <span className="relative block">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8792A8]" />
                  <input id="admin-users-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("adminUsers.searchPlaceholder")} autoComplete="off" className={`${INPUT_CLASS} pl-10`} />
                </span>
              </label>
              <label htmlFor="admin-users-role" className="min-w-0 text-xs font-bold text-[#53617A]">
                {t("adminUsers.roleFilterLabel")}
                <select id="admin-users-role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)} className={`${INPUT_CLASS} appearance-none`}>
                  <option value="all">{t("adminUsers.roleFilter.all")}</option>
                  <option value="learner">{t("role.learner")}</option>
                  <option value="tutor">{t("role.tutor")}</option>
                </select>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <p className="text-xs font-extrabold text-[#1E3A8A]">{t("adminUsers.resultCount", { count: visibleUsers.length })}</p>
            {directoryState === "ready" && <button type="button" onClick={retryDirectory} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-[#53617A] transition hover:bg-[#F2F4F9] hover:text-[#1E3A8A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362]"><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />{t("adminUsers.refresh")}</button>}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {directoryState === "loading" && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status" className="flex min-h-56 items-center justify-center border-t border-[#EEF0F4] px-4 text-center text-sm font-semibold text-[#65718A]"><LoaderCircle aria-hidden="true" className="mr-2 h-5 w-5 animate-spin text-[#1E3A8A]" />{t("adminUsers.loading")}</motion.div>
            )}
            {directoryState === "error" && (
              <motion.div key="error" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="border-t border-[#EEF0F4] p-5">
                <p className="font-display text-base font-extrabold text-[#8D342D]">{t("adminUsers.error.loadTitle")}</p>
                <p className="mt-1 text-sm leading-6 text-[#8D342D]">{t(directoryError ?? "adminUsers.error.loadBody")}</p>
                <button type="button" onClick={retryDirectory} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-[#D99086] px-4 text-sm font-bold text-[#8D342D] transition hover:bg-[#FFF5F2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362]"><RefreshCw aria-hidden="true" className="h-4 w-4" />{t("adminUsers.tryAgain")}</button>
              </motion.div>
            )}
            {directoryState === "ready" && (
              <motion.div key="ready" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="border-t border-[#EEF0F4]">
                {visibleUsers.length ? (
                  <ul className="max-h-[620px] space-y-1 overflow-y-auto p-2 sm:p-3">
                    {visibleUsers.map((user, index) => {
                      const active = selectedUser?.id === user.id;
                      return (
                        <li key={user.id}>
                          <motion.button
                            type="button"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(index, 10) * 0.018, duration: 0.2 }}
                            onClick={() => chooseUser(user)}
                            aria-pressed={active}
                            aria-label={t("adminUsers.selectAccount", { name: user.full_name || user.email })}
                            className={`flex min-h-[76px] w-full min-w-0 items-center gap-3 rounded-2xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] ${active ? "border-[#BFCBE1] bg-[#F1F4FA] shadow-sm" : "border-transparent bg-white hover:border-[#E2E6EE] hover:bg-[#FAFBFD]"}`}
                          >
                            <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-display text-sm font-extrabold ${user.parle_role === "learner" ? "bg-[#FFF0EB] text-[#A84339]" : "bg-[#EAF1FF] text-[#1E3A8A]"}`}>{initials(user)}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-extrabold text-[#1E3A8A]">{user.full_name || t("adminUsers.nameUnavailable")}</span>
                              <span className="mt-0.5 block truncate text-xs font-medium text-[#65718A]">{user.email}</span>
                              <span className="mt-2 flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-[#53617A]"><GraduationCap aria-hidden="true" className="h-3 w-3" />{t(user.parle_role === "learner" ? "role.learner" : "role.tutor")}</span>
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-extrabold ${user.comp_active ? "bg-[#E9F5EE] text-[#236646]" : "bg-[#F3F4F7] text-[#65718A]"}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${user.comp_active ? "bg-[#3B8A62]" : "bg-[#AAB2C0]"}`} />{t(user.comp_active ? "adminUsers.comp.activeShort" : "adminUsers.comp.inactiveShort")}</span>
                              </span>
                            </span>
                          </motion.button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="px-5 py-10 text-center">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F4F6FA] text-[#1E3A8A]"><Search aria-hidden="true" className="h-5 w-5" /></span>
                    <h4 className="mt-4 font-display text-base font-extrabold text-[#1E3A8A]">{t(users.length ? "adminUsers.noResultsTitle" : "adminUsers.emptyTitle")}</h4>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#65718A]">{t(users.length ? "adminUsers.noResultsBody" : "adminUsers.emptyBody")}</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <section aria-labelledby="admin-users-details-heading" className="min-w-0">
          {selectedUser ? (
            <motion.article key={selectedUser.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }} className="min-w-0 overflow-hidden rounded-[1.5rem] border border-[#E2E6EE] bg-white shadow-[0_16px_42px_-32px_rgba(30,58,138,0.4)]">
              <div className="border-b border-[#EEF0F4] p-5 sm:p-6">
                <div className="flex min-w-0 items-start gap-3">
                  <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#1E3A8A] font-display text-lg font-extrabold text-white">{initials(selectedUser)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#C64D43]">{t("adminUsers.detailsEyebrow")}</p>
                    <h3 id="admin-users-details-heading" className="mt-1 break-words font-display text-xl font-extrabold tracking-[-0.035em] text-[#1E3A8A]">{selectedUser.full_name || t("adminUsers.nameUnavailable")}</h3>
                    <p className="mt-1 break-all text-sm text-[#65718A]">{selectedUser.email}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#D8DEEA] bg-[#F7F8FB] px-2.5 py-1 text-[10px] font-extrabold text-[#53617A]"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-[#1E3A8A]" />{t("adminUsers.readOnly")}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D8DEEA] bg-white px-3 py-1.5 text-[11px] font-extrabold text-[#53617A]"><GraduationCap aria-hidden="true" className="h-3.5 w-3.5 text-[#1E3A8A]" />{t(selectedUser.parle_role === "learner" ? "role.learner" : "role.tutor")}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D8DEEA] bg-white px-3 py-1.5 text-[11px] font-extrabold text-[#53617A]"><BadgeCheck aria-hidden="true" className="h-3.5 w-3.5 text-[#1E3A8A]" />{accountRoleText(selectedUser.account_role)}</span>
                </div>
              </div>

              <div className="p-5 sm:p-6">
                <h4 className="font-display text-base font-extrabold text-[#1E3A8A]">{t("adminUsers.accountDetails")}</h4>
                <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                  <div className="min-w-0 rounded-2xl border border-[#EEF0F4] bg-[#FAFBFD] p-3.5">
                    <dt className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]"><CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />{t("adminUsers.createdLabel")}</dt>
                    <dd className="mt-2 break-words text-sm font-bold leading-5 text-[#1E3A8A]">{dateLabel(selectedUser.created_at)}</dd>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-[#EEF0F4] bg-[#FAFBFD] p-3.5">
                    <dt className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]"><Mail aria-hidden="true" className="h-3.5 w-3.5" />{t("adminUsers.emailLabel")}</dt>
                    <dd className="mt-2 break-all text-sm font-bold leading-5 text-[#1E3A8A]">{selectedUser.email}</dd>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-[#EEF0F4] bg-[#FAFBFD] p-3.5">
                    <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]">{t("adminUsers.nativeLanguageLabel")}</dt>
                    <dd className="mt-2 break-words text-sm font-bold leading-5 text-[#1E3A8A]">{selectedUser.native_language || t("adminUsers.notProvided")}</dd>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-[#EEF0F4] bg-[#FAFBFD] p-3.5">
                    <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]">{t("adminUsers.timeZoneLabel")}</dt>
                    <dd className="mt-2 break-words text-sm font-bold leading-5 text-[#1E3A8A]">{selectedUser.time_zone || t("adminUsers.notProvided")}</dd>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-[#EEF0F4] bg-[#FAFBFD] p-3.5">
                    <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]">{t("adminUsers.planLabel")}</dt>
                    <dd className="mt-2 break-words text-sm font-bold leading-5 text-[#1E3A8A]">{t(selectedUser.plan_status === "premium_complimentary" ? "adminUsers.plan.premiumComplimentary" : "adminUsers.plan.unavailable")}</dd>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-[#EEF0F4] bg-[#FAFBFD] p-3.5">
                    <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]">{t("adminUsers.latestParleRecordLabel")}</dt>
                    <dd className="mt-2 break-words text-sm font-bold leading-5 text-[#1E3A8A]">{latestParleDateLabel(selectedUser.latest_parle_record_at)}</dd>
                  </div>
                </dl>

                {selectedUser.parle_role === "learner" && (
                  <section aria-labelledby="admin-users-learner-heading" className="mt-5 min-w-0 rounded-[1.35rem] border border-[#E2E6EE] bg-[#F6F8FC] p-4 sm:p-5">
                    <h4 id="admin-users-learner-heading" className="font-display text-base font-extrabold text-[#1E3A8A]">{t("adminUsers.learner.heading")}</h4>
                    <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                      <div className="min-w-0 rounded-xl border border-[#E7E9EF] bg-white p-3">
                        <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]">{t("adminUsers.learner.goal")}</dt>
                        <dd className="mt-1 break-words text-xs font-bold leading-5 text-[#53617A]">{detailValue(selectedUser.learner_details.goal)}</dd>
                      </div>
                      <div className="min-w-0 rounded-xl border border-[#E7E9EF] bg-white p-3">
                        <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]">{t("adminUsers.learner.track")}</dt>
                        <dd className="mt-1 break-words text-xs font-bold leading-5 text-[#53617A]">{detailValue(selectedUser.learner_details.track)}</dd>
                      </div>
                      <div className="min-w-0 rounded-xl border border-[#E7E9EF] bg-white p-3">
                        <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]">{t("adminUsers.learner.targetLevel")}</dt>
                        <dd className="mt-1 break-words text-xs font-bold leading-5 text-[#53617A]">{detailValue(selectedUser.learner_details.target_level)}</dd>
                      </div>
                      <div className="min-w-0 rounded-xl border border-[#E7E9EF] bg-white p-3">
                        <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]">{t("adminUsers.learner.targetDate")}</dt>
                        <dd className="mt-1 break-words text-xs font-bold leading-5 text-[#53617A]">{detailDateLabel(selectedUser.learner_details.target_date)}</dd>
                      </div>
                      <div className="min-w-0 rounded-xl border border-[#E7E9EF] bg-white p-3">
                        <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]">{t("adminUsers.learner.startingLevel")}</dt>
                        <dd className="mt-1 break-words text-xs font-bold leading-5 text-[#53617A]">{detailValue(selectedUser.learner_details.starting_level)}</dd>
                      </div>
                      <div className="min-w-0 rounded-xl border border-[#E7E9EF] bg-white p-3 sm:col-span-2">
                        <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]">{t("adminUsers.learner.currentEstimates")}</dt>
                        <dd className="mt-2">
                          <dl className="grid min-w-0 gap-2 sm:grid-cols-2">
                            {(["listening", "reading", "writing", "speaking"] as const).map((skill) => (
                              <div key={skill} className="min-w-0 rounded-lg bg-[#F7F8FB] px-3 py-2">
                                <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#78839A]">{t(LEARNER_SKILL_LABELS[skill])}</dt>
                                <dd className="mt-1 break-words text-xs font-bold leading-5 text-[#53617A]">{detailValue(selectedUser.learner_details.current_estimates[skill])}</dd>
                              </div>
                            ))}
                          </dl>
                        </dd>
                      </div>
                      <div className="min-w-0 rounded-xl border border-[#E7E9EF] bg-white p-3">
                        <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]">{t("adminUsers.learner.weeklyStudyTime")}</dt>
                        <dd className="mt-1 break-words text-xs font-bold leading-5 text-[#53617A]">{detailValue(selectedUser.learner_details.weekly_study_time)}</dd>
                      </div>
                      <div className="min-w-0 rounded-xl border border-[#E7E9EF] bg-white p-3">
                        <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]">{t("adminUsers.learner.messagesUsed")}</dt>
                        <dd className="mt-1 break-words text-xs font-bold leading-5 text-[#53617A]">{typeof selectedUser.learner_details.today_ai_messages_used === "number" ? formattedNumber(selectedUser.learner_details.today_ai_messages_used) : detailValue(selectedUser.learner_details.today_ai_messages_used)}</dd>
                      </div>
                      <div className="min-w-0 rounded-xl border border-[#E7E9EF] bg-white p-3 sm:col-span-2">
                        <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]">{t("adminUsers.learner.messagesLimit")}</dt>
                        <dd className="mt-1 break-words text-xs font-bold leading-5 text-[#53617A]">{typeof selectedUser.learner_details.today_ai_messages_limit === "number" ? formattedNumber(selectedUser.learner_details.today_ai_messages_limit) : detailValue(selectedUser.learner_details.today_ai_messages_limit)}</dd>
                      </div>
                    </dl>
                  </section>
                )}

                {selectedUser.parle_role === "tutor" && (
                  <section aria-labelledby="admin-users-tutor-heading" className="mt-5 min-w-0 rounded-[1.35rem] border border-[#E2E6EE] bg-[#F6F8FC] p-4 sm:p-5">
                    <h4 id="admin-users-tutor-heading" className="font-display text-base font-extrabold text-[#1E3A8A]">{t("adminUsers.tutor.heading")}</h4>
                    <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                      <div className="min-w-0 rounded-xl border border-[#E7E9EF] bg-white p-3">
                        <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]">{t("adminUsers.tutor.applicationStatus")}</dt>
                        <dd className="mt-1 break-words text-xs font-bold leading-5 text-[#53617A]">{tutorStatusLabel(selectedUser.tutor_details.application_status)}</dd>
                      </div>
                      <div className="min-w-0 rounded-xl border border-[#E7E9EF] bg-white p-3">
                        <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]">{t("adminUsers.tutor.hourlyRate")}</dt>
                        <dd className="mt-1 break-words text-xs font-bold leading-5 text-[#53617A]">{typeof selectedUser.tutor_details.hourly_rate_usd === "number" ? t("adminUsers.unit.usdPerHour", { amount: new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(selectedUser.tutor_details.hourly_rate_usd) }) : detailValue(selectedUser.tutor_details.hourly_rate_usd)}</dd>
                      </div>
                      <div className="min-w-0 rounded-xl border border-[#E7E9EF] bg-white p-3 sm:col-span-2">
                        <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]">{t("adminUsers.tutor.specialties")}</dt>
                        <dd className="mt-2 flex min-w-0 flex-wrap gap-1.5">
                          {specialtyLabels(selectedUser.tutor_details.specialties)?.length ? specialtyLabels(selectedUser.tutor_details.specialties)?.map((label) => (
                            <span key={label} className="max-w-full break-words rounded-full bg-[#F1F4FA] px-2.5 py-1 text-[11px] font-bold leading-4 text-[#53617A]">{label}</span>
                          )) : <span className="break-words text-xs font-bold leading-5 text-[#53617A]">{detailValue(selectedUser.tutor_details.specialties === "unavailable" || selectedUser.tutor_details.specialties === "not_recorded" ? selectedUser.tutor_details.specialties : "unavailable")}</span>}
                        </dd>
                      </div>
                      <div className="min-w-0 rounded-xl border border-[#E7E9EF] bg-white p-3 sm:col-span-2">
                        <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]">{t("adminUsers.tutor.weeklyAvailability")}</dt>
                        <dd className="mt-1 break-words text-xs font-bold leading-5 text-[#53617A]">{typeof selectedUser.tutor_details.weekly_availability_hours === "number" ? t("adminUsers.unit.hoursPerWeek", { value: formattedNumber(selectedUser.tutor_details.weekly_availability_hours) }) : detailValue(selectedUser.tutor_details.weekly_availability_hours)}</dd>
                      </div>
                    </dl>
                  </section>
                )}

                <section aria-labelledby="admin-users-comp-heading" className="mt-5 rounded-[1.35rem] border border-[#E2E6EE] bg-[#FAF9F5] p-4 sm:p-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selectedUser.comp_active ? "bg-[#E9F5EE] text-[#236646]" : "bg-white text-[#1E3A8A]"}`}><BadgeCheck aria-hidden="true" className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 id="admin-users-comp-heading" className="font-display text-base font-extrabold text-[#1E3A8A]">{t("adminUsers.comp.heading")}</h4>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${selectedUser.comp_active ? "bg-[#E9F5EE] text-[#236646]" : "bg-white text-[#65718A]"}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${selectedUser.comp_active ? "bg-[#3B8A62]" : "bg-[#AAB2C0]"}`} />{t(selectedUser.comp_active ? "adminUsers.comp.active" : "adminUsers.comp.inactive")}</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[#65718A]">{t("adminUsers.comp.help")}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
                    <div className="min-w-0 rounded-xl border border-[#E7E9EF] bg-white p-3">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]">{t("adminUsers.comp.updatedLabel")}</p>
                      <p className="mt-1 inline-flex items-start gap-1.5 break-words text-xs font-bold leading-5 text-[#53617A]">{selectedUser.comp_updated_at ? <Clock3 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : null}{dateLabel(selectedUser.comp_updated_at)}</p>
                    </div>
                    <div className="min-w-0 rounded-xl border border-[#E7E9EF] bg-white p-3">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#78839A]">{t("adminUsers.comp.reasonLabel")}</p>
                      <p className="mt-1 break-words text-xs font-bold leading-5 text-[#53617A]">{selectedUser.comp_reason || t("adminUsers.comp.noReason")}</p>
                    </div>
                  </div>

                  {selectedUser.parle_role === "learner" && !pendingAction && (
                    <button type="button" onClick={() => beginAction(selectedUser.comp_active ? "remove" : "grant")} className={`mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2 sm:w-auto ${selectedUser.comp_active ? "border border-[#D99086] bg-white text-[#8D342D] hover:bg-[#FFF5F2]" : "bg-[#1E3A8A] text-white shadow-[0_12px_24px_-16px_rgba(30,58,138,0.75)] hover:bg-[#162F73]"}`}>
                      {selectedUser.comp_active ? <X aria-hidden="true" className="h-4 w-4" /> : <BadgeCheck aria-hidden="true" className="h-4 w-4" />}
                      {t(selectedUser.comp_active ? "adminUsers.comp.removeAction" : "adminUsers.comp.grantAction")}
                    </button>
                  )}

                  {selectedUser.parle_role === "tutor" && <p className="mt-4 rounded-xl border border-[#E2E6EE] bg-white px-3.5 py-3 text-xs leading-5 text-[#65718A]">{t("adminUsers.comp.learnersOnly")}</p>}

                  <AnimatePresence initial={false}>
                    {pendingAction && selectedUser.parle_role === "learner" && (
                      <motion.form key="comp-confirmation" onSubmit={(event) => void submitCompAction(event)} initial={{ opacity: 0, height: 0, y: 6 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={{ opacity: 0, height: 0, y: 4 }} transition={{ duration: 0.22 }} className="mt-4 overflow-hidden rounded-2xl border border-[#D8DEEA] bg-white p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h5 className="font-display text-sm font-extrabold text-[#1E3A8A]">{t(pendingAction === "grant" ? "adminUsers.confirm.grantTitle" : "adminUsers.confirm.removeTitle")}</h5>
                            <p className="mt-1 text-xs leading-5 text-[#65718A]">{t("adminUsers.confirm.body")}</p>
                          </div>
                          <button type="button" onClick={() => { setPendingAction(null); setActionError(null); setReason(""); }} aria-label={t("adminUsers.cancel")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#65718A] transition hover:bg-[#F2F4F9] hover:text-[#1E3A8A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362]" disabled={submitting}><X aria-hidden="true" className="h-4 w-4" /></button>
                        </div>
                        <label htmlFor="admin-users-comp-reason" className="mt-4 block text-xs font-extrabold text-[#53617A]">
                          {t("adminUsers.confirm.reasonLabel")}
                          <textarea id="admin-users-comp-reason" required maxLength={REASON_LIMIT} rows={3} value={reason} onChange={(event) => { setReason(event.target.value); setActionError(null); }} placeholder={t("adminUsers.confirm.reasonPlaceholder")} className={`${INPUT_CLASS} min-h-[104px] resize-y py-3 leading-5`} aria-describedby="admin-users-comp-reason-help" />
                        </label>
                        <div id="admin-users-comp-reason-help" className="mt-2 flex flex-col gap-1 text-[11px] leading-5 text-[#78839A] sm:flex-row sm:items-center sm:justify-between">
                          <span>{t("adminUsers.confirm.reasonHelp")}</span>
                          <span className="shrink-0 font-bold tabular-nums">{reason.length}/{REASON_LIMIT}</span>
                        </div>
                        {actionError && <p role="alert" className="mt-3 rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-3 py-2 text-xs font-bold leading-5 text-[#8D342D]">{t(actionError)}</p>}
                        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                          <button type="button" onClick={() => { setPendingAction(null); setActionError(null); setReason(""); }} disabled={submitting} className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#C9D1E0] px-4 text-sm font-bold text-[#53617A] transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] disabled:cursor-not-allowed disabled:opacity-60">{t("adminUsers.cancel")}</button>
                          <button type="submit" disabled={submitting || !trimmedReason} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-extrabold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#AAB4C8] ${pendingAction === "grant" ? "bg-[#1E3A8A] hover:bg-[#162F73]" : "bg-[#8D342D] hover:bg-[#762A25]"}`}>
                            {submitting ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <CheckCircle2 aria-hidden="true" className="h-4 w-4" />}
                            {t(submitting ? "adminUsers.confirm.saving" : pendingAction === "grant" ? "adminUsers.confirm.grantButton" : "adminUsers.confirm.removeButton")}
                          </button>
                        </div>
                      </motion.form>
                    )}
                  </AnimatePresence>

                  <AnimatePresence initial={false}>
                    {actionSuccess && <motion.p key="success" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-[#B9D9CB] bg-[#F0F8F4] px-3.5 py-3 text-xs font-bold leading-5 text-[#236646]"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{t(actionSuccess)}</motion.p>}
                  </AnimatePresence>
                </section>
              </div>
            </motion.article>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-[#CBD3E1] bg-white px-5 py-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F1F4FA] text-[#1E3A8A]"><Users aria-hidden="true" className="h-6 w-6" /></span>
              <h3 className="mt-4 font-display text-lg font-extrabold text-[#1E3A8A]">{t("adminUsers.detailsEmptyTitle")}</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#65718A]">{t("adminUsers.detailsEmptyBody")}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
