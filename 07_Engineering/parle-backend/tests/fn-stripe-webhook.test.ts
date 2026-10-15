import { describe, it, expect } from "bun:test";
import Stripe from "stripe";
import { functionsEnv } from "./helpers/functions-env";

const stripe = new Stripe("sk_test_dummy", { apiVersion: "2023-10-16" });
const signed = (payload: object, secret = functionsEnv().STRIPE_WEBHOOK_SECRET) => {
  const body = JSON.stringify(payload);
  return { body, header: stripe.webhooks.generateTestHeaderString({ payload: body, secret }) };
};
async function post(body: string, signature?: string) {
  const r = await fetch("http://127.0.0.1:54321/functions/v1/stripe-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(signature ? { "stripe-signature": signature } : {}) },
    body,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

describe("stripe-webhook", () => {
  it("refuses unsigned and wrongly signed events", async () => {
    expect((await post("{}")).status).toBe(400);
    const s = signed({ id: "evt_1", object: "event", type: "customer.created", livemode: false, data: { object: {} } }, "whsec_wrong");
    expect((await post(s.body, s.header)).status).toBe(400);
  });
  it("accepts a signed event it does not act on", async () => {
    const s = signed({ id: "evt_2", object: "event", type: "customer.created", livemode: false, data: { object: {} } });
    const r = await post(s.body, s.header);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ received: true, handled: false });
  });
  it("answers 200 for a subscription Stripe does not have, so Stripe stops retrying (found in the Task 10 check)", async () => {
    const s = signed({ id: "evt_4", object: "event", type: "customer.subscription.updated", livemode: false, data: { object: { id: "sub_does_not_exist_parle" } } });
    const r = await post(s.body, s.header);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ received: true, handled: false });
  }, 20000);
  it("refuses live-mode events while Parle is in sandbox", async () => {
    const s = signed({ id: "evt_3", object: "event", type: "customer.subscription.updated", livemode: true, data: { object: { id: "sub_x" } } });
    expect((await post(s.body, s.header)).status).toBe(400);
  });
});
