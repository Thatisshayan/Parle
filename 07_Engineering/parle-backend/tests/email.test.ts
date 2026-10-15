import { describe, it, expect, beforeEach } from "bun:test";
import { sendMail } from "../supabase/functions/_shared/email";
import { latestMail } from "./helpers/mailpit";

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
});
