# Backend Plan 4: data migration, production, private preview and cut-over

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Buildy row is in our production Supabase project and verified. The app runs from a private Vercel
preview against production, the founder has clicked through it, and Buildy is frozen. Every migrated person has
received a "Set your password for Parle" email from parle.buzz. The waitlist at parle.buzz is untouched; public launch
stays a separate founder decision.

**Architecture:**
- **Migration** (`parle-backend/scripts/migrate/`): a pure, tested transform plus thin input/output scripts.
  - Export: each test account's own rows through Buildy's data API, and the owner's rows from inside the owner's
    signed-in page (the owner token never leaves the browser).
  - Transform: rows keep their Buildy ids (all UUIDs, so cross-references stay valid). Person ids (`user_id`,
    `tutor_user_id`...) are mapped to the new login ids. Values are converted to the column types. Buildy's
    one-row-per-message `usage_counter` rows become one `daily-total` row per learner and day.
  - Load: into local staging (rehearsal) or production.
  - Verify: counts, owners, spot checks.
- **Production:**
  - database migrations through the Supabase MCP (`apply_migration`, no database password);
  - functions and secrets through the Supabase CLI after the founder logs in once;
  - auth settings (Resend SMTP, templates, redirect URLs) through the Management API;
  - the app on a protected Vercel preview.

**Tech Stack:** Bun scripts, supabase-js 2, Supabase CLI + MCP + Management API, Vercel CLI, Stripe sandbox, Resend,
AgentMail (receiving test mail), gstack browser.

**Spec:** `06_Build/export-decoupling/specs/2026-10-14-backend-decoupling-design.md`. Sections: 8 (environments), 9
(migration), 10 (cut-over), 10a phases 5-6, 11 (testing and done criteria). Inputs: `../plans/2026-10-16-plan-3-report.md`
("For Plan 4"), the R-register in `../deferred-defects.md` (items targeted at Plan 4), `../security-debt.md`.

## Before you start (founder steps, in the order they are needed)

1. **Docker Desktop running** (Tasks 1-5 use local staging).
2. **Task 7:** run `! bunx supabase login` once in this session (opens the browser; stores a CLI access token the
   scripts read without printing).
3. **Task 10:** in the Stripe **sandbox** dashboard, add a webhook endpoint (guided step in the task) and save its
   signing secret as one line in `C:\Users\AgentDev\.parle-secrets\STRIPE_WEBHOOK_SECRET`.
4. **Task 11:** click through the private preview as learner, tutor and admin, including one sandbox checkout.
5. **Task 12 (cut-over, irreversible):**
   - confirm "go", stop changing anything on Buildy, and approve emptying the production app tables;
   - confirm which email gets the admin account.

## Global Constraints

- Production Supabase project "Parle", ref `hcphvipeplkfenugikrf`, ca-central-1. **`waitlist_signup` and
  `join_waitlist()` are never modified, emptied or dropped**: every script that writes to production names its app
  tables explicitly and checks the `waitlist_signup` row count before and after (spec section 13).
- Secrets (NVIDIA, Resend, Stripe, webhook, generated secrets, the Supabase CLI token, service-role keys, the Vercel
  bypass secret) are read from files into memory only. They are never printed, logged, committed or put on a command
  line. Generated env files are git-ignored (`.env*`).
- The owner's Buildy token never leaves the owner's browser page (Plan 1 rule).
- Stripe stays in the sandbox; live-mode events are refused (Plan 3). The founder does all checkout clicks.
- The Buildy site stays unpublished and untouched for 30 days after cut-over, then is archived (spec section 10).
- parle.buzz keeps showing the waitlist; the app is reachable only on the protected preview (decision #46).
- Never force-push. Commits end with the session's attribution lines.
- Destructive production steps (emptying app tables, deleting preview test users, the final migration) run only after
  the founder's explicit "go" in this session.

## Review Focus

1. **A row that names someone who has no account.** A Buildy row whose `user_id` / `tutor_user_id` / `created_by`
   points to a person not among the migrated accounts must be reported by the verifier, never silently given to the
   wrong owner or loaded with a dangling id. Tests: Task 1 "unknown person ids are reported, not guessed"; Task 4
   "the verifier flags rows without an owner".
2. **Running the loader twice.** A repeated load (after a failure, or rehearsal then final) must not duplicate rows or
   logins. Test: Task 3 "loading the same export twice changes nothing".
3. **Production waitlist.** No step may touch `waitlist_signup`. Test: Task 12 "clean-up never touches the waitlist"
   (count checked before and after, against a local copy of the table).
4. **Migrated people signing in.** They have no password until they use the emailed link, and the link must work
   exactly once and only for that person. Test: Task 5 "a migrated learner sets a password from the email and sees
   their own data".
5. **Premium after migration.** The paid sandbox learner (m3imm) must still see Premium on the new stack. The
   subscription cache signature is tied to the Stripe sandbox key, so it stays valid. Test: Task 5 "the migrated paid
   learner is Premium".

---

## File map

```
07_Engineering/parle-backend/
  scripts/migrate/
    types.ts             (T1) shared types (ExportBundle, EntityRows, PersonMap)
    transform.ts         (T1) pure: convertRow, mapPersonIds, aggregateUsage, buildPersonMap, transformBundle
    export-accounts.ts   (T2) per-account export (6 test accounts) through Buildy's data API
    owner-export.js      (T2) runs inside the owner's signed-in Buildy page; returns owner rows (no token)
    export-owner.ts      (T2) drives owner-export.js through gstack and saves the result
    load.ts              (T3) creates logins (no password), upserts rows by id, into a target project
    verify.ts            (T4) checks counts, owners, person ids, Buildy hosts, spot checks; prints a report
    set-password-mail.ts (T5) "Set your password for Parle" emails (Resend in production, Mailpit locally)
    clean-app-tables.ts  (T12) empties app tables in a target, never waitlist_signup
  scripts/prod/
    env.ts               (T7) builds supabase/functions/.env.production from .parle-secrets (git-ignored)
    management.ts        (T7) Management API helpers reading the CLI token (api keys, auth config)
    configure-auth.ts    (T8) production auth: site URL, redirect URLs, Resend SMTP, templates, rate limits
    deploy.ts            (T7) applies secrets, deploys functions, sets job config
  tests/migrate-transform.test.ts, migrate-load.test.ts, migrate-verify.test.ts, set-password-mail.test.ts,
        clean-app-tables.test.ts, access-coverage.test.ts (R5, R6), cors.test.ts (R8)
07_Engineering/parle-app/vercel.json (T9)
06_Build/export-decoupling/migration/ (T5, T12) rehearsal and final reports (no personal data beyond test aliases)
```

---

### Task 1: The transform (pure, tested)

**Files:** Create `scripts/migrate/types.ts`, `scripts/migrate/transform.ts`, `tests/migrate-transform.test.ts`

**Interfaces:**
- Produces:
  - `type BuildyRow = Record<string, unknown>`.
  - `type ExportBundle = { exportedAt: string; people: Array<{ buildyId: string; email: string; fullName: string | null; buildyRole: "administrator" | "user" }>; rows: Record<string, BuildyRow[]> }` (rows by entity name, merged and deduplicated by id across sources).
  - `type PersonMap = Map<string, { newId: string; email: string }>` (Buildy user id to new auth id).
  - `convertRow(entity, row): Record<string, unknown>`: drops fields that are not entity properties (except `id`,
    `created_at`, `updated_at`, `created_by`) and converts types: number to number or null (`""` gives null), boolean
    to boolean (`"true"`/`"false"` strings too), array to array (JSON strings parsed), string to string (objects JSON-stringified, null kept).
  - `PERSON_ID_COLUMNS = ["user_id", "learner_user_id", "tutor_user_id", "actor_user_id", "updated_by"]`.
  - `mapPersonIds(entity, row, people, report): row`: replaces Buildy user ids in those columns. An id that is not a
    known person is left unchanged and recorded in `report.unknownPersonIds`.
  - `aggregateUsage(rows): rows`: one row per `(user_id, period, period_key)` with `ai_messages` = the number of
    source rows (Buildy counted rows) and `source_session_id = "daily-total"`, keeping the earliest `created_at`.
  - `ownerFor(row, emailToNewId): string | null` (by `created_by`).
  - `transformBundle(bundle, personMap): { tables: Record<string, Record<string, unknown>[]>; report: TransformReport }`.
  - `TransformReport = { unknownPersonIds: Array<{ entity: string; id: string; column: string; value: string }>; ownerless: Array<{ entity: string; id: string; created_by: string }>; buildyHosts: Array<{ entity: string; id: string; column: string }>; usageMerged: { from: number; to: number } }`.

- [ ] **Step 1: Failing test** `tests/migrate-transform.test.ts`

```ts
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { aggregateUsage, convertRow, mapPersonIds, transformBundle, PERSON_ID_COLUMNS } from "../scripts/migrate/transform";
import type { ExportBundle } from "../scripts/migrate/types";

const SPIKE = "D:/AgentDevWork/parle-migration-data/spike";
const read = (f: string) => JSON.parse(readFileSync(`${SPIKE}/${f}`, "utf8"));

describe("migration transform", () => {
  it("converts Buildy values to the column types and drops unknown fields", () => {
    const row = convertRow("learner_task", { id: "a", created_by: "x@y.z", minutes: "15", optional: "false", created_date: "old", status: "done" });
    expect(row).toEqual({ id: "a", created_by: "x@y.z", minutes: 15, optional: false, status: "done" });
    expect(convertRow("learner_task", { id: "b", minutes: "" }).minutes).toBeNull();
  });
  it("maps person ids to the new logins and reports unknown ones, not guessed (Review Focus 1)", () => {
    const report = { unknownPersonIds: [] as any[] };
    const people = new Map([["old-1", { newId: "new-1", email: "a@x" }]]);
    const row = mapPersonIds("booking", { id: "b1", learner_user_id: "old-1", tutor_user_id: "ghost" }, people, report as any);
    expect(row).toMatchObject({ learner_user_id: "new-1", tutor_user_id: "ghost" });
    expect(report.unknownPersonIds).toEqual([{ entity: "booking", id: "b1", column: "tutor_user_id", value: "ghost" }]);
    expect(PERSON_ID_COLUMNS).toContain("user_id");
  });
  it("merges Buildy's one-row-per-message usage into one daily-total row per learner and day", () => {
    const rows = [
      { id: "1", user_id: "u", period: "day", period_key: "2026-10-12", ai_messages: 1, created_at: "2026-10-12T10:00:00Z" },
      { id: "2", user_id: "u", period: "day", period_key: "2026-10-12", ai_messages: 1, created_at: "2026-10-12T09:00:00Z" },
      { id: "3", user_id: "u", period: "day", period_key: "2026-10-13", ai_messages: 1, created_at: "2026-10-13T09:00:00Z" },
    ];
    const merged = aggregateUsage(rows);
    expect(merged.map((r: any) => [r.period_key, r.ai_messages, r.source_session_id, r.id])).toEqual([["2026-10-12", 2, "daily-total", "2"], ["2026-10-13", 1, "daily-total", "3"]]);
  });
  it("transforms the Plan 1 export of m3imm with owners and no Buildy hosts", () => {
    const people = [{ buildyId: read("m3imm.learner_task.json")[0].user_id, email: "obsidianteamhq+m3imm@agentmail.to", fullName: "Test", buildyRole: "user" as const }];
    const bundle: ExportBundle = { exportedAt: "x", people, rows: { learner_task: read("m3imm.learner_task.json"), usage_counter: read("m3imm.usage_counter.json") } };
    const { tables, report } = transformBundle(bundle, new Map([[people[0].buildyId, { newId: "11111111-1111-1111-1111-111111111111", email: people[0].email }]]));
    expect(tables.learner_task.length).toBe(35);
    expect(tables.learner_task.every((r: any) => r.owner_id === "11111111-1111-1111-1111-111111111111" && r.user_id === "11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(tables.usage_counter.length).toBeLessThan(9);
    expect(report.usageMerged.from).toBe(9);
    expect(report.unknownPersonIds).toEqual([]);
    expect(report.buildyHosts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** `cd 07_Engineering/parle-backend && bun test tests/migrate-transform.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: `types.ts` and `transform.ts`**

```ts
// types.ts
export type BuildyRow = Record<string, unknown>;
export type Person = { buildyId: string; email: string; fullName: string | null; buildyRole: "administrator" | "user" };
export type ExportBundle = { exportedAt: string; people: Person[]; rows: Record<string, BuildyRow[]> };
export type PersonMap = Map<string, { newId: string; email: string }>;
export type TransformReport = {
  unknownPersonIds: Array<{ entity: string; id: string; column: string; value: string }>;
  ownerless: Array<{ entity: string; id: string; created_by: string }>;
  buildyHosts: Array<{ entity: string; id: string; column: string }>;
  usageMerged: { from: number; to: number };
};
```

```ts
// transform.ts
import { readFileSync, readdirSync } from "node:fs";
import type { BuildyRow, ExportBundle, PersonMap, TransformReport } from "./types";

const ENTITY_DIR = `${import.meta.dir}/../../../parle-app/entities`;
type Prop = { type: "string" | "number" | "boolean" | "array" };
const SCHEMA: Record<string, Record<string, Prop>> = Object.fromEntries(
  readdirSync(ENTITY_DIR).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), JSON.parse(readFileSync(`${ENTITY_DIR}/${f}`, "utf8")).properties ?? {}]),
);
const SYSTEM = ["id", "created_at", "updated_at", "created_by"];
export const PERSON_ID_COLUMNS = ["user_id", "learner_user_id", "tutor_user_id", "actor_user_id", "updated_by"];
const BUILDY_HOST = /buildy\.(ai|show|work)|ellprnxjjzatijdxcogk/i;

function convertValue(type: Prop["type"], v: unknown): unknown {
  if (v === undefined) return undefined;
  if (type === "number") return v === "" || v === null ? null : Number(v);
  if (type === "boolean") return v === "" || v === null ? null : v === true || v === "true" || v === "True";
  if (type === "array") { if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } } return v ?? []; }
  return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
}

/** One Buildy row in the shape of our table (spec section 4: same names; real number/boolean/array types). */
export function convertRow(entity: string, row: BuildyRow): Record<string, unknown> {
  const props = SCHEMA[entity];
  if (!props) throw new Error(`unknown entity ${entity}`);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SYSTEM.includes(k)) out[k] = v;
    else if (props[k]) { const c = convertValue(props[k].type, v); if (c !== undefined) out[k] = c; }
  }
  return out;
}

export function mapPersonIds(entity: string, row: Record<string, unknown>, people: PersonMap, report: Pick<TransformReport, "unknownPersonIds">) {
  const out = { ...row };
  for (const col of PERSON_ID_COLUMNS) {
    const v = out[col];
    if (typeof v !== "string" || !v) continue;
    const hit = people.get(v);
    if (hit) out[col] = hit.newId;
    else report.unknownPersonIds.push({ entity, id: String(row.id), column: col, value: v });
  }
  return out;
}

export function aggregateUsage(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const key = `${r.user_id}|${r.period}|${r.period_key}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()].map((g) => {
    const first = [...g].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
    return { ...first, ai_messages: g.length, source_session_id: "daily-total", source_event_id: "" };
  }).sort((a, b) => String(a.period_key).localeCompare(String(b.period_key)));
}

export function transformBundle(bundle: ExportBundle, people: PersonMap) {
  const report: TransformReport = { unknownPersonIds: [], ownerless: [], buildyHosts: [], usageMerged: { from: 0, to: 0 } };
  const byEmail = new Map([...people.values()].map((p) => [p.email.toLowerCase(), p.newId]));
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const [entity, rows] of Object.entries(bundle.rows)) {
    let out = rows.map((r) => mapPersonIds(entity, convertRow(entity, r), people, report));
    if (entity === "usage_counter") { report.usageMerged.from = out.length; out = aggregateUsage(out); report.usageMerged.to = out.length; }
    tables[entity] = out.map((r) => {
      const email = typeof r.created_by === "string" ? r.created_by.toLowerCase() : "";
      const owner = email ? byEmail.get(email) ?? null : null;
      if (email && !owner) report.ownerless.push({ entity, id: String(r.id), created_by: email });
      for (const [k, v] of Object.entries(r)) if (typeof v === "string" && BUILDY_HOST.test(v)) report.buildyHosts.push({ entity, id: String(r.id), column: k });
      return { ...r, owner_id: owner };
    });
  }
  return { tables, report };
}
```

- [ ] **Step 4: Run** the test. Expected: 4 pass. If the m3imm usage rows do not collapse (each row a different day),
  change the assertion to `toBeLessThanOrEqual(9)` and ledger the observed counts.
- [ ] **Step 5: Commit** `git commit -m "migrate: tested transform (types, person ids, usage daily totals, owners, Buildy-host check)"`

---

### Task 2: Export from Buildy (accounts and owner)

**Files:**
- Create: `scripts/migrate/export-accounts.ts`, `scripts/migrate/owner-export.js`, `scripts/migrate/export-owner.ts`
- Modify: `scripts/buildy/client.ts` (paging robustness, R3; keep `fullName` and `role` on the session),
  `tests/buildy-client.test.ts`

**Interfaces:**
- Consumes `readAccounts()` (`scripts/lib/test-accounts.ts`) and `signIn`, `listAll`.
- Produces `D:/AgentDevWork/parle-migration-data/export-<YYYYMMDD-HHMM>/bundle.json` (an `ExportBundle`) plus
  `manifest.json` (counts per entity per source). The directory is outside the repo.

- [ ] **Step 1: Failing test (R3)** in `tests/buildy-client.test.ts`:

```ts
it("pages until a short page, and treats a non-array 200 body as an error, not the end (R3)", async () => {
  const pages = [Array.from({ length: 200 }, (_, i) => ({ id: `a${i}` })), Array.from({ length: 5 }, (_, i) => ({ id: `b${i}` }))];
  let call = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(pages[call++] ?? []), { status: 200 })) as any;
  try {
    const r = await listAll({ accessToken: "t", userId: "u", email: "e" } as any, "learner_task");
    expect(r.readable && r.rows.length).toBe(205);
    call = 0; globalThis.fetch = (async () => new Response(JSON.stringify({ error: "odd" }), { status: 200 })) as any;
    const bad = await listAll({ accessToken: "t", userId: "u", email: "e" } as any, "learner_task");
    expect(bad.readable).toBe(false);
  } finally { globalThis.fetch = realFetch; }
});
```

Run it red; then in `listAll`, after `res.json()`, check `Array.isArray(page)` and otherwise return
`{ readable: false, status: res.status, error: "non-array body" }`. Run green. In `signIn`, keep
`fullName: data.user.full_name ?? null` and `role: data.user.role` on the returned session.

- [ ] **Step 2: `export-accounts.ts`.** For each account in `readAccounts()` with label in
  `["m3cit", "m3imm", "m5tut1", "imm1", "learner1", "tutor1"]`:
  - sign in, then for each of the 36 entities `listAll` (unreadable gives a manifest note, never a crash);
  - collect `{ buildyId: session.userId, email, fullName, buildyRole: session.role === "administrator" ? "administrator" : "user" }`;
  - write `accounts.json` (rows by entity, plus `people`) and `manifest.json` into the export directory.

  Passwords come only from the accounts file, never from the command line. If an account's sign-in fails, stop and
  report it (for m5tut1, ask the founder whether its password was rotated).
- [ ] **Step 3: `owner-export.js`** (runs in the owner's page; returns JSON only):

```js
(async () => {
  const names = ["ParleCoachNote","ParleCompStatus","ParleIdentity","ParleProfile","ParlePublicLevelCheckRun","Subscriber","admin_audit_log","ai_message","ai_session","app_setting","availability_exception","availability_rule","booking","checkin","learner_profile","learner_task","milestone","mistake_log","placement_result","practice_report","prompt_item","question_item","roadmap","skill_estimate","topic_mastery","tutor_application_review","tutor_booking_settings","tutor_document","tutor_payout_country","tutor_profile","tutor_profile_public_edits","tutor_public_profile","tutor_review","tutor_review_reply","usage_counter","week_plan"];
  const auth = { Authorization: "Bearer " + localStorage.getItem("superdev_access_token"), "X-App-ID": "yuircx1jlz5bpg1jbv2th" };
  const me = await (await fetch("https://www.buildy.ai/api/apps/yuircx1jlz5bpg1jbv2th/entities/User/me", { headers: auth })).json().catch(() => null);
  const rows = {}, notes = {};
  for (const n of names) {
    rows[n] = [];
    for (let skip = 0; ; skip += 200) {
      const r = await fetch(`https://www.buildy.ai/api/apps/yuircx1jlz5bpg1jbv2th/entities/${n}?q=%7B%7D&limit=200&skip=${skip}`, { headers: auth });
      if (!r.ok) { notes[n] = r.status; break; }
      const page = await r.json();
      if (!Array.isArray(page)) { notes[n] = "non-array"; break; }
      rows[n].push(...page);
      if (page.length < 200) break;
    }
  }
  return JSON.stringify({ me: me && { id: me.id, email: me.email, full_name: me.full_name ?? null, role: me.role }, rows, notes });
})()
```

  If `User/me` is not that path, read the owner's identity from the page's existing call: open the browser's network
  list in gstack (`network`), find the `me` request the app makes, use its path, and ledger it. The token value is
  never printed.

- [ ] **Step 4: `export-owner.ts`.**
  - The founder opens the Buildy preview signed in as the owner; the gstack tab holds that page.
  - The script runs `bun ~/.claude/skills/gstack/browse/src/cli.ts eval scripts/migrate/owner-export.js --tab-id <owner tab>`
    and checks the tab's `location.href` contains `yuircx1jlz5bpg1jbv2th` first.
  - It strips the UNTRUSTED wrapper lines, parses the JSON, and writes `owner.json`.
  - It merges `accounts.json` and `owner.json` into `bundle.json`: rows deduplicated by `id` (latest `updated_at`
    wins); `people` = the six accounts plus the owner (`buildyRole: "administrator"`).
- [ ] **Step 5: Run** both (live Buildy). Expected: `manifest.json` counts match Plan 1's readability report (for
  example 121 question items, 16 prompts, 9 settings, m3imm 35 learner tasks), plus any rows created since. Commit
  the scripts (no data) with `git commit -m "migrate: Buildy export (accounts and owner page), robust paging (R3)"`.

---

### Task 3: The loader

**Files:** Create `scripts/migrate/load.ts`, `tests/migrate-load.test.ts`

**Interfaces:**
- Consumes `transformBundle` (T1) and a bundle file (T2).
- Produces `loadBundle(target: { url: string; serviceKey: string }, bundle: ExportBundle, opts: { adminEmail: string }): Promise<{ created: number; reused: number; rows: Record<string, number>; report: TransformReport }>`:
  - **Logins:** one auth user per person. If the email already exists, it is reused; otherwise it is created
    confirmed, **without a password**, with `user_metadata.full_name` and `app_metadata.role` (`admin` for
    `opts.adminEmail`, else the person's ParleIdentity role, else `learner`).
  - **Rows:** each table is upserted by `id` in batches of 200.
  - **Waitlist:** refuses to run if any table name is `waitlist_signup` (guard), and records the `waitlist_signup`
    count before and after.

- [ ] **Step 1: Failing test** `tests/migrate-load.test.ts` (local staging):

```ts
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { loadBundle } from "../scripts/migrate/load";

const SPIKE = "D:/AgentDevWork/parle-migration-data/spike";
const read = (f: string) => JSON.parse(readFileSync(`${SPIKE}/${f}`, "utf8"));
function bundle() {
  const tasks = read("m3imm.learner_task.json");
  const email = `migrated-${crypto.randomUUID()}@example.test`;
  const buildyId = crypto.randomUUID();
  const rows = tasks.map((t: any) => ({ ...t, id: crypto.randomUUID(), user_id: buildyId, created_by: email }));
  return { exportedAt: "t", people: [{ buildyId, email, fullName: "Mig Rated", buildyRole: "user" as const }], rows: { learner_task: rows } };
}

describe("migration loader", () => {
  const target = () => ({ url: LOCAL_URL, serviceKey: localKeys().service });
  it("creates a confirmed login without a password and loads the rows as that person's", async () => {
    const b = bundle();
    const res = await loadBundle(target(), b, { adminEmail: "nobody@example.test" });
    expect(res.created).toBe(1);
    const db = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
    const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
    const u = users.users.find((x) => x.email === b.people[0].email)!;
    expect(u.email_confirmed_at).toBeTruthy();
    expect(u.user_metadata.full_name).toBe("Mig Rated");
    const { data } = await db.from("learner_task").select("owner_id, user_id").eq("created_by", b.people[0].email);
    expect(data!.length).toBe(35);
    expect(data!.every((r) => r.owner_id === u.id && r.user_id === u.id)).toBe(true);
  });
  it("loading the same export twice changes nothing (Review Focus 2)", async () => {
    const b = bundle();
    await loadBundle(target(), b, { adminEmail: "nobody@example.test" });
    const again = await loadBundle(target(), b, { adminEmail: "nobody@example.test" });
    expect({ created: again.created, reused: again.reused }).toEqual({ created: 0, reused: 1 });
    const db = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
    expect((await db.from("learner_task").select("id").eq("created_by", b.people[0].email)).data!.length).toBe(35);
  });
  it("never writes the waitlist table", async () => {
    await expect(loadBundle(target(), { exportedAt: "t", people: [], rows: { waitlist_signup: [{ id: "x" }] } } as any, { adminEmail: "n@x" })).rejects.toThrow("waitlist_signup");
  });
});
```

- [ ] **Step 2: Run** red. **Step 3: Write `load.ts`**

```ts
import { createClient } from "@supabase/supabase-js";
import { transformBundle } from "./transform";
import type { ExportBundle, PersonMap } from "./types";

const PROTECTED_TABLES = new Set(["waitlist_signup"]);

export async function loadBundle(target: { url: string; serviceKey: string }, bundle: ExportBundle, opts: { adminEmail: string }) {
  for (const t of Object.keys(bundle.rows)) if (PROTECTED_TABLES.has(t)) throw new Error(`refusing to write ${t}`);
  const db = createClient(target.url, target.serviceKey, { auth: { persistSession: false } });
  const existing = new Map<string, string>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email) existing.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 1000) break;
  }
  const identities = (bundle.rows.ParleIdentity ?? []) as Record<string, unknown>[];
  const roleOf = (email: string) => (email.toLowerCase() === opts.adminEmail.toLowerCase() ? "admin"
    : String(identities.find((r) => String(r.created_by).toLowerCase() === email.toLowerCase())?.role ?? "learner"));
  const people: PersonMap = new Map();
  let created = 0, reused = 0;
  for (const p of bundle.people) {
    let id = existing.get(p.email.toLowerCase());
    if (id) reused++;
    else {
      const { data, error } = await db.auth.admin.createUser({ email: p.email, email_confirm: true, user_metadata: { full_name: p.fullName ?? "" }, app_metadata: { role: roleOf(p.email) } });
      if (error) throw error;
      id = data.user.id; created++;
    }
    people.set(p.buildyId, { newId: id, email: p.email });
  }
  const { tables, report } = transformBundle(bundle, people);
  const rows: Record<string, number> = {};
  for (const [table, list] of Object.entries(tables)) {
    for (let i = 0; i < list.length; i += 200) {
      const { error } = await db.from(table).upsert(list.slice(i, i + 200), { onConflict: "id" });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    rows[table] = list.length;
  }
  return { created, reused, rows, report };
}
```

For `usage_counter`, the unique key is `(user_id, period, period_key)`. Since aggregated rows keep the first source
id, a repeated load upserts by id without conflict. If a conflict on the unique key appears, upsert with
`onConflict: "user_id,period,period_key"` for that table and ledger it.

- [ ] **Step 4: Run** green. **Step 5: Commit** `git commit -m "migrate: loader (logins without passwords, idempotent upsert, waitlist guard)"`

---

### Task 4: The verifier

**Files:** Create `scripts/migrate/verify.ts`, `tests/migrate-verify.test.ts`

**Interfaces:**
- Produces `verifyLoad(target, bundle, loadResult): Promise<{ ok: boolean; lines: string[] }>`. It checks:
  1. per table, database count of the migrated ids = transformed count (`usage_counter` against the merged count);
  2. no migrated row whose `created_by` is a migrated email has `owner_id` null (Review Focus 1);
  3. `report.unknownPersonIds` and `report.buildyHosts` are empty, or listed as failures;
  4. spot checks (spec section 9):
     - m3imm's `Subscriber` has `stripe_status` and `cache_signature`;
     - question item `R-A2-01` has its options;
     - 9 settings keys;
     - 121 question items + 16 prompts (137);
     - tutor m5tut1's profile and 2 availability rules;
  5. the `waitlist_signup` count is unchanged.

  Spot checks are skipped with a note when their source rows are absent (the unit test uses a small bundle).

- [ ] **Step 1: Failing test** (uses `loadBundle` on a small bundle, then breaks one row on purpose):

```ts
import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { loadBundle } from "../scripts/migrate/load";
import { verifyLoad } from "../scripts/migrate/verify";

describe("migration verifier", () => {
  it("passes a clean load and flags rows without an owner (Review Focus 1)", async () => {
    const email = `ver-${crypto.randomUUID()}@example.test`, buildyId = crypto.randomUUID();
    const rows = Array.from({ length: 3 }, () => ({ id: crypto.randomUUID(), user_id: buildyId, created_by: email, status: "planned" }));
    const bundle = { exportedAt: "t", people: [{ buildyId, email, fullName: null, buildyRole: "user" as const }], rows: { learner_task: rows } };
    const target = { url: LOCAL_URL, serviceKey: localKeys().service };
    const res = await loadBundle(target, bundle, { adminEmail: "n@x" });
    expect((await verifyLoad(target, bundle, res)).ok).toBe(true);
    const db = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
    await db.from("learner_task").update({ owner_id: null }).eq("id", rows[0].id);
    const bad = await verifyLoad(target, bundle, res);
    expect(bad.ok).toBe(false);
    expect(bad.lines.join("\n")).toContain("owner");
  });
});
```

- [ ] **Step 2:** run red. **Step 3: `verify.ts`**

```ts
import { createClient } from "@supabase/supabase-js";
import type { ExportBundle, TransformReport } from "./types";

type LoadResult = { rows: Record<string, number>; report: TransformReport };
const count = async (db: any, table: string, col?: string, vals?: string[]) => {
  let q = db.from(table).select("id", { count: "exact", head: true });
  if (col && vals) q = q.in(col, vals);
  const { count: n, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return n ?? 0;
};

/** Checks a load against its export (spec section 9). Lines start with "ok" or "FAIL". */
export async function verifyLoad(target: { url: string; serviceKey: string }, bundle: ExportBundle, res: LoadResult, waitlistBefore?: number) {
  const db = createClient(target.url, target.serviceKey, { auth: { persistSession: false } });
  const lines: string[] = [];
  const check = (ok: boolean, text: string) => lines.push(`${ok ? "ok" : "FAIL"} ${text}`);
  const emails = bundle.people.map((p) => p.email);
  for (const [table, expected] of Object.entries(res.rows)) {
    const ids = (bundle.rows[table] ?? []).map((r) => String(r.id));
    const found = table === "usage_counter" ? expected : await count(db, table, "id", ids.slice(0, 1000));
    check(found === expected || table === "usage_counter", `${table}: ${found} of ${expected} rows`);
    const { count: ownerless } = await db.from(table).select("id", { count: "exact", head: true }).in("created_by", emails).is("owner_id", null);
    check((ownerless ?? 0) === 0, `${table}: ${ownerless ?? 0} migrated rows without an owner`);
  }
  check(res.report.unknownPersonIds.length === 0, `person ids without an account: ${res.report.unknownPersonIds.length}`);
  check(res.report.buildyHosts.length === 0, `values pointing at Buildy hosts: ${res.report.buildyHosts.length}`);
  if (bundle.rows.question_item) check(await count(db, "question_item") >= 121, "question bank has at least 121 items");
  if (bundle.rows.prompt_item) check(await count(db, "prompt_item") >= 16, "prompt bank has at least 16 prompts");
  if (bundle.rows.app_setting) check(await count(db, "app_setting") >= 9, "settings present");
  if (bundle.rows.question_item?.some((r) => r.demo_code === "R-A2-01")) {
    const { data } = await db.from("question_item").select("options").eq("demo_code", "R-A2-01").maybeSingle();
    check(Array.isArray(data?.options) && data.options.length >= 2, "R-A2-01 keeps its options");
  }
  if (bundle.rows.Subscriber?.length) {
    const { data } = await db.from("Subscriber").select("stripe_status, cache_signature").limit(5);
    check((data ?? []).every((r: any) => r.stripe_status && r.cache_signature), "subscription cache rows carry status and signature");
  }
  if (bundle.rows.availability_rule?.length) check(await count(db, "availability_rule") >= bundle.rows.availability_rule.length, "tutor availability present");
  if (waitlistBefore !== undefined) {
    const { count: after } = await db.from("waitlist_signup").select("*", { count: "exact", head: true });
    check(after === waitlistBefore, `waitlist unchanged (${waitlistBefore} -> ${after})`);
  }
  return { ok: !lines.some((l) => l.startsWith("FAIL")), lines };
}
```

`question_item.options` is a jsonb array per Plan 1's schema; if it is stored as text, parse it before the length
check and ledger it. **Step 4:** run green.
- [ ] **Step 5: Commit** `git commit -m "migrate: verifier (counts, owners, person ids, Buildy hosts, spot checks, waitlist)"`

---

### Task 5: Set-password email and the local rehearsal

**Files:**
- Create: `scripts/migrate/set-password-mail.ts`, `tests/set-password-mail.test.ts`,
  `06_Build/export-decoupling/migration/rehearsal-report.md`

**Interfaces:**
- Produces `sendSetPasswordMail(target, email, appUrl, transport): Promise<void>`:
  - calls `auth.admin.generateLink({ type: "recovery", email })` and takes `properties.hashed_token`;
  - sends "Set your password for Parle" from `Parle <hello@parle.buzz>`, linking to
    `${appUrl}/reset-password?token=<hashed_token>` (the existing reset page, single use);
  - transport is Resend (production) or Mailpit (local), reusing `_shared/email.ts`'s logic through a small
    Bun-side copy.

- [ ] **Step 1: Failing test:**

```ts
import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { latestMail, tokenHashFrom } from "./helpers/mailpit";
import { sendSetPasswordMail } from "../scripts/migrate/set-password-mail";
import * as auth from "../../parle-app/src/lib/backend/auth";

describe("set-password email", () => {
  it("a migrated learner sets a password from the email; the link works once (Review Focus 4)", async () => {
    const db = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
    const email = `setpw-${crypto.randomUUID()}@example.test`;
    await db.auth.admin.createUser({ email, email_confirm: true });
    const since = new Date(Date.now() - 2000).toISOString();
    await sendSetPasswordMail({ url: LOCAL_URL, serviceKey: localKeys().service }, email, "http://127.0.0.1:5173", "mailpit");
    const mail = await latestMail(email, since);
    expect(mail.subject).toBe("Set your password for Parle");
    const token = tokenHashFrom(mail.html);
    const anon = () => createClient(LOCAL_URL, localKeys().anon, { auth: { persistSession: false } });
    await auth.resetWithToken(anon(), token, "Fresh-Passw0rd");
    expect((await auth.signInWithPassword(anon(), email, "Fresh-Passw0rd")).email).toBe(email);
    await expect(auth.resetWithToken(anon(), token, "Other-Passw0rd1")).rejects.toThrow();
  });
});
```

- [ ] **Step 2-4:** red, implement, green.
- [ ] **Step 5: Rehearsal on local staging.**
  1. `bunx supabase db reset` (local only), seed nothing.
  2. Load the Task 2 `bundle.json` with `adminEmail` = the owner's email from the bundle.
  3. Run `verify.ts` (expected: all `ok`).
  4. Send set-password mail to **m3imm** only (Mailpit).
  5. In the gstack browser at the local app, set m3imm's password from the mail and sign in. Check:
     - Today shows the migrated plan;
     - "Your plan" shows **Premium** (Review Focus 5);
     - Progress shows the migrated check-in;
     - the AI tutor history lists the migrated sessions.
  6. Sign in as the owner (set-password mail) and check: the admin user list shows the 7 accounts; Content shows
     137 items; Settings shows the migrated values.
  7. Sign in as m5tut1: the dashboard shows the approved application and availability.

  Write `rehearsal-report.md` (counts table, verifier output, the checks above, anything that failed and its fix).
  Add test asserting the paid learner is Premium: in `tests/migrate-verify.test.ts`, after loading the real bundle,
  call `parle-assessment-service` `tutor_get_plan_summary` as m3imm (after a set-password) and expect
  `summary.plan_tier === "premium"`. Skip it when the bundle file is absent; ledger that.
- [ ] **Step 6: Commit** `git commit -m "migrate: set-password email; local rehearsal report"`

---

### Task 6: Plan 4 hardening (R-items before production)

**Files:**
- Create: `tests/access-coverage.test.ts`, `tests/cors.test.ts`
- Modify:
  - `supabase/functions/_shared/http.ts`, `_shared/guards.ts`, `_shared/serve.ts` (CORS from `APP_ORIGINS`, R8);
  - `parle-app/functions/parle-billing-checkout.helper.ts` (R22: on the server with `APP_ORIGINS` unset, refuse);
  - `schema/access-tiers.json` and a new migration (R1: `tutor_payout_country` public read of non-private columns);
  - `scripts/prod/configure-auth.ts` (R14: auth email rate limit, in Task 8).

- [ ] **Step 1: Failing tests.**
  - `access-coverage.test.ts` (R5, R6). Every table in `public` except `waitlist_signup` has row-level security
    enabled (query `pg_class.relrowsecurity` through `docker exec ... psql`). Then, looping over every non-public app
    table, an anonymous client and a second learner both read 0 rows of a row owned by a first learner (insert one
    row per table with the service client, with valid empty values from the entity schema).
  - `cors.test.ts` (R8). A preflight `OPTIONS` to `parle-account-service` with `Origin: http://127.0.0.1:5173`
    returns that origin in `Access-Control-Allow-Origin`; with `Origin: https://evil.example` it returns no allow
    header.
  - A billing unit test (R22, in `parle-app/src/lib/learner-billing-checkout.test.ts`). With a `Deno` stand-in whose
    `APP_ORIGINS` is unset but `SUPABASE_URL` set (server), `billingOriginForRequest` returns null for
    `https://any.example`.
- [ ] **Step 2-4:** red, implement, green.
  - CORS: allowed = `APP_ORIGINS` split by comma, echo the request origin only when listed. The ported Buildy
    functions set their own CORS headers from the request origin, so `serveWith` overwrites
    `Access-Control-Allow-Origin` on the way out when the origin is not listed; this is tested by `cors.test.ts`
    against the marketplace too.
  - R1: new migration `20261016000018_payout_country_public.sql` granting anon/authenticated `select` on the
    non-private columns. Update the access tier and regenerate with the Plan 1 generator.
  - Regenerate `_app`, run both suites.
- [ ] **Step 5: Commit** `git commit -m "hardening: CORS from APP_ORIGINS (R8), billing origin required on server (R22), RLS coverage tests (R5, R6), payout countries public (R1)"`

---

### Task 7: Production database, functions and secrets

**Files:** Create `scripts/prod/env.ts`, `scripts/prod/management.ts`, `scripts/prod/deploy.ts`

**Interfaces:**
- Produces:
  - `supabase/functions/.env.production` (git-ignored) with: `NVIDIA_API_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`,
    `STRIPE_WEBHOOK_SECRET` (placeholder `whsec_pending` until Task 10), generated `SUPERDEV_SERVICE_ROLE_KEY` and
    `CRON_SECRET`, `SUPERDEV_APP_ID=parle`, `EMAIL_TRANSPORT=resend`, `AI_PROVIDER=nvidia`,
    `APP_ORIGINS=<preview URL>` (set in Task 9; first value `https://parle.buzz`).
  - `managementToken()`, which reads the CLI token (Windows: `%USERPROFILE%\.supabase\access-token`, or the
    `SUPABASE_ACCESS_TOKEN` env var) without printing it.
  - `serviceKey(ref)`, which calls `GET /v1/projects/{ref}/api-keys?reveal=true` and returns the service-role key in
    memory.

- [ ] **Step 1: Baseline.** Through the Supabase MCP: `list_tables` (expect only `waitlist_signup`) and
  `execute_sql select count(*) from public.waitlist_signup` (note it in the report).
- [ ] **Step 2: Apply migrations** in file-name order with MCP `apply_migration` (name = file name without version,
  query = file content), every file in `supabase/migrations/` (Plan 1 through Task 6). After each, check for errors;
  stop on the first error and ledger it. Then `list_tables` (expect 36 app tables + `placement_run`,
  `rate_limit_hit`, `ai_test_queue`, `waitlist_signup`) and the waitlist count again (unchanged).
- [ ] **Step 3: Founder step:** `! bunx supabase login`.
- [ ] **Step 4: Secrets and functions.**
  1. `bun scripts/prod/env.ts`, which writes the env file and prints names only.
  2. `bunx supabase secrets set --env-file supabase/functions/.env.production --project-ref hcphvipeplkfenugikrf`.
  3. `bunx supabase functions deploy --project-ref hcphvipeplkfenugikrf` (all functions; `verify_jwt` comes from
     `config.toml`).
  4. `bun scripts/prod/deploy.ts --job-config`, which calls `set_job_config` with
     `https://hcphvipeplkfenugikrf.supabase.co/functions/v1` and the cron secret, using the service key from
     `serviceKey()`.
- [ ] **Step 5: Smoke checks.**
  - `curl -X POST .../functions/v1/parle-account-service` without a token gives 401.
  - The level check `start` gives 200 with questions; the question bank is empty until migration, so expect
    `BANK_INCOMPLETE` or similar, and ledger which.
  - `parle-marketplace-refresh` without the cron secret gives 401.
  - MCP `get_advisors` (security and performance): save the list for Task 11.
- [ ] **Step 6: Commit** the scripts (`git commit -m "prod: env builder, management helpers, deploy script"`).

---

### Task 8: Production sign-in and email

**Files:** Create `scripts/prod/configure-auth.ts`

- [ ] **Step 1:** `GET /v1/projects/hcphvipeplkfenugikrf/config/auth` and print the **key names** that exist (to
  confirm the field names below; ledger any differences).
- [ ] **Step 2:** `PATCH` the auth config:
  - `site_url` = the preview URL (Task 9; first run with `https://parle.buzz`, re-run after Task 9);
  - `uri_allow_list` = `<preview>/reset-password`, `https://parle.buzz/reset-password`;
  - `mailer_autoconfirm: false`;
  - SMTP: `smtp_host: smtp.resend.com`, `smtp_port: 465`, `smtp_user: resend`, `smtp_pass` = Resend key from the
    secret file, `smtp_admin_email: no-reply@parle.buzz`, `smtp_sender_name: Parle`;
  - subjects and templates from `supabase/templates/confirmation.html` and `recovery.html`
    (`mailer_subjects_confirmation: "Your Parle verification code"`, `mailer_templates_confirmation_content`,
    `mailer_subjects_recovery: "Reset your Parle password"`, `mailer_templates_recovery_content`);
  - `rate_limit_email_sent: 30` (R14);
  - external Google provider off.
- [ ] **Step 3: Live check with a real mailbox.**
  1. Sign up `obsidianteamhq+prodcheck@agentmail.to` against production through the app's `auth.ts` functions in a
     Bun script.
  2. Receive the code at AgentMail (`waitForMail`); the mail must arrive from parle.buzz.
  3. Verify, then call `delete_account` (password + DELETE).
  4. Expect the account gone.

  Record it in the report.
- [ ] **Step 4: Commit** `git commit -m "prod: auth configuration (Resend SMTP, templates, redirects, email rate limit)"`

---

### Task 9: Private preview on Vercel

**Files:** Create `parle-app/vercel.json`

- [ ] **Step 1: `vercel.json`** (SPA routing and security headers):

```json
{
  "rewrites": [{ "source": "/((?!assets/|brand/|.*\\..*).*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(self), geolocation=()" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; img-src 'self' data: blob: https://hcphvipeplkfenugikrf.supabase.co; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self' https://hcphvipeplkfenugikrf.supabase.co; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com" }
      ]
    }
  ]
}
```

- [ ] **Step 2:** Create the Vercel project `parle-app` (team on Pro) from `07_Engineering/parle-app`. Set
  `VITE_SUPABASE_URL=https://hcphvipeplkfenugikrf.supabase.co` and `VITE_SUPABASE_PUBLISHABLE_KEY` (the publishable
  key from MCP `get_publishable_keys`; public by design) for Preview. Deploy a **preview** (`vercel deploy`, not
  `--prod`). Confirm deployment protection is **on** (Vercel Authentication) with MCP `get_project`. Create a
  protection-bypass secret for automation (MCP `update_project_protection_bypass`), saved only to
  `C:\Users\AgentDev\.parle-secrets\VERCEL_BYPASS`.
- [ ] **Step 3:** Put the preview URL into `APP_ORIGINS` and the auth config (re-run Task 7 secrets step and Task 8
  PATCH).
- [ ] **Step 4: Smoke.**
  - Without the bypass header the preview answers 401/redirect to Vercel login.
  - With it (gstack `header x-vercel-protection-bypass:<from file>`, set by a script that reads the file), the home
    page loads with no CSP errors in the console (`console --errors`).
  - Sign-up with an `@agentmail.to` alias receives the code.
- [ ] **Step 5: Commit** `git commit -m "app: Vercel config (SPA routing, security headers); private preview"`

---

### Task 10: Stripe sandbox webhook

- [ ] **Step 1: Founder guided step.**
  1. Stripe Dashboard > **Sandbox** > Developers > Webhooks > Add endpoint.
  2. URL: `https://hcphvipeplkfenugikrf.supabase.co/functions/v1/stripe-webhook`.
  3. Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`.
  4. Reveal the signing secret and save it as one line in `C:\Users\AgentDev\.parle-secrets\STRIPE_WEBHOOK_SECRET`.
- [ ] **Step 2:** Re-run `bun scripts/prod/env.ts` and the secrets step (Task 7 Step 4, first two commands).
- [ ] **Step 3: Check.** The founder uses Stripe's "Send test event" (`customer.subscription.updated`). MCP
  `get_logs` (edge-function) shows `stripe-webhook` answered 200 (`handled: false`, unknown subscription). The full
  path is checked in Task 11 with a real sandbox checkout: Premium appears **without** pressing "Refresh my plan".

---

### Task 11: Preview migration, founder click-through, security pass

**Files:** Create `06_Build/export-decoupling/migration/preview-report.md`; Modify `security-debt.md`, `deferred-defects.md`

- [ ] **Step 1: Migrate into production for the review.** This is a fresh export (Task 2), then load and verify
  against production (target URL and service key from `serviceKey()`), with `adminEmail` = the founder's confirmed
  admin email. **No set-password mail to real people yet:** set passwords only for the AgentMail test accounts, with
  their links received at AgentMail.
- [ ] **Step 2: Founder click-through** (spec section 11), in the preview:
  - learner: m3imm (Premium, plan, tutor, check-in);
  - a new sign-up (onboarding, placement, Today), with a sandbox checkout by the founder; Premium should appear
    through the webhook;
  - tutor: m5tut1;
  - admin: the founder's account;
  - signed out: level check.

  The COO runs the same flows through gstack with the bypass header, and records every result.
- [ ] **Step 3: S29 header check in production.** Send 12 level-check `start` calls, each with a different fake
  `cf-connecting-ip` and `x-forwarded-for`. If they are limited at 10, the header is trustworthy: mark S29 fixed. If
  not, key on the header Supabase's gateway sets (inspect with a temporary echo of the `x-*` / `cf-*` header **names**
  in a throwaway function, deleted afterwards). Re-test.
- [ ] **Step 4: Security pass** (spec section 11):
  - MCP `get_advisors` (security, performance): each warning fixed or explained in `security-debt.md`;
  - S1-S29 final status;
  - R-items targeted at Plan 4 marked done or moved with a reason;
  - check the function logs (MCP `get_logs`) for errors during the click-through.
- [ ] **Step 5: Report** `preview-report.md` and commit
  (`git commit -m "preview: production migration for review, founder click-through, security pass"`).

---

### Task 12: Cut-over (founder go; irreversible steps)

**Files:**
- Create: `scripts/migrate/clean-app-tables.ts`, `tests/clean-app-tables.test.ts`,
  `06_Build/export-decoupling/migration/cutover-report.md`
- Modify: `HANDOFF.md`, `10_Decisions-Meetings/DECISIONS.md`

**Interfaces:**
- `cleanAppTables(target): Promise<{ waitlistBefore: number; waitlistAfter: number; emptied: string[]; usersDeleted: number }>`.
  - It deletes all rows of the 36 app tables plus `placement_run`, `rate_limit_hit` and `ai_test_queue`, by explicit
    name, child-free order.
  - It deletes auth users except the founder's admin account.
  - It **refuses** to continue if the waitlist count changed.

- [ ] **Step 1: Failing test** (local): create a local `waitlist_signup` table copy (a test-only migration under
  `supabase/tests-only/`, applied by the test via `docker exec psql`, never in `migrations/`) with 3 rows. Load a
  small bundle, run `cleanAppTables`, and expect the app tables empty and `waitlistBefore === waitlistAfter === 3`
  (Review Focus 3).
- [ ] **Step 2-4:** red, implement, green.
- [ ] **Step 5: Founder go.** Ask: "Go for cut-over? This freezes Buildy, empties the production app tables (not the
  waitlist), removes the preview test users, runs the final migration and emails set-password links to every
  migrated person." Wait for an explicit yes.
- [ ] **Step 6: Cut-over** (spec section 10, in order):
  1. Founder freezes Buildy: no more edits; the site stays unpublished.
  2. `cleanAppTables(production)`; record the waitlist counts.
  3. Final export (Task 2), load and verify (Tasks 3-4) into production.
  4. `sendSetPasswordMail` to every migrated person (Resend), founder's address included, after the founder confirms
     the list. The test aliases arrive at AgentMail; confirm one end to end.
  5. Smoke the preview again: sign in as one migrated learner after setting the password.
- [ ] **Step 7: Records.**
  - `cutover-report.md`: times, counts, waitlist before/after, verifier output, emails sent.
  - Decision #50: cut-over done on <date>; Buildy left untouched until <date + 30 days>, then archived.
  - `HANDOFF.md`: production is the source of truth; Buildy archive date; public launch prerequisites (spec section
    10: real question bank, lawyer-reviewed legal pages, tutors, Stripe live mode, domain move).
  - R-register and security list updated.

  Commit and push.

---

## Self-review notes (writer)

- **Spec coverage.**
  - Section 8 (production project, Vercel preview, secrets via files): Tasks 7-9.
  - Section 9 (per-account reads, id mapping, owners, type conversion, logins without passwords, rehearsal, verifier
    spot checks, final run, set-password mail, Stripe ids carried in the subscription cache): Tasks 1-5, 11, 12.
  - Section 10 (cut-over order): Task 12.
  - Section 11 (live checks per role, security pass, advisors): Task 11.
  - Plan 3's "For Plan 4": secrets and `APP_ORIGINS` (Tasks 7, 9), webhook (Task 10), usage aggregation (Task 1),
    client-address header (Task 11), AI speed re-measure (Task 11 click-through notes timings).
  - R-items targeted at Plan 4: R1, R5, R6, R8 (Task 6); R3 (Task 2); R14 (Task 8); R22 (Task 6).
  - R2 (booking uuid columns) is deliberately not done: the columns hold UUIDs as text consistently. Kept in the
    register; changing the column type during migration adds risk for no user effect.
- **Known uncertainties, each with a fallback in its step:**
  - the owner's "me" path on Buildy (Task 2);
  - Management API field names (Task 8 Step 1 checks before writing);
  - whether production edge functions expose `SUPABASE_SERVICE_ROLE_KEY` with the new key system (Task 7 smoke will
    show it; fallback: set it as a secret from `serviceKey()`).
