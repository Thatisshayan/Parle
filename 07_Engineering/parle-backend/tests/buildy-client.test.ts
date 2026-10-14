import { describe, it, expect, mock, afterEach } from "bun:test";
import { signIn, listAll, BUILDY_API, BUILDY_APP_ID, BUILDY_ORIGIN } from "../scripts/buildy/client";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe("buildy client", () => {
  it("signs in with the buildy.show origin and app id", async () => {
    const calls: any[] = [];
    globalThis.fetch = mock(async (url: any, init: any) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ accessToken: "T", refreshToken: "R", user: { id: "u1", email: "e@x", full_name: null, role: "user" } }), { status: 200 });
    }) as any;
    const s = await signIn("e@x", "pw");
    expect(s).toEqual({ accessToken: "T", userId: "u1", email: "e@x" });
    expect(calls[0].url).toBe(`${BUILDY_API}/auth/app-login`);
    expect(calls[0].init.headers.Origin).toBe(BUILDY_ORIGIN);
    expect(JSON.parse(calls[0].init.body)).toEqual({ email: "e@x", password: "pw", appId: BUILDY_APP_ID, inApp: true });
  });
  it("pages through an entity until a short page", async () => {
    const urls: string[] = [];
    globalThis.fetch = mock(async (url: any) => {
      urls.push(String(url));
      const skip = Number(new URL(String(url)).searchParams.get("skip") ?? "0");
      const rows = skip === 0 ? [{ id: "a" }, { id: "b" }] : [{ id: "c" }];
      return new Response(JSON.stringify(rows), { status: 200 });
    }) as any;
    const r = await listAll({ accessToken: "T", userId: "u", email: "e" }, "learner_task", 2);
    expect(r).toEqual({ readable: true, rows: [{ id: "a" }, { id: "b" }, { id: "c" }] });
    expect(urls[0]).toContain(`/apps/${BUILDY_APP_ID}/entities/learner_task?`);
    expect(urls[0]).toContain("q=%7B%7D");
  });
  it("reports a 403 as not readable instead of zero rows", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })) as any;
    const r = await listAll({ accessToken: "T", userId: "u", email: "e" }, "question_item", 2);
    expect(r).toEqual({ readable: false, status: 403, error: "Forbidden" });
  });
});
