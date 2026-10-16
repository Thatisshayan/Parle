import { describe, it, expect } from "bun:test";
import { latestMail } from "./helpers/mailpit";
import {
  adminToken, bookableTutor, clearFakeFailures, failNext, fakeTransfers, learner, lesson, onlyTheseDue, payoutAction, payoutOf, refundCount, runJobs,
  schedulePayout, seedConfirmed, service,
} from "./helpers/lessons";

const at = (h: number) => { const d = new Date(Date.now() + h * 3_600_000); d.setUTCSeconds(0, 0); return d.toISOString(); };
const audits = async (payoutId: string) => ((await service().from("admin_audit_log").select("action").eq("target_id", payoutId)).data ?? []).map((a: any) => a.action);

/** A completed lesson the learner reported: disputed, its payout held for an administrator. */
async function heldLesson() {
  const { profileId, tutor, token } = await bookableTutor();
  const { u, t } = await learner();
  const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-5), status: "completed" });
  await schedulePayout(b.bookingId);
  const r = await lesson(t, "report_problem", { booking_id: b.bookingId, kind: "other", details: "The audio kept cutting out." });
  if (r.status !== 200) throw new Error(`report ${r.status} ${r.body.error_code}`);
  return { tutorToken: token, learner: u, learnerToken: t, bookingId: b.bookingId, pi: b.pi, payout: await payoutOf(b.bookingId) };
}

describe("administrator payout decisions (spec section 7)", () => {
  it("the Payouts screen lists held payouts; release pays the tutor now, restores the lesson and is audited", async () => {
    await clearFakeFailures();
    const admin = await adminToken();
    const h = await heldLesson();
    const list = await payoutAction(admin, "admin_list_payouts");
    expect(list.status).toBe(200);
    expect(list.body.held.find((x: any) => x.payout_id === h.payout.id)).toMatchObject({ hold_reason: "dispute", lesson_status: "disputed", dispute_details: "The audio kept cutting out.", amount_cents: 3200, price_cents: 4000, commission_pct: 20 });
    const r = await payoutAction(admin, "admin_release_payout", { payout_id: h.payout.id });
    expect(r.status).toBe(200);
    expect(r.body.sent).toBe("paid");
    expect(await payoutOf(h.bookingId)).toMatchObject({ status: "paid", hold_reason: null });
    expect((await service().from("booking").select("status").eq("id", h.bookingId).single()).data!.status).toBe("completed");
    expect(await audits(h.payout.id)).toEqual(["payout.release"]);
    expect((await lesson(h.learnerToken, "learner_list_lessons")).body.lessons.find((l: any) => l.id === h.bookingId).can_report).toBe(false);
  });

  it("refund the learner cancels the payout, refunds once and emails the learner", async () => {
    const admin = await adminToken();
    const h = await heldLesson();
    const since = new Date().toISOString();
    expect((await payoutAction(admin, "admin_refund_payout", { payout_id: h.payout.id })).status).toBe(200);
    expect(await payoutOf(h.bookingId)).toMatchObject({ status: "cancelled", hold_reason: null });
    expect((await service().from("payment").select("status, refunded_cents").eq("booking_id", h.bookingId).single()).data).toEqual({ status: "refunded", refunded_cents: 4000 });
    expect((await service().from("refund").select("reason, amount_cents").eq("booking_id", h.bookingId)).data).toEqual([{ reason: "admin", amount_cents: 4000 }]);
    expect((await payoutAction(admin, "admin_refund_payout", { payout_id: h.payout.id })).body.error_code).toBe("PAYOUT_BUSY");
    expect(await refundCount(h.pi)).toBe(1);
    expect((await latestMail(h.learner.email, since)).subject).toContain("We refunded");
    expect(await audits(h.payout.id)).toEqual(["payout.refund"]);
  });

  it("split refunds part and pays the tutor their share of the rest; impossible amounts are refused", async () => {
    await clearFakeFailures();
    const admin = await adminToken();
    const h = await heldLesson();
    for (const bad of [0, 4000, 12.5, -100]) {
      expect((await payoutAction(admin, "admin_split_payout", { payout_id: h.payout.id, refund_cents: bad })).body.error_code).toBe("AMOUNT_INVALID");
    }
    const r = await payoutAction(admin, "admin_split_payout", { payout_id: h.payout.id, refund_cents: 1000 });
    expect(r.status).toBe(200);
    const after = await payoutOf(h.bookingId);
    expect(after).toMatchObject({ status: "paid", amount_cents: 2400, commission_cents: 600 });
    expect((await service().from("refund").select("reason, amount_cents").eq("booking_id", h.bookingId)).data).toEqual([{ reason: "admin_split", amount_cents: 1000 }]);
    expect((await service().from("stripe_test_object").select("data").eq("id", after.stripe_transfer_id).single()).data!.data.amount).toBe(2400);
    expect(await audits(h.payout.id)).toEqual(["payout.split"]);
  });

  it("two administrators at once: one decision, one Stripe action (Review Focus 3)", async () => {
    await clearFakeFailures();
    const [a1, a2] = await Promise.all([adminToken(), adminToken()]);
    const h = await heldLesson();
    const results = await Promise.all([
      payoutAction(a1, "admin_release_payout", { payout_id: h.payout.id }),
      payoutAction(a2, "admin_refund_payout", { payout_id: h.payout.id }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await fakeTransfers(h.payout.id)) + (await refundCount(h.pi))).toBe(1);
    expect((await audits(h.payout.id)).length).toBe(1);
  });

  it("after a payout: refund with the tutor's share taken back, or absorbed by Parle", async () => {
    await clearFakeFailures();
    const admin = await adminToken();
    const { profileId, tutor } = await bookableTutor();
    const { u } = await learner();
    const paidLesson = async (hours: number) => {
      const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-hours), status: "completed" });
      await schedulePayout(b.bookingId, 500); // not due: no job run may send it
      const p = await payoutOf(b.bookingId);
      await service().rpc("payout_mark_paid", { p_payout: p.id, p_transfer: `tr_paid_${crypto.randomUUID().slice(0, 8)}` });
      return { ...b, payoutId: p.id as string };
    };
    const back = await paidLesson(100);
    expect((await payoutAction(admin, "admin_refund_payout", { payout_id: back.payoutId })).body.error_code).toBe("PAYOUT_BUSY");
    expect((await payoutAction(admin, "admin_refund_after_payout", { payout_id: back.payoutId, refund_cents: 2000 })).body.error_code).toBe("CHOICE_REQUIRED");
    expect((await payoutAction(admin, "admin_refund_after_payout", { payout_id: back.payoutId, refund_cents: 2000, tutor_share: "reverse" })).status).toBe(200);
    expect((await service().from("refund").select("reason, amount_cents").eq("booking_id", back.bookingId)).data).toEqual([{ reason: "admin_after_payout", amount_cents: 2000 }]);
    expect(await payoutOf(back.bookingId)).toMatchObject({ status: "paid", reversed_cents: 1600 });
    const { data: reversals } = await service().from("stripe_test_object").select("data").eq("kind", "reversal").eq("data->>payout_id", back.payoutId);
    expect(reversals!.map((x: any) => x.data.amount)).toEqual([1600]);
    const absorbed = await paidLesson(110);
    expect((await payoutAction(admin, "admin_refund_after_payout", { payout_id: absorbed.payoutId, refund_cents: 4000, tutor_share: "absorb" })).status).toBe(200);
    expect(await payoutOf(absorbed.bookingId)).toMatchObject({ status: "paid", reversed_cents: 0 });
    expect(await refundCount(absorbed.pi)).toBe(1);
    expect(await audits(absorbed.payoutId)).toEqual(["payout.refund_after_payout"]);
  });

  it("releasing a payout whose earlier transfer went through records it, never pays twice (Review Focus 2)", async () => {
    await clearFakeFailures();
    const admin = await adminToken();
    const { profileId, tutor } = await bookableTutor();
    const { u } = await learner();
    const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-80), status: "completed" });
    await schedulePayout(b.bookingId, 0);
    const p = await payoutOf(b.bookingId);
    await onlyTheseDue([p.id]);
    await failNext("transfer_lost");
    await runJobs();
    expect(await payoutOf(b.bookingId)).toMatchObject({ status: "held", hold_reason: "transfer_failed", stripe_transfer_id: null });
    expect(await fakeTransfers(p.id)).toBe(1);
    expect((await payoutAction(admin, "admin_release_payout", { payout_id: p.id })).body.sent).toBe("paid");
    expect(await payoutOf(b.bookingId)).toMatchObject({ status: "paid", transfer_attempt: 1 });
    expect(await fakeTransfers(p.id)).toBe(1);
  });

  it("on a chargeback, refund learner only cancels the tutor's payout (the bank already returned the money)", async () => {
    const admin = await adminToken();
    const { profileId, tutor } = await bookableTutor();
    const { u } = await learner();
    const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-80), status: "completed" });
    await service().from("payment").update({ status: "disputed" }).eq("booking_id", b.bookingId);
    await schedulePayout(b.bookingId);
    const p = await payoutOf(b.bookingId);
    expect(p).toMatchObject({ status: "held", hold_reason: "chargeback" });
    expect((await payoutAction(admin, "admin_split_payout", { payout_id: p.id, refund_cents: 1000 })).body.error_code).toBe("CHARGEBACK_OPEN");
    expect((await payoutAction(admin, "admin_refund_payout", { payout_id: p.id })).status).toBe(200);
    expect((await payoutOf(b.bookingId)).status).toBe("cancelled");
    expect(await refundCount(b.pi)).toBe(0);
  });

  it("only administrators see and decide payouts", async () => {
    const h = await heldLesson();
    for (const token of [h.learnerToken, h.tutorToken]) {
      expect((await payoutAction(token, "admin_list_payouts")).body.error_code).toBe("ADMIN_REQUIRED");
      expect((await payoutAction(token, "admin_release_payout", { payout_id: h.payout.id })).body.error_code).toBe("ADMIN_REQUIRED");
    }
    expect((await payoutOf(h.bookingId)).status).toBe("held");
  });
});
