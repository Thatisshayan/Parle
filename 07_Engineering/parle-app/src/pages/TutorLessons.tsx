import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CalendarDays, CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import LessonBookingCard from "@/components/parle/LessonBookingCard";
import TutorLessonActions from "@/components/parle/TutorLessonActions";
import { groupTutorLessons, loadTutorLessons, type ParleLesson } from "@/lib/parle-booking";
import { t, type TranslationKey } from "@/lib/i18n";

export default function TutorLessons() {
  const [params] = useSearchParams();
  const focusId = params.get("lesson") ?? "";
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [lessons, setLessons] = useState<ParleLesson[]>([]);
  const [timeZone, setTimeZone] = useState("UTC");
  const [reload, setReload] = useState(0);
  const load = useCallback(async () => {
    setState("loading");
    try {
      const result = await loadTutorLessons();
      setLessons(result.lessons);
      setTimeZone(result.timeZone);
      setState("ready");
    } catch (error) {
      console.error("Tutor lessons could not be loaded", error);
      setState("error");
    }
  }, []);
  useEffect(() => { void load(); }, [load, reload]);
  const groups = useMemo(() => groupTutorLessons(lessons), [lessons]);
  const replace = (next: ParleLesson) => setLessons((current) => current.map((item) => (item.id === next.id ? next : item)));

  if (state === "loading") return <div className="flex min-h-[300px] items-center justify-center rounded-[1.6rem] border border-primary/10 bg-white p-8" role="status" aria-live="polite"><LoaderCircle aria-hidden="true" className="h-8 w-8 animate-spin text-primary" /><span className="sr-only">{t("tutorLessons.loading")}</span></div>;
  if (state === "error") return <section role="alert" className="rounded-[1.6rem] border border-[#F0C5C0] bg-white p-6"><p className="flex items-start gap-2 text-sm leading-6 text-[#8D342D]"><CircleAlert aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />{t("tutorLessons.error")}</p><button type="button" onClick={() => setReload((value) => value + 1)} className="parle-button-primary mt-4 justify-center"><RefreshCw aria-hidden="true" className="h-4 w-4" />{t("tutorDashboard.retry")}</button></section>;

  const sections: Array<[string, TranslationKey, TranslationKey, ParleLesson[]]> = [
    ["upcoming", "tutorLessons.upcoming", "tutorLessons.noUpcoming", groups.upcoming],
    ["todo", "tutorLessons.toDo", "tutorLessons.noToDo", groups.toDo],
    ["past", "tutorLessons.past", "tutorLessons.noPast", groups.past],
    ["cancelled", "tutorLessons.cancelled", "tutorLessons.noCancelled", groups.cancelled],
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }} className="space-y-6">
      <section className="flex flex-col gap-3 rounded-[1.6rem] bg-primary px-5 py-6 text-white sm:flex-row sm:items-end sm:justify-between sm:px-7">
        <p className="max-w-2xl text-sm leading-6 text-white/85">{t("tutorLessons.intro")}</p>
        <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold"><CalendarDays aria-hidden="true" className="h-4 w-4 text-[#FFC0B4]" />{t("learnerLessons.timeZone").replace("{zone}", timeZone)}</span>
      </section>
      {sections.map(([id, heading, empty, list]) => (
        <section key={id} aria-labelledby={`tutor-lessons-${id}`}>
          <h2 id={`tutor-lessons-${id}`} className="mb-3 font-display text-xl font-extrabold text-primary">{t(heading)}</h2>
          {list.length ? <div className="grid gap-3 xl:grid-cols-2">{list.map((lesson) => <LessonBookingCard key={lesson.id} booking={lesson} timeZone={timeZone} audience="tutor"><TutorLessonActions lesson={lesson} onChanged={replace} openBrief={lesson.id === focusId} /></LessonBookingCard>)}</div>
            : <p className="rounded-2xl border border-dashed border-primary/15 bg-white p-4 text-sm leading-6 text-muted-foreground">{t(empty)}</p>}
        </section>
      ))}
    </motion.div>
  );
}
