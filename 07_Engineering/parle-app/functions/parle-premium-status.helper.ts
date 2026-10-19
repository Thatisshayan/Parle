import {
  createSubscriptionCacheSignature,
  isPremiumSubscriptionPlan,
  isStripeTestKey,
  mapStripeSubscriptionStatus,
  normalizeStripeSubscription,
  verifyStripeSubscriptionOwnership,
  verifySubscriptionCache,
  type PremiumSubscriptionDisplayStatus,
  type PremiumSubscriptionPlan,
  type SubscriptionCachePayload,
  type SignedSubscriptionCache,
} from "./parle-stripe-subscription.logic.helper.ts";
import type { ParleServiceClient } from "./parle-service-client.types.ts";

type LearnerIdentity = Record<string, unknown> & {
  id?: string;
  created_by?: string;
  role?: string;
  premium_comp_active?: unknown;
};

type SubscriberRow = Record<string, unknown> & {
  id?: string;
  created_by?: string;
  user_id?: string;
  email?: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  stripe_checkout_session_id?: string;
  plan?: string;
  stripe_status?: string;
  cancel_at_period_end?: boolean;
  current_period_end?: string;
  last_confirmed_at?: string;
  cache_signature?: string;
};

type StripeClient = {
  subscriptions?: { retrieve: (id: string, options?: Record<string, unknown>) => Promise<unknown> };
  customers?: { retrieve: (id: string) => Promise<unknown> };
};

export type PremiumStatusLookup = {
  premium: boolean;
  compRecordFound: boolean;
  recordType: "ParleIdentity";
  lookupField: "created_by";
  learnerKeyType: "email";
  statusField: "premium_comp_active";
};

export type ResolvedPremiumStatus = PremiumStatusLookup & {
  premiumSource: "free" | "complimentary" | "paid";
  subscriptionPlan: PremiumSubscriptionPlan | null;
  subscriptionStatus: PremiumSubscriptionDisplayStatus | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export interface VerifiedSubscriberSnapshot {
  userId: string;
  email: string;
  customerId: string;
  subscriptionId: string;
  checkoutSessionId: string;
  plan: PremiumSubscriptionPlan;
  stripeStatus: string;
  displayStatus: PremiumSubscriptionDisplayStatus;
  premium: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string;
  lastConfirmedAt: string;
  cacheSignature: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rowsFromResponse(value: unknown): SubscriberRow[] {
  if (Array.isArray(value)) return value.filter(isObject) as SubscriberRow[];
  if (isObject(value) && Array.isArray(value.data)) return value.data.filter(isObject) as SubscriberRow[];
  throw new Error("Unexpected owner-scoped subscriber response.");
}

function freePremiumStatus(compStatus: PremiumStatusLookup): ResolvedPremiumStatus {
  return {
    ...compStatus,
    premium: false,
    premiumSource: "free",
    subscriptionPlan: null,
    subscriptionStatus: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  };
}

function paidPremiumStatus(
  compStatus: PremiumStatusLookup,
  value: Pick<VerifiedSubscriberSnapshot, "plan" | "displayStatus" | "currentPeriodEnd" | "cancelAtPeriodEnd">,
): ResolvedPremiumStatus {
  return {
    ...compStatus,
    premium: true,
    premiumSource: "paid",
    subscriptionPlan: value.plan,
    subscriptionStatus: value.displayStatus,
    currentPeriodEnd: value.currentPeriodEnd,
    cancelAtPeriodEnd: value.cancelAtPeriodEnd,
  };
}

function complimentaryPremiumStatus(compStatus: PremiumStatusLookup): ResolvedPremiumStatus {
  return {
    ...compStatus,
    premium: true,
    premiumSource: "complimentary",
    subscriptionPlan: null,
    subscriptionStatus: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  };
}

/** Resolve Premium only from the caller-readable canonical learner identity. */
export function lookupPremiumStatus(
  identity: unknown,
  authenticatedUserEmail: unknown,
): PremiumStatusLookup {
  const email = typeof authenticatedUserEmail === "string" ? authenticatedUserEmail.trim() : "";
  if (!email || email.length > 320) {
    throw new Error("An authenticated learner email is required to confirm Premium status.");
  }

  const learnerIdentity = isObject(identity) ? identity as LearnerIdentity : null;
  const compRecordFound = Boolean(
    learnerIdentity &&
    typeof learnerIdentity.id === "string" && learnerIdentity.id.trim() &&
    learnerIdentity.created_by === email &&
    learnerIdentity.role === "learner" &&
    learnerIdentity.premium_comp_active === true,
  );

  return {
    premium: compRecordFound,
    compRecordFound,
    recordType: "ParleIdentity",
    lookupField: "created_by",
    learnerKeyType: "email",
    statusField: "premium_comp_active",
  };
}

/** Compatibility helper for callers that need only the complimentary Premium decision. */
export function isPremiumNow(identity: unknown, authenticatedUserEmail: unknown): boolean {
  return lookupPremiumStatus(identity, authenticatedUserEmail).premium;
}

/** Read every subscription candidate through the authenticated caller's owner-scoped client. */
export async function readLearnerSubscriberRecords(
  client: ParleServiceClient,
  authenticatedUserId: string,
  authenticatedUserEmail: string,
): Promise<SubscriberRow[]> {
  if (!client?.entities?.Subscriber?.filter) return [];
  const response = await client.entities.Subscriber.filter(
    { user_id: authenticatedUserId, created_by: authenticatedUserEmail },
    "-updated_at",
    100,
  );
  return rowsFromResponse(response).filter((row) =>
    row.user_id === authenticatedUserId &&
    row.created_by === authenticatedUserEmail &&
    typeof row.id === "string" && row.id.trim()
  );
}

function cacheFromRow(row: SubscriberRow): SignedSubscriptionCache | null {
  if (
    typeof row.user_id !== "string" || typeof row.stripe_customer_id !== "string" ||
    typeof row.stripe_subscription_id !== "string" || !isPremiumSubscriptionPlan(row.plan) ||
    typeof row.stripe_status !== "string" || typeof row.cancel_at_period_end !== "boolean" ||
    typeof row.current_period_end !== "string" || typeof row.last_confirmed_at !== "string" ||
    typeof row.cache_signature !== "string"
  ) return null;
  return {
    userId: row.user_id,
    customerId: row.stripe_customer_id,
    subscriptionId: row.stripe_subscription_id,
    plan: row.plan,
    status: row.stripe_status,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    currentPeriodEnd: row.current_period_end,
    lastConfirmedAt: row.last_confirmed_at,
    signature: row.cache_signature,
  };
}

function snapshotFromVerifiedCache(cache: SignedSubscriptionCache, now: Date): VerifiedSubscriberSnapshot | null {
  const decision = mapStripeSubscriptionStatus(cache.plan, cache.status, cache.cancelAtPeriodEnd, cache.currentPeriodEnd, now);
  return {
    userId: cache.userId,
    email: "",
    customerId: cache.customerId,
    subscriptionId: cache.subscriptionId,
    checkoutSessionId: "",
    plan: cache.plan,
    stripeStatus: cache.status,
    displayStatus: decision.displayStatus,
    premium: decision.premium,
    cancelAtPeriodEnd: cache.cancelAtPeriodEnd,
    currentPeriodEnd: cache.currentPeriodEnd,
    lastConfirmedAt: cache.lastConfirmedAt,
    cacheSignature: cache.signature,
  };
}

async function saveVerifiedSubscriber(
  client: ParleServiceClient,
  rows: SubscriberRow[],
  value: VerifiedSubscriberSnapshot,
): Promise<void> {
  const entity = client?.entities?.Subscriber;
  if (!entity) throw new Error("Subscriber records are unavailable.");
  const recordData = {
    user_id: value.userId,
    email: value.email,
    stripe_customer_id: value.customerId,
    stripe_subscription_id: value.subscriptionId,
    stripe_checkout_session_id: value.checkoutSessionId,
    plan: value.plan,
    stripe_status: value.stripeStatus,
    cancel_at_period_end: value.cancelAtPeriodEnd,
    current_period_end: value.currentPeriodEnd,
    last_confirmed_at: value.lastConfirmedAt,
    cache_signature: value.cacheSignature,
  };
  const existing = rows.find((row) => row.stripe_subscription_id === value.subscriptionId) ??
    rows.find((row) => row.stripe_customer_id === value.customerId) ?? rows[0];
  if (existing && typeof existing.id === "string" && existing.user_id === value.userId && existing.created_by === value.email) {
    await entity.update(existing.id, recordData);
    return;
  }
  await entity.create(recordData);
}

/** Persist only Stripe-confirmed fields and a server-generated signature using the caller-scoped client. */
export async function persistVerifiedStripeSubscription(input: {
  client: ParleServiceClient;
  userId: string;
  email: string;
  testStripeSecret: string;
  subscription: unknown;
  customer: unknown;
  expected?: { subscriptionId?: unknown; customerId?: unknown; plan?: unknown };
  checkoutSessionId?: string;
  now?: Date;
}): Promise<VerifiedSubscriberSnapshot | null> {
  const now = input.now ?? new Date();
  if (!isStripeTestKey(input.testStripeSecret)) return null;
  const normalized = normalizeStripeSubscription(input.subscription, now);
  if (!normalized?.plan) return null;
  if (!verifyStripeSubscriptionOwnership(input.subscription, input.customer, input.userId, {
    ...input.expected,
    subscriptionId: input.expected?.subscriptionId ?? normalized.subscriptionId,
    customerId: input.expected?.customerId ?? normalized.customerId,
  })) return null;
  if (input.expected?.plan !== undefined && input.expected.plan !== normalized.plan) return null;

  const lastConfirmedAt = now.toISOString();
  const payload: SubscriptionCachePayload = {
    userId: input.userId,
    customerId: normalized.customerId,
    subscriptionId: normalized.subscriptionId,
    plan: normalized.plan,
    status: normalized.status,
    cancelAtPeriodEnd: normalized.cancelAtPeriodEnd,
    currentPeriodEnd: normalized.currentPeriodEnd,
    lastConfirmedAt,
  };
  let cacheSignature: string;
  try {
    cacheSignature = await createSubscriptionCacheSignature(payload, input.testStripeSecret);
  } catch {
    return null;
  }
  const snapshot: VerifiedSubscriberSnapshot = {
    userId: input.userId,
    email: input.email,
    customerId: normalized.customerId,
    subscriptionId: normalized.subscriptionId,
    checkoutSessionId: input.checkoutSessionId ?? "",
    plan: normalized.plan,
    stripeStatus: normalized.status,
    displayStatus: normalized.displayStatus,
    premium: normalized.premium,
    cancelAtPeriodEnd: normalized.cancelAtPeriodEnd,
    currentPeriodEnd: normalized.currentPeriodEnd,
    lastConfirmedAt,
    cacheSignature,
  };
  const rows = await readLearnerSubscriberRecords(input.client, input.userId, input.email);
  await saveVerifiedSubscriber(input.client, rows, snapshot);
  return snapshot;
}

async function refreshSavedSubscriber(input: {
  client: ParleServiceClient;
  stripe: StripeClient;
  testStripeSecret: string;
  userId: string;
  email: string;
  row: SubscriberRow;
  now: Date;
}): Promise<VerifiedSubscriberSnapshot | null> {
  if (!isStripeTestKey(input.testStripeSecret) || !input.stripe?.subscriptions?.retrieve || !input.stripe?.customers?.retrieve) return null;
  if (
    input.row.user_id !== input.userId || input.row.created_by !== input.email ||
    typeof input.row.stripe_subscription_id !== "string" || !input.row.stripe_subscription_id.trim() ||
    typeof input.row.stripe_customer_id !== "string" || !input.row.stripe_customer_id.trim()
  ) return null;
  try {
    const subscription = await input.stripe.subscriptions.retrieve(input.row.stripe_subscription_id, { expand: ["items.data.price"] });
    const customer = await input.stripe.customers.retrieve(input.row.stripe_customer_id);
    return await persistVerifiedStripeSubscription({
      client: input.client,
      userId: input.userId,
      email: input.email,
      testStripeSecret: input.testStripeSecret,
      subscription,
      customer,
      expected: {
        subscriptionId: input.row.stripe_subscription_id,
        customerId: input.row.stripe_customer_id,
      },
      checkoutSessionId: typeof input.row.stripe_checkout_session_id === "string" ? input.row.stripe_checkout_session_id : "",
      now: input.now,
    });
  } catch {
    return null;
  }
}

/** Shared Premium resolver for plan summaries and tutor quota enforcement. */
export async function resolveCombinedPremiumStatus(input: {
  identity: unknown;
  authenticatedUserId: unknown;
  authenticatedUserEmail: unknown;
  client: ParleServiceClient;
  stripe?: StripeClient | null;
  testStripeSecret?: string | null;
  now?: Date;
  forceRefresh?: boolean;
}): Promise<ResolvedPremiumStatus> {
  const compStatus = lookupPremiumStatus(input.identity, input.authenticatedUserEmail);
  if (compStatus.premium) return complimentaryPremiumStatus(compStatus);

  const userId = typeof input.authenticatedUserId === "string" ? input.authenticatedUserId.trim() : "";
  const email = typeof input.authenticatedUserEmail === "string" ? input.authenticatedUserEmail.trim() : "";
  const secret = input.testStripeSecret ?? "";
  if (!userId || !email || !isStripeTestKey(secret)) return freePremiumStatus(compStatus);

  const now = input.now ?? new Date();
  let rows: SubscriberRow[];
  try {
    rows = await readLearnerSubscriberRecords(input.client, userId, email);
  } catch {
    return freePremiumStatus(compStatus);
  }
  if (!rows.length) return freePremiumStatus(compStatus);

  const refreshedIds = new Set<string>();
  for (const row of rows) {
    const cache = cacheFromRow(row);
    if (!input.forceRefresh && cache && await verifySubscriptionCache(cache, secret, userId, now)) {
      const snapshot = snapshotFromVerifiedCache(cache, now);
      if (snapshot?.premium) return paidPremiumStatus(compStatus, snapshot);
      continue;
    }

    const subscriptionId = typeof row.stripe_subscription_id === "string" ? row.stripe_subscription_id : "";
    if (subscriptionId && refreshedIds.has(subscriptionId)) continue;
    if (subscriptionId) refreshedIds.add(subscriptionId);
    const fresh = await refreshSavedSubscriber({
      client: input.client,
      stripe: input.stripe ?? {},
      testStripeSecret: secret,
      userId,
      email,
      row,
      now,
    });
    if (fresh?.premium) return paidPremiumStatus(compStatus, fresh);
  }
  return freePremiumStatus(compStatus);
}
