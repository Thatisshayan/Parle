import { readFileSync } from "node:fs";

/**
 * Plan 13: makes the read-aloud audio (Azure in production, the fake voice locally) for every approved listening item
 * that has no audio yet, one at a time, so no learner waits for a first-time generation and the signed-out level
 * check can play them. Uses the administrator's "missing audio" list (parle-voice-service admin_listening_missing)
 * and the voice relay's listen action, exactly as a learner's Listen button would. Prints counts only.
 *   bun scripts/prod/prepare-listening-audio.ts local [--apply]
 *   bun scripts/prod/prepare-listening-audio.ts prod  [--apply --founder-go]   production only after the founder's go
 */
export type MissingItem = { item_kind: "question_item" | "learner_task"; item_id: string };
type ListenAnswer = { status: number; generated?: boolean };

export async function prepareAll(missing: MissingItem[], listen: (item: MissingItem) => Promise<ListenAnswer>, opts: { pauseMs?: number } = {}) {
  const counts = { made: 0, already: 0, failed: 0 };
  for (const item of missing) {
    const r = await listen(item).catch(() => ({ status: 0 }) as ListenAnswer);
    if (r.status === 200 && r.generated) counts.made += 1;
    else if (r.status === 200) counts.already += 1;
    else counts.failed += 1;
    if (opts.pauseMs) await new Promise((resolve) => setTimeout(resolve, opts.pauseMs));
  }
  return counts;
}

async function main() {
  const args = process.argv.slice(2);
  const where = args[0];
  const apply = args.includes("--apply");
  if (where !== "local" && where !== "prod") throw new Error("usage: bun scripts/prod/prepare-listening-audio.ts <local|prod> [--apply] [--founder-go]");
  if (where === "prod" && apply && !args.includes("--founder-go")) throw new Error("production needs the founder's explicit go: add --founder-go only after it is given");

  let token: string;
  let missingList: () => Promise<MissingItem[]>;
  let listen: (item: MissingItem) => Promise<ListenAnswer>;
  if (where === "local") {
    const { makeUser } = await import("../../tests/helpers/users");
    const { callFunction, functionsEnv } = await import("../../tests/helpers/functions-env");
    const { LOCAL_URL, localKeys } = await import("../../tests/helpers/local");
    const { handleVoice } = await import("../../../parle-app/api/_voice/handler");
    const admin = await makeUser("admin");
    token = (await admin.client.auth.getSession()).data.session!.access_token;
    missingList = async () => (await callFunction("parle-voice-service", token, { action: "admin_listening_missing" })).body.missing ?? [];
    const env = { VOICE_PROVIDER: "fake", VOICE_RELAY_SECRET: functionsEnv().VOICE_RELAY_SECRET, VITE_SUPABASE_URL: LOCAL_URL, VITE_SUPABASE_PUBLISHABLE_KEY: localKeys().anon };
    listen = async (item) => {
      const r = await handleVoice(new Request("http://app.test/api/voice?action=listen", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(item) }), env as any);
      return { status: r.status, generated: ((await r.json().catch(() => ({}))) as any).generated };
    };
  } else {
    const { createClient } = await import("@supabase/supabase-js");
    const { PROD_URL, anonKey } = await import("./check-learners");
    const { readSecret, SECRETS_DIR } = await import("../lib/secrets");
    const ADMIN = "obsidianteamhq+admin@agentmail.to";
    const APP = "https://parle-preview-shayans-projects-d00acc44.vercel.app";
    const passwords = JSON.parse(readFileSync(`${SECRETS_DIR}/preview-test-accounts.json`, "utf8")) as Record<string, string>;
    const c = createClient(PROD_URL, await anonKey(), { auth: { persistSession: false } });
    const { data, error } = await c.auth.signInWithPassword({ email: ADMIN, password: passwords[ADMIN] });
    if (error || !data.session) throw new Error("administrator sign-in failed");
    token = data.session.access_token;
    missingList = async () => {
      const r = await fetch(`${PROD_URL}/functions/v1/parle-voice-service`, { method: "POST", headers: { Authorization: `Bearer ${token}`, apikey: await anonKey(), "Content-Type": "application/json", Origin: APP }, body: JSON.stringify({ action: "admin_listening_missing" }) });
      return ((await r.json().catch(() => ({}))) as any).missing ?? [];
    };
    listen = async (item) => {
      const r = await fetch(`${APP}/api/voice?action=listen`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "x-vercel-protection-bypass": readSecret("VERCEL_BYPASS"), "Content-Type": "application/json" }, body: JSON.stringify(item) });
      return { status: r.status, generated: ((await r.json().catch(() => ({}))) as any).generated };
    };
  }

  const missing = await missingList();
  console.log(`${apply ? "APPLY" : "DRY RUN (add --apply to make them)"} on ${where}: ${missing.length} approved listening items without audio`);
  if (!apply || !missing.length) return;
  const counts = await prepareAll(missing, listen, { pauseMs: where === "prod" ? 500 : 0 });
  console.log(`made ${counts.made}, already there ${counts.already}, failed ${counts.failed}`);
  console.log(`still without audio: ${(await missingList()).length}`);
}

if (import.meta.main) await main();
