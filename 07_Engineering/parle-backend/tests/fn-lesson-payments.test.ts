import { describe, it, expect } from "bun:test";
import { latestMail } from "./helpers/mailpit";
import { LOCAL_URL } from "./helpers/local";
import { callFunction } from "./helpers/functions-env";
import { book, bookAndPay, bookableTutor, clearLapsedHolds, failNext, learner, lesson, pay, refundCount, runJobs, sendEvent, service, slotAt } from "./helpers/lessons";

const statusOf = async (id: string) => (await service().from("booking").select("status").eq("id", id).single()).data!.status;
const lapse = (id: string) => service().from("booking").update({ hold_expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", id);

describe("Stripe's payment event confirms the lesson (spec section 4)", () => {
  it("only the paid event confirms, records one payment and shows the meeting link", async () => {
    const { profileId } = await bookableTutor();
    const { t } = await learner();
    const r = await book(t, profileId, slotAt(3, 10));
    expect((await lesson(t, "lesson_status", { booking_id: r.body.booking_id })).body.lesson.status).toBe("pending_payment");
    const paid = await pay(r.body.booking_id);
    expect(paid.status).toBe(200);
    expect(paid.body.handled).toBe("confirmed");
    const view = (await lesson(t, "lesson_status", { booking_id: r.body.booking_id })).body.lesson;
    expect(view).toMatchObject({ status: "confirmed", meeting_link: "https://meet.google.com/abc-defg-hij", hold_expires_at: null });
    expect((await service().from("payment").select("amount_cents, status").eq("booking_id", r.body.booking_id).single()).data).toEqual({ amount_cents: 4000, status: "succeeded" });
  });

  it("the same event twice, or a second event for the same payment, is recorded once", async () => {
    const { profileId } = await bookableTutor();
    const { t } = await learner();
    const r = await book(t, profileId, slotAt(3, 12));
    const first = await pay(r.body.booking_id, { eventId: `evt_dup_${crypto.randomUUID().slice(0, 8)}` });
    const again = await sendEvent("checkout.session.completed", first.object, first.id);
    expect(again.body.handled).toBe("duplicate");
    const other = await sendEvent("checkout.session.completed", first.object);
    expect(other.body.handled).toBe("duplicate");
    expect((await service().from("payment").select("id").eq("booking_id", r.body.booking_id)).data!.length).toBe(1);
  });

  it("an unsigned event, or an unpaid completion, changes nothing", async () => {
    const { profileId } = await bookableTutor();
    const { t } = await learner();
    const r = await book(t, profileId, slotAt(3, 14));
    const unsigned = await fetch(`${LOCAL_URL}/functions/v1/stripe-webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(unsigned.status).toBe(400);
    const { data: b } = await service().from("booking").select("stripe_checkout_session_id").eq("id", r.body.booking_id).single();
    const unpaid = await sendEvent("checkout.session.completed", { id: b!.stripe_checkout_session_id, object: "checkout.session", mode: "payment", payment_status: "unpaid", metadata: { kind: "lesson", booking_id: r.body.booking_id } });
    expect(unpaid.body).toEqual({ received: true, handled: false });
    expect(await statusOf(r.body.booking_id)).toBe("pending_payment");
  });

  it("payment after the hold expired confirms when the time is still free", async () => {
    const { profileId } = await bookableTutor();
    const { t } = await learner();
    const r = await book(t, profileId, slotAt(4, 10));
    await service().from("booking").update({ status: "expired", hold_expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", r.body.booking_id);
    expect((await pay(r.body.booking_id)).body.handled).toBe("confirmed_late");
    expect(await statusOf(r.body.booking_id)).toBe("confirmed");
  });

  it("payment after the hold expired, with the time taken, is refunded once as slot_lost", async () => {
    const { profileId } = await bookableTutor();
    const [a, b] = await Promise.all([learner(), learner()]);
    const start = slotAt(4, 13);
    const first = await book(a.t, profileId, start);
    await lapse(first.body.booking_id);
    const second = await book(b.t, profileId, start);
    expect(second.status).toBe(200);
    const paid = await pay(first.body.booking_id);
    expect(paid.body.handled).toBe("slot_lost");
    expect(await refundCount(paid.pi)).toBe(1);
    expect(await statusOf(first.body.booking_id)).toBe("expired");
    expect(await statusOf(second.body.booking_id)).toBe("pending_payment");
    expect((await service().from("refund").select("reason, amount_cents").eq("booking_id", first.body.booking_id)).data).toEqual([{ reason: "slot_lost", amount_cents: 4000 }]);
    expect((await service().from("payment").select("status").eq("booking_id", first.body.booking_id).single()).data!.status).toBe("refunded");
    expect((await sendEvent("checkout.session.completed", paid.object, paid.id)).body.handled).toBe("duplicate");
    expect(await refundCount(paid.pi)).toBe(1);
    // A55 (R63): the learner back from Stripe sees the refund, and the lesson stays in their list
    expect((await lesson(a.t, "lesson_status", { booking_id: first.body.booking_id })).body.lesson.refund_reason).toBe("slot_lost");
    expect((await lesson(a.t, "learner_list_lessons")).body.lessons.map((l: any) => l.id)).toContain(first.body.booking_id);
  });

  it("a slot_lost refund that fails is tried again when Stripe retries the event", async () => {
    const { profileId } = await bookableTutor();
    const [a, b] = await Promise.all([learner(), learner()]);
    const start = slotAt(5, 13);
    const first = await book(a.t, profileId, start);
    await lapse(first.body.booking_id);
    await book(b.t, profileId, start);
    await failNext("refund");
    const paid = await pay(first.body.booking_id);
    expect(paid.status).toBe(500);
    expect(await refundCount(paid.pi)).toBe(0);
    const retry = await sendEvent("checkout.session.completed", paid.object, paid.id);
    expect(retry.body.handled).toBe("slot_lost");
    expect(await refundCount(paid.pi)).toBe(1);
  });

  it("checkout.session.expired ends the hold and frees the time", async () => {
    const { profileId } = await bookableTutor();
    const [a, b] = await Promise.all([learner(), learner()]);
    const start = slotAt(6, 10);
    const r = await book(a.t, profileId, start);
    const { data } = await service().from("booking").select("stripe_checkout_session_id").eq("id", r.body.booking_id).single();
    const ev = await sendEvent("checkout.session.expired", { id: data!.stripe_checkout_session_id, object: "checkout.session", mode: "payment", status: "expired", metadata: { kind: "lesson", booking_id: r.body.booking_id } });
    expect(ev.body.handled).toBe("expired");
    expect(await statusOf(r.body.booking_id)).toBe("expired");
    expect((await book(b.t, profileId, start)).status).toBe(200);
  });

  it("charge.refunded from Stripe's dashboard and charge.dispute.created update the payment", async () => {
    const { profileId } = await bookableTutor();
    const { t } = await learner();
    const a = await bookAndPay(t, profileId, slotAt(7, 10));
    expect((await sendEvent("charge.refunded", { id: "ch_1", object: "charge", payment_intent: a.pi, amount: 4000, amount_refunded: 1000 })).body.handled).toBe("refund_recorded");
    expect((await service().from("payment").select("status, refunded_cents").eq("booking_id", a.bookingId).single()).data).toEqual({ status: "partly_refunded", refunded_cents: 1000 });
    const b = await bookAndPay(t, profileId, slotAt(7, 13));
    expect((await sendEvent("charge.dispute.created", { id: "dp_1", object: "dispute", payment_intent: b.pi })).body.handled).toBe("disputed");
    expect((await service().from("payment").select("status").eq("booking_id", b.bookingId).single()).data!.status).toBe("disputed");
  });
  it("a payment whose Checkout id was never saved still confirms, found by its booking id (final review, Important 1)", async () => {
    const { profileId } = await bookableTutor();
    const { t } = await learner();
    const r = await book(t, profileId, slotAt(10, 10));
    const db = service();
    const { data: b } = await db.from("booking").select("stripe_checkout_session_id, price_cents").eq("id", r.body.booking_id).single();
    const sessionId = b!.stripe_checkout_session_id as string;
    await db.from("booking").update({ stripe_checkout_session_id: null }).eq("id", r.body.booking_id); // the save after Checkout failed
    const pi = `pi_fake_${crypto.randomUUID().replaceAll("-", "")}`;
    const ev = await sendEvent("checkout.session.completed", { id: sessionId, object: "checkout.session", mode: "payment", status: "complete", payment_status: "paid", amount_total: b!.price_cents, currency: "usd", payment_intent: pi, metadata: { kind: "lesson", booking_id: r.body.booking_id } });
    expect(ev.body.handled).toBe("confirmed");
    expect(await statusOf(r.body.booking_id)).toBe("confirmed");
  });
});

describe("reconciliation job (a missed Stripe event)", () => {
  it("refuses calls without the cron secret", async () => {
    expect((await callFunction("parle-booking-jobs", null, {})).status).toBe(401);
  });

  it("confirms a hold Stripe says is paid, and expires an abandoned one", async () => {
    await clearLapsedHolds();
    const { profileId } = await bookableTutor();
    const [a, b] = await Promise.all([learner(), learner()]);
    const paidQuietly = await book(a.t, profileId, slotAt(8, 10));
    await pay(paidQuietly.body.booking_id, { silent: true });
    const abandoned = await book(b.t, profileId, slotAt(8, 13));
    // older than any other open hold (holds last 30 minutes), so the job's oldest-first batch reaches these two
    const old = new Date(Date.now() - 29 * 60_000).toISOString();
    await service().from("booking").update({ created_at: old }).in("id", [paidQuietly.body.booking_id, abandoned.body.booking_id]);
    await lapse(abandoned.body.booking_id);
    for (let i = 0; i < 3 && (await statusOf(paidQuietly.body.booking_id)) !== "confirmed"; i++) {
      const r = await runJobs();
      expect(r.status).toBe(200);
    }
    expect(await statusOf(paidQuietly.body.booking_id)).toBe("confirmed");
    expect(await statusOf(abandoned.body.booking_id)).toBe("expired");
  }, 60000);

  it("one hold that Stripe cannot read does not stop the others (final review, Important 3)", async () => {
    await clearLapsedHolds();
    const { profileId } = await bookableTutor();
    const [a, b] = await Promise.all([learner(), learner()]);
    const bad = await book(a.t, profileId, slotAt(9, 10));
    const abandoned = await book(b.t, profileId, slotAt(9, 13));
    const db = service();
    // the oldest open holds, so the job's batch of 20 reaches them whatever other tests left open (Plan 11)
    await db.from("booking").update({ created_at: new Date(Date.now() - 49 * 3_600_000).toISOString() }).eq("id", bad.body.booking_id);
    await db.from("booking").update({ created_at: new Date(Date.now() - 48 * 3_600_000).toISOString() }).eq("id", abandoned.body.booking_id);
    await lapse(bad.body.booking_id);
    await lapse(abandoned.body.booking_id);
    await failNext("retrieve"); // the oldest hold's Stripe page cannot be read in this run
    const r = await runJobs();
    expect(r.status).toBe(200);
    expect(await statusOf(abandoned.body.booking_id)).toBe("expired");
  }, 60000);
});

describe("holds ended by a deletion or a pause (Plan 11: A59, R67)", () => {
  it("a payment for a hold ended by account deletion is refunded, not confirmed", async () => {
    const { profileId } = await bookableTutor(); const { t } = await learner();
    const r = await book(t, profileId, slotAt(4, 17));
    await service().from("booking").update({ status: "expired", cancelled_by: "account_deleted" }).eq("id", r.body.booking_id);
    const paid = await pay(r.body.booking_id);
    expect(paid.body.handled).toBe("slot_lost");
    expect(await refundCount(paid.pi)).toBe(1);
  }, 30000);
});

describe("slot-lost refund email (Plan 11: A55, R63)", () => {
  it("explains when the learner replaced this hold with a different time (R133)", async () => {
    const { profileId } = await bookableTutor(); const { u, t } = await learner();
    const r = await book(t, profileId, slotAt(4, 17));
    const since = new Date().toISOString();
    await service().from("booking").update({ status: "expired", cancelled_by: "learner" }).eq("id", r.body.booking_id);
    const paid = await pay(r.body.booking_id);
    expect(paid.body.handled).toBe("slot_lost");
    expect(await refundCount(paid.pi)).toBe(1);
    const mail = await latestMail(u.email, since);
    const text = mail?.text ?? mail?.html ?? "";
    expect(text).toContain("chose a different lesson time");
    expect(text).not.toContain("booked by someone else");
  }, 40000);

  it("is sent with its real reason when the tutor's account is gone", async () => {
    const { profileId } = await bookableTutor(); const { u, t } = await learner();
    const r = await book(t, profileId, slotAt(4, 18));
    const since = new Date().toISOString();
    await service().from("booking").update({ tutor_id: null }).eq("id", r.body.booking_id);
    const paid = await pay(r.body.booking_id);
    expect(paid.body.handled).toBe("slot_lost");
    const mail = await latestMail(u.email, since);
    expect(mail?.subject).toBe("Your payment was refunded");
    expect(mail?.text ?? mail?.html ?? "").not.toContain("someone else");
  }, 40000);
});

describe("a late payment for a paused person (Plan 11 final review)", () => {
  const pause = async (userId: string) => {
    const { error } = await service().from("account_status").insert({ user_id: userId, status: "disabled", reason: "Investigation", lessons_choice: "keep", changed_by: userId });
    if (error) throw error;
  };
  it("a lapsed hold paid after the tutor was paused with keep is refunded, not confirmed", async () => {
    const { profileId, tutor } = await bookableTutor(); const { t } = await learner();
    const r = await book(t, profileId, slotAt(4, 19));
    await service().from("booking").update({ status: "expired" }).eq("id", r.body.booking_id); // lapsed: cancelled_by stays empty
    await pause(tutor.id);
    const paid = await pay(r.body.booking_id);
    expect(paid.body.handled).toBe("slot_lost");
    expect(await refundCount(paid.pi)).toBe(1);
  }, 30000);
  it("an open hold paid after the learner was paused is refunded, not confirmed", async () => {
    const { profileId } = await bookableTutor(); const { u, t } = await learner();
    const r = await book(t, profileId, slotAt(4, 20));
    await pause(u.id);
    const paid = await pay(r.body.booking_id);
    expect(paid.body.handled).toBe("slot_lost");
    expect(await refundCount(paid.pi)).toBe(1);
  }, 30000);
});

describe("a paused learner's refund email (Plan 12: R126)", () => {
  it("says their account is paused, not that the tutor is away", async () => {
    const { profileId } = await bookableTutor(); const { u, t } = await learner();
    const r = await book(t, profileId, slotAt(4, 22));
    const { error } = await service().from("account_status").insert({ user_id: u.id, status: "disabled", reason: "Investigation", lessons_choice: "keep", changed_by: u.id });
    if (error) throw error;
    const since = new Date().toISOString();
    expect((await pay(r.body.booking_id)).body.handled).toBe("slot_lost");
    const mail = await latestMail(u.email, since);
    const text = mail?.text ?? mail?.html ?? "";
    expect(text).toContain("account is paused");
    expect(text).not.toContain("not taking lessons");
  }, 40000);
});
