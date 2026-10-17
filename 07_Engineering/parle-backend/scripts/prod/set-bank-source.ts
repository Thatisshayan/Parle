import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { PROD_URL, anonKey } from "./check-learners";
import { SECRETS_DIR } from "../lib/secrets";

/**
 * Plan 13: reads the question bank switch, or sets it, through the administrator action Admin > Content uses
 * (admin_set_bank_source: refused while the chosen bank is incomplete; audited), signed in as the test administrator.
 *   bun scripts/prod/set-bank-source.ts --check
 *   bun scripts/prod/set-bank-source.ts <demo|real> --founder-go
 */
const APP = "https://parle-preview-shayans-projects-d00acc44.vercel.app";
const ADMIN = "obsidianteamhq+admin@agentmail.to";
const target = process.argv[2];
if (target !== "--check" && target !== "demo" && target !== "real") throw new Error("usage: bun scripts/prod/set-bank-source.ts <--check|demo|real> [--founder-go]");
if (target !== "--check" && !process.argv.includes("--founder-go")) throw new Error("switching the production bank needs the founder's explicit go: add --founder-go only after it is given");
const passwords = JSON.parse(readFileSync(`${SECRETS_DIR}/preview-test-accounts.json`, "utf8")) as Record<string, string>;
const c = createClient(PROD_URL, await anonKey(), { auth: { persistSession: false } });
const { data, error } = await c.auth.signInWithPassword({ email: ADMIN, password: passwords[ADMIN] });
if (error || !data.session) throw new Error("administrator sign-in failed");
const call = async (body: Record<string, unknown>) => {
  const r = await fetch(`${PROD_URL}/functions/v1/parle-admin-service`, { method: "POST", headers: { Authorization: `Bearer ${data.session!.access_token}`, apikey: await anonKey(), "Content-Type": "application/json", Origin: APP }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
};
const status = await call({ action: "admin_bank_status" });
console.log(`now: ${status.body.source}; real bank ready ${status.body.real?.ready}; demo ready ${status.body.demo?.ready}`);
if (target !== "--check") {
  const r = await call({ action: "admin_set_bank_source", source: target });
  console.log(`set ${target}: ${r.status} ${r.body.error_code ?? ""} -> ${r.body.source ?? ""}`);
}
