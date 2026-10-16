import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readSecret } from "./lib/secrets";
import { LOCAL_URL, localKeys } from "../tests/helpers/local";

const ENV_PATH = `${import.meta.dir}/../supabase/functions/.env`;
const SECRETS = ["NVIDIA_API_KEY", "RESEND_API_KEY", "STRIPE_SECRET_KEY"];

function current(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  return Object.fromEntries(readFileSync(ENV_PATH, "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
}

/** Writes the local function settings (values never printed). Generated secrets are kept across runs. */
export async function setupLocalFunctionsEnv(): Promise<string[]> {
  const old = current();
  const keep = (k: string, make: () => string) => old[k] || make();
  const env: Record<string, string> = {
    SUPERDEV_APP_ID: "parle-local",
    SUPERDEV_SERVICE_ROLE_KEY: keep("SUPERDEV_SERVICE_ROLE_KEY", () => randomBytes(32).toString("hex")),
    CRON_SECRET: keep("CRON_SECRET", () => randomBytes(32).toString("hex")),
    STRIPE_WEBHOOK_SECRET: keep("STRIPE_WEBHOOK_SECRET", () => `whsec_local${randomBytes(24).toString("hex")}`),
    EMAIL_TRANSPORT: "mailpit",
    MAILPIT_URL: "http://host.docker.internal:54324",
    AI_PROVIDER: old.AI_PROVIDER || "fake",
    STRIPE_PROVIDER: old.STRIPE_PROVIDER || "fake", // lesson payments never reach Stripe in local tests
    APP_ORIGINS: "http://127.0.0.1:5173,http://localhost:5173",
    // the address the browser uses for storage; inside the local functions SUPABASE_URL is the gateway (kong)
    PUBLIC_SUPABASE_URL: LOCAL_URL,
  };
  for (const name of SECRETS) {
    try { env[name] = readSecret(name); } catch { /* optional locally; the feature reports "not configured" */ }
  }
  writeFileSync(ENV_PATH, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  const db = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
  const { error } = await db.rpc("set_job_config", { p_functions_url: "http://kong:8000/functions/v1", p_cron_secret: env.CRON_SECRET });
  if (error && !/set_job_config/.test(error.message)) throw new Error(error.message);
  return Object.keys(env);
}

if (import.meta.main) console.log("wrote", (await setupLocalFunctionsEnv()).join(", "));
