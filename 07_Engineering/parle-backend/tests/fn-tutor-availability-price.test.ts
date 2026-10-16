import { describe, it, expect } from "bun:test";
import { callFunction } from "./helpers/functions-env";
import { bookableTutor } from "./helpers/lessons";

describe("availability explains the $8 minimum (spec section 4)", () => {
  it("tells the tutor their rate and the minimum lesson charge", async () => {
    const { token } = await bookableTutor({ hourlyRateCents: 1000 });
    const r = await callFunction("parle-marketplace-service", token, { action: "tutor_get_availability" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ hourly_rate_cents: 1000, minimum_lesson_charge_cents: 800 });
  });
});
