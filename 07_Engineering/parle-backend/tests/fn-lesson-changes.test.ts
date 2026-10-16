import { describe, it, expect } from "bun:test";
import { latestMail } from "./helpers/mailpit";
import { book, bookAndPay, bookableTutor, failNext, learner, lesson, refundCount, seedConfirmed, service, slotAt } from "./helpers/lessons";

const hoursAhead = (h: number) => { const d = new Date(Date.now() + h * 3_600_000); d.setUTCSeconds(0, 0); return d.toISOString(); };
const statusOf = async (id: string) => (await service().from("booking").select("status").eq("id", id).single()).data!.status;

describe("cancelling (spec section 5)", () => {
  it("a learner cancelling 24 h or more ahead is refunded once and emailed; the time is free again", async () => {
    const since = new Date().toISOString();
    const { profileId } = await bookableTutor();
    const [a, b] = await Promise.all([learner(), learner()]);
    const start = slotAt(3, 10);
    const { bookingId, pi } = await bookAndPay(a.t, profileId, start);
    expect((await lesson(a.t, "lesson_status", { booking_id: bookingId })).body.lesson).toMatchObject({ can_cancel: true, cancel_refund_cents: 4000, can_reschedule: true });
    const r = await lesson(a.t, "cancel_lesson", { booking_id: bookingId, expected_refund_cents: 4000 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ refunded_cents: 4000, lesson: { status: "cancelled_learner" } });
    expect(await refundCount(pi)).toBe(1);
    expect((await service().from("refund").select("reason, amount_cents").eq("booking_id", bookingId)).data).toEqual([{ reason: "learner_cancelled", amount_cents: 4000 }]);
    const mail = await latestMail(a.u.email, since);
    expect(mail.subject).toContain("is cancelled");
    expect(mail.html).toContain("We refunded $40.00 USD");
    expect((await book(b.t, profileId, start)).status).toBe(200);
  });

  it("less than 24 h ahead: no refund, a late cancel, and the tutor is told they will be paid", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u, t } = await learner();
    const { bookingId, pi } = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursAhead(5) });
    const since = new Date().toISOString();
    const r = await lesson(t, "cancel_lesson", { booking_id: bookingId, expected_refund_cents: 0 });
    expect(r.body.lesson).toMatchObject({ status: "cancelled_learner", late_cancel: true });
    expect(await refundCount(pi)).toBe(0);
    expect((await latestMail(tutor.email, since)).html).toContain("you will still be paid");
  });

  it("a tutor cancelling refunds the learner in full, even an hour ahead", async () => {
    const { profileId, tutor, token } = await bookableTutor();
    const { u } = await learner();
    const { bookingId, pi } = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursAhead(1) });
    const r = await lesson(token, "cancel_lesson", { booking_id: bookingId, expected_refund_cents: 4000 });
    expect(r.body.lesson.status).toBe("cancelled_tutor");
    expect(await refundCount(pi)).toBe(1);
    expect((await service().from("refund").select("reason").eq("booking_id", bookingId).single()).data!.reason).toBe("tutor_cancelled");
  });

  it("a cancel whose refund changed since the screen was shown changes nothing (Review Focus 3)", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u, t } = await learner();
    const { bookingId, pi } = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: new Date(Date.now() + 24 * 3_600_000 + 6_000).toISOString() });
    const shown = (await lesson(t, "lesson_status", { booking_id: bookingId })).body.lesson.cancel_refund_cents;
    expect(shown).toBe(4000);
    await Bun.sleep(7_000); // the 24-hour line passes
    const r = await lesson(t, "cancel_lesson", { booking_id: bookingId, expected_refund_cents: shown });
    expect(r.status).toBe(409);
    expect(r.body.error_code).toBe("CANCEL_TERMS_CHANGED");
    expect(await statusOf(bookingId)).toBe("confirmed");
    expect(await refundCount(pi)).toBe(0);
  }, 30000);

  it("two cancels at once refund once", async () => {
    const { profileId } = await bookableTutor();
    const { t } = await learner();
    const { bookingId, pi } = await bookAndPay(t, profileId, slotAt(4, 9));
    await Promise.all([1, 2].map(() => lesson(t, "cancel_lesson", { booking_id: bookingId, expected_refund_cents: 4000 })));
    expect(await statusOf(bookingId)).toBe("cancelled_learner");
    expect(await refundCount(pi)).toBe(1);
    expect((await service().from("refund").select("id").eq("booking_id", bookingId)).data!.length).toBe(1);
  });

  it("a refund that cannot reach Stripe leaves the lesson booked; trying again works", async () => {
    const { profileId } = await bookableTutor();
    const { t } = await learner();
    const { bookingId, pi } = await bookAndPay(t, profileId, slotAt(4, 13));
    await failNext("refund");
    const first = await lesson(t, "cancel_lesson", { booking_id: bookingId, expected_refund_cents: 4000 });
    expect(first.status).toBe(503);
    expect(first.body.error_code).toBe("REFUND_UNAVAILABLE");
    expect(await statusOf(bookingId)).toBe("confirmed");
    expect((await lesson(t, "cancel_lesson", { booking_id: bookingId, expected_refund_cents: 4000 })).status).toBe(200);
    expect(await refundCount(pi)).toBe(1);
  });

  it("a refund uses the frozen price after the tutor changes their rate (Review Focus 4)", async () => {
    const until = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
    const { profileId } = await bookableTutor({ hourlyRateCents: 4000, foundingUntil: until });
    const { t } = await learner();
    const { bookingId, pi } = await bookAndPay(t, profileId, slotAt(4, 16));
    await service().from("tutor_public_profile").update({ hourly_rate_cents: 9000 }).eq("profile_id", profileId);
    await service().from("tutor_profile").update({ hourly_rate_cents: 9000, founding_until: null }).eq("id", profileId);
    expect((await lesson(t, "lesson_status", { booking_id: bookingId })).body.lesson).toMatchObject({ price_cents: 4000, cancel_refund_cents: 4000 });
    expect((await lesson(t, "cancel_lesson", { booking_id: bookingId, expected_refund_cents: 4000 })).body.refunded_cents).toBe(4000);
    const { data: refund } = await service().from("stripe_test_object").select("data").eq("kind", "refund").eq("data->>payment_intent", pi).single();
    expect(refund!.data.amount).toBe(4000);
    expect(Number((await service().from("booking").select("commission_pct").eq("id", bookingId).single()).data!.commission_pct)).toBe(10);
  });
});

describe("rescheduling (spec section 5)", () => {
  it("once, 24 h or more ahead: both told, the old invite cancelled, the old time free", async () => {
    const since = new Date().toISOString();
    const { profileId, token } = await bookableTutor();
    const [a, b] = await Promise.all([learner(), learner()]);
    const old = slotAt(5, 10), next = slotAt(5, 14);
    const { bookingId } = await bookAndPay(a.t, profileId, old);
    expect((await lesson(a.t, "reschedule_options", { booking_id: bookingId })).body.slots).toContain(next);
    const moved = await lesson(a.t, "reschedule_lesson", { booking_id: bookingId, start_utc: next });
    expect(moved.status).toBe(200);
    expect(moved.body.lesson).toMatchObject({ start_at: next, reschedule_count: 1, can_reschedule: false, status: "confirmed" });
    const mail = await latestMail(a.u.email, since);
    expect(mail.subject).toContain("has moved");
    expect(mail.attachments).toEqual(["lesson-cancelled.ics", "lesson.ics"]);
    expect((await book(b.t, profileId, old)).status).toBe(200);
    expect((await lesson(a.t, "reschedule_lesson", { booking_id: bookingId, start_utc: slotAt(5, 18) })).body.error_code).toBe("RESCHEDULE_NOT_ALLOWED");
    expect((await lesson(token, "reschedule_lesson", { booking_id: bookingId, start_utc: slotAt(5, 18) })).status).toBe(403);
  });

  it("a move into another lesson's buffer is refused and changes nothing (also at the database)", async () => {
    const { profileId } = await bookableTutor({ bufferMinutes: 15 });
    const [a, b] = await Promise.all([learner(), learner()]);
    await bookAndPay(b.t, profileId, slotAt(6, 10)); // 10:00-11:00, blocked until 11:15
    const mine = await bookAndPay(a.t, profileId, slotAt(6, 14));
    const r = await lesson(a.t, "reschedule_lesson", { booking_id: mine.bookingId, start_utc: slotAt(6, 11) });
    expect(r.body.error_code).toBe("SLOT_TAKEN");
    const direct = await service().rpc("lesson_reschedule", { p_booking: mine.bookingId, p_learner: a.u.id, p_start: slotAt(6, 11), p_window_hours: 24 });
    expect(direct.data).toBe("slot_taken");
    expect((await service().from("booking").select("start_at, reschedule_count").eq("id", mine.bookingId).single()).data).toMatchObject({ reschedule_count: 0 });
  });

  it("inside 24 h a lesson cannot be moved", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u, t } = await learner();
    const { bookingId } = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursAhead(20) });
    expect((await lesson(t, "reschedule_lesson", { booking_id: bookingId, start_utc: slotAt(5, 10) })).body.error_code).toBe("RESCHEDULE_NOT_ALLOWED");
  });
});
