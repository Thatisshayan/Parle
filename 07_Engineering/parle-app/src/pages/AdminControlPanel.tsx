import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, CalendarDays, CheckCircle2, Clock3, History, LoaderCircle, RotateCcw, Save, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import { parleMarketplaceService } from "@/functions";
import { presentAdminAuditEntry, type AdminAuditCategory, type AdminAuditEntry } from "@/lib/admin-audit";
import { t, type TranslationKey } from "@/lib/i18n";

export const DEFAULT_SETTINGS = {
  free_ai_messages_per_day: 10,
  premium_fair_use_ai_messages_per_day: 300,
  premium_live_voice_minutes_per_month: 60,
  commission_percent: 20,
  payout_delay_hours: 72,
  cancellation_window_hours: 24,
  minimum_lesson_charge_usd: 8,
  founding_commission_percent: 10,
  min_notice_hours: 12,
  booking_horizon_days: 30,
  slot_hold_minutes: 30,
  auto_complete_hours: 48,
  tutor_cancellation_flag_count: 3,
  live_voice_enabled: false,
  premium_roadmap_triggers_enabled: false,
  free_voice_answers_per_day: 2,
  premium_voice_answers_per_day: 15,
  free_voice_messages_per_day: 5,
  premium_voice_messages_per_day: 60,
  free_voice_replies_per_day: 20,
  premium_voice_replies_per_day: 200,
} as const;

type SettingKey = keyof typeof DEFAULT_SETTINGS;
type SettingsState = { [Key in SettingKey]: number | boolean };
type DraftState = { [Key in SettingKey]: number | boolean | "" };
type NumericSettingKey = Exclude<SettingKey, "live_voice_enabled" | "premium_roadmap_triggers_enabled">;

export const NUMERIC_SETTINGS: Array<{
  key: NumericSettingKey;
  label: TranslationKey;
  help: TranslationKey;
  min: number;
  max: number;
  step: string;
  unit: TranslationKey;
}> = [
  { key: "free_ai_messages_per_day", label: "adminControl.setting.freeAi.label", help: "adminControl.setting.freeAi.help", min: 0, max: 100, step: "1", unit: "adminControl.unit.messagesPerDay" },
  { key: "premium_fair_use_ai_messages_per_day", label: "adminControl.setting.premiumAi.label", help: "adminControl.setting.premiumAi.help", min: 1, max: 5000, step: "1", unit: "adminControl.unit.messagesPerDay" },
  { key: "free_voice_answers_per_day", label: "adminControl.setting.freeVoiceAnswers.label", help: "adminControl.setting.freeVoiceAnswers.help", min: 0, max: 50, step: "1", unit: "adminControl.unit.answersPerDay" },
  { key: "premium_voice_answers_per_day", label: "adminControl.setting.premiumVoiceAnswers.label", help: "adminControl.setting.premiumVoiceAnswers.help", min: 1, max: 500, step: "1", unit: "adminControl.unit.answersPerDay" },
  { key: "free_voice_messages_per_day", label: "adminControl.setting.freeVoiceMessages.label", help: "adminControl.setting.freeVoiceMessages.help", min: 0, max: 200, step: "1", unit: "adminControl.unit.messagesPerDay" },
  { key: "premium_voice_messages_per_day", label: "adminControl.setting.premiumVoiceMessages.label", help: "adminControl.setting.premiumVoiceMessages.help", min: 1, max: 2000, step: "1", unit: "adminControl.unit.messagesPerDay" },
  { key: "free_voice_replies_per_day", label: "adminControl.setting.freeVoiceReplies.label", help: "adminControl.setting.freeVoiceReplies.help", min: 0, max: 500, step: "1", unit: "adminControl.unit.repliesPerDay" },
  { key: "premium_voice_replies_per_day", label: "adminControl.setting.premiumVoiceReplies.label", help: "adminControl.setting.premiumVoiceReplies.help", min: 1, max: 5000, step: "1", unit: "adminControl.unit.repliesPerDay" },
  { key: "premium_live_voice_minutes_per_month", label: "adminControl.setting.voiceMinutes.label", help: "adminControl.setting.voiceMinutes.help", min: 0, max: 600, step: "1", unit: "adminControl.unit.minutesPerMonth" },
  { key: "commission_percent", label: "adminControl.setting.commission.label", help: "adminControl.setting.commission.help", min: 0, max: 50, step: "0.01", unit: "adminControl.unit.percent" },
  { key: "payout_delay_hours", label: "adminControl.setting.payoutDelay.label", help: "adminControl.setting.payoutDelay.help", min: 0, max: 720, step: "1", unit: "adminControl.unit.hours" },
  { key: "cancellation_window_hours", label: "adminControl.setting.cancellation.label", help: "adminControl.setting.cancellation.help", min: 0, max: 168, step: "1", unit: "adminControl.unit.hours" },
  { key: "minimum_lesson_charge_usd", label: "adminControl.setting.minimumCharge.label", help: "adminControl.setting.minimumCharge.help", min: 8, max: 500, step: "0.01", unit: "adminControl.unit.usd" },
  { key: "founding_commission_percent", label: "adminControl.setting.foundingCommission.label", help: "adminControl.setting.foundingCommission.help", min: 0, max: 50, step: "0.01", unit: "adminControl.unit.percent" },
  { key: "min_notice_hours", label: "adminControl.setting.minNotice.label", help: "adminControl.setting.minNotice.help", min: 0, max: 48, step: "1", unit: "adminControl.unit.hours" },
  { key: "booking_horizon_days", label: "adminControl.setting.horizon.label", help: "adminControl.setting.horizon.help", min: 1, max: 30, step: "1", unit: "adminControl.unit.days" },
  { key: "slot_hold_minutes", label: "adminControl.setting.slotHold.label", help: "adminControl.setting.slotHold.help", min: 30, max: 120, step: "1", unit: "adminControl.unit.minutes" },
  { key: "auto_complete_hours", label: "adminControl.setting.autoComplete.label", help: "adminControl.setting.autoComplete.help", min: 24, max: 168, step: "1", unit: "adminControl.unit.hours" },
  { key: "tutor_cancellation_flag_count", label: "adminControl.setting.cancellationFlag.label", help: "adminControl.setting.cancellationFlag.help", min: 1, max: 20, step: "1", unit: "adminControl.unit.cancellations" },
];

const FEATURE_SETTINGS: Array<{ key: "live_voice_enabled" | "premium_roadmap_triggers_enabled"; label: TranslationKey; help: TranslationKey }> = [
  { key: "live_voice_enabled", label: "adminControl.setting.liveVoice.label", help: "adminControl.setting.liveVoice.help" },
  { key: "premium_roadmap_triggers_enabled", label: "adminControl.setting.roadmapTriggers.label", help: "adminControl.setting.roadmapTriggers.help" },
];

const inputClass = "mt-2 min-h-12 w-full rounded-xl border border-[#D8DEEA] bg-white px-3.5 text-base font-bold text-[#1E3A8A] outline-none transition placeholder:text-[#9BA5B8] focus:border-[#F97362] focus:ring-2 focus:ring-[#F97362]/25 disabled:bg-[#F4F5F8]";

type AuditFilters = { actionType: string; fromDate: string; toDate: string };
type AuditState = "loading" | "ready" | "error";
type AuditPayload = { entries: AdminAuditEntry[]; count: number; limit: number; sourceLimit: number; limitReached: boolean };

const EMPTY_AUDIT_FILTERS: AuditFilters = { actionType: "all", fromDate: "", toDate: "" };
const AUDIT_FILTER_OPTIONS: Array<{ value: string; label: TranslationKey }> = [
  { value: "all", label: "adminAudit.action.all" },
  { value: "settings", label: "adminAudit.action.settings" },
  { value: "tutor_decisions", label: "adminAudit.action.tutorDecisions" },
  { value: "certificate_verification", label: "adminAudit.action.certificateVerification" },
  { value: "premium_comp", label: "adminAudit.action.premiumComp" },
  { value: "other", label: "adminAudit.action.other" },
];
const AUDIT_CATEGORY_LABEL: Record<AdminAuditCategory, TranslationKey> = {
  settings: "adminAudit.category.settings",
  tutor_decisions: "adminAudit.category.tutorDecisions",
  certificate_verification: "adminAudit.category.certificateVerification",
  premium_comp: "adminAudit.category.premiumComp",
  other: "adminAudit.category.other",
};

function auditEntriesFrom(value: unknown): AdminAuditEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> =>
    isObject(item)
      && typeof item.action === "string"
      && typeof item.occurred_at_utc === "string"
      && Number.isFinite(Date.parse(item.occurred_at_utc)),
  ).map((entry, index) => ({
    id: typeof entry.id === "string" && entry.id ? entry.id : `audit-event-${index}`,
    actor_label: typeof entry.actor_label === "string" ? entry.actor_label : "",
    action: String(entry.action),
    target_type: typeof entry.target_type === "string" ? entry.target_type : "",
    target_id: typeof entry.target_id === "string" ? entry.target_id : "",
    old_value: typeof entry.old_value === "string" ? entry.old_value : JSON.stringify(entry.old_value ?? null),
    new_value: typeof entry.new_value === "string" ? entry.new_value : JSON.stringify(entry.new_value ?? null),
    occurred_at_utc: String(entry.occurred_at_utc),
    source: entry.source === "decision_history" ? "decision_history" : "admin_audit_log",
  }));
}

function auditErrorTranslation(error: unknown): TranslationKey {
  const code = error instanceof Error ? error.message : "";
  if (code === "ADMIN_REQUIRED" || code === "AUTH_REQUIRED") return "adminAudit.accessError";
  if (code === "AUDIT_FILTER_INVALID") return "adminAudit.filterError";
  return "adminAudit.loadErrorBody";
}

function auditTimeLabel(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date)
    : value;
}

function auditText(key: TranslationKey, values?: Record<string, string | number>): string {
  return t(key, values);
}

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
    if (isObject(current.data) && ("status" in current.data || "error" in current.data || "settings" in current.data)) {
      current = current.data;
      continue;
    }
    break;
  }
  return isObject(current) ? current : {};
}

async function adminAction(action: string, values: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const result = unwrapResponse(await parleMarketplaceService({ action, ...values }));
  if (typeof result.error === "string" || result.status === "error") {
    throw new Error(typeof result.code === "string" ? result.code : typeof result.error === "string" ? result.error : "REQUEST_FAILED");
  }
  return result;
}

function settingsFrom(value: unknown): SettingsState {
  if (!isObject(value)) return { ...DEFAULT_SETTINGS };
  const next: Record<string, number | boolean> = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
    const candidate = value[key];
    if (typeof DEFAULT_SETTINGS[key] === "boolean") {
      if (typeof candidate === "boolean") next[key] = candidate;
    } else if (typeof candidate === "number" && Number.isFinite(candidate)) {
      next[key] = candidate;
    }
  }
  return next as SettingsState;
}

function draftFrom(settings: SettingsState): DraftState {
  return { ...settings };
}

function valuesEqual(left: SettingsState, right: DraftState): boolean {
  return (Object.keys(DEFAULT_SETTINGS) as SettingKey[]).every((key) => left[key] === right[key]);
}

export function validateDraft(draft: DraftState): TranslationKey | null {
  for (const field of NUMERIC_SETTINGS) {
    const value = draft[field.key];
    const valid = typeof value === "number"
      && Number.isFinite(value)
      && value >= field.min
      && value <= field.max
      && (field.step === "1" ? Number.isInteger(value) : Math.abs(value - Math.round(value * 100) / 100) < 1e-8);
    if (!valid) return "adminControl.error.invalidValue";
  }
  const pairs: Array<[NumericSettingKey, NumericSettingKey]> = [
    ["free_ai_messages_per_day", "premium_fair_use_ai_messages_per_day"],
    ["free_voice_answers_per_day", "premium_voice_answers_per_day"],
    ["free_voice_messages_per_day", "premium_voice_messages_per_day"],
    ["free_voice_replies_per_day", "premium_voice_replies_per_day"],
  ];
  if (pairs.some(([free, premium]) => Number(draft[premium]) < Number(draft[free]))) return "adminControl.error.premiumBelowFree";
  if (typeof draft.live_voice_enabled !== "boolean" || typeof draft.premium_roadmap_triggers_enabled !== "boolean") return "adminControl.error.invalidValue";
  return null;
}

function errorTranslation(error: unknown): TranslationKey {
  const code = error instanceof Error ? error.message : "";
  if (code === "ADMIN_REQUIRED") return "adminControl.error.access";
  if (code === "SETTINGS_INVALID") return "adminControl.error.invalidValue";
  if (code === "AUDIT_WRITE_FAILED") return "adminControl.error.audit";
  return "adminControl.error.request";
}

function AdminAuditView() {
  const [filters, setFilters] = useState<AuditFilters>({ ...EMPTY_AUDIT_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState<AuditFilters>({ ...EMPTY_AUDIT_FILTERS });
  const [auditState, setAuditState] = useState<AuditState>("loading");
  const [auditPayload, setAuditPayload] = useState<AuditPayload | null>(null);
  const [auditError, setAuditError] = useState<TranslationKey | null>(null);
  const [filterError, setFilterError] = useState<TranslationKey | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let active = true;
    setAuditState("loading");
    setAuditError(null);
    void adminAction("admin_list_audit", {
      action_type: appliedFilters.actionType,
      from_date: appliedFilters.fromDate || undefined,
      to_date: appliedFilters.toDate || undefined,
    }).then((response) => {
      if (!active) return;
      const entries = auditEntriesFrom(response.entries);
      const safeNumber = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
      setAuditPayload({
        entries,
        count: typeof response.count === "number" && Number.isFinite(response.count) ? response.count : entries.length,
        limit: safeNumber(response.limit, 500),
        sourceLimit: Math.max(safeNumber(response.audit_source_limit, 500), safeNumber(response.history_source_limit, 500)),
        limitReached: response.limit_reached === true,
      });
      setAuditState("ready");
    }).catch((error) => {
      console.error("Parle administrator audit history could not be loaded", error instanceof Error ? error.name : "unknown");
      if (!active) return;
      setAuditError(auditErrorTranslation(error));
      setAuditState("error");
    });
    return () => { active = false; };
  }, [appliedFilters, reloadCount]);

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
      setFilterError("adminAudit.invalidDateRange");
      return;
    }
    setFilterError(null);
    setAppliedFilters({ ...filters });
  }

  function clearFilters() {
    setFilters({ ...EMPTY_AUDIT_FILTERS });
    setAppliedFilters({ ...EMPTY_AUDIT_FILTERS });
    setFilterError(null);
  }

  const isFiltered = appliedFilters.actionType !== "all" || Boolean(appliedFilters.fromDate) || Boolean(appliedFilters.toDate);

  return (
    <motion.section id="admin-control-audit" role="tabpanel" aria-labelledby="admin-control-tab-audit" tabIndex={0} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }} className="min-w-0 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[#C64D43]"><History aria-hidden="true" className="h-4 w-4" /><p className="text-[10px] font-extrabold uppercase tracking-[0.18em]">{t("adminAudit.eyebrow")}</p></div>
          <h3 className="mt-2 font-display text-2xl font-extrabold tracking-[-0.04em] text-[#1E3A8A]">{t("adminAudit.title")}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#65718A]">{t("adminAudit.intro")}</p>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-[#D8DEEA] bg-white px-3 py-1.5 text-[11px] font-extrabold text-[#53617A]"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-[#1E3A8A]" />{t("adminAudit.readOnlyBadge")}</span>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-[#D8DEEA] bg-white px-4 py-3 text-xs leading-5 text-[#53617A]">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#1E3A8A]" />
        <p>{t("adminAudit.readOnlyNote")} {t("adminAudit.latestFirst")}</p>
      </div>

      <form onSubmit={applyFilters} aria-label={t("adminAudit.filtersLabel")} className="space-y-4 rounded-[1.5rem] border border-[#E2E6EE] bg-[#FAF9F5] p-4 sm:p-5">
        <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#1E3A8A]"><CalendarDays aria-hidden="true" className="h-4 w-4" /></span><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#C64D43]">{t("adminAudit.filtersHeading")}</p><h4 className="font-display text-lg font-extrabold text-[#1E3A8A]">{t("adminAudit.filtersLabel")}</h4></div></div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-3">
          <label htmlFor="admin-audit-action" className="min-w-0 text-xs font-bold text-[#53617A]">
            {t("adminAudit.actionLabel")}
            <select id="admin-audit-action" value={filters.actionType} onChange={(event) => { setFilters((current) => ({ ...current, actionType: event.target.value })); setFilterError(null); }} className={`${inputClass} appearance-none text-sm`}>
              {AUDIT_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
            </select>
          </label>
          <label htmlFor="admin-audit-from" className="min-w-0 text-xs font-bold text-[#53617A]">
            {t("adminAudit.fromDateLabel")}
            <input id="admin-audit-from" type="date" value={filters.fromDate} onChange={(event) => { setFilters((current) => ({ ...current, fromDate: event.target.value })); setFilterError(null); }} className={`${inputClass} text-sm`} />
          </label>
          <label htmlFor="admin-audit-to" className="min-w-0 text-xs font-bold text-[#53617A]">
            {t("adminAudit.toDateLabel")}
            <input id="admin-audit-to" type="date" value={filters.toDate} onChange={(event) => { setFilters((current) => ({ ...current, toDate: event.target.value })); setFilterError(null); }} className={`${inputClass} text-sm`} />
          </label>
        </div>
        <p className="text-xs leading-5 text-[#65718A]">{t("adminAudit.dateFilterHint")}</p>
        {filterError && <p role="alert" className="rounded-lg border border-[#F0C5C0] bg-[#FFF5F2] px-3 py-2 text-sm font-semibold text-[#8D342D]">{t(filterError)}</p>}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={clearFilters} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#C9D1E0] bg-white px-5 text-sm font-bold text-[#53617A] transition hover:border-[#1E3A8A] hover:text-[#1E3A8A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2"><RotateCcw aria-hidden="true" className="h-4 w-4" />{t("adminAudit.clearFilters")}</button>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#1E3A8A] px-5 text-sm font-extrabold text-white shadow-[0_12px_24px_-16px_rgba(30,58,138,0.75)] transition hover:bg-[#162F73] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2"><SlidersHorizontal aria-hidden="true" className="h-4 w-4" />{t("adminAudit.applyFilters")}</button>
        </div>
      </form>

      <AnimatePresence mode="wait" initial={false}>
        {auditState === "loading" && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status" className="flex min-h-40 items-center justify-center rounded-2xl border border-[#E2E6EE] bg-white px-4 text-center text-sm font-semibold text-[#65718A]"><LoaderCircle aria-hidden="true" className="mr-2 h-5 w-5 shrink-0 animate-spin text-[#1E3A8A]" />{t("adminAudit.loading")}</motion.div>
        )}
        {auditState === "error" && (
          <motion.div key="error" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="rounded-2xl border border-[#F0C5C0] bg-[#FFF5F2] p-5 text-sm leading-6 text-[#8D342D]">
            <p className="font-extrabold">{t("adminAudit.loadErrorTitle")}</p><p className="mt-1">{t(auditError ?? "adminAudit.loadErrorBody")}</p>
            <button type="button" onClick={() => setReloadCount((count) => count + 1)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-[#D99086] px-4 font-bold transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2"><RotateCcw aria-hidden="true" className="h-4 w-4" />{t("adminAudit.retry")}</button>
          </motion.div>
        )}
        {auditState === "ready" && auditPayload && (
          <motion.div key="ready" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="min-w-0 space-y-4">
            {auditPayload.limitReached && <p role="status" className="rounded-xl border border-[#E8D7A9] bg-[#FFF9E8] px-4 py-3 text-xs leading-5 text-[#705822]">{t("adminAudit.limitNotice", { sourceLimit: auditPayload.sourceLimit, limit: auditPayload.limit })}</p>}
            {auditPayload.count === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-[#CBD3E1] bg-white px-5 py-9 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F4F6FA] text-[#1E3A8A]"><History aria-hidden="true" className="h-5 w-5" /></span>
                <h4 className="mt-4 font-display text-lg font-extrabold text-[#1E3A8A]">{t(isFiltered ? "adminAudit.noResultsTitle" : "adminAudit.emptyTitle")}</h4>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#65718A]">{t(isFiltered ? "adminAudit.noResultsBody" : "adminAudit.emptyBody")}</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E6EE] pb-3"><p className="text-sm font-extrabold text-[#1E3A8A]">{t("adminAudit.resultCount", { count: auditPayload.count })}</p><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#65718A]"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />{t("adminAudit.latestFirst")}</span></div>
                <div className="grid min-w-0 gap-3">
                  {auditPayload.entries.map((entry) => {
                    const presentation = presentAdminAuditEntry(entry);
                    const actor = entry.source === "decision_history"
                      ? t("adminAudit.actorLabel")
                      : entry.actor_label.trim() || t("adminAudit.actorUnknown");
                    const theme = presentation.category === "settings"
                      ? "border-[#D8DEEA] bg-[#F1F4FA] text-[#1E3A8A]"
                      : presentation.category === "tutor_decisions"
                        ? "border-[#F0D8CF] bg-[#FFF5F1] text-[#8D342D]"
                        : presentation.category === "certificate_verification"
                          ? "border-[#D6E8DD] bg-[#F0F8F4] text-[#236646]"
                          : presentation.category === "premium_comp"
                            ? "border-[#E8D7A9] bg-[#FFF9E8] text-[#705822]"
                            : "border-[#E2E6EE] bg-[#F7F8FA] text-[#53617A]";
                    return (
                      <motion.article key={entry.id} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} className="min-w-0 rounded-2xl border border-[#E2E6EE] bg-white p-4 shadow-[0_12px_32px_-28px_rgba(30,58,138,0.5)] sm:p-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${theme}`}>{t(AUDIT_CATEGORY_LABEL[presentation.category])}</span>
                          <span className="inline-flex max-w-full items-center rounded-full border border-[#E2E6EE] bg-white px-2.5 py-1 text-[10px] font-bold text-[#65718A]">{t(entry.source === "decision_history" ? "adminAudit.source.history" : "adminAudit.source.saved")}</span>
                        </div>
                        <div className="mt-3 min-w-0">
                          <h4 className="break-words font-display text-base font-extrabold leading-6 text-[#1E3A8A]">{auditText(presentation.title.key, presentation.title.values)}</h4>
                          <p className="mt-0.5 break-words text-sm font-semibold text-[#53617A]">{auditText(presentation.target.key, presentation.target.values)}</p>
                        </div>
                        <div className="mt-3 flex flex-col gap-1.5 border-t border-[#EEF0F4] pt-3 text-xs leading-5 text-[#65718A] sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
                          <span className="inline-flex min-w-0 items-start gap-1.5"><Clock3 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><span className="font-bold">{t("adminAudit.recordedAt")}: </span><time dateTime={entry.occurred_at_utc}>{auditTimeLabel(entry.occurred_at_utc)}</time></span></span>
                          <span className="min-w-0 break-words"><span className="font-bold">{t("adminAudit.actorLabel")}: </span>{actor}</span>
                        </div>
                        {presentation.showValues && (
                          <div className="mt-3 grid min-w-0 grid-cols-2 gap-2">
                            <div className="min-w-0 rounded-xl bg-[#F7F8FA] p-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#78839A]">{t("adminAudit.valueFrom")}</p><p className="mt-1 break-words text-sm font-bold leading-5 text-[#53617A]">{presentation.oldValue ? auditText(presentation.oldValue.key, presentation.oldValue.values) : t("adminAudit.valueNotRecorded")}</p></div>
                            <div className="min-w-0 rounded-xl bg-[#F1F4FA] p-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#53617A]">{t("adminAudit.valueTo")}</p><p className="mt-1 break-words text-sm font-extrabold leading-5 text-[#1E3A8A]">{presentation.newValue ? auditText(presentation.newValue.key, presentation.newValue.values) : t("adminAudit.valueNotRecorded")}</p></div>
                          </div>
                        )}
                        {!presentation.showValues && <p className="mt-3 rounded-xl bg-[#F7F8FA] px-3 py-2 text-xs leading-5 text-[#65718A]">{t("adminAudit.detailsUnavailable")}</p>}
                        {entry.source === "decision_history" && <p className="mt-3 rounded-xl border border-[#E8D7A9] bg-[#FFF9E8] px-3 py-2 text-xs leading-5 text-[#705822]">{t("adminAudit.actorHistoryNote")}</p>}
                      </motion.article>
                    );
                  })}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

export default function AdminControlPanel() {
  const [activeView, setActiveView] = useState<"settings" | "audit">("settings");
  const [settings, setSettings] = useState<SettingsState>({ ...DEFAULT_SETTINGS });
  const [draft, setDraft] = useState<DraftState>({ ...DEFAULT_SETTINGS });
  const [settingsState, setSettingsState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<TranslationKey | null>(null);
  const [settingsError, setSettingsError] = useState<TranslationKey | null>(null);

  useEffect(() => {
    let active = true;
    void adminAction("admin_get_settings")
      .then((response) => {
        if (!active) return;
        const loaded = settingsFrom(response.settings);
        setSettings(loaded);
        setDraft(draftFrom(loaded));
        setSettingsState("ready");
      })
      .catch((error) => {
        console.error("Parle administrator settings could not be loaded", error instanceof Error ? error.name : "unknown");
        if (active) {
          setSettingsError(errorTranslation(error));
          setSettingsState("error");
        }
      });
    return () => { active = false; };
  }, []);

  const draftError = useMemo(() => validateDraft(draft), [draft]);
  const dirty = settingsState === "ready" && !valuesEqual(settings, draft);

  async function saveSettings(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setSettingsMessage(null);
    setSettingsError(null);
    if (draftError) {
      setSettingsError(draftError);
      return;
    }
    if (!dirty) {
      setSettingsMessage("adminControl.settingsCurrent");
      return;
    }
    setSaving(true);
    try {
      const response = await adminAction("admin_save_settings", { settings: draft });
      const saved = settingsFrom(response.settings);
      setSettings(saved);
      setDraft(draftFrom(saved));
      setSettingsMessage("adminControl.settingsSaved");
    } catch (error) {
      console.error("Parle administrator settings could not be saved", error instanceof Error ? error.name : "unknown");
      setSettingsError(errorTranslation(error));
    } finally {
      setSaving(false);
    }
  }

  function changeNumber(key: NumericSettingKey, rawValue: string) {
    setDraft((current) => ({ ...current, [key]: rawValue === "" ? "" : Number(rawValue) }));
    setSettingsMessage(null);
    setSettingsError(null);
  }

  function toggleSetting(key: "live_voice_enabled" | "premium_roadmap_triggers_enabled") {
    setDraft((current) => ({ ...current, [key]: !current[key] }));
    setSettingsMessage(null);
    setSettingsError(null);
  }

  return (
    <div className="space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative isolate overflow-hidden rounded-[1.8rem] bg-[#1E3A8A] px-5 py-6 text-white shadow-[0_24px_64px_-38px_rgba(30,58,138,0.8)] sm:px-8 sm:py-8"
      >
        <div aria-hidden="true" className="absolute -right-12 -top-16 -z-10 h-56 w-56 rounded-full bg-[#F97362]/25 blur-3xl" />
        <div aria-hidden="true" className="absolute bottom-0 right-1/3 -z-10 h-28 w-28 rounded-full border border-white/10" />
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-[#FFD5CA]"><ShieldCheck aria-hidden="true" className="h-6 w-6" /></span>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#FFD5CA]">{t("adminControl.eyebrow")}</p>
            <h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-0.04em] sm:text-3xl">{t(activeView === "settings" ? "adminControl.title" : "adminControl.auditTitle")}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80">{t(activeView === "settings" ? "adminControl.intro" : "adminControl.auditIntro")}</p>
          </div>
        </div>
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-xs leading-5 text-white/80">
          <Sparkles aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#FFD5CA]" />
          <p>{t("adminControl.demoNote")}</p>
        </div>
      </motion.section>

      <nav role="tablist" aria-label={t("adminControl.navigationLabel")} className="flex w-full gap-2 rounded-2xl border border-[#E2E6EE] bg-[#F1F3F8] p-1.5 sm:w-fit">
        <button id="admin-control-tab-settings" type="button" role="tab" aria-selected={activeView === "settings"} aria-controls="admin-control-settings" onClick={() => setActiveView("settings")} className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2 sm:flex-none ${activeView === "settings" ? "bg-white text-[#1E3A8A] shadow-sm" : "text-[#65718A] hover:bg-white/70 hover:text-[#1E3A8A]"}`}><SlidersHorizontal aria-hidden="true" className="h-4 w-4" />{t("adminControl.tab.settings")}</button>
        <button id="admin-control-tab-audit" type="button" role="tab" aria-selected={activeView === "audit"} aria-controls="admin-control-audit" onClick={() => setActiveView("audit")} className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2 sm:flex-none ${activeView === "audit" ? "bg-white text-[#1E3A8A] shadow-sm" : "text-[#65718A] hover:bg-white/70 hover:text-[#1E3A8A]"}`}><History aria-hidden="true" className="h-4 w-4" />{t("adminControl.tab.audit")}</button>
      </nav>

      {activeView === "settings" ? (
      <motion.section
        id="admin-control-settings"
        role="tabpanel"
        aria-labelledby="admin-control-tab-settings"
        tabIndex={0}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.3 }}
        className="space-y-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#C64D43]"><Activity aria-hidden="true" className="h-4 w-4" /><p className="text-[10px] font-extrabold uppercase tracking-[0.18em]">{t("adminControl.settingsEyebrow")}</p></div>
            <h3 className="mt-2 font-display text-2xl font-extrabold tracking-[-0.04em] text-[#1E3A8A]">{t("adminControl.settingsHeading")}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#65718A]">{t("adminControl.settingsBody")}</p>
          </div>
          {settingsState === "ready" && <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#D6E8DD] bg-[#F0F8F4] px-3 py-1.5 text-[11px] font-extrabold text-[#236646]"><CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />{t("adminControl.settingsLoaded")}</span>}
        </div>

        {settingsState === "loading" && <div role="status" className="flex min-h-40 items-center justify-center rounded-2xl border border-[#E2E6EE] bg-white text-sm font-semibold text-[#65718A]"><LoaderCircle aria-hidden="true" className="mr-2 h-5 w-5 animate-spin text-[#1E3A8A]" />{t("adminControl.loadingSettings")}</div>}
        {settingsState === "error" && <div role="alert" className="rounded-2xl border border-[#F0C5C0] bg-[#FFF5F2] p-5 text-sm leading-6 text-[#8D342D]"><p className="font-extrabold">{t("adminControl.settingsLoadErrorTitle")}</p><p className="mt-1">{t(settingsError ?? "adminControl.error.request")}</p></div>}

        {settingsState === "ready" && (
          <form onSubmit={(event) => void saveSettings(event)} className="space-y-5">
            <section className="grid gap-3 sm:grid-cols-2">
              {NUMERIC_SETTINGS.map((field, index) => {
                const value = draft[field.key];
                return (
                  <motion.label key={field.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.025, duration: 0.22 }} htmlFor={`setting-${field.key}`} className="min-w-0 rounded-2xl border border-[#E2E6EE] bg-white p-4 shadow-[0_12px_32px_-28px_rgba(30,58,138,0.5)] sm:p-5">
                    <span className="flex items-start justify-between gap-3"><span className="min-w-0 text-sm font-extrabold leading-5 text-[#1E3A8A]">{t(field.label)}</span><span className="shrink-0 rounded-full bg-[#F4F6FA] px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#65718A]">{t(field.unit)}</span></span>
                    <span className="mt-2 block min-h-10 text-xs leading-5 text-[#65718A]">{t(field.help)}</span>
                    <span className="relative block"><input id={`setting-${field.key}`} type="number" min={field.min} max={field.max} step={field.step} inputMode={field.step === "1" ? "numeric" : "decimal"} value={typeof value === "number" || typeof value === "string" ? value : ""} onChange={(event) => changeNumber(field.key, event.target.value)} aria-describedby={`help-${field.key}`} className={inputClass} /><span id={`help-${field.key}`} className="sr-only">{t(field.help)}</span></span>
                    <span className="mt-2 flex items-center justify-between gap-2 text-[10px] font-semibold text-[#8993A6]"><span>{t("adminControl.rangeLabel")}</span><span className="text-right">{t("adminControl.rangeValue", { min: field.min, max: field.max, unit: t(field.unit) })}</span></span>
                  </motion.label>
                );
              })}
            </section>

            <section className="rounded-[1.5rem] border border-[#E2E6EE] bg-[#FAF9F5] p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#1E3A8A]"><Sparkles aria-hidden="true" className="h-4 w-4" /></span><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#C64D43]">{t("adminControl.flagsEyebrow")}</p><h4 className="font-display text-lg font-extrabold text-[#1E3A8A]">{t("adminControl.flagsHeading")}</h4></div></div>
              <div className="grid gap-3 sm:grid-cols-2">
                {FEATURE_SETTINGS.map((field) => {
                  const checked = draft[field.key] === true;
                  return (
                    <div key={field.key} className="flex min-w-0 items-start justify-between gap-4 rounded-2xl border border-[#E2E6EE] bg-white p-4">
                      <div className="min-w-0"><p className="text-sm font-extrabold leading-5 text-[#1E3A8A]">{t(field.label)}</p><p className="mt-1 text-xs leading-5 text-[#65718A]">{t(field.help)}</p></div>
                      <button type="button" role="switch" aria-checked={checked} aria-label={t(field.label)} onClick={() => toggleSetting(field.key)} className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2 ${checked ? "border-[#1E3A8A] bg-[#1E3A8A]" : "border-[#C9D1E0] bg-[#E8EBF2]"}`}>
                        <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="flex flex-col gap-3 rounded-2xl border border-[#E2E6EE] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex min-w-0 items-start gap-2 text-xs leading-5 text-[#65718A]"><ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#1E3A8A]" /><p>{t("adminControl.auditSaveNote")}</p></div>
              <button type="submit" disabled={saving || settingsState !== "ready" || (!dirty && !draftError)} className="inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-[#1E3A8A] px-6 text-sm font-extrabold text-white shadow-[0_12px_24px_-16px_rgba(30,58,138,0.75)] transition hover:bg-[#162F73] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#AAB4C8] sm:w-auto">
                {saving ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="h-4 w-4" />}{t(saving ? "adminControl.saving" : "adminControl.saveSettings")}
              </button>
            </div>
            <AnimatePresence initial={false}>
              {settingsMessage && <motion.p key="success" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} role="status" className="rounded-xl border border-[#B9D9CB] bg-[#F0F8F4] px-4 py-3 text-sm font-bold text-[#236646]">{t(settingsMessage)}</motion.p>}
              {settingsError && <motion.p key="error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} role="alert" className="rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-4 py-3 text-sm font-bold text-[#8D342D]">{t(settingsError)}</motion.p>}
            </AnimatePresence>
          </form>
        )}
      </motion.section>
      ) : (
        <AdminAuditView />
      )}
    </div>
  );
}
