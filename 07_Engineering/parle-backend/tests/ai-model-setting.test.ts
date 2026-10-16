import { describe, it, expect } from "bun:test";
import { modelSettingValue } from "../scripts/prod/ai-model";

describe("the production model switch (Plan 10)", () => {
  it("accepts an OpenRouter model id and stores it as a JSON string", () => {
    expect(modelSettingValue("openrouter:openai/gpt-6-luna")).toBe('"openrouter:openai/gpt-6-luna"');
    expect(modelSettingValue("openrouter:anthropic/claude-haiku-5.5")).toBe('"openrouter:anthropic/claude-haiku-5.5"');
  });
  it("refuses anything else, including a bare NVIDIA id", () => {
    for (const bad of ["nvidia/nemotron-3-super-120b-a12b", "openrouter:", "openrouter:gpt", "openrouter:a/b c", "openrouter:a/b'; drop table x;--"]) expect(() => modelSettingValue(bad)).toThrow();
  });
});
