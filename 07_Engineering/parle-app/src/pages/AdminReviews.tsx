import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Star,
  UserRound,
  X,
} from "lucide-react";
import { parleMarketplaceService } from "@/functions";
import { t, type TranslationKey } from "@/lib/i18n";

type Review = {
  id: string;
  created_at: string;
  tutor_display_name: string;
  learner_display_name: string;
  stars: number;
  comment: string;
  tutor_reply: string;
  is_test_review: boolean;
  is_visible: boolean;
};
type LoadState = "loading" | "ready" | "error";
type VisibilityAction = "hide" | "restore";
type Feedback = { tone: "success" | "warning" | "error"; key: TranslationKey };

class ReviewActionError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = "ReviewActionError";
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
    if (isObject(current.data) && ("status" in current.data || "error" in current.data || "reviews" in current.data || "review" in current.data)) {
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

async function reviewAction(values: Record<string, unknown>): Promise<Record<string, unknown>> {
  let result: Record<string, unknown>;
  try {
    result = unwrapResponse(await parleMarketplaceService({ action: "admin_manage_reviews", ...values }));
  } catch (error) {
    throw new ReviewActionError(serviceErrorCode(error));
  }
  if (typeof result.error === "string" || result.status === "error") {
    throw new ReviewActionError(typeof result.code === "string" ? result.code : typeof result.error === "string" ? result.error : "REQUEST_FAILED");
  }
  if (result.status !== "complete") throw new ReviewActionError("REVIEW_RESPONSE_INVALID");
  return result;
}

function reviewFromValue(value: unknown): Review {
  if (!isObject(value)
    || typeof value.id !== "string"
    || !Number.isInteger(value.stars)
    || Number(value.stars) < 1
    || Number(value.stars) > 5
    || typeof value.created_at !== "string"
    || typeof value.tutor_display_name !== "string"
    || typeof value.learner_display_name !== "string"
    || typeof value.comment !== "string"
    || typeof value.tutor_reply !== "string"
    || typeof value.is_visible !== "boolean") {
    throw new ReviewActionError("REVIEW_RESPONSE_INVALID");
  }
  return {
    id: value.id,
    created_at: value.created_at,
    tutor_display_name: value.tutor_display_name,
    learner_display_name: value.learner_display_name,
    stars: Number(value.stars),
    comment: value.comment,
    tutor_reply: value.tutor_reply,
    is_test_review: value.is_test_review === true,
    is_visible: value.is_visible,
  };
}

function errorKey(error: unknown): TranslationKey {
  const code = error instanceof ReviewActionError ? error.code : serviceErrorCode(error);
  const keys: Record<string, TranslationKey> = {
    ADMIN_REQUIRED: "adminReviews.error.access",
    AUTH_REQUIRED: "adminReviews.error.access",
    REVIEWS_UNAVAILABLE: "adminReviews.error.load",
    REVIEWS_READ_FAILED: "adminReviews.error.load",
    REVIEW_RECORD_INVALID: "adminReviews.error.load",
    REVIEW_RESPONSE_INVALID: "adminReviews.error.load",
    REVIEW_OPERATION_INVALID: "adminReviews.error.generic",
    REVIEW_ID_INVALID: "adminReviews.error.generic",
    REVIEW_NOT_FOUND: "adminReviews.error.notFound",
    REVIEW_ALREADY_HIDDEN: "adminReviews.error.alreadyHidden",
    REVIEW_NOT_HIDDEN: "adminReviews.error.notHidden",
    REVIEW_HIDE_REASON_REQUIRED: "adminReviews.reasonRequired",
    REVIEW_HIDE_REASON_TOO_LONG: "adminReviews.error.reasonTooLong",
    REVIEW_SAVE_FAILED: "adminReviews.error.save",
    REVIEW_AUDIT_FAILED: "adminReviews.error.audit",
    REVIEW_AUDIT_PARTIAL: "adminReviews.error.auditPartial",
  };
  return keys[code] ?? "adminReviews.error.generic";
}

function formatReviewDate(value: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return t("adminReviews.dateUnavailable");
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(milliseconds));
}

function learnerName(review: Review): string {
  if (review.learner_display_name.trim()) return review.learner_display_name;
  return t(review.is_test_review ? "adminReviews.demoLearner" : "adminReviews.learnerFallback");
}

function tutorName(review: Review): string {
  return review.tutor_display_name.trim() || t("adminReviews.tutorFallback");
}

function safeDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function statusStyles(visible: boolean): string {
  return visible
    ? "border-[#BEDBCB] bg-[#EDF7F0] text-[#28634F]"
    : "border-[#D9DEE8] bg-[#F2F4F8] text-[#5E6A80]";
}

function ReviewCard({
  review,
  index,
  editing,
  reason,
  reasonAttempted,
  saving,
  feedback,
  onReasonChange,
  onBeginHide,
  onCancelHide,
  onHideSubmit,
  onReasonInvalid,
  onRestore,
}: {
  review: Review;
  index: number;
  editing: boolean;
  reason: string;
  reasonAttempted: boolean;
  saving: { reviewId: string; action: VisibilityAction } | null;
  feedback?: Feedback;
  onReasonChange: (value: string) => void;
  onBeginHide: () => void;
  onCancelHide: () => void;
  onHideSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReasonInvalid: () => void;
  onRestore: () => void;
}) {
  const domId = safeDomId(review.id);
  const reasonId = `admin-review-reason-${domId}`;
  const reasonErrorId = `admin-review-reason-error-${domId}`;
  const showRequired = editing && reasonAttempted && !reason.trim();
  const busy = saving !== null;
  const hiding = saving?.reviewId === review.id && saving.action === "hide";
  const restoring = saving?.reviewId === review.id && saving.action === "restore";
  const userLabel = learnerName(review);
  const tutorLabel = tutorName(review);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index * 0.035, 0.2) }}
      aria-labelledby={`admin-review-title-${domId}`}
      className="overflow-hidden rounded-[1.65rem] border border-[#E3E8F0] bg-white shadow-[0_18px_48px_-42px_rgba(23,43,91,0.5)]"
    >
      <div className="p-4 sm:p-6 lg:p-7">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span aria-hidden="true" className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FFF3E9] text-[#A84A3F]">
              <MessageSquare className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#78849A]">
                <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />{t("adminReviews.reviewDate")}
              </p>
              <h3 id={`admin-review-title-${domId}`} className="mt-1 break-words font-display text-base font-extrabold tracking-[-0.025em] text-[#1E3A8A] sm:text-lg">
                {formatReviewDate(review.created_at)}
              </h3>
            </div>
          </div>
          <span aria-label={t("adminReviews.visibilityLabel")} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em] ${statusStyles(review.is_visible)}`}>
            {review.is_visible ? <Eye aria-hidden="true" className="h-3.5 w-3.5" /> : <EyeOff aria-hidden="true" className="h-3.5 w-3.5" />}
            {t(review.is_visible ? "adminReviews.status.visible" : "adminReviews.status.hidden")}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <section className="min-w-0 rounded-2xl border border-[#E9EDF3] bg-[#FBFCFE] p-3.5 sm:p-4">
            <h4 className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#68758B]">
              <UserRound aria-hidden="true" className="h-3.5 w-3.5" />{t("adminReviews.tutorLabel")}
            </h4>
            <p className="mt-2 break-words text-sm font-bold leading-5 text-[#26344D]">{tutorLabel}</p>
          </section>
          <section className="min-w-0 rounded-2xl border border-[#E9EDF3] bg-[#F7F8FB] p-3.5 sm:p-4">
            <h4 className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#68758B]">
              <UserRound aria-hidden="true" className="h-3.5 w-3.5" />{t("adminReviews.learnerLabel")}
            </h4>
            <p className="mt-2 break-words text-sm font-bold leading-5 text-[#26344D]">{userLabel}</p>
          </section>
        </div>

        <section className="mt-3 rounded-2xl border border-[#F1E2C2] bg-[#FFFBF1] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#73551B]">{t("adminReviews.reviewTextLabel")}</h4>
            <div aria-label={t("adminReviews.ratingLabel", { stars: review.stars })} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1.5 shadow-sm">
              <span className="sr-only">{t("adminReviews.ratingLabel", { stars: review.stars })}</span>
              {Array.from({ length: 5 }, (_, starIndex) => (
                <Star key={starIndex} aria-hidden="true" className={`h-3.5 w-3.5 ${starIndex < review.stars ? "fill-[#E4A63A] text-[#E4A63A]" : "text-[#D1D5DB]"}`} />
              ))}
              <span aria-hidden="true" className="ml-1 text-xs font-extrabold tabular-nums text-[#73551B]">{review.stars}/5</span>
            </div>
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#28354C]">
            {review.comment.trim() ? review.comment : <span className="italic text-[#7A8495]">{t("adminReviews.commentMissing")}</span>}
          </p>
        </section>

        {review.tutor_reply.trim() && (
          <section className="mt-3 rounded-2xl border border-[#D9E3F4] bg-[#F3F6FC] p-4 sm:p-5">
            <h4 className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#405780]">
              <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />{t("adminReviews.tutorReplyLabel")}
            </h4>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#28354C]">{review.tutor_reply}</p>
          </section>
        )}

        <div className="mt-5 flex flex-col gap-3 border-t border-[#EDF0F4] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2 text-xs leading-5 text-[#68758B]">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#516997]" />
            <span>{t("adminReviews.visibilityHelp")}</span>
          </div>
          {!editing && review.is_visible && (
            <button
              type="button"
              onClick={onBeginHide}
              disabled={busy}
              aria-label={t("adminReviews.hideAria", { learner: userLabel, tutor: tutorLabel })}
              className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-[#E4C9C2] bg-white px-4 py-2.5 text-xs font-extrabold text-[#8D342D] transition duration-150 hover:-translate-y-0.5 hover:border-[#D59D92] hover:bg-[#FFF6F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
            >
              <EyeOff aria-hidden="true" className="h-4 w-4" />{t("adminReviews.hide")}
            </button>
          )}
          {!review.is_visible && (
            <button
              type="button"
              onClick={onRestore}
              disabled={busy}
              aria-label={t("adminReviews.restoreAria", { learner: userLabel, tutor: tutorLabel })}
              className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1E3A8A] px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition duration-150 hover:-translate-y-0.5 hover:bg-[#172B5B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
            >
              {restoring ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
              {t(restoring ? "adminReviews.restoring" : "adminReviews.restore")}
            </button>
          )}
        </div>

        {editing && (
          <form onSubmit={onHideSubmit} onInvalid={onReasonInvalid} className="mt-4 rounded-2xl border border-[#E8C8C4] bg-[#FFF7F5] p-4 sm:p-5">
            <label htmlFor={reasonId} className="block text-xs font-extrabold text-[#26344D]">{t("adminReviews.reasonLabel")}</label>
            <p className="mt-1 text-xs leading-5 text-[#68758B]">{t("adminReviews.reasonHelp")}</p>
            <textarea
              id={reasonId}
              name="hide_reason"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              maxLength={1000}
              rows={3}
              required
              aria-required="true"
              aria-invalid={showRequired}
              aria-describedby={showRequired ? reasonErrorId : `${reasonId}-help`}
              placeholder={t("adminReviews.reasonPlaceholder")}
              className="mt-3 min-h-[5.5rem] w-full resize-y rounded-xl border border-[#D9E0EA] bg-white px-3.5 py-3 text-sm leading-6 text-[#26344D] placeholder:text-[#9AA4B4] transition focus:border-[#536A9F] focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/15"
            />
            {showRequired && <p id={reasonErrorId} role="alert" className="mt-2 text-xs font-semibold text-[#9D4037]">{t("adminReviews.reasonRequired")}</p>}
            {!showRequired && <span id={`${reasonId}-help`} className="sr-only">{t("adminReviews.reasonHelp")}</span>}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onCancelHide}
                disabled={busy}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#D9E0EA] bg-white px-4 py-2.5 text-xs font-extrabold text-[#4D5A71] transition hover:bg-[#F8F9FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2 disabled:opacity-60"
              >
                <X aria-hidden="true" className="h-4 w-4" />{t("adminReviews.cancel")}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#A13E35] px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition duration-150 hover:-translate-y-0.5 hover:bg-[#812F29] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
              >
                {hiding ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <EyeOff aria-hidden="true" className="h-4 w-4" />}
                {t(hiding ? "adminReviews.hiding" : "adminReviews.confirmHide")}
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
              {feedback.tone === "success" ? <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> : <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}
              <p>{t(feedback.key)}</p>
            </div>
          </div>
        )}
      </div>
    </motion.article>
  );
}

export default function AdminReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<TranslationKey | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reasonAttempts, setReasonAttempts] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, Feedback | undefined>>({});
  const [saving, setSaving] = useState<{ reviewId: string; action: VisibilityAction } | null>(null);

  useEffect(() => {
    let active = true;
    setLoadState("loading");
    setLoadError(null);
    void reviewAction({ operation: "list" }).then((response) => {
      if (!Array.isArray(response.reviews)) throw new ReviewActionError("REVIEW_RESPONSE_INVALID");
      const loaded = response.reviews.map(reviewFromValue);
      const count = response.count;
      const serverHiddenCount = response.hidden_count;
      if (typeof count !== "number" || count !== loaded.length
        || typeof serverHiddenCount !== "number"
        || serverHiddenCount !== loaded.filter((review) => !review.is_visible).length) {
        throw new ReviewActionError("REVIEW_RESPONSE_INVALID");
      }
      if (!active) return;
      setReviews(loaded);
      setHiddenCount(serverHiddenCount);
      setLoadState("ready");
    }).catch((error) => {
      console.error("Parle administrator tutor review queue could not be loaded", error instanceof Error ? error.name : "unknown");
      if (!active) return;
      setLoadError(errorKey(error));
      setLoadState("error");
    });
    return () => { active = false; };
  }, [reloadCount]);

  async function hideReview(review: Review) {
    const reason = (reasons[review.id] ?? "").trim();
    setReasonAttempts((current) => ({ ...current, [review.id]: true }));
    setFeedback((current) => ({ ...current, [review.id]: undefined }));
    if (!reason) return;

    setSaving({ reviewId: review.id, action: "hide" });
    try {
      const response = await reviewAction({ operation: "hide", review_id: review.id, reason });
      if (!isObject(response.review) || response.review.id !== review.id || response.review.is_visible !== false || response.audit_status !== "written") {
        throw new ReviewActionError("REVIEW_RESPONSE_INVALID");
      }
      const updated = reviews.map((item) => item.id === review.id ? { ...item, is_visible: false } : item);
      setReviews(updated);
      setHiddenCount(updated.filter((item) => !item.is_visible).length);
      setEditingId(null);
      setReasons((current) => ({ ...current, [review.id]: "" }));
      setReasonAttempts((current) => ({ ...current, [review.id]: false }));
      setFeedback((current) => ({
        ...current,
        [review.id]: response.public_profile_state === "pending_refresh"
          ? { tone: "warning", key: "adminReviews.refreshPending" }
          : { tone: "success", key: "adminReviews.hideSuccess" },
      }));
    } catch (error) {
      console.error("Parle administrator tutor review hide action failed", error instanceof Error ? error.name : "unknown");
      const key = errorKey(error);
      if (key === "adminReviews.reasonRequired") setReasonAttempts((current) => ({ ...current, [review.id]: true }));
      setFeedback((current) => ({ ...current, [review.id]: { tone: "error", key } }));
    } finally {
      setSaving(null);
    }
  }

  async function restoreReview(review: Review) {
    setFeedback((current) => ({ ...current, [review.id]: undefined }));
    setSaving({ reviewId: review.id, action: "restore" });
    try {
      const response = await reviewAction({ operation: "restore", review_id: review.id });
      if (!isObject(response.review) || response.review.id !== review.id || response.review.is_visible !== true || response.audit_status !== "written") {
        throw new ReviewActionError("REVIEW_RESPONSE_INVALID");
      }
      const updated = reviews.map((item) => item.id === review.id ? { ...item, is_visible: true } : item);
      setReviews(updated);
      setHiddenCount(updated.filter((item) => !item.is_visible).length);
      setFeedback((current) => ({
        ...current,
        [review.id]: response.public_profile_state === "pending_refresh"
          ? { tone: "warning", key: "adminReviews.refreshPending" }
          : { tone: "success", key: "adminReviews.restoreSuccess" },
      }));
    } catch (error) {
      console.error("Parle administrator tutor review restore action failed", error instanceof Error ? error.name : "unknown");
      setFeedback((current) => ({ ...current, [review.id]: { tone: "error", key: errorKey(error) } }));
    } finally {
      setSaving(null);
    }
  }

  function submitHide(review: Review, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void hideReview(review);
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: "easeOut" }} className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-stretch">
        <div className="rounded-[1.65rem] border border-[#E4E8EF] bg-white p-5 shadow-[0_18px_48px_-42px_rgba(23,43,91,0.5)] sm:p-6 lg:p-7">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.17em] text-[#C64D43]">{t("adminReviews.eyebrow")}</p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#56647B] sm:text-[15px]">{t("adminReviews.intro")}</p>
          <div className="mt-5 flex items-start gap-2.5 border-t border-[#EDF0F4] pt-4 text-xs font-semibold leading-5 text-[#68758B]">
            <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFF1E8] text-[#A84A3F]"><ShieldCheck className="h-3.5 w-3.5" /></span>
            <span>{t("adminReviews.reasonPrivacy")}</span>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-[1.65rem] bg-[#1E3A8A] p-5 text-white shadow-[0_22px_52px_-38px_rgba(23,43,91,0.8)] sm:p-6">
          <span aria-hidden="true" className="absolute -right-8 -top-8 h-32 w-32 rounded-full border-[18px] border-white/[0.08]" />
          <span aria-hidden="true" className="absolute bottom-5 right-6 h-2.5 w-2.5 rounded-full bg-[#F97362] shadow-[0_0_0_7px_rgba(249,115,98,0.12)]" />
          <div className="relative flex h-full flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/75">{t("adminReviews.hiddenCountLabel")}</p>
              <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white"><EyeOff className="h-4 w-4" /></span>
            </div>
            <p aria-live="polite" className="mt-5 font-display text-5xl font-black leading-none tracking-[-0.06em] tabular-nums sm:text-6xl">{hiddenCount}</p>
            <p className="mt-3 text-xs font-medium leading-5 text-white/75">{t("adminReviews.hiddenCountHelp")}</p>
          </div>
        </div>
      </section>

      <section aria-label={t("adminReviews.queueLabel")} aria-busy={loadState === "loading"} className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <h2 className="font-display text-xl font-extrabold tracking-[-0.035em] text-[#1E3A8A]">{t("adminReviews.queueTitle")}</h2>
            {loadState === "ready" && <p className="mt-1 text-xs text-[#758198]">{t("adminReviews.queueCount", { count: reviews.length })}</p>}
          </div>
          {loadState === "ready" && reviews.length > 0 && (
            <button
              type="button"
              onClick={() => setReloadCount((count) => count + 1)}
              disabled={saving !== null}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-[#DCE2EC] bg-white px-3.5 text-xs font-bold text-[#4D5A71] transition hover:border-[#BBC6D8] hover:bg-[#F9FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2 disabled:opacity-60"
            >
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />{t("adminReviews.refresh")}
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {loadState === "loading" && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3" role="status" aria-live="polite">
              <div className="flex items-center gap-2 rounded-2xl border border-[#E3E8F0] bg-white px-4 py-3 text-xs font-semibold text-[#6C7890]"><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />{t("adminReviews.loading")}</div>
              <div aria-hidden="true" className="h-60 animate-pulse rounded-[1.65rem] border border-[#E3E8F0] bg-white" />
            </motion.div>
          )}
          {loadState === "error" && (
            <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="rounded-[1.65rem] border border-[#E8C8C4] bg-white p-6 sm:p-8">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0ED] text-[#9D4037]"><CircleAlert className="h-5 w-5" /></span>
                <div>
                  <h3 className="font-display text-lg font-extrabold text-[#1E3A8A]">{t("adminReviews.error.title")}</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#68758B]">{t(loadError ?? "adminReviews.error.load")}</p>
                  <button type="button" onClick={() => setReloadCount((count) => count + 1)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#1E3A8A] px-4 text-xs font-bold text-white transition hover:bg-[#172B5B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362] focus-visible:ring-offset-2"><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />{t("adminReviews.retry")}</button>
                </div>
              </div>
            </motion.div>
          )}
          {loadState === "ready" && reviews.length === 0 && (
            <motion.div key="empty" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-[1.65rem] border border-dashed border-[#CBD4E2] bg-white px-6 py-12 text-center sm:px-10">
              <span aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF2FA] text-[#1E3A8A]"><MessageSquare className="h-6 w-6" /></span>
              <h3 className="mt-4 font-display text-lg font-extrabold tracking-[-0.03em] text-[#1E3A8A]">{t("adminReviews.emptyTitle")}</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#69758B]">{t("adminReviews.emptyBody")}</p>
            </motion.div>
          )}
          {loadState === "ready" && reviews.length > 0 && (
            <motion.div key="reviews" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              {reviews.map((review, index) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  index={index}
                  editing={editingId === review.id && review.is_visible}
                  reason={reasons[review.id] ?? ""}
                  reasonAttempted={reasonAttempts[review.id] ?? false}
                  saving={saving}
                  feedback={feedback[review.id]}
                  onReasonChange={(value) => {
                    setReasons((current) => ({ ...current, [review.id]: value }));
                    if (value.trim()) setReasonAttempts((current) => ({ ...current, [review.id]: false }));
                    setFeedback((current) => ({ ...current, [review.id]: undefined }));
                  }}
                  onBeginHide={() => {
                    setEditingId(review.id);
                    setReasonAttempts((current) => ({ ...current, [review.id]: false }));
                    setFeedback((current) => ({ ...current, [review.id]: undefined }));
                  }}
                  onCancelHide={() => {
                    setEditingId(null);
                    setReasons((current) => ({ ...current, [review.id]: "" }));
                    setReasonAttempts((current) => ({ ...current, [review.id]: false }));
                  }}
                  onHideSubmit={(event) => submitHide(review, event)}
                  onReasonInvalid={() => setReasonAttempts((current) => ({ ...current, [review.id]: true }))}
                  onRestore={() => void restoreReview(review)}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </motion.div>
  );
}
