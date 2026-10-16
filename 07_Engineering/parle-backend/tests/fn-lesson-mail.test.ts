import { describe, it, expect } from "bun:test";
import { latestMail, mailsTo } from "./helpers/mailpit";
import { book, bookAndPay, bookableTutor, learner, pay, runJobs, seedConfirmed, service, slotAt } from "./helpers/lessons";

describe("confirmation emails (spec section 4)", () => {
  it("learner and tutor each get one email with the invite and the link; the tutor's has the message", async () => {
    const since = new Date().toISOString();
    const { profileId, tutor } = await bookableTutor();
    const { u, t } = await learner();
    const r = await book(t, profileId, slotAt(3, 10), 60, "Je prépare le TEF");
    await pay(r.body.booking_id);
    const toLearner = await latestMail(u.email, since);
    expect(toLearner.subject).toContain("is booked");
    expect(toLearner.attachments).toContain("lesson.ics");
    expect(toLearner.html).toContain("https://meet.google.com/abc-defg-hij");
    expect((await latestMail(tutor.email, since)).html).toContain("Je prépare le TEF");
    expect((await mailsTo(u.email, since)).length).toBe(1);
  });

  it("a tutor without a meeting link can still be booked; the learner is told the link will follow (Review Focus 2)", async () => {
    const since = new Date().toISOString();
    const { profileId } = await bookableTutor({ meetingLink: "" });
    const { u, t } = await learner();
    await bookAndPay(t, profileId, slotAt(3, 12));
    expect((await latestMail(u.email, since)).html).toContain("Your tutor will send you the meeting link before the lesson.");
  });

  it("a confirmation that was never sent goes out from the jobs, once, even with two runs at once", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u } = await learner();
    const { bookingId } = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: slotAt(4, 10) });
    await service().from("booking").update({ confirmation_sent_at: null }).eq("id", bookingId);
    const since = new Date().toISOString();
    await Promise.all([runJobs(), runJobs()]);
    expect((await mailsTo(u.email, since)).filter((m) => m.subject.includes("is booked")).length).toBe(1);
  }, 60000);
});
