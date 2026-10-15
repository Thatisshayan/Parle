import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  startLearnerBillingCheckout,
  type StripeRuntime,
} from "../../functions/parle-billing-checkout.helper.ts";
import { checkoutFailureTranslationKey, extractBillingErrorCode } from "./learner-billing-errors";
import { t } from "./i18n";

const ORIGIN = "https://parle-preview.superdev.run";
const USER = { id: "learner-user-42", email: "learner@parle.test", role: "user" };
const URL = "https://checkout.stripe.com/c/pay/cs_test_mocked";

function request(): Request {
  return new Request("https://service.test/billing", {
    method: "POST",
    headers: { Origin: ORIGIN },
    body: "{}",
  });
}

function callerClient(options: {
  user?: typeof USER;
  identities?: Array<Record<string, unknown>>;
  subscribers?: Array<Record<string, unknown>>;
} = {}) {
  const user = options.user ?? USER;
  const filters: Array<{ entity: string; where: Record<string, unknown>; limit: number }> = [];
  return {
    filters,
    auth: {
      me: async () => user,
    },
    entities: {
      ParleIdentity: {
        filter: async (where: Record<string, unknown>, _sort: string, limit: number) => {
          filters.push({ entity: "ParleIdentity", where, limit });
          return { data: options.identities ?? [{
            id: "learner-identity-42",
            created_by: user.email,
            role: "learner",
            premium_comp_active: false,
          }] };
        },
      },
      Subscriber: {
        filter: async (where: Record<string, unknown>, _sort: string, limit: number) => {
          filters.push({ entity: "Subscriber", where, limit });
          return { data: options.subscribers ?? [] };
        },
      },
    },
  };
}

function fakeStripe(options: { failCheckout?: boolean; failCustomerSearch?: boolean } = {}) {
  const calls = {
    customerSearch: [] as unknown[],
    customerCreate: [] as unknown[],
    subscriptionList: [] as unknown[],
    checkoutCreate: [] as unknown[],
  };
  const stripe = {
    customers: {
      search: async (args: unknown) => {
        calls.customerSearch.push(args);
        if (options.failCustomerSearch) throw new Error("private Stripe request body should not reach the learner");
        return { data: [], has_more: false };
      },
      create: async (args: unknown) => {
        calls.customerCreate.push(args);
        return { id: "cus_test_mocked", deleted: false, metadata: { user_id: USER.id } };
      },
      retrieve: async () => null,
    },
    subscriptions: {
      list: async (args: unknown) => {
        calls.subscriptionList.push(args);
        return { data: [], has_more: false };
      },
    },
    checkout: {
      sessions: {
        create: async (args: unknown) => {
          calls.checkoutCreate.push(args);
          if (options.failCheckout) throw new Error("private Stripe response payload should not reach the learner");
          return { id: "cs_test_mocked", url: URL };
        },
      },
    },
  };
  return { calls, stripe };
}

function testRuntime(stripe: any): StripeRuntime {
  return { stripe, secret: "sk_test_mock_subscription_checkout" };
}

async function readBody(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe("learner-only Parle billing Checkout", () => {
  it("accepts an authenticated Built-in learner with a later owned learner identity and no Subscriber row", async () => {
    const client = callerClient({
      identities: [
        { id: "older-tutor-identity", created_by: USER.email, role: "tutor" },
        { id: "learner-identity-42", created_by: USER.email, role: "learner", premium_comp_active: false },
      ],
      subscribers: [],
    });
    const user = await client.auth.me();
    const fake = fakeStripe();

    assert.deepEqual(user, USER, "the test uses the server-authenticated Built-in user identity");
    const response = await startLearnerBillingCheckout({
      request: request(),
      client,
      user,
      body: { action: "billing_checkout", plan: "premium_monthly" },
      origin: ORIGIN,
      runtime: testRuntime(fake.stripe),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await readBody(response), { status: "complete", url: URL });
    assert.deepEqual(client.filters[0], {
      entity: "ParleIdentity",
      where: { created_by: USER.email, role: "learner" },
      limit: 100,
    });
    assert.equal(client.filters.some((filter) => filter.entity === "Subscriber"), true);
    assert.deepEqual(fake.calls.customerCreate, [{ email: USER.email, metadata: { user_id: USER.id } }]);
    assert.deepEqual(fake.calls.checkoutCreate[0], {
      mode: "subscription",
      customer: "cus_test_mocked",
      client_reference_id: USER.id,
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: 1499,
          recurring: { interval: "month" },
          product_data: { name: "Parle Premium" },
        },
        quantity: 1,
      }],
      metadata: { user_id: USER.id, plan: "premium_monthly" },
      subscription_data: { metadata: { user_id: USER.id, plan: "premium_monthly" } },
      success_url: `${ORIGIN}/learner/plan?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${ORIGIN}/learner/plan?checkout=cancelled`,
    });
  });

  it("sends the yearly offer to mocked Checkout in subscription mode at $119 per year", async () => {
    const client = callerClient();
    const fake = fakeStripe();
    const response = await startLearnerBillingCheckout({
      request: request(),
      client,
      user: await client.auth.me(),
      body: { action: "billing_checkout", plan: "premium_annual" },
      origin: ORIGIN,
      runtime: testRuntime(fake.stripe),
    });

    assert.equal(response.status, 200);
    assert.equal(fake.calls.checkoutCreate.length, 1);
    const options = fake.calls.checkoutCreate[0] as any;
    assert.equal(options.mode, "subscription");
    assert.equal(options.line_items[0].price_data.currency, "usd");
    assert.equal(options.line_items[0].price_data.unit_amount, 11900);
    assert.equal(options.line_items[0].price_data.recurring.interval, "year");
  });

  it("denies tutors and administrator accounts before any mocked Stripe call", async () => {
    const tutorClient = callerClient({ identities: [{ id: "tutor-identity", created_by: USER.email, role: "tutor" }] });
    const tutorStripe = fakeStripe();
    const tutorResponse = await startLearnerBillingCheckout({
      request: request(),
      client: tutorClient,
      user: await tutorClient.auth.me(),
      body: { action: "billing_checkout", plan: "premium_monthly" },
      origin: ORIGIN,
      runtime: testRuntime(tutorStripe.stripe),
    });
    assert.equal(tutorResponse.status, 403);
    assert.deepEqual(await readBody(tutorResponse), { error_code: "billing_not_allowed" });
    assert.deepEqual(tutorStripe.calls, { customerSearch: [], customerCreate: [], subscriptionList: [], checkoutCreate: [] });
    assert.equal(tutorClient.filters.some((filter) => filter.entity === "Subscriber"), false);

    const admin = { ...USER, id: "admin-user-9", role: "administrator" };
    const adminClient = callerClient({ user: admin });
    const adminStripe = fakeStripe();
    const adminResponse = await startLearnerBillingCheckout({
      request: request(),
      client: adminClient,
      user: await adminClient.auth.me(),
      body: { action: "billing_checkout", plan: "premium_monthly" },
      origin: ORIGIN,
      runtime: testRuntime(adminStripe.stripe),
    });
    assert.equal(adminResponse.status, 403);
    assert.deepEqual(await readBody(adminResponse), { error_code: "billing_not_allowed" });
    assert.deepEqual(adminStripe.calls, { customerSearch: [], customerCreate: [], subscriptionList: [], checkoutCreate: [] });
    assert.equal(adminClient.filters.length, 0);
  });

  it("returns configuration and test-mode codes before touching Stripe", async () => {
    const client = callerClient();
    const absentKey = await startLearnerBillingCheckout({
      request: request(), client, user: await client.auth.me(),
      body: { action: "billing_checkout", plan: "premium_monthly" }, origin: ORIGIN,
      runtime: { stripe: null, secret: null },
    });
    assert.equal(absentKey.status, 503);
    assert.deepEqual(await readBody(absentKey), { error_code: "billing_not_configured" });

    const liveKeyStripe = fakeStripe();
    const liveKey = await startLearnerBillingCheckout({
      request: request(), client, user: await client.auth.me(),
      body: { action: "billing_checkout", plan: "premium_monthly" }, origin: ORIGIN,
      runtime: { stripe: liveKeyStripe.stripe, secret: "sk_live_do_not_use" },
    });
    assert.equal(liveKey.status, 503);
    assert.deepEqual(await readBody(liveKey), { error_code: "test_mode_unavailable" });
    assert.deepEqual(liveKeyStripe.calls, { customerSearch: [], customerCreate: [], subscriptionList: [], checkoutCreate: [] });
  });

  it("returns only a safe Stripe error code when a mocked Stripe request fails", async () => {
    const client = callerClient();
    const fake = fakeStripe({ failCustomerSearch: true });
    const response = await startLearnerBillingCheckout({
      request: request(),
      client,
      user: await client.auth.me(),
      body: { action: "billing_checkout", plan: "premium_monthly" },
      origin: ORIGIN,
      runtime: testRuntime(fake.stripe),
    });
    const payload = await readBody(response);
    assert.equal(response.status, 502);
    assert.deepEqual(payload, { error_code: "stripe_error" });
    assert.doesNotMatch(JSON.stringify(payload), /private Stripe|mock_subscription_checkout|learner@parle\.test/i);
    assert.equal(fake.calls.checkoutCreate.length, 0);
  });
});

describe("learner checkout failure messages", () => {
  it("maps the four safe billing categories to distinct, useful messages", () => {
    assert.equal(t(checkoutFailureTranslationKey({ code: "billing_not_allowed" })), "Premium checkout is available only to signed-in learner accounts.");
    assert.equal(t(checkoutFailureTranslationKey({ code: "billing_not_configured" })), "Premium billing has not been configured for this app. Try again later.");
    assert.equal(t(checkoutFailureTranslationKey({ code: "test_mode_unavailable" })), "Premium billing is available only while the app is connected to Stripe test mode.");
    assert.equal(t(checkoutFailureTranslationKey({ code: "stripe_error" })), "Stripe could not start checkout. Your plan has not changed. Try again.");
  });

  it("extracts codes from normal envelopes and the function SDK's rejected HTTP errors", () => {
    assert.equal(extractBillingErrorCode({ result: { data: { error_code: "billing_not_configured" } } }), "billing_not_configured");
    assert.equal(extractBillingErrorCode(new Error('API request failed: {"error_code":"test_mode_unavailable"}')), "test_mode_unavailable");
    assert.equal(extractBillingErrorCode(new Error("Authentication required")), "billing_not_allowed");
    assert.equal(checkoutFailureTranslationKey(new Error('API request failed: {"error_code":"stripe_error","message":"secret value"}')), "learner.plan.checkoutError");
    assert.equal(t(checkoutFailureTranslationKey(new Error("unrecognized private exception"))), "Stripe could not start checkout. Your plan has not changed. Try again.");
  });
});

describe("billing return origin", () => {
  it("accepts only the configured app origins when APP_ORIGINS is set", async () => {
    const { billingOriginForRequest } = await import("../../functions/parle-billing-checkout.helper.ts");
    const g = globalThis as any;
    const saved = g.Deno;
    g.Deno = { env: { get: (k: string) => (k === "APP_ORIGINS" ? "http://127.0.0.1:5173, https://parle.buzz" : undefined) } };
    try {
      assert.equal(billingOriginForRequest(new Request("http://x", { headers: { Origin: "http://127.0.0.1:5173" } })), "http://127.0.0.1:5173");
      assert.equal(billingOriginForRequest(new Request("http://x", { headers: { Origin: "https://parle.buzz" } })), "https://parle.buzz");
      assert.equal(billingOriginForRequest(new Request("http://x", { headers: { Origin: "https://evil.example" } })), null);
    } finally {
      g.Deno = saved;
    }
  });
});

describe("billing return origin on the server", () => {
  it("refuses every origin on the server when APP_ORIGINS is not set (R22)", async () => {
    const { billingOriginForRequest } = await import("../../functions/parle-billing-checkout.helper.ts");
    const g = globalThis as any;
    const saved = g.Deno;
    g.Deno = { env: { get: (k: string) => (k === "SUPABASE_URL" ? "https://x.supabase.co" : undefined) } };
    try {
      assert.equal(billingOriginForRequest(new Request("http://x", { headers: { Origin: "https://any.example" } })), null);
    } finally {
      g.Deno = saved;
    }
  });
});
