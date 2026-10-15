import { readdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { PROD_REF, runSql, serviceKey, pendingMigrations, migrationSql } from "./management";
import { readEnvFile } from "./env";

const MIGRATIONS = `${import.meta.dir}/../../supabase/migrations`;

/** Applies pending migration files to production in order; stops at the first error. */
async function migrations(dryRun: boolean) {
  const applied = ((await runSql(PROD_REF, "select version from supabase_migrations.schema_migrations")) as Array<{ version: string }>).map((r) => r.version);
  const pending = pendingMigrations(readdirSync(MIGRATIONS), applied);
  console.log(`already applied: ${applied.length}; pending: ${pending.length}`);
  for (const m of pending) {
    if (dryRun) { console.log(`would apply ${m.file}`); continue; }
    try {
      await runSql(PROD_REF, migrationSql(m, readFileSync(`${MIGRATIONS}/${m.file}`, "utf8")));
      console.log(`applied ${m.file}`);
    } catch (e) {
      console.log(`FAILED ${m.file}: ${(e as Error).message}`);
      process.exit(1);
    }
  }
}

/** Stores the functions address and cron secret where the scheduled jobs read them. */
async function jobConfig() {
  const env = readEnvFile(`${import.meta.dir}/../../supabase/functions/.env.production`);
  const db = createClient(`https://${PROD_REF}.supabase.co`, await serviceKey(PROD_REF), { auth: { persistSession: false } });
  const { error } = await db.rpc("set_job_config", { p_functions_url: `https://${PROD_REF}.supabase.co/functions/v1`, p_cron_secret: env.CRON_SECRET });
  if (error) throw new Error(`set_job_config: ${error.message}`);
  console.log("job config stored");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.includes("--migrations")) await migrations(args.includes("--dry-run"));
  if (args.includes("--job-config")) await jobConfig();
}
