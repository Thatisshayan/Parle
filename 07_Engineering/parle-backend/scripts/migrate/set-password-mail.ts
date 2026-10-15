import { createClient } from "@supabase/supabase-js";
import { readSecret } from "../lib/secrets";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * "Set your password for Parle" (spec section 5): migrated people have no password. The link is a one-time recovery
 * token for the existing reset page, so it works once and only for that person.
 */
export async function sendSetPasswordMail(target: { url: string; serviceKey: string }, email: string, appUrl: string, transport: "resend" | "mailpit") {
  const db = createClient(target.url, target.serviceKey, { auth: { persistSession: false } });
  const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email });
  if (error) throw new Error(`set-password link for ${email}: ${error.message}`);
  const link = `${appUrl}/reset-password?token=${encodeURIComponent(data.properties.hashed_token)}`;
  const subject = "Set your password for Parle";
  const html = `<h1>Parle has moved to its new home</h1><p>Your Parle account and your progress are ready. Choose a password to sign in again.</p><p><a href="${esc(link)}">Set your password</a></p><p>This link works once. If it has expired, use "Forgot password" on the sign-in page.</p>`;
  if (transport === "mailpit") {
    const r = await fetch("http://127.0.0.1:54324/api/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ From: { Email: "hello@parle.buzz", Name: "Parle" }, To: [{ Email: email }], Subject: subject, HTML: html }),
    });
    if (!r.ok) throw new Error(`mailpit send failed ${r.status}`);
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${readSecret("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Parle <hello@parle.buzz>", to: [email], subject, html }),
  });
  if (!r.ok) throw new Error(`resend failed ${r.status} for ${email}`);
}
