import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { photoKind, photoOrigins, photosToRemove, saveCutoff } from "../supabase/functions/_shared/profile-photo";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 1, 2, 3]);
const answer = (status: number, body: BodyInit | null = null) => (async () => new Response(body, { status })) as unknown as typeof fetch;

describe("photo check (A33, R41)", () => {
  it("asks storage for the first bytes only and knows a photo", async () => {
    let range = "", url = "";
    const fetcher = (async (u: string, init?: RequestInit) => {
      url = u; range = new Headers(init?.headers).get("Range") ?? "";
      return new Response(PNG, { status: 206 });
    }) as unknown as typeof fetch;
    expect(await photoKind("u1/a.png", "http://storage.test", fetcher)).toBe("image");
    expect(range).toBe("bytes=0-15");
    expect(url).toBe("http://storage.test/storage/v1/object/public/profile-photos/u1/a.png");
  });
  it("tells a file that is not a photo from a missing file and from a storage error", async () => {
    expect(await photoKind("u1/a.png", "http://s", answer(200, "<html>not a photo</html>"))).toBe("not_image");
    expect(await photoKind("u1/a.png", "http://s", answer(400, "{\"error\":\"not_found\"}"))).toBe("missing");
    expect(await photoKind("u1/a.png", "http://s", answer(503, "busy"))).toBe("unreadable");
    expect(await photoKind("u1/a.png", "http://s", (async () => { throw new TypeError("network"); }) as unknown as typeof fetch)).toBe("unreadable");
  });
  it("the account service answers a storage error with a retry message and keeps the upload", () => {
    const src = readFileSync(`${import.meta.dir}/../supabase/functions/parle-account-service/index.ts`, "utf8");
    expect(src).toContain('"PHOTO_CHECK_FAILED", 503');
    const unreadable = src.indexOf('kind === "unreadable"');
    expect(unreadable).toBeGreaterThan(0);
    expect(unreadable).toBeLessThan(src.indexOf("removePhotos(admin, [newPhoto])"));
  });
});

describe("which photo files are removed (A31, R39; A32, R40)", () => {
  const files = [
    { path: "u/a.png", createdAt: "2026-10-16T10:00:00.000Z" },
    { path: "u/b.png", createdAt: "2026-10-16T10:05:00.000Z" },
    { path: "u/c.png", createdAt: "2026-10-16T10:10:00.000Z" },
  ];
  it("never the saved photo, never a file newer than the cutoff", () => {
    expect(photosToRemove(files, "u/b.png", "2026-10-16T10:05:00.000Z")).toEqual(["u/a.png"]);
    expect(photosToRemove(files, null, "2026-10-16T10:07:00.000Z")).toEqual(["u/a.png", "u/b.png"]);
    expect(photosToRemove(files, "u/a.png", "2026-10-16T10:20:00.000Z")).toEqual(["u/b.png", "u/c.png"]);
  });
});

describe("a save never removes a recent upload (A31, R39, final race)", () => {
  it("keeps every file from the last 10 minutes; the clean-up removes them later", () => {
    const start = "2026-10-16T12:00:00.000Z";
    expect(saveCutoff("2026-10-16T11:59:50.000Z", start)).toBe("2026-10-16T11:50:00.000Z");
    expect(saveCutoff("2026-10-16T11:00:00.000Z", start)).toBe("2026-10-16T11:00:00.000Z");
    expect(saveCutoff(undefined, start)).toBe("2026-10-16T11:50:00.000Z");
  });
});

describe("local addresses (A38, R46)", () => {
  it("accepts both local names for the local stack, and only the given address in production", () => {
    expect(photoOrigins(["http://127.0.0.1:54321"]).sort()).toEqual(["http://127.0.0.1:54321", "http://localhost:54321"]);
    expect(photoOrigins(["http://localhost:54321", "http://127.0.0.1:54321"]).sort()).toEqual(["http://127.0.0.1:54321", "http://localhost:54321"]);
    expect(photoOrigins(["https://hcphvipeplkfenugikrf.supabase.co", undefined, "not an address"])).toEqual(["https://hcphvipeplkfenugikrf.supabase.co"]);
  });
});
