import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CalendarDays, CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import LessonBookingCard from "@/components/parle/LessonBookingCard";
import LearnerLessonActions from "@/components/parle/LearnerLessonActions";
import { returnBanner, formatClock, groupLearnerLessons, lessonErrorKey, lessonStatus, loadLearnerLessons, resumeCheckout, type ParleLesson } from "@/lib/parle-booking";
import { t, type TranslationKey } from "@/lib/i18n";

type Banner = "confirming" | "confirmed" | "refunded" | "stillConfirming" | "notFinished";
const BANNER_KEYS: Record<Banner, TranslationKey> = {
  confirming: "lessons.page.confirming", confirmed: "lessons.page.confirmed", refunded: "lessons.page.refunded", stillConfirming: "lessons.page.stillConfirming", notFinished: "lessons.page.notFinished",
};

export default function LearnerLessons() {
  const [params] = useSearchParams();
  const returnedBooking = params.get("booking") ?? "";
  const checkout = params.get("checkout") ?? "";
  const reviewId = params.get("review") ?? "";
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [lessons, setLessons] = useState<ParleLesson[]>([]);
  const [timeZone, setTimeZone] = useState("UTC");
  const [reload, setReload] = useState(0);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [resumeBusy, setResumeBusy] = useState("");
  const [resumeError, setResumeError] = useState<TranslationKey | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const result = await loadLearnerLessons();
      setLessons(result.lessons);
      setTimeZone(result.timeZone);
    } catch (error) {
      console.error("Learner lessons could not be loaded", error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, reload]);

  // Back from Stripe: only Stripe's payment event confirms, so wait for it here (spec section 4, step 4).
  useEffect(() => {
    if (!returnedBooking) return;
    if (checkout === "cancelled") { setBanner("notFinished"); return; }
    if (checkout !== "done") return;
    let active = true;
    setBanner("confirming");
    void (async () => {
      for (let attempt = 0; attempt < 20 && active; attempt += 1) {
        try {
          const lesson = await lessonStatus(returnedBooking);
          const shown = returnBanner(lesson); // A55: a refund for a time that could not be booked ends the wait too
          if (shown) {
            if (active) { setBanner(shown); setReload((value) => value + 1); }
            return;
          }
        } catch { /* keep waiting: the payment event may not have arrived yet */ }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      if (active) setBanner("stillConfirming");
    })();
    return () => { active = false; };
  }, [returnedBooking, checkout]);

  async function resume(id: string) {
    setResumeBusy(id);
    setResumeError(null);
    try {
      window.location.assign(await resumeCheckout(id));
    } catch (error) {
      setResumeError(lessonErrorKey(error instanceof Error ? error.message : ""));
      setResumeBusy("");
      setReload((value) => value + 1);
    }
  }

  const replace = (next: ParleLesson) => setLessons((current) => current.map((item) => (item.id === next.id ? next : item)));
  const { upcoming, past } = useMemo(() => groupLearnerLessons(lessons), [lessons]);

  if (loading) {
    return <div className="flex min-h-[300px] items-center justify-center rounded-[1.6rem] border border-primary/10 bg-white p-8" role="status" aria-live="polite"><div className="text-center"><LoaderCircle aria-hidden="true" className="mx-auto h-8 w-8 animate-spin text-primary" /><p className="mt-4 text-sm font-semibold text-muted-foreground">{t("learnerLessons.loading")}</p></div></div>;
  }
  if (loadError) {
    return <section className="rounded-[1.6rem] border border-[#F0C5C0] bg-white p-6 sm:p-8" role="alert"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><CircleAlert aria-hidden="true" className="h-5 w-5" /></span><h2 className="mt-4 font-display text-xl font-extrabold text-primary">{t("learnerLessons.errorTitle")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("learnerLessons.errorBody")}</p><button type="button" onClick={() => { setLoading(true); setReload((value) => value + 1); }} className="parle-button-primary mt-5 justify-center"><RefreshCw aria-hidden="true" className="h-4 w-4" />{t("learnerLessons.retry")}</button></section>;
  }

  const card = (lesson: ParleLesson) => (
    <LessonBookingCard key={lesson.id} booking={lesson} timeZone={timeZone}>
      {lesson.status === "pending_payment" && lesson.hold_expires_at && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#FFF8E9] px-3 py-2.5 text-xs leading-5 text-[#805916]">
        <span>{t("lessons.holdUntil", { time: formatClock(lesson.hold_expires_at, timeZone) })}</span>
        <button type="button" disabled={resumeBusy === lesson.id} onClick={() => void resume(lesson.id)} className="inline-flex min-h-9 items-center gap-2 rounded-full bg-primary px-3.5 text-xs font-extrabold text-white disabled:opacity-55">{resumeBusy === lesson.id && <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}{t("lessons.returnToPayment")}</button>
      </div>}
      <LearnerLessonActions lesson={lesson} timeZone={timeZone} onChanged={replace} startInReview={lesson.id === reviewId} />
    </LessonBookingCard>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }} className="space-y-5">
      <section className="relative overflow-hidden rounded-[1.6rem] bg-primary px-5 py-6 text-white shadow-[0_24px_58px_-42px_rgba(30,58,138,0.7)] sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute -right-10 -top-12 h-44 w-44 rounded-full border-[20px] border-white/5" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#FFC0B4]">{t("learnerLessons.eyebrow")}</p><p className="mt-2 max-w-2xl text-sm leading-6 text-white/85">{t("lessons.page.intro")}</p></div>
          <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white sm:self-auto"><CalendarDays aria-hidden="true" className="h-4 w-4 text-[#FFC0B4]" />{t("learnerLessons.timeZone").replace("{zone}", timeZone)}</span>
        </div>
      </section>
      {banner && <p role="status" aria-live="polite" className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm leading-6 ${banner === "confirmed" ? "border-[#B9D9CB] bg-[#F1F8F4] text-[#236646]" : "border-[#F1D9A9] bg-[#FFF8E9] text-[#805916]"}`}>{banner === "confirming" && <LoaderCircle aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 animate-spin" />}{t(BANNER_KEYS[banner])}</p>}
      {resumeError && <p role="alert" className="rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-4 py-3 text-sm leading-6 text-[#8D342D]">{t(resumeError)}</p>}
      <Link to="/help/cancellations-refunds" className="inline-block text-xs font-bold text-primary underline underline-offset-2">{t("lessons.policyLink")}</Link>

      {lessons.length === 0 ? (
        <section className="rounded-[1.5rem] border border-dashed border-primary/20 bg-white px-5 py-8 text-center sm:px-8"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary"><CalendarDays aria-hidden="true" className="h-6 w-6" /></span><h2 className="mt-4 font-display text-xl font-extrabold text-primary">{t("lessons.page.emptyTitle")}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{t("lessons.page.emptyBody")}</p><Link to="/learner/tutors" className="parle-button-primary mt-5 justify-center"><span>{t("learnerLessons.findTutor")}</span><ArrowRight aria-hidden="true" className="h-4 w-4" /></Link></section>
      ) : (
        <div className="space-y-7">
          <section aria-labelledby="learner-upcoming-lessons">
            <h2 id="learner-upcoming-lessons" className="mb-3 font-display text-xl font-extrabold text-primary">{t("lessons.page.upcoming")}</h2>
            {upcoming.length ? <div className="grid gap-3 lg:grid-cols-2">{upcoming.map(card)}</div> : <p className="rounded-2xl border border-dashed border-primary/15 bg-white p-4 text-sm leading-6 text-muted-foreground">{t("lessons.page.noUpcoming")}</p>}
          </section>
          {past.length > 0 && <section aria-labelledby="learner-past-lessons"><h2 id="learner-past-lessons" className="mb-3 font-display text-xl font-extrabold text-primary">{t("lessons.page.past")}</h2><div className="grid gap-3 lg:grid-cols-2">{past.map(card)}</div></section>}
        </div>
      )}
    </motion.div>
  );
}
