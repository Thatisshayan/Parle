import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deleteErrorKey, settingsSaveErrorKey } from "../pages/Settings.tsx";

const refused = (code: string, message: string) => Object.assign(new Error(`API request failed: ${code}`), { body: { error: code, error_code: code, message } });

describe("Settings refusal messages (A36, R44)", () => {
  it("names the field the server refused", () => {
    assert.equal(settingsSaveErrorKey(refused("INVALID_INPUT", "Choose a language from the available list.")), "settings.languageError");
    assert.equal(settingsSaveErrorKey(refused("INVALID_INPUT", "A valid time zone is required.")), "settings.timeZoneError");
    assert.equal(settingsSaveErrorKey(refused("PHOTO_INVALID", "Choose a photo uploaded from this page.")), "settings.photoTypeError");
    assert.equal(settingsSaveErrorKey(refused("PHOTO_CHECK_FAILED", "We could not check the photo just now. Try saving again.")), "settings.photoCheckError");
    assert.equal(settingsSaveErrorKey(new Error("Failed to fetch")), "settings.saveError");
  });
  it("explains a deletion refused because the subscription could not be read", () => {
    assert.equal(deleteErrorKey("SUBSCRIPTION_UNREADABLE"), "settings.delete.error.subscriptionUnreadable");
    assert.equal(deleteErrorKey("ACTIVE_SUBSCRIPTION"), "settings.delete.error.subscription");
    assert.equal(deleteErrorKey("PASSWORD_INCORRECT"), "settings.delete.error.password");
    assert.equal(deleteErrorKey("CONFIRMATION_REQUIRED"), "settings.delete.error.confirm");
    assert.equal(deleteErrorKey("REQUEST_FAILED"), "settings.delete.error.generic");
  });
});
