import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CalendarDays, CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import LessonBookingCard from "@/components/parle/LessonBookingCard";
import { loadLearnerBookings, type ParleBooking } from "@/lib/parle-booking";
import { t } from "@/lib/i18n";

export default function LearnerLessons() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [bookings, setBookings] = useState<ParleBooking[]>([]);
  const [timeZone, setTimeZone] = useState("UTC");
  const [reload, setReload] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const result = await loadLearnerBookings();
      setBookings(result.bookings);
      setTimeZone(result.timeZone);
    } catch (error) {
      console.error("Learner lesson requests could not be loaded", error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, reload]);

  const { upcoming, history } = useMemo(() => {
    const now = Date.now();
    const upcoming: ParleBooking[] = [];
    const history: ParleBooking[] = [];
    for (const booking of bookings) {
      if (booking.status === "requested" || (booking.status === "confirmed" && Date.parse(booking.start_time_utc) >= now)) upcoming.push(booking);
      else history.push(booking);
    }
    upcoming.sort((left, right) => Date.parse(left.start_time_utc) - Date.parse(right.start_time_utc));
    history.sort((left, right) => Date.parse(right.start_time_utc) - Date.parse(left.start_time_utc));
    return { upcoming, history };
  }, [bookings]);
  const pendingCount = bookings.filter((booking) => booking.status === "requested").length;

  if (loading) {
    return <div className="flex min-h-[300px] items-center justify-center rounded-[1.6rem] border border-primary/10 bg-white p-8" role="status" aria-live="polite"><div className="text-center"><LoaderCircle aria-hidden="true" className="mx-auto h-8 w-8 animate-spin text-primary" /><p className="mt-4 text-sm font-semibold text-muted-foreground">{t("learnerLessons.loading")}</p></div></div>;
  }

  if (loadError) {
    return <section className="rounded-[1.6rem] border border-[#F0C5C0] bg-white p-6 sm:p-8" role="alert"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#A13F36]"><CircleAlert aria-hidden="true" className="h-5 w-5" /></span><h2 className="mt-4 font-display text-xl font-extrabold text-primary">{t("learnerLessons.errorTitle")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("learnerLessons.errorBody")}</p><button type="button" onClick={() => setReload((value) => value + 1)} className="parle-button-primary mt-5 justify-center"><RefreshCw aria-hidden="true" className="h-4 w-4" />{t("learnerLessons.retry")}</button></section>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }} className="space-y-5">
      <section className="relative overflow-hidden rounded-[1.6rem] bg-primary px-5 py-6 text-white shadow-[0_24px_58px_-42px_rgba(30,58,138,0.7)] sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute -right-10 -top-12 h-44 w-44 rounded-full border-[20px] border-white/5" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#FFC0B4]">{t("learnerLessons.eyebrow")}</p><p className="mt-2 max-w-2xl text-sm leading-6 text-white/85">{t("learnerLessons.intro")}</p></div>
          <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white sm:self-auto"><CalendarDays aria-hidden="true" className="h-4 w-4 text-[#FFC0B4]" />{t("learnerLessons.timeZone").replace("{zone}", timeZone)}</span>
        </div>
      </section>
      <p className="rounded-xl border border-[#C9D7EE] bg-[#F5F8FD] px-4 py-3 text-xs leading-5 text-primary">{t("learnerLessons.demoNote")}</p>

      {bookings.length === 0 ? (
        <section className="rounded-[1.5rem] border border-dashed border-primary/20 bg-white px-5 py-8 text-center sm:px-8"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary"><CalendarDays aria-hidden="true" className="h-6 w-6" /></span><h2 className="mt-4 font-display text-xl font-extrabold text-primary">{t("learnerLessons.emptyTitle")}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{t("learnerLessons.emptyBody")}</p><Link to="/learner/tutors" className="parle-button-primary mt-5 justify-center"><span>{t("learnerLessons.findTutor")}</span><ArrowRight aria-hidden="true" className="h-4 w-4" /></Link></section>
      ) : (
        <div className="space-y-7">
          <section aria-labelledby="learner-upcoming-lessons">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#C64D43]">{t("learnerLessons.eyebrow")}</p><h2 id="learner-upcoming-lessons" className="mt-1 font-display text-xl font-extrabold text-primary">{t("learnerLessons.upcomingHeading")}</h2></div>{pendingCount > 0 && <span className="rounded-full bg-[#FFF8E9] px-3 py-1.5 text-xs font-extrabold text-[#805916]">{t("learnerLessons.pendingCount").replace("{count}", String(pendingCount))}</span>}</div>
            {upcoming.length ? <div className="grid gap-3 lg:grid-cols-2">{upcoming.map((booking) => <LessonBookingCard key={booking.id} booking={booking} timeZone={timeZone} />)}</div> : <p className="rounded-2xl border border-dashed border-primary/15 bg-white p-4 text-sm leading-6 text-muted-foreground">{t("learnerLessons.noUpcoming")}</p>}
          </section>
          {history.length > 0 && <section aria-labelledby="learner-lesson-history"><h2 id="learner-lesson-history" className="mb-3 font-display text-xl font-extrabold text-primary">{t("learnerLessons.historyHeading")}</h2><div className="grid gap-3 lg:grid-cols-2">{history.map((booking) => <LessonBookingCard key={booking.id} booking={booking} timeZone={timeZone} />)}</div></section>}
        </div>
      )}
    </motion.div>
  );
}
