import { createClient } from "@supabase/supabase-js";
import { PROD_REF, serviceKey } from "./management";
import { MODEL_KEYS, privacyWarning, writeModelSetting } from "./ai-model";

/**
 * Plan 10's model switch on PRODUCTION, run by the founder as a `!` command:
 *   bun scripts/prod/set-ai-model.ts openrouter:<author>/<model>   sets ai_model_standard and ai_model_fast
 *   bun scripts/prod/set-ai-model.ts --check                       prints both (read only)
 * Prints model ids only, never keys. Plan 11: a key with no row stops it (A106); a maker other than OpenAI
 * prints a reminder to update the privacy page (A107).
 */
const db = createClient(`https://${PROD_REF}.supabase.co`, await serviceKey(PROD_REF), { auth: { persistSession: false } });
const arg = process.argv[2];
if (arg && arg !== "--check") {
  try {
    await writeModelSetting(db, arg);
  } catch (e) {
    console.log((e as Error).message);
    process.exit(1);
  }
  const warning = privacyWarning(arg);
  if (warning) console.log(warning);
}
const { data } = await db.from("app_setting").select("key, value").in("key", MODEL_KEYS).order("key");
for (const row of data ?? []) console.log(`${row.key}: ${row.value}`);
