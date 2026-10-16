/** The value written to app_setting ai_model_standard and ai_model_fast (JSON strings, as Buildy stored them). */
export function modelSettingValue(model: string): string {
  if (!/^openrouter:[a-z0-9-]+\/[a-z0-9.\-:]+$/.test(model)) throw new Error("expected openrouter:<author>/<model>");
  return JSON.stringify(model);
}
