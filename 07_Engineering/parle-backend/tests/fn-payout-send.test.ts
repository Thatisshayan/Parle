import { describe, it, expect } from "bun:test";
import { latestMail } from "./helpers/mailpit";
import { ADMIN_ALERTS, bookableTutor, clearFakeFailures, failNext, fakeTransfers, learner, onlyTheseDue, payoutOf, runJobs, schedulePayout, seedConfirmed, service } from "./helpers/lessons";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

async function duePayout(opts: { payouts?: boolean } = {}) {
  const { profileId, tutor } = await bookableTutor(opts);
  const { u } = await learner();
  const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursAgo(80), status: "completed" });
  await schedulePayout(b.bookingId, 0);
  return { tutor, bookingId: b.bookingId, payout: await payoutOf(b.bookingId) };
}

describe("sending payouts (spec section 7)", () => {
  it("a due payout is sent once: the tutor's share, from the lesson's charge, to the tutor's account", async () => {
    await clearFakeFailures();
    const { tutor, bookingId, payout } = await duePayout();
    await onlyTheseDue([payout.id]);
    expect((await runJobs()).body.payouts_sent).toBe(1);
    const paid = await payoutOf(bookingId);
    expect(paid).toMatchObject({ status: "paid", hold_reason: null });
    expect(paid.stripe_transfer_id).toMatch(/^tr_fake_/);
    const { data: account } = await service().from("tutor_payout_account").select("stripe_account_id").eq("tutor_id", tutor.id).single();
    const { data: transfer } = await service().from("stripe_test_object").select("data").eq("id", paid.stripe_transfer_id).single();
    expect(transfer!.data).toMatchObject({ amount: 3200, destination: account!.stripe_account_id, transfer_group: `payout-${payout.id}`, booking_id: bookingId });
    expect(String(transfer!.data.source_transaction)).toMatch(/^ch_fake_/);
    await runJobs();
    expect(await fakeTransfers(payout.id)).toBe(1);
  });

  it("a failed transfer is held, the administrator is emailed, and it is not retried automatically", async () => {
    await clearFakeFailures();
    const { bookingId, payout } = await duePayout();
    await onlyTheseDue([payout.id]);
    await failNext("transfer");
    const since = new Date().toISOString();
    await runJobs();
    expect(await payoutOf(bookingId)).toMatchObject({ status: "held", hold_reason: "transfer_failed", stripe_transfer_id: null });
    expect((await latestMail(ADMIN_ALERTS, since)).subject).toContain("transfer failed");
    await runJobs();
    expect((await payoutOf(bookingId)).status).toBe("held");
    expect(await fakeTransfers(payout.id)).toBe(0);
  });

  it("an account that cannot receive payouts holds the payout instead of trying (Review Focus 5)", async () => {
    const { bookingId, payout } = await duePayout({ payouts: false });
    await onlyTheseDue([payout.id]);
    await runJobs();
    expect(await payoutOf(bookingId)).toMatchObject({ status: "held", hold_reason: "account_not_ready" });
    expect(await fakeTransfers(payout.id)).toBe(0);
  });

  it("a claim whose answer was lost is recorded once, never sent twice (Review Focus 2)", async () => {
    await clearFakeFailures();
    const lost = await duePayout();
    const quiet = await duePayout();
    const db = service();
    for (const p of [lost.payout, quiet.payout]) {
      await db.rpc("payout_claim", { p_payout: p.id });
      await db.from("payout").update({ transfer_started_at: new Date(Date.now() - 20 * 60_000).toISOString() }).eq("id", p.id);
    }
    // Stripe made the first transfer before the function stopped; the second call never reached Stripe
    const made = `tr_fake_lost_${crypto.randomUUID().slice(0, 8)}`;
    await db.from("stripe_test_object").insert({ id: made, kind: "transfer", data: { payout_id: lost.payout.id, amount: 3200, transfer_group: `payout-${lost.payout.id}` } });
    await onlyTheseDue([lost.payout.id, quiet.payout.id]);
    expect((await runJobs()).body.payouts_resumed).toBeGreaterThanOrEqual(2);
    expect(await payoutOf(lost.bookingId)).toMatchObject({ status: "paid", stripe_transfer_id: made });
    expect(await fakeTransfers(lost.payout.id)).toBe(1);
    expect((await payoutOf(quiet.bookingId)).status).toBe("paid");
    expect(await fakeTransfers(quiet.payout.id)).toBe(1);
  });

  it("one run sends at most 20 payouts (batches of 20); the next run sends the rest", async () => {
    await clearFakeFailures();
    const { profileId, tutor } = await bookableTutor();
    const { u } = await learner();
    const ids: string[] = [];
    for (let i = 0; i < 21; i++) {
      const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursAgo(100 + i * 2), status: "completed" });
      await schedulePayout(b.bookingId, 0);
      ids.push((await payoutOf(b.bookingId)).id);
    }
    await onlyTheseDue(ids);
    expect((await runJobs()).body.payouts_sent).toBe(20);
    expect((await service().from("payout").select("id").in("id", ids).eq("status", "paid")).data!.length).toBe(20);
    expect((await runJobs()).body.payouts_sent).toBe(1);
  }, 120000);
});
