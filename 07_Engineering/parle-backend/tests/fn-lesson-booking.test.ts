import { describe, it, expect } from "bun:test";
import { book, bookableTutor, failNext, learner, lesson, service, slotAt } from "./helpers/lessons";

describe("booking a lesson (spec section 4)", () => {
  it("offers only lengths at or above $8, with their prices", async () => {
    const { profileId } = await bookableTutor({ hourlyRateCents: 1000 });
    const { t } = await learner();
    const r = await lesson(t, "booking_options", { tutor_profile_id: profileId });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ can_book: true, reason: null, offered_lengths: [60], prices: { "60": 1000 }, minimum_notice_hours: 12, horizon_days: 30, hold_minutes: 30 });
  });

  it("holds the slot for 30 minutes, freezes price, commission and buffer, and opens Checkout", async () => {
    const { profileId, tutor } = await bookableTutor({ hourlyRateCents: 4000, bufferMinutes: 10 });
    const { u, t } = await learner();
    const r = await book(t, profileId, slotAt(3, 10), 45, "Bonjour <3");
    expect(r.status).toBe(200);
    expect(r.body.checkout_url.startsWith("https://checkout.stripe.com/")).toBe(true);
    const { data } = await service().from("booking").select("status, price_cents, commission_pct, buffer_minutes, learner_id, tutor_id, hold_expires_at, learner_message").eq("id", r.body.booking_id).single();
    expect(data).toMatchObject({ status: "pending_payment", price_cents: 3000, buffer_minutes: 10, learner_id: u.id, tutor_id: tutor.id, learner_message: "Bonjour <3" });
    expect(Number(data!.commission_pct)).toBe(20);
    const holdMinutes = (Date.parse(data!.hold_expires_at) - Date.now()) / 60_000;
    expect(holdMinutes > 29 && holdMinutes <= 30).toBe(true);
  });

  it("freezes the founding commission for a founding tutor", async () => {
    const { profileId } = await bookableTutor({ foundingUntil: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10) });
    const { t } = await learner();
    const r = await book(t, profileId, slotAt(3, 12));
    expect(Number((await service().from("booking").select("commission_pct").eq("id", r.body.booking_id).single()).data!.commission_pct)).toBe(10);
  });

  it("two learners, one slot: the second is told it was just taken", async () => {
    const { profileId } = await bookableTutor();
    const [a, b] = await Promise.all([learner(), learner()]);
    const start = slotAt(4, 9);
    const answers = await Promise.all([book(a.t, profileId, start), book(b.t, profileId, start)]);
    expect(answers.map((r) => (r.status === 200 ? "ok" : r.body.error_code)).sort()).toEqual(["SLOT_TAKEN", "ok"]);
  });

  it("a second press resumes the same hold (Review Focus 1)", async () => {
    const { profileId } = await bookableTutor();
    const { t } = await learner();
    const start = slotAt(5, 11);
    const first = await book(t, profileId, start);
    const second = await book(t, profileId, start);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });

  it("refuses a tutor, a time inside the notice, and a time not offered", async () => {
    const { profileId, token } = await bookableTutor();
    expect((await book(token, profileId, slotAt(3, 10))).body.error_code).toBe("LEARNER_ONLY");
    const { t } = await learner();
    const soon = new Date(Date.now() + 2 * 3_600_000);
    soon.setUTCMinutes(0, 0, 0);
    expect((await book(t, profileId, soon.toISOString(), 30)).body.error_code).toBe("NOTICE_TOO_SHORT");
    expect((await book(t, profileId, slotAt(3, 23))).body.error_code).toBe("SLOT_TAKEN"); // 23:00 + 60 min ends after 23:45
  });

  it("a learner may hold at most 3 lessons at once", async () => {
    const { profileId } = await bookableTutor();
    const { t } = await learner();
    for (const hour of [8, 10, 12]) expect((await book(t, profileId, slotAt(9, hour))).status).toBe(200);
    expect((await book(t, profileId, slotAt(9, 14))).body.error_code).toBe("HOLD_LIMIT");
  });

  it("a tutor whose payout account cannot receive payouts shows 'Booking opens soon' (require_payout_account is on)", async () => {
    const closed = await bookableTutor({ payouts: false });
    const open = await bookableTutor();
    const { t } = await learner();
    expect((await lesson(t, "booking_options", { tutor_profile_id: closed.profileId })).body).toMatchObject({ can_book: false, reason: "BOOKING_NOT_OPEN" });
    expect((await book(t, closed.profileId, slotAt(3, 15))).body.error_code).toBe("BOOKING_NOT_OPEN");
    await service().from("tutor_payout_account").insert({ tutor_id: closed.tutor.id, stripe_account_id: `acct_test_late_${crypto.randomUUID().slice(0, 8)}`, payouts_enabled: false, country: "CA" });
    expect((await lesson(t, "booking_options", { tutor_profile_id: closed.profileId })).body.can_book).toBe(false);
    await service().from("tutor_payout_account").update({ payouts_enabled: true }).eq("tutor_id", closed.tutor.id);
    expect((await lesson(t, "booking_options", { tutor_profile_id: closed.profileId })).body.can_book).toBe(true);
    expect((await lesson(t, "booking_options", { tutor_profile_id: open.profileId })).body).toMatchObject({ can_book: true, reason: null });
  });

  it("the learner sees the hold; the tutor sees nothing until it is paid; others get not found", async () => {
    const { profileId, token } = await bookableTutor();
    const [a, b] = await Promise.all([learner(), learner()]);
    const r = await book(a.t, profileId, slotAt(6, 13));
    const mine = await lesson(a.t, "learner_list_lessons");
    expect(mine.body.lessons.find((x: any) => x.id === r.body.booking_id)).toMatchObject({ status: "pending_payment", meeting_link: "", price_cents: 4000 });
    expect((await lesson(token, "tutor_list_lessons")).body.lessons.some((x: any) => x.id === r.body.booking_id)).toBe(false);
    expect((await lesson(b.t, "lesson_status", { booking_id: r.body.booking_id })).status).toBe(404);
    expect((await lesson(a.t, "resume_checkout", { booking_id: r.body.booking_id })).body.checkout_url).toBe(r.body.checkout_url);
  });

  it("a Checkout page that cannot open frees the slot at once", async () => {
    const { profileId } = await bookableTutor();
    const { t } = await learner();
    await failNext("checkout");
    const r = await book(t, profileId, slotAt(8, 10));
    expect(r.status).toBe(503);
    expect(r.body.error_code).toBe("PAYMENT_UNAVAILABLE");
    expect((await book(t, profileId, slotAt(8, 10))).status).toBe(200);
  });
});
