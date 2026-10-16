import { describe, it, expect } from "bun:test";
import { callFunction } from "./helpers/functions-env";
import { adminToken, bookableTutor, learner, lesson, onlyTheseDue, payoutAction, payoutOf, runJobs, schedulePayout, seedConfirmed, service } from "./helpers/lessons";

const at = (h: number) => { const d = new Date(Date.now() + h * 3_600_000); d.setUTCSeconds(0, 0); return d.toISOString(); };
const deleteAccount = (token: string, password: string) => callFunction("parle-account-service", token, { action: "delete_account", password, confirm: "DELETE" });
const accountRow = async (tutorId: string) => (await service().from("tutor_payout_account").select("*").eq("tutor_id", tutorId).maybeSingle()).data;

describe("a tutor's account deletion and payouts (spec sections 3, 5 and 7)", () => {
  it("a deleted tutor is still paid for lessons taught; the account record goes after the last payout (Review Focus 4)", async () => {
    const { profileId, tutor, token } = await bookableTutor();
    const { u } = await learner();
    const unmarked = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-3) });
    const done = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-30), status: "completed" });
    await schedulePayout(done.bookingId);
    const accountId = (await accountRow(tutor.id))!.stripe_account_id;
    expect((await deleteAccount(token, tutor.password)).body).toEqual({ status: "deleted" });
    expect((await service().from("booking").select("status, tutor_id").eq("id", unmarked.bookingId).single()).data).toEqual({ status: "completed", tutor_id: null });
    expect((await payoutOf(unmarked.bookingId)).tutor_id).toBe(tutor.id);
    const kept = await accountRow(tutor.id);
    expect(kept).toMatchObject({ stripe_account_id: accountId, country: null, payouts_enabled: true });
    expect(kept!.tutor_deleted_at).not.toBeNull();
    const ids = [(await payoutOf(unmarked.bookingId)).id, (await payoutOf(done.bookingId)).id];
    await service().from("payout").update({ release_at: new Date(Date.now() - 60_000).toISOString() }).in("id", ids);
    await onlyTheseDue(ids);
    await runJobs();
    for (const id of [unmarked.bookingId, done.bookingId]) expect((await payoutOf(id)).status).toBe("paid");
    const { data: transfers } = await service().from("stripe_test_object").select("data").eq("kind", "transfer").in("data->>payout_id", ids);
    expect(transfers!.map((x: any) => x.data.destination)).toEqual([accountId, accountId]);
    expect(await accountRow(tutor.id)).toBeNull();
  });

  it("a deleted tutor with a held payout keeps the record until an administrator decides", async () => {
    const { profileId, tutor, token } = await bookableTutor();
    const { u, t } = await learner();
    const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-5), status: "completed" });
    await schedulePayout(b.bookingId);
    expect((await lesson(t, "report_problem", { booking_id: b.bookingId, kind: "other", details: "" })).status).toBe(200);
    expect((await deleteAccount(token, tutor.password)).status).toBe(200);
    await runJobs();
    expect(await accountRow(tutor.id)).not.toBeNull();
    expect((await payoutAction(await adminToken(), "admin_refund_payout", { payout_id: (await payoutOf(b.bookingId)).id })).status).toBe(200);
    await runJobs();
    expect(await accountRow(tutor.id)).toBeNull();
  });
});
