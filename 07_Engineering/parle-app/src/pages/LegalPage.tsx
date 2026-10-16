import { Link } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";
import { PublicHeader } from "@/components/parle/PublicHeader";
import { PublicFooter } from "@/components/parle/PublicFooter";
import { t, type TranslationKey } from "@/lib/i18n";

export type LegalPolicy = "terms" | "privacy" | "tutorAgreement" | "refund";

const policyTitles: Record<LegalPolicy, TranslationKey> = {
  terms: "legal.termsTitle",
  privacy: "legal.privacyTitle",
  tutorAgreement: "legal.tutorAgreementTitle",
  refund: "legal.refundTitle",
};

export default function LegalPage({ policy }: { policy: LegalPolicy }) {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="mx-auto min-h-[62vh] max-w-4xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
        <Link to="/" className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-primary transition hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          <span>{t("legal.backHome")}</span>
        </Link>
        <article className="mt-7 rounded-[2rem] border border-primary/10 bg-white p-6 shadow-[0_24px_72px_-48px_rgba(30,58,138,0.35)] sm:p-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF2FA] text-primary">
            <FileText aria-hidden="true" className="h-5 w-5" />
          </div>
          <h1 className="mt-6 font-display text-3xl font-extrabold tracking-[-0.05em] text-foreground sm:text-4xl">{t(policyTitles[policy])}</h1>
          <p className="mt-8 max-w-2xl text-base leading-7 text-muted-foreground">{t("legal.policyShell")}</p>
          {policy === "privacy" && (
            <section className="mt-8 max-w-2xl" aria-labelledby="privacy-voice">
              <h2 id="privacy-voice" className="font-display text-xl font-extrabold text-foreground">{t("legal.privacyVoiceTitle")}</h2>
              <p className="mt-3 text-base leading-7 text-muted-foreground">{t("legal.privacyVoiceBody")}</p>
            </section>
          )}
        </article>
      </main>
      <PublicFooter />
    </div>
  );
}
