import { chmodSync, closeSync, existsSync, fchmodSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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

export function validateAdminAlertEmail(value: string): string {
  const addresses = value.split(",").map((address) => address.trim());
  const testDomains = new Set(["test", "example", "invalid", "localhost", "agentmail"]);
  const valid = addresses.length > 0 && addresses.every((address) => {
    const match = address.match(/^[^\s@,]+@([^\s@,]+)$/);
    if (!match) return false;
    const domain = match[1].toLowerCase();
    const labels = domain.split(".");
    return labels.length >= 2 && labels.every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) &&
      labels.at(-1)!.length >= 2 && !labels.some((label) => testDomains.has(label));
  });
  if (!valid) throw new Error("Set ADMIN_ALERT_EMAIL to one or more owner-managed production mailboxes before building production settings.");
  return [...new Set(addresses)].join(",");
}

export function validateVoiceRelaySecret(value: string): string {
  const secret = value.trim();
  if (secret.length < 32 || /^(?:pending|change[-_ ]?me|placeholder)$/i.test(secret)) {
    throw new Error("Set VOICE_RELAY_SECRET to an owner-managed random value of at least 32 characters before building production settings.");
  }
  return secret;
}

/** Write secret-bearing settings with owner-only access before placing any contents in the file. */
export function writeRestrictedEnvFile(path: string, contents: string): void {
  const temp = `${path}.${randomBytes(8).toString("hex")}.tmp`;
  let fd: number | null = null;
  try {
    fd = openSync(temp, "wx", 0o600);
    if (process.platform === "win32") {
      const account = spawnSync("whoami.exe", [], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
      if (account.status !== 0 || !account.stdout.trim()) throw new Error("Unable to determine the current Windows account for secret-file permissions.");
      const acl = spawnSync("icacls.exe", [temp, "/inheritance:r", "/grant:r", `${account.stdout.trim()}:(F)`], { encoding: "utf8", windowsHide: true, stdio: "ignore" });
      if (acl.status !== 0) throw new Error("Unable to restrict access to the generated production settings file.");
    } else {
      fchmodSync(fd, 0o600);
    }
    writeFileSync(fd, contents, "utf8");
    closeSync(fd);
    fd = null;
    renameSync(temp, path);
    if (process.platform !== "win32") chmodSync(path, 0o600);
  } catch (error) {
    if (fd !== null) closeSync(fd);
    try { unlinkSync(temp); } catch { /* no temporary file remains */ }
    throw error;
  }
}

/**
 * Writes the production function settings (git-ignored). Generated secrets are kept across runs; keys come from the
 * secrets folder. Returns the setting names only.
 */
export function buildProdEnv(overrides: Record<string, string> = {}): string[] {
  const old = readEnvFile(PROD_ENV);
  const keep = (k: string, make: () => string) => old[k] || make();
  const adminAlertEmail = validateAdminAlertEmail(overrides.ADMIN_ALERT_EMAIL ?? process.env.ADMIN_ALERT_EMAIL ?? old.ADMIN_ALERT_EMAIL ?? "");
  const voiceRelaySecret = validateVoiceRelaySecret(overrides.VOICE_RELAY_SECRET ?? (hasSecret("VOICE_RELAY_SECRET") ? readSecret("VOICE_RELAY_SECRET") : old.VOICE_RELAY_SECRET ?? ""));
  const env: Record<string, string> = {
    SUPERDEV_APP_ID: "parle",
    SUPERDEV_SERVICE_ROLE_KEY: keep("SUPERDEV_SERVICE_ROLE_KEY", () => randomBytes(32).toString("hex")),
    CRON_SECRET: keep("CRON_SECRET", () => randomBytes(32).toString("hex")),
    // the founder saves Stripe's signing secret to the secrets folder (Task 10); until then a placeholder
    STRIPE_WEBHOOK_SECRET: hasSecret("STRIPE_WEBHOOK_SECRET") ? readSecret("STRIPE_WEBHOOK_SECRET") : keep("STRIPE_WEBHOOK_SECRET", () => "whsec_pending"),
    // Plan 7B: the signing secret of the Stripe destination for connected accounts (the founder saves it to the secrets folder)
    STRIPE_CONNECT_WEBHOOK_SECRET: hasSecret("STRIPE_CONNECT_WEBHOOK_SECRET") ? readSecret("STRIPE_CONNECT_WEBHOOK_SECRET") : keep("STRIPE_CONNECT_WEBHOOK_SECRET", () => "whsec_pending"),
    ADMIN_ALERT_EMAIL: adminAlertEmail,
    // Plan 8: the unsubscribe secret is made into the secrets folder by Claude (Task 14) and uploaded by the founder
    WAITLIST_UNSUBSCRIBE_SECRET: hasSecret("WAITLIST_UNSUBSCRIBE_SECRET") ? readSecret("WAITLIST_UNSUBSCRIBE_SECRET") : keep("WAITLIST_UNSUBSCRIBE_SECRET", () => "pending"),
    // Plan 11 (A77): only after a rotation; links signed with it keep working (keep it at least 60 days)
    ...(hasSecret("WAITLIST_UNSUBSCRIBE_SECRET_PREVIOUS") ? { WAITLIST_UNSUBSCRIBE_SECRET_PREVIOUS: readSecret("WAITLIST_UNSUBSCRIBE_SECRET_PREVIOUS") } : {}),
    WAITLIST_SITE_URL: keep("WAITLIST_SITE_URL", () => "https://parle.buzz"), // the unsubscribe page lives here
    EMAIL_TRANSPORT: "resend",
    AI_PROVIDER: "live",
    APP_ORIGINS: keep("APP_ORIGINS", () => "https://parle.buzz"),
    APP_URL: keep("APP_URL", () => "https://parle-preview-shayans-projects-d00acc44.vercel.app"), // lesson email links; parle.buzz at launch
    PUBLIC_SUPABASE_URL: "https://hcphvipeplkfenugikrf.supabase.co",
    OPENROUTER_API_KEY: readSecret("OPENROUTER_API_KEY"),
    RESEND_API_KEY: readSecret("RESEND_API_KEY"),
    STRIPE_SECRET_KEY: readSecret("STRIPE_SECRET_KEY"),
    ...overrides,
    ADMIN_ALERT_EMAIL: adminAlertEmail,
    // Plan 9: must be owner-provisioned; never write a known fallback into production settings.
    VOICE_RELAY_SECRET: voiceRelaySecret,
  };
  writeRestrictedEnvFile(PROD_ENV, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  return Object.keys(env);
}

if (import.meta.main) console.log(`wrote ${buildProdEnv().join(", ")}`);
