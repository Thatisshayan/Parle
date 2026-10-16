import { describe, it, expect } from "bun:test";
import { makeUser } from "./helpers/users";
import { bookAndPay, bookableTutor, learner, lesson, seedConfirmed, service, slotAt } from "./helpers/lessons";

const at = (h: number) => { const d = new Date(Date.now() + h * 3_600_000); d.setUTCSeconds(0, 0); return d.toISOString(); };
const adminToken = async () => { const a = await makeUser("admin"); return (await a.client.auth.getSession()).data.session!.access_token; };

describe("after the lesson (spec section 6)", () => {
  it("attendance opens at the lesson's end, for the tutor only", async () => {
    const { profileId, tutor, token } = await bookableTutor();
    const { u, t } = await learner();
    const upcoming = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(3) });
    expect((await lesson(token, "mark_attendance", { booking_id: upcoming.bookingId, outcome: "completed" })).body.error_code).toBe("ATTENDANCE_NOT_OPEN");
    const ended = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-2) });
    expect((await lesson(t, "mark_attendance", { booking_id: ended.bookingId, outcome: "completed" })).status).toBe(403);
    const r = await lesson(token, "mark_attendance", { booking_id: ended.bookingId, outcome: "learner_no_show" });
    expect(r.body.lesson.status).toBe("learner_no_show");
    expect((await service().from("booking").select("attendance_marked_by, completed_at").eq("id", ended.bookingId).single()).data!.attendance_marked_by).toBe("tutor");
  });

  it("notes after a completed lesson: the learner sees them; bad skills are refused; another tutor gets not found", async () => {
    const { profileId, tutor, token } = await bookableTutor();
    const other = await bookableTutor();
    const { u, t } = await learner();
    const done = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-5), status: "completed" });
    expect((await lesson(token, "save_lesson_notes", { booking_id: done.bookingId, skills: { writing: "great" }, notes: "" })).body.error_code).toBe("NOTES_INVALID");
    expect((await lesson(other.token, "save_lesson_notes", { booking_id: done.bookingId, skills: { writing: "ok" } })).status).toBe(404);
    const saved = await lesson(token, "save_lesson_notes", { booking_id: done.bookingId, skills: { writing: "struggling", speaking: "strong" }, notes: "Accords du participe.", homework: "Exercice 3" });
    expect(saved.status).toBe(200);
    const mine = (await lesson(t, "learner_list_lessons")).body.lessons.find((x: any) => x.id === done.bookingId);
    expect(mine.notes).toEqual({ skills: { writing: "struggling", speaking: "strong" }, notes: "Accords du participe.", homework: "Exercice 3" });
  });

  it("report a problem: disputed until the payout would be sent; administrators see it, others do not", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u, t } = await learner();
    const recent = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-3), status: "completed" });
    const old = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-80), status: "completed" });
    expect((await lesson(t, "report_problem", { booking_id: old.bookingId, kind: "tutor_no_show", details: "" })).body.error_code).toBe("REPORT_CLOSED");
    expect((await lesson(t, "report_problem", { booking_id: recent.bookingId, kind: "no_show_dispute", details: "" })).body.error_code).toBe("REPORT_INVALID");
    const r = await lesson(t, "report_problem", { booking_id: recent.bookingId, kind: "tutor_no_show", details: "The tutor never joined." });
    expect(r.body.lesson.status).toBe("disputed");
    expect((await service().from("booking").select("disputed_from").eq("id", recent.bookingId).single()).data!.disputed_from).toBe("completed");
    const list = await lesson(await adminToken(), "admin_list_disputed");
    expect(list.body.lessons.some((x: any) => x.id === recent.bookingId && x.dispute_details === "The tutor never joined.")).toBe(true);
    expect((await lesson(t, "admin_list_disputed")).status).toBe(403);
  });

  it("one review per completed lesson, stored as a real (non-test) tutor review", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u, t } = await learner();
    const done = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-6), status: "completed" });
    const upcoming = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(30) });
    expect((await lesson(t, "submit_review", { booking_id: upcoming.bookingId, stars: 5, comment: "" })).body.error_code).toBe("REVIEW_NOT_AVAILABLE");
    expect((await lesson(t, "submit_review", { booking_id: done.bookingId, stars: 6, comment: "" })).body.error_code).toBe("REVIEW_INVALID");
    const r = await lesson(t, "submit_review", { booking_id: done.bookingId, stars: 5, comment: "Très claire, merci !" });
    expect(r.body.lesson).toMatchObject({ review_stars: 5, can_review: false });
    expect((await lesson(t, "submit_review", { booking_id: done.bookingId, stars: 4, comment: "" })).body.error_code).toBe("REVIEW_EXISTS");
    expect((await service().from("tutor_review").select("profile_id, tutor_email, stars, is_test_review, is_visible, learner_id").eq("booking_id", done.bookingId).single()).data)
      .toEqual({ profile_id: profileId, tutor_email: tutor.email, stars: 5, is_test_review: false, is_visible: true, learner_id: u.id });
  });

  it("the tutor reads the brief and the Students page; the learner cannot read the brief", async () => {
    const { profileId, tutor, token } = await bookableTutor();
    const { u, t } = await learner();
    const done = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-30), status: "completed" });
    await service().from("lesson_notes").insert({ booking_id: done.bookingId, skills: { reading: "ok" }, notes: "Good progress" });
    const next = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(8) });
    await service().from("lesson_brief").insert({ booking_id: next.bookingId, content: { learner_name: "Learner", goal: "canada_immigration" } });
    expect((await lesson(token, "tutor_lesson_brief", { booking_id: next.bookingId })).body.brief).toMatchObject({ goal: "canada_immigration" });
    expect((await lesson(t, "tutor_lesson_brief", { booking_id: next.bookingId })).status).toBe(403);
    const students = (await lesson(token, "tutor_list_students")).body.students;
    expect(students).toEqual([expect.objectContaining({ learner_id: u.id, lessons: 1, latest_notes: expect.objectContaining({ notes: "Good progress" }) })]);
  });

  it("tutors with 3 cancellations in 30 days are flagged for administrators", async () => {
    const { profileId, tutor, token } = await bookableTutor();
    const { u } = await learner();
    for (const days of [3, 4, 5]) {
      const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: slotAt(days, 10) });
      expect((await lesson(token, "cancel_lesson", { booking_id: b.bookingId, expected_refund_cents: 4000 })).status).toBe(200);
    }
    const flagged = (await lesson(await adminToken(), "admin_list_disputed")).body.flagged_tutors;
    expect(flagged.some((x: any) => x.tutor_id === tutor.id && x.cancellations === 3)).toBe(true);
  });

  it("an administrator sets a founding date (audited); the next booking freezes the founding commission", async () => {
    const { profileId, tutor } = await bookableTutor();
    const admin = await adminToken();
    const until = new Date(Date.now() + 180 * 86_400_000).toISOString().slice(0, 10);
    expect((await lesson(admin, "admin_set_founding_until", { tutor_user_id: tutor.id, until })).body.founding_until).toBe(until);
    expect((await service().from("admin_audit_log").select("action").eq("target_id", tutor.id).eq("action", "tutor.founding_until")).data!.length).toBe(1);
    const { t } = await learner();
    const { bookingId } = await bookAndPay(t, profileId, slotAt(3, 15));
    expect(Number((await service().from("booking").select("commission_pct").eq("id", bookingId).single()).data!.commission_pct)).toBe(10);
  });
});
