import { describe, it, expect, beforeEach } from "bun:test";
import { sendMail } from "../supabase/functions/_shared/email";
import { latestMail, mailHeaders } from "./helpers/mailpit";

describe("email", () => {
  beforeEach(() => { process.env.EMAIL_TRANSPORT = "mailpit"; process.env.MAILPIT_URL = "http://127.0.0.1:54324"; });
  it("delivers through the local mail catcher with the automatic sender", async () => {
    const to = `mail-${crypto.randomUUID()}@example.test`, since = new Date(Date.now() - 2000).toISOString();
    await sendMail({ to, subject: "Parle test", html: "<p>Bonjour</p>" });
    const m = await latestMail(to, since);
    expect(m.subject).toBe("Parle test");
    expect(m.html).toContain("Bonjour");
  });
  it("refuses to send through Resend without a key", async () => {
    process.env.EMAIL_TRANSPORT = "resend";
    delete process.env.RESEND_API_KEY;
    await expect(sendMail({ to: "a@example.test", subject: "x", html: "x" })).rejects.toThrow("EMAIL_NOT_CONFIGURED");
  });
  it("passes a duplicate-protection key to Resend, so a retried send goes out once (final review, Important 4)", async () => {
    process.env.EMAIL_TRANSPORT = "resend";
    process.env.RESEND_API_KEY = "re_test_dummy";
    const real = globalThis.fetch;
    let sent: Headers | null = null;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => { sent = new Headers(init?.headers); return new Response(JSON.stringify({ id: "m1" }), { status: 200 }); }) as typeof fetch;
    try {
      await sendMail({ to: "a@example.test", subject: "x", html: "x", idempotencyKey: "lesson:b1:confirmation:a@example.test" });
    } finally {
      globalThis.fetch = real;
      delete process.env.RESEND_API_KEY;
    }
    expect(sent!.get("Idempotency-Key")).toBe("lesson:b1:confirmation:a@example.test");
  });
  it("every lesson email is sent with a key per lesson, kind and recipient", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(`${import.meta.dir}/../supabase/functions/_shared/lessons/notify.ts`, "utf8");
    expect(src).toContain("idempotencyKey: `${key}:${mail.to}`");
    const calls = src.split("\n").filter((line) => line.includes("await send("));
    expect(calls.length).toBeGreaterThan(3);
    expect(calls.every((line) => line.includes("`lesson:"))).toBe(true);
  });
  it("sends headers and a plain-text part to Resend and to the mail catcher (Plan 8: List-Unsubscribe)", async () => {
    process.env.EMAIL_TRANSPORT = "resend";
    process.env.RESEND_API_KEY = "re_test_dummy";
    const real = globalThis.fetch;
    let body: any = null;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => { body = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ id: "m2" }), { status: 200 }); }) as typeof fetch;
    try {
      await sendMail({ to: "a@example.test", subject: "x", html: "<p>x</p>", text: "x", headers: { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
    } finally {
      globalThis.fetch = real;
      delete process.env.RESEND_API_KEY;
    }
    expect(body).toMatchObject({ text: "x", headers: { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
    process.env.EMAIL_TRANSPORT = "mailpit";
    const to = `hdr-${crypto.randomUUID()}@example.test`, since = new Date(Date.now() - 2000).toISOString();
    await sendMail({ to, subject: "h", html: "<p>h</p>", text: "h", headers: { "List-Unsubscribe": "<https://example.test/u?t=1>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
    const h = await mailHeaders(to, since);
    expect(h["List-Unsubscribe-Post"]).toEqual(["List-Unsubscribe=One-Click"]);
    expect(h["List-Unsubscribe"]).toEqual(["<https://example.test/u?t=1>"]);
  });
});
