import { describe, it, expect } from "bun:test";
import { mailsTo } from "./helpers/mailpit";
import { bookableTutor, learner, runJobs, seedConfirmed, service } from "./helpers/lessons";

const hoursFromNow = (h: number) => { const d = new Date(Date.now() + h * 3_600_000); d.setUTCSeconds(0, 0); return d.toISOString(); };

describe("lesson jobs (spec section 6)", () => {
  it("builds the brief from saved data within 24 h of the lesson; only that tutor can read it", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u } = await learner();
    const db = service();
    await db.from("mistake_log").insert({ owner_id: u.id, created_by: u.email, user_id: u.id, skill: "writing", area: "grammar", original_sentence: "Je suis allé hier au marché avec mes ami.", corrected_sentence: "Je suis allé hier au marché avec mes amis." });
    const earlier = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursFromNow(-72), status: "completed" });
    await db.from("lesson_notes").insert({ booking_id: earlier.bookingId, skills: { speaking: "struggling" }, notes: "Hesitates on the passé composé.", homework: "Five sentences." });
    const next = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursFromNow(10) });
    await db.from("booking").update({ learner_message: "Je veux pratiquer l'oral." }).eq("id", next.bookingId);
    expect((await runJobs()).status).toBe(200);
    const { data } = await db.from("lesson_brief").select("content").eq("booking_id", next.bookingId).single();
    expect(data!.content).toMatchObject({ goal: "canada_immigration", track: "immigration", learner_message: "Je veux pratiquer l'oral." });
    expect(data!.content.recent_mistakes[0].corrected).toBe("Je suis allé hier au marché avec mes amis.");
    expect(data!.content.earlier_notes).toEqual([expect.objectContaining({ notes: "Hesitates on the passé composé.", homework: "Five sentences." })]);
    expect(((await tutor.client.from("lesson_brief").select("booking_id").eq("booking_id", next.bookingId)).data ?? []).length).toBe(1);
    expect(((await u.client.from("lesson_brief").select("booking_id").eq("booking_id", next.bookingId)).data ?? []).length).toBe(0);
  }, 60000);

  it("24 h reminder only for lessons booked 24 h or more ahead; 1 h reminder for every lesson", async () => {
    const { profileId, tutor } = await bookableTutor();
    const [a, b] = await Promise.all([learner(), learner()]);
    const since = new Date().toISOString();
    await seedConfirmed({ learnerId: a.u.id, tutorId: tutor.id, profileId, start: hoursFromNow(20), bookedAt: hoursFromNow(-72) });
    const other = await bookableTutor(); // the same tutor cannot have two lessons at the same time
    await seedConfirmed({ learnerId: b.u.id, tutorId: other.tutor.id, profileId: other.profileId, start: hoursFromNow(20), bookedAt: hoursFromNow(-1) });
    await runJobs();
    await runJobs();
    expect((await mailsTo(a.u.email, since)).filter((m) => m.subject.includes("is tomorrow")).length).toBe(1);
    expect((await mailsTo(b.u.email, since)).filter((m) => m.subject.includes("is tomorrow")).length).toBe(0);
  }, 60000);

  it("two job runs at once send each reminder once (Review Focus 5)", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u } = await learner();
    const since = new Date().toISOString();
    await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursFromNow(0.7), bookedAt: hoursFromNow(-48) });
    await Promise.all([runJobs(), runJobs()]);
    await runJobs();
    const mails = await mailsTo(u.email, since);
    expect(mails.filter((m) => m.subject.includes("starts in about an hour")).length).toBe(1);
    expect(mails.filter((m) => m.subject.includes("is tomorrow")).length).toBe(0);
  }, 60000);

  it("unmarked lessons complete 48 h after their end, and the learner is asked for a review once", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u } = await learner();
    const since = new Date().toISOString();
    const { bookingId } = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursFromNow(-51) });
    await runJobs();
    await runJobs();
    expect((await service().from("booking").select("status, attendance_marked_by").eq("id", bookingId).single()).data).toEqual({ status: "completed", attendance_marked_by: "auto" });
    expect((await mailsTo(u.email, since)).filter((m) => m.subject.startsWith("How was your lesson")).length).toBe(1);
  }, 60000);
});
