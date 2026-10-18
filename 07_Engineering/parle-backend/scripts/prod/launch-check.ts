import { createHash } from "node:crypto";
import { api, PROD_REF } from "./management";

/**
 * Plan 12: read-only check of what the move of parle.buzz to the app needs. Prints "ready" or one finding per line;
 * never prints a setting's value (secrets are compared by their SHA-256 digest).
 *   bun scripts/prod/launch-check.ts
 */
export const PARLE = "https://parle.buzz";
export const PREVIEW = "https://parle-preview-shayans-projects-d00acc44.vercel.app";
const SCOPE = "shayans-projects-d00acc44";
/** The app's Vercel Production settings it cannot run without. */
export const REQUIRED_VERCEL = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "VOICE_RELAY_SECRET", "DEEPGRAM_API_KEY", "AZURE_SPEECH_KEY"];
/** APP_ORIGINS values that let the app at parle.buzz call the functions. */
export const ORIGINS_WITH_PARLE = [PARLE, `${PREVIEW},${PARLE}`, `${PARLE},${PREVIEW}`, `${PARLE},https://www.parle.buzz`];

/** Keep failed CLI responses out of readiness parsing and user-facing output. */
export function successfulCliOutput(args: string[], result: { exitCode: number; stdout: Uint8Array; stderr: Uint8Array }): string {
  if (result.exitCode !== 0) {
    throw new Error(`Vercel ${args.join(" ")} failed with exit code ${result.exitCode}`);
  }
  return `${new TextDecoder().decode(result.stdout)}${new TextDecoder().decode(result.stderr)}`;
}

export type LaunchState = {
  siteUrl: string;
  redirects: string[];
  appUrlIsParleBuzz: boolean;
  appOriginsHaveParleBuzz: boolean;
  vercelProdEnv: string[];
  parleBuzzProject: string;
};

export function launchFindings(s: LaunchState): string[] {
  const f: string[] = [];
  if (s.siteUrl !== PARLE) f.push(`Supabase Auth site URL is ${s.siteUrl || "empty"}; it must be ${PARLE} (links in sign-up and reset emails)`);
  if (!s.redirects.includes(`${PARLE}/reset-password`)) f.push(`Supabase Auth redirect list lacks ${PARLE}/reset-password`);
  if (!s.appUrlIsParleBuzz) f.push(`APP_URL (lesson emails, Stripe return links) is not ${PARLE}`);
  if (!s.appOriginsHaveParleBuzz) f.push(`APP_ORIGINS does not include ${PARLE} (the app could not call the functions)`);
  for (const name of REQUIRED_VERCEL) if (!s.vercelProdEnv.includes(name)) f.push(`Vercel Production for parle-app lacks ${name}`);
  if (s.parleBuzzProject !== "parle-app") f.push(`parle.buzz is on ${s.parleBuzzProject || "no project"}; it must move to parle-app`);
  return f;
}

export async function gatherLaunchState(): Promise<LaunchState> {
  const sha = (v: string) => createHash("sha256").update(v).digest("hex");
  const auth = await api(`/v1/projects/${PROD_REF}/config/auth`);
  const secrets = (await api(`/v1/projects/${PROD_REF}/secrets`)) as Array<{ name: string; value: string }>;
  const digest = (name: string) => secrets.find((r) => r.name === name)?.value ?? "";
  const cli = (args: string[]) => {
    const r = Bun.spawnSync(["bunx", "vercel", ...args, "--scope", SCOPE], { cwd: `${import.meta.dir}/../../../parle-app` });
    return successfulCliOutput(args, r);
  };
  const env = cli(["env", "ls", "production"]).split(/\r?\n/).map((l) => l.trim().split(/\s+/)[0]).filter((n) => /^[A-Z][A-Z0-9_]+$/.test(n));
  const project = cli(["inspect", "parle.buzz"]).match(/^\s*name\s+(\S+)/m)?.[1] ?? "";
  return {
    siteUrl: String(auth.site_url ?? ""),
    redirects: String(auth.uri_allow_list ?? "").split(",").map((u) => u.trim()).filter(Boolean),
    appUrlIsParleBuzz: digest("APP_URL") === sha(PARLE),
    appOriginsHaveParleBuzz: ORIGINS_WITH_PARLE.some((v) => digest("APP_ORIGINS") === sha(v)),
    vercelProdEnv: env,
    parleBuzzProject: project,
  };
}

if (import.meta.main) {
  const findings = launchFindings(await gatherLaunchState());
  console.log(findings.length ? findings.map((x) => `- ${x}`).join("\n") : "ready");
}
