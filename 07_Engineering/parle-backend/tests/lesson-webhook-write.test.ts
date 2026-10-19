import { describe, expect, it } from "bun:test";
import { markPaymentDisputed } from "../supabase/functions/_shared/lessons/disputes";

describe("Stripe dispute persistence", () => {
  it("throws when the dispute status cannot be persisted so the signed webhook returns retryable 500", async () => {
    const db = {
      from(table: string) {
        if (table !== "payment") throw new Error("unexpected table");
        return {
          select() {
            return { eq: () => ({ maybeSingle: async () => ({ data: { id: "payment-1", booking_id: "booking-1", amount_cents: 4000, refunded_cents: 0, status: "succeeded" }, error: null }) }) };
          },
          update() {
            return { eq: async () => ({ error: { message: "temporary write failure" } }) };
          },
        };
      },
    } as any;

    await expect(markPaymentDisputed(db, "payment-1", new Date().toISOString()))
      .rejects.toThrow("temporary write failure");
  });
});
