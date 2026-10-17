import type { SupabaseClient } from "@supabase/supabase-js";

/** The app_setting keys the text AI reads its model from. */
export const MODEL_KEYS = ["ai_model_standard", "ai_model_fast"];

/** The value written to app_setting ai_model_standard and ai_model_fast (JSON strings, as Buildy stored them). */
export function modelSettingValue(model: string): string {
  if (!/^openrouter:[a-z0-9-]+\/[a-z0-9.\-:]+$/.test(model)) throw new Error("expected openrouter:<author>/<model>");
  return JSON.stringify(model);
}

/** Writes the model to each key; a key with no row is an error, not a silent no-op (Plan 11, A106, R114). */
export async function writeModelSetting(db: SupabaseClient, model: string, keys: string[] = MODEL_KEYS): Promise<void> {
  const value = modelSettingValue(model);
  for (const key of keys) {
    const { data, error } = await db.from("app_setting").update({ value, updated_by: "model-switch" }).eq("key", key).select("key");
    if (error) throw new Error(`${key}: failed (${error.code})`);
    if (!data?.length) throw new Error(`${key}: no row to update`);
  }
}

/** The privacy page names OpenAI as the model's maker; another maker needs that wording changed too (Plan 11, A107, R115). */
export function privacyWarning(model: string): string | null {
  const author = model.replace(/^openrouter:/, "").split("/")[0];
  if (author === "openai") return null;
  return `Warning: the privacy page names OpenAI (legal.privacyAiBody in parle-app/src/lib/i18n.ts). Update it for "${author}" before or with this switch.`;
}
