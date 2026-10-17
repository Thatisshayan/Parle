import { describe, it, expect, setDefaultTimeout } from "bun:test";
import {
  adminToken, bookableTutor, clearFakeFailures, failNext, fakeTransfers, learner, lesson, payoutAction, payoutOf, refundCount, schedulePayout, seedConfirmed, sendEvent, service,
} from "./helpers/lessons";
import { transferAmount } from "../supabase/functions/_shared/payouts/rules";
import { usableWebhookSecrets } from "../supabase/functions/_shared/webhook-secrets";
import { checkoutSessionParams } from "../supabase/functions/_shared/lessons/checkout-params";
import { money } from "../supabase/functions/_shared/lessons/mail-copy";

setDefaultTimeout(30_000);
const at = (h: number) => { const d = new Date(Date.now() + h * 3_600_000); d.setUTCSeconds(0, 0); return d.toISOString(); };

/** A completed lesson the learner reported: disputed, its payout held for an administrator. */
async function heldLesson() {
  const { profileId, tutor } = await bookableTutor();
  const { u, t } = await learner();
  const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-5), status: "completed" });
  await schedulePayout(b.bookingId);
  const r = await lesson(t, "report_problem", { booking_id: b.bookingId, kind: "other", details: "The audio kept cutting out." });
  if (r.status !== 200) throw new Error(`report ${r.status} ${r.body.error_code}`);
  return { bookingId: b.bookingId, pi: b.pi, payout: await payoutOf(b.bookingId) };
}
/** Stripe made a transfer for this payout but Parle never heard back (the fake keeps it as an object). */
const lostTransfer = (payoutId: string, bookingId: string) => service().from("stripe_test_object")
  .insert({ id: `tr_fake_lost_${crypto.randomUUID().slice(0, 8)}`, kind: "transfer", data: { payout_id: payoutId, booking_id: bookingId, amount: 3200, transfer_group: `payout-${payoutId}` } });

describe("Plan 7B final review fixes", () => {
  it("refund the learner after a transfer whose answer was lost: recorded as paid, nothing refunded (Important 1)", async () => {
    await clearFakeFailures();
    const admin = await adminToken();
    const h = await heldLesson();
    await lostTransfer(h.payout.id, h.bookingId);
    const r = await payoutAction(admin, "admin_refund_payout", { payout_id: h.payout.id });
    expect(r.body.error_code).toBe("ALREADY_PAID");
    expect(await payoutOf(h.bookingId)).toMatchObject({ status: "paid" });
    expect(await refundCount(h.pi)).toBe(0);
  });

  it("split after a transfer whose answer was lost: recorded as paid, nothing refunded (Important 1)", async () => {
    await clearFakeFailures();
    const admin = await adminToken();
    const h = await heldLesson();
    await lostTransfer(h.payout.id, h.bookingId);
    const r = await payoutAction(admin, "admin_split_payout", { payout_id: h.payout.id, refund_cents: 1000 });
    expect(r.body.error_code).toBe("ALREADY_PAID");
    expect(await payoutOf(h.bookingId)).toMatchObject({ status: "paid" });
    expect(await refundCount(h.pi)).toBe(0);
  });

  it("a chargeback does not end a claim while the transfer is being sent (Important 1)", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u } = await learner();
    const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-5), status: "completed" });
    await schedulePayout(b.bookingId, 0);
    const p = await payoutOf(b.bookingId);
    await service().from("payout").update({ transfer_started_at: new Date().toISOString() }).eq("id", p.id);
    const { data } = await service().rpc("payout_hold", { p_payout: p.id, p_reason: "chargeback" });
    expect(data).toBe("in_flight");
    expect((await payoutOf(b.bookingId)).transfer_started_at).not.toBeNull();
  });

  it("split refunds with its own reason, so a later full refund is not refused as a duplicate (Important 7)", async () => {
    await clearFakeFailures();
    const admin = await adminToken();
    const h = await heldLesson();
    expect((await payoutAction(admin, "admin_split_payout", { payout_id: h.payout.id, refund_cents: 1000 })).status).toBe(200);
    expect((await service().from("refund").select("reason").eq("booking_id", h.bookingId)).data).toEqual([{ reason: "admin_split" }]);
  });

  it("refund after payout can be pressed again after a failed reversal; refunded and reversed once (Important 3)", async () => {
    await clearFakeFailures();
    const admin = await adminToken();
    const h = await heldLesson();
    expect((await payoutAction(admin, "admin_release_payout", { payout_id: h.payout.id })).body.sent).toBe("paid");
    await failNext("reversal");
    const first = await payoutAction(admin, "admin_refund_after_payout", { payout_id: h.payout.id, refund_cents: 4000, tutor_share: "reverse" });
    expect(first.body.error_code).toBe("PAYOUT_ACTION_UNAVAILABLE");
    const again = await payoutAction(admin, "admin_refund_after_payout", { payout_id: h.payout.id, refund_cents: 4000, tutor_share: "reverse" });
    expect(again.status).toBe(200);
    expect(await refundCount(h.pi)).toBe(1);
    expect((await payoutOf(h.bookingId)).reversed_cents).toBe(3200);
  });

  it("a reversal is recorded as Stripe's total, never added twice (Important 3)", async () => {
    await clearFakeFailures();
    const admin = await adminToken();
    const h = await heldLesson();
    await payoutAction(admin, "admin_release_payout", { payout_id: h.payout.id });
    await service().rpc("payout_record_reversal", { p_payout: h.payout.id, p_reversal: "trr_a", p_amount: 1600 });
    await service().rpc("payout_record_reversal", { p_payout: h.payout.id, p_reversal: "trr_b", p_amount: 1600 });
    expect((await payoutOf(h.bookingId)).reversed_cents).toBe(1600);
  });

  it("the placeholder signing secret is never accepted (Important 4)", () => {
    expect(usableWebhookSecrets(["whsec_pending", "", "whsec_short", "whsec_abcdefghijklmnopqrstuvwxyz012345"])).toEqual(["whsec_abcdefghijklmnopqrstuvwxyz012345"]);
  });

  it("the safety net finds every paying lesson without a payout, oldest first (Important 5)", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u } = await learner();
    const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-30), status: "completed" });
    const { data, error } = await service().rpc("payout_missing", { p_limit: 5000 });
    expect(error).toBeNull();
    expect((data ?? []).map((r: any) => r.booking_id ?? r)).toContain(b.bookingId);
    await schedulePayout(b.bookingId);
    expect(((await service().rpc("payout_missing", { p_limit: 5000 })).data ?? []).map((r: any) => r.booking_id ?? r)).not.toContain(b.bookingId);
  });

  it("a scheduled payout on a disputed lesson is not picked for sending, so it cannot clog the batch (Important 6)", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u } = await learner();
    const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-5), status: "completed" });
    await schedulePayout(b.bookingId, 0);
    await service().from("booking").update({ status: "disputed", disputed_from: "completed", dispute_kind: "other" }).eq("id", b.bookingId);
    const { data, error } = await service().rpc("payout_due", { p_limit: 5000 });
    expect(error).toBeNull();
    expect((data ?? []).map((r: any) => r.id ?? r)).not.toContain((await payoutOf(b.bookingId)).id);
  });
});

describe("lessons in CAD (decision #55)", () => {
  it("checkout charges in CAD and emails show CAD", () => {
    const p = checkoutSessionParams({ bookingId: "b1", amountCents: 1400, description: "x", customerEmail: "a@example.test", expiresAt: 1, successUrl: "s", cancelUrl: "c" });
    expect(p.line_items[0].price_data.currency).toBe("cad");
    expect(money(4000)).toBe("$40.00 CAD");
  });

  it("a tutor's share is paid in the currency the payment settled in, at Stripe's rate when it was converted", () => {
    expect(transferAmount({ shareCents: 1120, chargeCurrency: "cad", settlementCurrency: "cad", exchangeRate: null })).toEqual({ currency: "cad", amountCents: 1120 });
    expect(transferAmount({ shareCents: 1120, chargeCurrency: "usd", settlementCurrency: "cad", exchangeRate: 1.4188 })).toEqual({ currency: "cad", amountCents: 1589 });
    expect(() => transferAmount({ shareCents: 1120, chargeCurrency: "usd", settlementCurrency: "cad", exchangeRate: null })).toThrow();
  });

  it("new lesson payments are recorded in CAD; a lesson paid in USD before the switch is paid out converted to CAD", async () => {
    await clearFakeFailures();
    const admin = await adminToken();
    const cad = await heldLesson();
    expect((await service().from("payment").select("currency").eq("booking_id", cad.bookingId).single()).data!.currency).toBe("cad");
    await payoutAction(admin, "admin_release_payout", { payout_id: cad.payout.id });
    expect(await payoutOf(cad.bookingId)).toMatchObject({ status: "paid", transfer_currency: "cad", transfer_cents: 3200 });
    const usd = await heldLesson();
    await service().from("payment").update({ currency: "usd" }).eq("booking_id", usd.bookingId);
    await payoutAction(admin, "admin_release_payout", { payout_id: usd.payout.id });
    expect(await payoutOf(usd.bookingId)).toMatchObject({ status: "paid", transfer_currency: "cad", transfer_cents: 4480 }); // fake rate 1.4
  });
});

describe("decisions after payout and refund counts (Plan 11: A64, A67)", () => {
  it("a chargeback decided after payout leaves the list; a second decision gets its own reversal (A64)", async () => {
    await clearFakeFailures();
    const admin = await adminToken();
    const h = await heldLesson();
    expect((await payoutAction(admin, "admin_release_payout", { payout_id: h.payout.id })).body.sent).toBe("paid");
    await sendEvent("charge.dispute.created", { id: `dp_${crypto.randomUUID().slice(0, 8)}`, object: "dispute", payment_intent: h.pi });
    expect((await payoutAction(admin, "admin_refund_after_payout", { payout_id: h.payout.id, refund_cents: 2000, tutor_share: "reverse" })).status).toBe(200);
    expect((await payoutAction(admin, "admin_list_payouts")).body.after_payout.map((i: any) => i.payout_id)).not.toContain(h.payout.id);
    await payoutAction(admin, "admin_refund_after_payout", { payout_id: h.payout.id, refund_cents: 4000, tutor_share: "reverse" });
    expect((await payoutOf(h.bookingId)).reversed_cents).toBe(3200);
  });
  it("charge.refunded arriving before the refund is recorded does not count it twice (A67)", async () => {
    const { profileId, tutor } = await bookableTutor(); const { u } = await learner();
    const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-5), status: "completed" });
    await service().from("payment").update({ refunded_cents: 1000, status: "partly_refunded" }).eq("booking_id", b.bookingId);
    await service().rpc("lesson_record_refund", { p_booking: b.bookingId, p_amount: 1000, p_refund_id: `re_${crypto.randomUUID()}`, p_reason: "admin_split", p_by: "t", p_event: null });
    expect((await service().from("payment").select("refunded_cents").eq("booking_id", b.bookingId).single()).data!.refunded_cents).toBe(1000);
  });
});

describe("a crashed refund decision and a split's reversal base (Plan 11: A62, A63)", () => {
  it("release refuses when an earlier refund decision refunded the learner but crashed (A62)", async () => {
    await clearFakeFailures();
    const admin = await adminToken();
    const h = await heldLesson();
    await service().from("stripe_test_object").insert({ id: `re_fake_crash_${crypto.randomUUID().slice(0, 8)}`, kind: "refund",
      data: { payment_intent: h.pi, amount: 4000, booking_id: h.bookingId, reason: "admin" } });
    await service().from("payout").update({ decision: "refund", decision_at: new Date(Date.now() - 6 * 60_000).toISOString() }).eq("id", h.payout.id);
    expect((await payoutAction(admin, "admin_release_payout", { payout_id: h.payout.id })).body.error_code).toBe("ALREADY_REFUNDED");
    expect(await fakeTransfers(h.payout.id)).toBe(0);
    expect((await payoutAction(admin, "admin_refund_payout", { payout_id: h.payout.id })).status).toBe(200);
    expect(await refundCount(h.pi)).toBe(1);
  });
  it("refund after payout following a split reverses the share of what the learner still paid (A63)", async () => {
    await clearFakeFailures();
    const admin = await adminToken();
    const h = await heldLesson();
    expect((await payoutAction(admin, "admin_split_payout", { payout_id: h.payout.id, refund_cents: 1000 })).body.sent).toBe("paid");
    expect((await payoutAction(admin, "admin_refund_after_payout", { payout_id: h.payout.id, refund_cents: 3000, tutor_share: "reverse" })).status).toBe(200);
    expect((await payoutOf(h.bookingId)).reversed_cents).toBe(2400);
  });
});
