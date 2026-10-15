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
