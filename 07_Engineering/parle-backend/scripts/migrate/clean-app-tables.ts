import { createClient } from "@supabase/supabase-js";
import { ENTITIES } from "./export-accounts";

/** The 36 Buildy entity tables plus the three backend tables; never the waitlist. */
export const APP_TABLES = [...ENTITIES, "placement_run", "rate_limit_hit", "ai_test_queue"];
/** Settings written by migrations, not by Buildy: they stay (spec section 10 cleans Buildy data only). */
export const MIGRATION_SETTINGS = ["ai_global_daily_cap", "ai_model_fast", "ai_model_standard"];

/**
 * Cut-over clean (Plan 4 Task 12, Review Focus 3): empties the app tables and removes every login except the
 * admin's. Refuses to go on if the waitlist count moves. Tables have no foreign keys to each other, so any order works.
 */
export async function cleanAppTables(target: { url: string; serviceKey: string }, adminEmail: string | string[], opts: { afterTables?: () => Promise<void> } = {}) {
  const keep = new Set((Array.isArray(adminEmail) ? adminEmail : [adminEmail]).map((e) => e.trim().toLowerCase()));
  if (APP_TABLES.includes("waitlist_signup")) throw new Error("waitlist_signup must never be cleaned");
  const db = createClient(target.url, target.serviceKey, { auth: { persistSession: false } });
  const waitlist = async () => {
    const { count, error } = await db.from("waitlist_signup").select("*", { count: "exact", head: true });
    if (error) throw new Error(`waitlist count: ${error.message}`);
    return count ?? 0;
  };
  const waitlistBefore = await waitlist();
  const emptied: string[] = [];
  for (const table of APP_TABLES) {
    const q = db.from(table).delete();
    const { error } = table === "rate_limit_hit" ? await q.not("key", "is", null)
      : table === "app_setting" ? await q.not("key", "in", `(${MIGRATION_SETTINGS.join(",")})`)
      : await q.not("id", "is", null);
    if (error) throw new Error(`${table}: ${error.message}`);
    emptied.push(table);
  }
  await opts.afterTables?.();
  // A visitor may join the waitlist while the clean runs (R33): only a smaller count means rows were removed.
  if ((await waitlist()) < waitlistBefore) throw new Error("waitlist shrank during the clean; stopping before logins are removed");
  let usersDeleted = 0;
  for (;;) {
    const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;
    const gone = data.users.filter((u) => !keep.has((u.email ?? "").toLowerCase()));
    if (!gone.length) break;
    for (const u of gone) {
      const { error: e } = await db.auth.admin.deleteUser(u.id);
      if (e) throw new Error(`delete login: ${e.message}`);
      usersDeleted++;
    }
  }
  const waitlistAfter = await waitlist();
  if (waitlistAfter < waitlistBefore) throw new Error(`waitlist shrank: ${waitlistBefore} -> ${waitlistAfter}`);
  return { waitlistBefore, waitlistAfter, emptied, usersDeleted };
}

if (import.meta.main) {
  // usage (cut-over only, after the founder's go): bun clean-app-tables.ts <admin emails, comma separated> prod --founder-go
  const [adminEmail, where, go] = process.argv.slice(2);
  if (!adminEmail || where !== "prod" || go !== "--founder-go") throw new Error("usage: bun clean-app-tables.ts <admin email> prod --founder-go");
  const { PROD_REF, serviceKey } = await import("../prod/management");
  const r = await cleanAppTables({ url: `https://${PROD_REF}.supabase.co`, serviceKey: await serviceKey(PROD_REF) }, adminEmail.split(","));
  console.log(`emptied ${r.emptied.length} tables; logins removed ${r.usersDeleted}; waitlist ${r.waitlistBefore} -> ${r.waitlistAfter}`);
}
