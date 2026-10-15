import { createClient } from "@supabase/supabase-js";
import { PROD_REF, serviceKey } from "./management";

/**
 * Sets the AI model for one mode on production (app_setting, read on every AI call, so it applies at once).
 * Prints the value before and after; prints no key. Switch back by running it again with the old model.
 * usage: bun scripts/prod/set-ai-model.ts <standard|fast> <model id>
 *   e.g. bun scripts/prod/set-ai-model.ts standard openai/gpt-oss-20b
 */
const [mode, model] = process.argv.slice(2);
if (!["standard", "fast"].includes(mode ?? "") || !/^[a-z0-9-]+\/[a-z0-9.\-]+$/i.test(model ?? "")) {
  throw new Error("usage: bun scripts/prod/set-ai-model.ts <standard|fast> <model id>");
}
const key = `ai_model_${mode}`;
const db = createClient(`https://${PROD_REF}.supabase.co`, await serviceKey(PROD_REF), { auth: { persistSession: false } });
const before = await db.from("app_setting").select("value").eq("key", key).single();
if (before.error) throw new Error(before.error.message);
console.log(`${key} before: ${before.data.value}`);
const after = await db.from("app_setting").update({ value: JSON.stringify(model), updated_at: new Date().toISOString() }).eq("key", key).select("value").single();
if (after.error) throw new Error(after.error.message);
console.log(`${key} after: ${after.data.value}`);
