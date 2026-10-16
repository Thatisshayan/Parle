import { describe, it, expect } from "bun:test";
import { bookableTutor, learner, payoutOf, schedulePayout, seedConfirmed, service } from "./helpers/lessons";

const psql = (sql: string) => Bun.spawnSync(["docker", "exec", "supabase_db_parle-staging", "psql", "-U", "postgres", "-tA", "-c", sql]).stdout.toString().trim();
const at = (h: number) => { const d = new Date(Date.now() + h * 3_600_000); d.setUTCSeconds(0, 0); return d.toISOString(); };
const plus = (iso: string, hours: number) => new Date(Date.parse(iso) + hours * 3_600_000).toISOString();

describe("payout tables and rules (Plan 7B, spec sections 3 and 7)", () => {
  it("one payout per lesson: frozen price minus frozen commission, 72 h after the later of the end and the completion", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u } = await learner();
    const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-5), status: "completed", price: 1125 });
    const completedAt = at(-2);
    await service().from("booking").update({ commission_pct: 10, completed_at: completedAt }).eq("id", b.bookingId);
    expect((await schedulePayout(b.bookingId)).data).toBe("scheduled");
    expect((await schedulePayout(b.bookingId)).data).toBe("exists");
    const p = await payoutOf(b.bookingId);
    expect(p).toMatchObject({ amount_cents: 1012, commission_cents: 113, status: "scheduled", tutor_id: tutor.id, hold_reason: null });
    expect(new Date(p.release_at).toISOString()).toBe(new Date(plus(completedAt, 72)).toISOString());
  });

  it("a late learner cancellation pays 72 h after the scheduled end; an early one or a tutor cancellation pays nothing", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u } = await learner();
    const lateStart = at(10);
    const late = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: lateStart, status: "cancelled_learner" });
    await service().from("booking").update({ late_cancel: true }).eq("id", late.bookingId);
    const early = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(50), status: "cancelled_learner" });
    const byTutor = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(52), status: "cancelled_tutor" });
    expect((await schedulePayout(late.bookingId)).data).toBe("scheduled");
    expect(new Date((await payoutOf(late.bookingId)).release_at).toISOString()).toBe(new Date(plus(lateStart, 1 + 72)).toISOString());
    expect((await schedulePayout(early.bookingId)).data).toBe("not_eligible");
    expect((await schedulePayout(byTutor.bookingId)).data).toBe("not_eligible");
  });

  it("a disputed lesson's payout starts held; a bank dispute (chargeback) holds it as such", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u } = await learner();
    const disputed = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-30), status: "completed" });
    await service().from("booking").update({ status: "disputed", disputed_from: "completed", dispute_kind: "tutor_no_show" }).eq("id", disputed.bookingId);
    expect((await schedulePayout(disputed.bookingId)).data).toBe("scheduled");
    expect(await payoutOf(disputed.bookingId)).toMatchObject({ status: "held", hold_reason: "tutor_no_show" });
    const charged = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-40), status: "completed" });
    await service().from("payment").update({ status: "disputed" }).eq("booking_id", charged.bookingId);
    await schedulePayout(charged.bookingId);
    expect(await payoutOf(charged.bookingId)).toMatchObject({ status: "held", hold_reason: "chargeback" });
  });

  it("a claim is taken once; a payout being sent cannot be decided on, and one decision runs at a time", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u } = await learner();
    const a = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-6), status: "completed" });
    const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-8), status: "completed" });
    await schedulePayout(a.bookingId, 0);
    await schedulePayout(b.bookingId, 0);
    const pa = await payoutOf(a.bookingId), pb = await payoutOf(b.bookingId);
    const db = service();
    expect((await db.rpc("payout_claim", { p_payout: pa.id })).data).toBe("claimed");
    expect((await db.rpc("payout_claim", { p_payout: pa.id })).data).toBe("not_due");
    expect((await db.rpc("payout_decision_begin", { p_payout: pa.id, p_kind: "refund", p_by: "x" })).data).toBe("busy");
    expect((await db.rpc("payout_decision_begin", { p_payout: pb.id, p_kind: "release", p_by: "x" })).data).toBe("claimed");
    expect((await db.rpc("payout_decision_begin", { p_payout: pb.id, p_kind: "refund", p_by: "y" })).data).toBe("busy");
    expect((await db.rpc("payout_claim", { p_payout: pb.id })).data).toBe("not_due"); // never sent while a decision runs
    expect((await db.rpc("payout_decide", { p_payout: pb.id, p_kind: "refund", p_amount: null, p_commission: null, p_by: "y" })).data).toBe("not_claimed");
    expect((await db.rpc("payout_decide", { p_payout: pb.id, p_kind: "release", p_amount: null, p_commission: null, p_by: "x" })).data).toBe("decided");
    expect((await db.rpc("payout_decision_begin", { p_payout: pb.id, p_kind: "refund", p_by: "y" })).data).toBe("busy"); // released = claimed for sending
    const transfer = `tr_schema_${crypto.randomUUID().slice(0, 8)}`; // unique per run (stripe_transfer_id is unique)
    expect((await db.rpc("payout_mark_paid", { p_payout: pa.id, p_transfer: transfer })).data).toBe("paid");
    expect((await db.rpc("payout_mark_paid", { p_payout: pa.id, p_transfer: transfer })).data).toBe("paid");
    expect((await db.rpc("payout_hold", { p_payout: pa.id, p_reason: "chargeback" })).data).toBe("unchanged");
  });

  it("payouts and payout accounts are server-only", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u } = await learner();
    const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-6), status: "completed" });
    await schedulePayout(b.bookingId);
    expect(((await tutor.client.from("payout").select("id")).data ?? []).length).toBe(0);
    expect(((await tutor.client.from("tutor_payout_account").select("tutor_id")).data ?? []).length).toBe(0);
  });

  it("booking now requires a payout account, and administrators' refunds after a payout have their own reason", () => {
    expect(psql("select value from public.app_setting where key = 'require_payout_account'")).toBe("true");
    expect(psql("select pg_get_constraintdef(oid) from pg_constraint where conname = 'refund_reason_check'")).toContain("admin_after_payout");
    expect(psql("select relrowsecurity from pg_class where relname = 'payout'")).toBe("t");
    expect(psql("select relrowsecurity from pg_class where relname = 'tutor_payout_account'")).toBe("t");
  });
});
