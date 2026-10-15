// GENERATED from parle-app/functions/parle-billing-checkout.helper.ts by scripts/sync-app-code.ts. Do not edit.
import {
  isPremiumSubscriptionPlan,
  isStripeSubscriptionOwnedByLearner,
  isStripeTestKey,
  stripeObjectId,
} from "./parle-stripe-subscription.logic.helper.ts";
import { lookupPremiumStatus, readLearnerSubscriberRecords } from "./parle-premium-status.helper.ts";

export type BillingUser = { id: string; email: string; role?: string };
export type StripeRuntime = { stripe: any | null; secret: string | null };
export type BillingDenialCategory =
  | "account_not_eligible"
  | "learner_identity_not_found"
  | "learner_identity_lookup_failed";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordsFromResponse(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isObject);
  if (isObject(value) && Array.isArray(value.data)) return value.data.filter(isObject);
  throw new Error("Unexpected owner-scoped learner identity response.");
}

function jsonResponse(body: Record<string, unknown>, status: number, origin: string | null): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export function billingFailure(status: number, code: string, origin: string | null): Response {
  return jsonResponse({ error_code: code }, status, origin);
}

export function billingOriginForRequest(request: Request): string | null {
  const originHeader = request.headers.get("Origin");
  if (!originHeader) return null;
  // On our backend the app's own addresses are listed in APP_ORIGINS (backend Plan 3); only they may receive the
  // Stripe return. Without the setting, Buildy's rule below applies.
  const configured = ((globalThis as any).Deno?.env?.get?.("APP_ORIGINS") ?? "") as string;
  if (configured.trim()) {
    const allowed = configured.split(",").map((value) => value.trim()).filter(Boolean);
    return allowed.includes(originHeader) ? originHeader : null;
  }
  try {
    const origin = new URL(originHeader);
    if (origin.protocol !== "https:" || origin.origin !== originHeader || origin.username || origin.password) return null;
    const refererHeader = request.headers.get("Referer");
    if (refererHeader) {
      const referer = new URL(refererHeader);
      if (referer.protocol !== "https:" || referer.origin !== origin.origin) return null;
    }
    return origin.origin;
  } catch {
    return null;
  }
}

function safeBillingAction(value: unknown): string {
  if (value === "billing_checkout" || value === "billing_refresh" || value === "billing_portal") return value;
  return "billing_other";
}

export function logBillingDenial(action: unknown, category: BillingDenialCategory): void {
  console.warn("Parle billing request denied", {
    action: safeBillingAction(action),
    category,
  });
}

export function billingDenialResponse(
  action: unknown,
  category: BillingDenialCategory,
  origin: string | null,
): Response {
  logBillingDenial(action, category);
  return billingFailure(403, "billing_not_allowed", origin);
}

/** Find a caller-owned learner identity, rather than trusting the first same-owner role row. */
export async function findOwnedBillingLearnerIdentity(
  client: any,
  user: BillingUser,
): Promise<Record<string, unknown> | null> {
  const filter = client?.entities?.ParleIdentity?.filter;
  if (typeof filter !== "function") throw new Error("Learner identity lookup is unavailable.");
  const response = await filter.call(
    client.entities.ParleIdentity,
    { created_by: user.email, role: "learner" },
    "created_at",
    100,
  );
  return recordsFromResponse(response).find((identity) =>
    typeof identity.id === "string" && identity.id.trim().length > 0 &&
    identity.created_by === user.email &&
    identity.role === "learner"
  ) ?? null;
}

function stripeObjectMetadata(value: unknown): Record<string, unknown> {
  return isObject(value) && isObject(value.metadata) ? value.metadata : {};
}

async function findOwnedStripeCustomers(client: any, user: BillingUser, stripe: any): Promise<any[]> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(user.id)) throw new Error("The learner account ID could not be verified for billing.");
  const records = await readLearnerSubscriberRecords(client, user.id, user.email);
  const customers = new Map<string, any>();
  const savedIds = [...new Set(records.map((record) => typeof record.stripe_customer_id === "string" ? record.stripe_customer_id.trim() : "").filter(Boolean))];
  for (const id of savedIds) {
    const customer = await stripe.customers.retrieve(id);
    if (isObject(customer) && customer.deleted !== true && stripeObjectId(customer.id) && stripeObjectMetadata(customer).user_id === user.id) {
      customers.set(String(customer.id), customer);
    }
  }
  const search = await stripe.customers.search({ query: `metadata['user_id']:'${user.id}'`, limit: 100 });
  if (!isObject(search) || !Array.isArray(search.data) || search.has_more === true) {
    throw new Error("The learner's existing Stripe customers could not be checked completely.");
  }
  for (const customer of search.data) {
    if (isObject(customer) && customer.deleted !== true && stripeObjectId(customer.id) && stripeObjectMetadata(customer).user_id === user.id) {
      customers.set(String(customer.id), customer);
    }
  }
  return [...customers.values()];
}

async function hasExistingActiveStripeSubscription(customer: any, userId: string, stripe: any): Promise<boolean> {
  const customerId = stripeObjectId(customer?.id);
  if (!customerId || stripeObjectMetadata(customer).user_id !== userId) return false;
  const page = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  if (!isObject(page) || !Array.isArray(page.data) || page.has_more === true) {
    throw new Error("The learner's existing Stripe subscriptions could not be checked completely.");
  }
  return page.data.some((subscription) =>
    isObject(subscription) &&
    (subscription.status === "active" || subscription.status === "trialing") &&
    isStripeSubscriptionOwnedByLearner(subscription, customer, userId)
  );
}

export async function startLearnerBillingCheckout(input: {
  request: Request;
  client: any;
  user: BillingUser;
  body: Record<string, unknown>;
  origin: string | null;
  runtime: StripeRuntime | null;
}): Promise<Response> {
  const requestOrigin = billingOriginForRequest(input.request);
  if (!requestOrigin) return billingFailure(400, "invalid_billing_origin", input.origin);
  const { user, client, body, runtime } = input;

  if (!user?.id || !user?.email || user.role === "administrator") {
    return billingDenialResponse(body.action, "account_not_eligible", requestOrigin);
  }

  let identity: Record<string, unknown> | null;
  try {
    identity = await findOwnedBillingLearnerIdentity(client, user);
  } catch {
    logBillingDenial(body.action, "learner_identity_lookup_failed");
    return billingFailure(503, "billing_not_configured", requestOrigin);
  }
  if (!identity) return billingDenialResponse(body.action, "learner_identity_not_found", requestOrigin);
  if (body.action !== "billing_checkout") return billingFailure(400, "unsupported_billing_action", requestOrigin);
  if (lookupPremiumStatus(identity, user.email).premium) return billingFailure(409, "complimentary_plan_no_billing", requestOrigin);

  if (!runtime?.secret) return billingFailure(503, "billing_not_configured", requestOrigin);
  if (!isStripeTestKey(runtime.secret)) return billingFailure(503, "test_mode_unavailable", requestOrigin);
  if (!runtime.stripe) return billingFailure(503, "billing_not_configured", requestOrigin);
  if (!isPremiumSubscriptionPlan(body.plan)) return billingFailure(400, "invalid_plan", requestOrigin);

  const stripe = runtime.stripe;
  try {
    const customers = await findOwnedStripeCustomers(client, user, stripe);
    for (const customer of customers) {
      if (await hasExistingActiveStripeSubscription(customer, user.id, stripe)) {
        return billingFailure(409, "subscription_already_active", requestOrigin);
      }
    }

    let customer = customers[0];
    if (!customer) {
      customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });
      if (!isObject(customer) || !stripeObjectId(customer.id) || stripeObjectMetadata(customer).user_id !== user.id) {
        return billingFailure(502, "stripe_error", requestOrigin);
      }
    }

    const monthly = body.plan === "premium_monthly";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer.id,
      client_reference_id: user.id,
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: monthly ? 1499 : 11900,
          recurring: { interval: monthly ? "month" : "year" },
          product_data: { name: "Parle Premium" },
        },
        quantity: 1,
      }],
      metadata: { user_id: user.id, plan: body.plan },
      subscription_data: { metadata: { user_id: user.id, plan: body.plan } },
      success_url: `${requestOrigin}/learner/plan?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${requestOrigin}/learner/plan?checkout=cancelled`,
    });
    if (!isObject(session) || typeof session.url !== "string" || !session.url.startsWith("https://checkout.stripe.com/")) {
      return billingFailure(502, "stripe_error", requestOrigin);
    }
    return jsonResponse({ status: "complete", url: session.url }, 200, requestOrigin);
  } catch (error) {
    console.error("Parle Stripe checkout failed", {
      action: "billing_checkout",
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return billingFailure(502, "stripe_error", requestOrigin);
  }
}
