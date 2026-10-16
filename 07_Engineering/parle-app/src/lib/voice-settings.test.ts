import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { APP_SETTING_DEFAULTS, FREE_PREMIUM_PAIRS, validateAdminSettings } from "../../functions/parle-admin-settings.helper.ts";

const VOICE_PAIRS = [
  ["free_voice_answers_per_day", "premium_voice_answers_per_day"],
  ["free_voice_messages_per_day", "premium_voice_messages_per_day"],
  ["free_voice_replies_per_day", "premium_voice_replies_per_day"],
] as const;

describe("voice settings (Plan 9 spec 6)", () => {
  it("default to the spec's Free and Premium limits", () => {
    assert.deepEqual(VOICE_PAIRS.map(([f, p]) => [APP_SETTING_DEFAULTS[f], APP_SETTING_DEFAULTS[p]]), [[2, 15], [5, 60], [20, 200]]);
  });
  it("refuse a Premium limit below the Free one, for every pair", () => {
    for (const [free, premium] of VOICE_PAIRS) {
      assert.ok(FREE_PREMIUM_PAIRS.some(([f, p]) => f === free && p === premium));
      assert.equal(validateAdminSettings({ ...APP_SETTING_DEFAULTS, [free]: 10, [premium]: 5 }).valid, false);
      assert.equal(validateAdminSettings({ ...APP_SETTING_DEFAULTS, [free]: 0, [premium]: 5 }).valid, true);
      assert.equal(validateAdminSettings({ ...APP_SETTING_DEFAULTS, [premium]: 0 }).valid, false);
    }
  });
});
