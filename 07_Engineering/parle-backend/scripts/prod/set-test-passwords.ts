import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { PROD_REF, api, serviceKey } from "./management";
import { sendSetPasswordMail } from "../migrate/set-password-mail";
import { waitForMail } from "../buildy/agentmail";
import { tokenHashFrom } from "../../tests/helpers/mailpit";
import * as auth from "../../../parle-app/src/lib/backend/auth";
import { SECRETS_DIR } from "../lib/secrets";
import type { ExportBundle } from "../migrate/types";

/**
 * Plan 4 Task 11 Step 1: the review migration sets passwords for the AgentMail test accounts only, through the real
 * "Set your password" mail (Resend), received at AgentMail. Real people get no mail until the cut-over.
 * Passwords are written to the secrets folder, never printed.
 */
const [bundleFile, appUrl] = process.argv.slice(2);
if (!bundleFile || !appUrl) throw new Error("usage: bun set-test-passwords.ts <bundle.json> <app url>");
const bundle = JSON.parse(readFileSync(bundleFile, "utf8")) as ExportBundle;
const url = `https://${PROD_REF}.supabase.co`;
const target = { url, serviceKey: await serviceKey(PROD_REF) };
const anonKey = ((await api(`/v1/projects/${PROD_REF}/api-keys`)) as Array<{ name: string; api_key: string }>).find((k) => k.name === "anon")!.api_key;
const out: Record<string, string> = {};
for (const p of bundle.people.filter((x) => x.email.endsWith("@agentmail.to"))) {
  const since = new Date(Date.now() - 5000).toISOString();
  await sendSetPasswordMail(target, p.email, appUrl, "resend");
  const mail = await waitForMail(p.email, since);
  if (!mail) { console.log(`${p.email}: no mail within 3 minutes`); continue; }
  const password = `Review-${crypto.randomUUID().slice(0, 10)}1`;
  await auth.resetWithToken(createClient(url, anonKey, { auth: { persistSession: false } }), tokenHashFrom(mail.text), password);
  out[p.email] = password;
  console.log(`${p.email}: "${mail.subject}" from ${mail.from.replace(/.*</, "").replace(/>.*/, "")}; password set`);
}
writeFileSync(`${SECRETS_DIR}/preview-test-accounts.json`, JSON.stringify(out, null, 1));
console.log(`saved ${Object.keys(out).length} passwords to the secrets folder (preview-test-accounts.json)`);
