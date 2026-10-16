import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, CircleAlert, Flag, LoaderCircle, Star, XCircle } from "lucide-react";
import { t, type TranslationKey } from "@/lib/i18n";
import {
  cancelLesson, formatLessonTime, formatUsdCents, lessonErrorKey, lessonStatus, reportProblem, rescheduleLesson,
  rescheduleOptions, submitReview, type ParleLesson,
} from "@/lib/parle-booking";

type Mode = "none" | "cancel" | "reschedule" | "report" | "review";
type ReportKind = "tutor_no_show" | "no_show_dispute" | "other";
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-primary/15 bg-white px-4 text-xs font-extrabold text-primary transition hover:bg-[#F2F4F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait disabled:opacity-55";
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-xs font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait disabled:opacity-55";
const field = "mt-1.5 min-h-11 w-full rounded-xl border border-primary/15 bg-white px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";
const REPORT_LABELS: Record<ReportKind, TranslationKey> = { tutor_no_show: "lessons.report.tutorNoShow", no_show_dispute: "lessons.report.noShowDispute", other: "lessons.report.other" };

/** Cancel (with the money outcome shown first), move once, report a problem, review: each decided by the server. */
export default function LearnerLessonActions({ lesson, timeZone, onChanged, startInReview = false }: {
  lesson: ParleLesson; timeZone: string; onChanged: (next: ParleLesson) => void; startInReview?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(startInReview && lesson.can_review ? "review" : "none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [notice, setNotice] = useState<TranslationKey | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState("");
  const kinds: ReportKind[] = lesson.status === "learner_no_show" ? ["no_show_dispute", "other"] : ["tutor_no_show", "other"];
  const [kind, setKind] = useState<ReportKind>(kinds[0]);
  const [details, setDetails] = useState("");
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");

  async function run(action: () => Promise<ParleLesson>, done: TranslationKey) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      onChanged(await action());
      setMode("none");
      setNotice(done);
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : "REQUEST_FAILED";
      setError(lessonErrorKey(code));
      // the refund changed while the screen was open (Review Focus 3): show the new outcome
      if (code === "CANCEL_TERMS_CHANGED") {
        try { onChanged(await lessonStatus(lesson.id)); } catch { /* the message above stays */ }
      }
    } finally {
      setBusy(false);
    }
  }

  async function openReschedule() {
    setMode("reschedule");
    setSlots(null);
    setError(null);
    try {
      const next = await rescheduleOptions(lesson.id);
      setSlots(next);
      setChosen(next[0] ?? "");
    } catch (failure) {
      setError(lessonErrorKey(failure instanceof Error ? failure.message : ""));
      setSlots([]);
    }
  }

  const anything = lesson.can_cancel || lesson.can_reschedule || lesson.can_report || lesson.can_review;
  if (!anything && !notice && !error && lesson.review_stars === null) return null;
  const slotLabel = (start: string) => formatLessonTime(start, new Date(Date.parse(start) + lesson.minutes * 60_000).toISOString(), timeZone);
  const close = <button type="button" className={secondary} disabled={busy} onClick={() => setMode("none")}>{t("lessons.action.close")}</button>;

  return (
    <div className="mt-4 border-t border-primary/10 pt-3">
      {lesson.review_stars !== null && <p className="mb-2 text-xs font-bold text-[#805916]">{t("lessons.review.yours", { stars: lesson.review_stars })}</p>}
      {mode === "none" && anything && <div className="flex flex-wrap gap-2">
        {lesson.can_reschedule && <button type="button" className={secondary} disabled={busy} onClick={() => void openReschedule()}><CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />{t("lessons.action.reschedule")}</button>}
        {lesson.can_cancel && <button type="button" className={secondary} disabled={busy} onClick={() => { setMode("cancel"); setError(null); }}><XCircle aria-hidden="true" className="h-3.5 w-3.5" />{t("lessons.action.cancel")}</button>}
        {lesson.can_review && <button type="button" className={primary} disabled={busy} onClick={() => { setMode("review"); setError(null); }}><Star aria-hidden="true" className="h-3.5 w-3.5" />{t("lessons.action.review")}</button>}
        {lesson.can_report && <button type="button" className={secondary} disabled={busy} onClick={() => { setMode("report"); setError(null); }}><Flag aria-hidden="true" className="h-3.5 w-3.5" />{t("lessons.action.report")}</button>}
      </div>}

      {mode === "cancel" && <div className="space-y-3">
        <p className="text-sm leading-6 text-foreground">{lesson.cancel_refund_cents > 0 ? t("lessons.cancel.fullRefund", { amount: formatUsdCents(lesson.cancel_refund_cents) }) : t("lessons.cancel.noRefund")}</p>
        <Link to="/help/cancellations-refunds" className="inline-block text-xs font-bold text-primary underline underline-offset-2">{t("lessons.policyLink")}</Link>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primary} disabled={busy} onClick={() => void run(async () => (await cancelLesson(lesson.id, lesson.cancel_refund_cents)).lesson, "lessons.cancel.done")}>{busy && <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}{t("lessons.cancel.confirm")}</button>
          {close}
        </div>
      </div>}

      {mode === "reschedule" && <div className="space-y-3">
        <p className="text-sm leading-6 text-foreground">{t("lessons.reschedule.intro")}</p>
        {slots === null
          ? <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />{t("common.loading")}</p>
          : slots.length === 0
            ? <p className="text-xs leading-5 text-muted-foreground">{t("lessons.reschedule.none")}</p>
            : <label className="block text-xs font-bold text-foreground">{t("lessons.reschedule.choose")}<select className={field} value={chosen} onChange={(event) => setChosen(event.target.value)}>{slots.map((slot) => <option key={slot} value={slot}>{slotLabel(slot)}</option>)}</select></label>}
        <div className="flex flex-wrap gap-2">
          {slots !== null && slots.length > 0 && <button type="button" className={primary} disabled={busy || !chosen} onClick={() => void run(() => rescheduleLesson(lesson.id, chosen), "lessons.reschedule.done")}>{t("lessons.reschedule.confirm")}</button>}
          {close}
        </div>
      </div>}

      {mode === "report" && <div className="space-y-3">
        <p className="text-sm leading-6 text-foreground">{t("lessons.report.intro")}</p>
        <fieldset className="space-y-2">{kinds.map((value) => <label key={value} className="flex items-center gap-2 text-sm text-foreground"><input type="radio" name={`report-${lesson.id}`} checked={kind === value} onChange={() => setKind(value)} className="h-4 w-4 accent-primary" />{t(REPORT_LABELS[value])}</label>)}</fieldset>
        <label className="block text-xs font-bold text-foreground">{t("lessons.report.details")}<textarea className={`${field} min-h-20 py-2`} maxLength={2000} value={details} onChange={(event) => setDetails(event.target.value)} /></label>
        <div className="flex flex-wrap gap-2"><button type="button" className={primary} disabled={busy} onClick={() => void run(() => reportProblem(lesson.id, kind, details), "lessons.report.done")}>{t("lessons.report.submit")}</button>{close}</div>
      </div>}

      {mode === "review" && <div className="space-y-3">
        <p className="text-sm leading-6 text-foreground">{t("lessons.review.intro")}</p>
        <label className="block text-xs font-bold text-foreground">{t("lessons.review.stars")}<select className={field} value={stars} onChange={(event) => setStars(Number(event.target.value))}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{`${"★".repeat(value)} (${value})`}</option>)}</select></label>
        <label className="block text-xs font-bold text-foreground">{t("lessons.review.comment")}<textarea className={`${field} min-h-20 py-2`} maxLength={700} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
        <div className="flex flex-wrap gap-2"><button type="button" className={primary} disabled={busy} onClick={() => void run(() => submitReview(lesson.id, stars, comment), "lessons.review.done")}>{t("lessons.review.submit")}</button>{close}</div>
      </div>}

      {error && <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-3 py-2.5 text-xs leading-5 text-[#8D342D]"><CircleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t(error)}</p>}
      {notice && <p role="status" className="mt-3 rounded-xl border border-[#B9D9CB] bg-[#F1F8F4] px-3 py-2.5 text-xs leading-5 text-[#236646]">{t(notice)}</p>}
    </div>
  );
}
