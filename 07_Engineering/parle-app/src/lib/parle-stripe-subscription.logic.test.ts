import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSubscriptionCacheSignature,
  isStripeSubscriptionOwnedByLearner,
  isStripeTestKey,
  mapStripeSubscriptionStatus,
  normalizeStripeSubscription,
  planFromStripeSubscription,
  verifyStripeSubscriptionOwnership,
  verifySubscriptionCache,
  verifiedCheckoutSession,
  type PremiumSubscriptionPlan,
  type SubscriptionCachePayload,
} from "../../functions/parle-stripe-subscription.logic.helper.ts";

const TEST_KEY = "sk_test_parle-unit-test-key";
const USER_ID = "parle-test-user";
const NOW = new Date("2026-10-13T12:00:00.000Z");

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_parle_123",
    customer: "cus_parle_123",
    status: "active",
    cancel_at_period_end: false,
    current_period_end: Math.floor(Date.parse("2026-11-13T12:00:00.000Z") / 1000),
    metadata: { user_id: USER_ID, plan: "premium_monthly" },
    items: {
      data: [{
        quantity: 1,
        price: { currency: "usd", unit_amount: 1499, recurring: { interval: "month", interval_count: 1 } },
      }],
    },
    ...overrides,
  };
}

function customer(overrides: Record<string, unknown> = {}) {
  return { id: "cus_parle_123", deleted: false, metadata: { user_id: USER_ID }, ...overrides };
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_parle_123",
    status: "complete",
    mode: "subscription",
    client_reference_id: USER_ID,
    customer: "cus_parle_123",
    subscription: "sub_parle_123",
    metadata: { user_id: USER_ID, plan: "premium_monthly" },
    ...overrides,
  };
}

function cachePayload(overrides: Partial<SubscriptionCachePayload> = {}): SubscriptionCachePayload {
  return {
    userId: USER_ID,
    customerId: "cus_parle_123",
    subscriptionId: "sub_parle_123",
    plan: "premium_monthly",
    status: "active",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: "2026-11-13T12:00:00.000Z",
    lastConfirmedAt: "2026-10-13T11:30:00.000Z",
    ...overrides,
  };
}

describe("Parle Stripe subscription rules", () => {
  it("accepts test-mode Stripe keys and refuses live, missing, and malformed key values", () => {
    assert.equal(isStripeTestKey("sk_test_abc123"), true);
    assert.equal(isStripeTestKey("sk_live_abc123"), false);
    assert.equal(isStripeTestKey(undefined), false);
    assert.equal(isStripeTestKey(null), false);
    assert.equal(isStripeTestKey(""), false);
    assert.equal(isStripeTestKey(" sk_test_abc123"), false, "a key with an unexpected prefix cannot trigger Stripe operations");
  });

  it("maps active, trialing, and scheduled-cancellation states without granting inactive subscriptions", () => {
    const end = "2026-11-13T12:00:00.000Z";
    assert.deepEqual(mapStripeSubscriptionStatus("premium_monthly", "active", false, end, NOW), { premium: true, displayStatus: "active" });
    assert.deepEqual(mapStripeSubscriptionStatus("premium_annual", "trialing", false, end, NOW), { premium: true, displayStatus: "trialing" });
    assert.deepEqual(mapStripeSubscriptionStatus("premium_monthly", "active", true, end, NOW), { premium: true, displayStatus: "cancelling" });
    assert.deepEqual(mapStripeSubscriptionStatus("premium_monthly", "active", true, NOW.toISOString(), NOW), { premium: false, displayStatus: "inactive" });
    for (const status of ["canceled", "unpaid", "past_due", "incomplete", "unknown"]) {
      assert.deepEqual(mapStripeSubscriptionStatus("premium_monthly", status, false, end, NOW), { premium: false, displayStatus: "inactive" }, `${status} fails closed`);
    }
    assert.deepEqual(mapStripeSubscriptionStatus(null, "active", false, end, NOW), { premium: false, displayStatus: "inactive" });
  });

  it("recognizes only the two exact USD recurring Premium offers", () => {
    assert.equal(planFromStripeSubscription(subscription()), "premium_monthly");
    assert.equal(planFromStripeSubscription(subscription({
      metadata: { user_id: USER_ID, plan: "premium_annual" },
      items: { data: [{ quantity: 1, price: { currency: "usd", unit_amount: 11900, recurring: { interval: "year", interval_count: 1 } } }] },
    })), "premium_annual");
    assert.equal(planFromStripeSubscription(subscription({ items: { data: [{ quantity: 1, price: { currency: "usd", unit_amount: 1498, recurring: { interval: "month", interval_count: 1 } } }] } })), null);
    assert.equal(planFromStripeSubscription(subscription({ items: { data: [{ quantity: 1, price: { currency: "cad", unit_amount: 1499, recurring: { interval: "month", interval_count: 1 } } }] } })), null);
    assert.equal(planFromStripeSubscription(subscription({ items: { data: [{ quantity: 1, price: { currency: "usd", unit_amount: 1499, recurring: { interval: "month", interval_count: 2 } } }] } })), null);
    assert.equal(planFromStripeSubscription(subscription({ items: { data: [{ quantity: 2, price: { currency: "usd", unit_amount: 1499, recurring: { interval: "month", interval_count: 1 } } }] } })), null);
  });

  it("normalizes Stripe period ends and reports cancellation through the verified end date", () => {
    const normalized = normalizeStripeSubscription(subscription({ cancel_at_period_end: true }), NOW);
    assert.ok(normalized);
    assert.equal(normalized.plan, "premium_monthly");
    assert.equal(normalized.premium, true);
    assert.equal(normalized.displayStatus, "cancelling");
    assert.equal(normalized.currentPeriodEnd, "2026-11-13T12:00:00.000Z");
    const expired = normalizeStripeSubscription(subscription({ cancel_at_period_end: true, current_period_end: Math.floor(NOW.getTime() / 1000) }), NOW);
    assert.equal(expired?.premium, false);
  });

  it("signs cache entries with a purpose-derived HMAC and rejects tampering, expiry, future time, and another user", async () => {
    const payload = cachePayload();
    const signature = await createSubscriptionCacheSignature(payload, TEST_KEY);
    const signed = { ...payload, signature };
    assert.equal(await verifySubscriptionCache(signed, TEST_KEY, USER_ID, NOW), true);
    assert.equal(await verifySubscriptionCache({ ...signed, plan: "premium_annual" as PremiumSubscriptionPlan }, TEST_KEY, USER_ID, NOW), false, "editing a signed plan breaks the HMAC");
    assert.equal(await verifySubscriptionCache(signed, TEST_KEY, "another-user", NOW), false, "the cache is bound to the signed-in account");
    assert.equal(await verifySubscriptionCache(signed, "sk_live_never-use", USER_ID, NOW), false, "live keys cannot validate the cache");
    assert.equal(await verifySubscriptionCache(signed, "", USER_ID, NOW), false, "a missing key cannot validate paid Premium");

    const exactlyOneHourOld = cachePayload({ lastConfirmedAt: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString() });
    const expiredSignature = await createSubscriptionCacheSignature(exactlyOneHourOld, TEST_KEY);
    assert.equal(await verifySubscriptionCache({ ...exactlyOneHourOld, signature: expiredSignature }, TEST_KEY, USER_ID, NOW), false, "the cache must be younger than one hour");

    const futurePayload = cachePayload({ lastConfirmedAt: new Date(NOW.getTime() + 1).toISOString() });
    const futureSignature = await createSubscriptionCacheSignature(futurePayload, TEST_KEY);
    assert.equal(await verifySubscriptionCache({ ...futurePayload, signature: futureSignature }, TEST_KEY, USER_ID, NOW), false, "future-dated cache records fail closed");
  });

  it("checks customer and subscription ownership before accepting a Premium offer", () => {
    const paidSubscription = subscription();
    const ownedCustomer = customer();
    assert.equal(isStripeSubscriptionOwnedByLearner(paidSubscription, ownedCustomer, USER_ID), true);
    assert.equal(verifyStripeSubscriptionOwnership(paidSubscription, ownedCustomer, USER_ID), true);
    assert.equal(verifyStripeSubscriptionOwnership(paidSubscription, ownedCustomer, USER_ID, { subscriptionId: "sub_other" }), false);
    assert.equal(verifyStripeSubscriptionOwnership(paidSubscription, ownedCustomer, USER_ID, { customerId: "cus_other" }), false);
    assert.equal(verifyStripeSubscriptionOwnership(paidSubscription, customer({ metadata: { user_id: "another-user" } }), USER_ID), false);
    assert.equal(verifyStripeSubscriptionOwnership(subscription({ metadata: { user_id: "another-user", plan: "premium_monthly" } }), ownedCustomer, USER_ID), false);
    assert.equal(verifyStripeSubscriptionOwnership(subscription({ metadata: { user_id: USER_ID, plan: "premium_annual" } }), ownedCustomer, USER_ID), false);
    assert.equal(verifyStripeSubscriptionOwnership(subscription({ customer: "cus_other" }), ownedCustomer, USER_ID), false);
    assert.equal(verifyStripeSubscriptionOwnership(paidSubscription, customer({ deleted: true }), USER_ID), false);
  });

  it("accepts a completed Checkout Session only when its account, plan, and subscription mode match", () => {
    assert.deepEqual(verifiedCheckoutSession(session(), USER_ID), {
      sessionId: "cs_test_parle_123",
      customerId: "cus_parle_123",
      subscriptionId: "sub_parle_123",
      userId: USER_ID,
      plan: "premium_monthly",
    });
    assert.equal(verifiedCheckoutSession(session({ client_reference_id: "another-user" }), USER_ID), null);
    assert.equal(verifiedCheckoutSession(session({ metadata: { user_id: "another-user", plan: "premium_monthly" } }), USER_ID), null);
    assert.equal(verifiedCheckoutSession(session({ metadata: { user_id: USER_ID, plan: "premium_annual" } }), USER_ID)?.plan, "premium_annual", "the authenticated Checkout plan is passed to the subscription comparison");
    assert.equal(verifiedCheckoutSession(session({ metadata: { user_id: USER_ID, plan: "free" } }), USER_ID), null, "unsupported plans cannot enter the subscription comparison");
    assert.equal(verifiedCheckoutSession(session({ status: "open" }), USER_ID), null);
    assert.equal(verifiedCheckoutSession(session({ mode: "payment" }), USER_ID), null);
    assert.equal(verifiedCheckoutSession(session({ subscription: null }), USER_ID), null);
  });
});
