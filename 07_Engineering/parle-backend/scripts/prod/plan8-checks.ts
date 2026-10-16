import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { PROD_REF, runSql, serviceKey } from "./management";
import { PROD_URL, anonKey, fn, newLearner, type Learner } from "./check-learners";
import { waitForMail } from "../buildy/agentmail";
import { tokenHashFrom } from "../../tests/helpers/mailpit";
import * as auth from "../../../parle-app/src/lib/backend/auth";
import { SECRETS_DIR } from "../lib/secrets";
import { assertCheckAlias, savePassword } from "./test-admin";

/**
 * Plan 8 checks on production with AgentMail addresses only (obsidianteamhq+p8...). Prints outcomes only: never
 * passwords, tokens, unsubscribe links or keys. State in the secrets folder (plan8-check-state.json).
 * usage: bun scripts/prod/plan8-checks.ts <pause|enable|admin-accept|admin-after-remove|test-sends|list-precheck|join|campaign|unsubscribe|verify-deleted|reset>
 */
const ADMIN = "obsidianteamhq+admin@agentmail.to";
const NEW_ADMIN = "obsidianteamhq+p8admin@agentmail.to";
const LIST: Array<[string, "tutor" | "learner", string | null]> = [
  ["obsidianteamhq+p8wl1@agentmail.to", "tutor", null],
  ["obsidianteamhq+p8wl2@agentmail.to", "learner", "immigration"],
  ["obsidianteamhq+p8wl3@agentmail.to", "learner", null],
];
const CHECK_TEXT = "This is a Parle system check of the waitlist email. If you received it, nothing is needed.";
const UNSUB = `${PROD_URL}/functions/v1/parle-waitlist-unsubscribe`;
const STATE = `${SECRETS_DIR}/plan8-check-state.json`;
type State = { learner?: Learner & { id: string }; campaignSince?: string };
const load = (): State => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {});
const save = (s: State) => writeFileSync(STATE, JSON.stringify(s, null, 2));
const passwords = () => JSON.parse(readFileSync(`${SECRETS_DIR}/preview-test-accounts.json`, "utf8")) as Record<string, string>;
const now = () => new Date(Date.now() - 5000).toISOString();

async function signIn(email: string, password: string): Promise<{ token: string; id: string; code: string }> {
  const c = createClient(PROD_URL, await anonKey(), { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  return { token: data.session?.access_token ?? "", id: data.user?.id ?? "", code: error ? String((error as { code?: string }).code ?? error.message) : "" };
}
async function adminCall(action: string, body: Record<string, unknown> = {}, as = ADMIN) {
  const s = await signIn(as, passwords()[as]);
  if (!s.token) throw new Error(`sign-in failed for ${as.split("@")[0]}: ${s.code}`);
  return fn("parle-admin-service", s.token, { action, ...body });
}
async function mailWith(to: string, since: string, subject: string) {
  const mail = await waitForMail(to, since);
  return mail && mail.subject === subject ? mail : null;
}
const tokenIn = (text: string) => { const m = /\/unsubscribe\?t=([^"&<\s]+)/.exec(text.replace(/&amp;/g, "&")); return m ? decodeURIComponent(m[1]) : ""; };
async function service() { return createClient(PROD_URL, await serviceKey(PROD_REF), { auth: { persistSession: false } }); }
async function realAddresses(): Promise<number> {
  const rows = (await runSql(PROD_REF, "select count(*)::int as n from public.waitlist_signup where lower(email) not like 'obsidianteamhq+p8%@agentmail.to'")) as Array<{ n: number }>;
  return Number(rows[0]?.n ?? -1);
}

const steps: Record<string, () => Promise<void>> = {
  pause: async () => {
    const l = await newLearner("pause", "A2", "English", false, "p8");
    const c = createClient(PROD_URL, await anonKey(), { auth: { persistSession: false } });
    const id = (await c.auth.getUser(l.token)).data.user?.id ?? "";
    save({ ...load(), learner: { ...l, id } });
    const r = await adminCall("admin_disable_account", { user_id: id, reason: "Plan 8 production check", cancel_lessons: false });
    console.log(`pause: ${r.status} ${r.body.account_status ?? r.body.error_code}`);
    console.log(`pause: old session on the account service: ${(await fn("parle-account-service", l.token, { action: "save_profile", time_zone: "UTC" })).status}`);
    console.log(`pause: sign-in answers ${(await signIn(l.email, l.password)).code || "signed in (WRONG)"}`);
    const d = await adminCall("admin_user_detail", { user_id: id });
    console.log(`pause: detail status ${d.body.account?.status}, reason recorded ${d.body.account?.paused?.reason === "Plan 8 production check"}`);
  },
  enable: async () => {
    const l = load().learner;
    if (!l) throw new Error("run pause first");
    const r = await adminCall("admin_enable_account", { user_id: l.id });
    console.log(`enable: ${r.status} ${r.body.account_status ?? r.body.error_code}`);
    const s = await signIn(l.email, l.password);
    console.log(`enable: sign-in ${s.token ? "works" : `fails (${s.code})`}`);
    const del = await fn("parle-account-service", s.token, { action: "delete_account", password: l.password, confirm: "DELETE" });
    console.log(`enable: check learner deleted ${del.status}`);
  },
  "admin-accept": async () => {
    assertCheckAlias(NEW_ADMIN);
    const mail = await mailWith(NEW_ADMIN, new Date(Date.now() - 15 * 60_000).toISOString(), "Set your password for Parle");
    if (!mail) throw new Error("no 'Set your password for Parle' mail in the last 15 minutes: did the founder invite the address?");
    const password = `Admin-${crypto.randomUUID().slice(0, 12)}1`;
    await auth.resetWithToken(createClient(PROD_URL, await anonKey(), { auth: { persistSession: false } }), tokenHashFrom(mail.text), password);
    savePassword(`${SECRETS_DIR}/preview-test-accounts.json`, NEW_ADMIN, password);
    const o = await adminCall("admin_accounts_overview", {}, NEW_ADMIN);
    console.log(`admin-accept: invited admin signs in, overview ${o.status}, owner ${o.body.me?.owner}`);
    const refused = await adminCall("admin_invite_admin", { email: "obsidianteamhq+p8nobody@agentmail.to" }, NEW_ADMIN);
    console.log(`admin-accept: a non-owner invite answers ${refused.status} ${refused.body.error_code}`);
  },
  // Without the founder's owner session: the regular test administrator (not an owner) is refused every owner action.
  "non-owner": async () => {
    const o = await adminCall("admin_accounts_overview");
    console.log(`non-owner: overview ${o.status}, me.owner ${o.body.me?.owner}, owners listed ${(o.body.admins ?? []).filter((a: { owner?: boolean }) => a.owner).length}`);
    const invite = await adminCall("admin_invite_admin", { email: "obsidianteamhq+p8nobody@agentmail.to" });
    console.log(`non-owner: invite answers ${invite.status} ${invite.body.error_code}`);
    const ownerRow = (o.body.admins ?? []).find((a: { owner?: boolean }) => a.owner);
    const remove = await adminCall("admin_remove_admin", { user_id: ownerRow?.id ?? "" });
    console.log(`non-owner: remove the owner answers ${remove.status} ${remove.body.error_code}`);
    const del = await adminCall("admin_waitlist_delete", { confirm: "DELETE" });
    console.log(`non-owner: delete the waitlist answers ${del.status} ${del.body.error_code}`);
  },
  "admin-after-remove": async () => {
    const s = await signIn(NEW_ADMIN, passwords()[NEW_ADMIN]);
    const o = await fn("parle-admin-service", s.token, { action: "admin_accounts_overview" });
    console.log(`admin-after-remove: overview answers ${o.status} ${o.body.error_code ?? ""}`);
    const db = await service();
    const { error } = await db.auth.admin.deleteUser(s.id);
    console.log(`admin-after-remove: check login deleted ${error ? `FAILED ${error.message}` : "yes"}`);
  },
  "test-sends": async () => {
    for (const [campaign, subject] of [["founding_tutor", "TEST: Become a founding tutor on Parle"], ["launch", "TEST: Parle is open"]] as const) {
      const since = now();
      const r = await adminCall("admin_waitlist_send_test", { campaign, blanks: { launch_date: "the day of this check", personal_paragraph: CHECK_TEXT } });
      const mail = await mailWith(ADMIN, since, subject);
      console.log(`test-sends ${campaign}: ${r.status}; received ${Boolean(mail)}; unsubscribe link ${Boolean(mail && tokenIn(mail.text))}; footer ${Boolean(mail?.text.includes("joined the Parle waitlist"))}; no em dash ${!mail?.text.includes("\u2014")}`);
    }
  },
  "list-precheck": async () => {
    const n = await realAddresses();
    console.log(`list-precheck: addresses other than the check aliases: ${n}`);
    if (n !== 0) { console.log("list-precheck: real addresses present; the campaign check is skipped (ruling 18)"); process.exit(1); }
  },
  join: async () => {
    const anon = createClient(PROD_URL, await anonKey(), { auth: { persistSession: false } });
    for (const [email, role, goal] of LIST) {
      const { data, error } = await anon.rpc("join_waitlist", { p_email: email, p_role: role, p_goal: goal, p_locale: "en-CA", p_source: "plan8-check" });
      console.log(`join ${email.split("@")[0]}: ${error ? `error ${error.message}` : JSON.stringify(data)}`);
    }
    save({ ...load(), campaignSince: now() });
  },
  campaign: async () => {
    if ((await realAddresses()) !== 0) throw new Error("real addresses present: stop (ruling 18)");
    const o = await adminCall("admin_waitlist_overview");
    if (!o.body.postal_address) throw new Error("the founder types the postal address on the Waitlist page first");
    for (const campaign of ["founding_tutor", "launch"]) await adminCall("admin_waitlist_save_blanks", { campaign, blanks: { launch_date: "the day of this check", personal_paragraph: CHECK_TEXT } });
    let since = now();
    const f = await adminCall("admin_waitlist_start", { campaign: "founding_tutor", confirm: "SEND" });
    console.log(`campaign founding_tutor: queued ${f.body.queued ?? f.body.error_code}`);
    console.log(`campaign founding_tutor: ${LIST[0][0].split("@")[0]} received ${Boolean(await mailWith(LIST[0][0], since, "Become a founding tutor on Parle"))}`);
    since = now();
    const l = await adminCall("admin_waitlist_start", { campaign: "launch", confirm: "SEND" });
    console.log(`campaign launch: queued ${l.body.queued ?? l.body.error_code}`);
    for (const [email] of LIST) console.log(`campaign launch: ${email.split("@")[0]} received ${Boolean(await mailWith(email, since, "Parle is open"))}`);
    const again = await adminCall("admin_waitlist_start", { campaign: "launch", confirm: "SEND" });
    console.log(`campaign launch: Send again queues ${again.body.queued}`);
  },
  unsubscribe: async () => {
    const since = load().campaignSince ?? new Date(Date.now() - 3_600_000).toISOString();
    const third = await mailWith(LIST[2][0], since, "Parle is open");
    const second = await mailWith(LIST[1][0], since, "Parle is open");
    const page = await fetch(UNSUB, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://parle.buzz" }, body: JSON.stringify({ token: tokenIn(third?.text ?? "") }) });
    const pageBody = await page.json().catch(() => ({}));
    console.log(`unsubscribe page POST: ${page.status}, address matches ${pageBody.email === LIST[2][0]}, CORS for parle.buzz ${page.headers.get("access-control-allow-origin") === "https://parle.buzz"}`);
    const oneClick = await fetch(`${UNSUB}?t=${encodeURIComponent(tokenIn(second?.text ?? ""))}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
    console.log(`unsubscribe one-click POST: ${oneClick.status}`);
    const forged = await fetch(UNSUB, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: `${tokenIn(third?.text ?? "")}x` }) });
    console.log(`unsubscribe forged token: ${forged.status}`);
    console.log(`unsubscribe: overview unsubscribed ${(await adminCall("admin_waitlist_overview")).body.unsubscribed}`);
  },
  "verify-deleted": async () => {
    const rows = (await runSql(PROD_REF, "select (select count(*) from public.waitlist_signup)::int as signups, (select count(*) from public.waitlist_send where email is not null)::int as addresses, (select count(*) from public.waitlist_send)::int as records")) as Array<Record<string, number>>;
    console.log(`verify-deleted: signups ${rows[0]?.signups}, send records ${rows[0]?.records}, records with an address ${rows[0]?.addresses}`);
  },
  reset: async () => {
    const db = await service();
    const since = load().campaignSince ?? new Date(0).toISOString();
    const a = await db.from("waitlist_send").delete({ count: "exact" }).is("email", null).gte("created_at", since);
    const b = await db.from("waitlist_campaign").update({ blanks: {}, started_by: null, started_at: null, finished_at: null, last_error: "", updated_at: new Date().toISOString() }).in("campaign", ["founding_tutor", "launch"]);
    const c = await db.from("waitlist_unsubscribe").delete({ count: "exact" }).like("email", "obsidianteamhq+p8%@agentmail.to");
    console.log(`reset: check send records removed ${a.count ?? a.error?.message}; campaigns reset ${b.error ? b.error.message : "yes"}; check unsubscribes removed ${c.count ?? c.error?.message}`);
  },
};

const step = process.argv[2] ?? "";
if (!steps[step]) throw new Error(`usage: bun scripts/prod/plan8-checks.ts <${Object.keys(steps).join("|")}>`);
await steps[step]();
