import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  Check,
  CircleAlert,
  LoaderCircle,
  MessageSquareReply,
  RefreshCw,
  Send,
  Star,
  UserRound,
} from "lucide-react";
import { parleMarketplaceService } from "@/functions";
import { t, type TranslationKey } from "@/lib/i18n";

type ReviewReplyState = "available" | "pending" | "published";
type ReplyReview = {
  id: string;
  stars: number;
  comment: string;
  is_test_review: boolean;
  learner_label: string;
  tutor_reply: string;
  pending_reply: string;
  reply_state: ReviewReplyState;
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

function safeReview(value: unknown): ReplyReview | null {
  if (!isObject(value) || typeof value.id !== "string" || !Number.isInteger(value.stars) || Number(value.stars) < 1 || Number(value.stars) > 5) return null;
  const replyState: ReviewReplyState = value.reply_state === "published" || value.reply_state === "pending" ? value.reply_state : "available";
  return {
    id: value.id,
    stars: Number(value.stars),
    comment: typeof value.comment === "string" ? value.comment : "",
    is_test_review: value.is_test_review === true,
    learner_label: typeof value.learner_label === "string" ? value.learner_label : "",
    tutor_reply: typeof value.tutor_reply === "string" ? value.tutor_reply : "",
    pending_reply: typeof value.pending_reply === "string" ? value.pending_reply : "",
    reply_state: replyState,
  };
}

function errorKey(code: string): TranslationKey {
  const keys: Record<string, TranslationKey> = {
    REPLY_ALREADY_SUBMITTED: "tutorReviews.error.alreadySubmitted",
    REVIEW_NOT_FOUND: "tutorReviews.error.reviewMissing",
    REVIEW_NOT_AVAILABLE: "tutorReviews.error.unavailable",
    REPLY_INVALID: "tutorReviews.error.invalidReply",
    REPLY_SAVE_FAILED: "tutorReviews.error.save",
    TUTOR_REQUIRED: "tutorReviews.error.access",
  };
  return keys[code] ?? "tutorReviews.error.generic";
}

function StarRating({ stars }: { stars: number }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF8E9] px-2.5 py-1.5 text-xs font-extrabold text-[#805916]" aria-label={t("tutorReviews.starsLabel").replace("{stars}", String(stars))}>
    <Star aria-hidden="true" className="h-3.5 w-3.5 fill-current" />{stars}/5
  </span>;
}

export default function TutorReviews() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [reviews, setReviews] = useState<ReplyReview[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyReviewId, setBusyReviewId] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<TranslationKey | null>(null);
  const [notice, setNotice] = useState<TranslationKey | null>(null);

  const loadReviews = useCallback(async () => {
    setStatus("loading");
    setErrorNotice(null);
    try {
      const result = await marketplace("tutor_list_reviews_to_reply");
      const rows = Array.isArray(result.reviews) ? result.reviews.map(safeReview).filter((item): item is ReplyReview => item !== null) : [];
      setReviews(rows);
      setStatus("ready");
    } catch (error) {
      console.error("Tutor review replies could not be loaded", error instanceof Error ? error.name : "unknown");
      setStatus("error");
    }
  }, []);

  useEffect(() => { void loadReviews(); }, [loadReviews]);

  async function submitReply(event: FormEvent<HTMLFormElement>, reviewId: string) {
    event.preventDefault();
    if (busyReviewId) return;
    const reply = (drafts[reviewId] ?? "").trim();
    if (reply.length < 2 || reply.length > 1200) {
      setErrorNotice("tutorReviews.error.invalidReply");
      return;
    }
    setBusyReviewId(reviewId);
    setErrorNotice(null);
    setNotice(null);
    try {
      await marketplace("tutor_submit_review_reply", { review_id: reviewId, reply_text: reply });
      setReviews((current) => current.map((item) => item.id === reviewId
        ? { ...item, pending_reply: reply, reply_state: "pending" }
        : item));
      setDrafts((current) => { const next = { ...current }; delete next[reviewId]; return next; });
      setNotice("tutorReviews.replySaved");
    } catch (error) {
      console.error("Tutor review reply could not be saved", error instanceof Error ? error.name : "unknown");
      const code = error instanceof Error ? error.message : isObject(error) && typeof error.code === "string" ? error.code : "";
      setErrorNotice(errorKey(code));
    } finally {
      setBusyReviewId(null);
    }
  }

  if (status === "loading") {
    return <div className="flex min-h-[320px] items-center justify-center rounded-[1.7rem] border border-primary/10 bg-white p-8" role="status" aria-live="polite"><div className="text-center"><LoaderCircle aria-hidden="true" className="mx-auto h-8 w-8 animate-spin text-primary" /><p className="mt-4 text-sm font-semibold text-muted-foreground">{t("tutorReviews.loading")}</p></div></div>;
  }
  if (status === "error") {
    return <section className="rounded-[1.7rem] border border-[#F0C5C0] bg-white p-6 sm:p-8" role="alert"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><CircleAlert aria-hidden="true" className="h-5 w-5" /></span><h2 className="mt-4 font-display text-xl font-extrabold text-primary">{t("tutorReviews.loadErrorTitle")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("tutorReviews.loadErrorBody")}</p><button type="button" onClick={() => void loadReviews()} className="parle-button-primary mt-5 justify-center"><RefreshCw aria-hidden="true" className="h-4 w-4" />{t("tutorReviews.retry")}</button></section>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }} className="min-w-0 space-y-5">
      <section className="relative overflow-hidden rounded-[1.7rem] bg-primary px-5 py-6 text-white shadow-[0_26px_70px_-42px_rgba(30,58,138,0.72)] sm:px-7 sm:py-8">
        <div aria-hidden="true" className="absolute -right-12 -top-16 h-48 w-48 rounded-full border-[22px] border-white/5" />
        <div className="relative flex max-w-3xl items-start gap-3.5"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#FFC0B4]"><MessageSquareReply aria-hidden="true" className="h-5 w-5" /></span><div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#FFC0B4]">{t("tutorReviews.eyebrow")}</p><h2 className="mt-2 font-display text-2xl font-extrabold leading-tight tracking-[-0.045em] sm:text-3xl">{t("tutorReviews.heading")}</h2><p className="mt-3 text-sm leading-6 text-white/80">{t("tutorReviews.intro")}</p></div></div>
      </section>

      <div className="rounded-[1.25rem] border border-[#C9D7EE] bg-[#F5F8FD] px-4 py-3.5 text-xs leading-5 text-primary">{t("tutorReviews.demoNote")}</div>
      {reviews.length === 0 ? (
        <section className="rounded-[1.5rem] border border-dashed border-primary/20 bg-white p-6 text-center sm:p-8"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary"><UserRound aria-hidden="true" className="h-6 w-6" /></span><h3 className="mt-4 font-display text-lg font-extrabold text-primary">{t("tutorReviews.emptyTitle")}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t("tutorReviews.emptyBody")}</p></section>
      ) : (
        <div className="space-y-3.5">{reviews.map((review) => {
          const isBusy = busyReviewId === review.id;
          return <motion.article layout key={review.id} className="min-w-0 rounded-[1.5rem] border border-primary/10 bg-white p-4 shadow-[0_18px_48px_-42px_rgba(30,58,138,0.5)] sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-primary/10 pb-4">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-base font-extrabold text-primary">{review.is_test_review ? t("tutorReviews.demoLearner") : review.learner_label || t("tutorReviews.learner")}</h3>{review.is_test_review && <span className="rounded-full bg-[#FFF0EC] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#8D342D]">{t("tutorReviews.testReview")}</span>}</div><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{t("tutorReviews.replyOnce")}</p></div>
              <StarRating stars={review.stars} />
            </div>
            {review.comment && <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{review.comment}</p>}

            {review.reply_state === "published" && review.tutor_reply && <div className="mt-4 rounded-xl border-l-2 border-[#236646] bg-[#F1F8F4] px-3.5 py-3"><p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#205D45]"><Check aria-hidden="true" className="h-3.5 w-3.5" />{t("tutorReviews.replyPublished")}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{review.tutor_reply}</p></div>}

            {review.reply_state === "pending" && <div className="mt-4 rounded-xl border-l-2 border-[#F97362] bg-[#FFF8F6] px-3.5 py-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#A13F36]">{t("tutorReviews.replyPending")}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{review.pending_reply}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{t("tutorReviews.replyPublicationNote")}</p></div>}

            {review.reply_state === "available" && <form onSubmit={(event) => void submitReply(event, review.id)} className="mt-4 space-y-3">
              <label htmlFor={`reply-${review.id}`} className="block text-xs font-extrabold text-primary">{t("tutorReviews.replyLabel")}</label>
              <textarea id={`reply-${review.id}`} name="reply" rows={4} required minLength={2} maxLength={1200} value={drafts[review.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [review.id]: event.target.value.slice(0, 1200) }))} placeholder={t("tutorReviews.replyPlaceholder")} className="w-full min-w-0 resize-y rounded-xl border border-primary/15 bg-[#FFFEFC] px-3.5 py-3 text-sm leading-6 text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-[#F97362]/30" />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-[11px] leading-5 text-muted-foreground">{t("tutorReviews.replyLimit").replace("{count}", String((drafts[review.id] ?? "").length))}</p><button type="submit" disabled={Boolean(busyReviewId) || (drafts[review.id] ?? "").trim().length < 2} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-xs font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait disabled:opacity-55 sm:w-auto">{isBusy ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Send aria-hidden="true" className="h-3.5 w-3.5" />}{t(isBusy ? "tutorReviews.savingReply" : "tutorReviews.sendReply")}</button></div>
            </form>}
          </motion.article>;
        })}</div>
      )}
      {errorNotice && <p role="alert" className="flex items-start gap-2 rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-4 py-3 text-sm leading-6 text-[#8D342D]"><CircleAlert aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />{t(errorNotice)}</p>}
      {notice && <p role="status" className="flex items-start gap-2 rounded-xl border border-[#B9D9CB] bg-[#F1F8F4] px-4 py-3 text-sm leading-6 text-[#236646]"><Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />{t(notice)}</p>}
    </motion.div>
  );
}
