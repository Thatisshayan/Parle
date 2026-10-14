import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  Activity,
  BadgeCheck,
  Bot,
  CalendarCheck,
  CalendarDays,
  CircleAlert,
  ClipboardCheck,
  Crown,
  FileText,
  Globe2,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { parleMarketplaceService } from "@/functions";
import { t, type TranslationKey } from "@/lib/i18n";
import {
  adminMetricsCalendarRangeIsValid,
  adminMetricsPresetRange,
  type AdminMetricsCalendarRange,
  type AdminMetricsPresetDays,
} from "@/lib/admin-metrics-date";
import { formatCalendarDate } from "@/lib/learner-display";

type MetricCount = number | null;
type MetricKey =
  | "new_learner_accounts"
  | "new_tutor_applications"
  | "currently_approved_new_tutor_applications"
  | "distinct_learners_with_completed_practice"
  | "completed_practice_task_records"
  | "ai_tutor_assistant_messages"
  | "completed_weekly_checkins"
  | "lesson_requests"
  | "complimentary_premium_learners"
  | "paid_premium_learners"
  | "total_premium_learners";

type ComparisonRow = {
  label: string | null;
  track?: "immigration" | "citizenship";
  active_learners: MetricCount;
  learner_weekly_study_hours: MetricCount;
  approved_tutors: MetricCount;
  tutor_recurring_weekly_hours: MetricCount;
  short_of_tutors: boolean;
};

type ComparisonGroup = { available: boolean; rows: ComparisonRow[] };
type MetricsSnapshot = {
  status: "complete" | "partial";
  range: { start_date: string; end_date: string };
  metrics: Record<MetricKey, MetricCount>;
  comparisons: { time_zones: ComparisonGroup; tracks: ComparisonGroup };
  unavailable_metrics: string[];
};
type LoadState = "loading" | "ready" | "error";
type MetricErrorKey =
  | "adminMetrics.error.access"
  | "adminMetrics.range.serverInvalid"
  | "adminMetrics.error.body";
type CardTone = "navy" | "coral" | "sage" | "gold";

const METRIC_KEYS: readonly MetricKey[] = [
  "new_learner_accounts",
  "new_tutor_applications",
  "currently_approved_new_tutor_applications",
  "distinct_learners_with_completed_practice",
  "completed_practice_task_records",
  "ai_tutor_assistant_messages",
  "completed_weekly_checkins",
  "lesson_requests",
  "complimentary_premium_learners",
  "paid_premium_learners",
  "total_premium_learners",
];

const TRACK_LABEL_KEYS: Record<NonNullable<ComparisonRow["track"]>, TranslationKey> = {
  immigration: "adminMetrics.track.immigration",
  citizenship: "adminMetrics.track.citizenship",
};

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const metricGridVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.055 } },
};
const metricCardVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: "easeOut" } },
};

class MetricsRequestError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = "MetricsRequestError";
    this.code = code;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unwrapResponse(value: unknown): Record<string, unknown> {
  let current: unknown = value;
  for (let depth = 0; depth < 6; depth += 1) {
    if (!isObject(current)) break;
    if (isObject(current.result)) {
      current = current.result;
      continue;
    }
    if (isObject(current.data) && ("status" in current.data || "metrics" in current.data || "error" in current.data)) {
      current = current.data;
      continue;
    }
    break;
  }
  return isObject(current) ? current : {};
}

function errorCode(value: unknown): string {
  let current: unknown = value;
  for (let depth = 0; depth < 6; depth += 1) {
    if (!isObject(current)) break;
    if (current.status === 403 || current.status === "403" || current.statusCode === 403) return "ADMIN_REQUIRED";
    if (typeof current.code === "string" && current.code) return current.code;
    if (typeof current.error === "string" && current.error) return current.error;
    if (current.message === "ADMIN_REQUIRED") return "ADMIN_REQUIRED";
    if (current.message === "METRICS_DATE_RANGE_INVALID") return "METRICS_DATE_RANGE_INVALID";
    const nested = [current.result, current.data, current.response].find(isObject);
    if (!nested) break;
    current = nested;
  }
  return value instanceof Error ? value.message : "METRICS_REQUEST_FAILED";
}

function countOrNull(value: unknown): value is MetricCount {
  return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

function measureOrNull(value: unknown): value is MetricCount {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function comparisonGroupFromValue(value: unknown, isTrackGroup: boolean): ComparisonGroup {
  if (!isObject(value) || typeof value.available !== "boolean" || !Array.isArray(value.rows)) {
    throw new MetricsRequestError("METRICS_RESPONSE_INVALID");
  }
  const rows = value.rows.map((candidate): ComparisonRow => {
    if (!isObject(candidate)
      || !(candidate.label === null || typeof candidate.label === "string")
      || !countOrNull(candidate.active_learners)
      || !measureOrNull(candidate.learner_weekly_study_hours)
      || !countOrNull(candidate.approved_tutors)
      || !measureOrNull(candidate.tutor_recurring_weekly_hours)
      || typeof candidate.short_of_tutors !== "boolean") {
      throw new MetricsRequestError("METRICS_RESPONSE_INVALID");
    }
    const track = candidate.track;
    if (track !== undefined && track !== "immigration" && track !== "citizenship") {
      throw new MetricsRequestError("METRICS_RESPONSE_INVALID");
    }
    if (isTrackGroup && track === undefined) throw new MetricsRequestError("METRICS_RESPONSE_INVALID");
    return {
      label: candidate.label,
      ...(track ? { track } : {}),
      active_learners: candidate.active_learners,
      learner_weekly_study_hours: candidate.learner_weekly_study_hours,
      approved_tutors: candidate.approved_tutors,
      tutor_recurring_weekly_hours: candidate.tutor_recurring_weekly_hours,
      short_of_tutors: candidate.short_of_tutors,
    };
  });
  return { available: value.available, rows };
}

function snapshotFromValue(value: unknown, requestedRange: AdminMetricsCalendarRange): MetricsSnapshot {
  if (!isObject(value)
    || (value.status !== "complete" && value.status !== "partial")
    || !isObject(value.range)
    || typeof value.range.start_date !== "string"
    || typeof value.range.end_date !== "string"
    || value.range.start_date !== requestedRange.startDate
    || value.range.end_date !== requestedRange.endDate
    || !isObject(value.metrics)
    || !isObject(value.comparisons)
    || !Array.isArray(value.unavailable_metrics)
    || !value.unavailable_metrics.every((entry) => typeof entry === "string")) {
    throw new MetricsRequestError("METRICS_RESPONSE_INVALID");
  }
  const metrics = {} as Record<MetricKey, MetricCount>;
  for (const key of METRIC_KEYS) {
    const metricValue = value.metrics[key];
    if (!countOrNull(metricValue)) throw new MetricsRequestError("METRICS_RESPONSE_INVALID");
    metrics[key] = metricValue;
  }
  return {
    status: value.status,
    range: { start_date: value.range.start_date, end_date: value.range.end_date },
    metrics,
    comparisons: {
      time_zones: comparisonGroupFromValue(value.comparisons.time_zones, false),
      tracks: comparisonGroupFromValue(value.comparisons.tracks, true),
    },
    unavailable_metrics: value.unavailable_metrics,
  };
}

function metricErrorKey(error: unknown): MetricErrorKey {
  const code = error instanceof MetricsRequestError ? error.code : errorCode(error);
  if (code === "ADMIN_REQUIRED" || code === "AUTH_REQUIRED") return "adminMetrics.error.access";
  if (code === "METRICS_DATE_RANGE_INVALID") return "adminMetrics.range.serverInvalid";
  return "adminMetrics.error.body";
}

function displayCount(value: MetricCount): string {
  return value === null ? t("adminMetrics.notAvailable") : numberFormatter.format(value);
}

function displayHours(value: MetricCount): string {
  return value === null
    ? t("adminMetrics.notAvailable")
    : t("adminMetrics.value.hoursPerWeek", { value: numberFormatter.format(value) });
}

function formatRangeDate(value: string): string {
  return formatCalendarDate(value, { month: "short", day: "numeric" }, "en-CA");
}

interface MetricCardProps {
  titleKey: TranslationKey;
  value: MetricCount;
  captionKey: TranslationKey;
  icon: LucideIcon;
  tone: CardTone;
  primaryLabelKey?: TranslationKey;
  secondary?: { labelKey: TranslationKey; value: MetricCount };
  reduceMotion: boolean;
}

const toneClasses: Record<CardTone, { icon: string; rail: string }> = {
  navy: { icon: "bg-[#EEF2FA] text-[#25477E]", rail: "bg-[#315184]" },
  coral: { icon: "bg-[#FFF0ED] text-[#A8453D]", rail: "bg-[#C64D43]" },
  sage: { icon: "bg-[#EAF4EF] text-[#3E6555]", rail: "bg-[#58846F]" },
  gold: { icon: "bg-[#FBF2DF] text-[#87672A]", rail: "bg-[#B18A3D]" },
};

function MetricCard({
  titleKey,
  value,
  captionKey,
  icon: Icon,
  tone,
  primaryLabelKey,
  secondary,
  reduceMotion,
}: MetricCardProps) {
  const colors = toneClasses[tone];
  return (
    <motion.article
      variants={reduceMotion ? undefined : metricCardVariants}
      whileHover={reduceMotion ? undefined : { y: -3, transition: { duration: 0.18 } }}
      className="relative min-w-0 overflow-hidden rounded-[1.35rem] border border-[#E2E7EF] bg-white p-4 shadow-[0_14px_34px_-28px_rgba(30,58,138,0.38)] sm:p-5"
    >
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${colors.rail}`} />
      <div className="flex items-start justify-between gap-3 pl-1">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold leading-5 text-[#273858]">{t(titleKey)}</h3>
          {primaryLabelKey && <p className="mt-1 text-[11px] font-semibold leading-4 text-[#68758B]">{t(primaryLabelKey)}</p>}
        </div>
        <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colors.icon}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-4 break-words font-display text-[2.15rem] font-extrabold leading-none tracking-[-0.055em] text-[#1E3156] sm:text-4xl">
        {displayCount(value)}
      </p>
      {secondary && (
        <div className="mt-4 flex min-w-0 items-center justify-between gap-3 rounded-xl bg-[#F6F8FB] px-3 py-2.5">
          <span className="min-w-0 text-[11px] font-semibold leading-4 text-[#627089]">{t(secondary.labelKey)}</span>
          <span className="shrink-0 font-display text-lg font-extrabold tracking-[-0.04em] text-[#304666]">{displayCount(secondary.value)}</span>
        </div>
      )}
      <p className="mt-4 text-[11px] leading-[1.65] text-[#68758B]">{t(captionKey)}</p>
    </motion.article>
  );
}

interface PremiumStatProps {
  labelKey: TranslationKey;
  value: MetricCount;
  captionKey: TranslationKey;
  tone: CardTone;
}

function PremiumStat({ labelKey, value, captionKey, tone }: PremiumStatProps) {
  const colors = toneClasses[tone];
  return (
    <div className="min-w-0 rounded-2xl border border-[#E5E9F0] bg-[#FBFCFE] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-extrabold leading-5 text-[#35445F]">{t(labelKey)}</p>
        <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colors.icon}`}>
          <Crown className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 break-words font-display text-3xl font-extrabold tracking-[-0.05em] text-[#1E3156]">{displayCount(value)}</p>
      <p className="mt-2 text-[11px] leading-5 text-[#68758B]">{t(captionKey)}</p>
    </div>
  );
}

function ComparisonValue({ labelKey, value, isHours = false }: { labelKey: TranslationKey; value: MetricCount; isHours?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold leading-4 text-[#728097]">{t(labelKey)}</dt>
      <dd className="mt-1 break-words font-display text-lg font-extrabold leading-6 tracking-[-0.035em] text-[#263A5B]">
        {isHours ? displayHours(value) : displayCount(value)}
      </dd>
    </div>
  );
}

function ComparisonCard({ row, mode, reduceMotion }: { row: ComparisonRow; mode: "timeZone" | "track"; reduceMotion: boolean }) {
  const label = mode === "timeZone"
    ? row.label ?? t("adminMetrics.comparison.unknownTimeZone")
    : row.track ? t(TRACK_LABEL_KEYS[row.track]) : t("adminMetrics.comparison.unknownTrack");
  const showShortage = row.short_of_tutors === true && row.active_learners !== null && row.active_learners > 0 && row.tutor_recurring_weekly_hours === 0;

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.28 }}
      className="min-w-0 rounded-2xl border border-[#E1E6EE] bg-white p-4 shadow-[0_14px_34px_-30px_rgba(30,58,138,0.38)] sm:p-5"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8390A3]">
            {t(mode === "timeZone" ? "adminMetrics.comparison.timeZoneLabel" : "adminMetrics.comparison.trackLabel")}
          </p>
          <h3 className={`mt-1 font-display text-base font-extrabold leading-6 tracking-[-0.035em] text-[#253858] ${mode === "timeZone" ? "break-all" : "break-words"}`}>
            {label}
          </h3>
        </div>
        {showShortage && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#F0C5BE] bg-[#FFF1EF] px-2.5 py-1 text-[10px] font-extrabold leading-4 text-[#9B3D34]">
            <CircleAlert aria-hidden="true" className="h-3.5 w-3.5" />
            {t("adminMetrics.comparison.shortage")}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="min-w-0 rounded-xl bg-[#F4F6FA] p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#48618A]">{t("adminMetrics.comparison.demand")}</p>
          <dl className="mt-3 space-y-3">
            <ComparisonValue labelKey="adminMetrics.comparison.activeLearners" value={row.active_learners} />
            <ComparisonValue labelKey="adminMetrics.comparison.learnerWeeklyGoal" value={row.learner_weekly_study_hours} isHours />
          </dl>
        </div>
        <div className="min-w-0 rounded-xl bg-[#F5F7F4] p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#4C705D]">{t("adminMetrics.comparison.supply")}</p>
          <dl className="mt-3 space-y-3">
            <ComparisonValue labelKey="adminMetrics.comparison.approvedTutors" value={row.approved_tutors} />
            <ComparisonValue labelKey="adminMetrics.comparison.tutorWeeklyAvailability" value={row.tutor_recurring_weekly_hours} isHours />
          </dl>
        </div>
      </div>
    </motion.article>
  );
}

function ComparisonGroupPanel({
  titleKey,
  captionKey,
  rows,
  available,
  mode,
  emptyKey,
  reduceMotion,
}: {
  titleKey: TranslationKey;
  captionKey: TranslationKey;
  rows: ComparisonRow[];
  available: boolean;
  mode: "timeZone" | "track";
  emptyKey: TranslationKey;
  reduceMotion: boolean;
}) {
  return (
    <section className="min-w-0 rounded-[1.65rem] border border-[#DDE4EC] bg-[#F9FAFC] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#315184] shadow-sm ring-1 ring-[#E3E8F0]">
          {mode === "timeZone" ? <Globe2 className="h-4 w-4" /> : <UsersRound className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-lg font-extrabold tracking-[-0.04em] text-[#273858]">{t(titleKey)}</h3>
          <p className="mt-1 text-[11px] leading-[1.65] text-[#68758B]">{t(captionKey)}</p>
        </div>
      </div>

      {!available ? (
        <div className="mt-4 flex min-w-0 items-start gap-3 rounded-xl border border-dashed border-[#D4DCE7] bg-white px-4 py-4" role="status">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#71819B]" />
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-[#3A4B67]">{t("adminMetrics.notAvailable")}</p>
            <p className="mt-1 text-xs leading-5 text-[#68758B]">{t("adminMetrics.comparison.unavailableBody")}</p>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-[#D4DCE7] bg-white px-4 py-4 text-xs leading-5 text-[#68758B]">{t(emptyKey)}</p>
      ) : (
        <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
          {rows.map((row) => (
            <ComparisonCard
              key={`${mode}-${row.track ?? row.label ?? "unknown"}`}
              row={row}
              mode={mode}
              reduceMotion={reduceMotion}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function AdminMetrics() {
  const reduceMotion = useReducedMotion() ?? false;
  const [initialRange] = useState<AdminMetricsCalendarRange>(() => adminMetricsPresetRange(30));
  const [draftRange, setDraftRange] = useState<AdminMetricsCalendarRange>(initialRange);
  const [appliedRange, setAppliedRange] = useState<AdminMetricsCalendarRange>(initialRange);
  const [activePreset, setActivePreset] = useState<AdminMetricsPresetDays | null>(30);
  const [rangeError, setRangeError] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [snapshot, setSnapshot] = useState<MetricsSnapshot | null>(null);
  const [requestErrorKey, setRequestErrorKey] = useState<MetricErrorKey>("adminMetrics.error.body");
  const requestSequence = useRef(0);

  const loadSnapshot = useCallback(async (range: AdminMetricsCalendarRange) => {
    const requestId = ++requestSequence.current;
    setLoadState("loading");
    setSnapshot(null);
    try {
      const raw = await parleMarketplaceService({
        action: "admin_get_metrics",
        start_date: range.startDate,
        end_date: range.endDate,
      });
      const response = unwrapResponse(raw);
      if (response.status === "error" || typeof response.error === "string") {
        throw new MetricsRequestError(typeof response.code === "string" ? response.code : typeof response.error === "string" ? response.error : "METRICS_REQUEST_FAILED");
      }
      const nextSnapshot = snapshotFromValue(response, range);
      if (requestSequence.current === requestId) {
        setSnapshot(nextSnapshot);
        setAppliedRange(range);
        setLoadState("ready");
      }
    } catch (error) {
      console.error("Parle administrator metrics request failed", error);
      if (requestSequence.current === requestId) {
        setRequestErrorKey(metricErrorKey(error));
        setLoadState("error");
      }
    }
  }, []);

  useEffect(() => {
    void loadSnapshot(initialRange);
    return () => { requestSequence.current += 1; };
  }, [initialRange, loadSnapshot]);

  function selectPreset(days: AdminMetricsPresetDays) {
    const nextRange = adminMetricsPresetRange(days);
    setDraftRange(nextRange);
    setAppliedRange(nextRange);
    setActivePreset(days);
    setRangeError(false);
    void loadSnapshot(nextRange);
  }

  function updateDraftRange(field: keyof AdminMetricsCalendarRange, value: string) {
    setDraftRange((current) => ({ ...current, [field]: value }));
    setActivePreset(null);
    setRangeError(false);
  }

  function applyCustomRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adminMetricsCalendarRangeIsValid(draftRange.startDate, draftRange.endDate)) {
      setRangeError(true);
      return;
    }
    const nextRange = { ...draftRange };
    setAppliedRange(nextRange);
    setActivePreset(null);
    setRangeError(false);
    void loadSnapshot(nextRange);
  }

  const snapshotRange = snapshot?.range ?? {
    start_date: appliedRange.startDate,
    end_date: appliedRange.endDate,
  };

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.35, ease: "easeOut" }}
      className="min-w-0 space-y-6"
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#C64D43]">{t("adminMetrics.eyebrow")}</p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#586781]">{t("adminMetrics.intro")}</p>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-[#DCE5DF] bg-[#F4F8F4] px-3 py-1.5 text-[10px] font-bold text-[#4D6A59]">
          <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
          {t("adminMetrics.readOnly")}
        </span>
      </div>

      <section className="overflow-hidden rounded-[1.7rem] border border-[#223C6A] bg-[radial-gradient(circle_at_92%_0%,rgba(249,115,98,0.19),transparent_30%),linear-gradient(135deg,#203C70_0%,#172C51_100%)] p-4 shadow-[0_25px_55px_-38px_rgba(30,58,138,0.72)] sm:p-5">
        <div className="flex min-w-0 flex-col justify-between gap-4 md:flex-row md:items-start">
          <div className="flex min-w-0 gap-3">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-[#FFD5CF]">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-extrabold tracking-[-0.04em] text-white">{t("adminMetrics.range.title")}</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-[#D6DEEB]">{t("adminMetrics.range.caption")}</p>
            </div>
          </div>
          {snapshot && (
            <button
              type="button"
              onClick={() => void loadSnapshot(appliedRange)}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-white/20 bg-white/10 px-3.5 text-xs font-bold text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F7A296] md:self-auto"
              aria-label={t("adminMetrics.refresh")}
            >
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
              <span>{t("adminMetrics.refresh")}</span>
            </button>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label={t("adminMetrics.range.presetsLabel")}>
          {([7, 30, 90] as const).map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={activePreset === days}
              onClick={() => selectPreset(days)}
              className={`min-h-10 rounded-xl border px-4 text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F7A296] ${activePreset === days
                ? "border-[#FFD1CA] bg-[#FFD9D3] text-[#612B2A] shadow-sm"
                : "border-white/20 bg-white/5 text-[#F2F5FA] hover:bg-white/10"}`}
            >
              {t("adminMetrics.range.presetDays", { days })}
            </button>
          ))}
        </div>

        <form onSubmit={applyCustomRange} className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <div className="min-w-0">
            <label htmlFor="admin-metrics-start-date" className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#D6DEEB]">{t("adminMetrics.range.start")}</label>
            <input
              id="admin-metrics-start-date"
              type="date"
              value={draftRange.startDate}
              onChange={(event) => updateDraftRange("startDate", event.currentTarget.value)}
              aria-invalid={rangeError}
              aria-describedby={rangeError ? "admin-metrics-range-error" : undefined}
              className="h-11 w-full min-w-0 rounded-xl border border-white/20 bg-white px-3 text-sm font-semibold text-[#273858] outline-none transition focus:border-[#FFD1CA] focus:ring-2 focus:ring-[#FFD1CA]/40"
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="admin-metrics-end-date" className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#D6DEEB]">{t("adminMetrics.range.end")}</label>
            <input
              id="admin-metrics-end-date"
              type="date"
              value={draftRange.endDate}
              onChange={(event) => updateDraftRange("endDate", event.currentTarget.value)}
              aria-invalid={rangeError}
              aria-describedby={rangeError ? "admin-metrics-range-error" : undefined}
              className="h-11 w-full min-w-0 rounded-xl border border-white/20 bg-white px-3 text-sm font-semibold text-[#273858] outline-none transition focus:border-[#FFD1CA] focus:ring-2 focus:ring-[#FFD1CA]/40"
            />
          </div>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#F97362] px-4 text-xs font-extrabold text-[#332421] shadow-[0_8px_18px_-12px_rgba(249,115,98,0.8)] transition hover:bg-[#FF8879] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:col-span-2 md:justify-self-end">
            <Activity aria-hidden="true" className="h-4 w-4" />
            {t("adminMetrics.range.apply")}
          </button>
          {rangeError && <p id="admin-metrics-range-error" role="alert" className="text-xs font-semibold leading-5 text-[#FFE2DD] md:col-span-3">{t("adminMetrics.range.invalid")}</p>}
        </form>

        <div className="mt-4 flex min-h-5 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-white/10 pt-3">
          <p className="text-[11px] font-semibold text-[#D6DEEB]">
            {t("adminMetrics.range.activeWindow", {
              start: formatRangeDate(snapshotRange.start_date),
              end: formatRangeDate(snapshotRange.end_date),
            })}
          </p>
          {loadState === "loading" && (
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-[#F7C7C0]" role="status" aria-live="polite">
              <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              {t("adminMetrics.loading")}
            </span>
          )}
        </div>
      </section>

      {loadState === "error" && (
        <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-[#E8C6C1] bg-[#FFF7F5] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" role="alert">
          <div className="flex min-w-0 items-start gap-3">
            <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#AD5146]" />
            <div className="min-w-0">
              <h2 className="font-display text-sm font-extrabold text-[#793B35]">{t("adminMetrics.error.title")}</h2>
              <p className="mt-1 text-xs leading-5 text-[#805751]">{t(requestErrorKey)}</p>
            </div>
          </div>
          <button type="button" onClick={() => void loadSnapshot(appliedRange)} className="inline-flex min-h-10 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-[#DDB8B2] bg-white px-4 text-xs font-bold text-[#803E37] transition hover:bg-[#FFF1EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C64D43] sm:w-auto">
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
            {t("adminMetrics.error.retry")}
          </button>
        </div>
      )}

      {loadState === "loading" && (
        <div className="rounded-2xl border border-[#E0E6EE] bg-white p-5 sm:p-6" role="status" aria-live="polite">
          <div className="flex items-center gap-3">
            <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin text-[#315184]" />
            <div>
              <p className="text-sm font-extrabold text-[#2F4264]">{t("adminMetrics.loadingTitle")}</p>
              <p className="mt-1 text-xs leading-5 text-[#68758B]">{t("adminMetrics.loadingBody")}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
            {[0, 1, 2].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-[#F0F3F7]" />)}
          </div>
        </div>
      )}

      {snapshot && loadState === "ready" && (
        <div className="min-w-0 space-y-6">
          {snapshot.status === "partial" && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.24 }}
              className="flex min-w-0 items-start gap-3 rounded-2xl border border-[#E9D9B8] bg-[#FFFAEF] px-4 py-3.5"
              role="status"
            >
              <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#94733A]" />
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-[#705A32]">{t("adminMetrics.status.partialTitle")}</p>
                <p className="mt-1 text-[11px] leading-5 text-[#76664A]">{t("adminMetrics.status.partialBody")}</p>
              </div>
            </motion.div>
          )}

          <section aria-labelledby="admin-metrics-activity-title" className="min-w-0">
            <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8090A8]">{t("adminMetrics.activity.eyebrow")}</p>
                <h2 id="admin-metrics-activity-title" className="mt-1 font-display text-xl font-extrabold tracking-[-0.045em] text-[#273858]">{t("adminMetrics.activity.title")}</h2>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-[#68758B]">{t("adminMetrics.activity.caption")}</p>
              </div>
              <p className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-[#8190A4]">
                {t("adminMetrics.range.activeWindow", {
                  start: formatRangeDate(snapshot.range.start_date),
                  end: formatRangeDate(snapshot.range.end_date),
                })}
              </p>
            </div>

            <motion.div
              variants={reduceMotion ? undefined : metricGridVariants}
              initial={reduceMotion ? false : "hidden"}
              animate={reduceMotion ? undefined : "visible"}
              className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
            >
              <MetricCard
                titleKey="adminMetrics.metric.newLearners"
                value={snapshot.metrics.new_learner_accounts}
                captionKey="adminMetrics.caption.newLearners"
                icon={UsersRound}
                tone="navy"
                reduceMotion={reduceMotion}
              />
              <MetricCard
                titleKey="adminMetrics.metric.newTutorApplications"
                value={snapshot.metrics.new_tutor_applications}
                captionKey="adminMetrics.caption.newTutorApplications"
                icon={FileText}
                tone="coral"
                secondary={{ labelKey: "adminMetrics.label.currentlyApproved", value: snapshot.metrics.currently_approved_new_tutor_applications }}
                reduceMotion={reduceMotion}
              />
              <MetricCard
                titleKey="adminMetrics.metric.practice"
                value={snapshot.metrics.distinct_learners_with_completed_practice}
                primaryLabelKey="adminMetrics.label.practiceLearners"
                captionKey="adminMetrics.caption.practice"
                icon={ClipboardCheck}
                tone="sage"
                secondary={{ labelKey: "adminMetrics.label.practiceRecords", value: snapshot.metrics.completed_practice_task_records }}
                reduceMotion={reduceMotion}
              />
              <MetricCard
                titleKey="adminMetrics.metric.aiMessages"
                value={snapshot.metrics.ai_tutor_assistant_messages}
                captionKey="adminMetrics.caption.aiMessages"
                icon={MessageSquareText}
                tone="navy"
                reduceMotion={reduceMotion}
              />
              <MetricCard
                titleKey="adminMetrics.metric.weeklyCheckins"
                value={snapshot.metrics.completed_weekly_checkins}
                captionKey="adminMetrics.caption.weeklyCheckins"
                icon={CalendarCheck}
                tone="gold"
                reduceMotion={reduceMotion}
              />
              <MetricCard
                titleKey="adminMetrics.metric.lessonRequests"
                value={snapshot.metrics.lesson_requests}
                captionKey="adminMetrics.caption.lessonRequests"
                icon={CalendarDays}
                tone="coral"
                reduceMotion={reduceMotion}
              />
            </motion.div>
          </section>

          <section aria-labelledby="admin-metrics-premium-title" className="min-w-0 rounded-[1.7rem] border border-[#DDE4EC] bg-white p-4 shadow-[0_18px_44px_-36px_rgba(30,58,138,0.42)] sm:p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div className="flex min-w-0 gap-3">
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FBF2DF] text-[#87672A]">
                  <Crown className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 id="admin-metrics-premium-title" className="font-display text-lg font-extrabold tracking-[-0.04em] text-[#273858]">{t("adminMetrics.premium.title")}</h2>
                  <p className="mt-1 max-w-3xl text-[11px] leading-[1.65] text-[#68758B]">{t("adminMetrics.premium.intro")}</p>
                </div>
              </div>
              <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-[#E8D5AA] bg-[#FFFAEF] px-3 py-1.5 text-[10px] font-extrabold text-[#7E6533]">
                <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />
                {t("adminMetrics.premium.currentBadge")}
              </span>
            </div>
            <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
              <PremiumStat labelKey="adminMetrics.premium.complimentary" value={snapshot.metrics.complimentary_premium_learners} captionKey="adminMetrics.premium.complimentaryCaption" tone="sage" />
              <PremiumStat labelKey="adminMetrics.premium.paid" value={snapshot.metrics.paid_premium_learners} captionKey="adminMetrics.premium.paidCaption" tone="coral" />
              <PremiumStat labelKey="adminMetrics.premium.total" value={snapshot.metrics.total_premium_learners} captionKey="adminMetrics.premium.totalCaption" tone="navy" />
            </div>
          </section>

          <section aria-labelledby="admin-metrics-comparison-title" className="min-w-0 space-y-3">
            <div className="rounded-[1.65rem] bg-[#EAF0F8] px-4 py-4 sm:px-5">
              <div className="flex min-w-0 items-start gap-3">
                <span aria-hidden="true" className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#315184] shadow-sm">
                  <Activity className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#75849A]">{t("adminMetrics.comparison.eyebrow")}</p>
                  <h2 id="admin-metrics-comparison-title" className="mt-1 font-display text-xl font-extrabold tracking-[-0.045em] text-[#273858]">{t("adminMetrics.comparison.title")}</h2>
                  <p className="mt-1 max-w-4xl text-xs leading-[1.7] text-[#5F6E85]">{t("adminMetrics.comparison.intro")}</p>
                </div>
              </div>
            </div>

            <ComparisonGroupPanel
              titleKey="adminMetrics.comparison.timeZoneTitle"
              captionKey="adminMetrics.comparison.timeZoneCaption"
              rows={snapshot.comparisons.time_zones.rows}
              available={snapshot.comparisons.time_zones.available}
              mode="timeZone"
              emptyKey="adminMetrics.comparison.emptyTimeZones"
              reduceMotion={reduceMotion}
            />
            <ComparisonGroupPanel
              titleKey="adminMetrics.comparison.trackTitle"
              captionKey="adminMetrics.comparison.trackCaption"
              rows={snapshot.comparisons.tracks.rows}
              available={snapshot.comparisons.tracks.available}
              mode="track"
              emptyKey="adminMetrics.comparison.emptyTracks"
              reduceMotion={reduceMotion}
            />
            <p className="px-1 text-[10px] leading-5 text-[#718098]">{t("adminMetrics.comparison.trackScopeNote")}</p>
          </section>
        </div>
      )}
    </motion.div>
  );
}
