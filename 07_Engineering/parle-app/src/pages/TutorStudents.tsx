import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CircleAlert, LoaderCircle, UserRound } from "lucide-react";
import { formatLocalDateLabel, LESSON_SKILLS, loadTutorStudents, type TutorStudent } from "@/lib/parle-booking";
import { t, type TranslationKey } from "@/lib/i18n";

const SKILL_KEYS: Record<string, TranslationKey> = { listening: "learner.skill.listening", reading: "learner.skill.reading", writing: "learner.skill.writing", speaking: "learner.skill.speaking" };
const LEVEL_KEYS: Record<string, TranslationKey> = { struggling: "lessons.skillLevel.struggling", ok: "lessons.skillLevel.ok", strong: "lessons.skillLevel.strong" };

export default function TutorStudents() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [students, setStudents] = useState<TutorStudent[]>([]);
  const [timeZone, setTimeZone] = useState("UTC");
  useEffect(() => {
    void (async () => {
      try {
        const result = await loadTutorStudents();
        setStudents(result.students);
        setTimeZone(result.timeZone);
        setState("ready");
      } catch (error) {
        console.error("Tutor students could not be loaded", error);
        setState("error");
      }
    })();
  }, []);
  if (state === "loading") return <div className="flex min-h-[240px] items-center justify-center" role="status"><LoaderCircle aria-hidden="true" className="h-8 w-8 animate-spin text-primary" /></div>;
  if (state === "error") return <p role="alert" className="flex items-start gap-2 rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-4 py-3 text-sm text-[#8D342D]"><CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4" />{t("tutorLessons.error")}</p>;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }} className="space-y-5">
      <p className="text-sm leading-6 text-muted-foreground">{t("tutorStudents.intro")}</p>
      {students.length === 0 ? <p className="rounded-2xl border border-dashed border-primary/15 bg-white p-5 text-sm leading-6 text-muted-foreground">{t("tutorStudents.empty")}</p> : (
        <div className="grid gap-3 lg:grid-cols-2">{students.map((s) => (
          <article key={s.learner_id} className="min-w-0 rounded-[1.25rem] border border-primary/10 bg-white p-4 sm:p-5">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF2FA] text-primary"><UserRound aria-hidden="true" className="h-5 w-5" /></span><div className="min-w-0"><h3 className="break-words font-display text-base font-extrabold text-primary">{s.name}</h3><p className="text-xs text-muted-foreground">{t("tutorStudents.lessons", { count: s.lessons })}</p></div></div>
            <div className="mt-3 space-y-1 text-xs leading-5 text-foreground">
              {s.last_lesson_at && <p>{t("tutorStudents.last", { date: formatLocalDateLabel(s.last_lesson_at, timeZone) })}</p>}
              {s.next_lesson_at && <p>{t("tutorStudents.next", { date: formatLocalDateLabel(s.next_lesson_at, timeZone) })}</p>}
            </div>
            {s.latest_notes && <div className="mt-3 rounded-xl bg-[#FAF9F5] p-3 text-xs leading-5"><p className="font-extrabold text-primary">{t("tutorStudents.latestNotes", { date: s.latest_notes.date })}</p><p className="mt-1">{LESSON_SKILLS.filter((skill) => s.latest_notes?.skills[skill]).map((skill) => `${t(SKILL_KEYS[skill])}: ${t(LEVEL_KEYS[s.latest_notes!.skills[skill] as string])}`).join(" · ")}</p>{s.latest_notes.notes && <p className="mt-1 whitespace-pre-wrap break-words">{s.latest_notes.notes}</p>}</div>}
          </article>
        ))}</div>
      )}
    </motion.div>
  );
}
