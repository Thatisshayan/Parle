import { describe, it, expect } from "bun:test";
import { LOCAL_URL } from "./helpers/local";

const BODY_LIMITED_FUNCTIONS = [
  "parle-account-service",
  "parle-admin-service",
  "parle-assessment-service",
  "parle-lesson-service",
  "parle-payout-service",
  "parle-plan-service",
  "parle-voice-service",
];

describe("authenticated JSON request body limits", () => {
  it("rejects oversized bodies before authentication and AI guards", async () => {
    const body = `{"padding":"${"x".repeat(1024 * 1024)}"}`;
    for (const functionName of BODY_LIMITED_FUNCTIONS) {
      const response = await fetch(`${LOCAL_URL}/functions/v1/${functionName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      expect({ functionName, status: response.status }).toEqual({ functionName, status: 413 });
      expect(await response.json()).toMatchObject({ error: "REQUEST_TOO_LARGE" });
    }
  }, 60000);
});
