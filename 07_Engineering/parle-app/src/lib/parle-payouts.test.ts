import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { hasTranslationKey } from "./i18n";
import { centsFromDollars, groupEarnings, payoutErrorKey, safeEarnings, safePayoutItem, safeStripeUrl, splitPayoutCents } from "./parle-payouts";

const line = (over: Record<string, unknown> = {}) => ({
  booking_id: "b1", start_at: "2026-10-20T22:00:00.000Z", minutes: 60, learner_name: "Ana", lesson_status: "completed", late_cancel: false,
  price_cents: 1400, commission_pct: 20, commission_cents: 280, payout_cents: 1120, state: "pending", release_at: "2026-10-23T23:00:00.000Z",
  paid_at: null, hold_reason: null, transfer_id: null, reversed_cents: 0, ...over,
});

describe("earnings from the server", () => {
  it("keeps valid lines and the account; refuses unknown states and hold reasons", () => {
    const e = safeEarnings({
      time_zone: "America/Toronto", payout_delay_hours: 72,
      account: { state: "enabled", country_name: "Canada", payouts_enabled: true, details_submitted: true, waitlisted_at: null },
      lessons: [line(), line({ booking_id: "x", state: "lost" }), line({ booking_id: "h", state: "held", hold_reason: "hacked" })],
      months: [{ month: "2026-10", lessons: 1, earned_cents: 1120, paid_cents: 0 }, { month: "oct" }],
    });
    assert.equal(e.account.state, "enabled");
    assert.deepEqual(e.lessons.map((l) => l.booking_id), ["b1", "h"]);
    assert.equal(e.lessons[1].hold_reason, null);
    assert.deepEqual(e.months, [{ month: "2026-10", lessons: 1, earned_cents: 1120, paid_cents: 0 }]);
    assert.equal(safeEarnings({ account: { state: "admin" } }).account.state, "none");
    assert.equal(safeEarnings(null).timeZone, "UTC");
  });
  it("groups lines into upcoming, pending, held and paid; cancelled ones are left out", () => {
    const g = groupEarnings(safeEarnings({ lessons: [
      line({ booking_id: "u", state: "upcoming", release_at: null }), line({ booking_id: "p" }), line({ booking_id: "h", state: "held", hold_reason: "dispute" }),
      line({ booking_id: "d", state: "paid", paid_at: "2026-10-24T00:00:00.000Z", transfer_id: "tr_1" }), line({ booking_id: "c", state: "cancelled" }),
    ] }).lessons);
    assert.deepEqual([g.upcoming, g.pending, g.held, g.paid].map((list) => list.map((l) => l.booking_id)), [["u"], ["p"], ["h"], ["d"]]);
  });
  it("opens only Stripe's own Connect pages", () => {
    assert.equal(safeStripeUrl("https://connect.stripe.com/setup/e/acct_1/abc"), "https://connect.stripe.com/setup/e/acct_1/abc");
    assert.equal(safeStripeUrl("https://connect.stripe.com.evil.example/x"), "");
    assert.equal(safeStripeUrl("http://connect.stripe.com/x"), "");
    assert.equal(safeStripeUrl(42), "");
  });
  it("every payout refusal code has a message", () => {
    for (const code of ["COUNTRY_MISSING", "PAYOUT_COUNTRY_WAITLIST", "PAYOUT_COUNTRY_SUPPORTED", "PAYOUT_SETUP_UNAVAILABLE", "NOT_APPROVED", "PAYOUT_ACCOUNT_NOT_READY", "RATE_LIMITED", "PAYOUT_BUSY", "REFUND_UNAVAILABLE", "AMOUNT_INVALID", "CHARGEBACK_OPEN", "NOT_PAID", "CHOICE_REQUIRED", "PAYOUT_ACTION_UNAVAILABLE", "ANYTHING_ELSE"]) {
      assert.equal(hasTranslationKey(payoutErrorKey(code)), true, code);
    }
  });
  it("amounts an administrator types, and the split preview, follow the server's rounding", () => {
    assert.equal(centsFromDollars("10"), 1000);
    assert.equal(centsFromDollars(" 12.5 "), 1250);
    for (const bad of ["0", "1.234", "-3", "abc", ""]) assert.equal(centsFromDollars(bad), null, bad);
    assert.equal(splitPayoutCents(4000, 20, 1000), 2400);
    assert.equal(splitPayoutCents(1125, 10, 0), 1012);
  });
  it("the Earnings page and the dashboard notice are wired in", () => {
    const shell = readFileSync(new URL("../pages/RoleShell.tsx", import.meta.url), "utf8");
    assert.match(shell, /path === "\/tutor\/earnings"\s*\n\s*\? <TutorEarnings \/>/);
    const dashboard = readFileSync(new URL("../pages/TutorDashboard.tsx", import.meta.url), "utf8");
    assert.match(dashboard, /\{approved && <PayoutSetupNotice \/>\}/);
  });
});

describe("the administrator's Payouts screen", () => {
  const raw = (over: Record<string, unknown> = {}) => ({
    payout_id: "p1", booking_id: "b1", status: "held", hold_reason: "dispute", amount_cents: 3200, commission_cents: 800, commission_pct: 20,
    reversed_cents: 0, release_at: "2026-10-23T23:00:00.000Z", paid_at: null, transfer_id: null, price_cents: 4000, paid_cents: 4000,
    refunded_cents: 0, payment_status: "succeeded", lesson_status: "disputed", disputed_from: "completed", dispute_kind: "other",
    dispute_details: "Audio failed.", start_at: "2026-10-20T22:00:00.000Z", tutor_name: "Camille T.", learner_name: "Ana", ...over,
  });
  it("keeps valid items and refuses unknown statuses", () => {
    assert.equal(safePayoutItem(raw())?.amount_cents, 3200);
    assert.equal(safePayoutItem(raw({ status: "sending" })), null);
    assert.equal(safePayoutItem(raw({ hold_reason: "whim" }))?.hold_reason, null);
    assert.equal(safePayoutItem({}), null);
  });
  it("the Payouts page is in the admin menu and routed", () => {
    const shell = readFileSync(new URL("../pages/RoleShell.tsx", import.meta.url), "utf8");
    assert.match(shell, /\{ path: "\/admin\/payouts", label: "role\.adminPayouts" \}/);
    assert.match(shell, /path === "\/admin\/payouts"\s*\n\s*\? <AdminPayouts \/>/);
  });
});
