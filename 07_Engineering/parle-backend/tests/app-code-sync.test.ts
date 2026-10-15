import { describe, it, expect } from "bun:test";
import { generate, onDisk } from "../scripts/sync-app-code";

describe("server copy of app code", () => {
  const files = generate();
  it("is up to date (run: bun scripts/sync-app-code.ts)", () => {
    const disk = onDisk();
    expect([...disk.keys()].sort()).toEqual([...files.keys()].sort());
    for (const [path, text] of files) expect(disk.get(path)).toBe(text);
  });
  it("turns each entry's Deno.serve into an exported handler", () => {
    const entry = files.get("_app/functions/parle-public-level-check.ts")!;
    expect(entry).toContain("export const handler = (async (request) =>");
    expect(entry).not.toContain("Deno.serve(");
  });
  it("replaces Buildy's client with the server stand-in and never imports Buildy", () => {
    for (const [path, text] of files) {
      expect(text).not.toContain("@superdevhq/client");
      if (path === "_app/functions/parle-assessment-service.ts") expect(text).toContain('from "../../_shared/superdev-compat.ts"');
    }
  });
});
