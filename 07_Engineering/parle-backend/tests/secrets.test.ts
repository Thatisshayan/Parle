import { describe, it, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readSecret } from "../scripts/lib/secrets";

describe("readSecret", () => {
  it("returns a bare value", () => {
    const p = join(mkdtempSync(join(tmpdir(), "sec-")), "K");
    writeFileSync(p, "abc123\n");
    expect(readSecret(p)).toBe("abc123");
  });
  it("strips a NAME= prefix and optional quotes", () => {
    const d = mkdtempSync(join(tmpdir(), "sec-"));
    writeFileSync(join(d, "A"), "RESEND_API_KEY=re_abc\r\n");
    writeFileSync(join(d, "B"), 'TOKEN="xyz"\n');
    expect(readSecret(join(d, "A"))).toBe("re_abc");
    expect(readSecret(join(d, "B"))).toBe("xyz");
  });
});
