// GENERATED from parle-app/functions/parle-stripe-subscription.logic.helper.ts by scripts/sync-app-code.ts. Do not edit.
export const SUBSCRIPTION_CACHE_TTL_MS = 60 * 60 * 1000;

export type PremiumSubscriptionPlan = "premium_monthly" | "premium_annual";
export type PremiumSubscriptionDisplayStatus = "active" | "trialing" | "cancelling" | "inactive";

export interface SubscriptionCachePayload {
  userId: string;
  customerId: string;
  subscriptionId: string;
  plan: PremiumSubscriptionPlan;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string;
  lastConfirmedAt: string;
}

export interface SignedSubscriptionCache extends SubscriptionCachePayload {
  signature: string;
}

export interface NormalizedStripeSubscription {
  subscriptionId: string;
  customerId: string;
  plan: PremiumSubscriptionPlan | null;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string;
  premium: boolean;
  displayStatus: PremiumSubscriptionDisplayStatus;
}

export interface VerifiedCheckoutSession {
  sessionId: string;
  customerId: string;
  subscriptionId: string;
  userId: string;
  plan: PremiumSubscriptionPlan;
}

const encoder = new TextEncoder();
const CACHE_HKDF_SALT = encoder.encode("parle:stripe-subscription-cache:salt:v1");
const CACHE_HKDF_INFO = encoder.encode("parle:stripe-subscription-cache:hmac-sha256:v1");

export function isStripeTestKey(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("sk_test_");
}

export function isPremiumSubscriptionPlan(value: unknown): value is PremiumSubscriptionPlan {
  return value === "premium_monthly" || value === "premium_annual";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function stripeObjectId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (isObject(value) && typeof value.id === "string" && value.id.trim()) return value.id.trim();
  return null;
}

export function stripePeriodEndToIso(value: unknown): string | null {
  let time: number;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    time = value * 1000;
  } else if (typeof value === "string" && value.trim()) {
    time = Date.parse(value);
  } else {
    return null;
  }
  if (!Number.isFinite(time)) return null;
  try {
    return new Date(time).toISOString();
  } catch {
    return null;
  }
}

/** Match only the two exact USD recurring offers approved for Parle Premium. */
export function planFromStripeSubscription(value: unknown): PremiumSubscriptionPlan | null {
  if (!isObject(value) || !isObject(value.items) || !Array.isArray(value.items.data) || value.items.data.length !== 1) return null;
  const item = value.items.data[0];
  if (!isObject(item) || item.quantity !== 1 || !isObject(item.price) || !isObject(item.price.recurring)) return null;
  const price = item.price;
  const recurring = price.recurring;
  if (typeof price.currency !== "string" || price.currency.toLowerCase() !== "usd" || recurring.interval_count !== 1) return null;
  if (price.unit_amount === 1499 && recurring.interval === "month") return "premium_monthly";
  if (price.unit_amount === 11900 && recurring.interval === "year") return "premium_annual";
  return null;
}

export function mapStripeSubscriptionStatus(
  plan: PremiumSubscriptionPlan | null,
  status: unknown,
  cancelAtPeriodEnd: unknown,
  currentPeriodEnd: unknown,
  now = new Date(),
): { premium: boolean; displayStatus: PremiumSubscriptionDisplayStatus } {
  if (!plan || (status !== "active" && status !== "trialing") || typeof cancelAtPeriodEnd !== "boolean") {
    return { premium: false, displayStatus: "inactive" };
  }
  const endIso = stripePeriodEndToIso(currentPeriodEnd);
  const nowMs = now instanceof Date ? now.getTime() : Number.NaN;
  const endMs = endIso ? Date.parse(endIso) : Number.NaN;
  if (!Number.isFinite(nowMs) || !Number.isFinite(endMs)) return { premium: false, displayStatus: "inactive" };
  if (cancelAtPeriodEnd && endMs <= nowMs) return { premium: false, displayStatus: "inactive" };
  return {
    premium: true,
    displayStatus: cancelAtPeriodEnd ? "cancelling" : status,
  };
}

export function normalizeStripeSubscription(value: unknown, now = new Date()): NormalizedStripeSubscription | null {
  if (!isObject(value)) return null;
  const subscriptionId = stripeObjectId(value.id);
  const customerId = stripeObjectId(value.customer);
  const currentPeriodEnd = stripePeriodEndToIso(value.current_period_end);
  if (!subscriptionId || !customerId || !currentPeriodEnd || typeof value.status !== "string" || !value.status.trim() || typeof value.cancel_at_period_end !== "boolean") {
    return null;
  }
  const plan = planFromStripeSubscription(value);
  const decision = mapStripeSubscriptionStatus(plan, value.status, value.cancel_at_period_end, currentPeriodEnd, now);
  return {
    subscriptionId,
    customerId,
    plan,
    status: value.status,
    cancelAtPeriodEnd: value.cancel_at_period_end,
    currentPeriodEnd,
    premium: decision.premium,
    displayStatus: decision.displayStatus,
  };
}

/** Check Stripe's ownership metadata and customer relationship without granting a plan. */
export function isStripeSubscriptionOwnedByLearner(
  subscriptionValue: unknown,
  customerValue: unknown,
  userId: unknown,
  expected: { subscriptionId?: unknown; customerId?: unknown } = {},
): boolean {
  if (!isObject(subscriptionValue) || !isObject(customerValue) || typeof userId !== "string" || !userId.trim()) return false;
  const subscriptionId = stripeObjectId(subscriptionValue.id);
  const subscriptionCustomerId = stripeObjectId(subscriptionValue.customer);
  const customerId = stripeObjectId(customerValue.id);
  const subscriptionMetadata = isObject(subscriptionValue.metadata) ? subscriptionValue.metadata : {};
  const customerMetadata = isObject(customerValue.metadata) ? customerValue.metadata : {};
  if (!subscriptionId || !subscriptionCustomerId || !customerId || customerValue.deleted === true) return false;
  if (subscriptionCustomerId !== customerId || subscriptionMetadata.user_id !== userId || customerMetadata.user_id !== userId) return false;
  if (expected.subscriptionId !== undefined && subscriptionId !== expected.subscriptionId) return false;
  if (expected.customerId !== undefined && subscriptionCustomerId !== expected.customerId) return false;
  return true;
}

/** Check learner ownership plus the exact Premium offer and its bound plan metadata. */
export function verifyStripeSubscriptionOwnership(
  subscription: unknown,
  customer: unknown,
  userId: unknown,
  expected: { subscriptionId?: unknown; customerId?: unknown; plan?: unknown } = {},
): boolean {
  if (!isStripeSubscriptionOwnedByLearner(subscription, customer, userId, expected) || !isObject(subscription)) return false;
  const plan = planFromStripeSubscription(subscription);
  const metadata = isObject(subscription.metadata) ? subscription.metadata : {};
  if (!plan || metadata.plan !== plan) return false;
  if (expected.plan !== undefined && expected.plan !== plan) return false;
  return true;
}

/** Validate the Checkout Session's completed, authenticated subscription handoff. */
export function verifiedCheckoutSession(value: unknown, authenticatedUserId: unknown): VerifiedCheckoutSession | null {
  if (!isObject(value) || typeof authenticatedUserId !== "string" || !authenticatedUserId.trim()) return null;
  const sessionId = stripeObjectId(value.id);
  const customerId = stripeObjectId(value.customer);
  const subscriptionId = stripeObjectId(value.subscription);
  const metadata = isObject(value.metadata) ? value.metadata : {};
  const plan = metadata.plan;
  if (
    !sessionId || !customerId || !subscriptionId ||
    value.status !== "complete" || value.mode !== "subscription" ||
    value.client_reference_id !== authenticatedUserId || metadata.user_id !== authenticatedUserId ||
    !isPremiumSubscriptionPlan(plan)
  ) return null;
  return { sessionId, customerId, subscriptionId, userId: authenticatedUserId, plan };
}

function cachePayloadIsValid(payload: SubscriptionCachePayload): boolean {
  return Boolean(
    typeof payload.userId === "string" && payload.userId.trim() && payload.userId.length <= 255 &&
    typeof payload.customerId === "string" && payload.customerId.trim() && payload.customerId.length <= 255 &&
    typeof payload.subscriptionId === "string" && payload.subscriptionId.trim() && payload.subscriptionId.length <= 255 &&
    isPremiumSubscriptionPlan(payload.plan) &&
    typeof payload.status === "string" && payload.status.trim() && payload.status.length <= 64 &&
    typeof payload.cancelAtPeriodEnd === "boolean" &&
    stripePeriodEndToIso(payload.currentPeriodEnd) !== null &&
    stripePeriodEndToIso(payload.lastConfirmedAt) !== null
  );
}

function canonicalCachePayload(payload: SubscriptionCachePayload): Uint8Array {
  return encoder.encode(JSON.stringify([
    "parle-premium-cache-v1",
    payload.userId,
    payload.customerId,
    payload.subscriptionId,
    payload.plan,
    payload.status,
    payload.cancelAtPeriodEnd,
    payload.currentPeriodEnd,
    payload.lastConfirmedAt,
  ]));
}

async function deriveCacheHmacKey(testStripeSecret: string, usage: KeyUsage): Promise<CryptoKey> {
  if (!isStripeTestKey(testStripeSecret)) throw new Error("Stripe test mode is required to verify subscription cache data.");
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) throw new Error("Web Crypto is required to verify subscription cache data.");
  const material = await cryptoApi.subtle.importKey("raw", encoder.encode(testStripeSecret), "HKDF", false, ["deriveKey"]);
  return await cryptoApi.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: CACHE_HKDF_SALT, info: CACHE_HKDF_INFO },
    material,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    [usage],
  );
}

type KeyUsage = "sign" | "verify";

function bytesToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array | null {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  return bytes;
}

/** Derive a purpose-specific HMAC key from the existing test Stripe secret. */
export async function createSubscriptionCacheSignature(payload: SubscriptionCachePayload, testStripeSecret: string): Promise<string> {
  if (!cachePayloadIsValid(payload)) throw new Error("Subscription cache fields are incomplete or invalid.");
  const key = await deriveCacheHmacKey(testStripeSecret, "sign");
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, canonicalCachePayload(payload));
  return bytesToHex(signature);
}

/** Verify ownership, tamper resistance, and the maximum one-hour cache window. */
export async function verifySubscriptionCache(
  cache: SignedSubscriptionCache,
  testStripeSecret: string,
  authenticatedUserId: string,
  now = new Date(),
): Promise<boolean> {
  try {
    if (!cache || typeof cache !== "object" || !cachePayloadIsValid(cache)) return false;
    if (cache.userId !== authenticatedUserId || !isStripeTestKey(testStripeSecret)) return false;
    const nowMs = now instanceof Date ? now.getTime() : Number.NaN;
    const verifiedAtMs = Date.parse(cache.lastConfirmedAt);
    if (!Number.isFinite(nowMs) || !Number.isFinite(verifiedAtMs) || verifiedAtMs > nowMs || nowMs - verifiedAtMs >= SUBSCRIPTION_CACHE_TTL_MS) return false;
    const bytes = hexToBytes(cache.signature);
    if (!bytes || !globalThis.crypto?.subtle) return false;
    const key = await deriveCacheHmacKey(testStripeSecret, "verify");
    const payload: SubscriptionCachePayload = {
      userId: cache.userId,
      customerId: cache.customerId,
      subscriptionId: cache.subscriptionId,
      plan: cache.plan,
      status: cache.status,
      cancelAtPeriodEnd: cache.cancelAtPeriodEnd,
      currentPeriodEnd: cache.currentPeriodEnd,
      lastConfirmedAt: cache.lastConfirmedAt,
    };
    return await globalThis.crypto.subtle.verify("HMAC", key, bytes, canonicalCachePayload(payload));
  } catch {
    return false;
  }
}
