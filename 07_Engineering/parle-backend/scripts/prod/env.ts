import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { readSecret } from "../lib/secrets";

export const PROD_ENV = `${import.meta.dir}/../../supabase/functions/.env.production`;

function hasSecret(name: string): boolean {
  try { return readSecret(name).length > 0; } catch { return false; }
}

export function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  return Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
}

/**
 * Writes the production function settings (git-ignored). Generated secrets are kept across runs; keys come from the
 * secrets folder. Returns the setting names only.
 */
export function buildProdEnv(overrides: Record<string, string> = {}): string[] {
  const old = readEnvFile(PROD_ENV);
  const keep = (k: string, make: () => string) => old[k] || make();
  const env: Record<string, string> = {
    SUPERDEV_APP_ID: "parle",
    SUPERDEV_SERVICE_ROLE_KEY: keep("SUPERDEV_SERVICE_ROLE_KEY", () => randomBytes(32).toString("hex")),
    CRON_SECRET: keep("CRON_SECRET", () => randomBytes(32).toString("hex")),
    // the founder saves Stripe's signing secret to the secrets folder (Task 10); until then a placeholder
    STRIPE_WEBHOOK_SECRET: hasSecret("STRIPE_WEBHOOK_SECRET") ? readSecret("STRIPE_WEBHOOK_SECRET") : keep("STRIPE_WEBHOOK_SECRET", () => "whsec_pending"),
    EMAIL_TRANSPORT: "resend",
    AI_PROVIDER: "nvidia",
    APP_ORIGINS: keep("APP_ORIGINS", () => "https://parle.buzz"),
    NVIDIA_API_KEY: readSecret("NVIDIA_API_KEY"),
    RESEND_API_KEY: readSecret("RESEND_API_KEY"),
    STRIPE_SECRET_KEY: readSecret("STRIPE_SECRET_KEY"),
    ...overrides,
  };
  writeFileSync(PROD_ENV, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  return Object.keys(env);
}

if (import.meta.main) console.log(`wrote ${buildProdEnv().join(", ")}`);
