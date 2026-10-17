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
      "/help/cancellations-refunds",
    ];
    const paths = Object.values(publicInfoPages).map((page) => page.path);

    assert.equal(Object.keys(publicInfoPages).length, 7);
    assert.equal(new Set(paths).size, 7);
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
      "Your time is held while you pay.", // A50: booking is open (Plan 7A)
      "0–5 scale mapped to CEFR",
      "approximate NCLC reference",
      "Estimate - not an official score",
      "Only TEF Canada, TCF Canada, and other approved tests give official results.",
      "Speaking is scored from a recorded answer: a transcript, four criteria and a practice estimate.",
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
      "full refund",
      "less than 24 hours",
      "move a lesson once",
      "deleting your account cancels every upcoming lesson",
      "summary",
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
      "pay when you book", // A50
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
    // A50 (R58): booking is open; no page says it is coming soon
    for (const key of [...bookingNoticeKeys, "publicInfo.faq.oneAnswer", "publicInfo.faq.fiveAnswer", "publicInfo.plans.tutorPricingNote", "publicInfo.tutorVetting.demoNote", "publicInfo.howWorks.bookingNote"] as TranslationKey[]) {
      assert.doesNotMatch(t(key), /coming soon/i, `Still says coming soon: ${key}`);
    }

    assert.doesNotMatch(copy, /\bunlimited AI tutor\b/i);
    assert.doesNotMatch(copy, /\bfull adaptive roadmap\b/i);
    assert.doesNotMatch(copy, /\b10 messages a day\b/i);
    assert.doesNotMatch(copy, /\blive voice practice\b/i);
    assert.doesNotMatch(copy, /\b\d+\s+(?:messages?|AI messages?)\b/i);
  });
});
