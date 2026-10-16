import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { stripeClient } from "../stripe-sync.ts";
import { checkoutSessionParams, type CheckoutInput } from "./checkout-params.ts";
import { connectAccountKey, transferAmount } from "../payouts/rules.ts";

/** Stripe could not be reached or refused: callers stop and ask the person to try again (spec section 5). */
export class PaymentsUnavailable extends Error {
  constructor(message: string) { super(message); this.name = "PaymentsUnavailable"; }
}

export type CheckoutSession = {
  id: string; url: string; status: "open" | "complete" | "expired"; paymentStatus: string;
  paymentIntentId: string | null; amountTotal: number | null; bookingId: string | null;
};
export type { CheckoutInput };
export type RefundInput = { paymentIntentId: string; amountCents: number; idempotencyKey: string; bookingId: string; reason: string };
/** A tutor's Stripe Connect Express account, as Parle keeps it (spec section 7). */
export type ConnectAccount = { id: string; country: string; payoutsEnabled: boolean; detailsSubmitted: boolean; disabledReason: string };
export type TransferInput = { payoutId: string; attempt: number; accountId: string; amountCents: number; sourceCharge: string | null; chargeCurrency: string; bookingId: string };
/** What a transfer sent: CAD, the share converted at Stripe's rate when the payment was in another currency (decision #55). */
export type TransferResult = { id: string; amountCents: number; currency: string };
export type ReversalInput = { transferId: string; amountCents: number; idempotencyKey: string; payoutId: string };

/** Everything lesson and payout code asks of Stripe. Tests use the fake (function setting STRIPE_PROVIDER=fake): no network. */
export interface LessonPayments {
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  getCheckout(id: string): Promise<CheckoutSession>;
  expireCheckout(id: string): Promise<void>;
  refund(input: RefundInput): Promise<{ id: string }>;
  /** A refund already made on this payment for this booking and reason (its answer may have been lost), or null. */
  findRefund(paymentIntentId: string, bookingId: string, reason: string): Promise<{ id: string; amountCents: number } | null>;
  /** Parle's own (platform) country: a tutor in another country gets Stripe's "recipient" agreement (cross-border). */
  platformCountry(): Promise<string>;
  createConnectAccount(input: { tutorId: string; email: string; country: string; recipient: boolean }): Promise<ConnectAccount>;
  getConnectAccount(id: string): Promise<ConnectAccount>;
  onboardingLink(input: { accountId: string; refreshUrl: string; returnUrl: string }): Promise<string>;
  dashboardLink(accountId: string): Promise<string>;
  chargeIdFor(paymentIntentId: string): Promise<string | null>;
  transfer(input: TransferInput): Promise<TransferResult>;
  /** A transfer already made for this payout (its answer may have been lost), found by transfer group. */
  findTransfer(payoutId: string): Promise<TransferResult | null>;
  /** totalReversedCents: everything reversed on that transfer so far, as Stripe reports it. */
  reverseTransfer(input: ReversalInput): Promise<{ id: string; totalReversedCents: number }>;
}

function toSession(s: Record<string, any>): CheckoutSession {
  const status = s.status === "complete" || s.status === "expired" ? s.status : "open";
  return {
    id: String(s.id), url: String(s.url ?? ""), status, paymentStatus: String(s.payment_status ?? "unpaid"),
    paymentIntentId: typeof s.payment_intent === "string" ? s.payment_intent : typeof s.payment_intent?.id === "string" ? s.payment_intent.id : null,
    amountTotal: Number.isInteger(s.amount_total) ? s.amount_total : null,
    bookingId: typeof s.metadata?.booking_id === "string" ? s.metadata.booking_id : typeof s.booking_id === "string" ? s.booking_id : null,
  };
}

/** Stripe's account object (an API answer or an account.updated event) in Parle's shape. */
export function toConnectAccount(a: Record<string, any>): ConnectAccount {
  return {
    id: String(a.id ?? ""), country: String(a.country ?? "").toUpperCase(), payoutsEnabled: a.payouts_enabled === true,
    detailsSubmitted: a.details_submitted === true, disabledReason: String(a.requirements?.disabled_reason ?? ""),
  };
}

function realPayments(key: string): LessonPayments {
  const stripe = stripeClient(key);
  const guard = async <T>(run: () => Promise<T>): Promise<T> => {
    try { return await run(); } catch (e) { throw new PaymentsUnavailable((e as Error).message); }
  };
  return {
    createCheckout: (i) => guard(async () => toSession(await stripe.checkout.sessions.create(checkoutSessionParams(i) as any, { idempotencyKey: `lesson-checkout:${i.bookingId}` }) as unknown as Record<string, any>)),
    getCheckout: (id) => guard(async () => toSession(await stripe.checkout.sessions.retrieve(id) as unknown as Record<string, any>)),
    expireCheckout: (id) => guard(async () => { await stripe.checkout.sessions.expire(id); }),
    refund: (i) => guard(async () => {
      const r = await stripe.refunds.create({ payment_intent: i.paymentIntentId, amount: i.amountCents, metadata: { booking_id: i.bookingId, reason: i.reason } }, { idempotencyKey: i.idempotencyKey });
      return { id: r.id };
    }),
    findRefund: (pi, bookingId, reason) => guard(async () => {
      const list = await stripe.refunds.list({ payment_intent: pi, limit: 100 });
      const r = list.data.find((x) => x.metadata?.booking_id === bookingId && x.metadata?.reason === reason && x.status !== "failed" && x.status !== "canceled");
      return r ? { id: r.id, amountCents: r.amount } : null;
    }),
    platformCountry: () => guard(async () => String(((await (stripe.accounts as any).retrieve()) as Record<string, any>).country ?? "").toUpperCase()),
    createConnectAccount: (i) => guard(async () => toConnectAccount(await stripe.accounts.create({
      type: "express", country: i.country, email: i.email, business_type: "individual",
      capabilities: { transfers: { requested: true } },
      ...(i.recipient ? { tos_acceptance: { service_agreement: "recipient" } } : {}),
      metadata: { kind: "tutor_payouts", tutor_id: i.tutorId },
    } as any, { idempotencyKey: connectAccountKey(i.tutorId, new Date()) }) as unknown as Record<string, any>)),
    getConnectAccount: (id) => guard(async () => toConnectAccount(await stripe.accounts.retrieve(id) as unknown as Record<string, any>)),
    onboardingLink: (i) => guard(async () => (await stripe.accountLinks.create({ account: i.accountId, refresh_url: i.refreshUrl, return_url: i.returnUrl, type: "account_onboarding" })).url),
    dashboardLink: (id) => guard(async () => (await stripe.accounts.createLoginLink(id)).url),
    chargeIdFor: (pi) => guard(async () => {
      const intent = await stripe.paymentIntents.retrieve(pi) as unknown as Record<string, any>;
      return typeof intent.latest_charge === "string" ? intent.latest_charge : typeof intent.latest_charge?.id === "string" ? intent.latest_charge.id : null;
    }),
    transfer: (i) => guard(async () => {
      // a transfer from a payment must be in the currency that payment settled in (Stripe refuses USD from CAD)
      let send = { currency: "cad", amountCents: i.amountCents };
      if (i.sourceCharge) {
        const charge = await stripe.charges.retrieve(i.sourceCharge, { expand: ["balance_transaction"] }) as unknown as Record<string, any>;
        const bt = charge.balance_transaction ?? {};
        send = transferAmount({ shareCents: i.amountCents, chargeCurrency: String(charge.currency), settlementCurrency: String(bt.currency ?? charge.currency), exchangeRate: typeof bt.exchange_rate === "number" ? bt.exchange_rate : null });
      }
      const t = await stripe.transfers.create({
        amount: send.amountCents, currency: send.currency, destination: i.accountId, transfer_group: `payout-${i.payoutId}`,
        ...(i.sourceCharge ? { source_transaction: i.sourceCharge } : {}),
        metadata: { kind: "lesson_payout", payout_id: i.payoutId, booking_id: i.bookingId },
      }, { idempotencyKey: `payout-transfer:${i.payoutId}:${i.attempt}` });
      return { id: t.id, amountCents: t.amount, currency: t.currency };
    }),
    findTransfer: (payoutId) => guard(async () => {
      const list = await stripe.transfers.list({ transfer_group: `payout-${payoutId}`, limit: 1 });
      const t = list.data[0];
      return t ? { id: t.id, amountCents: t.amount, currency: t.currency } : null;
    }),
    reverseTransfer: (i) => guard(async () => {
      const r = await stripe.transfers.createReversal(i.transferId, { amount: i.amountCents, metadata: { payout_id: i.payoutId } }, { idempotencyKey: i.idempotencyKey });
      const t = await stripe.transfers.retrieve(i.transferId);
      return { id: r.id, totalReversedCents: t.amount_reversed };
    }),
  };
}

async function sha(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

/** Local tests only: Stripe objects are rows in stripe_test_object; stripe_test_fail makes the next call fail. */
function fakePayments(db: SupabaseClient): LessonPayments {
  const failIfAsked = async (operation: string) => {
    const { data } = await db.rpc("pop_stripe_test_failure", { p_operation: operation });
    if (data === true) throw new PaymentsUnavailable(`fake ${operation} failure`);
  };
  const read = async (id: string) => {
    const { data, error } = await db.from("stripe_test_object").select("id, data").eq("id", id).maybeSingle();
    if (error || !data) throw new PaymentsUnavailable(`fake object ${id} not found`);
    return { id: data.id, ...(data.data as Record<string, unknown>) };
  };
  const keep = async (id: string, kind: string, data: Record<string, unknown>) => {
    const { error } = await db.from("stripe_test_object").upsert({ id, kind, data }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new PaymentsUnavailable(error.message);
  };
  return {
    async createCheckout(i) {
      await failIfAsked("checkout");
      const { data: existing } = await db.from("stripe_test_object").select("id").eq("kind", "checkout").eq("data->>booking_id", i.bookingId).maybeSingle();
      if (existing) return toSession(await read(existing.id)); // the idempotency key's effect
      const id = `cs_test_fake_${crypto.randomUUID().replaceAll("-", "")}`;
      const data = { url: `https://checkout.stripe.com/c/pay/${id}`, status: "open", payment_status: "unpaid", payment_intent: null, amount_total: i.amountCents, booking_id: i.bookingId, expires_at: i.expiresAt, success_url: i.successUrl, cancel_url: i.cancelUrl };
      await keep(id, "checkout", data);
      return toSession({ id, ...data });
    },
    async getCheckout(id) {
      await failIfAsked("retrieve");
      return toSession(await read(id));
    },
    async expireCheckout(id) {
      await failIfAsked("expire");
      const row = await read(id);
      if (row.status === "open") await db.from("stripe_test_object").update({ data: { ...row, id: undefined, status: "expired" } }).eq("id", id);
    },
    async refund(i) {
      // Like Stripe: a refusal is stored for its idempotency key and replayed for 24 h (Plan 8 review, Important 1)
      const refused = `refund_refused_${await sha(i.idempotencyKey)}`;
      const { data: replay } = await db.from("stripe_test_object").select("id").eq("id", refused).maybeSingle();
      if (replay) throw new PaymentsUnavailable("fake refund refused (replayed for this idempotency key)");
      const { data: refuse } = await db.rpc("pop_stripe_test_failure", { p_operation: "refund_refused" });
      if (refuse === true) {
        await keep(refused, "refund_refused", { key: i.idempotencyKey });
        throw new PaymentsUnavailable("fake refund refused");
      }
      await failIfAsked("refund");
      const id = `re_fake_${await sha(i.idempotencyKey)}`;
      await keep(id, "refund", { payment_intent: i.paymentIntentId, amount: i.amountCents, booking_id: i.bookingId, reason: i.reason });
      return { id };
    },
    async findRefund(pi, bookingId, reason) {
      const { data } = await db.from("stripe_test_object").select("id, data").eq("kind", "refund").eq("data->>payment_intent", pi).eq("data->>booking_id", bookingId).eq("data->>reason", reason).limit(1);
      const r = data?.[0] as { id: string; data: Record<string, any> } | undefined;
      return r ? { id: r.id, amountCents: Number(r.data.amount ?? 0) } : null;
    },
    async platformCountry() {
      return "CA";
    },
    async createConnectAccount(i) {
      await failIfAsked("account");
      const id = `acct_fake_${await sha(`connect-account:${i.tutorId}`)}`;
      await keep(id, "account", { country: i.country, email: i.email, recipient: i.recipient, tutor_id: i.tutorId, payouts_enabled: false, details_submitted: false, requirements: { disabled_reason: "requirements.past_due" } });
      return toConnectAccount(await read(id));
    },
    async getConnectAccount(id) {
      await failIfAsked("account");
      return toConnectAccount(await read(id));
    },
    async onboardingLink(i) {
      await failIfAsked("account_link");
      return `https://connect.stripe.com/setup/e/${i.accountId}/fake`;
    },
    async dashboardLink(accountId) {
      await failIfAsked("account_link");
      return `https://connect.stripe.com/express/${accountId}/fake`;
    },
    async chargeIdFor(pi) {
      return `ch_fake_${pi.slice(-16)}`;
    },
    async transfer(i) {
      await failIfAsked("transfer");
      const id = `tr_fake_${await sha(`payout-transfer:${i.payoutId}:${i.attempt}`)}`;
      // the fake settles every payment in CAD; a non-CAD payment converts at a fixed test rate of 1.4
      const send = transferAmount({ shareCents: i.amountCents, chargeCurrency: i.chargeCurrency, settlementCurrency: "cad", exchangeRate: 1.4 });
      await keep(id, "transfer", { payout_id: i.payoutId, booking_id: i.bookingId, destination: i.accountId, amount: send.amountCents, currency: send.currency, source_transaction: i.sourceCharge, transfer_group: `payout-${i.payoutId}` });
      await failIfAsked("transfer_lost"); // Stripe made the transfer, but its answer never arrived
      return { id, ...send };
    },
    async findTransfer(payoutId) {
      await failIfAsked("retrieve");
      const { data } = await db.from("stripe_test_object").select("id, data").eq("kind", "transfer").eq("data->>payout_id", payoutId).limit(1);
      const t = data?.[0] as { id: string; data: Record<string, any> } | undefined;
      return t ? { id: t.id, amountCents: Number(t.data.amount ?? 0), currency: String(t.data.currency ?? "cad") } : null;
    },
    async reverseTransfer(i) {
      await failIfAsked("reversal");
      const id = `trr_fake_${await sha(i.idempotencyKey)}`;
      await keep(id, "reversal", { transfer: i.transferId, amount: i.amountCents, payout_id: i.payoutId });
      const { data } = await db.from("stripe_test_object").select("data").eq("kind", "reversal").eq("data->>transfer", i.transferId);
      return { id, totalReversedCents: (data ?? []).reduce((sum: number, r: any) => sum + Number(r.data.amount ?? 0), 0) };
    },
  };
}

/** Stripe in test mode only (sandbox key), or the local fake. Anything else refuses every call. */
export function lessonPayments(db: SupabaseClient): LessonPayments {
  if ((Deno.env.get("STRIPE_PROVIDER") ?? "") === "fake") return fakePayments(db);
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (key.startsWith("sk_test_")) return realPayments(key);
  const refuse = async (): Promise<never> => { throw new PaymentsUnavailable("STRIPE_NOT_CONFIGURED"); };
  return {
    createCheckout: refuse, getCheckout: refuse, expireCheckout: refuse, refund: refuse, platformCountry: refuse, createConnectAccount: refuse,
    getConnectAccount: refuse, onboardingLink: refuse, dashboardLink: refuse, chargeIdFor: refuse, transfer: refuse, findTransfer: refuse, reverseTransfer: refuse,
  };
}
