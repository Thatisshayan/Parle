import { describe, it, expect } from "bun:test";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { retagStripe } from "../scripts/migrate/stripe-retag";

describe("Stripe re-tag (final review, Important 1)", () => {
  it("refuses a non-production database: the Stripe sandbox is shared with production", async () => {
    const bundle = { exportedAt: "t", people: [], rows: { Subscriber: [{ id: "x", user_id: "y", stripe_subscription_id: "sub_x" }] } };
    await expect(retagStripe({ url: LOCAL_URL, serviceKey: localKeys().service }, bundle as any, { stripeKey: "sk_test_dummy" })).rejects.toThrow("shared with production");
  });
});
