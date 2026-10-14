import type { TranslationKey } from "@/lib/i18n";

export type PublicInfoPageId =
  | "howItWorks"
  | "levelEstimates"
  | "tutorVetting"
  | "aiTutor"
  | "plans"
  | "faq";

export type PublicInfoLayout = "steps" | "cards" | "features" | "plans" | "faq";

export interface PublicInfoSection {
  titleKey: TranslationKey;
  bodyKey?: TranslationKey;
  itemKeys?: readonly TranslationKey[];
  priceKey?: TranslationKey;
  badgeKey?: TranslationKey;
  markerKey?: TranslationKey;
}

export interface PublicInfoNote {
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}

export interface PublicInfoFaqItem {
  questionKey: TranslationKey;
  answerKey: TranslationKey;
}

export interface PublicInfoPageDescriptor {
  path: string;
  layout: PublicInfoLayout;
  eyebrowKey: TranslationKey;
  titleKey: TranslationKey;
  introKey: TranslationKey;
  sections?: readonly PublicInfoSection[];
  notes?: readonly PublicInfoNote[];
  faqItems?: readonly PublicInfoFaqItem[];
}

export const publicInfoPages = {
  howItWorks: {
    path: "/how-it-works",
    layout: "steps",
    eyebrowKey: "publicInfo.howWorks.eyebrow",
    titleKey: "publicInfo.howWorks.title",
    introKey: "publicInfo.howWorks.intro",
    sections: [
      {
        markerKey: "publicInfo.stepNumber.one",
        titleKey: "publicInfo.howWorks.placementTitle",
        bodyKey: "publicInfo.howWorks.placementBody",
      },
      {
        markerKey: "publicInfo.stepNumber.two",
        titleKey: "publicInfo.howWorks.weeklyTitle",
        bodyKey: "publicInfo.howWorks.weeklyBody",
      },
      {
        markerKey: "publicInfo.stepNumber.three",
        titleKey: "publicInfo.howWorks.aiTitle",
        bodyKey: "publicInfo.howWorks.aiBody",
      },
      {
        markerKey: "publicInfo.stepNumber.four",
        titleKey: "publicInfo.howWorks.tutorTitle",
        bodyKey: "publicInfo.howWorks.tutorBody",
      },
    ],
    notes: [
      {
        titleKey: "publicInfo.howWorks.bookingNoteTitle",
        bodyKey: "publicInfo.howWorks.bookingNote",
      },
    ],
  },
  levelEstimates: {
    path: "/level-estimates",
    layout: "cards",
    eyebrowKey: "publicInfo.levelEstimates.eyebrow",
    titleKey: "publicInfo.levelEstimates.title",
    introKey: "publicInfo.levelEstimates.intro",
    sections: [
      {
        titleKey: "publicInfo.levelEstimates.scaleTitle",
        bodyKey: "publicInfo.levelEstimates.scaleBody",
        badgeKey: "publicInfo.levelEstimates.estimateLabel",
      },
      {
        titleKey: "publicInfo.levelEstimates.officialTitle",
        bodyKey: "publicInfo.levelEstimates.officialBody",
      },
      {
        titleKey: "publicInfo.levelEstimates.speakingTitle",
        bodyKey: "publicInfo.levelEstimates.speakingBody",
      },
    ],
    notes: [
      {
        titleKey: "publicInfo.levelEstimates.nclcNoteTitle",
        bodyKey: "publicInfo.levelEstimates.nclcNote",
      },
    ],
  },
  tutorVetting: {
    path: "/tutor-vetting",
    layout: "steps",
    eyebrowKey: "publicInfo.tutorVetting.eyebrow",
    titleKey: "publicInfo.tutorVetting.title",
    introKey: "publicInfo.tutorVetting.intro",
    sections: [
      {
        markerKey: "publicInfo.stepNumber.one",
        titleKey: "publicInfo.tutorVetting.profileTitle",
        bodyKey: "publicInfo.tutorVetting.profileBody",
      },
      {
        markerKey: "publicInfo.stepNumber.two",
        titleKey: "publicInfo.tutorVetting.credentialsTitle",
        bodyKey: "publicInfo.tutorVetting.credentialsBody",
      },
      {
        markerKey: "publicInfo.stepNumber.three",
        titleKey: "publicInfo.tutorVetting.approvalTitle",
        bodyKey: "publicInfo.tutorVetting.approvalBody",
      },
      {
        markerKey: "publicInfo.stepNumber.four",
        titleKey: "publicInfo.tutorVetting.reviewsTitle",
        bodyKey: "publicInfo.tutorVetting.reviewsBody",
      },
    ],
    notes: [
      {
        titleKey: "publicInfo.tutorVetting.demoNoteTitle",
        bodyKey: "publicInfo.tutorVetting.demoNote",
      },
    ],
  },
  aiTutor: {
    path: "/ai-tutor",
    layout: "features",
    eyebrowKey: "publicInfo.aiTutor.eyebrow",
    titleKey: "publicInfo.aiTutor.title",
    introKey: "publicInfo.aiTutor.intro",
    sections: [
      {
        titleKey: "publicInfo.aiTutor.capabilitiesTitle",
        bodyKey: "publicInfo.aiTutor.capabilitiesBody",
        itemKeys: [
          "publicInfo.aiTutor.explain",
          "publicInfo.aiTutor.correct",
          "publicInfo.aiTutor.practice",
          "publicInfo.aiTutor.weeklyFocus",
        ],
      },
      {
        titleKey: "publicInfo.aiTutor.limitsTitle",
        bodyKey: "publicInfo.aiTutor.limitsBody",
        itemKeys: [
          "publicInfo.aiTutor.mistakes",
          "publicInfo.aiTutor.notExam",
          "publicInfo.aiTutor.notReplacement",
          "publicInfo.aiTutor.allowance",
        ],
      },
    ],
  },
  plans: {
    path: "/plans",
    layout: "plans",
    eyebrowKey: "publicInfo.plans.eyebrow",
    titleKey: "publicInfo.plans.title",
    introKey: "publicInfo.plans.intro",
    sections: [
      {
        titleKey: "publicInfo.plans.freeTitle",
        itemKeys: [
          "publicInfo.plans.freeFeaturePlacement",
          "publicInfo.plans.freeFeaturePlan",
          "publicInfo.plans.freeFeatureAi",
        ],
      },
      {
        titleKey: "publicInfo.plans.premiumTitle",
        priceKey: "publicInfo.plans.premiumPrice",
        itemKeys: [
          "publicInfo.plans.premiumFeatureCore",
          "publicInfo.plans.premiumFeatureAi",
        ],
      },
    ],
    notes: [
      {
        titleKey: "publicInfo.plans.tutorPricingTitle",
        bodyKey: "publicInfo.plans.tutorPricingNote",
      },
    ],
  },
  faq: {
    path: "/faq",
    layout: "faq",
    eyebrowKey: "publicInfo.faq.eyebrow",
    titleKey: "publicInfo.faq.title",
    introKey: "publicInfo.faq.intro",
    faqItems: [
      { questionKey: "publicInfo.faq.oneQuestion", answerKey: "publicInfo.faq.oneAnswer" },
      { questionKey: "publicInfo.faq.twoQuestion", answerKey: "publicInfo.faq.twoAnswer" },
      { questionKey: "publicInfo.faq.threeQuestion", answerKey: "publicInfo.faq.threeAnswer" },
      { questionKey: "publicInfo.faq.fourQuestion", answerKey: "publicInfo.faq.fourAnswer" },
      { questionKey: "publicInfo.faq.fiveQuestion", answerKey: "publicInfo.faq.fiveAnswer" },
      { questionKey: "publicInfo.faq.sixQuestion", answerKey: "publicInfo.faq.sixAnswer" },
      { questionKey: "publicInfo.faq.sevenQuestion", answerKey: "publicInfo.faq.sevenAnswer" },
      { questionKey: "publicInfo.faq.eightQuestion", answerKey: "publicInfo.faq.eightAnswer" },
    ],
  },
} as const satisfies Record<PublicInfoPageId, PublicInfoPageDescriptor>;

export const publicInfoRouteAliases = {
  "/plan": "/plans",
} as const;

export const publicInfoFaqItems = publicInfoPages.faq.faqItems;
