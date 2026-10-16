import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { t } from "./i18n";
import { readFileSync } from "node:fs";

describe("minimum age 18 (Plan 10, decision #58)", () => {
  it("sign-up asks for 18 or older", () => {
    assert.equal(t("auth.ageConfirmation"), "I confirm that I am 18 years old or older.");
    assert.equal(t("auth.ageRequired"), "Confirm that you are at least 18 years old to create an account.");
    assert.match(t("onboarding.account.emailPasswordNote"), /18\+ age confirmation/);
  });
});

describe("privacy wording names the providers (Plan 10, spec 7)", () => {
  it("the voice paragraph names Deepgram and Microsoft Azure, says recordings are not kept or trained on", () => {
    const body = t("legal.privacyVoiceBody");
    assert.match(body, /Deepgram/);
    assert.match(body, /does not keep it or use it to train/);
    assert.match(body, /Microsoft Azure in Canada/);
    assert.match(body, /Parle does not store or log your recordings/);
  });
  it("a new paragraph covers the AI tutor and scores through OpenRouter", () => {
    assert.equal(t("legal.privacyAiTitle"), "The AI tutor and scores");
    assert.match(t("legal.privacyAiBody"), /OpenRouter/);
    assert.match(t("legal.privacyAiBody"), /train/);
  });
  it("no English wording names NVIDIA any more, and the new wording has no em dash", () => {
    assert.equal(readFileSync(new URL("./i18n.ts", import.meta.url), "utf8").includes("NVIDIA"), false);
    for (const key of ["legal.privacyVoiceBody", "legal.privacyAiTitle", "legal.privacyAiBody", "auth.ageConfirmation"] as const) assert.equal(t(key).includes("\u2014"), false, key);
  });
});
