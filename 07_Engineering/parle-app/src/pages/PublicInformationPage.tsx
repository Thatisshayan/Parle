import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  BookOpenCheck,
  CalendarDays,
  Check,
  FileText,
  MessageCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  Video,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PublicFooter } from "@/components/parle/PublicFooter";
import { PublicHeader } from "@/components/parle/PublicHeader";
import { t, type TranslationKey } from "@/lib/i18n";
import {
  publicInfoPages,
  type PublicInfoFaqItem,
  type PublicInfoLayout,
  type PublicInfoPageId,
  type PublicInfoSection,
} from "@/lib/public-info-content";

const sectionIcons: Record<PublicInfoPageId, readonly LucideIcon[]> = {
  howItWorks: [Target, CalendarDays, MessageCircle, ShieldCheck],
  levelEstimates: [Target, FileText, MessageCircle],
  tutorVetting: [FileText, Video, ShieldCheck, MessageCircle],
  aiTutor: [Sparkles, ShieldCheck],
  plans: [BookOpenCheck, Sparkles],
  faq: [],
  cancellations: [CalendarDays, CalendarDays, ShieldCheck, CalendarDays, FileText, MessageCircle],
};

function RevealCard({
  children,
  index,
  reduceMotion,
  className,
}: {
  children: ReactNode;
  index: number;
  reduceMotion: boolean | null;
  className: string;
}) {
  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduceMotion ? 0 : 0.38,
        delay: reduceMotion ? 0 : Math.min(index * 0.055, 0.22),
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.article>
  );
}

function InfoCard({
  section,
  index,
  pageId,
  layout,
  reduceMotion,
}: {
  section: PublicInfoSection;
  index: number;
  pageId: PublicInfoPageId;
  layout: PublicInfoLayout;
  reduceMotion: boolean | null;
}) {
  const Icon = sectionIcons[pageId][index] ?? BookOpenCheck;
  const featuredPlan = layout === "plans" && index === 1;
  const limitCard = layout === "features" && index === 1;
  const cardClassName = featuredPlan
    ? "group relative min-w-0 overflow-hidden rounded-[1.75rem] border border-primary bg-primary p-6 text-white shadow-[0_28px_80px_-48px_rgba(30,58,138,0.65)] transition duration-300 hover:-translate-y-1 sm:p-8"
    : limitCard
      ? "group relative min-w-0 overflow-hidden rounded-[1.75rem] border border-[#F2CDC7] bg-[#FFF7F4] p-6 shadow-[0_24px_72px_-54px_rgba(30,58,138,0.32)] transition duration-300 hover:-translate-y-1 sm:p-8"
      : "group relative min-w-0 overflow-hidden rounded-[1.75rem] border border-primary/10 bg-white p-6 shadow-[0_24px_72px_-54px_rgba(30,58,138,0.35)] transition duration-300 hover:-translate-y-1 hover:border-primary/20 sm:p-8";
  const iconClassName = featuredPlan
    ? "bg-white/10 text-[#FFC0B4]"
    : limitCard
      ? "bg-[#FCE7E3] text-[#A13F36]"
      : "bg-[#EEF2FA] text-primary";
  const titleClassName = featuredPlan ? "text-white" : "text-primary";
  const bodyClassName = featuredPlan ? "text-white/80" : "text-muted-foreground";
  const listClassName = featuredPlan ? "text-white/90" : "text-foreground/80";

  return (
    <RevealCard index={index} reduceMotion={reduceMotion} className={cardClassName}>
      <div aria-hidden="true" className={`flex h-12 w-12 items-center justify-center rounded-2xl ${iconClassName}`}>
        <Icon className="h-5 w-5" />
      </div>

      {section.markerKey && (
        <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.17em] text-[#C64D43]">
          {t(section.markerKey)}
        </p>
      )}
      {section.badgeKey && (
        <p className="mt-5 inline-flex max-w-full items-center rounded-full border border-[#F2CDC7] bg-[#FFF5F2] px-3 py-2 text-xs font-extrabold leading-5 text-[#8D342D]">
          {t(section.badgeKey)}
        </p>
      )}
      <h2 className={`mt-5 break-words font-display text-xl font-extrabold leading-tight tracking-[-0.04em] sm:text-2xl ${titleClassName}`}>
        {t(section.titleKey)}
      </h2>
      {section.priceKey && (
        <p className="mt-4 break-words font-display text-[1.55rem] font-extrabold leading-tight tracking-[-0.045em] text-white sm:text-3xl">
          {t(section.priceKey)}
        </p>
      )}
      {section.bodyKey && (
        <p className={`mt-3 text-sm leading-7 sm:text-base ${bodyClassName}`}>
          {t(section.bodyKey)}
        </p>
      )}
      {section.itemKeys && (
        <ul aria-label={t(section.titleKey)} className="mt-5 space-y-3">
          {section.itemKeys.map((itemKey) => (
            <li key={itemKey} className={`flex min-w-0 items-start gap-3 text-sm leading-6 ${listClassName}`}>
              <Check aria-hidden="true" className={`mt-1 h-4 w-4 shrink-0 ${featuredPlan ? "text-[#FFC0B4]" : "text-[#B83E36]"}`} />
              <span className="min-w-0 break-words">{t(itemKey)}</span>
            </li>
          ))}
        </ul>
      )}
      {layout === "steps" && (
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-12 -right-8 h-32 w-32 rounded-full border border-primary/10 transition-transform duration-300 group-hover:scale-110" />
      )}
      {featuredPlan && (
        <span aria-hidden="true" className="pointer-events-none absolute -right-14 -top-16 h-40 w-40 rounded-full border border-white/10" />
      )}
    </RevealCard>
  );
}

function InfoNote({
  titleKey,
  bodyKey,
  index,
  pageId,
  reduceMotion,
}: {
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  index: number;
  pageId: PublicInfoPageId;
  reduceMotion: boolean | null;
}) {
  const headingId = `public-info-note-${pageId}-${index}`;
  return (
    <motion.aside
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.32, delay: reduceMotion ? 0 : 0.16 }}
      aria-labelledby={headingId}
      className="flex min-w-0 items-start gap-4 rounded-[1.5rem] border border-[#F2CDC7] bg-[#FFF7F4] p-5 shadow-[0_20px_60px_-48px_rgba(141,52,45,0.45)] sm:p-6"
    >
      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FCE7E3] text-[#A13F36]">
        <FileText className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <h2 id={headingId} className="font-display text-base font-extrabold leading-6 text-primary sm:text-lg">
          {t(titleKey)}
        </h2>
        <p className="mt-1 text-sm leading-6 text-foreground/80 sm:text-base sm:leading-7">
          {t(bodyKey)}
        </p>
      </div>
    </motion.aside>
  );
}

function FaqDisclosure({
  item,
}: {
  item: PublicInfoFaqItem;
}) {
  return (
    <details className="parle-faq group min-w-0 rounded-2xl border border-primary/10 bg-white px-5 py-4 shadow-[0_16px_44px_-38px_rgba(30,58,138,0.4)] transition-colors hover:border-primary/20 sm:px-6 sm:py-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg font-display text-base font-bold leading-6 text-primary marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-lg">
        <span className="min-w-0 break-words">{t(item.questionKey)}</span>
        <span aria-hidden="true" className="faq-plus flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF2FA] text-primary transition-colors">
          <Plus className="h-4 w-4" />
        </span>
      </summary>
      <p className="max-w-3xl pt-4 text-sm leading-7 text-muted-foreground sm:text-base">
        {t(item.answerKey)}
      </p>
    </details>
  );
}

export default function PublicInformationPage({ pageId }: { pageId: PublicInfoPageId }) {
  const reduceMotion = useReducedMotion();
  const page = publicInfoPages[pageId];
  const sections = "sections" in page ? page.sections : [];
  const notes = "notes" in page ? page.notes ?? [] : [];
  const contentGridClass = page.layout === "steps"
    ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    : page.layout === "cards"
      ? "grid gap-4 md:grid-cols-3"
      : page.layout === "features" || page.layout === "plans"
        ? "grid gap-4 md:grid-cols-2"
        : "";
  const contentWidthClass = page.layout === "faq" ? "max-w-4xl" : "max-w-7xl";

  return (
    <div className="min-h-screen overflow-hidden bg-background text-foreground">
      <PublicHeader publicOnly />
      <main>
        <section className="relative isolate overflow-hidden bg-[radial-gradient(ellipse_at_12%_0%,rgba(249,115,98,0.13),transparent_30%),radial-gradient(ellipse_at_96%_75%,rgba(30,58,138,0.08),transparent_29%),linear-gradient(135deg,#fbfaf5_0%,#f7f5ef_58%,#f0f2f7_100%)]">
          <div aria-hidden="true" className="pointer-events-none absolute -right-36 top-8 h-80 w-80 rounded-full border border-primary/10 sm:-right-20 sm:h-[27rem] sm:w-[27rem]" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-24 h-56 w-56 rounded-full border border-[#F97362]/20 sm:-right-8 sm:h-72 sm:w-72" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-[#F97362]/[0.08] blur-3xl" />
          <div className="relative mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-6 sm:pb-16 sm:pt-8 lg:px-8 lg:pb-20">
            <Link
              to="/"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/10 bg-white/65 px-3.5 py-2 text-sm font-semibold text-primary transition hover:-translate-x-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              <span>{t("common.backHome")}</span>
            </Link>
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.52, ease: [0.22, 1, 0.36, 1] }}
              className="relative mt-9 max-w-4xl sm:mt-12"
            >
              <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary/10 bg-white/75 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-primary shadow-sm backdrop-blur sm:text-xs">
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[#F97362]" />
                <span className="min-w-0 break-words">{t(page.eyebrowKey)}</span>
              </p>
              <h1 className="mt-5 max-w-[17ch] break-words font-display text-[2.5rem] font-extrabold leading-[1.07] tracking-[-0.06em] text-primary sm:text-5xl lg:text-[3.8rem]">
                {t(page.titleKey)}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                {t(page.introKey)}
              </p>
            </motion.div>
            <div aria-hidden="true" className="relative mt-9 h-px max-w-5xl bg-gradient-to-r from-primary/20 via-primary/10 to-transparent sm:mt-12" />
          </div>
        </section>

        <section className="bg-[radial-gradient(ellipse_at_95%_2%,rgba(30,58,138,0.045),transparent_30%),#faf9f5] py-10 sm:py-14 lg:py-16">
          <div className={`mx-auto w-full ${contentWidthClass} px-4 sm:px-6 lg:px-8`}>
            {page.layout === "faq" ? (
              <div>
                <h2 className="sr-only">{t("publicInfo.faq.listLabel")}</h2>
                <div className="space-y-3">
                  {(page.faqItems ?? []).map((item) => (
                    <FaqDisclosure key={item.questionKey} item={item} />
                  ))}
                </div>
              </div>
            ) : (
              <div className={contentGridClass}>
                {sections.map((section, index) => (
                  <InfoCard
                    key={section.titleKey}
                    section={section}
                    index={index}
                    pageId={pageId}
                    layout={page.layout}
                    reduceMotion={reduceMotion}
                  />
                ))}
              </div>
            )}
            {notes.length > 0 && (
              <div className={`mt-5 space-y-3 ${page.layout === "plans" ? "max-w-4xl" : "max-w-5xl"}`}>
                {notes.map((note, index) => (
                  <InfoNote
                    key={note.titleKey}
                    titleKey={note.titleKey}
                    bodyKey={note.bodyKey}
                    index={index}
                    pageId={pageId}
                    reduceMotion={reduceMotion}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
