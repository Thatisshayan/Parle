import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { superdevClient } from "@/lib/superdev/client";
import { t } from "@/lib/i18n";
import { Brand } from "@/components/parle/Brand";

export function PublicHeader({ showSections = false, publicOnly = false }: { showSections?: boolean; publicOnly?: boolean }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const isAuthenticatedView = !publicOnly && isAuthenticated;

  useEffect(() => {
    if (publicOnly) return;
    let active = true;
    superdevClient
      .isAuthenticated()
      .then((value) => {
        if (active) setIsAuthenticated(value);
      })
      .catch(() => {
        if (active) setIsAuthenticated(false);
      });
    return () => {
      active = false;
    };
  }, [publicOnly]);

  return (
    <header className="sticky top-0 z-40 border-b border-primary/10 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[76px] max-w-7xl items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
        <Brand compact />
        {showSections && (
          <nav aria-label={t("nav.primary")} className="hidden items-center gap-7 lg:flex">
            <a className="site-nav-link" href="#how-it-works">{t("nav.howItWorks")}</a>
            <a className="site-nav-link" href="#goals">{t("nav.goals")}</a>
            <a className="site-nav-link" href="#pricing">{t("nav.pricing")}</a>
          </nav>
        )}
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          {isAuthenticatedView ? (
            <Link to="/learner" className="site-nav-link inline-flex px-1 text-xs sm:px-2 sm:text-sm">
              {t("common.yourSpace")}
            </Link>
          ) : (
            <Link to="/login" className="site-nav-link inline-flex px-1 text-xs sm:px-2 sm:text-sm">
              {t("common.signIn")}
            </Link>
          )}
          <Link
            to={isAuthenticatedView ? "/settings" : "/signup"}
            className="inline-flex min-h-10 items-center justify-center gap-1 rounded-full bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 sm:gap-2 sm:px-5 sm:text-sm"
          >
            <span>
              {isAuthenticatedView ? (
                <>
                  <span className="sm:hidden">{t("common.settingsShort")}</span>
                  <span className="hidden sm:inline">{t("common.settings")}</span>
                </>
              ) : (
                <>
                  <span className="sm:hidden">{t("common.signUpShort")}</span>
                  <span className="hidden sm:inline">{t("common.createAccount")}</span>
                </>
              )}
            </span>
            <ArrowUpRight aria-hidden="true" className={`h-4 w-4 ${isAuthenticatedView ? "hidden sm:block" : ""}`} />
          </Link>
        </div>
      </div>
    </header>
  );
}
