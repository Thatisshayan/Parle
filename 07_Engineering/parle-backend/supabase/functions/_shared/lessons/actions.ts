import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Caller } from "../caller.ts";
import type { LessonPayments } from "./payments.ts";
import { LessonError } from "./errors.ts";
import { bookingOptions, bookLesson, lessonStatus, listLessons, resumeCheckout } from "./booking.ts";
import { cancelLesson, rescheduleLesson, rescheduleOptions } from "./changes.ts";
import { adminListDisputed, adminSetFoundingUntil, markAttendance, reportProblem, saveLessonNotes, submitReview, tutorLessonBrief, tutorListStudents } from "./after.ts";

export type LessonContext = { db: SupabaseClient; payments: LessonPayments; caller: Caller; body: Record<string, any>; origin: string; now: Date };
type Handler = (ctx: LessonContext) => Promise<Record<string, unknown>>;

/** Every lesson action, by name. Later tasks add cancel, reschedule, attendance, notes, reviews and admin lists. */
export const LESSON_ACTIONS: Record<string, Handler> = {
  booking_options: bookingOptions,
  book_lesson: bookLesson,
  lesson_status: lessonStatus,
  resume_checkout: resumeCheckout,
  learner_list_lessons: (ctx) => listLessons(ctx, "learner"),
  tutor_list_lessons: (ctx) => listLessons(ctx, "tutor"),
  cancel_lesson: cancelLesson,
  reschedule_options: rescheduleOptions,
  reschedule_lesson: rescheduleLesson,
  mark_attendance: markAttendance,
  save_lesson_notes: saveLessonNotes,
  report_problem: reportProblem,
  submit_review: submitReview,
  tutor_lesson_brief: tutorLessonBrief,
  tutor_list_students: tutorListStudents,
  admin_list_disputed: adminListDisputed,
  admin_set_founding_until: adminSetFoundingUntil,
};

export async function runLessonAction(ctx: LessonContext): Promise<Record<string, unknown>> {
  const handler = LESSON_ACTIONS[String(ctx.body.action ?? "")];
  if (!handler) throw new LessonError("UNKNOWN_ACTION", 400);
  return await handler(ctx);
}
