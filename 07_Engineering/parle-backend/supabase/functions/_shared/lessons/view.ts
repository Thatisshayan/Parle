import type { LessonSettings } from "./settings.ts";
import { canCancel, canMarkAttendance, canReport, canReschedule, cancelOutcome, type Viewer } from "./rules.ts";

export type BookingRow = {
  id: string; learner_id: string | null; tutor_id: string | null; tutor_profile_id: string;
  start_at: string; end_at: string; minutes: number; buffer_minutes: number; blocked_until: string;
  price_cents: number; commission_pct: number; status: string; learner_message: string; reschedule_count: number;
  hold_expires_at: string | null; stripe_checkout_session_id: string | null; booked_at: string; status_changed_at: string;
  cancelled_by: string | null; late_cancel: boolean; completed_at: string | null; attendance_marked_by: string | null;
  disputed_from: string | null; dispute_kind: string | null; dispute_details: string; disputed_at: string | null;
  confirmation_sent_at: string | null; reminder_24h_sent_at: string | null; reminder_1h_sent_at: string | null;
  review_request_sent_at: string | null; created_at: string;
};
export type NotesRow = { skills: unknown; notes: string; homework: string };

export type LessonView = {
  id: string; tutor_profile_id: string; tutor_name: string; learner_name: string; start_at: string; end_at: string;
  minutes: number; price_cents: number; status: string; learner_message: string; meeting_link: string;
  reschedule_count: number; hold_expires_at: string | null; cancelled_by: string | null; late_cancel: boolean;
  dispute_kind: string | null; can_cancel: boolean; cancel_refund_cents: number; can_reschedule: boolean;
  can_mark_attendance: boolean; can_report: boolean; can_review: boolean; review_stars: number | null;
  notes: NotesRow | null; can_write_notes: boolean; has_brief: boolean;
};

const iso = (value: string) => new Date(value).toISOString();
const LINK_STATUSES = ["confirmed", "completed", "learner_no_show", "disputed"];

/** One lesson as its learner or its tutor may see it; every "can_" flag is decided here, on the server. */
export function lessonView(row: BookingRow, i: {
  viewer: Viewer; tutorName: string; learnerName: string; meetingLink: string; now: Date; settings: LessonSettings;
  notes: NotesRow | null; reviewStars: number | null; hasBrief: boolean;
}): LessonView {
  const learner = i.viewer === "learner";
  const timing = { status: row.status, startAt: row.start_at, endAt: row.end_at, now: i.now };
  return {
    id: row.id,
    tutor_profile_id: row.tutor_profile_id,
    tutor_name: i.tutorName,
    learner_name: i.learnerName,
    start_at: iso(row.start_at),
    end_at: iso(row.end_at),
    minutes: row.minutes,
    price_cents: row.price_cents,
    status: row.status,
    learner_message: row.learner_message,
    meeting_link: LINK_STATUSES.includes(row.status) ? i.meetingLink : "",
    reschedule_count: row.reschedule_count,
    hold_expires_at: row.status === "pending_payment" && row.hold_expires_at ? iso(row.hold_expires_at) : null,
    cancelled_by: row.cancelled_by,
    late_cancel: row.late_cancel,
    dispute_kind: row.dispute_kind,
    can_cancel: canCancel(timing),
    cancel_refund_cents: cancelOutcome({ by: i.viewer, startAt: row.start_at, now: i.now, priceCents: row.price_cents, windowHours: i.settings.cancellation_window_hours }).refundCents,
    can_reschedule: learner && canReschedule({ ...timing, windowHours: i.settings.cancellation_window_hours, rescheduleCount: row.reschedule_count }),
    can_mark_attendance: !learner && canMarkAttendance(timing),
    can_report: learner && canReport({ ...timing, payoutDelayHours: i.settings.payout_delay_hours }),
    can_review: learner && row.status === "completed" && i.reviewStars === null,
    review_stars: i.reviewStars,
    notes: i.notes,
    can_write_notes: !learner && row.status === "completed",
    has_brief: !learner && i.hasBrief,
  };
}
