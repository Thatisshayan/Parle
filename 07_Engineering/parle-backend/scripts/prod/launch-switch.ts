import { api, PROD_REF } from "./management";
import { launchFindings, PARLE, type LaunchState } from "./launch-check";

/**
 * Plan 12: the move of parle.buzz from the waitlist site to the app, run by the founder on launch day only.
 *   bun scripts/prod/launch-switch.ts --dry-run   prints the steps still needed; changes nothing
 *   bun scripts/prod/launch-switch.ts             makes the two Supabase changes, then prints the Vercel steps
 * Each step is skipped when already done, so running it twice is harmless. Never prints a secret.
 */
export type SwitchStep = { id: "auth_site_url" | "app_url" | "domain" | "deploy_prod"; what: string; by: "script" | "founder" };

export function switchSteps(s: LaunchState): SwitchStep[] {
  const steps: SwitchStep[] = [];
  if (s.siteUrl !== PARLE || !s.redirects.includes(`${PARLE}/reset-password`)) {
    steps.push({ id: "auth_site_url", what: `Supabase Auth: site URL ${PARLE}; keep ${PARLE}/reset-password in the redirect list`, by: "script" });
  }
  if (!s.appUrlIsParleBuzz) steps.push({ id: "app_url", what: `Supabase function setting APP_URL = ${PARLE}`, by: "script" });
  if (s.parleBuzzProject !== "parle-app") {
    steps.push({
      id: "domain",
      what: "Vercel: in project parle-waitlist, Settings > Domains, remove parle.buzz and www.parle.buzz; then in project parle-app add parle.buzz, and add www.parle.buzz as a redirect to parle.buzz (308)",
      by: "founder",
    });
    steps.push({
      id: "deploy_prod",
      what: "! cd /d/AgentDevWork/repos/Parle/07_Engineering/parle-app && bunx vercel deploy --prod --yes --scope shayans-projects-d00acc44",
      by: "founder",
    });
  }
  return steps;
}

if (import.meta.main) {
  const { gatherLaunchState } = await import("./launch-check");
  const dryRun = process.argv.includes("--dry-run");
  const state = await gatherLaunchState();
  const steps = switchSteps(state);
  if (!steps.length) { console.log("nothing to switch: ready"); process.exit(0); }
  for (const step of steps) {
    if (step.by === "founder" || dryRun) { console.log(`${dryRun ? "would" : "you"}: ${step.what}`); continue; }
    if (step.id === "auth_site_url") {
      const redirects = [...new Set([...state.redirects, `${PARLE}/reset-password`])].join(",");
      await api(`/v1/projects/${PROD_REF}/config/auth`, { method: "PATCH", body: JSON.stringify({ site_url: PARLE, uri_allow_list: redirects }) });
      console.log(`done: ${step.what}`);
    } else if (step.id === "app_url") {
      await api(`/v1/projects/${PROD_REF}/secrets`, { method: "POST", body: JSON.stringify([{ name: "APP_URL", value: PARLE }]) });
      console.log(`done: ${step.what}`);
    }
  }
  if (!dryRun) {
    const left = launchFindings(await gatherLaunchState());
    console.log(left.length ? `still to do:\n${left.map((x) => `- ${x}`).join("\n")}` : "ready");
  }
}
