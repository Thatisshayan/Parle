import { describe, it, expect } from "bun:test";
import { accountState, connectAccountKey, earningsView, monthKey, payoutCents, payoutCountryFor, reversalCents, splitPayoutCents, transferGroupFor, type EarningRow } from "../supabase/functions/_shared/payouts/rules";

const row = (over: Partial<EarningRow>): EarningRow => ({
  booking_id: "b", start_at: "2026-10-20T22:00:00.000Z", minutes: 60, status: "completed", late_cancel: false, price_cents: 1400,
  commission_pct: 20, learner_name: "Ana", payout: null, ...over,
});
const payout = (over: Record<string, unknown> = {}) => ({
  status: "scheduled", amount_cents: 1120, commission_cents: 280, release_at: "2026-10-23T23:00:00.000Z", hold_reason: null,
  paid_at: null, stripe_transfer_id: null, reversed_cents: 0, ...over,
});

describe("payout rules (spec section 7)", () => {
  it("the tutor gets the frozen price minus the frozen commission, rounded like the database (half away from zero)", () => {
    expect(payoutCents(1400, 20)).toBe(1120);
    expect(payoutCents(1400, 10)).toBe(1260);
    expect(payoutCents(1125, 10)).toBe(1012);
    expect(payoutCents(800, 20)).toBe(640);
  });
  it("a split pays the tutor's share of what the learner still pays", () => {
    expect(splitPayoutCents(4000, 20, 1000)).toBe(2400);
    expect(splitPayoutCents(4000, 20, 0)).toBe(3200);
  });
  it("a reversal takes back the tutor's share of a refund, never more than is still with the tutor", () => {
    expect(reversalCents({ refundCents: 2000, payoutCents: 3200, priceCents: 4000, alreadyReversed: 0 })).toBe(1600);
    expect(reversalCents({ refundCents: 4000, payoutCents: 3200, priceCents: 4000, alreadyReversed: 3000 })).toBe(200);
    expect(reversalCents({ refundCents: 4000, payoutCents: 3200, priceCents: 0, alreadyReversed: 0 })).toBe(0);
  });
  it("finds the country code from the payout country list; unknown countries wait, a missing one says so", () => {
    const rows = [{ country_name: "Canada", country_code: "CA", status: "supported" }, { country_name: "Nigeria", country_code: "NG", status: "waitlist" }];
    expect(payoutCountryFor("canada", rows)).toEqual({ code: "CA", name: "Canada", status: "supported" });
    expect(payoutCountryFor(" ca ", rows).status).toBe("supported");
    expect(payoutCountryFor("Nigeria", rows)).toEqual({ code: "NG", name: "Nigeria", status: "waitlist" });
    expect(payoutCountryFor("Atlantis", rows)).toEqual({ code: null, name: "Atlantis", status: "waitlist" });
    expect(payoutCountryFor("", rows)).toEqual({ code: null, name: "", status: "missing" });
  });
  it("the account state follows Stripe's answer first, then the country list", () => {
    const acct = (over: Record<string, unknown>) => ({ stripe_account_id: "acct_1", payouts_enabled: false, details_submitted: false, waitlisted_at: null, ...over });
    expect(accountState({ account: null, countryStatus: "supported" })).toBe("none");
    expect(accountState({ account: null, countryStatus: "missing" })).toBe("country_missing");
    expect(accountState({ account: null, countryStatus: "waitlist" })).toBe("country_waitlist");
    expect(accountState({ account: acct({ stripe_account_id: null, waitlisted_at: "2026-10-20T00:00:00Z" }), countryStatus: "waitlist" })).toBe("waitlisted");
    expect(accountState({ account: acct({}), countryStatus: "supported" })).toBe("onboarding");
    expect(accountState({ account: acct({ details_submitted: true }), countryStatus: "supported" })).toBe("restricted");
    expect(accountState({ account: acct({ details_submitted: true, payouts_enabled: true }), countryStatus: "waitlist" })).toBe("enabled");
  });
  it("earnings: upcoming estimates, pending with dates, held with the reason, paid with references, totals by the tutor's month", () => {
    const view = earningsView([
      row({ booking_id: "up", status: "confirmed", start_at: "2026-11-10T22:00:00.000Z" }),
      row({ booking_id: "pend", payout: payout() }),
      row({ booking_id: "held", status: "disputed", payout: payout({ status: "held", hold_reason: "dispute" }) }),
      row({ booking_id: "paid", start_at: "2026-11-01T02:00:00.000Z", payout: payout({ status: "paid", paid_at: "2026-11-04T03:00:00.000Z", stripe_transfer_id: "tr_1", reversed_cents: 200 }) }),
      row({ booking_id: "gone", payout: payout({ status: "cancelled" }) }),
      row({ booking_id: "refunded", status: "cancelled_learner" }),
    ], "America/Toronto");
    expect(view.lines.map((l) => [l.booking_id, l.state])).toEqual([["up", "upcoming"], ["paid", "paid"], ["pend", "pending"], ["held", "held"], ["gone", "cancelled"]]);
    expect(view.lines[0]).toMatchObject({ payout_cents: 1120, commission_cents: 280, release_at: null });
    expect(view.lines.find((l) => l.booking_id === "held")).toMatchObject({ hold_reason: "dispute" });
    expect(view.lines.find((l) => l.booking_id === "paid")).toMatchObject({ payout_cents: 920, transfer_id: "tr_1", reversed_cents: 200 });
    expect(monthKey("2026-11-01T02:00:00.000Z", "America/Toronto")).toBe("2026-10");
    expect(view.months).toEqual([{ month: "2026-10", lessons: 3, earned_cents: 3160, paid_cents: 920 }]);
  });
});

describe("connect account idempotency key (Plan 11: A65, R73)", () => {
  it("counts attempts: a double click reuses the key, a refused try is retried at once with the next key", () => {
    expect(connectAccountKey("t1", 0)).toBe("connect-account:t1:0");
    expect(connectAccountKey("t1", 0)).toBe(connectAccountKey("t1", 0));
    expect(connectAccountKey("t1", 0)).not.toBe(connectAccountKey("t1", 1));
  });
  it("the Stripe gateway keys on the attempt, not on the hour", async () => {
    const src = await Bun.file(`${import.meta.dir}/../supabase/functions/_shared/lessons/payments.ts`).text();
    expect(src).toContain("idempotencyKey: connectAccountKey(i.tutorId, i.attempt)");
    expect(src).not.toContain("connectAccountKey(i.tutorId, new Date())");
  });
});

describe("what was sent, and a charge with a transfer group (Plan 11: A70, A101)", () => {
  it("earnings show what the transfer sent when it differs from the share (A70)", () => {
    const paid = payout({ status: "paid", paid_at: "2026-10-24T10:00:00.000Z", stripe_transfer_id: "tr", transfer_cents: 1589 });
    expect(earningsView([row({ payout: paid as any })], "UTC").lines[0].sent_cents).toBe(1589);
    expect(earningsView([row({ payout: { ...paid, transfer_cents: 1120 } as any })], "UTC").lines[0].sent_cents).toBeNull();
    expect(earningsView([row({ payout: payout() as any })], "UTC").lines[0].sent_cents).toBeNull();
  });
  it("a charge that already has a transfer group gets no group of ours (A101)", () => {
    expect(transferGroupFor(null, "p1")).toBe("payout-p1");
    expect(transferGroupFor("probe-currency", "p1")).toBeUndefined();
  });
});

describe("the transfer search by account (Plan 12: R123)", () => {
  it("starts a day before the payout was made, or covers everything without a date", async () => {
    const { transferSearchParams } = await import("../supabase/functions/_shared/payouts/rules");
    expect(transferSearchParams("acct_1", "2026-10-17T12:00:00Z")).toEqual({ destination: "acct_1", limit: 100, created: { gte: Math.floor(Date.parse("2026-10-17T12:00:00Z") / 1000) - 86_400 } });
    expect(transferSearchParams("acct_1", null)).toEqual({ destination: "acct_1", limit: 100 });
  });
});
