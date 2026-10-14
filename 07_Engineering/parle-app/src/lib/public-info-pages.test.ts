import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  publicInfoFaqItems,
  publicInfoPages,
  publicInfoRouteAliases,
} from "./public-info-content";
import { hasTranslationKey, t, type TranslationKey } from "./i18n";

function translationReferences(value: unknown, field = ""): TranslationKey[] {
  if (typeof value === "string") {
    if (field === "path" || field === "layout") return [];
    return [value as TranslationKey];
  }
  if (Array.isArray(value)) return value.flatMap((entry) => translationReferences(entry));
  if (!value || typeof value !== "object") return [];

  return Object.entries(value).flatMap(([key, nested]) => translationReferences(nested, key));
}

function assertOnlyTranslationReferences(value: unknown, field = ""): void {
  if (typeof value === "string") {
    if (field === "path" || field === "layout") return;
    assert.equal(hasTranslationKey(value), true, `Expected a translation key in ${field}, got ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => assertOnlyTranslationReferences(entry));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value)) {
    assertOnlyTranslationReferences(nested, key);
  }
}

function translatedPageCopy(pages: unknown): string {
  return translationReferences(pages).map((key) => t(key)).join("\n");
}

describe("static public information pages", () => {
  it("defines six distinct public destinations and keeps the old plans address as an alias", () => {
    const expectedPaths = [
      "/how-it-works",
      "/level-estimates",
      "/tutor-vetting",
      "/ai-tutor",
      "/plans",
      "/faq",
    ];
    const paths = Object.values(publicInfoPages).map((page) => page.path);

    assert.equal(Object.keys(publicInfoPages).length, 6);
    assert.equal(new Set(paths).size, 6);
    assert.deepEqual([...paths].sort(), [...expectedPaths].sort());
    assert.equal(publicInfoRouteAliases["/plan"], "/plans");
    assert.equal(publicInfoPages.plans.path, publicInfoRouteAliases["/plan"]);
  });

  it("keeps page content in translation keys rather than raw strings", () => {
    assertOnlyTranslationReferences(publicInfoPages);
    for (const key of translationReferences(publicInfoPages)) {
      assert.equal(hasTranslationKey(key), true, `Missing translation value for ${key}`);
    }
  });

  it("includes exactly eight FAQ disclosures with valid question and answer keys", () => {
    assert.equal(publicInfoFaqItems?.length, 8);
    for (const item of publicInfoFaqItems ?? []) {
      assert.equal(hasTranslationKey(item.questionKey), true, `Missing FAQ question: ${item.questionKey}`);
      assert.equal(hasTranslationKey(item.answerKey), true, `Missing FAQ answer: ${item.answerKey}`);
      assert.doesNotMatch(t(item.answerKey), /[\r\n]/);
    }
  });

  it("states the required estimates, tutor, AI, plan, cancellation, and privacy boundaries", () => {
    const copy = translatedPageCopy(publicInfoPages);
    const requiredPhrases = [
      "Your weekly plan adapts after each check-in.",
      "Coming soon in this demo.",
      "0–5 scale mapped to CEFR",
      "approximate NCLC reference",
      "Estimate - not an official score",
      "Only TEF Canada, TCF Canada, and other approved tests give official results.",
      "Speaking is not scored automatically yet.",
      "French introduction video",
      "credentials are reviewed",
      "manual approval",
      "learners can review tutors after lessons",
      "Demo and sample reviews are not proof of completed real lessons.",
      "explains French in your language",
      "correct your writing",
      "practises with you",
      "follows your weekly focus",
      "can make mistakes",
      "not an exam scorer",
      "does not replace a human tutor",
      "daily message allowance depends on the plan",
      "higher daily AI allowance under fair use",
      "$14.99 a month or $119 a year USD",
      "no learner booking fee",
      "Premium continues to the paid-through date",
      "Account and learning data are used to provide Parle",
      "highly sensitive immigration documents in AI chat",
    ];
    for (const phrase of requiredPhrases) {
      assert.ok(copy.toLowerCase().includes(phrase.toLowerCase()), `Missing required wording: ${phrase}`);
    }
    assert.doesNotMatch(copy, /\b\d+\s+(?:messages?|AI messages?)\b/i);
  });

  it("keeps homepage plan and tutor-booking claims current", () => {
    const homepageKeys: TranslationKey[] = [
      "landing.pathBody",
      "landing.howBody",
      "landing.stepThreeTitle",
      "landing.stepThreeBody",
      "landing.stepFourTitle",
      "landing.stepFourBody",
      "landing.pricingBody",
      "landing.freeFeaturePlacement",
      "landing.freeFeaturePlan",
      "landing.freeFeatureTutor",
      "landing.premiumFeatureCore",
      "landing.premiumFeatureTutor",
      "landing.premiumMonthlyPrice",
      "landing.premiumAnnualPrice",
      "landing.pricingNote",
      "landing.faqOneAnswer",
      "landing.faqTwoAnswer",
      "landing.faqFiveAnswer",
    ];
    const copy = homepageKeys.map((key) => t(key)).join("\n");
    const requiredPhrases = [
      "placement assessment",
      "weekly plan and check-ins",
      "AI tutor practice with a daily allowance by plan",
      "A higher daily AI tutor allowance under fair use",
      "$14.99 / month",
      "$119 / year USD",
      "Tutors set their own lesson prices",
      "Booking is coming soon in this demo.",
    ];

    for (const phrase of requiredPhrases) {
      assert.ok(copy.toLowerCase().includes(phrase.toLowerCase()), `Missing homepage wording: ${phrase}`);
    }

    const bookingNoticeKeys: TranslationKey[] = [
      "landing.pathBody",
      "landing.howBody",
      "landing.stepFourBody",
      "landing.pricingNote",
      "landing.faqFiveAnswer",
    ];
    for (const key of bookingNoticeKeys) {
      assert.match(t(key), /booking is coming soon in this demo/i, `Missing booking status in ${key}`);
    }

    assert.doesNotMatch(copy, /\bunlimited AI tutor\b/i);
    assert.doesNotMatch(copy, /\bfull adaptive roadmap\b/i);
    assert.doesNotMatch(copy, /\b10 messages a day\b/i);
    assert.doesNotMatch(copy, /\blive voice practice\b/i);
    assert.doesNotMatch(copy, /\b\d+\s+(?:messages?|AI messages?)\b/i);
  });
});
