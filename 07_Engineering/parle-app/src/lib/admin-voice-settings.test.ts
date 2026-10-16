import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SETTINGS, NUMERIC_SETTINGS, validateDraft } from "../pages/AdminControlPanel";
import { APP_SETTING_DEFAULTS, APP_SETTING_RULES } from "../../functions/parle-admin-settings.helper.ts";

const VOICE = ["free_voice_answers_per_day", "premium_voice_answers_per_day", "free_voice_messages_per_day", "premium_voice_messages_per_day", "free_voice_replies_per_day", "premium_voice_replies_per_day"] as const;

describe("Admin Settings: voice limits (spec 6)", () => {
  it("shows the six voice limits with the server's defaults and ranges", () => {
    for (const key of VOICE) {
      const field = NUMERIC_SETTINGS.find((f) => f.key === key);
      assert.ok(field, key);
      assert.deepEqual([field!.min, field!.max, DEFAULT_SETTINGS[key]], [APP_SETTING_RULES[key].min, APP_SETTING_RULES[key].max, APP_SETTING_DEFAULTS[key]]);
    }
  });
  it("refuses a Premium limit below the Free one", () => {
    assert.equal(validateDraft({ ...DEFAULT_SETTINGS, free_voice_replies_per_day: 30, premium_voice_replies_per_day: 10 }), "adminControl.error.premiumBelowFree");
    assert.equal(validateDraft({ ...DEFAULT_SETTINGS }), null);
  });
});
