import { readFileSync } from "node:fs";
import { PROD_REF, api } from "./management";
import { readSecret } from "../lib/secrets";

const TEMPLATES = `${import.meta.dir}/../../supabase/templates`;

/** Production sign-in settings (spec section 5): Resend SMTP, Parle templates, reset redirects, email rate limit. */
export function authConfig(appUrl: string, smtpPass: string): Record<string, unknown> {
  const redirects = [...new Set([`${appUrl}/reset-password`, "https://parle.buzz/reset-password"])];
  return {
    site_url: appUrl,
    uri_allow_list: redirects.join(","),
    mailer_autoconfirm: false,
    // the app asks for a 6-digit code (as local config.toml); new hosted projects default to 8
    mailer_otp_length: 6,
    // emailed links and codes last 24 hours (migrated people get one set-password link each)
    mailer_otp_exp: 86400,
    smtp_host: "smtp.resend.com",
    smtp_port: "465",
    smtp_user: "resend",
    smtp_pass: smtpPass,
    smtp_admin_email: "no-reply@parle.buzz",
    smtp_sender_name: "Parle",
    mailer_subjects_confirmation: "Your Parle verification code",
    mailer_templates_confirmation_content: readFileSync(`${TEMPLATES}/confirmation.html`, "utf8"),
    mailer_subjects_recovery: "Reset your Parle password",
    mailer_templates_recovery_content: readFileSync(`${TEMPLATES}/recovery.html`, "utf8"),
    rate_limit_email_sent: 30,
    external_google_enabled: false,
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const path = `/v1/projects/${PROD_REF}/config/auth`;
  if (args.includes("--names")) {
    const current = await api(path);
    const wanted = Object.keys(authConfig("https://parle.buzz", "x"));
    console.log(`fields: ${Object.keys(current).length}; missing of ours: ${wanted.filter((k) => !(k in current)).join(", ") || "none"}`);
  }
  const app = args.find((a) => a.startsWith("--app="))?.slice(6);
  if (args.includes("--apply")) {
    await api(path, { method: "PATCH", body: JSON.stringify(authConfig(app ?? "https://parle.buzz", readSecret("RESEND_API_KEY"))) });
    console.log(`auth config applied for ${app ?? "https://parle.buzz"}`);
  }
}
