import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownRight, ArrowRight, BookOpenCheck, Check, Download, MapPin, MessageCircle, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { PublicHeader } from "@/components/parle/PublicHeader";
import { PublicFooter } from "@/components/parle/PublicFooter";
import { t, tInLocale } from "@/lib/i18n";
import { useInstallPrompt } from "@/lib/pwa";

const heroImage =
  "https://ellprnxjjzatijdxcogk.supabase.co/storage/v1/render/image/public/files/chat-generated-images/project-yuircx1jlz5bpg1jbv2th/8de9feb9-2252-4567-a2a5-3d219b73145e.webp?width=1200&resize=contain&quality=75";

const steps = [
  { number: "landing.stepOneNumber", title: "landing.stepOneTitle", body: "landing.stepOneBody", icon: Target },
  { number: "landing.stepTwoNumber", title: "landing.stepTwoTitle", body: "landing.stepTwoBody", icon: MessageCircle },
  { number: "landing.stepThreeNumber", title: "landing.stepThreeTitle", body: "landing.stepThreeBody", icon: ArrowRight },
  { number: "landing.stepFourNumber", title: "landing.stepFourTitle", body: "landing.stepFourBody", icon: MapPin },
] as const;

const goals = [
  { title: "landing.trackOneTitle", body: "landing.trackOneBody", icon: MapPin },
  { title: "landing.trackTwoTitle", body: "landing.trackTwoBody", icon: BookOpenCheck },
  { title: "landing.trackThreeTitle", body: "landing.trackThreeBody", icon: MessageCircle },
] as const;

const plans = [
  {
    title: "landing.freePlan",
    price: "landing.freePrice",
    priceNote: null,
    features: ["landing.freeFeaturePlacement", "landing.freeFeaturePlan", "landing.freeFeatureTutor"],
  },
  {
    title: "landing.premiumPlan",
    price: "landing.premiumMonthlyPrice",
    priceNote: "landing.premiumAnnualPrice",
    features: ["landing.premiumFeatureCore", "landing.premiumFeatureTutor"],
  },
] as const;

const questions = [
  ["landing.faqOneQuestion", "landing.faqOneAnswer"],
  ["landing.faqTwoQuestion", "landing.faqTwoAnswer"],
  ["landing.faqThreeQuestion", "landing.faqThreeAnswer"],
  ["landing.faqFourQuestion", "landing.faqFourAnswer"],
  ["landing.faqFiveQuestion", "landing.faqFiveAnswer"],
] as const;

type InstallHintPlatform = "ios" | "firefoxAndroid";

function detectInstallHintPlatform(): InstallHintPlatform | null {
  if (typeof navigator === "undefined") return null;

  const userAgent = navigator.userAgent;
  const isIOSDevice =
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOSDevice) return "ios";

  if (/Android/i.test(userAgent) && /Firefox/i.test(userAgent)) return "firefoxAndroid";
  return null;
}

function getInstallLocale(): "en" | "fr" {
  if (typeof navigator === "undefined") return "en";
  const preferredLanguage = navigator.languages?.[0] || navigator.language || "";
  return /^fr(?:-|$)/i.test(preferredLanguage) ? "fr" : "en";
}

const Index = () => {
  const reduceMotion = useReducedMotion();
  const { canInstall, isInstalled, install } = useInstallPrompt();
  const installLocale = getInstallLocale();
  const installHintPlatform = detectInstallHintPlatform();
  // Every section starts visible. Viewport animations are decorative, never required for copy to appear.
  const reveal = {
    initial: { opacity: 1, y: 0 },
    whileInView: { opacity: 1, y: 0 },
  };

  return (
    <div className="min-h-screen overflow-hidden bg-background text-foreground">
      <PublicHeader showSections />
      <main>
        <section className="parle-hero relative isolate overflow-hidden">
          <div aria-hidden="true" className="parle-hero-orbit parle-hero-orbit-one" />
          <div aria-hidden="true" className="parle-hero-orbit parle-hero-orbit-two" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-[1.03fr_0.97fr] lg:gap-12 lg:px-8 lg:pb-24 lg:pt-20">
            <motion.div
              initial={reduceMotion ? false : { opacity: 1, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.68, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 max-w-2xl"
            >
              <p className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-white/75 px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] text-primary shadow-sm backdrop-blur">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#F97362]" />
                {t("landing.heroEyebrow")}
              </p>
              <h1 className="mt-7 max-w-[13ch] font-display text-[2.65rem] font-extrabold leading-[1.06] tracking-[-0.065em] text-primary sm:text-5xl lg:text-[4.35rem]">
                {t("landing.heroTitle")}
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                {t("landing.heroBody")}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link to="/onboarding" className="parle-button-primary group">
                  <span>{t("landing.primaryCta")}</span>
                  <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link to="/signup?role=tutor" className="parle-button-secondary group">
                  <span>{t("landing.tutorCta")}</span>
                  <ArrowDownRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:translate-y-0.5" />
                </Link>
                {!isInstalled && canInstall && (
                  <button
                    type="button"
                    onClick={() => void install()}
                    className="parle-button-secondary group w-full sm:w-auto"
                  >
                    <Download aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-y-0.5" />
                    <span>{tInLocale("landing.installApp", installLocale)}</span>
                  </button>
                )}
              </div>
              {!isInstalled && !canInstall && installHintPlatform && (
                <p role="note" className="mt-3 max-w-xl rounded-2xl border border-primary/10 bg-white/75 px-4 py-3 text-sm leading-6 text-muted-foreground shadow-sm">
                  {tInLocale(
                    installHintPlatform === "ios" ? "landing.installHintIos" : "landing.installHintFirefoxAndroid",
                    installLocale,
                  )}
                </p>
              )}
              <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
                {t("landing.heroNote")}
              </p>
              <Link to="/level-check" className="mt-5 inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-primary/15 bg-white/75 px-4 py-3 text-left text-sm font-bold leading-5 text-primary shadow-sm transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
                <Target aria-hidden="true" className="h-4 w-4 shrink-0 text-[#B83E36]" />
                <span className="min-w-0 break-words">{t("landing.levelCheckLink")}</span>
                <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" />
              </Link>
              <a href="#how-it-works" className="mt-9 inline-flex items-center gap-2 text-sm font-bold text-primary transition hover:gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <span>{t("nav.howItWorks")}</span>
                <ArrowDownRight aria-hidden="true" className="h-4 w-4" />
              </a>
            </motion.div>

            <motion.div
              initial={reduceMotion ? false : { opacity: 1, scale: 0.98, rotate: 1 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.85, delay: reduceMotion ? 0 : 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="relative mx-auto w-full max-w-[610px] lg:ml-auto"
            >
              <div aria-hidden="true" className="parle-photo-halo" />
              <figure className="parle-hero-photo relative overflow-hidden rounded-[2rem] border-[7px] border-white shadow-[0_30px_90px_-45px_rgba(30,58,138,0.42)] sm:rounded-[2.6rem] sm:border-[10px]">
                <img
                  src={heroImage}
                  alt={t("landing.heroImageAlt")}
                  className="aspect-[4/3] w-full object-cover object-center"
                  fetchPriority="high"
                  decoding="async"
                />
              </figure>
              <div aria-hidden="true" className="parle-photo-stamp">
                <span className="block h-3 w-3 rounded-full bg-[#F97362]" />
              </div>
            </motion.div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 sm:pb-20 lg:px-8">
          <motion.div
            {...reveal}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: reduceMotion ? 0 : 0.5 }}
            className="parle-current-note grid gap-4 rounded-[1.75rem] border border-primary/10 bg-white p-6 shadow-[0_24px_72px_-54px_rgba(30,58,138,0.35)] sm:grid-cols-[auto_1fr] sm:items-start sm:gap-5 sm:p-8"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary">
              <Target aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.17em] text-[#C64D43]">{t("landing.pathEyebrow")}</p>
              <h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary sm:text-3xl">{t("landing.pathTitle")}</h2>
              <p className="mt-3 max-w-4xl text-sm leading-7 text-muted-foreground sm:text-base">{t("landing.pathBody")}</p>
            </div>
          </motion.div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 bg-primary py-16 text-white sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div {...reveal} viewport={{ once: true, amount: 0.35 }} transition={{ duration: reduceMotion ? 0 : 0.5 }} className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FFC0B4]">{t("landing.howEyebrow")}</p>
              <h2 className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-[-0.05em] sm:text-5xl">{t("landing.howTitle")}</h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/75 sm:text-lg sm:leading-8">{t("landing.howBody")}</p>
            </motion.div>

            <div className="mt-11 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <motion.article
                    key={step.number}
                    {...reveal}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{ duration: reduceMotion ? 0 : 0.48, delay: reduceMotion ? 0 : index * 0.08 }}
                    className="parle-step-card group rounded-[1.6rem] border border-white/15 bg-white/[0.07] p-5 transition duration-300 hover:-translate-y-1 hover:bg-white/[0.12] sm:p-6"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display text-sm font-extrabold tracking-[0.14em] text-[#FFC0B4]">{t(step.number)}</span>
                      <Icon aria-hidden="true" className="h-5 w-5 text-white/75 transition-transform group-hover:scale-110" />
                    </div>
                    <h3 className="mt-9 font-display text-xl font-bold tracking-[-0.035em]">{t(step.title)}</h3>
                    <p className="mt-3 text-sm leading-6 text-white/75">{t(step.body)}</p>
                  </motion.article>
                );
              })}
            </div>
            <p className="mt-5 text-xs leading-5 text-white/75">{t("landing.stepFootnote")}</p>
          </div>
        </section>

        <section id="goals" className="scroll-mt-24 parle-goals-section py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div {...reveal} viewport={{ once: true, amount: 0.35 }} transition={{ duration: reduceMotion ? 0 : 0.5 }} className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#C64D43]">{t("landing.goalsEyebrow")}</p>
              <h2 className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-[-0.05em] text-primary sm:text-5xl">{t("landing.goalsTitle")}</h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{t("landing.goalsBody")}</p>
            </motion.div>

            <div className="mt-11 grid gap-4 md:grid-cols-3">
              {goals.map((goal, index) => {
                const Icon = goal.icon;
                return (
                  <motion.article
                    key={goal.title}
                    {...reveal}
                    viewport={{ once: true, amount: 0.24 }}
                    transition={{ duration: reduceMotion ? 0 : 0.48, delay: reduceMotion ? 0 : index * 0.08 }}
                    className="parle-goal-card rounded-[1.7rem] border border-primary/10 bg-white p-6 shadow-[0_24px_72px_-54px_rgba(30,58,138,0.4)] sm:p-7"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#B83E36]">
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </div>
                    <p className="mt-7 text-[11px] font-bold uppercase tracking-[0.16em] text-[#C64D43]">{t("landing.trackLabel")}</p>
                    <h3 className="mt-2 font-display text-2xl font-extrabold tracking-[-0.045em] text-primary">{t(goal.title)}</h3>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{t(goal.body)}</p>
                  </motion.article>
                );
              })}
            </div>
            <p className="mx-auto mt-6 max-w-4xl text-center text-xs leading-6 text-muted-foreground">{t("landing.trackFootnote")}</p>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-24 bg-[#F0EEE7] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div {...reveal} viewport={{ once: true, amount: 0.35 }} transition={{ duration: reduceMotion ? 0 : 0.5 }} className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#C64D43]">{t("landing.pricingEyebrow")}</p>
                <h2 className="mt-4 max-w-xl font-display text-3xl font-extrabold leading-tight tracking-[-0.05em] text-primary sm:text-5xl">{t("landing.pricingTitle")}</h2>
              </div>
              <div>
                <p className="text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{t("landing.pricingBody")}</p>
                <p className="mt-3 text-sm font-semibold text-primary">{t("landing.pricingNote")}</p>
              </div>
            </motion.div>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {plans.map((plan, index) => {
                const featured = index === 1;
                return (
                  <motion.article
                    key={plan.title}
                    {...reveal}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{ duration: reduceMotion ? 0 : 0.48, delay: reduceMotion ? 0 : index * 0.08 }}
                    className={`rounded-[1.7rem] border p-6 sm:p-8 ${featured ? "border-primary bg-primary text-white shadow-[0_28px_80px_-48px_rgba(30,58,138,0.65)]" : "border-primary/10 bg-white text-foreground shadow-[0_24px_72px_-54px_rgba(30,58,138,0.35)]"}`}
                  >
                    <h3 className={`font-display text-2xl font-extrabold tracking-[-0.04em] ${featured ? "text-white" : "text-primary"}`}>{t(plan.title)}</h3>
                    <div className="mt-5">
                      <p className={`font-display text-[2rem] font-extrabold leading-tight tracking-[-0.05em] sm:text-4xl ${featured ? "text-white" : "text-primary"}`}>{t(plan.price)}</p>
                      {plan.priceNote && <p className={`mt-2 text-sm font-semibold ${featured ? "text-white/75" : "text-muted-foreground"}`}>{t(plan.priceNote)}</p>}
                    </div>
                    <ul className="mt-7 space-y-3" aria-label={`${t(plan.title)} features`}>
                      {plan.features.map((feature) => (
                        <li key={feature} className={`flex items-start gap-3 text-sm leading-6 ${featured ? "text-white/90" : "text-foreground/80"}`}>
                          <Check aria-hidden="true" className={`mt-1 h-4 w-4 shrink-0 ${featured ? "text-[#FFC0B4]" : "text-[#B83E36]"}`} />
                          <span>{t(feature)}</span>
                        </li>
                      ))}
                    </ul>
                  </motion.article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <motion.div {...reveal} viewport={{ once: true, amount: 0.35 }} transition={{ duration: reduceMotion ? 0 : 0.5 }} className="mb-9 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#C64D43]">{t("landing.faqEyebrow")}</p>
              <h2 className="mt-4 font-display text-3xl font-extrabold tracking-[-0.05em] text-primary sm:text-5xl">{t("landing.faqTitle")}</h2>
            </motion.div>
            <div className="space-y-3">
              {questions.map(([question, answer], index) => (
                <motion.details
                  key={question}
                  {...reveal}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: reduceMotion ? 0 : 0.42, delay: reduceMotion ? 0 : index * 0.04 }}
                  className="parle-faq rounded-2xl border border-primary/10 bg-white px-5 py-4 shadow-[0_16px_44px_-38px_rgba(30,58,138,0.4)] sm:px-6"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-base font-bold leading-6 text-primary marker:hidden sm:text-lg">
                    <span>{t(question)}</span>
                    <span aria-hidden="true" className="faq-plus flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FA] text-primary">+</span>
                  </summary>
                  <p className="max-w-3xl pt-4 text-sm leading-7 text-muted-foreground">{t(answer)}</p>
                </motion.details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
};

export default Index;
