import { Link } from "react-router-dom";
import { t } from "@/lib/i18n";

const markUrl =
  "https://ellprnxjjzatijdxcogk.supabase.co/storage/v1/render/image/public/files/chat-generated-images/project-yuircx1jlz5bpg1jbv2th/bcc3f982-c93f-476e-85e4-7f6c0c73e3c6.webp?width=160&resize=contain&quality=75";

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
