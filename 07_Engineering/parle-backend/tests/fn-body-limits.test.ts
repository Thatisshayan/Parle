import { describe, it, expect } from "bun:test";
import { LOCAL_URL } from "./helpers/local";

const BODY_LIMITED_FUNCTIONS = [
  { name: "parle-account-service", maxBytes: 256 * 1024 },
  { name: "parle-admin-service", maxBytes: 1024 * 1024 },
  { name: "parle-assessment-service", maxBytes: 256 * 1024 },
  { name: "parle-lesson-service", maxBytes: 256 * 1024 },
  { name: "parle-payout-service", maxBytes: 128 * 1024 },
  { name: "parle-plan-service", maxBytes: 512 * 1024 },
  { name: "parle-voice-service", maxBytes: 256 * 1024 },
];

describe("authenticated JSON request body limits", () => {
  it("rejects bodies one byte over each route limit before authentication and AI guards", async () => {
    for (let i = 0; i < BODY_LIMITED_FUNCTIONS.length; i += 2) {
      const batch = BODY_LIMITED_FUNCTIONS.slice(i, i + 2);
      await Promise.all(batch.map(async ({ name, maxBytes }) => {
        const body = `{"padding":"${"x".repeat(maxBytes)}"}`;
        const response = await fetch(`${LOCAL_URL}/functions/v1/${name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        expect({ functionName: name, status: response.status }).toEqual({ functionName: name, status: 413 });
        expect(await response.json()).toMatchObject({ error: "REQUEST_TOO_LARGE" });
      }));
    }
  }, 180000);
});
