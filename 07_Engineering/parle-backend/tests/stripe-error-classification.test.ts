import { describe, expect, it } from "bun:test";
import { stripeRefused } from "../supabase/functions/_shared/lessons/stripe-error.ts";

describe("Stripe Connect refusal classification (R135)", () => {
  it("keeps an ordinary 4xx as a definitive refusal", () => {
    expect(stripeRefused({ statusCode: 400, code: "account_invalid" })).toBe(true);
  });

  it("does not count a 400 idempotency_error as a refusal", () => {
    expect(stripeRefused({ statusCode: 400, code: "idempotency_error" })).toBe(false);
    expect(stripeRefused({ raw: { statusCode: 400, code: "idempotency_error" } })).toBe(false);
  });

  it("does not count an in-progress 409 or an unavailable 5xx as a refusal", () => {
    expect(stripeRefused({ statusCode: 409, code: "idempotency_key_in_use" })).toBe(false);
    expect(stripeRefused({ statusCode: 503 })).toBe(false);
  });
});
