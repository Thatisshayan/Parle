import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CircleAlert, ExternalLink, LoaderCircle, WalletCards } from "lucide-react";
import { formatLocalDateLabel, formatUsdCents } from "@/lib/parle-booking";
import { groupEarnings, joinPayoutWaitlist, loadEarnings, openPayoutDashboard, payoutErrorKey, startPayoutSetup, type EarningLine, type Earnings } from "@/lib/parle-payouts";
import { t, type TranslationKey } from "@/lib/i18n";

const ACCOUNT_KEYS: Record<string, TranslationKey> = {
  none: "earnings.account.none", onboarding: "earnings.account.onboarding", restricted: "earnings.account.restricted", enabled: "earnings.account.enabled",
  country_missing: "earnings.account.countryMissing", country_waitlist: "earnings.account.countryWaitlist", waitlisted: "earnings.account.waitlisted",
};
const HOLD_KEYS: Record<string, TranslationKey> = {
  dispute: "earnings.hold.dispute", tutor_no_show: "earnings.hold.tutor_no_show", chargeback: "earnings.hold.chargeback",
  account_not_ready: "earnings.hold.account_not_ready", transfer_failed: "earnings.hold.transfer_failed",
};
const SECTIONS = [
  ["upcoming", "earnings.upcoming.heading"], ["pending", "earnings.pending.heading"], ["held", "earnings.held.heading"], ["paid", "earnings.paid.heading"],
] as const;

function LessonLine({ line, zone }: { line: EarningLine; zone: string }) {
  return (
    <li className="min-w-0 rounded-[1.1rem] border border-primary/10 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-extrabold text-primary">{t("earnings.line.title", { learner: line.learner_name, date: formatLocalDateLabel(line.start_at, zone), minutes: line.minutes })}</p>
        <p className="font-display text-lg font-extrabold text-primary">{formatUsdCents(line.payout_cents)}</p>
      </div>
      <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{t("earnings.line.breakdown", { price: formatUsdCents(line.price_cents), pct: line.commission_pct, commission: formatUsdCents(line.commission_cents), payout: formatUsdCents(line.payout_cents + line.reversed_cents) })}</p>
      {line.late_cancel && <p className="mt-1 text-xs text-muted-foreground">{t("earnings.line.lateCancel")}</p>}
      {line.state === "pending" && line.release_at && <p className="mt-1 text-xs text-foreground">{t("earnings.line.releases", { date: formatLocalDateLabel(line.release_at, zone) })}</p>}
      {line.state === "held" && <p className="mt-2 rounded-xl bg-[#FFF8E9] px-3 py-2 text-xs leading-5 text-[#6D531F]">{t(HOLD_KEYS[line.hold_reason ?? ""] ?? "earnings.hold.dispute")}</p>}
      {line.state === "paid" && <p className="mt-1 break-all text-xs text-foreground">{t("earnings.line.paid", { date: line.paid_at ? formatLocalDateLabel(line.paid_at, zone) : "-", ref: line.transfer_id ?? "-" })}</p>}
      {line.reversed_cents > 0 && <p className="mt-1 text-xs text-[#8D342D]">{t("earnings.line.reversed", { amount: formatUsdCents(line.reversed_cents) })}</p>}
    </li>
  );
}

/** Spec section 7: payout account, upcoming, pending, held and paid lessons, per-lesson breakdown, monthly totals. */
export default function TutorEarnings() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [data, setData] = useState<Earnings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const started = useRef(false);
  const connect = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("connect");

  const load = useCallback(async (refresh: boolean) => {
    try {
      setData(await loadEarnings(refresh));
      setState("ready");
    } catch (e) {
      console.error("Earnings could not be loaded", e);
      setState("error");
    }
  }, []);
  const go = useCallback(async (action: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    try {
      const url = await action();
      if (typeof url === "string" && url) { window.location.assign(url); return; }
      await load(false);
    } catch (e) {
      setError(payoutErrorKey(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }, [load]);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Stripe sends the tutor back here: "return" after onboarding (ask Stripe now), "refresh" when its link expired (open a new one)
    void load(connect === "return");
    if (connect === "refresh") void go(startPayoutSetup);
  }, [connect, go, load]);

  if (state === "loading") return <div className="flex min-h-[240px] items-center justify-center" role="status"><LoaderCircle aria-hidden="true" className="h-8 w-8 animate-spin text-primary" /></div>;
  if (state === "error" || !data) return <p role="alert" className="flex items-start gap-2 rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-4 py-3 text-sm text-[#8D342D]"><CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4" />{t("earnings.error")}</p>;
  const groups = groupEarnings(data.lessons);
  const a = data.account;
  const zone = data.timeZone;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }} className="min-w-0 space-y-6">
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{t("earnings.intro")}</p>
      {connect === "return" && <p role="status" className="rounded-xl border border-[#B9D9CB] bg-[#F1F8F4] px-4 py-3 text-sm text-[#236646]">{t("earnings.returned")}</p>}
      <section aria-labelledby="earnings-account" className="min-w-0 rounded-[1.4rem] border border-primary/10 bg-white p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FA] text-primary"><WalletCards aria-hidden="true" className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 id="earnings-account" className="font-display text-lg font-extrabold text-primary">{t("earnings.account.heading")}</h2>
            <p className="mt-1 break-words text-sm leading-6 text-foreground">{t(ACCOUNT_KEYS[a.state], { country: a.countryName || "-", date: a.waitlistedAt ? formatLocalDateLabel(a.waitlistedAt, zone) : "-", hours: data.payoutDelayHours })}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(a.state === "none" || a.state === "onboarding" || a.state === "restricted") && (
            <button type="button" disabled={busy} onClick={() => void go(startPayoutSetup)} className="parle-button-primary">
              {busy && <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />}{t(a.state === "none" ? "earnings.setUp" : "earnings.continueSetup")}
            </button>
          )}
          {a.state === "country_waitlist" && <button type="button" disabled={busy} onClick={() => void go(joinPayoutWaitlist)} className="parle-button-primary">{t("earnings.joinWaitlist")}</button>}
          {a.detailsSubmitted && <button type="button" disabled={busy} onClick={() => void go(openPayoutDashboard)} className="parle-button-secondary"><ExternalLink aria-hidden="true" className="h-4 w-4" />{t("earnings.openDashboard")}</button>}
        </div>
        {error && <p role="alert" className="mt-3 rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-3 py-2 text-sm text-[#8D342D]">{t(error)}</p>}
      </section>
      <section aria-labelledby="earnings-months">
        <h2 id="earnings-months" className="mb-3 font-display text-xl font-extrabold text-primary">{t("earnings.monthsHeading")}</h2>
        {data.months.length === 0 ? <p className="rounded-2xl border border-dashed border-primary/15 bg-white p-4 text-sm text-muted-foreground">{t("earnings.empty")}</p> : (
          <ul className="grid gap-2 sm:grid-cols-2">{data.months.map((m) => (
            <li key={m.month} className="rounded-xl border border-primary/10 bg-white px-4 py-3 text-sm text-foreground">{t("earnings.monthLine", { month: m.month, lessons: m.lessons, earned: formatUsdCents(m.earned_cents), paid: formatUsdCents(m.paid_cents) })}</li>
          ))}</ul>
        )}
      </section>
      {SECTIONS.map(([key, heading]) => (
        <section key={key} aria-labelledby={`earnings-${key}`}>
          <h2 id={`earnings-${key}`} className="mb-3 font-display text-xl font-extrabold text-primary">{t(heading)}</h2>
          {groups[key].length === 0 ? <p className="rounded-2xl border border-dashed border-primary/15 bg-white p-4 text-sm text-muted-foreground">{t("earnings.empty")}</p> : (
            <ul className="grid gap-3 lg:grid-cols-2">{groups[key].map((line) => <LessonLine key={line.booking_id} line={line} zone={zone} />)}</ul>
          )}
        </section>
      ))}
    </motion.div>
  );
}
