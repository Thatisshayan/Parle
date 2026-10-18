import { describe, it, expect, mock, afterEach } from "bun:test";
import { kebab, makeFunctions } from "./functions";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe("functions proxy", () => {
  it("maps camelCase names to kebab-case function urls", () => {
    expect(kebab("parleAccountService")).toBe("parle-account-service");
    expect(kebab("parlePublicLevelCheck")).toBe("parle-public-level-check");
  });
  it("posts the payload with the session token and returns the parsed body", async () => {
    let seen: unknown;
    globalThis.fetch = mock(async (url: unknown, init: unknown) => { seen = { url: String(url), init }; return new Response(JSON.stringify({ ok: true }), { status: 200 }); }) as unknown;
    const fns = makeFunctions("http://x", "pk", async () => "TOKEN");
    expect(await fns.parleAccountService({ action: "save_profile" })).toEqual({ ok: true });
    expect(seen.url).toBe("http://x/functions/v1/parle-account-service");
    expect(seen.init.headers.Authorization).toBe("Bearer TOKEN");
  });
  it("throws Buildy's error format with the http status", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ error: "ADMIN_REQUIRED", error_code: "ADMIN_REQUIRED" }), { status: 403 })) as unknown;
    const fns = makeFunctions("http://x", "pk", async () => null);
    const err: unknown = await fns.parleMarketplaceService({ action: "admin_authorize" }).catch((e: unknown) => e);
    expect(err.message).toBe("API request failed: ADMIN_REQUIRED");
    expect(err.status).toBe(403);
  });
});
