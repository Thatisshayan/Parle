import { useEffect, useState } from "react";
import { CircleAlert, ClipboardList, FileText, LoaderCircle, UserCheck, UserX, XCircle } from "lucide-react";
import { t, type TranslationKey } from "@/lib/i18n";
import {
  cancelLesson, formatUsdCents, LESSON_SKILLS, lessonErrorKey, loadLessonBrief, markAttendance, saveLessonNotes,
  type LessonBrief, type LessonSkill, type NoteLevel, type ParleLesson,
} from "@/lib/parle-booking";

const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-primary/15 bg-white px-4 text-xs font-extrabold text-primary transition hover:bg-[#F2F4F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait disabled:opacity-55";
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-xs font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait disabled:opacity-55";
const field = "mt-1.5 min-h-11 w-full rounded-xl border border-primary/15 bg-white px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";
const SKILL_KEYS: Record<LessonSkill, TranslationKey> = { listening: "learner.skill.listening", reading: "learner.skill.reading", writing: "learner.skill.writing", speaking: "learner.skill.speaking" };
const LEVEL_KEYS: Record<NoteLevel, TranslationKey> = { struggling: "lessons.skillLevel.struggling", ok: "lessons.skillLevel.ok", strong: "lessons.skillLevel.strong" };

function BriefView({ brief }: { brief: LessonBrief }) {
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-primary/10 bg-[#FAF9F5] p-3 text-xs leading-5 text-foreground">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-primary">{t("tutorLessons.brief.heading")}</p>
      {(brief.goal || brief.track) && <p>{t("tutorLessons.brief.goal", { goal: brief.goal || "-", track: brief.track || "-" })}</p>}
      <p>{t("tutorLessons.brief.levels")}: {LESSON_SKILLS.map((skill) => `${t(SKILL_KEYS[skill])} ${typeof brief.levels[skill] === "number" ? (brief.levels[skill] as number).toFixed(1) : t("tutorLessons.brief.notAssessed")}`).join(" · ")}</p>
      {brief.latest_checkin && <p>{t("tutorLessons.brief.checkin", { date: brief.latest_checkin.date, note: brief.latest_checkin.note || "-" })}</p>}
      {brief.recent_mistakes.length > 0 && <div><p className="font-bold">{t("tutorLessons.brief.mistakes")}</p><ul className="list-disc pl-5">{brief.recent_mistakes.map((m, index) => <li key={index} className="break-words">{m.original} → {m.corrected}</li>)}</ul></div>}
      {brief.earlier_notes.length > 0 && <div><p className="font-bold">{t("tutorLessons.brief.earlierNotes")}</p><ul className="list-disc pl-5">{brief.earlier_notes.map((n, index) => <li key={index} className="break-words">{n.date}: {n.notes || "-"}{n.homework ? ` (${t("lessons.notesHomework", { homework: n.homework })})` : ""}</li>)}</ul></div>}
      {brief.learner_message && <p className="break-words">{t("tutorLessons.brief.message", { message: brief.learner_message })}</p>}
    </div>
  );
}

/** Brief, attendance, notes and cancel for one lesson; every permission comes from the server's lesson view. */
export default function TutorLessonActions({ lesson, onChanged, openBrief = false }: { lesson: ParleLesson; onChanged: (next: ParleLesson) => void; openBrief?: boolean }) {
  const [brief, setBrief] = useState<LessonBrief | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [mode, setMode] = useState<"none" | "cancel" | "notes">("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [notice, setNotice] = useState<TranslationKey | null>(null);
  const [skills, setSkills] = useState<Partial<Record<LessonSkill, NoteLevel>>>(lesson.notes?.skills ?? {});
  const [notesText, setNotesText] = useState(lesson.notes?.notes ?? "");
  const [homework, setHomework] = useState(lesson.notes?.homework ?? "");

  async function showBrief() {
    setBriefOpen(true);
    if (brief) return;
    try { setBrief(await loadLessonBrief(lesson.id)); } catch (failure) { setError(lessonErrorKey(failure instanceof Error ? failure.message : "")); }
  }
  useEffect(() => { if (openBrief && lesson.has_brief) void showBrief(); }, [openBrief, lesson.has_brief]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(action: () => Promise<ParleLesson>, done: TranslationKey) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      onChanged(await action());
      setMode("none");
      setNotice(done);
    } catch (failure) {
      setError(lessonErrorKey(failure instanceof Error ? failure.message : ""));
    } finally {
      setBusy(false);
    }
  }

  const anything = lesson.has_brief || lesson.can_mark_attendance || lesson.can_write_notes || lesson.can_cancel;
  if (!anything && !notice && !error) return null;
  const close = <button type="button" className={secondary} disabled={busy} onClick={() => setMode("none")}>{t("lessons.action.close")}</button>;

  return (
    <div className="mt-4 border-t border-primary/10 pt-3">
      {mode === "none" && <div className="flex flex-wrap gap-2">
        {lesson.has_brief && <button type="button" className={secondary} onClick={() => (briefOpen ? setBriefOpen(false) : void showBrief())}><ClipboardList aria-hidden="true" className="h-3.5 w-3.5" />{t(briefOpen ? "tutorLessons.hideBrief" : "tutorLessons.showBrief")}</button>}
        {lesson.can_mark_attendance && <>
          <button type="button" className={primary} disabled={busy} onClick={() => void run(() => markAttendance(lesson.id, "completed"), "tutorLessons.attendanceDone")}><UserCheck aria-hidden="true" className="h-3.5 w-3.5" />{t("tutorLessons.markCompleted")}</button>
          <button type="button" className={secondary} disabled={busy} onClick={() => void run(() => markAttendance(lesson.id, "learner_no_show"), "tutorLessons.attendanceDone")}><UserX aria-hidden="true" className="h-3.5 w-3.5" />{t("tutorLessons.markNoShow")}</button>
        </>}
        {lesson.can_write_notes && <button type="button" className={lesson.notes ? secondary : primary} disabled={busy} onClick={() => setMode("notes")}><FileText aria-hidden="true" className="h-3.5 w-3.5" />{t(lesson.notes ? "tutorLessons.editNotes" : "tutorLessons.writeNotes")}</button>}
        {lesson.can_cancel && <button type="button" className={secondary} disabled={busy} onClick={() => setMode("cancel")}><XCircle aria-hidden="true" className="h-3.5 w-3.5" />{t("lessons.action.cancel")}</button>}
      </div>}
      {briefOpen && (brief ? <BriefView brief={brief} /> : !error && <p role="status" className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />{t("common.loading")}</p>)}

      {mode === "cancel" && <div className="space-y-3">
        <p className="text-sm leading-6 text-foreground">{t("lessons.cancel.tutorRefund", { amount: formatUsdCents(lesson.cancel_refund_cents) })}</p>
        <div className="flex flex-wrap gap-2"><button type="button" className={primary} disabled={busy} onClick={() => void run(async () => (await cancelLesson(lesson.id, lesson.cancel_refund_cents)).lesson, "lessons.cancel.done")}>{busy && <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}{t("lessons.cancel.confirm")}</button>{close}</div>
      </div>}

      {mode === "notes" && <div className="space-y-3">
        <p className="text-sm leading-6 text-foreground">{t("tutorLessons.notesIntro")}</p>
        <div className="grid gap-2 sm:grid-cols-2">{LESSON_SKILLS.map((skill) => <label key={skill} className="block text-xs font-bold text-foreground">{t(SKILL_KEYS[skill])}<select className={field} value={skills[skill] ?? ""} onChange={(event) => setSkills((current) => { const next = { ...current }; if (event.target.value) next[skill] = event.target.value as NoteLevel; else delete next[skill]; return next; })}><option value="">{t("tutorLessons.notesSkillNone")}</option>{(["struggling", "ok", "strong"] as NoteLevel[]).map((level) => <option key={level} value={level}>{t(LEVEL_KEYS[level])}</option>)}</select></label>)}</div>
        <label className="block text-xs font-bold text-foreground">{t("tutorLessons.notesText")}<textarea className={`${field} min-h-24 py-2`} maxLength={2000} value={notesText} onChange={(event) => setNotesText(event.target.value)} /></label>
        <label className="block text-xs font-bold text-foreground">{t("tutorLessons.notesHomework")}<input className={field} maxLength={1000} value={homework} onChange={(event) => setHomework(event.target.value)} /></label>
        <div className="flex flex-wrap gap-2"><button type="button" className={primary} disabled={busy} onClick={() => void run(() => saveLessonNotes(lesson.id, { skills, notes: notesText, homework }), "tutorLessons.notesSaved")}>{t("tutorLessons.notesSave")}</button>{close}</div>
      </div>}

      {error && <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-3 py-2.5 text-xs leading-5 text-[#8D342D]"><CircleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t(error)}</p>}
      {notice && <p role="status" className="mt-3 rounded-xl border border-[#B9D9CB] bg-[#F1F8F4] px-3 py-2.5 text-xs leading-5 text-[#236646]">{t(notice)}</p>}
    </div>
  );
}
