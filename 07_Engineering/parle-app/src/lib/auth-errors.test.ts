import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authErrorKey } from "./auth-pages";
import { t } from "./i18n";

describe("sign-in errors (Plan 8 spec 3.2)", () => {
  it("a paused account sees the paused message, not 'wrong password'", () => {
    assert.equal(authErrorKey(new Error("User is banned")), "auth.error.accountPaused");
    assert.equal(t("auth.error.accountPaused"), "Your account is paused. Contact hello@parle.buzz.");
    assert.equal(authErrorKey(new Error("Invalid login credentials")), "auth.error.invalidCredentials");
  });
});
