import { describe, it, expect } from "bun:test";
import { checkoutSessionParams } from "../supabase/functions/_shared/lessons/checkout-params";

describe("lesson Checkout page settings (final review, Important 2)", () => {
  it("cards only, so a payment never settles days after the hold has gone", () => {
    const p = checkoutSessionParams({ bookingId: "b1", amountCents: 1400, description: "French lesson", customerEmail: "a@x.to", expiresAt: 1_900_000_000, successUrl: "https://app/s", cancelUrl: "https://app/c" });
    expect(p.payment_method_types).toEqual(["card"]);
    expect(p.mode).toBe("payment");
    expect(p.metadata).toEqual({ kind: "lesson", booking_id: "b1" });
    expect(p.line_items[0].price_data.unit_amount).toBe(1400);
  });
});
