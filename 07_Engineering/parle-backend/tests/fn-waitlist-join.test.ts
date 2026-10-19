import { describe, it, expect, beforeEach } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { callFunction } from "./helpers/functions-env";
import { psql, resetWaitlist } from "./helpers/admin";

const URL_ = `${LOCAL_URL}/functions/v1/parle-waitlist-join`;
const origin = { Origin: "https://parle.buzz" };
const payload = (email: string, overrides: Record<string, unknown> = {}) => ({
  p_email: email, p_role: "learner", p_goal: "conversation", p_locale: "en-CA", p_source: "test", consent: true, ...overrides,
});
const ip = () => `198.51.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;

describe("public waitlist signup", () => {
  beforeEach(() => resetWaitlist());

  it("records a consented signup through the Edge Function and allows the site origin", async () => {
    const email = `join-${crypto.randomUUID().slice(0, 8)}@example.test`;
    const r = await callFunction("parle-waitlist-join", null, payload(email), { ...origin, "x-forwarded-for": ip() });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(psql(`select lower(email) || '|' || role || '|' || goal || '|' || locale || '|' || source from public.waitlist_signup where email = '${email}'`))
      .toBe(`${email}|learner|conversation|en-CA|test`);
  });

  it("requires the explicit consent signal and stores no row when it is absent", async () => {
    const email = `consent-${crypto.randomUUID().slice(0, 8)}@example.test`;
    const r = await callFunction("parle-waitlist-join", null, payload(email, { consent: false }), { ...origin, "x-forwarded-for": ip() });
    expect(r.status).toBe(400);
    expect(psql(`select count(*) from public.waitlist_signup where email = '${email}'`)).toBe("0");
  });

  it("silently drops a server-submitted honeypot without inserting a row", async () => {
    const email = `bot-${crypto.randomUUID().slice(0, 8)}@example.test`;
    const r = await callFunction("parle-waitlist-join", null, payload(email, { website: "filled" }), { ...origin, "x-forwarded-for": ip() });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(psql(`select count(*) from public.waitlist_signup where email = '${email}'`)).toBe("0");
  });

  it("applies an hourly per-email cap before calling the signup RPC", async () => {
    const email = `limited-${crypto.randomUUID().slice(0, 8)}@example.test`;
    for (let n = 0; n < 3; n++) {
      const r = await callFunction("parle-waitlist-join", null, payload(email), { ...origin, "x-forwarded-for": ip() });
      expect(r.status).toBe(200);
    }
    const fourth = await callFunction("parle-waitlist-join", null, payload(email), { ...origin, "x-forwarded-for": ip() });
    expect(fourth.status).toBe(429);
    expect(psql(`select count(*) from public.waitlist_signup where email = '${email}'`)).toBe("1");
  });

  it("applies the 20-per-hour cap to repeated source addresses with unique emails", async () => {
    const address = ip();
    const emails = Array.from({ length: 20 }, () => `source-${crypto.randomUUID()}@example.test`);
    for (const email of emails) {
      const r = await callFunction("parle-waitlist-join", null, payload(email), { ...origin, "cf-connecting-ip": address, "x-forwarded-for": address });
      expect(r.status).toBe(200);
    }
    const blocked = await callFunction("parle-waitlist-join", null, payload(`source-${crypto.randomUUID()}@example.test`), { ...origin, "cf-connecting-ip": address, "x-forwarded-for": address });
    expect(blocked.status).toBe(429);
    expect(psql(`select count(*) from public.waitlist_signup where email in (${emails.map((email) => `'${email}'`).join(",")})`)).toBe("20");
  });

  it("rejects oversized requests before parsing and rejects direct anonymous RPC writes", async () => {
    const large = await fetch(URL_, {
      method: "POST", headers: { ...origin, "Content-Type": "application/json", apikey: localKeys().anon },
      body: JSON.stringify(payload("large@example.test", { padding: "x".repeat(2048) })),
    });
    expect(large.status).toBe(413);

    const anon = createClient(LOCAL_URL, localKeys().anon, { auth: { persistSession: false } });
    const { error } = await anon.rpc("join_waitlist", { p_email: "direct@example.test", p_role: "learner", p_goal: null, p_locale: "en-CA", p_source: "test" });
    expect(error).not.toBeNull();
    expect(psql("select count(*) from public.waitlist_signup where email = 'direct@example.test'")).toBe("0");
  });
});
