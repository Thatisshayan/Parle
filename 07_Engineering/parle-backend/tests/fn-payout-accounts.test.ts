import { describe, it, expect } from "bun:test";
import { makeUser } from "./helpers/users";
import {
  bookableTutor, clearFakeFailures, ensurePayoutCountry, failNext, learner, lesson, payoutAction, payoutOf, schedulePayout, seedConfirmed, service, setFakeAccount,
} from "./helpers/lessons";

const at = (h: number) => { const d = new Date(Date.now() + h * 3_600_000); d.setUTCSeconds(0, 0); return d.toISOString(); };
const tokenOf = async (u: { client: any }) => (await u.client.auth.getSession()).data.session!.access_token;
const accountOf = async (tutorId: string) => (await service().from("tutor_payout_account").select("*").eq("tutor_id", tutorId).maybeSingle()).data;

describe("payout account (spec section 7, Connect Express onboarding)", () => {
  it("Set up payouts creates one Express account in the tutor's country and returns Stripe's onboarding page", async () => {
    await clearFakeFailures();
    await ensurePayoutCountry("Canada", "CA", "supported");
    const { tutor, token } = await bookableTutor({ payouts: false, country: "Canada" });
    expect((await payoutAction(token, "tutor_earnings")).body.account).toMatchObject({ state: "none", country_name: "Canada" });
    const first = await payoutAction(token, "tutor_payout_onboarding");
    expect(first.status).toBe(200);
    expect(first.body.onboarding_url).toMatch(/^https:\/\/connect\.stripe\.com\/setup\/e\/acct_fake_/);
    const row = await accountOf(tutor.id);
    expect(row).toMatchObject({ country: "CA", payouts_enabled: false, details_submitted: false });
    expect((await payoutAction(token, "tutor_payout_onboarding")).status).toBe(200);
    expect((await accountOf(tutor.id))!.stripe_account_id).toBe(row!.stripe_account_id);
    const { data: fake } = await service().from("stripe_test_object").select("data").eq("id", row!.stripe_account_id).single();
    expect(fake!.data).toMatchObject({ country: "CA", recipient: false, email: tutor.email });
    expect((await payoutAction(token, "tutor_earnings")).body.account.state).toBe("onboarding");
  });

  it("a tutor abroad gets Stripe's recipient agreement (cross-border payouts)", async () => {
    await ensurePayoutCountry("France", "FR", "supported");
    const { tutor, token } = await bookableTutor({ payouts: false, country: "France" });
    expect((await payoutAction(token, "tutor_payout_onboarding")).status).toBe(200);
    const { data: fake } = await service().from("stripe_test_object").select("data").eq("id", (await accountOf(tutor.id))!.stripe_account_id).single();
    expect(fake!.data).toMatchObject({ country: "FR", recipient: true });
  });

  it("a tutor in a waitlist country is told why and joins the waitlist; the profile stays approved but cannot be booked", async () => {
    await ensurePayoutCountry("Nigeria", "NG", "waitlist");
    const { tutor, token, profileId } = await bookableTutor({ payouts: false, country: "Nigeria" });
    const r = await payoutAction(token, "tutor_payout_onboarding");
    expect(r.status).toBe(409);
    expect(r.body.error_code).toBe("PAYOUT_COUNTRY_WAITLIST");
    expect(r.body.message).toContain("Nigeria");
    expect((await payoutAction(token, "tutor_earnings")).body.account.state).toBe("country_waitlist");
    const joined = await payoutAction(token, "tutor_payout_waitlist");
    expect(joined.status).toBe(200);
    expect((await payoutAction(token, "tutor_earnings")).body.account).toMatchObject({ state: "waitlisted", waitlisted_at: joined.body.waitlisted_at });
    expect(await accountOf(tutor.id)).toMatchObject({ stripe_account_id: null, country: "NG", payouts_enabled: false });
    const { t } = await learner();
    expect((await lesson(t, "booking_options", { tutor_profile_id: profileId })).body).toMatchObject({ can_book: false, reason: "BOOKING_NOT_OPEN" });
    expect((await service().from("tutor_public_profile").select("is_published").eq("profile_id", profileId).single()).data!.is_published).toBe(true);
  });

  it("learners and tutors without an approved profile cannot start payouts; Stripe being down creates nothing", async () => {
    await clearFakeFailures();
    const { t } = await learner();
    expect((await payoutAction(t, "tutor_payout_onboarding")).body.error_code).toBe("TUTOR_ONLY");
    const unapproved = await makeUser("tutor");
    expect((await payoutAction(await tokenOf(unapproved), "tutor_payout_onboarding")).body.error_code).toBe("NOT_APPROVED");
    await ensurePayoutCountry("Canada", "CA", "supported");
    const { tutor, token } = await bookableTutor({ payouts: false });
    await failNext("account");
    const r = await payoutAction(token, "tutor_payout_onboarding");
    expect(r.status).toBe(503);
    expect(r.body.error_code).toBe("PAYOUT_SETUP_UNAVAILABLE");
    // no Stripe account is linked; a call that did not get Stripe's answer is not a refusal, so the next try reuses the
    // same key and Stripe replays any account it made (Plan 12, R124)
    expect((await accountOf(tutor.id))?.connect_attempt ?? 0).toBe(0);
  });

  it("returning from Stripe with payouts enabled releases payouts that only waited for the account (Review Focus 5)", async () => {
    await ensurePayoutCountry("Canada", "CA", "supported");
    const { tutor, token, profileId } = await bookableTutor({ payouts: false });
    await payoutAction(token, "tutor_payout_onboarding");
    const accountId = (await accountOf(tutor.id))!.stripe_account_id as string;
    expect((await payoutAction(token, "tutor_payout_dashboard")).body.error_code).toBe("PAYOUT_ACCOUNT_NOT_READY");
    const { u } = await learner();
    const done = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-80), status: "completed" });
    await schedulePayout(done.bookingId, 0);
    const payoutId = (await payoutOf(done.bookingId)).id;
    await service().rpc("payout_hold", { p_payout: payoutId, p_reason: "account_not_ready" });
    await setFakeAccount(accountId, { payouts_enabled: true, details_submitted: true, requirements: { disabled_reason: null } });
    const back = await payoutAction(token, "tutor_earnings", { refresh: true });
    expect(back.body.account).toMatchObject({ state: "enabled", payouts_enabled: true, details_submitted: true });
    expect(await payoutOf(done.bookingId)).toMatchObject({ status: "scheduled", hold_reason: null });
    const audit = await service().from("admin_audit_log").select("action, actor_label").eq("target_id", payoutId);
    expect(audit.data).toEqual([{ action: "payout.auto_release", actor_label: "system" }]);
    expect((await payoutAction(token, "tutor_payout_dashboard")).body.dashboard_url).toMatch(/^https:\/\/connect\.stripe\.com\/express\//);
  });

  it("earnings list the tutor's own lessons with the breakdown and monthly totals", async () => {
    const { tutor, token, profileId } = await bookableTutor();
    const other = await bookableTutor();
    const { u } = await learner();
    const done = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-30), status: "completed" });
    await schedulePayout(done.bookingId);
    const next = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(50) });
    const theirs = await seedConfirmed({ learnerId: u.id, tutorId: other.tutor.id, profileId: other.profileId, start: at(-30), status: "completed" });
    const r = await payoutAction(token, "tutor_earnings");
    expect(r.status).toBe(200);
    expect(r.body.account.state).toBe("enabled");
    const lines = r.body.lessons as any[];
    expect(lines.find((l) => l.booking_id === done.bookingId)).toMatchObject({ state: "pending", price_cents: 4000, commission_pct: 20, commission_cents: 800, payout_cents: 3200, learner_name: expect.any(String) });
    expect(lines.find((l) => l.booking_id === next.bookingId)).toMatchObject({ state: "upcoming", payout_cents: 3200 });
    expect(lines.some((l) => l.booking_id === theirs.bookingId)).toBe(false);
    expect(r.body.months).toEqual([expect.objectContaining({ lessons: 1, earned_cents: 3200, paid_cents: 0 })]);
    expect((await payoutAction((await learner()).t, "tutor_earnings")).body.error_code).toBe("TUTOR_ONLY");
  });

  it("limits Stripe account refreshes to ten per tutor per hour", async () => {
    await clearFakeFailures();
    await ensurePayoutCountry("Canada", "CA", "supported");
    const { token } = await bookableTutor({ payouts: false });
    expect((await payoutAction(token, "tutor_payout_onboarding")).status).toBe(200);
    for (let i = 0; i < 10; i++) {
      expect((await payoutAction(token, "tutor_earnings", { refresh: true })).status).toBe(200);
    }
    const limited = await payoutAction(token, "tutor_earnings", { refresh: true });
    expect(limited.status).toBe(429);
    expect(limited.body.error_code).toBe("RATE_LIMITED");
  });
});

describe("a refused account creation (Plan 11: A65)", () => {
  it("can be retried at once and makes one account", async () => {
    await clearFakeFailures(); await ensurePayoutCountry("Canada", "CA", "supported");
    const { tutor, token } = await bookableTutor({ payouts: false });
    await failNext("account_refused");
    expect((await payoutAction(token, "tutor_payout_onboarding")).status).toBe(503);
    expect((await payoutAction(token, "tutor_payout_onboarding")).status).toBe(200);
    expect((await accountOf(tutor.id))!.connect_attempt).toBe(1);
  }, 30000);
});

describe("Connect attempts (Plan 12: R124)", () => {
  it("only a real Stripe refusal moves to a new attempt key", async () => {
    await clearFakeFailures();
    await ensurePayoutCountry("Canada", "CA", "supported");
    const { tutor, token } = await bookableTutor({ payouts: false });
    await failNext("account"); // a timeout or a 5xx
    expect((await payoutAction(token, "tutor_payout_onboarding")).status).toBe(503);
    expect((await accountOf(tutor.id))?.connect_attempt ?? 0).toBe(0);
    await failNext("account_refused"); // Stripe answered and refused
    expect((await payoutAction(token, "tutor_payout_onboarding")).status).toBe(503);
    expect((await accountOf(tutor.id))?.connect_attempt).toBe(1);
  });

  it("does not rotate the account idempotency key after an in-flight collision (R135)", async () => {
    await clearFakeFailures();
    await ensurePayoutCountry("Canada", "CA", "supported");
    const { tutor, token } = await bookableTutor({ payouts: false });
    await failNext("account_idempotency");
    expect((await payoutAction(token, "tutor_payout_onboarding")).status).toBe(503);
    expect((await accountOf(tutor.id))?.connect_attempt ?? 0).toBe(0);
    expect((await payoutAction(token, "tutor_payout_onboarding")).status).toBe(200);
    expect((await accountOf(tutor.id))?.connect_attempt ?? 0).toBe(0);
  });
});
