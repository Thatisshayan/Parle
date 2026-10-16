import { useCallback, useEffect, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { formatClock, formatLocalDateLabel, formatUsdCents } from "@/lib/parle-booking";
import {
  centsFromDollars, loadAdminPayouts, payoutErrorKey, refundAfterPayout, refundPayout, releasePayout, splitPayout, splitPayoutCents,
  type PayoutFlaggedTutor, type PayoutItem,
} from "@/lib/parle-payouts";
import { t, type TranslationKey } from "@/lib/i18n";

const REASON_KEYS: Record<string, TranslationKey> = {
  dispute: "adminPayouts.reason.dispute", tutor_no_show: "adminPayouts.reason.tutor_no_show", chargeback: "adminPayouts.reason.chargeback",
  account_not_ready: "adminPayouts.reason.account_not_ready", transfer_failed: "adminPayouts.reason.transfer_failed",
};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
type Decide = (run: () => Promise<void>) => void;

function Summary({ item }: { item: PayoutItem }) {
  const zone = browserZone();
  return (
    <>
      <p className="mt-1 break-words text-xs leading-5 text-foreground">{t("adminPayouts.line", { tutor: item.tutor_name, learner: item.learner_name, time: `${formatLocalDateLabel(item.start_at, zone)}, ${formatClock(item.start_at, zone)}`, paid: formatUsdCents(item.paid_cents), payout: formatUsdCents(item.amount_cents) })}</p>
      {item.dispute_details && <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-[#FAF9F5] p-3 text-xs leading-5">{t("adminPayouts.details", { details: item.dispute_details })}</p>}
      {item.reversed_cents > 0 && <p className="mt-1 text-xs text-[#8D342D]">{t("adminPayouts.reversed", { amount: formatUsdCents(item.reversed_cents) })}</p>}
      <p className="mt-2 break-all text-[11px] text-muted-foreground">{item.booking_id}</p>
    </>
  );
}

function HeldCard({ item, busy, decide }: { item: PayoutItem; busy: boolean; decide: Decide }) {
  const [confirming, setConfirming] = useState<"release" | "refund" | "split" | null>(null);
  const [dollars, setDollars] = useState("");
  const chargeback = item.payment_status === "disputed";
  const remaining = item.paid_cents - item.refunded_cents;
  const refundCents = centsFromDollars(dollars);
  const splitOk = refundCents !== null && refundCents < remaining;
  const question = confirming === "release" ? t("adminPayouts.confirmRelease", { payout: formatUsdCents(item.amount_cents) })
    : confirming === "refund" ? (chargeback ? t("adminPayouts.confirmRefundChargeback") : t("adminPayouts.confirmRefund", { amount: formatUsdCents(remaining) }))
    : confirming === "split" && splitOk ? t("adminPayouts.confirmSplit", { refund: formatUsdCents(refundCents!), payout: formatUsdCents(splitPayoutCents(remaining, item.commission_pct, refundCents!)) })
    : "";
  const confirm = () => decide(async () => {
    if (confirming === "release") await releasePayout(item.payout_id);
    else if (confirming === "refund") await refundPayout(item.payout_id);
    else if (confirming === "split" && splitOk) await splitPayout(item.payout_id, refundCents!);
  });
  return (
    <li className="min-w-0 rounded-[1.25rem] border border-primary/10 bg-white p-4">
      <p className="break-words text-sm font-extrabold text-primary">{t(REASON_KEYS[item.hold_reason ?? ""] ?? "adminPayouts.reason.dispute")}</p>
      <Summary item={item} />
      {confirming ? (
        <div className="mt-3 space-y-2">
          {confirming === "split" && (
            <label className="block text-xs font-bold text-foreground">{t("adminPayouts.splitLabel")}
              <input inputMode="decimal" value={dollars} onChange={(e) => setDollars(e.target.value)} className="mt-1 block w-32 rounded-lg border border-primary/20 px-2 py-1 text-sm" />
            </label>
          )}
          {question && <p className="text-xs leading-5 text-foreground">{question}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !question} onClick={confirm} className="parle-button-primary">{t("adminPayouts.confirm")}</button>
            <button type="button" disabled={busy} onClick={() => setConfirming(null)} className="parle-button-secondary">{t("adminPayouts.cancel")}</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => setConfirming("release")} className="parle-button-primary">{t("adminPayouts.release")}</button>
          <button type="button" disabled={busy} onClick={() => setConfirming("refund")} className="parle-button-secondary">{t("adminPayouts.refund")}</button>
          {!chargeback && <button type="button" disabled={busy} onClick={() => setConfirming("split")} className="parle-button-secondary">{t("adminPayouts.split")}</button>}
        </div>
      )}
    </li>
  );
}

function AfterCard({ item, busy, decide }: { item: PayoutItem; busy: boolean; decide: Decide }) {
  const [dollars, setDollars] = useState("");
  const [share, setShare] = useState<"reverse" | "absorb" | "">("");
  const cents = centsFromDollars(dollars);
  const chargeback = item.payment_status === "disputed";
  return (
    <li className="min-w-0 rounded-[1.25rem] border border-primary/10 bg-white p-4">
      <p className="break-words text-sm font-extrabold text-primary">{t(chargeback ? "adminPayouts.reason.chargeback" : "adminPayouts.reason.dispute")}</p>
      <Summary item={item} />
      <div className="mt-3 space-y-2">
        <label className="block text-xs font-bold text-foreground">{t(chargeback ? "adminPayouts.afterLabelChargeback" : "adminPayouts.afterLabel")}
          <input inputMode="decimal" value={dollars} onChange={(e) => setDollars(e.target.value)} className="mt-1 block w-32 rounded-lg border border-primary/20 px-2 py-1 text-sm" />
        </label>
        <fieldset className="flex flex-wrap gap-3 text-xs">
          <legend className="sr-only">{t("adminPayouts.afterSubmit")}</legend>
          <label className="flex items-center gap-1"><input type="radio" name={`share-${item.payout_id}`} checked={share === "reverse"} onChange={() => setShare("reverse")} />{t("adminPayouts.reverse")}</label>
          <label className="flex items-center gap-1"><input type="radio" name={`share-${item.payout_id}`} checked={share === "absorb"} onChange={() => setShare("absorb")} />{t("adminPayouts.absorb")}</label>
        </fieldset>
        <button type="button" disabled={busy || cents === null || !share} onClick={() => decide(async () => { await refundAfterPayout(item.payout_id, cents!, share as "reverse" | "absorb"); })} className="parle-button-secondary">{t("adminPayouts.afterSubmit")}</button>
      </div>
    </li>
  );
}

/** Spec section 7: held payouts (release, refund the learner, split), refunds after payout, flagged tutors. */
export default function AdminPayouts() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [held, setHeld] = useState<PayoutItem[]>([]);
  const [after, setAfter] = useState<PayoutItem[]>([]);
  const [flagged, setFlagged] = useState<PayoutFlaggedTutor[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ key: TranslationKey; error: boolean } | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await loadAdminPayouts();
      setHeld(r.held);
      setAfter(r.afterPayout);
      setFlagged(r.flaggedTutors);
      setState("ready");
    } catch (e) {
      console.error("Payouts could not be loaded", e);
      setState("error");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const decide: Decide = (run) => {
    void (async () => {
      setBusy(true);
      setMessage(null);
      try {
        await run();
        setMessage({ key: "adminPayouts.done", error: false });
      } catch (e) {
        setMessage({ key: payoutErrorKey(e instanceof Error ? e.message : ""), error: true });
      } finally {
        await load();
        setBusy(false);
      }
    })();
  };
  if (state === "loading") return <div className="flex min-h-[240px] items-center justify-center" role="status"><LoaderCircle aria-hidden="true" className="h-8 w-8 animate-spin text-primary" /></div>;
  if (state === "error") return <p role="alert" className="flex items-start gap-2 rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-4 py-3 text-sm text-[#8D342D]"><CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4" />{t("adminPayouts.error")}</p>;
  return (
    <div className="min-w-0 space-y-6">
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{t("adminPayouts.intro")}</p>
      {message && <p role={message.error ? "alert" : "status"} className={message.error ? "rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-4 py-3 text-sm text-[#8D342D]" : "rounded-xl border border-[#B9D9CB] bg-[#F1F8F4] px-4 py-3 text-sm text-[#236646]"}>{t(message.key)}</p>}
      <section aria-labelledby="admin-held">
        <h2 id="admin-held" className="mb-3 font-display text-xl font-extrabold text-primary">{t("adminPayouts.heldHeading")}</h2>
        {held.length === 0 ? <p className="rounded-2xl border border-dashed border-primary/15 bg-white p-4 text-sm text-muted-foreground">{t("adminPayouts.noHeld")}</p>
          : <ul className="space-y-3">{held.map((item) => <HeldCard key={item.payout_id} item={item} busy={busy} decide={decide} />)}</ul>}
      </section>
      <section aria-labelledby="admin-after">
        <h2 id="admin-after" className="mb-3 font-display text-xl font-extrabold text-primary">{t("adminPayouts.afterHeading")}</h2>
        {after.length === 0 ? <p className="rounded-2xl border border-dashed border-primary/15 bg-white p-4 text-sm text-muted-foreground">{t("adminPayouts.noAfter")}</p>
          : <ul className="space-y-3">{after.map((item) => <AfterCard key={item.payout_id} item={item} busy={busy} decide={decide} />)}</ul>}
      </section>
      <section aria-labelledby="admin-payouts-flagged">
        <h2 id="admin-payouts-flagged" className="mb-3 font-display text-xl font-extrabold text-primary">{t("adminPayouts.flaggedHeading")}</h2>
        {flagged.length === 0 ? <p className="rounded-2xl border border-dashed border-primary/15 bg-white p-4 text-sm text-muted-foreground">{t("adminPayouts.noFlagged")}</p> : (
          <ul className="grid gap-2 sm:grid-cols-2">{flagged.map((f) => <li key={f.tutor_id} className="rounded-xl border border-[#F1D9A9] bg-[#FFF8E9] px-4 py-3 text-sm text-[#805916]"><span className="font-extrabold">{f.name}</span> · {t("adminPayouts.cancellations", { count: f.cancellations })}</li>)}</ul>
        )}
      </section>
    </div>
  );
}
