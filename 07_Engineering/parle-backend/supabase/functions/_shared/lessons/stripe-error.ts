/** A 4xx normally means Stripe definitively refused an operation. Idempotency collisions can still be in flight. */
export function stripeRefused(error: unknown): boolean {
  const e = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const raw = e.raw && typeof e.raw === "object" ? e.raw as Record<string, unknown> : {};
  const status = Number(e.statusCode ?? raw.statusCode ?? 0);
  const code = String(e.code ?? raw.code ?? "");
  if (status === 409 || code === "idempotency_error" || code === "idempotency_key_in_use") return false;
  return status >= 400 && status < 500;
}
