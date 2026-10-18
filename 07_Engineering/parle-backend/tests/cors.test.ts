import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";

// The local gateway (Kong) answers preflights itself and adds "*"; the helper is tested directly here and the
// production behaviour is checked in Plan 4 Task 11.
describe("browser origins (R8)", () => {
  it("echoes only the app's own addresses and removes any other allow-origin", async () => {
    process.env.APP_ORIGINS = "http://127.0.0.1:5173,https://parle.buzz";
    const { withCors } = await import("../supabase/functions/_shared/cors");
    const base = () => new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
    const ok = withCors(new Request("http://x", { headers: { Origin: "https://parle.buzz" } }), base());
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://parle.buzz");
    const evil = withCors(new Request("http://x", { headers: { Origin: "https://evil.example" } }), base());
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
    const none = withCors(new Request("http://x"), base());
    expect(none.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("payout countries (R1)", () => {
  it("are readable without signing in (non-private configuration)", async () => {
    const service = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
    await service.from("tutor_payout_country").insert({ country_name: "Testland", country_code: "TL", status: "supported" });
    const anon = createClient(LOCAL_URL, localKeys().anon, { auth: { persistSession: false } });
    const { data, error } = await anon.from("tutor_payout_country").select("country_name, country_code, status").eq("country_code", "TL");
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});

describe("errors and Vary (A6, R32)", () => {
  const allowed = () => new Request("http://x", { method: "POST", headers: { Origin: "https://parle.buzz" } });
  it("a handler that throws answers generically and does not log exception details", async () => {
    process.env.APP_ORIGINS = "https://parle.buzz";
    const { wrapHandler } = await import("../supabase/functions/_shared/serve");
    const logged: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { logged.push(args); };
    let r: Response;
    try {
      r = await wrapHandler(() => { throw new Error("private learner email and provider response"); })(allowed());
    } finally {
      console.error = originalError;
    }
    expect(r.status).toBe(500);
    expect(r.headers.get("access-control-allow-origin")).toBe("https://parle.buzz");
    expect((await r.json()).error_code).toBe("INTERNAL");
    expect(JSON.stringify(logged)).not.toContain("private learner email");
    expect(JSON.stringify(logged)).not.toContain("provider response");
    expect(logged[0]?.[0]).toBe("unhandled function error");
  });
  it("a guard that throws answers the same way", async () => {
    process.env.APP_ORIGINS = "https://parle.buzz";
    const { wrapHandler } = await import("../supabase/functions/_shared/serve");
    const r = await wrapHandler(() => new Response("ok"), async () => { throw new Error("guard down"); })(allowed());
    expect(r.status).toBe(500);
    expect(r.headers.get("access-control-allow-origin")).toBe("https://parle.buzz");
  });
  it("every answer varies by Origin, allowed or not", async () => {
    process.env.APP_ORIGINS = "https://parle.buzz";
    const { withCors } = await import("../supabase/functions/_shared/cors");
    const evil = withCors(new Request("http://x", { headers: { Origin: "https://evil.example" } }), new Response("ok"));
    const none = withCors(new Request("http://x"), new Response("ok"));
    expect(evil.headers.get("vary")).toBe("Origin");
    expect(none.headers.get("vary")).toBe("Origin");
  });
});
