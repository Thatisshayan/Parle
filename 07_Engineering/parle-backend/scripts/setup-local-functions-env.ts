import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readSecret } from "./lib/secrets";
import { LOCAL_URL, localKeys } from "../tests/helpers/local";

const ENV_PATH = `${import.meta.dir}/../supabase/functions/.env`;
const SECRETS = ["NVIDIA_API_KEY", "OPENROUTER_API_KEY", "RESEND_API_KEY", "STRIPE_SECRET_KEY"];

function current(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  return Object.fromEntries(readFileSync(ENV_PATH, "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
}

/** Writes the local function settings (values never printed). Generated secrets are kept across runs. */
export async function setupLocalFunctionsEnv(): Promise<string[]> {
  const old = current();
  const stripeStub = process.env.PARLE_STRIPE_TEST_STUB === "1";
  const keep = (k: string, make: () => string) => old[k] || make();
  const env: Record<string, string> = {
    SUPERDEV_APP_ID: "parle-local",
    SUPERDEV_SERVICE_ROLE_KEY: keep("SUPERDEV_SERVICE_ROLE_KEY", () => randomBytes(32).toString("hex")),
    CRON_SECRET: keep("CRON_SECRET", () => randomBytes(32).toString("hex")),
    STRIPE_WEBHOOK_SECRET: keep("STRIPE_WEBHOOK_SECRET", () => `whsec_local${randomBytes(24).toString("hex")}`),
    STRIPE_CONNECT_WEBHOOK_SECRET: keep("STRIPE_CONNECT_WEBHOOK_SECRET", () => `whsec_localconnect${randomBytes(24).toString("hex")}`),
    ...(stripeStub ? {
      STRIPE_SECRET_KEY: "sk_test_parle_ci_stub",
      STRIPE_TEST_API_HOST: "host.docker.internal",
      STRIPE_TEST_API_PORT: "12111",
      STRIPE_TEST_API_PROTOCOL: "http",
    } : {}),
    ADMIN_ALERT_EMAIL: "payout-alerts@example.test", // payout alerts land in Mailpit
    WAITLIST_UNSUBSCRIBE_SECRET: keep("WAITLIST_UNSUBSCRIBE_SECRET", () => randomBytes(32).toString("hex")), // signs unsubscribe links (Plan 8)
    WAITLIST_SITE_URL: "http://127.0.0.1:5173", // the unsubscribe page; https://parle.buzz in production
    WAITLIST_PACE_MS: "20", // production uses the default 1000 ms between emails
    VOICE_RELAY_SECRET: keep("VOICE_RELAY_SECRET", () => randomBytes(32).toString("hex")), // the voice relay's shared secret (Plan 9)
    EMAIL_TRANSPORT: "mailpit",
    MAILPIT_URL: "http://host.docker.internal:54324",
    AI_PROVIDER: old.AI_PROVIDER || "fake",
    STRIPE_PROVIDER: old.STRIPE_PROVIDER || "fake", // lesson payments never reach Stripe in local tests
    APP_URL: "http://127.0.0.1:5173", // where lesson emails link to
    APP_ORIGINS: "http://127.0.0.1:5173,http://localhost:5173",
    // the address the browser uses for storage; inside the local functions SUPABASE_URL is the gateway (kong)
    PUBLIC_SUPABASE_URL: LOCAL_URL,
  };
  for (const name of SECRETS) {
    if (stripeStub && name === "STRIPE_SECRET_KEY") continue;
    try { env[name] = readSecret(name); } catch { /* optional locally; the feature reports "not configured" */ }
  }
  writeFileSync(ENV_PATH, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  const db = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
  const { error } = await db.rpc("set_job_config", { p_functions_url: "http://kong:8000/functions/v1", p_cron_secret: env.CRON_SECRET });
  if (error && !/set_job_config/.test(error.message)) throw new Error(error.message);
  return Object.keys(env);
}

if (import.meta.main) console.log("wrote", (await setupLocalFunctionsEnv()).join(", "));
