import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { WalletCards } from "lucide-react";
import { loadEarnings } from "@/lib/parle-payouts";
import { t } from "@/lib/i18n";

/** Until payouts are set up, learners see "Booking opens soon" on this tutor's profile: say so on the dashboard. */
export default function PayoutSetupNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let active = true;
    void loadEarnings().then((e) => { if (active) setShow(e.account.state !== "enabled"); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  if (!show) return null;
  return (
    <section role="status" className="flex min-w-0 flex-col gap-3 rounded-[1.4rem] border border-[#F2D9A6] bg-[#FFF8E9] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#805916]"><WalletCards aria-hidden="true" className="h-5 w-5" /></span>
        <div className="min-w-0"><h2 className="font-display text-base font-extrabold text-[#6D531F]">{t("earnings.notice.title")}</h2><p className="mt-1 text-sm leading-6 text-[#6D531F]">{t("earnings.notice.body")}</p></div>
      </div>
      <Link to="/tutor/earnings" className="parle-button-primary shrink-0 justify-center">{t("earnings.notice.link")}</Link>
    </section>
  );
}
