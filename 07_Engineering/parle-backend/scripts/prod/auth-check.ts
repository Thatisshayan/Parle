import { createClient } from "@supabase/supabase-js";
import { PROD_REF, api } from "./management";
import { waitForMail } from "../buildy/agentmail";
import * as auth from "../../../parle-app/src/lib/backend/auth";

/**
 * Live sign-up check against production with a real mailbox (Plan 4 Task 8 Step 3): sign up, receive the code from
 * parle.buzz, verify, then delete the account through the app's own delete flow. Prints outcomes only.
 */
const url = `https://${PROD_REF}.supabase.co`;
const keys = (await api(`/v1/projects/${PROD_REF}/api-keys`)) as Array<{ name: string; api_key: string }>;
const anonKey = keys.find((k) => k.name === "anon")?.api_key;
if (!anonKey) throw new Error("anon key not returned");
const email = `obsidianteamhq+prodcheck${Date.now().toString(36)}@agentmail.to`;
const password = `Prod-check-${crypto.randomUUID().slice(0, 8)}1`;
const c = createClient(url, anonKey, { auth: { persistSession: false } });
const since = new Date(Date.now() - 5000).toISOString();
await auth.signUpWithCode(c, "Prod Check", email, password);
console.log(`signed up ${email}`);
const mail = await waitForMail(email, since);
if (!mail) throw new Error("no verification mail within 3 minutes");
console.log(`mail: "${mail.subject}" from ${mail.from.replace(/.*</, "").replace(/>.*/, "")}`);
const code = mail.text.match(/\b(\d{6,8})\b/)?.[1];
if (!code) throw new Error("no code in the mail");
await auth.verifySignupCode(c, email, code, password, "Prod Check");
const token = (await c.auth.getSession()).data.session!.access_token;
console.log("verified and signed in");
const r = await fetch(`${url}/functions/v1/parle-account-service`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, apikey: anonKey, "Content-Type": "application/json" },
  body: JSON.stringify({ action: "delete_account", password, confirm: "DELETE" }),
});
console.log(`delete_account: ${r.status}`);
const again = await c.auth.signInWithPassword({ email, password });
console.log(`sign-in after deletion: ${again.error ? "refused (account gone)" : "STILL WORKS"}`);
