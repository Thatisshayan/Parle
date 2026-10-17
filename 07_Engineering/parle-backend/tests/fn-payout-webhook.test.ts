import { describe, it, expect } from "bun:test";
import { latestMail } from "./helpers/mailpit";
import { ADMIN_ALERTS, bookableTutor, ensurePayoutCountry, learner, lesson, payoutAction, payoutOf, schedulePayout, seedConfirmed, sendEvent, service, setFakeAccount } from "./helpers/lessons";

const at = (h: number) => { const d = new Date(Date.now() + h * 3_600_000); d.setUTCSeconds(0, 0); return d.toISOString(); };
const accountEvent = (id: string, enabled: boolean) => ({
  id, object: "account", country: "CA", payouts_enabled: enabled, details_submitted: true,
  requirements: { disabled_reason: enabled ? null : "requirements.past_due" },
});

describe("Stripe events for payouts (spec sections 7 and 8)", () => {
  it("account.updated opens and closes booking for the tutor (Review Focus 5)", async () => {
    await ensurePayoutCountry("Canada", "CA", "supported");
    const { tutor, token, profileId } = await bookableTutor({ payouts: false });
    await payoutAction(token, "tutor_payout_onboarding");
    const accountId = (await service().from("tutor_payout_account").select("stripe_account_id").eq("tutor_id", tutor.id).single()).data!.stripe_account_id as string;
    const { t } = await learner();
    expect((await lesson(t, "booking_options", { tutor_profile_id: profileId })).body.can_book).toBe(false);
    await setFakeAccount(accountId, accountEvent(accountId, true)); // Plan 11: the handler reads Stripe's current state
    const on = await sendEvent("account.updated", accountEvent(accountId, true), undefined, { account: accountId });
    expect(on.status).toBe(200);
    expect(on.body.handled).toBe("account_updated");
    expect((await lesson(t, "booking_options", { tutor_profile_id: profileId })).body.can_book).toBe(true);
    await setFakeAccount(accountId, accountEvent(accountId, false));
    await sendEvent("account.updated", accountEvent(accountId, false), undefined, { account: accountId });
    expect((await lesson(t, "booking_options", { tutor_profile_id: profileId })).body).toMatchObject({ can_book: false, reason: "BOOKING_NOT_OPEN" });
    expect((await service().from("tutor_payout_account").select("disabled_reason").eq("tutor_id", tutor.id).single()).data!.disabled_reason).toBe("requirements.past_due");
  });

  it("an event signed with neither secret is refused; the same event twice is recorded once; other accounts are ignored", async () => {
    const stranger = `acct_unknown_${crypto.randomUUID().slice(0, 8)}`;
    expect((await sendEvent("account.updated", accountEvent(stranger, true), undefined, { account: stranger, secret: "whsec_wrong" })).status).toBe(400);
    const id = `evt_dup_${crypto.randomUUID().slice(0, 8)}`;
    expect((await sendEvent("account.updated", accountEvent(stranger, true), id, { account: stranger })).body.handled).toBe("account_unknown");
    expect((await sendEvent("account.updated", accountEvent(stranger, true), id, { account: stranger })).body.handled).toBe("duplicate");
  });

  it("transfer.created records a transfer whose answer never reached Parle; a reversal made outside Parle is recorded and alerts the administrator", async () => {
    const { tutor, profileId } = await bookableTutor();
    const { u } = await learner();
    const done = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-80), status: "completed" });
    await schedulePayout(done.bookingId, 500); // not due: no job run may send it
    const p = await payoutOf(done.bookingId);
    const transferId = `tr_evt_${crypto.randomUUID().slice(0, 8)}`;
    const meta = { kind: "lesson_payout", payout_id: p.id, booking_id: done.bookingId };
    expect((await sendEvent("transfer.created", { id: transferId, object: "transfer", amount: 3200, amount_reversed: 0, metadata: meta })).body.handled).toBe("payout_paid");
    expect(await payoutOf(done.bookingId)).toMatchObject({ status: "paid", stripe_transfer_id: transferId });
    const since = new Date().toISOString();
    expect((await sendEvent("transfer.reversed", { id: transferId, object: "transfer", amount: 3200, amount_reversed: 500, metadata: meta })).body.handled).toBe("reversal_recorded");
    expect((await payoutOf(done.bookingId)).reversed_cents).toBe(500);
    expect((await latestMail(ADMIN_ALERTS, since)).subject).toContain("reversed outside Parle");
  });

  it("a chargeback holds an unpaid payout and alerts the administrator; after the payout it only alerts", async () => {
    const { tutor, profileId } = await bookableTutor();
    const { u } = await learner();
    const unpaid = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-80), status: "completed" });
    await schedulePayout(unpaid.bookingId, 500);
    const since = new Date().toISOString();
    const r = await sendEvent("charge.dispute.created", { id: `dp_${crypto.randomUUID().slice(0, 8)}`, object: "dispute", payment_intent: unpaid.pi });
    expect(r.body).toMatchObject({ handled: "disputed", payout: "held" });
    expect(await payoutOf(unpaid.bookingId)).toMatchObject({ status: "held", hold_reason: "chargeback" });
    expect((await latestMail(ADMIN_ALERTS, since)).subject).toContain("chargeback");
    const paid = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-90), status: "completed" });
    await schedulePayout(paid.bookingId, 500);
    await service().rpc("payout_mark_paid", { p_payout: (await payoutOf(paid.bookingId)).id, p_transfer: `tr_cb_${crypto.randomUUID().slice(0, 8)}` });
    const after = await sendEvent("charge.dispute.created", { id: `dp_${crypto.randomUUID().slice(0, 8)}`, object: "dispute", payment_intent: paid.pi });
    expect(after.body).toMatchObject({ handled: "disputed", payout: "paid" });
    expect((await payoutOf(paid.bookingId)).status).toBe("paid");
  });
});

describe("a late account.updated (Plan 11: A60, R68)", () => {
  it("does not undo Stripe's current state", async () => {
    await ensurePayoutCountry("Canada", "CA", "supported");
    const { tutor, token } = await bookableTutor({ payouts: false });
    await payoutAction(token, "tutor_payout_onboarding");
    const id = (await service().from("tutor_payout_account").select("stripe_account_id").eq("tutor_id", tutor.id).single()).data!.stripe_account_id as string;
    await setFakeAccount(id, { payouts_enabled: true, details_submitted: true, requirements: { disabled_reason: null } });
    await sendEvent("account.updated", accountEvent(id, false), undefined, { account: id });
    expect((await service().from("tutor_payout_account").select("payouts_enabled").eq("tutor_id", tutor.id).single()).data!.payouts_enabled).toBe(true);
  }, 30000);
});

describe("signing secrets and duplicate deliveries (Plan 11: A66, R74)", () => {
  it("each signing secret only carries its own events; a duplicate delivered at once is handled once", async () => {
    const { tutor, profileId } = await bookableTutor(); const { u } = await learner();
    const done = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-80), status: "completed" });
    await schedulePayout(done.bookingId, 500); const p = await payoutOf(done.bookingId);
    const obj = { id: `tr_x_${crypto.randomUUID().slice(0, 8)}`, object: "transfer", amount: 3200, currency: "cad", metadata: { kind: "lesson_payout", payout_id: p.id } };
    expect((await sendEvent("transfer.created", obj, undefined, { account: "acct_x" })).body.handled).toBe("wrong_destination");
    expect((await payoutOf(done.bookingId)).status).toBe("scheduled");
    const id = `evt_race_${crypto.randomUUID().slice(0, 8)}`;
    const both = await Promise.all([sendEvent("transfer.created", obj, id), sendEvent("transfer.created", obj, id)]);
    expect(both.map((r) => r.body.handled).sort()).toEqual(["duplicate", "payout_paid"]);
  }, 30000);
});
