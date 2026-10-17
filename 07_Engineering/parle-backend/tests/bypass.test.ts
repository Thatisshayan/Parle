import { describe, it, expect } from "bun:test";
import { openWithBypass } from "../scripts/lib/bypass";

describe("opening the preview never prints the bypass (Plan 12 final review)", () => {
  it("a failed navigation's error has the secret removed", async () => {
    const page = { goto: async (url: string) => { throw new Error(`net::ERR_FAILED at ${url}`); } };
    const err = await openWithBypass(page, "https://preview.test", "s3cr3t-bypass-value").catch((e) => e as Error);
    expect(err.message).toContain("https://preview.test");
    expect(err.message).not.toContain("s3cr3t-bypass-value");
  });
  it("opens the preview with the bypass cookie request", async () => {
    let seen = "";
    await openWithBypass({ goto: async (url: string) => { seen = url; } }, "https://preview.test", "abc");
    expect(seen).toBe("https://preview.test/?x-vercel-protection-bypass=abc&x-vercel-set-bypass-cookie=true");
  });
});
