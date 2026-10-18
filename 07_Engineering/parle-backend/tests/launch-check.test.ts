import { describe, it, expect } from "bun:test";
import { launchFindings, PARLE, type LaunchState } from "../scripts/prod/launch-check";

const PREVIEW = "https://parle-preview-shayans-projects-d00acc44.vercel.app";
const ready: LaunchState = {
  siteUrl: "https://parle.buzz", redirects: ["https://parle.buzz/reset-password"], appUrlIsParleBuzz: true, appOriginsHaveParleBuzz: true,
  vercelProdEnv: ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "VOICE_RELAY_SECRET", "DEEPGRAM_API_KEY", "AZURE_SPEECH_KEY"],
  parleBuzzProject: "parle-app",
};

describe("the launch check (Plan 12)", () => {
  it("a ready setup has no findings", () => expect(launchFindings(ready)).toEqual([]));
  it("names each setting still on the preview or missing", () => {
    const today: LaunchState = { ...ready, siteUrl: PREVIEW, redirects: [`${PREVIEW}/reset-password`], appUrlIsParleBuzz: false,
      vercelProdEnv: ["VOICE_RELAY_SECRET"], parleBuzzProject: "parle-waitlist" };
    const f = launchFindings(today).join("\n");
    for (const words of ["Auth site URL", "reset-password", "APP_URL", "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "DEEPGRAM_API_KEY", "parle.buzz is on parle-waitlist"]) expect(f).toContain(words);
  });
});

describe("the launch switch (Plan 12)", () => {
  it("plans only the steps still needed, in order, and none when ready", async () => {
    const { switchSteps } = await import("../scripts/prod/launch-switch");
    expect(switchSteps(ready)).toEqual([]);
    const today: LaunchState = { ...ready, siteUrl: PREVIEW, appUrlIsParleBuzz: false, parleBuzzProject: "parle-waitlist" };
    // the domain moves first; the Supabase changes wait until parle.buzz serves the app (review Minor 8)
    expect(switchSteps(today).map((s) => s.id)).toEqual(["domain", "deploy_prod", "auth_site_url", "app_url"]);
    const { supabaseStepsAllowed } = await import("../scripts/prod/launch-switch");
    expect(supabaseStepsAllowed(today)).toBe(false);
    expect(supabaseStepsAllowed({ ...today, parleBuzzProject: "parle-app" })).toBe(true);
    expect(switchSteps({ ...ready, siteUrl: PREVIEW }).map((s) => s.id)).toEqual(["auth_site_url"]);
  });

  it("applies live Supabase steps only after the domain is on the app project", async () => {
    const { applyScriptStep, switchSteps } = await import("../scripts/prod/launch-switch");
    const before = { ...ready, siteUrl: PREVIEW, redirects: [`${PREVIEW}/reset-password`], appUrlIsParleBuzz: false, parleBuzzProject: "parle-waitlist" };
    const scriptSteps = switchSteps(before).filter((step) => step.by === "script");
    const calls: string[] = [];
    const actions = {
      updateAuth: async (body: { site_url: string; uri_allow_list: string[] }) => { calls.push(`auth:${body.site_url}:${body.uri_allow_list.join(",")}`); },
      setAppUrl: async (url: string) => { calls.push(`app:${url}`); },
    };
    for (const step of scriptSteps) expect(await applyScriptStep(step, before, actions)).toBe(false);
    expect(calls).toEqual([]);

    const after = { ...before, parleBuzzProject: "parle-app" };
    for (const step of scriptSteps) expect(await applyScriptStep(step, after, actions)).toBe(true);
    expect(calls).toEqual([
      `auth:${PARLE}:${PREVIEW}/reset-password,${PARLE}/reset-password`,
      `app:${PARLE}`,
    ]);
  });
});
