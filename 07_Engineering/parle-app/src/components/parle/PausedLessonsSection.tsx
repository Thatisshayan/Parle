import { useEffect, useState } from "react";
import { formatClock, formatLocalDateLabel, formatCadCents } from "@/lib/parle-booking";
import { loadPausedLessons, type PausedLesson } from "@/lib/parle-admin";
import { t } from "@/lib/i18n";

/** Spec 3.2: when a pause kept the lessons, the admin Bookings page lists them. */
export default function PausedLessonsSection() {
  const [lessons, setLessons] = useState<PausedLesson[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { void loadPausedLessons().then(setLessons, () => setError(true)); }, []);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return (
    <section aria-labelledby="admin-paused-lessons">
      <h2 id="admin-paused-lessons" className="mb-3 font-display text-xl font-extrabold text-primary">{t("adminBookings.pausedHeading")}</h2>
      {error ? <p role="alert" className="text-sm text-[#8D342D]">{t("adminBookings.pausedError")}</p>
        : lessons === null ? null
        : lessons.length === 0 ? <p className="rounded-2xl border border-dashed border-primary/15 bg-white p-4 text-sm text-muted-foreground">{t("adminBookings.pausedNone")}</p>
        : (
          <ul className="space-y-2">{lessons.map((l) => (
            <li key={l.id} className="min-w-0 rounded-[1.25rem] border border-primary/10 bg-white p-4">
              <p className="text-sm font-extrabold text-primary">{t(l.paused_party === "learner" ? "adminBookings.pausedLearner" : "adminBookings.pausedTutor")}</p>
              <p className="mt-1 break-words text-xs leading-5">{t("adminBookings.lessonLine", { tutor: l.tutor_name, learner: l.learner_name, time: `${formatLocalDateLabel(l.start_at, zone)}, ${formatClock(l.start_at, zone)}`, price: formatCadCents(l.price_cents) })}</p>
            </li>
          ))}</ul>
        )}
    </section>
  );
}
