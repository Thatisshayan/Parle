import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, BadgeCheck, Check, CircleAlert, Clock3, CreditCard, MessageCircle, Mic2, RefreshCw, Sparkles } from "lucide-react";
import { parleAssessmentService } from "@/functions";
import { t, type TranslationKey } from "@/lib/i18n";
import { checkoutFailureTranslationKey } from "@/lib/learner-billing-errors";

type PlanTier = "free" | "premium";
type BillingSource = "free" | "complimentary" | "paid";
type SubscriptionPlan = "premium_monthly" | "premium_annual";
type SubscriptionStatus = "active" | "trialing" | "cancelling";
export type LearnerPlanAction = "monthly" | "annual" | "refresh" | "portal" | "return" | null;

export interface LearnerPlanSummary {
  planTier: PlanTier;
  messagesUsed: number;
  messagesLimit: number;
  freeDailyMessages: number;
  premiumDailyMessages: number;
  billingSource: BillingSource;
  subscriptionPlan: SubscriptionPlan | null;
  subscriptionStatus: SubscriptionStatus | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface LearnerPlanNotice {
  tone: "success" | "info" | "error";
  message: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unwrapServiceResponse(value: unknown): Record<string, unknown> {
  let current: unknown = value;
  for (let index = 0; index < 6; index += 1) {
    if (!isObject(current)) break;
    if (isObject(current.result)) {
      current = current.result;
      continue;
    }
    if (isObject(current.data) && ("status" in current.data || "error" in current.data || "error_code" in current.data || "summary" in current.data || "url" in current.data)) {
      current = current.data;
      continue;
    }
    break;
  }
  return isObject(current) ? current : {};
}

function nonNegativeCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

export function parseLearnerPlanSummary(value: unknown): LearnerPlanSummary | null {
  const payload = unwrapServiceResponse(value);
  if (payload.status !== "complete" || !isObject(payload.summary)) return null;
  const raw = payload.summary;
  const messagesUsed = nonNegativeCount(raw.messages_used);
  const freeDailyMessages = nonNegativeCount(raw.free_messages_limit);
  const premiumDailyMessages = nonNegativeCount(raw.premium_messages_limit);
  if (messagesUsed === null || freeDailyMessages === null || premiumDailyMessages === null) return null;

  // Only a server-resolved Premium tier grants Premium presentation.
  const planTier: PlanTier = raw.plan_tier === "premium" ? "premium" : "free";
  const currentPeriodEnd = isIsoDate(raw.current_period_end) ? new Date(raw.current_period_end).toISOString() : null;
  const source = raw.billing_source;
  const billingSource: BillingSource = planTier !== "premium"
    ? "free"
    : source === "paid" ? "paid" : "complimentary";

  let subscriptionPlan: SubscriptionPlan | null = null;
  let subscriptionStatus: SubscriptionStatus | null = null;
  let cancelAtPeriodEnd = false;
  if (billingSource === "paid") {
    if (
      (raw.subscription_plan !== "premium_monthly" && raw.subscription_plan !== "premium_annual") ||
      (raw.subscription_status !== "active" && raw.subscription_status !== "trialing" && raw.subscription_status !== "cancelling") ||
      !currentPeriodEnd || typeof raw.cancel_at_period_end !== "boolean"
    ) return null;
    subscriptionPlan = raw.subscription_plan;
    subscriptionStatus = raw.subscription_status;
    cancelAtPeriodEnd = raw.cancel_at_period_end;
    if (cancelAtPeriodEnd && subscriptionStatus !== "cancelling") return null;
  }

  return {
    planTier,
    messagesUsed,
    messagesLimit: planTier === "premium" ? premiumDailyMessages : freeDailyMessages,
    freeDailyMessages,
    premiumDailyMessages,
    billingSource,
    subscriptionPlan,
    subscriptionStatus,
    currentPeriodEnd: billingSource === "paid" ? currentPeriodEnd : null,
    cancelAtPeriodEnd,
  };
}

function actionErrorCode(error: unknown): string {
  if (isObject(error) && typeof error.code === "string") return error.code;
  return "unknown";
}

function messageKeyForBillingError(error: unknown, fallback: TranslationKey): TranslationKey {
  switch (actionErrorCode(error)) {
    case "subscription_already_active": return "learner.plan.subscriptionAlreadyActive";
    case "subscription_not_active": return "learner.plan.subscriptionNotActive";
    case "test_mode_unavailable": return "learner.plan.billingUnavailable";
    case "checkout_session_not_owned":
    case "checkout_subscription_not_verified":
    case "invalid_checkout_session": return "learner.plan.checkoutConfirmError";
    default: return fallback;
  }
}

function servicePayload(value: unknown): Record<string, unknown> {
  const payload = unwrapServiceResponse(value);
  const errorCode = typeof payload.error_code === "string" ? payload.error_code : null;
  const hasError = errorCode !== null || typeof payload.error === "string" || payload.status === "error";
  if (hasError) {
    const error = new Error(errorCode ?? "service_error") as Error & { code?: string };
    error.code = errorCode ?? "service_error";
    throw error;
  }
  return payload;
}

async function fetchPlanSummary(): Promise<LearnerPlanSummary> {
  const response = await parleAssessmentService({ action: "tutor_get_plan_summary" });
  const summary = parseLearnerPlanSummary(response);
  if (!summary) throw new Error("plan_summary_unavailable");
  return summary;
}

function stripeRedirectUrl(value: unknown, destination: "checkout" | "portal"): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const expectedHost = destination === "checkout" ? "checkout.stripe.com" : "billing.stripe.com";
    return url.protocol === "https:" && url.hostname === expectedHost ? url.toString() : null;
  } catch {
    return null;
  }
}

function removeCheckoutQuery(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("checkout");
  url.searchParams.delete("session_id");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
}

function freeAfterUnconfirmedRefresh(summary: LearnerPlanSummary): LearnerPlanSummary {
  if (summary.billingSource === "complimentary") return summary;
  return {
    ...summary,
    planTier: "free",
    messagesLimit: summary.freeDailyMessages,
    billingSource: "free",
    subscriptionPlan: null,
    subscriptionStatus: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  };
}

function usagePercent(used: number, limit: number): number {
  if (limit <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function PlanBenefit({ icon, title, detail }: { icon: "check" | "clock" | "roadmap"; title: string; detail?: string }) {
  const Icon = icon === "clock" ? Clock3 : icon === "roadmap" ? Sparkles : Check;
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-3.5 sm:p-4">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#A13F36] shadow-sm">
        <Icon aria-hidden="true" className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="break-words text-sm font-extrabold leading-5 text-primary">{title}</p>
        {detail && <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>}
      </div>
    </li>
  );
}

function UsageMeter({ summary }: { summary: LearnerPlanSummary }) {
  const percent = usagePercent(summary.messagesUsed, summary.messagesLimit);
  const valueText = t("learner.plan.usageCount", { used: summary.messagesUsed, limit: summary.messagesLimit });
  return (
    <div className="mt-5 rounded-2xl border border-white/15 bg-white/10 p-4 sm:p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.13em] text-white/75">{t("learner.plan.usageTitle")}</p>
        <p className="break-words text-sm font-extrabold leading-6 text-white">{valueText}</p>
      </div>
      <div
        role="progressbar"
        aria-label={t("learner.plan.usageTitle")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={valueText}
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/20"
      >
        <div className="h-full rounded-full bg-[#F2B5A8] transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs leading-5 text-white/75">{t("learner.plan.localDayNote")}</p>
    </div>
  );
}

const primaryActionClass = "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-extrabold text-white shadow-[0_12px_24px_-18px_rgba(30,58,138,0.8)] transition hover:bg-[#172D63] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60";
const secondaryActionClass = "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-primary/20 bg-white px-5 py-3 text-sm font-extrabold text-primary transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60";

export function LearnerPlanContent({
  summary,
  busyAction = null,
  notice = null,
  onCheckout = () => undefined,
  onRefresh = () => undefined,
  onManageBilling = () => undefined,
}: {
  summary: LearnerPlanSummary;
  busyAction?: LearnerPlanAction;
  notice?: LearnerPlanNotice | null;
  onCheckout?: (plan: SubscriptionPlan) => void;
  onRefresh?: () => void;
  onManageBilling?: () => void;
}) {
  const premium = summary.planTier === "premium";
  const paid = premium && summary.billingSource === "paid";
  const complimentary = premium && !paid;
  const planTitle = paid
    ? t(summary.subscriptionPlan === "premium_annual" ? "learner.plan.premiumAnnualTitle" : "learner.plan.premiumMonthlyTitle")
    : t(complimentary ? "learner.plan.premiumComplimentary" : "learner.plan.freeTitle");
  const hasBusyAction = busyAction !== null;
  const actionNoticeClass = notice?.tone === "error"
    ? "border-[#F0C5C0] bg-[#FFF4F1] text-[#8D342D]"
    : notice?.tone === "success"
      ? "border-[#B7D8C1] bg-[#F0F8F2] text-[#236646]"
      : "border-[#E9D7B2] bg-[#FFF9EC] text-[#805916]";
  const noticeRole = notice?.tone === "error" ? "alert" : "status";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-5"
    >
      <section className="overflow-hidden rounded-[1.75rem] border border-primary/10 bg-white shadow-[0_24px_66px_-48px_rgba(30,58,138,0.45)]">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#20376F] via-[#1B3269] to-[#14264F] p-5 text-white sm:p-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full border-[24px] border-white/5" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-20 h-40 w-40 rounded-full bg-[#E37B67]/15 blur-2xl" />
          <div className="relative">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-[#FFD7CE]">
                {premium ? <BadgeCheck aria-hidden="true" className="h-5 w-5" /> : <Sparkles aria-hidden="true" className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/70">{t("learner.plan.currentPlan")}</p>
                <h2 className="mt-1 break-words font-display text-xl font-extrabold leading-7 tracking-[-0.035em] sm:text-2xl">{planTitle}</h2>
                {paid && summary.currentPeriodEnd && (
                  <p className="mt-1 text-sm font-semibold leading-6 text-white/80">
                    {t(summary.cancelAtPeriodEnd ? "learner.plan.cancelsOn" : summary.subscriptionStatus === "trialing" ? "learner.plan.trialEndDate" : "learner.plan.renewalDate", { date: displayDate(summary.currentPeriodEnd) })}
                  </p>
                )}
              </div>
            </div>
            <UsageMeter summary={summary} />
          </div>
        </div>

        {premium ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6">
            <article className="rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4">
              <p className="text-xs font-bold leading-5 text-muted-foreground">{t("learner.plan.premiumDailyLabel")}</p>
              <p className="mt-1 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{summary.premiumDailyMessages}</p>
              <p className="text-xs text-muted-foreground">{t("learner.plan.messagesPerDay")}</p>
            </article>
            <article className="flex items-start gap-3 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#A13F36]"><Mic2 aria-hidden="true" className="h-4 w-4" /></span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold leading-5 text-primary">{t("learner.plan.voiceMinutes")}</p>
                <p className="mt-1 text-xs font-semibold text-[#A13F36]">{t("learner.plan.comingSoon")}</p>
              </div>
            </article>
          </div>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6">
            <article className="rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4">
              <p className="text-xs font-bold leading-5 text-muted-foreground">{t("learner.plan.freeDailyLabel")}</p>
              <p className="mt-1 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{summary.freeDailyMessages}</p>
              <p className="text-xs text-muted-foreground">{t("learner.plan.messagesPerDay")}</p>
            </article>
            <article className="rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4">
              <p className="text-xs font-bold leading-5 text-muted-foreground">{t("learner.plan.premiumDailyLabel")}</p>
              <p className="mt-1 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{summary.premiumDailyMessages}</p>
              <p className="text-xs text-muted-foreground">{t("learner.plan.messagesPerDay")}</p>
            </article>
          </div>
        )}
      </section>

      {premium ? (
        <section className="rounded-[1.75rem] border border-primary/10 bg-white p-5 shadow-[0_18px_50px_-42px_rgba(30,58,138,0.38)] sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F4EC] text-[#236646]"><MessageCircle aria-hidden="true" className="h-4 w-4" /></span>
            <div className="min-w-0">
              <h3 className="font-display text-lg font-extrabold leading-6 text-primary">{t("learner.plan.includedHeading")}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("learner.plan.premiumIntro")}</p>
            </div>
          </div>
          <ul className="mt-4 space-y-2.5">
            <PlanBenefit icon="check" title={t("learner.plan.premiumMessagesBenefit", { limit: summary.premiumDailyMessages })} />
            <PlanBenefit icon="clock" title={t("learner.plan.voiceMinutes")} detail={t("learner.plan.comingSoon")} />
            <PlanBenefit icon="roadmap" title={t("learner.plan.roadmapBenefit")} />
          </ul>

          {paid && (
            <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
              <button type="button" onClick={onRefresh} disabled={hasBusyAction} className={secondaryActionClass}>
                <RefreshCw aria-hidden="true" className={`h-4 w-4 ${busyAction === "refresh" ? "animate-spin" : ""}`} />
                <span>{busyAction === "refresh" ? t("learner.plan.refreshing") : t("learner.plan.refreshMyPlan")}</span>
              </button>
              <button type="button" onClick={onManageBilling} disabled={hasBusyAction} className={primaryActionClass}>
                <CreditCard aria-hidden="true" className="h-4 w-4" />
                <span>{busyAction === "portal" ? t("learner.plan.openingBilling") : t("learner.plan.manageBilling")}</span>
              </button>
            </div>
          )}
          {notice && (
            <p role={noticeRole} aria-live="polite" aria-atomic="true" className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold leading-6 ${actionNoticeClass}`}>
              {notice.message}
            </p>
          )}
        </section>
      ) : (
        <section className="rounded-[1.75rem] border border-[#E7B8AE] bg-white p-5 shadow-[0_18px_50px_-42px_rgba(30,58,138,0.38)] sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EC] text-[#A13F36]"><Sparkles aria-hidden="true" className="h-4 w-4" /></span>
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#A13F36]">{t("learner.plan.upgradeEyebrow")}</p>
                <h3 className="mt-1 font-display text-xl font-extrabold leading-6 text-primary">{t("learner.plan.premiumHeading")}</h3>
              </div>
            </div>
            <span className="self-start rounded-full bg-[#FFF0EC] px-3 py-1.5 text-xs font-extrabold text-[#8D342D]">{t("learner.plan.savings")}</span>
          </div>

          <div className="mt-4 grid gap-2 rounded-2xl bg-[#FAF9F5] p-4 sm:grid-cols-2">
            <p className="text-sm font-extrabold text-primary">{t("learner.plan.monthlyPrice")}</p>
            <p className="text-sm font-extrabold text-primary sm:text-right">{t("learner.plan.annualPrice")}</p>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">{t("learner.plan.premiumIntro")}</p>
          <ul className="mt-4 space-y-2.5">
            <PlanBenefit icon="check" title={t("learner.plan.premiumMessagesBenefit", { limit: summary.premiumDailyMessages })} />
            <PlanBenefit icon="clock" title={t("learner.plan.voiceMinutes")} detail={t("learner.plan.comingSoon")} />
            <PlanBenefit icon="roadmap" title={t("learner.plan.roadmapBenefit")} />
          </ul>

          <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
            <button type="button" onClick={() => onCheckout("premium_monthly")} disabled={hasBusyAction} className={primaryActionClass}>
              <span>{busyAction === "monthly" ? t("learner.plan.openingCheckout") : t("learner.plan.chooseMonthly")}</span><ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => onCheckout("premium_annual")} disabled={hasBusyAction} className={secondaryActionClass}>
              <span>{busyAction === "annual" ? t("learner.plan.openingCheckout") : t("learner.plan.chooseAnnual")}</span><ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          <button type="button" onClick={onRefresh} disabled={hasBusyAction} className={`${secondaryActionClass} mt-2.5 w-full`}>
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${busyAction === "refresh" ? "animate-spin" : ""}`} />
            <span>{busyAction === "refresh" ? t("learner.plan.refreshing") : t("learner.plan.refreshMyPlan")}</span>
          </button>
          {notice && (
            <p role={noticeRole} aria-live="polite" aria-atomic="true" className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold leading-6 ${actionNoticeClass}`}>
              {notice.message}
            </p>
          )}
        </section>
      )}
      {complimentary && null}
    </motion.div>
  );
}

export default function LearnerPlan() {
  const [summary, setSummary] = useState<LearnerPlanSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyAction, setBusyAction] = useState<LearnerPlanAction>(null);
  const [notice, setNotice] = useState<LearnerPlanNotice | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setSummary(null);
    setLoadError(false);
    setLoading(true);

    void (async () => {
      let checkoutVerified = false;
      let checkoutAttempted = false;
      let checkoutWasCancelled = false;
      const params = new URLSearchParams(window.location.search);
      const checkout = params.get("checkout");
      const sessionId = params.get("session_id");

      if (checkout === "success") {
        checkoutAttempted = true;
        if (!sessionId) {
          if (active) setNotice({ tone: "error", message: t("learner.plan.checkoutConfirmError") });
        } else {
          if (active) setBusyAction("return");
          try {
            const response = servicePayload(await parleAssessmentService({ action: "billing_refresh", session_id: sessionId }));
            if (response.verified_checkout !== true) {
              const error = new Error("checkout_subscription_not_verified") as Error & { code?: string };
              error.code = "checkout_subscription_not_verified";
              throw error;
            }
            checkoutVerified = true;
            removeCheckoutQuery();
          } catch (error) {
            if (active) setNotice({ tone: "error", message: t(messageKeyForBillingError(error, "learner.plan.checkoutConfirmError")) });
          } finally {
            if (active) setBusyAction(null);
          }
        }
      } else if (checkout === "cancelled") {
        checkoutWasCancelled = true;
        removeCheckoutQuery();
      }

      try {
        const nextSummary = await fetchPlanSummary();
        if (!active) return;
        setSummary(nextSummary);
        if (checkoutWasCancelled) setNotice({ tone: "info", message: t("learner.plan.checkoutCancelled") });
        else if (checkoutVerified) {
          setNotice({
            tone: nextSummary.billingSource === "paid" ? "success" : "info",
            message: t(nextSummary.billingSource === "paid" ? "learner.plan.checkoutSuccess" : "learner.plan.checkoutNotActive"),
          });
        } else if (checkoutAttempted && !sessionId) {
          setNotice({ tone: "error", message: t("learner.plan.checkoutConfirmError") });
        }
      } catch (error) {
        console.error("Learner plan summary could not be loaded", error instanceof Error ? error.name : "unknown");
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [retry]);

  async function startCheckout(plan: SubscriptionPlan): Promise<void> {
    const action = plan === "premium_monthly" ? "monthly" : "annual";
    setBusyAction(action);
    setNotice(null);
    try {
      const response = servicePayload(await parleAssessmentService({ action: "billing_checkout", plan }));
      const url = stripeRedirectUrl(response.url, "checkout");
      if (!url) throw new Error("checkout_url_unavailable");
      window.location.assign(url);
    } catch (error) {
      setNotice({ tone: "error", message: t(checkoutFailureTranslationKey(error)) });
      setBusyAction(null);
    }
  }

  async function refreshPlan(): Promise<void> {
    setBusyAction("refresh");
    setNotice(null);
    try {
      const response = servicePayload(await parleAssessmentService({ action: "billing_refresh" }));
      if (response.status !== "complete") throw new Error("billing_confirmation_failed");
      const nextSummary = await fetchPlanSummary();
      const confirmed = response.confirmed === true;
      const displaySummary = confirmed ? nextSummary : freeAfterUnconfirmedRefresh(nextSummary);
      setSummary(displaySummary);
      setNotice({
        tone: confirmed ? "success" : "info",
        message: t(!confirmed ? "learner.plan.refreshUnconfirmed" : displaySummary.planTier === "premium" ? "learner.plan.refreshSuccess" : "learner.plan.refreshFree"),
      });
    } catch (error) {
      setNotice({ tone: "error", message: t(messageKeyForBillingError(error, "learner.plan.billingError")) });
    } finally {
      setBusyAction(null);
    }
  }

  async function manageBilling(): Promise<void> {
    setBusyAction("portal");
    setNotice(null);
    try {
      const response = servicePayload(await parleAssessmentService({ action: "billing_portal" }));
      const url = stripeRedirectUrl(response.url, "portal");
      if (!url) throw new Error("billing_portal_unavailable");
      window.location.assign(url);
    } catch (error) {
      setNotice({ tone: "error", message: t(messageKeyForBillingError(error, "learner.plan.billingError")) });
      setBusyAction(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{t("learner.plan.intro")}</p>
        <Link to="/learner/ai-tutor" className="inline-flex min-h-10 shrink-0 items-center gap-2 self-start rounded-full border border-primary/15 bg-white px-4 py-2 text-xs font-extrabold text-primary transition hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:self-auto">
          <span>{t("learner.plan.backToTutor")}</span><ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>

      {busyAction === "return" && (
        <section role="status" aria-live="polite" className="rounded-[1.75rem] border border-primary/10 bg-white p-5 text-sm font-semibold text-muted-foreground shadow-sm">
          {t("learner.plan.checkoutLoading")}
        </section>
      )}

      {loading && (
        <section role="status" aria-live="polite" className="rounded-[1.75rem] border border-primary/10 bg-white p-6 text-sm font-semibold text-muted-foreground shadow-sm">
          {t("learner.plan.loading")}
        </section>
      )}

      {!loading && loadError && (
        <section role="alert" className="rounded-[1.75rem] border border-[#F0C5C0] bg-white p-5 shadow-sm sm:p-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0EC] text-[#A13F36]"><CircleAlert aria-hidden="true" className="h-5 w-5" /></span>
          <h2 className="mt-4 font-display text-lg font-extrabold text-primary">{t("learner.plan.errorTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("learner.plan.errorBody")}</p>
          {notice && <p className="mt-3 text-sm font-bold text-[#8D342D]">{notice.message}</p>}
          <button type="button" onClick={() => setRetry((value) => value + 1)} className={`${primaryActionClass} mt-4`}>
            {t("learner.plan.tryAgain")}
          </button>
        </section>
      )}

      {!loading && !loadError && summary && (
        <LearnerPlanContent
          summary={summary}
          busyAction={busyAction}
          notice={notice}
          onCheckout={startCheckout}
          onRefresh={refreshPlan}
          onManageBilling={manageBilling}
        />
      )}
    </div>
  );
}
