import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type ProviderRole = "ai_openrouter" | "ai_nvidia" | "speech_stt" | "speech_tts";
export const PROVIDER_LEASE_SECONDS = 90;
export const DEFAULT_PROVIDER_CONCURRENCY = 5;

export class ProviderBusyError extends Error {
  constructor() { super("provider concurrency limit reached"); this.name = "ProviderBusyError"; }
}
export class ProviderLeaseError extends Error {
  constructor() { super("provider capacity check failed"); this.name = "ProviderLeaseError"; }
}

export function providerConcurrencyLimit(raw: string | undefined, fallback = DEFAULT_PROVIDER_CONCURRENCY): number {
  if (!raw?.trim()) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 20 ? parsed : fallback;
}

export async function withProviderLease<T>(
  db: SupabaseClient,
  role: ProviderRole,
  maxActive: number,
  run: () => Promise<T>,
  leaseSeconds = PROVIDER_LEASE_SECONDS,
): Promise<T> {
  const { data: leaseId, error } = await db.rpc("acquire_provider_lease", {
    p_role: role, p_max_active: maxActive, p_lease_seconds: leaseSeconds,
  });
  if (error) throw new ProviderLeaseError();
  if (typeof leaseId !== "string") throw new ProviderBusyError();
  try {
    return await run();
  } finally {
    try {
      const { error: releaseError } = await db.rpc("release_provider_lease", { p_id: leaseId });
      if (releaseError) console.warn("provider concurrency lease release failed", { role });
    } catch {
      console.warn("provider concurrency lease release failed", { role });
    }
  }
}
