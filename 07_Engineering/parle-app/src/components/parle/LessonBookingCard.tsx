import type { ReactNode } from "react";
import { CalendarDays, Clock3, MessageSquareText, UserRound } from "lucide-react";
import { t } from "@/lib/i18n";
import { formatLessonTime, type BookingDecision, type ParleBooking } from "@/lib/parle-booking";

const statusKeys = {
  requested: "booking.status.requested",
  confirmed: "booking.status.confirmed",
  declined: "booking.status.declined",
} as const;

const decisionKeys: Record<Exclude<BookingDecision, "none">, "booking.decision.accepted" | "booking.decision.declinedByTutor" | "booking.decision.slotTaken" | "booking.decision.anotherRequestAccepted"> = {
  accepted: "booking.decision.accepted",
  declined_by_tutor: "booking.decision.declinedByTutor",
  slot_taken: "booking.decision.slotTaken",
  another_request_accepted: "booking.decision.anotherRequestAccepted",
};

const statusStyles = {
  requested: "border-[#F1D9A9] bg-[#FFF8E9] text-[#805916]",
  confirmed: "border-[#B9D9CB] bg-[#F1F8F4] text-[#236646]",
  declined: "border-[#E9BDB6] bg-[#FFF5F2] text-[#8D342D]",
} as const;

export default function LessonBookingCard({
  booking,
  timeZone,
  audience = "learner",
  compact = false,
  children,
}: {
  booking: ParleBooking;
  timeZone: string;
  audience?: "learner" | "tutor";
  compact?: boolean;
  children?: ReactNode;
}) {
  const displayName = audience === "tutor"
    ? booking.learner_first_name || t("booking.learnerFallback")
    : booking.tutor_display_name || t("booking.tutorFallback");
  const formattedTime = formatLessonTime(booking.start_time_utc, booking.end_time_utc, timeZone);
  const decisionKey = booking.decision_message === "none" ? null : decisionKeys[booking.decision_message];

  return (
    <article className={`min-w-0 rounded-[1.25rem] border border-primary/10 bg-white shadow-[0_16px_38px_-34px_rgba(30,58,138,0.5)] ${compact ? "p-3.5" : "p-4 sm:p-5"}`}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FA] text-primary"><UserRound aria-hidden="true" className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#A13F36]">{t(audience === "tutor" ? "tutorDashboard.requestFrom" : "booking.lessonWithTutor")}</p>
          <h3 className="mt-1 break-words font-display text-base font-extrabold leading-5 text-primary">{displayName}</h3>
        </div>
        <span className={`inline-flex min-h-7 max-w-[44%] shrink-0 items-center justify-center rounded-full border px-2.5 py-1 text-center text-[10px] font-extrabold leading-4 ${statusStyles[booking.status]}`}>{t(statusKeys[booking.status])}</span>
      </div>
      <div className="mt-4 grid gap-2 border-t border-primary/10 pt-3 text-xs leading-5 text-foreground sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <p className="flex min-w-0 items-start gap-2"><CalendarDays aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span className="break-words">{formattedTime || t("booking.timeUnavailable")}</span></p>
        <p className="inline-flex items-center gap-2 font-bold text-primary"><Clock3 aria-hidden="true" className="h-4 w-4" />{t("booking.duration").replace("{minutes}", String(booking.duration_minutes))}</p>
      </div>
      {decisionKey && <p className={`mt-3 rounded-xl px-3 py-2.5 text-xs leading-5 ${booking.status === "confirmed" ? "bg-[#F1F8F4] text-[#236646]" : "bg-[#FFF5F2] text-[#75413D]"}`}>{t(decisionKey)}</p>}
      {audience === "tutor" && booking.learner_message && <div className="mt-3 rounded-xl border border-primary/10 bg-[#FAF9F5] p-3"><p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-primary"><MessageSquareText aria-hidden="true" className="h-3.5 w-3.5" />{t("tutorDashboard.learnerNote")}</p><p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-5 text-foreground">{booking.learner_message}</p></div>}
      {children}
    </article>
  );
}
