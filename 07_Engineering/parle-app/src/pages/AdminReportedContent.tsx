import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, BookOpen, Check, CircleCheck, Clock3, FileText, Hash, LoaderCircle, RefreshCw, ShieldCheck, X } from "lucide-react";
import { parleMarketplaceService } from "@/functions";
import { t, type TranslationKey } from "@/lib/i18n";

type ReportStatus = "open" | "fixed" | "dismissed" | "reviewed" | "closed" | "unknown";
type Resolution = "fixed" | "dismissed";
type LoadState = "loading" | "ready" | "error";
type Feedback = { tone: "success" | "warning" | "error"; key: TranslationKey; note?: string };
type Report = {
  id: string;
  task_id: string;
  task_key: string;
  note: string;
  reported_at_utc: string;
  status: ReportStatus;
};

const REPORT_STATUSES = new Set<ReportStatus>(["open", "fixed", "dismissed", "reviewed", "closed", "unknown"]);
const STATUS_LABELS: Record<ReportStatus, TranslationKey> = {
  open: "adminReportedContent.status.open",
  fixed: "adminReportedContent.status.fixed",
  dismissed: "adminReportedContent.status.dismissed",
  reviewed: "adminReportedContent.status.reviewed",
  closed: "adminReportedContent.status.closed",
  unknown: "adminReportedContent.status.unknown",
};

class ReportActionError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = "ReportActionError";
    this.code = code;
  }
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
    if (isObject(current.data) && ("status" in current.data || "error" in current.data || "reports" in current.data || "report" in current.data)) {
      current = current.data;
      continue;
    }
    break;
  }
  return isObject(current) ? current : {};
}

function serviceErrorCode(value: unknown): string {
  let current: unknown = value;
  for (let index = 0; index < 6; index += 1) {
    if (!isObject(current)) break;
    if (current.status === 403 || current.status === "403" || current.statusCode === 403) return "ADMIN_REQUIRED";
    if (typeof current.code === "string" && current.code) return current.code;
    if (typeof current.error === "string" && current.error) return current.error;
    if (current.message === "ADMIN_REQUIRED") return "ADMIN_REQUIRED";
    if (isObject(current.result)) current = current.result;
    else if (isObject(current.data)) current = current.data;
    else if (isObject(current.response)) current = current.response;
    else break;
  }
  return value instanceof Error ? value.message : "REQUEST_FAILED";
}

async function reportAction(values: Record<string, unknown>): Promise<Record<string, unknown>> {
  let result: Record<string, unknown>;
  try {
    result = unwrapResponse(await parleMarketplaceService(values));
  } catch (error) {
    throw new ReportActionError(serviceErrorCode(error));
  }
  if (typeof result.error === "string" || result.status === "error") {
    throw new ReportActionError(typeof result.code === "string" ? result.code : typeof result.error === "string" ? result.error : "REQUEST_FAILED");
  }
  if (result.status !== "complete" && result.status !== "partial") throw new ReportActionError("REPORT_RESPONSE_INVALID");
  return result;
}

function reportFromValue(value: unknown): Report {
  if (!isObject(value)
    || typeof value.id !== "string"
    || typeof value.task_id !== "string"
    || typeof value.task_key !== "string"
    || typeof value.note !== "string"
    || typeof value.reported_at_utc !== "string"
    || typeof value.status !== "string"
    || !REPORT_STATUSES.has(value.status as ReportStatus)) {
    throw new ReportActionError("REPORT_RESPONSE_INVALID");
  }
  return {
    id: value.id,
    task_id: value.task_id,
    task_key: value.task_key,
    note: value.note,
    reported_at_utc: value.reported_at_utc,
    status: value.status as ReportStatus,
  };
}

function errorKey(error: unknown): TranslationKey {
  const code = error instanceof ReportActionError ? error.code : serviceErrorCode(error);
  const keys: Record<string, TranslationKey> = {
    ADMIN_REQUIRED: "adminReportedContent.error.access",
    AUTH_REQUIRED: "adminReportedContent.error.access",
    REPORTS_UNAVAILABLE: "adminReportedContent.error.load",
    REPORTS_READ_FAILED: "adminReportedContent.error.load",
    REPORT_RESPONSE_INVALID: "adminReportedContent.error.load",
    REPORT_ID_INVALID: "adminReportedContent.error.generic",
    REPORT_NOT_FOUND: "adminReportedContent.error.notFound",
    REPORT_NOT_OPEN: "adminReportedContent.error.notOpen",
    REPORT_NOTE_REQUIRED: "adminReportedContent.noteRequired",
    REPORT_NOTE_TOO_LONG: "adminReportedContent.error.noteTooLong",
    REPORT_RESOLUTION_INVALID: "adminReportedContent.error.generic",
    REPORT_SAVE_FAILED: "adminReportedContent.error.save",
    AUDIT_UNAVAILABLE: "adminReportedContent.error.audit",
    AUDIT_WRITE_FAILED: "adminReportedContent.error.audit",
  };
  return keys[code] ?? "adminReportedContent.error.generic";
}

function formatReportedDate(value: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return value || t("adminReportedContent.dateUnavailable");
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(milliseconds));
}

function statusStyles(status: ReportStatus): string {
  if (status === "open") return "border-[#E9D19A] bg-[#FFF7E6] text-[#73551B]";
  if (status === "fixed") return "border-[#BEDBCB] bg-[#EDF7F0] text-[#28634F]";
  if (status === "dismissed") return "border-[#D9DEE8] bg-[#F2F4F8] text-[#5E6A80]";
  if (status === "reviewed") return "border-[#C9D4EA] bg-[#F0F3FA] text-[#3C527C]";
  if (status === "closed") return "border-[#D9DEE8] bg-[#F2F4F8] text-[#5E6A80]";
  return "border-[#E3C8C4] bg-[#FFF0ED] text-[#8D342D]";
}

function statusIcon(status: ReportStatus) {
  if (status === "open") return <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />;
  if (status === "fixed") return <CircleCheck aria-hidden="true" className="h-3.5 w-3.5" />;
  if (status === "dismissed" || status === "closed") return <X aria-hidden="true" className="h-3.5 w-3.5" />;
  return <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" />;
}

function safeDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function statusForResolution(resolution: Resolution): ReportStatus {
  return resolution;
}

function ReportCard({
  report,
  index,
  note,
  noteAttempted,
  feedback,
  saving,
  onNoteChange,
  onSubmit,
  onInvalid,
}: {
  report: Report;
  index: number;
  note: string;
  noteAttempted: boolean;
  feedback?: Feedback;
  saving: { reportId: string; resolution: Resolution } | null;
  onNoteChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onInvalid: () => void;
}) {
  const domId = safeDomId(report.id);
  const textareaId = `admin-report-note-${domId}`;
  const requiredMessageId = `admin-report-note-required-${domId}`;
  const showRequired = noteAttempted && !note.trim();
  const busy = saving !== null;
  const isSavingFixed = saving?.reportId === report.id && saving.resolution === "fixed";
  const isSavingDismissed = saving?.reportId === report.id && saving.resolution === "dismissed";
  const referenceHeading = report.task_key || report.task_id || report.id;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index * 0.04, 0.2) }}
      aria-labelledby={`admin-report-title-${domId}`}
      className="overflow-hidden rounded-[1.65rem] border border-[#E3E8F0] bg-white shadow-[0_18px_48px_-42px_rgba(23,43,91,0.5)]"
    >
      <div className="p-5 sm:p-6 lg:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span aria-hidden="true" className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FA] text-[#1E3A8A]">
              <FileText className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#78849A]">{t("adminReportedContent.reportedOn")}</p>
              <h2 id={`admin-report-title-${domId}`} className="mt-1 break-all font-display text-base font-extrabold tracking-[-0.025em] text-[#1E3A8A] sm:text-lg">
                {referenceHeading}
              </h2>
              <p className="mt-1 text-xs font-medium text-[#69758B]">{formatReportedDate(report.reported_at_utc)}</p>
            </div>
          </div>
          <span aria-label={t("adminReportedContent.statusLabel")} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em] ${statusStyles(report.status)}`}>
            {statusIcon(report.status)}
            {t(STATUS_LABELS[report.status])}
          </span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl border border-[#E9EDF3] bg-[#FBFCFE] p-4 sm:p-5">
            <h3 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#68758B]">{t("adminReportedContent.learnerNote")}</h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#28354C]">
              {report.note.trim() ? report.note : <span className="italic text-[#7A8495]">{t("adminReportedContent.noteMissing")}</span>}
            </p>
          </section>

          <section className="rounded-2xl border border-[#E9EDF3] bg-[#F7F8FB] p-4 sm:p-5">
            <h3 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#68758B]">{t("adminReportedContent.savedReference")}</h3>
            {report.task_key || report.task_id ? (
              <dl className="mt-3 space-y-3">
                {report.task_key && (
                  <div>
                    <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#7A8495]"><Hash aria-hidden="true" className="h-3 w-3" />{t("adminReportedContent.taskKey")}</dt>
                    <dd className="mt-1 break-all font-mono text-xs font-semibold leading-5 text-[#26344D]">{report.task_key}</dd>
                  </div>
                )}
                {report.task_id && (
                  <div>
                    <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#7A8495]"><BookOpen aria-hidden="true" className="h-3 w-3" />{t("adminReportedContent.taskRecordId")}</dt>
                    <dd className="mt-1 break-all font-mono text-xs font-semibold leading-5 text-[#26344D]">{report.task_id}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="mt-3 text-xs leading-5 text-[#65718A]">{t("adminReportedContent.referenceMissing")}</p>
            )}
          </section>
        </div>

        {report.status === "open" && (
          <form
            onSubmit={onSubmit}
            onInvalid={onInvalid}
            className="mt-5 border-t border-[#EDF0F4] pt-5"
          >
            <label htmlFor={textareaId} className="block text-xs font-extrabold text-[#26344D]">{t("adminReportedContent.resolutionNoteLabel")}</label>
            <p className="mt-1 text-xs leading-5 text-[#728097]">{t("adminReportedContent.resolutionNoteHelp")}</p>
            <textarea
              id={textareaId}
              name="resolution_note"
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              maxLength={1000}
              rows={3}
              required
              aria-required="true"
              aria-invalid={showRequired}
              aria-describedby={showRequired ? requiredMessageId : undefined}
              placeholder={t("adminReportedContent.resolutionNotePlaceholder")}
              className="mt-3 min-h-[5.25rem] w-full resize-y rounded-xl border border-[#D9E0EA] bg-white px-3.5 py-3 text-sm leading-6 text-[#26344D] placeholder:text-[#9AA4B4] transition focus:border-[#536A9F] focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/15"
            />
            {showRequired && <p id={requiredMessageId} role="alert" className="mt-2 text-xs font-semibold text-[#9D4037]">{t("adminReportedContent.noteRequired")}</p>}

            <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <button
                type="submit"
                name="resolution"
                value="fixed"
                disabled={busy}
                aria-label={t("adminReportedContent.markFixedAria", { reference: referenceHeading })}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1E3A8A] px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition duration-150 hover:-translate-y-0.5 hover:bg-[#172B5B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:min-w-[9.5rem]"
              >
                {isSavingFixed ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                {t(isSavingFixed ? "adminReportedContent.saving" : "adminReportedContent.markFixed")}
              </button>
              <button
                type="submit"
                name="resolution"
                value="dismissed"
                disabled={busy}
                aria-label={t("adminReportedContent.dismissAria", { reference: referenceHeading })}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#D9E0EA] bg-white px-4 py-2.5 text-xs font-extrabold text-[#4D5A71] transition duration-150 hover:-translate-y-0.5 hover:border-[#AEBACD] hover:bg-[#F8F9FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:min-w-[8rem]"
              >
                {isSavingDismissed ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <X aria-hidden="true" className="h-4 w-4" />}
                {t(isSavingDismissed ? "adminReportedContent.saving" : "adminReportedContent.dismiss")}
              </button>
            </div>
          </form>
        )}

        {feedback && (
          <div
            role={feedback.tone === "error" ? "alert" : "status"}
            className={`mt-4 rounded-xl border px-3.5 py-3 text-xs font-semibold leading-5 ${feedback.tone === "success" ? "border-[#BEDBCB] bg-[#EDF7F0] text-[#28634F]" : feedback.tone === "warning" ? "border-[#E9D19A] bg-[#FFF8E9] text-[#73551B]" : "border-[#E8C8C4] bg-[#FFF2F0] text-[#8D342D]"}`}
          >
            <div className="flex items-start gap-2">
              {feedback.tone === "success" ? <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> : feedback.tone === "warning" ? <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}
              <div>
                <p>{t(feedback.key)}</p>
                {feedback.note && <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-white/70 px-3 py-2 font-medium">{feedback.note}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.article>
  );
}

export default function AdminReportedContent() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<TranslationKey | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteAttempts, setNoteAttempts] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, Feedback | undefined>>({});
  const [saving, setSaving] = useState<{ reportId: string; resolution: Resolution } | null>(null);
  const openCount = reports.filter((report) => report.status === "open").length;

  useEffect(() => {
    let active = true;
    setLoadState("loading");
    setLoadError(null);
    void reportAction({ action: "admin_list_reported_content" }).then((response) => {
      if (!Array.isArray(response.reports)) throw new ReportActionError("REPORT_RESPONSE_INVALID");
      const loaded = response.reports.map(reportFromValue);
      const count = response.count;
      const serverOpenCount = response.open_count;
      if (typeof count !== "number" || count !== loaded.length
        || typeof serverOpenCount !== "number"
        || serverOpenCount !== loaded.filter((report) => report.status === "open").length) {
        throw new ReportActionError("REPORT_RESPONSE_INVALID");
      }
      if (!active) return;
      setReports(loaded);
      setLoadState("ready");
    }).catch((error) => {
      console.error("Parle administrator reported-content queue could not be loaded", error);
      if (!active) return;
      setLoadError(errorKey(error));
      setLoadState("error");
    });
    return () => { active = false; };
  }, [reloadCount]);

  async function resolveReport(report: Report, resolution: Resolution) {
    const note = (notes[report.id] ?? "").trim();
    setNoteAttempts((current) => ({ ...current, [report.id]: true }));
    setFeedback((current) => ({ ...current, [report.id]: undefined }));
    if (!note) return;

    setSaving({ reportId: report.id, resolution });
    try {
      const response = await reportAction({
        action: "admin_resolve_practice_report",
        report_id: report.id,
        resolution,
        note,
      });
      const saved = reportFromValue(response.report);
      if (saved.id !== report.id || saved.status !== statusForResolution(resolution)) {
        throw new ReportActionError("REPORT_RESPONSE_INVALID");
      }
      setReports((current) => current.map((item) => item.id === saved.id ? saved : item));
      if (response.status === "partial") {
        setFeedback((current) => ({
          ...current,
          [report.id]: { tone: "warning", key: "adminReportedContent.auditPartial", note },
        }));
      } else {
        setNotes((current) => ({ ...current, [report.id]: "" }));
        setNoteAttempts((current) => ({ ...current, [report.id]: false }));
        setFeedback((current) => ({
          ...current,
          [report.id]: {
            tone: "success",
            key: resolution === "fixed" ? "adminReportedContent.fixedSuccess" : "adminReportedContent.dismissedSuccess",
          },
        }));
      }
    } catch (error) {
      console.error("Parle administrator practice report resolution failed", error);
      const key = errorKey(error);
      if (key === "adminReportedContent.noteRequired") {
        setNoteAttempts((current) => ({ ...current, [report.id]: true }));
      }
      setFeedback((current) => ({ ...current, [report.id]: { tone: "error", key } }));
    } finally {
      setSaving(null);
    }
  }

  function submitResolution(report: Report, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const resolution: Resolution = submitter instanceof HTMLButtonElement && submitter.value === "dismissed" ? "dismissed" : "fixed";
    void resolveReport(report, resolution);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
      className="space-y-6"
    >
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-stretch">
        <div className="rounded-[1.65rem] border border-[#E4E8EF] bg-white p-5 shadow-[0_18px_48px_-42px_rgba(23,43,91,0.5)] sm:p-6 lg:p-7">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.17em] text-[#C64D43]">{t("adminReportedContent.eyebrow")}</p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#56647B] sm:text-[15px]">{t("adminReportedContent.intro")}</p>
          <div className="mt-5 flex items-center gap-2.5 border-t border-[#EDF0F4] pt-4 text-xs font-semibold text-[#68758B]">
            <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FFF1E8] text-[#A84A3F]"><FileText className="h-3.5 w-3.5" /></span>
            <span>{t("adminReportedContent.referencePromise")}</span>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-[1.65rem] bg-[#1E3A8A] p-5 text-white shadow-[0_22px_52px_-38px_rgba(23,43,91,0.8)] sm:p-6">
          <span aria-hidden="true" className="absolute -right-8 -top-8 h-32 w-32 rounded-full border-[18px] border-white/[0.08]" />
          <span aria-hidden="true" className="absolute bottom-5 right-6 h-2.5 w-2.5 rounded-full bg-[#F97362] shadow-[0_0_0_7px_rgba(249,115,98,0.12)]" />
          <div className="relative flex h-full flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/75">{t("adminReportedContent.openCountLabel")}</p>
              <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white"><Clock3 className="h-4 w-4" /></span>
            </div>
            <p aria-live="polite" className="mt-5 font-display text-5xl font-black leading-none tracking-[-0.06em] sm:text-6xl">{openCount}</p>
            <p className="mt-3 text-xs font-medium leading-5 text-white/75">{t("adminReportedContent.openCountHelp")}</p>
          </div>
        </div>
      </section>

      <section aria-label={t("adminReportedContent.queueLabel")} aria-busy={loadState === "loading"} className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <h2 className="font-display text-xl font-extrabold tracking-[-0.035em] text-[#1E3A8A]">{t("adminReportedContent.queueTitle")}</h2>
            {loadState === "ready" && <p className="mt-1 text-xs text-[#758198]">{t("adminReportedContent.queueCount", { count: reports.length })}</p>}
          </div>
          {loadState === "ready" && reports.length > 0 && (
            <button
              type="button"
              onClick={() => setReloadCount((count) => count + 1)}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-[#DCE2EC] bg-white px-3.5 text-xs font-bold text-[#4D5A71] transition hover:border-[#BBC6D8] hover:bg-[#F9FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2"
            >
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />{t("adminReportedContent.refresh")}
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {loadState === "loading" && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3" role="status" aria-live="polite">
              <div className="flex items-center gap-2 rounded-2xl border border-[#E3E8F0] bg-white px-4 py-3 text-xs font-semibold text-[#6C7890]"><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />{t("adminReportedContent.loading")}</div>
              <div aria-hidden="true" className="h-52 animate-pulse rounded-[1.65rem] border border-[#E3E8F0] bg-white" />
            </motion.div>
          )}
          {loadState === "error" && (
            <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="rounded-[1.65rem] border border-[#E8C8C4] bg-white p-6 sm:p-8">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0ED] text-[#9D4037]"><AlertCircle className="h-5 w-5" /></span>
                <div>
                  <h3 className="font-display text-lg font-extrabold text-[#1E3A8A]">{t("adminReportedContent.error.title")}</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#68758B]">{t(loadError ?? "adminReportedContent.error.load")}</p>
                  <button type="button" onClick={() => setReloadCount((count) => count + 1)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#1E3A8A] px-4 text-xs font-bold text-white transition hover:bg-[#172B5B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2"><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />{t("adminReportedContent.retry")}</button>
                </div>
              </div>
            </motion.div>
          )}
          {loadState === "ready" && reports.length === 0 && (
            <motion.div key="empty" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-[1.65rem] border border-dashed border-[#CBD4E2] bg-white px-6 py-12 text-center sm:px-10">
              <span aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF2FA] text-[#1E3A8A]"><CircleCheck className="h-6 w-6" /></span>
              <h3 className="mt-4 font-display text-lg font-extrabold tracking-[-0.03em] text-[#1E3A8A]">{t("adminReportedContent.emptyTitle")}</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#69758B]">{t("adminReportedContent.emptyBody")}</p>
            </motion.div>
          )}
          {loadState === "ready" && reports.length > 0 && (
            <motion.div key="reports" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              {reports.map((report, index) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  index={index}
                  note={notes[report.id] ?? ""}
                  noteAttempted={noteAttempts[report.id] ?? false}
                  feedback={feedback[report.id]}
                  saving={saving}
                  onNoteChange={(value) => {
                    setNotes((current) => ({ ...current, [report.id]: value }));
                    if (value.trim()) setNoteAttempts((current) => ({ ...current, [report.id]: false }));
                    setFeedback((current) => ({ ...current, [report.id]: undefined }));
                  }}
                  onSubmit={(event) => submitResolution(report, event)}
                  onInvalid={() => setNoteAttempts((current) => ({ ...current, [report.id]: true }))}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </motion.div>
  );
}
