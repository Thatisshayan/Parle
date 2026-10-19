import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./local";
import { callFunction, functionsEnv } from "./functions-env";
import { makeUser } from "./users";

export const psql = (sql: string) =>
  Bun.spawnSync(["docker", "exec", "-i", "supabase_db_parle-staging", "psql", "-U", "postgres", "-tA", "-c", sql]).stdout.toString().trim();

/** The local stand-in for production's waitlist (never in supabase/migrations, never on production). */
export function useWaitlistStandIn(): void {
  psql(readFileSync(`${import.meta.dir}/../../supabase/tests-only/waitlist_signup.sql`, "utf8"));
}

/** Waitlist tests share one local list: each starts from an empty list, no send records and fresh campaigns. */
export function resetWaitlist(): void {
  useWaitlistStandIn();
  psql("delete from public.waitlist_send; delete from public.waitlist_unsubscribe; delete from public.waitlist_signup; " +
    "update public.waitlist_campaign set blanks = '{}', started_by = null, started_at = null, finished_at = null, last_error = ''; " +
    "delete from public.app_setting where key = 'sender_postal_address'");
}

/** Seeds the local list through the server-only RPC, as the public signup Edge Function does. */
export async function joinWaitlist(email: string, role: "learner" | "tutor" = "learner", goal: string | null = null) {
  const server = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
  const { data, error } = await server.rpc("join_waitlist", { p_email: email, p_role: role, p_goal: goal, p_locale: "en-CA", p_source: "test" });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; error?: string };
}

export function waitlistRows(campaign: string): Array<{ email: string; status: string }> {
  return psql(`select coalesce(email, '') || '|' || status from public.waitlist_send where campaign = '${campaign}' order by email`)
    .split("\n").filter(Boolean).map((line) => { const [email, status] = line.split("|"); return { email, status }; });
}

/** An administrator (role admin, written with the service key); `owner` adds app_metadata.owner as set-owner.ts does. */
export async function adminUser(opts: { owner?: boolean } = {}) {
  const u = await makeUser("admin");
  if (opts.owner) {
    const db = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
    const { error } = await db.auth.admin.updateUserById(u.id, { app_metadata: { role: "admin", owner: true } });
    if (error) throw new Error(error.message);
  }
  const token = (await u.client.auth.getSession()).data.session!.access_token;
  return { ...u, token };
}

export const adminCall = (token: string, action: string, body: Record<string, unknown> = {}) =>
  callFunction("parle-admin-service", token, { action, ...body });

/** One run of the sending job, as pg_cron calls it. */
export const runWaitlistJobs = () => callFunction("parle-waitlist-jobs", null, {}, { "x-cron-secret": functionsEnv().CRON_SECRET });
