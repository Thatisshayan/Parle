import { createClient } from "@supabase/supabase-js";
import { PROD_REF, serviceKey } from "./management";
import { OWNER_EMAIL, listAdmins, setOwnerFlag } from "./owner";

/**
 * Plan 8's one-time owner step on PRODUCTION, run by the founder as a `!` command (like every production migration):
 *   bun scripts/prod/set-owner.ts            marks obsidianmedia.yt@gmail.com as the owner
 *   bun scripts/prod/set-owner.ts --check    lists the administrators and the owner (read only)
 * Prints addresses and outcomes only, never keys or tokens.
 */
const db = createClient(`https://${PROD_REF}.supabase.co`, await serviceKey(PROD_REF), { auth: { persistSession: false } });
if (!process.argv.includes("--check")) {
  const result = await setOwnerFlag(db, OWNER_EMAIL);
  console.log(`${OWNER_EMAIL}: ${result}`);
  if (result === "not_found" || result === "not_admin") process.exit(1);
}
for (const line of await listAdmins(db)) console.log(`admin: ${line}`);
