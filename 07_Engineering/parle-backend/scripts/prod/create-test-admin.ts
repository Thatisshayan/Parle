import { createClient } from "@supabase/supabase-js";
import { PROD_REF, api, serviceKey } from "./management";
import { sendSetPasswordMail } from "../migrate/set-password-mail";
import { waitForMail } from "../buildy/agentmail";
import { tokenHashFrom } from "../../tests/helpers/mailpit";
import * as auth from "../../../parle-app/src/lib/backend/auth";
import { SECRETS_DIR } from "../lib/secrets";
import { assertCheckAlias, savePassword } from "./test-admin";

/**
 * Decision #52: a production TEST ADMIN on an AgentMail alias, used only for checks on the private preview (B5).
 * Creates the login with role admin (app_metadata, written only with the service key) and sets its password through
 * the real "Set your password" mail received at AgentMail. The password goes to the secrets folder only. Prints no
 * password, link, code or key. `--remove` deletes the login (the founder can ask for this at any time).
 * usage: bun scripts/prod/create-test-admin.ts [email] [--remove]
 */
const args = process.argv.slice(2);
const email = (args.find((a) => !a.startsWith("--")) ?? "obsidianteamhq+admin@agentmail.to").toLowerCase();
assertCheckAlias(email);
const APP = "https://parle-preview-shayans-projects-d00acc44.vercel.app";
const url = `https://${PROD_REF}.supabase.co`;
const key = await serviceKey(PROD_REF);
const db = createClient(url, key, { auth: { persistSession: false } });

async function findUser(): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 1000) return null;
  }
}

let id = await findUser();
if (args.includes("--remove")) {
  if (!id) console.log(`${email}: no such login`);
  else {
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) throw new Error(error.message);
    console.log(`${email}: login deleted`);
  }
  process.exit(0);
}
if (id) {
  const { error } = await db.auth.admin.updateUserById(id, { app_metadata: { role: "admin" } });
  if (error) throw new Error(error.message);
  console.log(`${email}: login exists; role set to admin`);
} else {
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "admin" }, user_metadata: { full_name: "Parle Test Admin" } });
  if (error) throw new Error(error.message);
  id = data.user.id;
  console.log(`${email}: login created with role admin`);
}

const since = new Date(Date.now() - 5000).toISOString();
await sendSetPasswordMail({ url, serviceKey: key }, email, APP, "resend");
const mail = await waitForMail(email, since);
if (!mail) throw new Error(`${email}: no set-password mail within 3 minutes`);
const anonKey = ((await api(`/v1/projects/${PROD_REF}/api-keys`)) as Array<{ name: string; api_key: string }>).find((k) => k.name === "anon")!.api_key;
const password = `Admin-${crypto.randomUUID().slice(0, 12)}1`;
await auth.resetWithToken(createClient(url, anonKey, { auth: { persistSession: false } }), tokenHashFrom(mail.text), password);
savePassword(`${SECRETS_DIR}/preview-test-accounts.json`, email, password);
console.log(`${email}: "${mail.subject}" from ${mail.from.replace(/.*</, "").replace(/>.*/, "")}; password set and saved to the secrets folder`);

// the saved password signs in, and the server treats the account as an admin (a read-only admin action)
const c = createClient(url, anonKey, { auth: { persistSession: false } });
const user = await auth.signInWithPassword(c, email, password);
const token = (await c.auth.getSession()).data.session!.access_token;
const r = await fetch(`${url}/functions/v1/parle-marketplace-service`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, apikey: anonKey, "Content-Type": "application/json" },
  body: JSON.stringify({ action: "admin_content_coverage", view: "coverage" }),
});
console.log(`signed in as ${user.role}; admin_content_coverage: ${r.status}`);
await c.auth.signOut({ scope: "local" });
