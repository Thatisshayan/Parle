import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";

describe("scheduled-job secret (A4, R23)", () => {
  it("sameSecret matches equal secrets only, and never empty ones", async () => {
    const { sameSecret } = await import("../supabase/functions/_shared/secret");
    expect(sameSecret("abc123", "abc123")).toBe(true);
    expect(sameSecret("abc123", "abc124")).toBe(false);
    expect(sameSecret("abc", "abc123")).toBe(false);
    expect(sameSecret("", "")).toBe(false);
  });

  it("refuses missing, placeholder, and short relay secrets", async () => {
    const { usableRelaySecret } = await import("../supabase/functions/_shared/secret");
    expect(usableRelaySecret("")).toBe(false);
    expect(usableRelaySecret("pending")).toBe(false);
    expect(usableRelaySecret("change-me")).toBe(false);
    expect(usableRelaySecret("x".repeat(31))).toBe(false);
    expect(usableRelaySecret("x".repeat(32))).toBe(true);
  });
  it("cronOnly accepts the right secret only, compared in constant time", async () => {
    process.env.CRON_SECRET = "s3cret-value-for-test";
    const { cronOnly } = await import("../supabase/functions/_shared/guards");
    expect(await cronOnly(new Request("http://x", { headers: { "x-cron-secret": "s3cret-value-for-test" } }))).toBeNull();
    expect((await cronOnly(new Request("http://x", { headers: { "x-cron-secret": "s3cret-value-for-tesT" } })))!.status).toBe(401);
    expect((await cronOnly(new Request("http://x")))!.status).toBe(401);
    const src = readFileSync(`${import.meta.dir}/../supabase/functions/_shared/guards.ts`, "utf8");
    expect(src).not.toContain("sent === want");
    expect(src).toContain("sameSecret(sent, want)");
  });
});
