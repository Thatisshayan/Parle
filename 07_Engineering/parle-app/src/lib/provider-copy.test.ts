import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { t } from "./i18n";

describe("minimum age 18 (Plan 10, decision #58)", () => {
  it("sign-up asks for 18 or older", () => {
    assert.equal(t("auth.ageConfirmation"), "I confirm that I am 18 years old or older.");
    assert.equal(t("auth.ageRequired"), "Confirm that you are at least 18 years old to create an account.");
    assert.match(t("onboarding.account.emailPasswordNote"), /18\+ age confirmation/);
  });
});
