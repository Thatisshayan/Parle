import type { LessonContext } from "./actions.ts";
import { LessonError } from "./errors.ts";
import { lessonSettings } from "./settings.ts";
import { canMarkAttendance, canReport, plainText, validNoteSkills } from "./rules.ts";
import { loadBooking, person, tutorInfo, viewsFor, type BookingRow } from "./store.ts";
import { ownBooking } from "./booking.ts";
import { schedulePayout } from "../payouts/schedule.ts";
import { alertAdmins } from "../payouts/alerts.ts";

async function view(ctx: LessonContext, id: string, viewer: "learner" | "tutor") {
  const row = await loadBooking(ctx.db, id);
  return (await viewsFor(ctx.db, [row!], viewer, ctx.now, await lessonSettings(ctx.db)))[0];
}
function tutorOf(ctx: LessonContext, row: BookingRow) {
  if (row.tutor_id !== ctx.caller.id) throw new LessonError("TUTOR_ONLY", 403, "Only the lesson's tutor can do this.");
}
function learnerOf(ctx: LessonContext, row: BookingRow) {
  if (row.learner_id !== ctx.caller.id) throw new LessonError("LEARNER_ONLY", 403, "Only the lesson's learner can do this.");
}
function adminOnly(ctx: LessonContext) {
  if (ctx.caller.role !== "admin") throw new LessonError("ADMIN_REQUIRED", 403, "Administrators only.");
}

export async function markAttendance(ctx: LessonContext): Promise<Record<string, unknown>> {
  const row = await ownBooking(ctx, ctx.body.booking_id);
  tutorOf(ctx, row);
  const outcome = ctx.body.outcome === "learner_no_show" ? "learner_no_show" : ctx.body.outcome === "completed" ? "completed" : "";
  if (!outcome) throw new LessonError("ATTENDANCE_INVALID", 400);
  if (!canMarkAttendance({ status: row.status, endAt: row.end_at, now: ctx.now })) throw new LessonError("ATTENDANCE_NOT_OPEN", 409, "You can mark attendance once the lesson has ended.");
  const { data: marked, error } = await ctx.db.from("booking").update({ status: outcome, completed_at: ctx.now.toISOString(), attendance_marked_by: "tutor", status_changed_at: ctx.now.toISOString() })
    .eq("id", row.id).eq("status", "confirmed").select("id");
  if (error) throw new Error(error.message);
  // the tutor's share is scheduled now (spec section 7); a failure here is caught by the jobs' safety net
  if (marked?.length) await schedulePayout(ctx.db, row.id, await lessonSettings(ctx.db)).catch((e) => console.warn("payout not scheduled; the jobs retry", (e as Error).message));
  return { lesson: await view(ctx, row.id, "tutor") };
}

export async function saveLessonNotes(ctx: LessonContext): Promise<Record<string, unknown>> {
  const row = await ownBooking(ctx, ctx.body.booking_id);
  tutorOf(ctx, row);
  if (row.status !== "completed") throw new LessonError("NOTES_NOT_OPEN", 409, "Notes can be written after a completed lesson.");
  const skills = validNoteSkills(ctx.body.skills);
  if (!skills) throw new LessonError("NOTES_INVALID", 400, "Choose struggling, ok or strong for at least one skill.");
  const { error } = await ctx.db.from("lesson_notes").upsert({
    booking_id: row.id, skills, notes: plainText(ctx.body.notes, 2000), homework: plainText(ctx.body.homework, 1000), updated_at: ctx.now.toISOString(),
  }, { onConflict: "booking_id" });
  if (error) throw new Error(error.message);
  return { lesson: await view(ctx, row.id, "tutor") };
}

const REPORT_KINDS: Record<string, string[]> = { completed: ["tutor_no_show", "other"], learner_no_show: ["no_show_dispute", "other"] };

/** The learner reports a tutor no-show or disputes a no-show until the payout is sent; the payout waits for an administrator. */
export async function reportProblem(ctx: LessonContext): Promise<Record<string, unknown>> {
  const row = await ownBooking(ctx, ctx.body.booking_id);
  learnerOf(ctx, row);
  const settings = await lessonSettings(ctx.db);
  const { data: payout, error: payoutError } = await ctx.db.from("payout").select("status").eq("booking_id", row.id).maybeSingle();
  if (payoutError) throw new Error(payoutError.message);
  if (!canReport({ status: row.status, endAt: row.end_at, now: ctx.now, payoutDelayHours: settings.payout_delay_hours, payoutStatus: payout?.status ?? null })) {
    throw new LessonError("REPORT_CLOSED", 409, "This lesson can no longer be reported.");
  }
  const kind = String(ctx.body.kind ?? "");
  if (!(REPORT_KINDS[row.status] ?? []).includes(kind)) throw new LessonError("REPORT_INVALID", 400, "Choose what happened.");
  // the report and the payout hold in one transaction; a payout already being sent closes the report (Review Focus 1)
  const { data: result, error } = await ctx.db.rpc("lesson_report_problem", { p_booking: row.id, p_learner: ctx.caller.id, p_kind: kind, p_details: plainText(ctx.body.details, 2000) });
  if (error) throw new Error(error.message);
  if (result === "invalid") throw new LessonError("REPORT_INVALID", 400, "Choose what happened.");
  if (result !== "reported") throw new LessonError("REPORT_CLOSED", 409, "This lesson can no longer be reported.");
  await alertAdmins("a learner reported a problem", [`Lesson ${row.id}: ${kind.replaceAll("_", " ")}.`, "The tutor's payout is held until you decide on the Payouts screen."], `report:${row.id}`);
  return { lesson: await view(ctx, row.id, "learner") };
}

/** One review per completed lesson, in tutor_review (is_test_review false), published by the hourly refresh. */
export async function submitReview(ctx: LessonContext): Promise<Record<string, unknown>> {
  const row = await ownBooking(ctx, ctx.body.booking_id);
  learnerOf(ctx, row);
  if (row.status !== "completed" || !row.tutor_id) throw new LessonError("REVIEW_NOT_AVAILABLE", 409, "You can review a lesson after it is completed.");
  const stars = Number(ctx.body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new LessonError("REVIEW_INVALID", 400, "Choose 1 to 5 stars.");
  const tutor = await person(ctx.db, row.tutor_id);
  if (!tutor) throw new LessonError("REVIEW_NOT_AVAILABLE", 409, "This tutor is no longer on Parle.");
  const { error } = await ctx.db.from("tutor_review").insert({
    owner_id: ctx.caller.id, created_by: ctx.caller.email, profile_id: row.tutor_profile_id, tutor_email: tutor.email,
    stars, comment: plainText(ctx.body.comment, 700), is_test_review: false, is_visible: true, demo_lesson_reference: "",
    booking_id: row.id, learner_id: ctx.caller.id,
  });
  if (error?.code === "23505") throw new LessonError("REVIEW_EXISTS", 409, "You already reviewed this lesson.");
  if (error) throw new Error(error.message);
  return { lesson: await view(ctx, row.id, "learner") };
}

export async function tutorLessonBrief(ctx: LessonContext): Promise<Record<string, unknown>> {
  const row = await ownBooking(ctx, ctx.body.booking_id);
  tutorOf(ctx, row);
  const { data, error } = await ctx.db.from("lesson_brief").select("content").eq("booking_id", row.id).maybeSingle();
  if (error) throw new Error(error.message);
  return { brief: data?.content ?? null };
}

/** Every learner the tutor has taught or will teach: lesson count, last and next lesson, the latest notes. */
export async function tutorListStudents(ctx: LessonContext): Promise<Record<string, unknown>> {
  if (ctx.caller.role !== "tutor") throw new LessonError("TUTOR_ONLY", 403);
  const { data, error } = await ctx.db.from("booking").select("id, learner_id, start_at, status").eq("tutor_id", ctx.caller.id)
    .in("status", ["confirmed", "completed", "learner_no_show", "disputed"]).not("learner_id", "is", null).order("start_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ id: string; learner_id: string; start_at: string; status: string }>;
  const { data: notes } = rows.length ? await ctx.db.from("lesson_notes").select("booking_id, skills, notes, homework, updated_at").in("booking_id", rows.map((r) => r.id)) : { data: [] as any[] };
  const notesBy = new Map((notes ?? []).map((n: any) => [n.booking_id, n]));
  const byLearner = new Map<string, { learner_id: string; name: string; lessons: number; last_lesson_at: string | null; next_lesson_at: string | null; latest_notes: Record<string, unknown> | null }>();
  for (const r of rows) {
    const s = byLearner.get(r.learner_id) ?? { learner_id: r.learner_id, name: "", lessons: 0, last_lesson_at: null, next_lesson_at: null, latest_notes: null };
    const past = Date.parse(r.start_at) <= ctx.now.getTime();
    if (r.status !== "confirmed") s.lessons++;
    if (past && r.status !== "confirmed" && !s.last_lesson_at) s.last_lesson_at = new Date(r.start_at).toISOString();
    if (!past && r.status === "confirmed") s.next_lesson_at = new Date(r.start_at).toISOString(); // rows are newest first: the last one set is the soonest
    const n = notesBy.get(r.id);
    if (n && !s.latest_notes) s.latest_notes = { skills: n.skills, notes: n.notes, homework: n.homework, date: new Date(r.start_at).toISOString().slice(0, 10) };
    byLearner.set(r.learner_id, s);
  }
  for (const s of byLearner.values()) s.name = (await person(ctx.db, s.learner_id))?.firstName || "Learner";
  const me = await tutorInfo(ctx.db, ctx.caller.id);
  return { time_zone: me?.timeZone ?? "UTC", students: [...byLearner.values()] };
}

/** Admin Bookings page (read only in 7A; resolving disputes is 7B's Payouts screen). */
export async function adminListDisputed(ctx: LessonContext): Promise<Record<string, unknown>> {
  adminOnly(ctx);
  const settings = await lessonSettings(ctx.db);
  const { data, error } = await ctx.db.from("booking").select("*").eq("status", "disputed").order("disputed_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  const lessons = [];
  for (const row of (data ?? []) as BookingRow[]) {
    const [tutor, learnerPerson] = await Promise.all([row.tutor_id ? tutorInfo(ctx.db, row.tutor_id) : null, row.learner_id ? person(ctx.db, row.learner_id) : null]);
    lessons.push({
      id: row.id, start_at: new Date(row.start_at).toISOString(), tutor_name: tutor?.displayName ?? "Former tutor", learner_name: learnerPerson?.firstName || (row.learner_id ? "Learner" : "Former learner"),
      dispute_kind: row.dispute_kind, dispute_details: row.dispute_details, disputed_at: row.disputed_at, disputed_from: row.disputed_from, price_cents: row.price_cents,
    });
  }
  const { data: cancelled } = await ctx.db.from("booking").select("tutor_id").eq("status", "cancelled_tutor").eq("cancelled_by", "tutor")
    .gte("status_changed_at", new Date(ctx.now.getTime() - 30 * 86_400_000).toISOString()).limit(2000);
  const counts = new Map<string, number>();
  for (const r of cancelled ?? []) if (r.tutor_id) counts.set(r.tutor_id, (counts.get(r.tutor_id) ?? 0) + 1);
  const flagged = [];
  for (const [tutorId, n] of counts) if (n >= settings.tutor_cancellation_flag_count) flagged.push({ tutor_id: tutorId, name: (await tutorInfo(ctx.db, tutorId))?.displayName ?? "Tutor", cancellations: n });
  return { lessons, flagged_tutors: flagged };
}

/** Founding tutors pay the founding commission on bookings made before this date (decision #22); audited. */
export async function adminSetFoundingUntil(ctx: LessonContext): Promise<Record<string, unknown>> {
  adminOnly(ctx);
  const tutorId = String(ctx.body.tutor_user_id ?? "");
  const until = ctx.body.until === null ? null : String(ctx.body.until ?? "");
  if (until !== null && !/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new LessonError("DATE_INVALID", 400, "Use a date like 2027-04-30.");
  const { data: before } = await ctx.db.from("tutor_profile").select("founding_until").eq("user_id", tutorId).limit(1);
  if (!before?.length) throw new LessonError("NOT_FOUND", 404, "Tutor not found.");
  const { error } = await ctx.db.from("tutor_profile").update({ founding_until: until }).eq("user_id", tutorId);
  if (error) throw new Error(error.message);
  const audit = await ctx.db.from("admin_audit_log").insert({
    actor_user_id: ctx.caller.id, actor_label: ctx.caller.email, action: "tutor.founding_until", target_type: "tutor_profile", target_id: tutorId,
    old_value: JSON.stringify(before[0].founding_until ?? null), new_value: JSON.stringify(until), occurred_at_utc: ctx.now.toISOString(),
    owner_id: ctx.caller.id, created_by: ctx.caller.email,
  });
  if (audit.error) throw new Error(audit.error.message);
  return { founding_until: until };
}
