import { Link } from "react-router-dom";
import { t } from "@/lib/i18n";

const markUrl =
  "/brand/parle-mark.webp";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      aria-label={t("brand.homeLabel")}
      className="inline-flex shrink-0 items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
    >
      <img
        src={markUrl}
        alt={t("brand.logoAlt")}
        className={compact ? "h-9 w-9 rounded-xl object-contain" : "h-11 w-11 rounded-xl object-contain"}
        loading="eager"
        decoding="async"
      />
      <span className={compact ? "font-display text-xl font-extrabold tracking-[-0.06em] text-primary" : "font-display text-2xl font-extrabold tracking-[-0.06em] text-primary"}>
        {t("brand.name")}
      </span>
    </Link>
  );
}
