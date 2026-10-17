import { describe, it, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { imageUrlForDisplay } from "./parle-profile";

const ROOT = join(import.meta.dir, "../..");
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : [p];
});

describe("no Buildy at run time", () => {
  it("no source, page or manifest refers to Buildy hosts, storage or packages", { timeout: 30_000 }, () => { // walks the whole tree; slow while the machine is busy
    const targets = [...files(join(ROOT, "src")), join(ROOT, "index.html"), join(ROOT, "public/manifest.json")]
      .filter((p) => /\.(tsx?|html|json)$/.test(p) && !p.endsWith(".test.ts"));
    const hits = targets.filter((p) => /buildy\.(ai|show|work)|ellprnxjjzatijdxcogk|superdevhq|BrandingBadge/i.test(readFileSync(p, "utf8")));
    expect(hits.map((p) => p.slice(ROOT.length))).toEqual([]);
  });
  it("shows uploaded photos through the plain public address (D30)", () => {
    const url = "http://127.0.0.1:54321/storage/v1/object/public/profile-photos/u/p.png";
    expect(imageUrlForDisplay(url, 240)).toBe(url);
  });
});
