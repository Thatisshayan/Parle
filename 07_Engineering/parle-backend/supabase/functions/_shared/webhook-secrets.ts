/**
 * The Stripe signing secrets the webhook may verify with. A placeholder such as `whsec_pending` (written by
 * scripts/prod/env.ts before the founder saves the real secret) is public, so it is never accepted (Plan 7B review).
 */
export function usableWebhookSecrets(values: string[]): string[] {
  return values.filter((v) => /^whsec_[A-Za-z0-9]{20,}$/.test(v) && v !== "whsec_pending");
}
