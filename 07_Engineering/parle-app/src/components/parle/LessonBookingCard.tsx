import type { ReactNode } from "react";
import { CalendarDays, Clock3, FileText, MessageSquareText, UserRound, Video } from "lucide-react";
import { t, type TranslationKey } from "@/lib/i18n";
import { formatLessonTime, formatUsdCents, LESSON_SKILLS, type LessonSkill, type LessonStatus, type NoteLevel, type ParleLesson } from "@/lib/parle-booking";

const STATUS_KEYS: Record<LessonStatus, TranslationKey> = {
  pending_payment: "lessons.status.pendingPayment", confirmed: "lessons.status.confirmed", expired: "lessons.status.expired",
  cancelled_learner: "lessons.status.cancelledLearner", cancelled_tutor: "lessons.status.cancelledTutor", completed: "lessons.status.completed",
  learner_no_show: "lessons.status.noShow", disputed: "lessons.status.disputed",
};
const STATUS_STYLES: Record<LessonStatus, string> = {
  pending_payment: "border-[#F1D9A9] bg-[#FFF8E9] text-[#805916]",
  confirmed: "border-[#B9D9CB] bg-[#F1F8F4] text-[#236646]",
  expired: "border-primary/15 bg-[#F7F8FB] text-muted-foreground",
  cancelled_learner: "border-[#E9BDB6] bg-[#FFF5F2] text-[#8D342D]",
  cancelled_tutor: "border-[#E9BDB6] bg-[#FFF5F2] text-[#8D342D]",
  completed: "border-[#C9D7EE] bg-[#F5F8FD] text-primary",
  learner_no_show: "border-[#E9BDB6] bg-[#FFF5F2] text-[#8D342D]",
  disputed: "border-[#F1D9A9] bg-[#FFF8E9] text-[#805916]",
};
const SKILL_KEYS: Record<LessonSkill, TranslationKey> = { listening: "learner.skill.listening", reading: "learner.skill.reading", writing: "learner.skill.writing", speaking: "learner.skill.speaking" };
const LEVEL_KEYS: Record<NoteLevel, TranslationKey> = { struggling: "lessons.skillLevel.struggling", ok: "lessons.skillLevel.ok", strong: "lessons.skillLevel.strong" };

export default function LessonBookingCard({
  booking,
  timeZone,
  audience = "learner",
  compact = false,
  children,
}: {
  booking: ParleLesson;
  timeZone: string;
  audience?: "learner" | "tutor";
  compact?: boolean;
  children?: ReactNode;
}) {
  const displayName = audience === "tutor" ? booking.learner_name || t("booking.learnerFallback") : booking.tutor_name || t("booking.tutorFallback");
  const formattedTime = formatLessonTime(booking.start_at, booking.end_at, timeZone);
  const notes = booking.notes;
  const noteSkills = notes ? LESSON_SKILLS.filter((skill) => notes.skills[skill]) : [];
  return (
    <article className={`min-w-0 rounded-[1.25rem] border border-primary/10 bg-white shadow-[0_16px_38px_-34px_rgba(30,58,138,0.5)] ${compact ? "p-3.5" : "p-4 sm:p-5"}`}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FA] text-primary"><UserRound aria-hidden="true" className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#A13F36]">{t(audience === "tutor" ? "lessons.lessonWithLearner" : "booking.lessonWithTutor")}</p>
          <h3 className="mt-1 break-words font-display text-base font-extrabold leading-5 text-primary">{displayName}</h3>
        </div>
        <span className={`inline-flex min-h-7 max-w-[44%] shrink-0 items-center justify-center rounded-full border px-2.5 py-1 text-center text-[10px] font-extrabold leading-4 ${STATUS_STYLES[booking.status]}`}>{t(STATUS_KEYS[booking.status])}</span>
      </div>
      <div className="mt-4 grid gap-2 border-t border-primary/10 pt-3 text-xs leading-5 text-foreground sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <p className="flex min-w-0 items-start gap-2"><CalendarDays aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span className="break-words">{formattedTime || t("booking.timeUnavailable")}</span></p>
        <p className="inline-flex items-center gap-2 font-bold text-primary"><Clock3 aria-hidden="true" className="h-4 w-4" />{t("booking.duration").replace("{minutes}", String(booking.minutes))}{audience === "learner" && booking.price_cents > 0 ? ` · ${formatUsdCents(booking.price_cents)}` : ""}</p>
      </div>
      {booking.status === "confirmed" && (booking.meeting_link
        ? <a href={booking.meeting_link} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 text-xs font-extrabold text-white transition hover:bg-[#172E70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><Video aria-hidden="true" className="h-4 w-4" />{t("lessons.joinLesson")}</a>
        : audience === "learner" && <p className="mt-3 rounded-xl bg-[#F7F8FB] px-3 py-2.5 text-xs leading-5 text-muted-foreground">{t("lessons.noLinkYet")}</p>)}
      {audience === "tutor" && booking.learner_message && <div className="mt-3 rounded-xl border border-primary/10 bg-[#FAF9F5] p-3"><p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-primary"><MessageSquareText aria-hidden="true" className="h-3.5 w-3.5" />{t("tutorDashboard.learnerNote")}</p><p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-5 text-foreground">{booking.learner_message}</p></div>}
      {notes && (noteSkills.length > 0 || notes.notes || notes.homework) && <div className="mt-3 rounded-xl border border-primary/10 bg-[#FAF9F5] p-3">
        <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-primary"><FileText aria-hidden="true" className="h-3.5 w-3.5" />{t("lessons.notesHeading")}</p>
        {noteSkills.length > 0 && <p className="mt-1.5 text-xs leading-5 text-foreground">{noteSkills.map((skill) => `${t(SKILL_KEYS[skill])}: ${t(LEVEL_KEYS[notes.skills[skill] as NoteLevel])}`).join(" · ")}</p>}
        {notes.notes && <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-5 text-foreground">{notes.notes}</p>}
        {notes.homework && <p className="mt-1.5 text-xs font-bold leading-5 text-primary">{t("lessons.notesHomework", { homework: notes.homework })}</p>}
      </div>}
      {children}
    </article>
  );
}
