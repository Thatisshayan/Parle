import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { stripeClient } from "../stripe-sync.ts";

/** Stripe could not be reached or refused: callers stop and ask the person to try again (spec section 5). */
export class PaymentsUnavailable extends Error {
  constructor(message: string) { super(message); this.name = "PaymentsUnavailable"; }
}

export type CheckoutSession = {
  id: string; url: string; status: "open" | "complete" | "expired"; paymentStatus: string;
  paymentIntentId: string | null; amountTotal: number | null; bookingId: string | null;
};
export type CheckoutInput = { bookingId: string; amountCents: number; description: string; customerEmail: string; expiresAt: number; successUrl: string; cancelUrl: string };
export type RefundInput = { paymentIntentId: string; amountCents: number; idempotencyKey: string; bookingId: string; reason: string };

/** Everything lesson code asks of Stripe. Tests use the fake (function setting STRIPE_PROVIDER=fake): no network. */
export interface LessonPayments {
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  getCheckout(id: string): Promise<CheckoutSession>;
  expireCheckout(id: string): Promise<void>;
  refund(input: RefundInput): Promise<{ id: string }>;
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

function realPayments(key: string): LessonPayments {
  const stripe = stripeClient(key);
  const guard = async <T>(run: () => Promise<T>): Promise<T> => {
    try { return await run(); } catch (e) { throw new PaymentsUnavailable((e as Error).message); }
  };
  return {
    createCheckout: (i) => guard(async () => toSession(await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: i.customerEmail,
      line_items: [{ price_data: { currency: "usd", unit_amount: i.amountCents, product_data: { name: i.description } }, quantity: 1 }],
      metadata: { kind: "lesson", booking_id: i.bookingId },
      payment_intent_data: { metadata: { kind: "lesson", booking_id: i.bookingId } },
      expires_at: i.expiresAt,
      success_url: i.successUrl,
      cancel_url: i.cancelUrl,
    }, { idempotencyKey: `lesson-checkout:${i.bookingId}` }) as unknown as Record<string, any>)),
    getCheckout: (id) => guard(async () => toSession(await stripe.checkout.sessions.retrieve(id) as unknown as Record<string, any>)),
    expireCheckout: (id) => guard(async () => { await stripe.checkout.sessions.expire(id); }),
    refund: (i) => guard(async () => {
      const r = await stripe.refunds.create({ payment_intent: i.paymentIntentId, amount: i.amountCents, metadata: { booking_id: i.bookingId, reason: i.reason } }, { idempotencyKey: i.idempotencyKey });
      return { id: r.id };
    }),
  };
}

async function sha(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

/** Local tests only: Checkout pages and refunds are rows in stripe_test_object; stripe_test_fail makes the next call fail. */
function fakePayments(db: SupabaseClient): LessonPayments {
  const failIfAsked = async (operation: string) => {
    const { data } = await db.rpc("pop_stripe_test_failure", { p_operation: operation });
    if (data === true) throw new PaymentsUnavailable(`fake ${operation} failure`);
  };
  const read = async (id: string) => {
    const { data, error } = await db.from("stripe_test_object").select("id, data").eq("id", id).maybeSingle();
    if (error || !data) throw new PaymentsUnavailable(`fake session ${id} not found`);
    return { id: data.id, ...(data.data as Record<string, unknown>) };
  };
  return {
    async createCheckout(i) {
      await failIfAsked("checkout");
      const { data: existing } = await db.from("stripe_test_object").select("id").eq("kind", "checkout").eq("data->>booking_id", i.bookingId).maybeSingle();
      if (existing) return toSession(await read(existing.id)); // the idempotency key's effect
      const id = `cs_test_fake_${crypto.randomUUID().replaceAll("-", "")}`;
      const data = { url: `https://checkout.stripe.com/c/pay/${id}`, status: "open", payment_status: "unpaid", payment_intent: null, amount_total: i.amountCents, booking_id: i.bookingId, expires_at: i.expiresAt, success_url: i.successUrl, cancel_url: i.cancelUrl };
      const { error } = await db.from("stripe_test_object").insert({ id, kind: "checkout", data });
      if (error) throw new PaymentsUnavailable(error.message);
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
      await failIfAsked("refund");
      const id = `re_fake_${await sha(i.idempotencyKey)}`;
      await db.from("stripe_test_object").upsert({ id, kind: "refund", data: { payment_intent: i.paymentIntentId, amount: i.amountCents, booking_id: i.bookingId, reason: i.reason } }, { onConflict: "id", ignoreDuplicates: true });
      return { id };
    },
  };
}

/** Stripe in test mode only (sandbox key), or the local fake. Anything else refuses every call. */
export function lessonPayments(db: SupabaseClient): LessonPayments {
  if ((Deno.env.get("STRIPE_PROVIDER") ?? "") === "fake") return fakePayments(db);
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (key.startsWith("sk_test_")) return realPayments(key);
  const refuse = async (): Promise<never> => { throw new PaymentsUnavailable("STRIPE_NOT_CONFIGURED"); };
  return { createCheckout: refuse, getCheckout: refuse, expireCheckout: refuse, refund: refuse };
}
