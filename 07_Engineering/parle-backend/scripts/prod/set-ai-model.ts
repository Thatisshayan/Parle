import { createClient } from "@supabase/supabase-js";
import { PROD_REF, serviceKey } from "./management";
import { modelSettingValue } from "./ai-model";

/**
 * Plan 10's model switch on PRODUCTION, run by the founder as a `!` command:
 *   bun scripts/prod/set-ai-model.ts openrouter:<author>/<model>   sets ai_model_standard and ai_model_fast
 *   bun scripts/prod/set-ai-model.ts --check                       prints both (read only)
 * Prints model ids only, never keys.
 */
const db = createClient(`https://${PROD_REF}.supabase.co`, await serviceKey(PROD_REF), { auth: { persistSession: false } });
const arg = process.argv[2];
if (arg && arg !== "--check") {
  const value = modelSettingValue(arg);
  for (const key of ["ai_model_standard", "ai_model_fast"]) {
    const { error } = await db.from("app_setting").update({ value, updated_by: "plan10-switch" }).eq("key", key);
    if (error) { console.log(`${key}: failed (${error.code})`); process.exit(1); }
  }
}
const { data } = await db.from("app_setting").select("key, value").in("key", ["ai_model_standard", "ai_model_fast"]).order("key");
for (const row of data ?? []) console.log(`${row.key}: ${row.value}`);
