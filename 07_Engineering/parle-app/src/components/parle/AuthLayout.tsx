import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BookOpenCheck, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/parle/Brand";
import { PublicFooter } from "@/components/parle/PublicFooter";
import { t, type TranslationKey } from "@/lib/i18n";

interface AuthLayoutProps {
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  children: ReactNode;
  admin?: boolean;
}

export function AuthLayout({ titleKey, descriptionKey, children, admin = false }: AuthLayoutProps) {
  return (
    <div className="auth-page min-h-screen bg-background">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <Brand compact />
        <Link to="/" className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-primary transition hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          <span>{t("common.backHome")}</span>
        </Link>
      </header>

      <main className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 px-4 pb-10 pt-2 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-8 lg:px-8 lg:pb-16 lg:pt-8">
        <aside className={`auth-story order-2 relative overflow-hidden rounded-[2rem] p-7 text-white sm:p-10 lg:order-1 lg:min-h-[590px] ${admin ? "auth-story-admin" : "auth-story-parle"}`}>
          <div aria-hidden="true" className="auth-story-orbit" />
          <div className="relative z-10 flex h-full flex-col">
            <div className="flex items-center gap-3 text-white/80">
              {admin ? <ShieldCheck aria-hidden="true" className="h-5 w-5" /> : <BookOpenCheck aria-hidden="true" className="h-5 w-5" />}
              <span className="text-xs font-bold uppercase tracking-[0.18em]">
                {t(admin ? "auth.adminPanelEyebrow" : "auth.panelEyebrow")}
              </span>
            </div>
            <div className="mt-auto max-w-lg pt-10">
              <h2 className="font-display text-3xl font-extrabold leading-tight tracking-[-0.045em] sm:text-4xl">
                {t(admin ? "auth.adminPanelTitle" : "auth.panelTitle")}
              </h2>
              <p className="mt-5 max-w-md text-base leading-7 text-white/80">
                {t(admin ? "auth.adminPanelBody" : "auth.panelBody")}
              </p>
              {!admin && (
                <div className="mt-8 flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 text-sm leading-6 text-white/90 backdrop-blur-sm">
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#F97362]" />
                  <span>{t("auth.pathPill")}</span>
                </div>
              )}
            </div>
          </div>
        </aside>

        <section className="auth-form-panel order-1 flex flex-col justify-center rounded-[2rem] border border-primary/10 bg-white px-5 py-8 shadow-[0_24px_80px_-48px_rgba(30,58,138,0.32)] sm:px-9 sm:py-10 lg:order-2 lg:px-12">
          <div className="mx-auto w-full max-w-md">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#C64D43]">
              {t(admin ? "auth.adminPanelEyebrow" : "auth.panelEyebrow")}
            </p>
            <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-[-0.05em] text-foreground sm:text-4xl">
              {t(titleKey)}
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
              {t(descriptionKey)}
            </p>
            <div className="mt-8">{children}</div>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-7 text-center text-xs text-muted-foreground sm:px-6 lg:px-8">
        {t("auth.passwordMatchHint")}
      </footer>
      {!admin && <PublicFooter />}
    </div>
  );
}
