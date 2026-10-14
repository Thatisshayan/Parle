import { Link } from "react-router-dom";
import { t } from "@/lib/i18n";
import { Brand } from "@/components/parle/Brand";

export function PublicFooter() {
  return (
    <footer className="border-t border-primary/10 bg-[#F3F0E8]">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-9 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-12 lg:px-8">
        <div className="flex min-w-0 flex-col gap-3">
          <Brand compact />
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">{t("landing.footerLine")}</p>
        </div>
        <div className="grid min-w-0 gap-7 sm:grid-cols-2 sm:gap-8">
          <nav aria-label={t("footer.infoNav")} className="min-w-0">
            <h2 className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-primary">{t("footer.infoHeading")}</h2>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <li className="min-w-0"><Link className="footer-link break-words" to="/how-it-works">{t("footer.howItWorks")}</Link></li>
              <li className="min-w-0"><Link className="footer-link break-words" to="/level-estimates">{t("footer.levelEstimates")}</Link></li>
              <li className="min-w-0"><Link className="footer-link break-words" to="/tutor-vetting">{t("footer.tutorVetting")}</Link></li>
              <li className="min-w-0"><Link className="footer-link break-words" to="/ai-tutor">{t("footer.aiTutor")}</Link></li>
              <li className="min-w-0"><Link className="footer-link break-words" to="/plans">{t("footer.plans")}</Link></li>
              <li className="min-w-0"><Link className="footer-link break-words" to="/faq">{t("footer.faq")}</Link></li>
            </ul>
          </nav>
          <nav aria-label={t("footer.legalNav")} className="min-w-0">
            <h2 className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-primary">{t("footer.legalHeading")}</h2>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <li className="min-w-0"><Link className="footer-link break-words" to="/legal/terms">{t("footer.terms")}</Link></li>
              <li className="min-w-0"><Link className="footer-link break-words" to="/legal/privacy">{t("footer.privacy")}</Link></li>
              <li className="min-w-0"><Link className="footer-link break-words" to="/legal/tutor-agreement">{t("footer.tutorAgreement")}</Link></li>
              <li className="min-w-0"><Link className="footer-link break-words" to="/legal/refunds">{t("footer.refundPolicy")}</Link></li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
