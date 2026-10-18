import { describe, it, expect } from "bun:test";
import { book, bookableTutor, failNext, learner, lesson, pay, refundCount, seedConfirmed, service, slotAt } from "./helpers/lessons";

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

describe("quick presses and the payment page's expiry (Plan 11: A51, A58)", () => {
  it("two presses at once both open the learner's own hold, and it is not busy to them (R59)", async () => {
    for (let run = 0; run < 3; run++) {
      const { profileId } = await bookableTutor();
      const [{ t }, other] = await Promise.all([learner(), learner()]);
      const start = slotAt(5, 13);
      const diagnostic = { "x-parle-test-diagnostic": "ci-r59" };
      const [a, b] = await Promise.all([book(t, profileId, start, 60, "", diagnostic), book(t, profileId, start, 60, "", diagnostic)]);
      if (a.status !== 200 || b.status !== 200) console.error("R59 concurrent booking response codes", [a, b].map((r) => ({ status: r.status, code: r.body.error_code, diagnostic: r.body.diagnostic })));
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(b.body.booking_id).toBe(a.body.booking_id);
      const mine = (await lesson(t, "booking_options", { tutor_profile_id: profileId })).body.busy_intervals;
      expect(mine.some((x: any) => x.start_utc === start)).toBe(false);
      const theirs = (await lesson(other.t, "booking_options", { tutor_profile_id: profileId })).body.busy_intervals;
      expect(theirs.some((x: any) => x.start_utc === start)).toBe(true);
    }
  }, 90000);
  it("the payment page outlives the hold by about 3 minutes (R66)", async () => {
    const { profileId } = await bookableTutor(); const { t } = await learner();
    const r = await book(t, profileId, slotAt(6, 9));
    expect(r.status).toBe(200);
    const { data: b } = await service().from("booking").select("stripe_checkout_session_id, hold_expires_at").eq("id", r.body.booking_id).single();
    const { data: s } = await service().from("stripe_test_object").select("data").eq("id", b!.stripe_checkout_session_id).single();
    expect(Number(s!.data.expires_at) - Math.floor(Date.parse(b!.hold_expires_at) / 1000)).toBeGreaterThanOrEqual(170);
  }, 30000);
});

const hoursFromNow = (h: number) => { const d = new Date(Date.now() + h * 3_600_000); d.setUTCMinutes(0, 0, 0); return d.toISOString(); };

describe("the learner's list and changing one's mind (Plan 12: R125, R127)", () => {
  it("abandoned holds never push real lessons out of the learner's list (R125)", async () => {
    const { profileId, tutor } = await bookableTutor(); const { u, t } = await learner();
    const real = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursFromNow(-24 * 30), status: "completed" });
    const { data: row } = await service().from("booking").select("*").eq("id", real.bookingId).single();
    const { id: _id, ...base } = row as Record<string, unknown>;
    const abandoned = Array.from({ length: 110 }, (_, i) => ({ ...base, status: "expired", stripe_checkout_session_id: null,
      start_at: hoursFromNow(24 * (i + 2)), end_at: hoursFromNow(24 * (i + 2) + 1), blocked_until: hoursFromNow(24 * (i + 2) + 1), minutes: 60, hold_expires_at: hoursFromNow(-1) }));
    const { error } = await service().from("booking").insert(abandoned);
    if (error) throw error;
    const list = (await lesson(t, "learner_list_lessons")).body.lessons;
    expect(list.map((l: any) => l.id)).toContain(real.bookingId);
  }, 60000);
  it("booking a different time that overlaps one's own unpaid hold ends that hold (R127)", async () => {
    const { profileId } = await bookableTutor(); const { t } = await learner();
    const first = await book(t, profileId, slotAt(5, 10));
    expect(first.status).toBe(200);
    const second = await book(t, profileId, slotAt(5, 10, 30)); // 30 minutes later, overlapping the first hour
    expect([second.status, second.body.error_code ?? ""]).toEqual([200, ""]);
    expect(second.body.booking_id).not.toBe(first.body.booking_id);
    const { data } = await service().from("booking").select("status, cancelled_by").eq("id", first.body.booking_id).single();
    expect(data).toEqual({ status: "expired", cancelled_by: "learner" });
  }, 30000);
  it("booking another tutor at the same time never ends a learner's separate hold (R136)", async () => {
    const firstTutor = await bookableTutor();
    const secondTutor = await bookableTutor();
    const { t } = await learner();
    const slot = slotAt(5, 11);
    const held = await book(t, firstTutor.profileId, slot);
    expect(held.status).toBe(200);
    const otherTutor = await book(t, secondTutor.profileId, slot);
    expect(otherTutor.status).toBe(200);
    const { data } = await service().from("booking").select("status, cancelled_by").eq("id", held.body.booking_id).single();
    expect(data).toEqual({ status: "pending_payment", cancelled_by: null });
  }, 30000);
  it("a late payment for the hold the learner replaced is refunded, not confirmed (R127)", async () => {
    const { profileId } = await bookableTutor(); const { t } = await learner();
    const first = await book(t, profileId, slotAt(5, 14));
    expect((await book(t, profileId, slotAt(5, 14, 30))).status).toBe(200);
    const paid = await pay(first.body.booking_id);
    expect(paid.body.handled).toBe("slot_lost");
    expect(await refundCount(paid.pi)).toBe(1);
  }, 30000);
});

describe("changing one's mind, final review (Plan 12)", () => {
  const statusOf = async (id: string) => (await service().from("booking").select("status").eq("id", id).single()).data!.status;
  it("a time ending where one's own hold starts, with the tutor's buffer, ends that hold (review Important 1)", async () => {
    const { profileId } = await bookableTutor({ bufferMinutes: 15 }); const { t } = await learner();
    const held = await book(t, profileId, slotAt(6, 11));
    expect(held.status).toBe(200);
    const earlier = await book(t, profileId, slotAt(6, 10)); // 10:00-11:00 plus the 15-minute buffer reaches the 11:00 hold
    expect([earlier.status, earlier.body.error_code ?? ""]).toEqual([200, ""]);
    expect(await statusOf(held.body.booking_id)).toBe("expired");
  }, 60000);
  it("a stale page's taken time keeps one's own hold (review Minor 4)", async () => {
    const { profileId } = await bookableTutor(); const { t } = await learner(); const other = await learner();
    expect((await book(other.t, profileId, slotAt(6, 15), 30)).status).toBe(200); // someone else holds 15:00-15:30
    const mine = await book(t, profileId, slotAt(6, 14)); // 14:00-15:00
    expect(mine.status).toBe(200);
    const taken = await book(t, profileId, slotAt(6, 14, 30)); // 14:30-15:30 overlaps the other learner's hold
    expect(taken.body.error_code).toBe("SLOT_TAKEN");
    expect(await statusOf(mine.body.booking_id)).toBe("pending_payment");
  }, 60000);
  it("a hold already paid on Stripe's page is never ended for a new choice (review Minor 5)", async () => {
    const { profileId } = await bookableTutor(); const { t } = await learner();
    const paid = await book(t, profileId, slotAt(6, 17));
    await pay(paid.body.booking_id, { silent: true }); // paid on Stripe; the webhook has not arrived yet
    await book(t, profileId, slotAt(6, 17, 30));
    expect(await statusOf(paid.body.booking_id)).toBe("pending_payment");
  }, 60000);
});
