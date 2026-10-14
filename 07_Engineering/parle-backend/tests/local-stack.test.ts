import { describe, it, expect } from "bun:test";
import { LOCAL_URL, localKeys } from "./helpers/local";

describe("local staging stack", () => {
  it("answers on the REST endpoint", async () => {
    const res = await fetch(`${LOCAL_URL}/rest/v1/`, { headers: { apikey: localKeys().anon } });
    expect(res.status).toBe(200);
  });
});
