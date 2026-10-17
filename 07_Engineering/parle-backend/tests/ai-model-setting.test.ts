import { describe, it, expect } from "bun:test";
import { modelSettingValue, privacyWarning, writeModelSetting } from "../scripts/prod/ai-model";
import { service } from "./helpers/voice";

describe("the production model switch (Plan 10)", () => {
  it("accepts an OpenRouter model id and stores it as a JSON string", () => {
    expect(modelSettingValue("openrouter:openai/gpt-6-luna")).toBe('"openrouter:openai/gpt-6-luna"');
    expect(modelSettingValue("openrouter:anthropic/claude-haiku-5.5")).toBe('"openrouter:anthropic/claude-haiku-5.5"');
  });
  it("refuses anything else, including a bare NVIDIA id", () => {
    for (const bad of ["nvidia/nemotron-3-super-120b-a12b", "openrouter:", "openrouter:gpt", "openrouter:a/b c", "openrouter:a/b'; drop table x;--"]) expect(() => modelSettingValue(bad)).toThrow();
  });
});

describe("the model switch's checks (Plan 11: A106, A107)", () => {
  it("an update matching no row is an error (R114)", async () => {
    await expect(writeModelSetting(service() as any, "openrouter:openai/gpt-6-luna", ["ai_model_missing_test"])).rejects.toThrow(/no row/);
  });
  it("warns when the model is not OpenAI's (R115)", () => {
    expect(privacyWarning("openrouter:openai/gpt-6-luna")).toBeNull();
    expect(privacyWarning("openrouter:anthropic/claude-haiku-5.5")).toMatch(/privacy page names OpenAI/);
  });
});
