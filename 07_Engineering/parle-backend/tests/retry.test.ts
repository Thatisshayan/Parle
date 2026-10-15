import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { isUniqueConflict, retryOnUniqueConflict } from "../supabase/functions/_shared/retry";

const conflict = () => new Error('API request failed: duplicate key value violates unique constraint "subscriber_user_key"');

describe("unique-key conflicts (A10 R11, A11 R27)", () => {
  it("recognises a Postgres unique conflict by code or message, and nothing else", () => {
    expect(isUniqueConflict(conflict())).toBe(true);
    expect(isUniqueConflict({ code: "23505", message: "x" })).toBe(true);
    expect(isUniqueConflict(new Error("network down"))).toBe(false);
    expect(isUniqueConflict(null)).toBe(false);
  });
  it("runs once more after a conflict", async () => {
    let calls = 0;
    expect(await retryOnUniqueConflict(async () => { calls += 1; if (calls === 1) throw conflict(); return "saved"; })).toBe("saved");
    expect(calls).toBe(2);
  });
  it("stops after the second conflict (Review Focus 3)", async () => {
    let calls = 0;
    await expect(retryOnUniqueConflict(async () => { calls += 1; throw conflict(); })).rejects.toThrow("duplicate key");
    expect(calls).toBe(2);
  });
  it("does not retry other errors", async () => {
    let calls = 0;
    await expect(retryOnUniqueConflict(async () => { calls += 1; throw new Error("network down"); })).rejects.toThrow("network down");
    expect(calls).toBe(1);
  });
  it("the Stripe sync retries its save", () => {
    expect(readFileSync(`${import.meta.dir}/../supabase/functions/_shared/stripe-sync.ts`, "utf8")).toContain("retryOnUniqueConflict(");
  });
});
