import { Clock3 } from "lucide-react";
import { PublicHeader } from "@/components/parle/PublicHeader";
import { PublicFooter } from "@/components/parle/PublicFooter";
import { t, type TranslationKey } from "@/lib/i18n";

interface PlaceholderPageProps {
  titleKey: TranslationKey;
  publicPage?: boolean;
  showTitle?: boolean;
  bodyKey?: TranslationKey;
}

export default function PlaceholderPage({ titleKey, publicPage = false, showTitle = true, bodyKey }: PlaceholderPageProps) {
  return (
    <div className="min-h-screen bg-background">
      {publicPage && <PublicHeader />}
      <main className={`mx-auto flex w-full max-w-7xl flex-col px-4 py-12 sm:px-6 sm:py-16 lg:px-8 ${publicPage ? "min-h-[62vh] justify-center" : "min-h-[350px] justify-center"}`}>
        <div className="mx-auto w-full max-w-3xl">
          {showTitle && (
            <div className="mb-7 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#C64D43]">{t("placeholder.eyebrow")}</p>
              <h1 className="mt-3 font-display text-3xl font-extrabold tracking-[-0.045em] text-foreground sm:text-4xl">{t(titleKey)}</h1>
            </div>
          )}
          <section className="parle-placeholder-card flex flex-col items-center justify-center rounded-[2rem] border border-primary/10 bg-white px-6 py-12 text-center shadow-[0_24px_72px_-48px_rgba(30,58,138,0.4)] sm:px-10 sm:py-16">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FCE7E3] text-[#B83E36]">
              <Clock3 aria-hidden="true" className="h-6 w-6" />
            </span>
            {!showTitle && <h2 className="sr-only">{t(titleKey)}</h2>}
            <p className="mt-5 font-display text-2xl font-bold tracking-[-0.035em] text-primary sm:text-3xl">{t("placeholder.coming")}</p>
            {bodyKey && <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{t(bodyKey)}</p>}
          </section>
        </div>
      </main>
      {publicPage && <PublicFooter />}
    </div>
  );
}
