import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
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

describe("photo saves (Plan 11: A42, A43, A44)", () => {
  it("Save waits while a photo uploads, and a failed clean-up is logged (A42, A44)", () => {
    const src = readFileSync(new URL("../pages/Settings.tsx", import.meta.url), "utf8");
    assert.match(src, /disabled=\{saving \|\| photoBusy\}/);
    assert.match(src, /if \(photoBusy\) return;/);
    assert.doesNotMatch(src, /cleanUnsavedPhotos\(\)\.catch\(\(\) => undefined\)/);
    assert.match(src, /Parle unsaved photo clean-up failed/);
  });
  it("a photo removed before the save has its own message (A43)", () => {
    assert.equal(settingsSaveErrorKey(refused("PHOTO_MISSING", "That photo is no longer uploaded. Choose your photo again.")), "settings.photoMissingError");
  });
});
