import { describe, it, expect } from "bun:test";
import { latestMail } from "./helpers/mailpit";
import { ADMIN_ALERTS, bookableTutor, fakeTransfers, learner, lesson, onlyTheseDue, payoutOf, runJobs, schedulePayout, seedConfirmed, service } from "./helpers/lessons";

const at = (h: number) => { const d = new Date(Date.now() + h * 3_600_000); d.setUTCSeconds(0, 0); return d.toISOString(); };
const statusOf = async (id: string) => (await service().from("booking").select("status").eq("id", id).single()).data!.status;
const lessonOf = async (t: string, id: string) => (await lesson(t, "learner_list_lessons")).body.lessons.find((l: any) => l.id === id);

describe("payouts follow the lesson (spec section 7, payout creation)", () => {
  it("marking attendance schedules the payout 72 h after the completion; a no-show pays the tutor too", async () => {
    const { profileId, tutor, token } = await bookableTutor();
    const { u } = await learner();
    const a = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-3) });
    const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-5) });
    expect((await lesson(token, "mark_attendance", { booking_id: a.bookingId, outcome: "completed" })).status).toBe(200);
    expect((await lesson(token, "mark_attendance", { booking_id: b.bookingId, outcome: "learner_no_show" })).status).toBe(200);
    const pa = await payoutOf(a.bookingId);
    const completedAt = (await service().from("booking").select("completed_at").eq("id", a.bookingId).single()).data!.completed_at;
    expect(pa).toMatchObject({ status: "scheduled", amount_cents: 3200, commission_cents: 800 });
    expect(new Date(pa.release_at).toISOString()).toBe(new Date(Date.parse(completedAt) + 72 * 3_600_000).toISOString());
    expect(await payoutOf(b.bookingId)).toMatchObject({ status: "scheduled", amount_cents: 3200 });
  });

  it("a learner's late cancellation pays the tutor 72 h after the scheduled end; an early one pays nothing", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u, t } = await learner();
    const lateStart = at(10);
    const late = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: lateStart });
    const early = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(120) });
    expect((await lesson(t, "cancel_lesson", { booking_id: late.bookingId, expected_refund_cents: 0 })).status).toBe(200);
    expect(new Date((await payoutOf(late.bookingId)).release_at).toISOString()).toBe(new Date(Date.parse(lateStart) + 73 * 3_600_000).toISOString());
    expect((await lesson(t, "cancel_lesson", { booking_id: early.bookingId, expected_refund_cents: 4000 })).status).toBe(200);
    expect(await payoutOf(early.bookingId)).toBeNull();
  });

  it("lessons nobody marked are completed after 48 h with their payout; the safety net creates payouts that were missed", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u } = await learner();
    const unmarked = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-60) });
    const missed = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-10), status: "completed" });
    expect((await runJobs()).status).toBe(200);
    expect(await statusOf(unmarked.bookingId)).toBe("completed");
    expect(await payoutOf(unmarked.bookingId)).toMatchObject({ status: "scheduled" });
    expect(await payoutOf(missed.bookingId)).toMatchObject({ status: "scheduled" });
  });

  it("a report holds the payout and alerts the administrator; it stays open while the payout waits and closes once it is sent", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u, t } = await learner();
    const open = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-3), status: "completed" });
    await schedulePayout(open.bookingId);
    const since = new Date().toISOString();
    const r = await lesson(t, "report_problem", { booking_id: open.bookingId, kind: "tutor_no_show", details: "Nobody joined." });
    expect(r.body.lesson.status).toBe("disputed");
    expect(await payoutOf(open.bookingId)).toMatchObject({ status: "held", hold_reason: "tutor_no_show" });
    expect((await latestMail(ADMIN_ALERTS, since)).subject).toContain("reported a problem");
    const sent = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-6), status: "completed" });
    await schedulePayout(sent.bookingId);
    await service().rpc("payout_mark_paid", { p_payout: (await payoutOf(sent.bookingId)).id, p_transfer: `tr_rep_${crypto.randomUUID().slice(0, 8)}` });
    expect((await lessonOf(t, sent.bookingId)).can_report).toBe(false);
    expect((await lesson(t, "report_problem", { booking_id: sent.bookingId, kind: "other", details: "" })).body.error_code).toBe("REPORT_CLOSED");
    const waiting = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-100), status: "completed" });
    await schedulePayout(waiting.bookingId, 200); // past 7A's 72 h window, payout not sent yet: still open (spec: until it is sent)
    expect((await lessonOf(t, waiting.bookingId)).can_report).toBe(true);
  });

  it("a report in the same moment the payout is being sent: one of them wins (Review Focus 1)", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u, t } = await learner();
    const claimed = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-3), status: "completed" });
    await schedulePayout(claimed.bookingId, 0);
    expect((await service().rpc("payout_claim", { p_payout: (await payoutOf(claimed.bookingId)).id })).data).toBe("claimed");
    expect((await lesson(t, "report_problem", { booking_id: claimed.bookingId, kind: "other", details: "" })).body.error_code).toBe("REPORT_CLOSED");
    expect(await statusOf(claimed.bookingId)).toBe("completed");
    const reported = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-5), status: "completed" });
    await schedulePayout(reported.bookingId, 0);
    const p = await payoutOf(reported.bookingId);
    expect((await lesson(t, "report_problem", { booking_id: reported.bookingId, kind: "other", details: "Audio failed." })).body.lesson.status).toBe("disputed");
    await onlyTheseDue([p.id]);
    expect((await runJobs()).status).toBe(200);
    expect(await payoutOf(reported.bookingId)).toMatchObject({ status: "held", hold_reason: "dispute", stripe_transfer_id: null });
    expect(await fakeTransfers(p.id)).toBe(0);
  });
});
