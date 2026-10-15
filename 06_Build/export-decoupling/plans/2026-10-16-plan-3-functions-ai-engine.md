# Backend Plan 3: server functions, AI, email, jobs, plan engine and account deletion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every screen that worked on Buildy works against local staging, with no code path calling Buildy. That means
the four Buildy server functions ported, AI on NVIDIA, app email on Resend, scheduled jobs on pg_cron, a Stripe
webhook, the study-plan engine and placement scoring on the server, and "Delete my account".

**Architecture:** Buildy's server code (`parle-app/functions/*.ts`, about 13,000 lines) runs **unchanged** in Supabase
Edge Functions. A generator copies it, and the app modules the server needs, into
`supabase/functions/_app/`, and swaps Buildy's client import for `_shared/superdev-compat.ts`. That is a drop-in
`createSuperdevClient` which enforces each entity's **own Buildy access rule** (read from `entities/*.json`) for the
calling user while running with full database rights, so the code keeps exactly the permissions it was written and
tested against. The browser's plan engine (`learner-plan.ts`) runs the same way inside a new `parle-plan-service`,
whose `@/entities` and `@/functions` imports resolve to per-request server stand-ins; the browser keeps only read-only
helpers and calls the service. AI, email and rate limits are small shared modules.

**Tech Stack:** Supabase (Postgres, Auth, Edge Functions on Deno, Storage, pg_cron, pg_net), supabase-js 2, Bun tests
against the local stack, NVIDIA API (OpenAI-compatible chat), Resend, Stripe 14.21 (sandbox only).

**Spec:** `06_Build/export-decoupling/specs/2026-10-14-backend-decoupling-design.md` (sections 4, 5, 6, 7, 10a phases 3-4,
11). Decision #48: the plan engine moves to the server (Option A), with no temporary browser-write rules.

## Before you start (founder steps)

1. **Docker Desktop running** (ask the founder). Start the stack:
   `cd 07_Engineering/parle-backend && bunx supabase start -x imgproxy,vector,logflare,supavisor`. Stop it when the session ends.
2. **Stripe sandbox secret key** saved by the founder as one line (`sk_test_...`, or `STRIPE_SECRET_KEY=sk_test_...`)
   in `C:\Users\AgentDev\.parle-secrets\STRIPE_SECRET_KEY`, from Stripe Dashboard > Sandbox > Developers > API keys.
   Not needed until Task 8. If it is missing, the billing checks in Tasks 8, 10 and 16 are recorded as "not run".
3. **AI model choice** (Task 15): the founder reads the bake-off report and picks the models.
4. **One Stripe sandbox checkout click** in Task 16 (the agent's permission system refuses checkout clicks).

## Global Constraints

- Secrets (`NVIDIA_API_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, generated local secrets) are never printed, logged,
  committed or put on a command line; scripts read them from `C:\Users\AgentDev\.parle-secrets\` or `supabase/functions/.env`
  (git-ignored by `parle-backend/.gitignore` rule `.env*`).
- Production Supabase (`hcphvipeplkfenugikrf`) is **not touched** in this plan. Everything runs on local staging.
- Stripe stays sandbox only. Live-mode Stripe events are refused.
- No browser writes to app tables (spec section 4): every write goes through an Edge Function.
- Error replies keep Buildy's shapes: `{ error }` from ported code, `{ error, error_code, message }` from new code (spec section 6).
- String fields stay `text`; empty values are `""` (spec section 4).
- New user-facing text is English only (decision #14); add keys to `src/lib/i18n.ts`.
- Edit Buildy server code only in `parle-app/functions/` (the source); never edit `supabase/functions/_app/` (generated).
- Never force-push. Commit messages end with the attribution lines in the session's system reminder.

## Review Focus

1. **Someone else's ids in a request.** A learner sends another learner's `task_id`, `session_id`, booking id or
   placement run id to any ported action. They must get a "not found / not yours" answer, never the other person's
   data or a write to it. Tests: Task 5 "caller reads only rows its Buildy rule allows" and "update cannot touch or
   move another user's row"; Task 11 "a learner cannot complete another learner's task"; Task 12 "an answer for a run
   that is not yours is refused".
2. **Two users at the same moment.** Concurrent requests to one function worker must never mix identities, since
   `per_worker` keeps one isolate for many requests. Test: Task 11 "two learners at once each get their own plan".
3. **Bad AI output.** Malformed, empty or failing AI output must lead to a clear fallback or error, never a stored
   half-result, and never a silent second charge. Tests: Task 4 "invalid twice gives AI_OUTPUT_INVALID"; Task 8
   "coach note falls back when the AI fails".
4. **Answer keys in the browser.** The placement test and the public level check must not send an answer before the
   learner has answered. Tests: Task 7 "start returns questions without answers"; Task 12 "questions are served without
   answers; feedback only after answering".
5. **Account deletion.** It removes every personal row and the login, keeps other people's records (bookings, review
   stars) without personal data, and is refused without the password. Tests: Task 13.

---

## File map

```
07_Engineering/parle-backend/
  scripts/
    seed-local-content.ts            (T1) loads demo question/prompt items + settings from the Plan 1 export
    setup-local-functions-env.ts     (T1) writes supabase/functions/.env (git-ignored) and private.job_config
    schema/generate-entity-rules.ts  (T5) entities/*.json "rls" -> supabase/functions/_shared/entity-rules.json
    sync-app-code.ts                 (T6) copies Buildy functions + app modules into supabase/functions/_app/
    ai-bakeoff.ts                    (T15) fixed prompt set through candidate NVIDIA models
  supabase/
    config.toml                      (T1) [functions.*] verify_jwt = false for every function
    migrations/
      20261016000001_rate_limits.sql         (T2)
      20261016000002_ai_test_queue.sql       (T4)
      20261016000003_setting_with_audit.sql  (T9)
      20261016000004_jobs.sql                (T10)
      20261016000005_placement_run.sql       (T12)
    functions/
      _shared/rate-limit.ts  email.ts  json-schema.ts  ai.ts  rules.ts  entity-rules.json
              superdev-compat.ts  serve.ts  guards.ts  account-deletion.ts
              app-shims/context.ts  app-shims/entities.ts  app-shims/functions.ts
      _app/                          (T6, generated; never edit)
      parle-public-level-check/index.ts    (T7)
      parle-assessment-service/index.ts    (T8)
      parle-marketplace-service/index.ts   (T9)
      parle-marketplace-refresh/index.ts   (T10)
      parle-billing-recheck/index.ts       (T10)
      stripe-webhook/index.ts              (T10)
      parle-plan-service/index.ts          (T11, T12)
      parle-account-service/index.ts       (T13, modified)
  tests/  one file per task (named in each task)
07_Engineering/parle-app/
  functions/parle-tutor-service.helper.ts          (T8) usage counted by the atomic counter
  functions/parle-admin-settings.helper.ts         (T9) setting + audit in one transaction
  functions/parle-marketplace-refresh.logic.helper.ts (T10, new) refresh logic split out of the Deno.cron file
  src/functions/index.ts                           (T11) parlePlanService
  src/lib/learner-plan-remote.ts                   (T11) browser side of the plan engine
  src/lib/placement-remote.ts                      (T12) browser side of the placement test
  src/pages/PlacementTest.tsx                      (T12) data and scoring calls via the server
  src/pages/Settings.tsx                           (T13) "Delete my account"
  src/lib/parle-profile.ts, components/parle/Brand.tsx, pages/Index.tsx, index.html, public/manifest.json, App.tsx (T14)
```

---

### Task 1: Local content, function settings and function config

**Files:**
- Create: `parle-backend/scripts/seed-local-content.ts`, `parle-backend/scripts/setup-local-functions-env.ts`,
  `parle-backend/tests/helpers/functions-env.ts`, `parle-backend/tests/local-setup.test.ts`
- Modify: `parle-backend/supabase/config.toml`

**Interfaces:**
- Produces: `functionsEnv(): Record<string, string>` (reads `supabase/functions/.env`), `callFunction(name, token, body, headers?)`
  in `tests/helpers/functions-env.ts`; seeded `question_item`, `prompt_item`, `app_setting` rows; env keys
  `SUPERDEV_APP_ID`, `SUPERDEV_SERVICE_ROLE_KEY`, `CRON_SECRET`, `EMAIL_TRANSPORT`, `MAILPIT_URL`, `AI_PROVIDER`,
  `STRIPE_WEBHOOK_SECRET`, plus `NVIDIA_API_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY` when their secret files exist.

- [ ] **Step 1: Write the failing test** `tests/local-setup.test.ts`

```ts
import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { functionsEnv } from "./helpers/functions-env";
import { seedLocalContent } from "../scripts/seed-local-content";

const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });

describe("local setup", () => {
  it("seeds the demo bank and settings once (idempotent)", async () => {
    await seedLocalContent();
    const count = async (t: string) => (await service().from(t).select("id", { count: "exact", head: true })).count ?? 0;
    const before = { q: await count("question_item"), p: await count("prompt_item"), s: await count("app_setting") };
    expect(before.q).toBeGreaterThan(100);
    expect(before.p).toBeGreaterThan(5);
    expect(before.s).toBeGreaterThan(5);
    await seedLocalContent();
    expect({ q: await count("question_item"), p: await count("prompt_item"), s: await count("app_setting") }).toEqual(before);
  });
  it("writes the function settings file with every required name", () => {
    const env = functionsEnv();
    for (const k of ["SUPERDEV_APP_ID", "SUPERDEV_SERVICE_ROLE_KEY", "CRON_SECRET", "EMAIL_TRANSPORT", "MAILPIT_URL", "AI_PROVIDER", "STRIPE_WEBHOOK_SECRET"]) {
      expect(env[k]?.length ?? 0).toBeGreaterThan(0);
    }
    expect(env.SUPERDEV_SERVICE_ROLE_KEY.length).toBeGreaterThanOrEqual(48);
    expect(env.AI_PROVIDER).toBe("fake");
  });
  it("stores the job settings where only the database owner can read them", async () => {
    const { data, error } = await service().rpc("job_config_names");
    expect(error).toBeNull();
    expect((data as string[]).sort()).toEqual(["cron_secret", "functions_url"]);
  });
});
```

- [ ] **Step 2: Run it.** `cd 07_Engineering/parle-backend && bun test tests/local-setup.test.ts`
  Expected: FAIL, "Cannot find module '../scripts/seed-local-content'".

- [ ] **Step 3: Write `scripts/seed-local-content.ts`**

```ts
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "../tests/helpers/local";

/** Plan 1 export (outside the repo). The learner account m3imm could read the demo bank and the settings on Buildy. */
const SPIKE = "D:/AgentDevWork/parle-migration-data/spike";
const TABLES = [
  { table: "question_item", file: "imm1.question_item.json" },
  { table: "prompt_item", file: "imm1.prompt_item.json" },
  { table: "app_setting", file: "imm1.app_setting.json" },
];
const DROP = new Set(["id", "created_at", "updated_at", "created_date", "updated_date", "created_by_id", "is_sample"]);

/** Loads the demo content into local staging once; safe to run again (skips tables that already have rows). */
export async function seedLocalContent(): Promise<Record<string, number>> {
  const db = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
  const loaded: Record<string, number> = {};
  for (const { table, file } of TABLES) {
    const { count } = await db.from(table).select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) { loaded[table] = 0; continue; }
    const path = `${SPIKE}/${file}`;
    if (!existsSync(path)) throw new Error(`Plan 1 export file missing: ${path}`);
    const rows = (JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>[]).map((r) =>
      Object.fromEntries(Object.entries(r).filter(([k]) => !DROP.has(k))));
    const { error } = await db.from(table).insert(rows);
    if (error) throw new Error(`${table}: ${error.message}`);
    loaded[table] = rows.length;
  }
  return loaded;
}

if (import.meta.main) console.log("seeded", await seedLocalContent());
```

If the insert reports an unknown column, add that column name to `DROP` (Buildy system fields) and ledger a ruling.

- [ ] **Step 4: Write `scripts/setup-local-functions-env.ts`**

```ts
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
```

`set_job_config` and `job_config_names` arrive with Task 10's migration. Until then the script tolerates the missing
function, and the third test of this task stays red. **Ruling recorded now:** the third test is marked `it.skip`
until Task 10, which un-skips it.

- [ ] **Step 5: Write `tests/helpers/functions-env.ts`**

```ts
import { readFileSync } from "node:fs";
import { LOCAL_URL, localKeys } from "./local";

let cached: Record<string, string> | null = null;
/** The local function settings written by scripts/setup-local-functions-env.ts (values stay in memory, never printed). */
export function functionsEnv(): Record<string, string> {
  if (cached) return cached;
  const text = readFileSync(`${import.meta.dir}/../../supabase/functions/.env`, "utf8");
  cached = Object.fromEntries(text.split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  return cached;
}

/** POST to a local Edge Function the way the browser does. */
export async function callFunction(name: string, token: string | null, body: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(`${LOCAL_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: localKeys().anon, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { status: r.status, body: parsed };
}
```

- [ ] **Step 6: Function config.** Append to `supabase/config.toml` (functions check the caller themselves; the level
  check, webhook and jobs are not called with a user token):

```toml
[functions.parle-account-service]
verify_jwt = false
[functions.parle-public-level-check]
verify_jwt = false
[functions.parle-assessment-service]
verify_jwt = false
[functions.parle-marketplace-service]
verify_jwt = false
[functions.parle-marketplace-refresh]
verify_jwt = false
[functions.parle-billing-recheck]
verify_jwt = false
[functions.stripe-webhook]
verify_jwt = false
[functions.parle-plan-service]
verify_jwt = false
```

- [ ] **Step 7: Run.** `bun scripts/setup-local-functions-env.ts && bun scripts/seed-local-content.ts && bun test tests/local-setup.test.ts`
  Expected: the setup script prints the key **names** only; 2 pass, 1 skip. `git check-ignore supabase/functions/.env` prints the path.
- [ ] **Step 8: Restart the function server** so it loads `.env`: stop the old `functions serve` shell, then run
  `bunx supabase functions serve` in the background (no `--no-verify-jwt` needed any more: config.toml sets it).
- [ ] **Step 9: Commit** `git add scripts/seed-local-content.ts scripts/setup-local-functions-env.ts tests/helpers/functions-env.ts tests/local-setup.test.ts supabase/config.toml && git commit -m "backend: local demo content seed, function settings file, function config"`

---

### Task 2: Rate limits

**Files:**
- Create: `supabase/migrations/20261016000001_rate_limits.sql`, `supabase/functions/_shared/rate-limit.ts`, `tests/rate-limit.test.ts`

**Interfaces:**
- Produces: SQL `public.take_rate_limit(p_key text, p_window_seconds int, p_max int) returns boolean` (service role only),
  `public.clean_rate_limits() returns int`; TS `takeRateLimit(db, key, windowSeconds, max): Promise<boolean>`,
  `clientIp(req): string`.

- [ ] **Step 1: Failing test** `tests/rate-limit.test.ts`

```ts
import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { takeRateLimit, clientIp } from "../supabase/functions/_shared/rate-limit";

const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });

describe("rate limits", () => {
  it("lets exactly max requests through a window, even all at once", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 20 }, () => takeRateLimit(service(), key, 3600, 10)));
    expect(results.filter(Boolean).length).toBe(10);
  });
  it("cannot be called by a browser key", async () => {
    const anon = createClient(LOCAL_URL, localKeys().anon, { auth: { persistSession: false } });
    const { error } = await anon.rpc("take_rate_limit", { p_key: "x", p_window_seconds: 60, p_max: 1 });
    expect(error).not.toBeNull();
  });
  it("reads the first forwarded address", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } }))).toBe("203.0.113.9");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run** `bun test tests/rate-limit.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Migration** `20261016000001_rate_limits.sql`

```sql
-- Fixed-window counters for AI and public actions (spec section 6; S10, S15, S29). Server only.
create table if not exists public.rate_limit_hit (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limit_hit enable row level security;
revoke all on public.rate_limit_hit from anon, authenticated;

create or replace function public.take_rate_limit(p_key text, p_window_seconds int, p_max int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_start timestamptz; v_hits int;
begin
  if coalesce(p_key, '') = '' or p_window_seconds is null or p_window_seconds <= 0 or p_max is null or p_max < 0 then
    raise exception 'take_rate_limit: key, a positive window and a max of zero or more are required';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limit_hit as r (key, window_start, hits) values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  return v_hits <= p_max;
end; $$;
revoke all on function public.take_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.take_rate_limit(text, int, int) to service_role;

create or replace function public.clean_rate_limits() returns int language sql security definer set search_path = public as $$
  with gone as (delete from public.rate_limit_hit where window_start < now() - interval '2 days' returning 1) select count(*)::int from gone;
$$;
revoke all on function public.clean_rate_limits() from public, anon, authenticated;
grant execute on function public.clean_rate_limits() to service_role;
```

- [ ] **Step 4: Helper** `_shared/rate-limit.ts`

```ts
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** true when this request is within the limit; counts the request either way. */
export async function takeRateLimit(db: SupabaseClient, key: string, windowSeconds: number, max: number): Promise<boolean> {
  const { data, error } = await db.rpc("take_rate_limit", { p_key: key, p_window_seconds: windowSeconds, p_max: max });
  if (error) throw new Error(`rate limit check failed: ${error.message}`);
  return data === true;
}

/** First address in x-forwarded-for. Which header is trustworthy behind Supabase's gateway is verified in Plan 4. */
export function clientIp(req: Request): string {
  const first = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  return first || req.headers.get("x-real-ip")?.trim() || "unknown";
}
```

- [ ] **Step 5: Run** `bunx supabase migration up && bun test tests/rate-limit.test.ts`. Expected: 3 pass.
- [ ] **Step 6: Commit** `git commit -m "backend: atomic rate limits"` (migration, helper, test).

---

### Task 3: Email module

**Files:** Create `supabase/functions/_shared/email.ts`, `tests/email.test.ts`; Modify `tests/setup.ts`

**Interfaces:**
- Produces: `sendMail(mail: { to: string; subject: string; html: string; fromName?: string; from?: "people" | "automatic" }): Promise<{ id: string }>`;
  throws `Error("EMAIL_NOT_CONFIGURED")` or `Error("EMAIL_SEND_FAILED <status>")`.
- `tests/setup.ts` gains a `Deno` stand-in so shared modules run under Bun: `globalThis.Deno ??= { env: { get: (k) => process.env[k] } }`.

- [ ] **Step 1: Failing test** `tests/email.test.ts`

```ts
import { describe, it, expect, beforeEach } from "bun:test";
import { sendMail } from "../supabase/functions/_shared/email";
import { latestMail } from "./helpers/mailpit";

describe("email", () => {
  beforeEach(() => { process.env.EMAIL_TRANSPORT = "mailpit"; process.env.MAILPIT_URL = "http://127.0.0.1:54324"; });
  it("delivers through the local mail catcher with the automatic sender", async () => {
    const to = `mail-${crypto.randomUUID()}@example.test`, since = new Date(Date.now() - 2000).toISOString();
    await sendMail({ to, subject: "Parle test", html: "<p>Bonjour</p>" });
    const m = await latestMail(to, since);
    expect(m.subject).toBe("Parle test");
    expect(m.html).toContain("Bonjour");
  });
  it("refuses to send through Resend without a key", async () => {
    process.env.EMAIL_TRANSPORT = "resend";
    delete process.env.RESEND_API_KEY;
    await expect(sendMail({ to: "a@example.test", subject: "x", html: "x" })).rejects.toThrow("EMAIL_NOT_CONFIGURED");
  });
});
```

- [ ] **Step 2: Run** `bun test tests/email.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Add to `tests/setup.ts`** (top of file):

```ts
// Shared Edge Function modules read settings through Deno.env; under Bun they read process.env.
(globalThis as any).Deno ??= { env: { get: (k: string) => process.env[k] } };
```

- [ ] **Step 4: Write `_shared/email.ts`**

```ts
export type Mail = { to: string; subject: string; html: string; fromName?: string; from?: "people" | "automatic" };
const ADDRESS = { people: "hello@parle.buzz", automatic: "no-reply@parle.buzz" } as const;

/** App email (spec section 7): Resend in production, the local mail catcher (Mailpit) on staging. */
export async function sendMail(mail: Mail): Promise<{ id: string }> {
  const address = ADDRESS[mail.from ?? "automatic"];
  const name = mail.fromName ?? "Parle";
  if ((Deno.env.get("EMAIL_TRANSPORT") ?? "resend") === "mailpit") {
    const r = await fetch(`${Deno.env.get("MAILPIT_URL")}/api/v1/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ From: { Email: address, Name: name }, To: [{ Email: mail.to }], Subject: mail.subject, HTML: mail.html }),
    });
    if (!r.ok) throw new Error(`EMAIL_SEND_FAILED ${r.status}`);
    return { id: String((await r.json().catch(() => ({}))).ID ?? "") };
  }
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("EMAIL_NOT_CONFIGURED");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `${name} <${address}>`, to: [mail.to], subject: mail.subject, html: mail.html }),
  });
  if (!r.ok) throw new Error(`EMAIL_SEND_FAILED ${r.status}`);
  return { id: String((await r.json().catch(() => ({}))).id ?? "") };
}
```

If Mailpit answers 404 on `/api/v1/send` (an old Mailpit), ledger it and send over SMTP port 54325 with
`npm:nodemailer@6` instead; the test stays the same.

- [ ] **Step 5: Run** `bun test tests/email.test.ts`. Expected: 2 pass.
- [ ] **Step 6: Commit** `git commit -m "backend: email module (Resend, local mail catcher)"`

---

### Task 4: AI module

**Files:**
- Create: `supabase/migrations/20261016000002_ai_test_queue.sql`, `supabase/functions/_shared/json-schema.ts`,
  `supabase/functions/_shared/ai.ts`, `tests/ai.test.ts`, `tests/helpers/ai-queue.ts`

**Interfaces:**
- Consumes: `takeRateLimit` (Task 2).
- Produces: `completeJson(db, req: { prompt: string; schema?: object; mode?: "fast" | "standard" }, opts?: { capKey?: string; cap?: number }): Promise<unknown>`;
  `AiError` with `code` in `AI_DAILY_CAP_REACHED | AI_OUTPUT_INVALID | AI_UNAVAILABLE | AI_NOT_CONFIGURED`;
  `validateJson(value, schema): string[]`; `extractJson(text): unknown | null`; `aiSettings(db)`.
  Settings keys in `app_setting` (value is a JSON string): `ai_model_standard`, `ai_model_fast`, `ai_global_daily_cap`.
  Test helper `queueAiResponses(...texts: string[])`.

- [ ] **Step 1: Failing test** `tests/ai.test.ts`

```ts
import { describe, it, expect, beforeEach } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { queueAiResponses, clearAiQueue } from "./helpers/ai-queue";
import { completeJson, extractJson, validateJson, aiSettings } from "../supabase/functions/_shared/ai";

const db = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const SCHEMA = { type: "object", properties: { note: { type: "string" }, level: { enum: ["A1", "A2"] } }, required: ["note", "level"] };

describe("json helpers", () => {
  it("extracts JSON from fenced or chatty model text", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Voici: {"a":[1,2]} merci')).toEqual({ a: [1, 2] });
    expect(extractJson("no json")).toBeNull();
  });
  it("reports schema problems with paths", () => {
    expect(validateJson({ note: "x", level: "A2" }, SCHEMA)).toEqual([]);
    expect(validateJson({ note: 3 }, SCHEMA)).toEqual(["$.note: expected string", "$.level: required"]);
    expect(validateJson({ note: "x", level: "C2" }, SCHEMA)).toEqual(["$.level: not one of A1, A2"]);
  });
});

describe("completeJson with the test provider", () => {
  beforeEach(async () => { process.env.AI_PROVIDER = "fake"; await clearAiQueue(); });
  it("returns valid output", async () => {
    await queueAiResponses('{"note":"Bien","level":"A2"}');
    expect(await completeJson(db(), { prompt: "p", schema: SCHEMA }, { capKey: `cap:${crypto.randomUUID()}` })).toEqual({ note: "Bien", level: "A2" });
  });
  it("retries once after invalid output", async () => {
    await queueAiResponses("not json", '{"note":"Ok","level":"A1"}');
    expect(await completeJson(db(), { prompt: "p", schema: SCHEMA }, { capKey: `cap:${crypto.randomUUID()}` })).toEqual({ note: "Ok", level: "A1" });
  });
  it("invalid twice gives AI_OUTPUT_INVALID", async () => {
    await queueAiResponses('{"note":1}', "{}");
    await expect(completeJson(db(), { prompt: "p", schema: SCHEMA }, { capKey: `cap:${crypto.randomUUID()}` })).rejects.toMatchObject({ code: "AI_OUTPUT_INVALID" });
  });
  it("an empty queue is AI_UNAVAILABLE", async () => {
    await expect(completeJson(db(), { prompt: "p" }, { capKey: `cap:${crypto.randomUUID()}` })).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });
  it("stops at the global daily cap", async () => {
    const capKey = `cap:${crypto.randomUUID()}`;
    await queueAiResponses('{"note":"a","level":"A1"}');
    await completeJson(db(), { prompt: "p", schema: SCHEMA }, { capKey, cap: 1 });
    await expect(completeJson(db(), { prompt: "p", schema: SCHEMA }, { capKey, cap: 1 })).rejects.toMatchObject({ code: "AI_DAILY_CAP_REACHED" });
  });
  it("reads model choices from settings with defaults", async () => {
    const s = await aiSettings(db());
    expect(s.models.fast.length).toBeGreaterThan(0);
    expect(s.models.standard.length).toBeGreaterThan(0);
    expect(s.cap).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run** `bun test tests/ai.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Migration** `20261016000002_ai_test_queue.sql`

```sql
-- Deterministic AI answers for tests. Read only when the function setting AI_PROVIDER=fake (local staging).
create table if not exists public.ai_test_queue (id bigserial primary key, response text not null, created_at timestamptz not null default now());
alter table public.ai_test_queue enable row level security;
revoke all on public.ai_test_queue from anon, authenticated;
create or replace function public.pop_ai_test_response() returns text language sql security definer set search_path = public as $$
  delete from public.ai_test_queue where id = (select id from public.ai_test_queue order by id limit 1 for update skip locked) returning response;
$$;
revoke all on function public.pop_ai_test_response() from public, anon, authenticated;
grant execute on function public.pop_ai_test_response() to service_role;
```

- [ ] **Step 4: `tests/helpers/ai-queue.ts`**

```ts
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./local";
const db = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
export async function queueAiResponses(...responses: string[]) {
  for (const response of responses) { const { error } = await db().from("ai_test_queue").insert({ response }); if (error) throw error; }
}
export async function clearAiQueue() { await db().from("ai_test_queue").delete().gte("id", 0); }
```

Tests that use the queue share one table: run them with `bun test --max-concurrency=1` (Bun runs files one at a time
by default; keep it that way).

- [ ] **Step 5: `_shared/json-schema.ts`** (the subset the Buildy schemas use)

```ts
type Schema = Record<string, any>;
const typeOk = (t: string, v: unknown) =>
  t === "null" ? v === null : t === "array" ? Array.isArray(v) : t === "integer" ? Number.isInteger(v)
  : t === "object" ? typeof v === "object" && v !== null && !Array.isArray(v) : typeof v === t;

/** Problems found in `value` against a JSON-schema subset (type, enum, required, properties, items, min/maxItems). */
export function validateJson(value: unknown, schema: Schema, path = "$"): string[] {
  if (!schema || typeof schema !== "object") return [];
  const out: string[] = [];
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t: string) => typeOk(t, value))) return [`${path}: expected ${types.join(" or ")}`];
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) out.push(`${path}: not one of ${schema.enum.join(", ")}`);
  if (typeOk("object", value)) {
    const obj = value as Record<string, unknown>;
    for (const [k, sub] of Object.entries(schema.properties ?? {})) if (k in obj) out.push(...validateJson(obj[k], sub as Schema, `${path}.${k}`));
    for (const k of schema.required ?? []) if (!(k in obj)) out.push(`${path}.${k}: required`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) out.push(`${path}: fewer than ${schema.minItems} items`);
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) out.push(`${path}: more than ${schema.maxItems} items`);
    if (schema.items) value.forEach((v, i) => out.push(...validateJson(v, schema.items, `${path}[${i}]`)));
  }
  return out;
}
```

Note the expected order in the test: property problems come before `required` problems.

- [ ] **Step 6: `_shared/ai.ts`**

```ts
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { validateJson } from "./json-schema.ts";
import { takeRateLimit } from "./rate-limit.ts";

export type AiMode = "fast" | "standard";
export type AiRequest = { prompt: string; schema?: Record<string, unknown>; mode?: AiMode };
export class AiError extends Error { code: string; constructor(code: string) { super(code); this.code = code; this.name = "AiError"; } }

const DEFAULTS = { standard: "moonshotai/kimi-k3", fast: "moonshotai/kimi-k3", cap: 2000 };
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

/** Model per mode and the global daily cap, from app_setting (values are JSON strings, as Buildy stored them). */
export async function aiSettings(db: SupabaseClient) {
  const { data } = await db.from("app_setting").select("key, value").in("key", ["ai_model_standard", "ai_model_fast", "ai_global_daily_cap"]);
  const read = (k: string) => { const row = (data ?? []).find((r: any) => r.key === k); try { return row ? JSON.parse(row.value) : undefined; } catch { return row?.value; } };
  const str = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v.trim() : d);
  const num = (v: unknown, d: number) => (typeof v === "number" && v > 0 ? v : d);
  return { models: { standard: str(read("ai_model_standard"), DEFAULTS.standard), fast: str(read("ai_model_fast"), DEFAULTS.fast) }, cap: num(read("ai_global_daily_cap"), DEFAULTS.cap) };
}

export function extractJson(text: string): unknown | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  for (const [open, close] of [["{", "}"], ["[", "]"]]) {
    const a = cleaned.indexOf(open), b = cleaned.lastIndexOf(close);
    if (a >= 0 && b > a) { try { return JSON.parse(cleaned.slice(a, b + 1)); } catch { /* try the next shape */ } }
  }
  return null;
}

async function nvidia(model: string, system: string, prompt: string): Promise<string> {
  const key = Deno.env.get("NVIDIA_API_KEY");
  if (!key) throw new AiError("AI_NOT_CONFIGURED");
  const r = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }], temperature: 0.3, max_tokens: 4096 }),
    signal: AbortSignal.timeout(120_000),
  }).catch(() => null);
  if (!r?.ok) { console.warn("NVIDIA call failed", { model, status: r?.status ?? "network" }); throw new AiError("AI_UNAVAILABLE"); }
  const body = await r.json();
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new AiError("AI_UNAVAILABLE");
  return text;
}

async function fake(db: SupabaseClient): Promise<string> {
  const { data, error } = await db.rpc("pop_ai_test_response");
  if (error || typeof data !== "string") throw new AiError("AI_UNAVAILABLE");
  return data;
}

/**
 * One AI completion (replaces Buildy's invokeLLM). With a schema, the reply must be JSON matching it; one retry
 * after an invalid reply (spec section 7, D25b). Every call counts toward the global daily cap.
 */
export async function completeJson(db: SupabaseClient, req: AiRequest, opts: { capKey?: string; cap?: number } = {}): Promise<unknown> {
  const settings = await aiSettings(db);
  if (!(await takeRateLimit(db, opts.capKey ?? "ai:global", 86_400, opts.cap ?? settings.cap))) throw new AiError("AI_DAILY_CAP_REACHED");
  const model = settings.models[req.mode ?? "standard"];
  const system = req.schema
    ? `Reply with exactly one JSON value that matches this JSON schema, and nothing else:\n${JSON.stringify(req.schema)}`
    : "You are Parle's French tutor. Reply in plain text.";
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = Deno.env.get("AI_PROVIDER") === "fake" ? await fake(db) : await nvidia(model, system, req.prompt);
    if (!req.schema) return text;
    const value = extractJson(text);
    const problems = value === null ? ["not JSON"] : validateJson(value, req.schema);
    if (!problems.length) return value;
    console.warn("AI reply failed its schema check", { attempt, model, problems: problems.slice(0, 5) });
  }
  throw new AiError("AI_OUTPUT_INVALID");
}
```

- [ ] **Step 7: Run** `bunx supabase migration up && bun test tests/ai.test.ts`. Expected: 8 pass.
- [ ] **Step 8: No live NVIDIA call in this task.** The key must never appear on a command line. The real model is
  exercised by the bake-off script (Task 15, which reads the key file itself) and through the functions in Task 16
  (`AI_PROVIDER=nvidia` in `.env`).
- [ ] **Step 9: Commit** `git commit -m "backend: AI module (NVIDIA, schema check with one retry, global daily cap, test provider)"`

---

### Task 5: Buildy rules and the server-side `createSuperdevClient`

**Files:**
- Create: `scripts/schema/generate-entity-rules.ts`, `supabase/functions/_shared/entity-rules.json` (generated),
  `supabase/functions/_shared/rules.ts`, `supabase/functions/_shared/superdev-compat.ts`,
  `tests/rules.test.ts`, `tests/superdev-compat.test.ts`

**Interfaces:**
- Consumes: `applyBuildyQuery` from `parle-app/src/lib/backend/query.ts` (Plan 2), via the generated copy
  `../_app/src/lib/backend/query.ts` (Task 6). Until Task 6 exists, `superdev-compat.ts` imports
  `../../../../parle-app/src/lib/backend/query.ts` directly. Task 6 switches the import and its sync test guards it.
  `completeJson` (Task 4), `sendMail` (Task 3).
- Produces:
  - `type BuildyUser = { id: string; email: string; full_name: string | null; role: "administrator" | "user" }`;
  - `ruleAllows(rule, user, row): boolean`, `ruleToFilter(rule, user): { kind: "all" } | { kind: "none" } | { kind: "where"; expr: string }`;
  - `createSuperdevClient(opts?: { appId?: string })` returning a client with:
    - `auth.setToken(token)`, `auth.me()`, `auth.list()`;
    - `entities.<Name>` and `entity(name)` with `filter(query, sort, limit, skip)`, `list(sort, limit)`, `get(id)`, `create(row)`, `bulkCreate(rows)`, `update(id, row)`, `delete(id)`;
    - `integrations.core.invokeLLM({ prompt, mode, response_json_schema })` and `integrations.core.sendEmail({ to, subject, body_html, from_name })`;
    - `usage.increment({ userId, period, periodKey, limit }) -> { ok, used }`;
    - `atomic.saveSettingWithAudit(...)` (filled in Task 9);
    - `serviceDb()` (the full-rights supabase-js client, for new server code only).
  - `CompatError` with `.status`. `buildyUserFromToken(db, token)`.
  - Modes: token equal to `SUPERDEV_SERVICE_ROLE_KEY` gives **service** mode (no rules); any other token is verified
    as a signed-in, email-confirmed user and gives **caller** mode. Callers whose `app_metadata.role` is `admin` are
    `"administrator"` and **read** without rules (spec section 4: admin reads with full rights); their writes still
    follow the rules.

- [ ] **Step 1: Failing tests.** `tests/rules.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { ruleAllows, ruleToFilter } from "../supabase/functions/_shared/rules";
import rules from "../supabase/functions/_shared/entity-rules.json";
import { generateEntityRules } from "../scripts/schema/generate-entity-rules";

const learner = { id: "u1", email: "a@b.c", full_name: null, role: "user" as const };
const admin = { ...learner, id: "ad", email: "admin@b.c", role: "administrator" as const };
const own = { created_by: "{{user.email}}" };
const ownOrAdmin = { $or: [{ created_by: "{{user.email}}" }, { user_condition: { role: "administrator" } }] };

describe("Buildy rules", () => {
  it("the committed rules file matches entities/*.json", () => {
    expect(rules).toEqual(generateEntityRules());
    expect(Object.keys(rules).length).toBe(36);
  });
  it("evaluates templates, user conditions, $or and $and on a row", () => {
    expect(ruleAllows(own, learner, { created_by: "a@b.c" })).toBe(true);
    expect(ruleAllows(own, learner, { created_by: "x@b.c" })).toBe(false);
    expect(ruleAllows(ownOrAdmin, admin, { created_by: "x@b.c" })).toBe(true);
    expect(ruleAllows({ $and: [own, { premium_comp_active: false }] }, learner, { created_by: "a@b.c", premium_comp_active: true })).toBe(false);
    expect(ruleAllows(undefined as any, learner, {})).toBe(false);
    expect(ruleAllows({ $and: [{ created_by: "__audit_immutable_condition_a__" }, { created_by: "__audit_immutable_condition_b__" }] }, admin, { created_by: "x" })).toBe(false);
  });
  it("turns a read rule into a PostgREST condition", () => {
    expect(ruleToFilter(own, learner)).toEqual({ kind: "where", expr: 'created_by.eq."a@b.c"' });
    expect(ruleToFilter(ownOrAdmin, admin)).toEqual({ kind: "all" });
    expect(ruleToFilter({ user_condition: { role: "administrator" } }, learner)).toEqual({ kind: "none" });
    expect(ruleToFilter({ $or: [own, { tutor_user_id: "{{user.id}}" }] }, learner)).toEqual({ kind: "where", expr: 'or(created_by.eq."a@b.c",tutor_user_id.eq."u1")' });
    expect(ruleToFilter({ $or: [{ user_condition: { role: "administrator" } }, { $and: [{ user_condition: { role: "user" } }, { is_published: true }] }] }, learner))
      .toEqual({ kind: "where", expr: "is_published.is.true" });
  });
});
```

`tests/superdev-compat.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { functionsEnv } from "./helpers/functions-env";
import { createSuperdevClient } from "../supabase/functions/_shared/superdev-compat";

const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const tokenOf = async (u: Awaited<ReturnType<typeof makeUser>>) => (await u.client.auth.getSession()).data.session!.access_token;
const asUser = async (u: Awaited<ReturnType<typeof makeUser>>) => { const c = createSuperdevClient({ appId: "x" }); c.auth.setToken(await tokenOf(u)); return c; };

beforeAll(() => {
  process.env.SUPABASE_URL = LOCAL_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = localKeys().service;
  process.env.SUPERDEV_SERVICE_ROLE_KEY = functionsEnv().SUPERDEV_SERVICE_ROLE_KEY;
});

describe("server createSuperdevClient", () => {
  it("me() returns Buildy's user shape and refuses a bad token", async () => {
    const u = await makeUser("learner"), c = await asUser(u);
    expect(await c.auth.me()).toEqual({ id: u.id, email: u.email, full_name: expect.anything(), role: "user" });
    const bad = createSuperdevClient({}); bad.auth.setToken("nope");
    await expect(bad.auth.me()).rejects.toMatchObject({ status: 401 });
  });
  it("caller reads only rows its Buildy rule allows", async () => {
    const a = await makeUser("learner"), b = await makeUser("learner");
    await service().from("learner_task").insert([
      { owner_id: a.id, created_by: a.email, user_id: a.id, status: "planned" },
      { owner_id: b.id, created_by: b.email, user_id: b.id, status: "planned" },
    ]);
    const rows = await (await asUser(a)).entities.learner_task.filter({});
    expect(rows.length).toBe(1);
    expect(rows[0].created_by).toBe(a.email);
  });
  it("create stamps the caller as owner and checks the create rule", async () => {
    const a = await makeUser("learner"), c = await asUser(a);
    const row = await c.entities.mistake_log.create({ created_by: "someone@else", owner_id: crypto.randomUUID(), skill: "W" });
    expect({ by: row.created_by, owner: row.owner_id }).toEqual({ by: a.email, owner: a.id });
    await expect(c.entities.app_setting.create({ key: "x", value: "1" })).rejects.toMatchObject({ status: 403 });
    await expect(c.entities.ParleIdentity.create({ role: "learner", premium_comp_active: true })).rejects.toMatchObject({ status: 403 });
  });
  it("update cannot touch or move another user's row", async () => {
    const a = await makeUser("learner"), b = await makeUser("learner");
    const { data: bRow } = await service().from("learner_task").insert({ owner_id: b.id, created_by: b.email, user_id: b.id, status: "planned" }).select("id").single();
    await expect((await asUser(a)).entities.learner_task.update(bRow!.id, { status: "done" })).rejects.toMatchObject({ status: 403 });
    const tutor = await makeUser("tutor");
    const { data: booking } = await service().from("booking").insert({ owner_id: a.id, created_by: a.email, learner_user_id: a.id, tutor_user_id: tutor.id, status: "requested" }).select("id").single();
    await expect((await asUser(tutor)).entities.booking.update(booking!.id, { tutor_user_id: b.id })).rejects.toMatchObject({ status: 403 });
    expect((await (await asUser(tutor)).entities.booking.update(booking!.id, { status: "accepted" })).status).toBe("accepted");
  });
  it("an administrator reads everything but writes only where the rule allows", async () => {
    const a = await makeUser("learner"), admin = await makeUser("admin");
    await service().from("learner_task").insert({ owner_id: a.id, created_by: a.email, user_id: a.id, status: "planned" });
    const ac = await asUser(admin);
    expect((await ac.entities.learner_task.filter({ user_id: a.id })).length).toBe(1);
    expect((await ac.auth.list()).some((x: any) => x.email === a.email)).toBe(true);
    await expect((await asUser(a)).auth.list()).rejects.toMatchObject({ status: 403 });
  });
  it("the service token reads without rules", async () => {
    const a = await makeUser("learner");
    await service().from("learner_task").insert({ owner_id: a.id, created_by: a.email, user_id: a.id, status: "planned" });
    const c = createSuperdevClient({}); c.auth.setToken(functionsEnv().SUPERDEV_SERVICE_ROLE_KEY);
    expect((await c.entities.learner_task.filter({ user_id: a.id })).length).toBe(1);
    await expect(c.auth.me()).rejects.toMatchObject({ status: 401 });
  });
});
```

If an insert in these tests fails on a column Plan 1 made non-null, add that column with `""` and ledger it.

- [ ] **Step 2: Run** `bun test tests/rules.test.ts tests/superdev-compat.test.ts`. Expected: FAIL, modules not found.
- [ ] **Step 3: `scripts/schema/generate-entity-rules.ts`**

```ts
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
const ENTITIES = `${import.meta.dir}/../../../parle-app/entities`;
const OUT = `${import.meta.dir}/../../supabase/functions/_shared/entity-rules.json`;

/** Buildy's own access rule per entity and operation, as written in entities/*.json ("rls"). */
export function generateEntityRules(): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const f of readdirSync(ENTITIES).filter((f) => f.endsWith(".json")).sort()) {
    const d = JSON.parse(readFileSync(`${ENTITIES}/${f}`, "utf8"));
    const rls = d.rls ?? {};
    out[f.slice(0, -5)] = { read: rls.read, create: rls.create, update: rls.update, delete: rls.delete };
  }
  return out;
}
if (import.meta.main) { writeFileSync(OUT, JSON.stringify(generateEntityRules(), null, 2) + "\n"); console.log("wrote entity-rules.json"); }
```

Run it: `bun scripts/schema/generate-entity-rules.ts`.

- [ ] **Step 4: `_shared/rules.ts`**

```ts
export type BuildyUser = { id: string; email: string; full_name: string | null; role: "administrator" | "user" };
export type Rule = Record<string, unknown>;
export type RuleFilter = { kind: "all" } | { kind: "none" } | { kind: "where"; expr: string };

const template = (v: unknown, u: BuildyUser) => (v === "{{user.email}}" ? u.email : v === "{{user.id}}" ? u.id : v);
const userMatches = (cond: unknown, u: BuildyUser) =>
  !!cond && typeof cond === "object" && Object.entries(cond as Rule).every(([k, v]) => (u as Record<string, unknown>)[k] === v);

/** Does Buildy's rule allow this user on this row? A missing rule allows nothing. */
export function ruleAllows(rule: Rule | undefined, user: BuildyUser, row: Record<string, unknown>): boolean {
  if (!rule || typeof rule !== "object") return false;
  return Object.entries(rule).every(([key, value]) => {
    if (key === "$or") return Array.isArray(value) && value.some((r) => ruleAllows(r as Rule, user, row));
    if (key === "$and") return Array.isArray(value) && value.every((r) => ruleAllows(r as Rule, user, row));
    if (key === "user_condition") return userMatches(value, user);
    return row[key] === template(value, user);
  });
}

const quote = (v: unknown) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const leaf = (k: string, v: unknown) => (typeof v === "boolean" || v === null ? `${k}.is.${v}` : `${k}.eq.${quote(v)}`);

function combine(op: "or" | "and", parts: RuleFilter[]): RuleFilter {
  const where = parts.filter((p): p is { kind: "where"; expr: string } => p.kind === "where");
  if (op === "or") {
    if (parts.some((p) => p.kind === "all")) return { kind: "all" };
    if (!where.length) return { kind: "none" };
  } else {
    if (parts.some((p) => p.kind === "none")) return { kind: "none" };
    if (!where.length) return { kind: "all" };
  }
  return { kind: "where", expr: where.length === 1 ? where[0].expr : `${op}(${where.map((w) => w.expr).join(",")})` };
}

/** Buildy's read rule as a PostgREST logic expression for `.or(expr)`, or all / none. */
export function ruleToFilter(rule: Rule | undefined, user: BuildyUser): RuleFilter {
  if (!rule || typeof rule !== "object") return { kind: "none" };
  return combine("and", Object.entries(rule).map(([key, value]): RuleFilter => {
    if (key === "$or" || key === "$and") return combine(key === "$or" ? "or" : "and", (Array.isArray(value) ? value : []).map((r) => ruleToFilter(r as Rule, user)));
    if (key === "user_condition") return userMatches(value, user) ? { kind: "all" } : { kind: "none" };
    return { kind: "where", expr: leaf(key, template(value, user)) };
  }));
}
```

- [ ] **Step 5: `_shared/superdev-compat.ts`**

```ts
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { applyBuildyQuery } from "../../../../parle-app/src/lib/backend/query.ts"; // Task 6 switches this to ../_app/...
import RULES from "./entity-rules.json" with { type: "json" };
import { ruleAllows, ruleToFilter, type BuildyUser, type Rule } from "./rules.ts";
import { completeJson } from "./ai.ts";
import { sendMail } from "./email.ts";

export type { BuildyUser };
type Op = "read" | "create" | "update" | "delete";
type Mode = { kind: "service" } | { kind: "caller"; user: BuildyUser };
const ENTITY_RULES = RULES as Record<string, Record<Op, Rule>>;
const PROTECTED = ["id", "owner_id", "created_by", "created_at", "updated_at"];

export class CompatError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; this.name = "CompatError"; } }

function fullRights(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
}

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The signed-in, email-confirmed user behind a token, in Buildy's `User.me()` shape; null otherwise. */
export async function buildyUserFromToken(db: SupabaseClient, token: string): Promise<BuildyUser | null> {
  const { data, error } = await db.auth.getUser(token);
  const u = data?.user;
  if (error || !u?.email || !u.email_confirmed_at) return null;
  const name = (u.user_metadata as Record<string, unknown> | undefined)?.full_name;
  return { id: u.id, email: u.email, full_name: typeof name === "string" && name.trim() ? name : null, role: (u.app_metadata as Record<string, unknown> | undefined)?.role === "admin" ? "administrator" : "user" };
}

const rulesFor = (name: string) => {
  const r = ENTITY_RULES[name];
  if (!r) throw new CompatError(`API request failed: Unknown entity ${name}`, 400);
  return r;
};
const strip = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row ?? {}).filter(([k]) => !PROTECTED.includes(k)));
const failed = (e: { message: string }, status = 400): never => { throw new CompatError(`API request failed: ${e.message}`, status); };

function entityApi(db: SupabaseClient, name: string, mode: () => Promise<Mode>) {
  const readScope = async () => {
    const m = await mode();
    rulesFor(name);
    if (m.kind === "service" || m.user.role === "administrator") return { kind: "all" } as const;
    return ruleToFilter(rulesFor(name).read, m.user);
  };
  async function filter(query: Record<string, unknown> = {}, sort?: string, limit?: number, skip?: number): Promise<Record<string, any>[]> {
    const scope = await readScope();
    if (scope.kind === "none") return [];
    const run = (s?: string) => {
      let q: any = db.from(name).select("*");
      if (scope.kind === "where") q = q.or(scope.expr);
      return applyBuildyQuery(q, query ?? {}, s, limit, skip);
    };
    let { data, error } = await run(sort);
    if (error && sort && /column|could not find|does not exist/i.test(error.message)) ({ data, error } = await run(undefined)); // Buildy ignored unknown sort fields
    if (error) failed(error);
    return (data ?? []) as Record<string, any>[];
  }
  async function stored(id: string): Promise<Record<string, any>> {
    const { data, error } = await db.from(name).select("*").eq("id", id).maybeSingle();
    if (error) failed(error);
    if (!data) throw new CompatError("API request failed: Not found", 404);
    return data;
  }
  async function guard(op: Op, row: Record<string, unknown>) {
    const m = await mode();
    if (m.kind === "caller" && !ruleAllows(rulesFor(name)[op], m.user, row)) throw new CompatError("API request failed: Permission denied", 403);
    return m;
  }
  async function prepareCreate(row: Record<string, unknown>) {
    const m = await mode();
    const values = m.kind === "caller"
      ? { ...strip(row), created_by: m.user.email, owner_id: m.user.id }
      : Object.fromEntries(Object.entries(row ?? {}).filter(([k]) => !["id", "created_at", "updated_at"].includes(k)));
    await guard("create", values);
    return values;
  }
  return {
    filter,
    async list(sort?: string, limit?: number) { return filter({}, sort, limit); },
    async get(id: string) { const [row] = await filter({ id }, undefined, 1); if (!row) throw new CompatError("API request failed: Not found", 404); return row; },
    async create(row: Record<string, unknown>) {
      const { data, error } = await db.from(name).insert(await prepareCreate(row)).select("*").single();
      if (error) failed(error);
      return data;
    },
    async bulkCreate(rows: Record<string, unknown>[]) {
      const values = [];
      for (const r of rows ?? []) values.push(await prepareCreate(r));
      if (!values.length) return [];
      const { data, error } = await db.from(name).insert(values).select("*");
      if (error) failed(error);
      return data ?? [];
    },
    async update(id: string, row: Record<string, unknown>) {
      const before = await stored(id);
      const changes = strip(row);
      await guard("update", before);
      await guard("update", { ...before, ...changes }); // a write may not move the row out of the caller's reach
      const { data, error } = await db.from(name).update(changes).eq("id", id).select("*").single();
      if (error) failed(error);
      return data;
    },
    async delete(id: string) {
      await guard("delete", await stored(id));
      const { error } = await db.from(name).delete().eq("id", id);
      if (error) failed(error);
      return { success: true };
    },
  };
}

async function listUsers(db: SupabaseClient) {
  const out: Record<string, unknown>[] = [];
  for (let page = 1; page < 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) failed(error, 500);
    for (const u of data.users) {
      const name = (u.user_metadata as any)?.full_name;
      out.push({ id: u.id, email: u.email ?? "", full_name: typeof name === "string" ? name : null, role: (u.app_metadata as any)?.role === "admin" ? "administrator" : "user", created_at: u.created_at });
    }
    if (data.users.length < 1000) break;
  }
  return out;
}

/** Drop-in for Buildy's createSuperdevClient on the server (spec section 6: only the data-client calls change). */
export function createSuperdevClient(_opts: { appId?: string } = {}) {
  const db = fullRights();
  let token = "";
  let resolved: Promise<Mode> | null = null;
  const mode = (): Promise<Mode> => {
    resolved ??= (async () => {
      if (sameSecret(token, Deno.env.get("SUPERDEV_SERVICE_ROLE_KEY") ?? "")) return { kind: "service" } as const;
      const user = token ? await buildyUserFromToken(db, token) : null;
      if (!user) throw new CompatError("API request failed: Authentication required", 401);
      return { kind: "caller", user } as const;
    })();
    return resolved;
  };
  const callerOnly = async () => { const m = await mode(); if (m.kind !== "caller") throw new CompatError("API request failed: Authentication required", 401); return m.user; };
  const apis = new Map<string, ReturnType<typeof entityApi>>();
  const entity = (name: string) => { if (!apis.has(name)) apis.set(name, entityApi(db, name, mode)); return apis.get(name)!; };
  return {
    auth: {
      setToken(next: string) { token = next ?? ""; resolved = null; },
      me: callerOnly,
      async list() { const m = await mode(); if (m.kind === "caller" && m.user.role !== "administrator") throw new CompatError("API request failed: Permission denied", 403); return listUsers(db); },
    },
    entities: new Proxy({} as Record<string, ReturnType<typeof entityApi>>, { get: (_t, name) => (typeof name === "string" && name !== "then" ? entity(name) : undefined) }),
    entity,
    integrations: {
      core: {
        async invokeLLM(params: { prompt: string; mode?: string; response_json_schema?: Record<string, unknown> }) {
          await mode();
          return completeJson(db, { prompt: params.prompt, schema: params.response_json_schema, mode: params.mode === "fast" ? "fast" : "standard" });
        },
        async sendEmail(params: { to: string; subject: string; body_html: string; from_name?: string }) {
          await mode();
          return sendMail({ to: params.to, subject: params.subject, html: params.body_html, fromName: params.from_name, from: "automatic" });
        },
      },
    },
    usage: {
      async increment(input: { userId: string; period: string; periodKey: string; limit: number }) {
        const user = await callerOnly();
        if (input.userId !== user.id) throw new CompatError("API request failed: Permission denied", 403);
        const { data, error } = await db.rpc("increment_usage", { p_user_id: user.id, p_period: input.period, p_period_key: input.periodKey, p_owner: user.id, p_amount: 1, p_limit: input.limit });
        if (error) failed(error, 500);
        return data as { ok: boolean; used: number };
      },
    },
    atomic: {} as Record<string, (...args: any[]) => Promise<any>>,
    serviceDb: () => db,
  };
}
```

`increment_usage` also writes `created_by`? It does not; ledger a ruling if Plan 1's `usage_counter` requires
`created_by` and add `created_by` through a small migration that extends `increment_usage` with `p_created_by text default ''`.

- [ ] **Step 6: Run** `bun test tests/rules.test.ts tests/superdev-compat.test.ts`. Expected: 3 + 6 pass. Bun must
  be able to import `entity-rules.json` with an import attribute; if it cannot, read it with `readFileSync` in a
  Bun-only test helper and ledger it.
- [ ] **Step 7: Commit** `git commit -m "functions: Buildy access rules and server createSuperdevClient (caller and service modes)"`

---

### Task 6: Copying Buildy's server code and app modules into the functions folder

**Files:**
- Create: `scripts/sync-app-code.ts`, `tests/app-code-sync.test.ts`, `supabase/functions/_shared/serve.ts`,
  `supabase/functions/_shared/guards.ts`, `supabase/functions/_app/**` (generated)
- Modify: `parle-app/functions/parle-marketplace-refresh.ts`; Create `parle-app/functions/parle-marketplace-refresh.logic.helper.ts`;
  Modify `_shared/superdev-compat.ts` (query import)

**Interfaces:**
- Produces:
  - `generate(): Map<string, string>`, `onDisk(): Map<string, string>`, `write(files)`, constants `ENTRY_FILES`, `LIB_ROOTS`;
  - `_app/functions/<entry>.ts` exporting `handler: (req: Request) => Promise<Response>`;
  - `serveWith(handler, ...guards)`, where `type Guard = (req: Request) => Promise<Response | null>`;
  - guards `publicLevelCheckLimit`, `aiActionLimit`, `cronOnly`, `limited(code)`;
  - `refreshPublishedListings(client)` exported from `parle-marketplace-refresh.logic.helper.ts`.

- [ ] **Step 1: Split the refresh logic** (Buildy's file uses `Deno.cron` and serves 404; Supabase has no `Deno.cron`).
  Move everything above `async function runTrustedRefresh` from `parle-app/functions/parle-marketplace-refresh.ts`
  into the new `parle-marketplace-refresh.logic.helper.ts`, with `refreshPublishedListings` changed to
  `export async function`. In the old file, keep `runTrustedRefresh`, `Deno.cron`, `Deno.serve`, and import
  `refreshPublishedListings` from the helper. Run the app suite: `cd ../parle-app && bun run test`. Expected: 359 pass.

- [ ] **Step 2: Failing test** `tests/app-code-sync.test.ts`

```ts
import { describe, it, expect } from "bun:test";
import { generate, onDisk } from "../scripts/sync-app-code";

describe("server copy of app code", () => {
  const files = generate();
  it("is up to date (run: bun scripts/sync-app-code.ts)", () => {
    const disk = onDisk();
    expect([...disk.keys()].sort()).toEqual([...files.keys()].sort());
    for (const [path, text] of files) expect(disk.get(path)).toBe(text);
  });
  it("turns each entry's Deno.serve into an exported handler", () => {
    const entry = files.get("_app/functions/parle-public-level-check.ts")!;
    expect(entry).toContain("export const handler = (async (request) =>");
    expect(entry).not.toContain("Deno.serve(");
  });
  it("replaces Buildy's client with the server stand-in and never imports Buildy", () => {
    for (const [path, text] of files) {
      expect(text).not.toContain("@superdevhq/client");
      if (path === "_app/functions/parle-assessment-service.ts") expect(text).toContain('from "../../_shared/superdev-compat.ts"');
    }
  });
});
```

- [ ] **Step 3: Run** `bun test tests/app-code-sync.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 4: `scripts/sync-app-code.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

export const APP_DIR = resolve(import.meta.dir, "../../parle-app");
export const FUNCTIONS_DIR = resolve(import.meta.dir, "../supabase/functions");
const OUT_DIR = join(FUNCTIONS_DIR, "_app");

/** Entry files: their single Deno.serve( becomes `export const handler = (` so _shared/serve.ts can wrap them. */
export const ENTRY_FILES = ["functions/parle-public-level-check.ts", "functions/parle-assessment-service.ts", "functions/parle-marketplace-service.ts"];
/** Other app modules the server runs as they are (later tasks add the plan engine and placement scoring). */
export const LIB_ROOTS: string[] = ["src/lib/backend/query.ts", "functions/parle-marketplace-refresh.logic.helper.ts"];

const SHIMS: Record<string, string> = { "@/entities": "_shared/app-shims/entities.ts", "@/functions": "_shared/app-shims/functions.ts" };
const REWRITES: Record<string, string> = { "npm:@superdevhq/client@0.1.56": "_shared/superdev-compat.ts" };
const IMPORT_RE = /(\bimport\s+(?:type\s+)?(?:[^"';]*?\s+from\s+)?|\bexport\s+(?:type\s+)?[^"';]*?\s+from\s+|\bimport\s*\(\s*)(["'])([^"']+)\2/g;

const posix = (p: string) => p.split(sep).join("/");
const outPath = (src: string) => join(OUT_DIR, relative(APP_DIR, src));
function rel(fromOut: string, toAbs: string) { const r = posix(relative(dirname(fromOut), toAbs)); return r.startsWith(".") ? r : `./${r}`; }
function resolveSource(fromSrc: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(APP_DIR, "src", spec.slice(2)) : resolve(dirname(fromSrc), spec);
  for (const c of [base, `${base}.ts`, join(base, "index.ts")]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

export function generate(): Map<string, string> {
  const files = new Map<string, string>();
  const queue = [...ENTRY_FILES, ...LIB_ROOTS].map((p) => join(APP_DIR, p));
  const seen = new Set<string>();
  while (queue.length) {
    const src = queue.shift()!;
    if (seen.has(src)) continue;
    seen.add(src);
    const name = posix(relative(APP_DIR, src));
    if (!src.endsWith(".ts")) throw new Error(`server code cannot import ${name}`);
    const out = outPath(src);
    let text = readFileSync(src, "utf8").replace(/\r\n/g, "\n").replace(IMPORT_RE, (whole, head, q, spec: string) => {
      const mapped = SHIMS[spec] ?? REWRITES[spec];
      if (mapped) return `${head}${q}${rel(out, join(FUNCTIONS_DIR, mapped))}${q}`;
      if (/^(npm|jsr|node|https?):/.test(spec)) return whole;
      if (!spec.startsWith(".") && !spec.startsWith("@/")) throw new Error(`${name}: bare import "${spec}" needs an npm: mapping in sync-app-code.ts`);
      const target = resolveSource(src, spec);
      if (!target) throw new Error(`${name}: cannot resolve "${spec}"`);
      queue.push(target);
      return `${head}${q}${rel(out, outPath(target))}${q}`;
    });
    if (ENTRY_FILES.includes(name)) {
      const n = text.split("Deno.serve(").length - 1;
      if (n !== 1) throw new Error(`${name}: expected one Deno.serve( but found ${n}`);
      text = text.replace("Deno.serve(", "export const handler = (");
    }
    files.set(posix(relative(FUNCTIONS_DIR, out)), `// GENERATED from parle-app/${name} by scripts/sync-app-code.ts. Do not edit.\n${text}`);
  }
  return files;
}

export function onDisk(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p); else out.set(posix(relative(FUNCTIONS_DIR, p)), readFileSync(p, "utf8").replace(/\r\n/g, "\n"));
    }
  };
  walk(OUT_DIR);
  return out;
}

export function write(files: Map<string, string>) {
  rmSync(OUT_DIR, { recursive: true, force: true });
  for (const [path, text] of files) { const p = join(FUNCTIONS_DIR, path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); }
}

if (import.meta.main) { const f = generate(); write(f); console.log(`wrote ${f.size} files to supabase/functions/_app`); }
```

Add `supabase/functions/_app/** text eol=lf` to the repo's `.gitattributes`, so Windows checkouts keep the
byte-for-byte comparison.

- [ ] **Step 5: `_shared/serve.ts` and `_shared/guards.ts`**

```ts
// serve.ts
export type Handler = (req: Request) => Response | Promise<Response>;
export type Guard = (req: Request) => Promise<Response | null>;
/** Runs each guard on a copy of the request (body untouched), then the handler. */
export function serveWith(handler: Handler, ...guards: Guard[]) {
  Deno.serve(async (req) => {
    if (req.method !== "OPTIONS") for (const g of guards) { const stop = await g(req.clone()); if (stop) return stop; }
    return handler(req);
  });
}
```

```ts
// guards.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { takeRateLimit, clientIp } from "./rate-limit.ts";
import { buildyUserFromToken } from "./superdev-compat.ts";
import type { Guard } from "./serve.ts";

const db = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
export const limited = (code = "RATE_LIMITED") => new Response(JSON.stringify({ error: code, error_code: code }), { status: 429, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
const actionOf = async (req: Request) => { try { const b = await req.json(); return typeof b?.action === "string" ? b.action : ""; } catch { return ""; } };

/** Public level check: 10 starts and 30 scores per address per hour (S29). */
export const publicLevelCheckLimit: Guard = async (req) => {
  const action = await actionOf(req);
  if (action !== "start" && action !== "score") return null;
  const ok = await takeRateLimit(db(), `levelcheck:${action}:${clientIp(req)}`, 3600, action === "start" ? 10 : 30);
  return ok ? null : limited();
};

/** AI-backed actions: 60 per account per 10 minutes (S10, S15); the per-day message limits stay in the services. */
export const AI_ACTIONS = new Set(["score_writing", "generate_practice_content", "learner_coach_note", "tutor_open_session", "tutor_send_message", "tutor_finish_session", "admin_generate_content_drafts", "audit_question_bank"]);
export const aiActionLimit: Guard = async (req) => {
  const action = await actionOf(req);
  if (!AI_ACTIONS.has(action)) return null;
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const user = token ? await buildyUserFromToken(db(), token) : null;
  if (!user) return null; // the service answers 401 itself
  return (await takeRateLimit(db(), `ai:user:${user.id}`, 600, 60)) ? null : limited();
};

/** Scheduled jobs: only pg_cron (header x-cron-secret) may call. */
export const cronOnly: Guard = async (req) => {
  const sent = req.headers.get("x-cron-secret") ?? "", want = Deno.env.get("CRON_SECRET") ?? "";
  return want && sent.length === want.length && sent === want ? null : new Response(JSON.stringify({ error: "FORBIDDEN" }), { status: 401 });
};
```

- [ ] **Step 6: Generate and switch the compat import.** In `superdev-compat.ts`, replace the query import with
  `import { applyBuildyQuery } from "../_app/src/lib/backend/query.ts";`. Run `bun scripts/sync-app-code.ts`.
  Expected: "wrote N files" (N about 25). Fix any "bare import" or "cannot resolve" error by adding an npm mapping
  (ledger it).
- [ ] **Step 7: Run** `bun test tests/app-code-sync.test.ts tests/superdev-compat.test.ts && cd ../parle-app && bun run test`.
  Expected: 3 + 6 pass; app 359 pass.
- [ ] **Step 8: Commit** `git commit -m "functions: generated server copy of Buildy code, serve wrapper and guards; refresh logic split out"`

---

### Task 7: `parle-public-level-check` on Supabase

**Files:** Create `supabase/functions/parle-public-level-check/index.ts`, `tests/fn-public-level-check.test.ts`

**Interfaces:** Consumes `handler` (generated), `serveWith`, `publicLevelCheckLimit`. Request bodies are exactly
Buildy's: `{ action: "start" }`, `{ action: "score", runId, answers }`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeAll } from "bun:test";
import { callFunction } from "./helpers/functions-env";
import { seedLocalContent } from "../scripts/seed-local-content";

const ip = () => ({ "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 250) + 1}, 10.0.0.${Math.floor(Math.random() * 250)}` });
beforeAll(async () => { await seedLocalContent(); });

describe("public level check", () => {
  it("start returns questions without answers", async () => {
    const r = await callFunction("parle-public-level-check", null, { action: "start" }, ip());
    expect(r.status).toBe(200);
    const text = JSON.stringify(r.body);
    expect(r.body.runId).toBeTruthy();
    for (const leak of ["answer_option_id", "\"answer\"", "explanation", "choice-1"]) expect(text).not.toContain(leak);
  });
  it("scores a run it started", async () => {
    const headers = ip();
    const start = await callFunction("parle-public-level-check", null, { action: "start" }, headers);
    const questions = (start.body.questions ?? start.body.items ?? []) as any[];
    const answers = Object.fromEntries(questions.map((q: any) => [q.id, q.options?.[0]?.id ?? ""]));
    const score = await callFunction("parle-public-level-check", null, { action: "score", runId: start.body.runId, answers }, headers);
    expect(score.status).toBe(200);
  });
  it("allows 10 starts per address per hour", async () => {
    const headers = ip();
    const codes = [];
    for (let i = 0; i < 11; i++) codes.push((await callFunction("parle-public-level-check", null, { action: "start" }, headers)).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});
```

The start body's field names (`questions` / `items`, the `answers` shape) are Buildy's. Before Step 2, read
`parle-app/src/lib/public-level-check.ts` or `.test.ts` and use the real names, then ledger them.

- [ ] **Step 2: Run** `bun test tests/fn-public-level-check.test.ts`. Expected: FAIL (404 from the function server).
- [ ] **Step 3: `parle-public-level-check/index.ts`**

```ts
import { handler } from "../_app/functions/parle-public-level-check.ts";
import { serveWith } from "../_shared/serve.ts";
import { publicLevelCheckLimit } from "../_shared/guards.ts";

serveWith(handler, publicLevelCheckLimit);
```

- [ ] **Step 4: Run** the test (the function server reloads on file change). Expected: 3 pass.
- [ ] **Step 5: Commit** `git commit -m "functions: public level check on Supabase with per-address limits"`

---

### Task 8: `parle-assessment-service` on Supabase

**Files:**
- Modify: `parle-app/functions/parle-tutor-service.helper.ts` (`consumeMessage`, `countUsageEventRows`),
  `parle-app/functions/parle-assessment-service.ts` (usage read near line 375, if it counts rows),
  `parle-app/src/lib/ai-tutor.test.ts` (new unit cases)
- Create: `supabase/functions/parle-assessment-service/index.ts`, `tests/fn-assessment.test.ts`

**Interfaces:**
- Consumes `client.usage.increment` (Task 5), `aiActionLimit` (Task 6), `completeJson` through `invokeLLM`.
- Produces: the AI tutor counts usage in one daily row per user (`usage_counter.ai_messages`), matching Plan 1's unique
  index; `countUsageEventRows(rows)` sums `ai_messages` (legacy event rows without the field count as 1).

- [ ] **Step 1: Failing unit tests** in `parle-app/src/lib/ai-tutor.test.ts` (append):

```ts
import { countUsageEventRows } from "../../functions/parle-tutor-service.helper";
it("counts daily usage from the total row, and old one-per-message rows as 1 each", () => {
  expect(countUsageEventRows([{ ai_messages: 4 }])).toBe(4);
  expect(countUsageEventRows([{}, {}])).toBe(2);
  expect(countUsageEventRows([{ ai_messages: 0 }])).toBe(0);
});
```

Run `cd parle-app && bun test src/lib/ai-tutor.test.ts`. Expected: FAIL on the first expectation (returns 1).

- [ ] **Step 2: Edit `parle-tutor-service.helper.ts`**

```ts
export function countUsageEventRows(rows: readonly unknown[]): number {
  return rows.reduce<number>((n, row) => {
    const v = isObject(row) ? row.ai_messages : undefined;
    return n + (typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 1);
  }, 0);
}
```

In `consumeMessage`, before the `usage_counter.create`, add the atomic path used on our backend:

```ts
  if (typeof client?.usage?.increment === "function") {
    // One daily row per learner, incremented atomically under the limit (S18).
    const result = await client.usage.increment({ userId: user.id, period: "day", periodKey: context.dayKey, limit: context.messagesLimit });
    if (!result?.ok) return null;
    return Math.max(0, context.messagesLimit - Number(result.used ?? context.messagesLimit));
  }
```

Read every caller of `consumeMessage`. If any treats `null` as other than "limit reached", ledger it and map it so a
refused increment gives the existing limit response. Check the usage read in `parle-assessment-service.ts` (search
for `usage_counter`): if it counts rows, route it through `countUsageEventRows`. Run the app suite. Expected: all pass.

- [ ] **Step 3: Failing integration test** `tests/fn-assessment.test.ts`

```ts
import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { callFunction } from "./helpers/functions-env";
import { queueAiResponses, clearAiQueue } from "./helpers/ai-queue";
import { seedLocalContent } from "../scripts/seed-local-content";

const FN = "parle-assessment-service";
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const tokenOf = async (u: Awaited<ReturnType<typeof makeUser>>) => (await u.client.auth.getSession()).data.session!.access_token;
async function learnerWithProfile() {
  const u = await makeUser("learner"), t = await tokenOf(u);
  await callFunction("parle-account-service", t, { action: "ensure_identity", role: "learner", age_confirmed: true });
  await callFunction("parle-account-service", t, { action: "save_learner_profile", track: "immigration", goals: ["immigration"], main_goal: "immigration", self_assessed_level: "A2", native_language: "English", time_zone: "America/Toronto" });
  return { u, t };
}
beforeAll(async () => { await seedLocalContent(); });
beforeEach(async () => { await clearAiQueue(); });

describe("parle-assessment-service", () => {
  it("refuses callers without a valid token", async () => {
    expect((await callFunction(FN, null, { action: "learner_coach_note" })).status).toBe(401);
    expect((await callFunction(FN, "not-a-token", { action: "learner_coach_note" })).status).toBe(401);
  });
  it("refuses administrator-only actions to a learner", async () => {
    const { t } = await learnerWithProfile();
    expect((await callFunction(FN, t, { action: "admin_generate_content_drafts" })).status).toBe(403);
  });
  it("reports the daily AI messages from the total row", async () => {
    const { u, t } = await learnerWithProfile();
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
    await service().from("usage_counter").insert({ owner_id: u.id, created_by: u.email, user_id: u.id, period: "day", period_key: day, ai_messages: 3 });
    const r = await callFunction(FN, t, { action: "tutor_get_plan_summary" });
    expect(r.status).toBe(200);
    expect(r.body.summary.messages_used).toBe(3);
    expect(r.body.summary.messages_limit).toBe(10);
  });
  it("writes the coach note from the AI and saves it to the learner", async () => {
    const { u, t } = await learnerWithProfile();
    await queueAiResponses('{"note":"Keep going with your listening this week."}');
    const r = await callFunction(FN, t, { action: "learner_coach_note" });
    expect(r.status).toBe(200);
    expect(r.body.note).toContain("listening");
    const { data } = await service().from("ParleCoachNote").select("owner_id, created_by").eq("owner_id", u.id);
    expect(data!.length).toBe(1);
  });
  it("coach note falls back when the AI fails", async () => {
    const { t } = await learnerWithProfile();
    await queueAiResponses("garbage", "still garbage");
    const r = await callFunction(FN, t, { action: "learner_coach_note" });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("fallback");
  });
  it("limits AI actions to 60 per account per 10 minutes", async () => {
    const { u, t } = await learnerWithProfile();
    for (let i = 0; i < 60; i++) await service().rpc("take_rate_limit", { p_key: `ai:user:${u.id}`, p_window_seconds: 600, p_max: 60 });
    expect((await callFunction(FN, t, { action: "learner_coach_note" })).status).toBe(429);
  });
});
```

If the coach note needs facts the test learner lacks (an assertion fails on status or note), read
`handleLearnerCoachNoteAction` and create the missing rows with the service client in `learnerWithProfile`. Ledger it.

- [ ] **Step 4: Run** `bun test tests/fn-assessment.test.ts`. Expected: FAIL (function missing).
- [ ] **Step 5: `parle-assessment-service/index.ts`**, then `bun scripts/sync-app-code.ts`

```ts
import { handler } from "../_app/functions/parle-assessment-service.ts";
import { serveWith } from "../_shared/serve.ts";
import { aiActionLimit } from "../_shared/guards.ts";

serveWith(handler, aiActionLimit);
```

- [ ] **Step 6: Run** `bun test tests/fn-assessment.test.ts tests/app-code-sync.test.ts`. Expected: 6 + 3 pass.
- [ ] **Step 7: Billing (only if `STRIPE_SECRET_KEY` exists in `.env`):** as a learner, call
  `{ action: "billing_checkout", plan: "monthly" }` and expect a Stripe sandbox URL starting `https://checkout.stripe.com/`.
  Add this as `it.skipIf(!functionsEnv().STRIPE_SECRET_KEY)(...)`. Otherwise ledger "billing not run: no sandbox key".
- [ ] **Step 8: Commit** `git commit -m "functions: assessment service on Supabase; AI tutor usage via the atomic daily counter"`

---

### Task 9: `parle-marketplace-service` on Supabase, settings saved with their audit row

**Files:**
- Create: `supabase/migrations/20261016000003_setting_with_audit.sql`, `supabase/functions/parle-marketplace-service/index.ts`,
  `tests/fn-marketplace.test.ts`
- Modify: `parle-app/functions/parle-admin-settings.helper.ts` (`saveAdminSettings`, `initializeAppSettings`),
  `_shared/superdev-compat.ts` (`atomic.saveSettingWithAudit`), `parle-app/src/lib/admin-settings.test.ts`

**Interfaces:**
- Produces: SQL `public.save_setting_with_audit(p_key text, p_value text, p_updated_by text, p_owner uuid, p_created_by text, p_audit jsonb) returns void`
  (service role only); `client.atomic.saveSettingWithAudit({ key, value, updatedBy, audit })`, where `audit` is the
  object `writeAdminAudit` builds.

- [ ] **Step 1: Migration**

```sql
-- A setting change and its audit row in one transaction (S24).
create or replace function public.save_setting_with_audit(p_key text, p_value text, p_updated_by text, p_owner uuid, p_created_by text, p_audit jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_key, '') = '' then raise exception 'save_setting_with_audit: key required'; end if;
  update public.app_setting set value = p_value, updated_by = p_updated_by, updated_at = now() where key = p_key;
  if not found then
    insert into public.app_setting (key, value, updated_by, owner_id, created_by) values (p_key, p_value, p_updated_by, p_owner, p_created_by);
  end if;
  insert into public.admin_audit_log (actor_user_id, actor_label, action, target_type, target_id, old_value, new_value, occurred_at_utc, owner_id, created_by)
  values (p_audit->>'actor_user_id', p_audit->>'actor_label', p_audit->>'action', p_audit->>'target_type', p_audit->>'target_id',
          p_audit->>'old_value', p_audit->>'new_value', p_audit->>'occurred_at_utc', p_owner, p_created_by);
end; $$;
revoke all on function public.save_setting_with_audit(text, text, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_setting_with_audit(text, text, text, uuid, text, jsonb) to service_role;
```

If `app_setting` keeps several rows per key (Buildy read the latest), keep that: insert a new row instead of
updating, and ledger it. Read `settingsFromRows` first.

- [ ] **Step 2: Compat.** In `createSuperdevClient`, replace `atomic: {}` with:

```ts
    atomic: {
      async saveSettingWithAudit(input: { key: string; value: string; updatedBy: string; audit: Record<string, unknown> }) {
        const user = await callerOnly();
        if (user.role !== "administrator") throw new CompatError("API request failed: Permission denied", 403);
        const { error } = await db.rpc("save_setting_with_audit", { p_key: input.key, p_value: input.value, p_updated_by: input.updatedBy, p_owner: user.id, p_created_by: user.email, p_audit: input.audit });
        if (error) failed(error, 500);
      },
    },
```

- [ ] **Step 3: Helper.** In `saveAdminSettings` and `initializeAppSettings`, where a setting row is written and then
  `writeAdminAudit` is called, use the atomic path when the client has it, and keep the old path otherwise:

```ts
if (typeof (client as any)?.atomic?.saveSettingWithAudit === "function") {
  await (client as any).atomic.saveSettingWithAudit({ key, value: JSON.stringify(value), updatedBy: actor.id, audit: buildAuditRow(actor, { action, target_type: "app_setting", target_id: key, old_value, new_value: value }) });
} else {
  /* existing create/update + writeAdminAudit */
}
```

Extract `buildAuditRow(actor, entry)` from `writeAdminAudit` (same fields, same `safeJson` and label rules) and make
`writeAdminAudit` call it. Add an app unit test in `admin-settings.test.ts`: with a fake client whose
`atomic.saveSettingWithAudit` records calls, `saveAdminSettings` makes exactly one atomic call per changed key and no
separate audit `create`. Run it red, then green.

- [ ] **Step 4: Failing integration test** `tests/fn-marketplace.test.ts`

```ts
import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { callFunction } from "./helpers/functions-env";

const FN = "parle-marketplace-service";
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const tokenOf = async (u: Awaited<ReturnType<typeof makeUser>>) => (await u.client.auth.getSession()).data.session!.access_token;
const ADMIN_ACTIONS = ["admin_add_test_review", "admin_authorize", "admin_content_coverage", "admin_decide", "admin_get_content_item", "admin_get_demo_bank", "admin_get_metrics", "admin_get_settings", "admin_hide_test_review", "admin_initialize", "admin_list_applications", "admin_list_audit", "admin_list_reported_content", "admin_list_users", "admin_manage_reviews", "admin_open_application", "admin_refresh_public_profile", "admin_resolve_practice_report", "admin_retry_email", "admin_save_content_item", "admin_save_country", "admin_save_settings", "admin_set_premium_comp", "admin_update_demo_bank_content", "admin_verify_document"];

describe("parle-marketplace-service", () => {
  it("refuses callers without a valid token", async () => {
    expect((await callFunction(FN, null, { action: "learner_list_tutors" })).status).toBe(401);
  });
  it("refuses every administrator action to learners and tutors", async () => {
    const learner = await makeUser("learner"), tutor = await makeUser("tutor");
    for (const t of [await tokenOf(learner), await tokenOf(tutor)]) {
      for (const action of ADMIN_ACTIONS) {
        const r = await callFunction(FN, t, { action });
        expect({ action, status: r.status }).toEqual({ action, status: 403 });
      }
    }
  });
  it("lists published tutors to a learner", async () => {
    const r = await callFunction(FN, await tokenOf(await makeUser("learner")), { action: "learner_list_tutors" });
    expect(r.status).toBe(200);
  });
  it("an administrator saves a setting and its audit row together", async () => {
    const admin = await makeUser("admin"), t = await tokenOf(admin);
    await callFunction(FN, t, { action: "admin_initialize" });
    const before = (await callFunction(FN, t, { action: "admin_get_settings" })).body.settings;
    const next = before.free_ai_messages_per_day === 10 ? 11 : 10;
    const r = await callFunction(FN, t, { action: "admin_save_settings", settings: { ...before, free_ai_messages_per_day: next } });
    expect(r.status).toBe(200);
    const { data: audit } = await service().from("admin_audit_log").select("action, target_id").eq("actor_user_id", admin.id).eq("target_id", "free_ai_messages_per_day");
    expect(audit!.length).toBeGreaterThan(0);
    await callFunction(FN, t, { action: "admin_save_settings", settings: { ...before } });
  });
  it("an administrator lists users (full-rights read)", async () => {
    const learner = await makeUser("learner");
    const r = await callFunction(FN, await tokenOf(await makeUser("admin")), { action: "admin_list_users" });
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).toContain(learner.email);
  });
});
```

Payload names for `admin_save_settings` (`settings`) and the response shape of `admin_get_settings` come from
`parle-app/src/pages/AdminControlPanel.tsx`; read them and use the real names before Step 5. Ledger them. A
non-admin may get 403 or a Buildy body with `error_code: "ADMIN_REQUIRED"`. If the status is 200 with that code,
assert on the code instead and ledger it.

- [ ] **Step 5: Run** red, then write `parle-marketplace-service/index.ts`:

```ts
import { handler } from "../_app/functions/parle-marketplace-service.ts";
import { serveWith } from "../_shared/serve.ts";

serveWith(handler);
```

Run `bun scripts/sync-app-code.ts`, then `bun test tests/fn-marketplace.test.ts tests/app-code-sync.test.ts`.
Expected: all pass.
- [ ] **Step 6: Email check.** `admin_decide` sends the tutor decision through `sendEmail`. This is verified live in
  Task 16 (Mailpit shows the message). Here, `grep -n "sendEmail" _app/functions/parle-marketplace-service.ts` shows
  it is unchanged.
- [ ] **Step 7: Commit** `git commit -m "functions: marketplace service on Supabase; setting and audit saved in one transaction"`

---

### Task 10: Scheduled jobs, billing re-check and Stripe webhook

**Files:**
- Create:
  - `supabase/migrations/20261016000004_jobs.sql`;
  - `supabase/functions/parle-marketplace-refresh/index.ts`, `parle-billing-recheck/index.ts`, `stripe-webhook/index.ts`;
  - `tests/fn-jobs.test.ts`, `tests/fn-stripe-webhook.test.ts`.
- Modify: `tests/local-setup.test.ts` (un-skip the job-config test); `parle-backend/package.json` (dev dependency `stripe@14.21.0`).

**Interfaces:**
- Consumes: `refreshPublishedListings` (Task 6); `persistVerifiedStripeSubscription`, `readLearnerSubscriberRecords`
  (`parle-premium-status.helper.ts`, generated copy); `cronOnly`.
- Produces:
  - SQL `private.job_config`, `public.set_job_config(p_functions_url, p_cron_secret)`, `public.job_config_names()`,
    `private.call_function(name)`;
  - cron jobs `parle-marketplace-refresh` (hourly at :07), `parle-daily-cleanup` (03:23 UTC),
    `parle-billing-recheck` (04:41 UTC).

- [ ] **Step 1: Migration** `20261016000004_jobs.sql`

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Where scheduled jobs call functions, and the secret they present. Set by setup-local-functions-env.ts (staging) and Plan 4 (production).
create table if not exists private.job_config (name text primary key, value text not null);

create or replace function public.set_job_config(p_functions_url text, p_cron_secret text) returns void
language sql security definer set search_path = private, public as $$
  insert into private.job_config (name, value) values ('functions_url', p_functions_url), ('cron_secret', p_cron_secret)
  on conflict (name) do update set value = excluded.value;
$$;
create or replace function public.job_config_names() returns text[] language sql security definer set search_path = private as $$
  select coalesce(array_agg(name order by name), '{}') from private.job_config;
$$;
revoke all on function public.set_job_config(text, text), public.job_config_names() from public, anon, authenticated;
grant execute on function public.set_job_config(text, text), public.job_config_names() to service_role;

create or replace function private.call_function(p_name text) returns bigint language plpgsql security definer set search_path = private, public as $$
declare v_url text; v_secret text;
begin
  select value into v_url from private.job_config where name = 'functions_url';
  select value into v_secret from private.job_config where name = 'cron_secret';
  if v_url is null or v_secret is null then raise warning 'job_config missing; % not called', p_name; return null; end if;
  return net.http_post(url := v_url || '/' || p_name, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret), timeout_milliseconds := 120000);
end; $$;

-- Daily clean-up: expired public level-check runs (S29) and old rate-limit windows.
create or replace function private.daily_cleanup() returns void language sql security definer set search_path = public as $$
  delete from public."ParlePublicLevelCheckRun" where coalesce(expires_at, '') <> '' and expires_at::timestamptz < now() - interval '1 day';
  select public.clean_rate_limits();
$$;

select cron.schedule('parle-marketplace-refresh', '7 * * * *', $$select private.call_function('parle-marketplace-refresh')$$);
select cron.schedule('parle-daily-cleanup', '23 3 * * *', $$select private.daily_cleanup()$$);
select cron.schedule('parle-billing-recheck', '41 4 * * *', $$select private.call_function('parle-billing-recheck')$$);
```

Then `bunx supabase migration up && bun scripts/setup-local-functions-env.ts`, and remove `.skip` from the third test in
`tests/local-setup.test.ts`.

- [ ] **Step 2: Failing tests** `tests/fn-jobs.test.ts`

```ts
import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { callFunction, functionsEnv } from "./helpers/functions-env";

const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });

describe("scheduled jobs", () => {
  it("job functions refuse calls without the cron secret", async () => {
    for (const fn of ["parle-marketplace-refresh", "parle-billing-recheck"]) expect((await callFunction(fn, null, {})).status).toBe(401);
  });
  it("the marketplace refresh runs with the cron secret", async () => {
    const r = await callFunction("parle-marketplace-refresh", null, {}, { "x-cron-secret": functionsEnv().CRON_SECRET });
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty("refreshed");
  });
  it("the billing re-check reports when Stripe is not configured, or checks subscribers", async () => {
    const r = await callFunction("parle-billing-recheck", null, {}, { "x-cron-secret": functionsEnv().CRON_SECRET });
    expect(r.status).toBe(200);
    expect(functionsEnv().STRIPE_SECRET_KEY ? typeof r.body.checked : r.body.status).toBe(functionsEnv().STRIPE_SECRET_KEY ? "number" : "not_configured");
  });
  it("the database can reach the functions (pg_net)", async () => {
    const { data, error } = await service().rpc("job_config_names");
    expect(error).toBeNull();
    expect(data).toEqual(["cron_secret", "functions_url"]);
  });
  it("the three jobs are scheduled", async () => {
    const { data } = await service().schema("cron" as any).from("job").select("jobname");
    const names = (data ?? []).map((j: any) => j.jobname).sort();
    expect(names).toEqual(expect.arrayContaining(["parle-billing-recheck", "parle-daily-cleanup", "parle-marketplace-refresh"]));
  });
});
```

If the `cron` schema is not exposed to PostgREST, check the schedule with `docker exec supabase_db_parle-staging psql -U postgres -c "select jobname from cron.job"`
instead and drop that test (ledger it). To prove pg_net reaches the function, run
`select private.call_function('parle-marketplace-refresh')` in the database, then check `net._http_response` for
status 200 within 30 s. Ledger the result, and if `kong:8000` is unreachable from the database container, ledger the
working address.

`tests/fn-stripe-webhook.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import Stripe from "stripe";
import { callFunction, functionsEnv } from "./helpers/functions-env";

const stripe = new Stripe("sk_test_dummy", { apiVersion: "2023-10-16" });
const signed = (payload: object, secret = functionsEnv().STRIPE_WEBHOOK_SECRET) => {
  const body = JSON.stringify(payload);
  return { body, header: stripe.webhooks.generateTestHeaderString({ payload: body, secret }) };
};
async function post(body: string, signature?: string) {
  const r = await fetch("http://127.0.0.1:54321/functions/v1/stripe-webhook", { method: "POST", headers: { "Content-Type": "application/json", ...(signature ? { "stripe-signature": signature } : {}) }, body });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

describe("stripe-webhook", () => {
  it("refuses unsigned and wrongly signed events", async () => {
    expect((await post("{}")).status).toBe(400);
    const s = signed({ id: "evt_1", type: "ping", livemode: false, data: { object: {} } }, "whsec_wrong");
    expect((await post(s.body, s.header)).status).toBe(400);
  });
  it("accepts a signed event it does not act on", async () => {
    const s = signed({ id: "evt_2", object: "event", type: "customer.created", livemode: false, data: { object: {} } });
    const r = await post(s.body, s.header);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ received: true, handled: false });
  });
  it("refuses live-mode events while Parle is in sandbox", async () => {
    const s = signed({ id: "evt_3", object: "event", type: "customer.subscription.updated", livemode: true, data: { object: { id: "sub_x" } } });
    expect((await post(s.body, s.header)).status).toBe(400);
  });
});
```

(`stripe` as a dev dependency: `bun add -d stripe@14.21.0`.)

- [ ] **Step 3: Run** red. Expected: FAIL (404s, module).
- [ ] **Step 4: `parle-marketplace-refresh/index.ts`**

```ts
import { refreshPublishedListings } from "../_app/functions/parle-marketplace-refresh.logic.helper.ts";
import { createSuperdevClient } from "../_shared/superdev-compat.ts";
import { serveWith } from "../_shared/serve.ts";
import { cronOnly } from "../_shared/guards.ts";

serveWith(async () => {
  const client = createSuperdevClient({});
  client.auth.setToken(Deno.env.get("SUPERDEV_SERVICE_ROLE_KEY") ?? "");
  const result = await refreshPublishedListings(client);
  console.info("Parle marketplace hourly refresh", result);
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
}, cronOnly);
```

- [ ] **Step 5: `parle-billing-recheck/index.ts`.** This is the daily safety net (spec section 7). For each
  `Subscriber` with a `stripe_subscription_id`, it retrieves the subscription and customer from Stripe and stores them
  through `persistVerifiedStripeSubscription`. Read that helper's full input type first; it lives in the generated
  `_app/functions/parle-premium-status.helper.ts`.

```ts
import Stripe from "npm:stripe@14.21.0";
import { persistVerifiedStripeSubscription } from "../_app/functions/parle-premium-status.helper.ts";
import { createSuperdevClient } from "../_shared/superdev-compat.ts";
import { serveWith } from "../_shared/serve.ts";
import { cronOnly } from "../_shared/guards.ts";

const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } });

serveWith(async () => {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key.startsWith("sk_test_")) return json({ status: "not_configured" });
  const stripe = new Stripe(key, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() });
  const client = createSuperdevClient({});
  client.auth.setToken(Deno.env.get("SUPERDEV_SERVICE_ROLE_KEY") ?? "");
  const subscribers = await client.entities.Subscriber.filter({}, "-updated_at", 1000);
  let checked = 0, failed = 0;
  for (const row of subscribers) {
    if (!row.stripe_subscription_id || !row.user_id) continue;
    try {
      const subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
      const customer = await stripe.customers.retrieve(String(subscription.customer));
      await persistVerifiedStripeSubscription({ client, userId: row.user_id, email: row.email, testStripeSecret: key, subscription, customer } as any);
      checked++;
    } catch (e) { failed++; console.warn("billing re-check failed for one subscriber", { id: row.id, error: (e as Error).name }); }
  }
  return json({ checked, failed });
}, cronOnly);
```

Fill any remaining required inputs of `persistVerifiedStripeSubscription` from its signature and ledger them.

- [ ] **Step 6: `stripe-webhook/index.ts`**

```ts
import Stripe from "npm:stripe@14.21.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { persistVerifiedStripeSubscription } from "../_app/functions/parle-premium-status.helper.ts";
import { createSuperdevClient } from "../_shared/superdev-compat.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const HANDLED = new Set(["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"]);

/** Stripe calls this when a subscription changes; it updates the subscription cache at once (spec section 6). */
Deno.serve(async (req) => {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "sk_test_unset";
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  const signature = req.headers.get("stripe-signature");
  if (!signature || !secret) return json({ error: "SIGNATURE_REQUIRED" }, 400);
  const stripe = new Stripe(key, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), signature, secret, undefined, Stripe.createSubtleCryptoProvider());
  } catch {
    return json({ error: "SIGNATURE_INVALID" }, 400);
  }
  if (event.livemode) return json({ error: "LIVE_MODE_NOT_ENABLED" }, 400);
  if (!HANDLED.has(event.type)) return json({ received: true, handled: false });
  if (!key.startsWith("sk_test_")) return json({ error: "STRIPE_NOT_CONFIGURED" }, 503);

  const object = event.data.object as Record<string, any>;
  const subscriptionId = event.type === "checkout.session.completed" ? object.subscription : object.id;
  if (!subscriptionId) return json({ received: true, handled: false });
  const subscription = await stripe.subscriptions.retrieve(String(subscriptionId));
  const userId = String(subscription.metadata?.user_id ?? "");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: found } = userId ? await db.auth.admin.getUserById(userId) : { data: null };
  if (!found?.user?.email) return json({ received: true, handled: false });
  const customer = await stripe.customers.retrieve(String(subscription.customer));
  const client = createSuperdevClient({});
  client.auth.setToken(Deno.env.get("SUPERDEV_SERVICE_ROLE_KEY") ?? "");
  await persistVerifiedStripeSubscription({ client, userId, email: found.user.email, testStripeSecret: key, subscription, customer } as any);
  return json({ received: true, handled: true });
});
```

The founder adds the webhook endpoint in the Stripe sandbox dashboard in **Plan 4**. A local function has no public
address; Stripe CLI forwarding would need the founder's Stripe login and is not used. Ledger this.

- [ ] **Step 7: Run** `bun scripts/sync-app-code.ts && bun test tests/fn-jobs.test.ts tests/fn-stripe-webhook.test.ts tests/local-setup.test.ts`.
  Expected: all pass (billing case per key presence).
- [ ] **Step 8: Commit** `git commit -m "functions: pg_cron jobs (refresh, clean-up, billing re-check) and signed Stripe webhook"`

---

### Task 11: The plan engine on the server

**Files:**
- Create:
  - `supabase/functions/_shared/app-shims/context.ts`, `entities.ts`, `functions.ts`;
  - `supabase/functions/parle-plan-service/index.ts`;
  - `parle-app/src/lib/learner-plan-remote.ts`;
  - `tests/fn-plan-service.test.ts`.
- Modify:
  - `scripts/sync-app-code.ts` (`LIB_ROOTS` += `src/lib/learner-plan.ts`);
  - `parle-app/src/functions/index.ts`;
  - the five pages that import `@/lib/learner-plan` (`LearnerTodayPlan`, `LearnerRoadmap`, `LearnerProgress`,
    `LearnerWeeklyCheckin`, `LearnerTutorPlaceholder`).

**Interfaces:**
- Consumes: `createSuperdevClient` (Task 5), the generated `_app/src/lib/learner-plan.ts`.
- Produces:
  - `appContext: AsyncLocalStorage<{ client; token }>` and `current()`;
  - shim exports for all 36 entity names, plus `User`;
  - shim exports `parleAssessmentService`, `parleMarketplaceService`, `parlePublicLevelCheck`, `parleAccountService`, `parlePlanService`;
  - plan-service actions:

| action | engine call | body fields |
|---|---|---|
| `get_or_create_plan` | `getOrCreateMyLearnerPlan(options)` | `options` |
| `mark_task_done` | `markMyLearnerTaskDone(task_id)` | `task_id` |
| `skip_task` | `skipMyLearnerTask(task_id)` | `task_id` |
| `prepare_checkin` | `prepareMyWeeklyCheckIn()` | none |
| `submit_checkin` | `submitMyWeeklyCheckIn(input)` | `input` |
| `load_roadmap` | `loadMyLearnerRoadmap()` | none |
| `load_progress` | `loadMyLearnerProgress()` | none |
| `submit_practice_report` | `submitMyTaskPracticeReport(input)` | `input` |

  Each replies `{ status: "complete", result }`. Errors reply `{ error, error_code: "PLAN_ACTION_FAILED", message }`
  with status 400; the message is logged, not returned.

- [ ] **Step 1: Failing test** `tests/fn-plan-service.test.ts`

```ts
import { describe, it, expect, beforeAll } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { callFunction } from "./helpers/functions-env";
import { clearAiQueue } from "./helpers/ai-queue";
import { seedLocalContent } from "../scripts/seed-local-content";

const FN = "parle-plan-service";
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const tokenOf = async (u: Awaited<ReturnType<typeof makeUser>>) => (await u.client.auth.getSession()).data.session!.access_token;
async function onboardedLearner() {
  const u = await makeUser("learner"), t = await tokenOf(u);
  await callFunction("parle-account-service", t, { action: "ensure_identity", role: "learner", age_confirmed: true });
  await callFunction("parle-account-service", t, { action: "save_profile", time_zone: "America/Toronto" });
  await callFunction("parle-account-service", t, { action: "save_learner_profile", goals: ["immigration"], main_goal: "immigration", track: "immigration", target_per_skill: JSON.stringify({ L: "7", R: "7", W: "7", S: "7" }), no_deadline: true, availability: JSON.stringify({ mon: 20, wed: 20, fri: 20 }), self_assessed_level: "A2", native_language: "English", time_zone: "America/Toronto" });
  await callFunction("parle-account-service", t, { action: "save_unverified_placement", self_assessed_level: "A2", track: "immigration" });
  return { u, t };
}
beforeAll(async () => { await seedLocalContent(); await clearAiQueue(); });

describe("parle-plan-service", () => {
  it("builds the learner's plan on the server and saves it as theirs", async () => {
    const { u, t } = await onboardedLearner();
    const r = await callFunction(FN, t, { action: "get_or_create_plan", options: {} });
    expect(r.status).toBe(200);
    expect(r.body.result.tasks.length).toBeGreaterThan(0);
    for (const table of ["roadmap", "week_plan", "learner_task"]) {
      const { data } = await service().from(table).select("owner_id, created_by").eq("user_id", u.id);
      expect(data!.length).toBeGreaterThan(0);
      expect(data!.every((row) => row.owner_id === u.id && row.created_by === u.email)).toBe(true);
    }
  });
  it("two learners at once each get their own plan", async () => {
    const [a, b] = await Promise.all([onboardedLearner(), onboardedLearner()]);
    const [ra, rb] = await Promise.all([
      callFunction(FN, a.t, { action: "get_or_create_plan", options: {} }),
      callFunction(FN, b.t, { action: "get_or_create_plan", options: {} }),
    ]);
    expect([ra.status, rb.status]).toEqual([200, 200]);
    const owners = async (id: string) => (await service().from("learner_task").select("owner_id").eq("user_id", id)).data!.map((r) => r.owner_id);
    expect(new Set(await owners(a.u.id))).toEqual(new Set([a.u.id]));
    expect(new Set(await owners(b.u.id))).toEqual(new Set([b.u.id]));
  });
  it("a learner completes their own task but cannot complete another learner's task", async () => {
    const a = await onboardedLearner(), b = await onboardedLearner();
    const planA = (await callFunction(FN, a.t, { action: "get_or_create_plan", options: {} })).body.result;
    const planB = (await callFunction(FN, b.t, { action: "get_or_create_plan", options: {} })).body.result;
    const own = planA.tasks.find((x: any) => x.type !== "weekly_checkin");
    expect((await callFunction(FN, a.t, { action: "mark_task_done", task_id: own.id })).status).toBe(200);
    const other = planB.tasks.find((x: any) => x.type !== "weekly_checkin");
    expect((await callFunction(FN, a.t, { action: "mark_task_done", task_id: other.id })).status).toBe(400);
    const { data } = await service().from("learner_task").select("status").eq("id", other.id).single();
    expect(data!.status).not.toBe("done");
  });
  it("roadmap and progress load through the service", async () => {
    const { t } = await onboardedLearner();
    expect((await callFunction(FN, t, { action: "load_roadmap" })).status).toBe(200);
    expect((await callFunction(FN, t, { action: "load_progress" })).status).toBe(200);
  });
  it("refuses unknown actions and missing tokens", async () => {
    expect((await callFunction(FN, null, { action: "load_roadmap" })).status).toBe(401);
    const { t } = await onboardedLearner();
    expect((await callFunction(FN, t, { action: "drop" })).body.error_code).toBe("UNKNOWN_ACTION");
  });
});
```

The learner-profile field formats (`target_per_skill`, `availability`) must match what onboarding saves. Copy them
from `Onboarding.tsx`'s payload before running, and ledger any change. If the engine fails because AI practice
content is unavailable (empty test queue), read `prepareTaskContent`. The engine should fall back to the bank. If it
does not, queue a valid practice answer per task in `beforeAll` and ledger it.

- [ ] **Step 2: Run** red. Expected: 404 from the function server.
- [ ] **Step 3: Shims.** `context.ts`:

```ts
import { AsyncLocalStorage } from "node:async_hooks";
export type AppContext = { client: ReturnType<typeof import("../superdev-compat.ts").createSuperdevClient>; token: string };
/** The current request's caller for app code that imports @/entities and @/functions (one worker serves many requests). */
export const appContext = new AsyncLocalStorage<AppContext>();
export function current(): AppContext {
  const c = appContext.getStore();
  if (!c) throw new Error("App code ran outside a request");
  return c;
}
```

`entities.ts` (one line per entity, all 36, in the same order as `src/entities/index.ts`):

```ts
import { current } from "./context.ts";
const entity = (name: string): any => new Proxy({}, {
  get: (_t, method) => (typeof method !== "string" || method === "then" ? undefined : (...args: unknown[]) => (current().client.entities as any)[name][method](...args)),
});
export const User = { me: () => current().client.auth.me() };
export const ParleCoachNote = entity("ParleCoachNote");
export const ParleCompStatus = entity("ParleCompStatus");
// ... one export per entity name in parle-app/entities/*.json (36 in total)
```

Write all 36 lines explicitly: the list is `ls parle-app/entities`.

`functions.ts`:

```ts
import { current } from "./context.ts";
async function call(name: string, payload: Record<string, unknown> = {}) {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "", Authorization: `Bearer ${current().token}` },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) { const e: any = new Error(`API request failed: ${body.error_code ?? body.error ?? r.status}`); e.status = r.status; throw e; }
  return body;
}
export const parleAssessmentService = (p?: Record<string, unknown>) => call("parle-assessment-service", p);
export const parleMarketplaceService = (p?: Record<string, unknown>) => call("parle-marketplace-service", p);
export const parlePublicLevelCheck = (p?: Record<string, unknown>) => call("parle-public-level-check", p);
export const parleAccountService = (p?: Record<string, unknown>) => call("parle-account-service", p);
export const parlePlanService = (p?: Record<string, unknown>) => call("parle-plan-service", p);
```

- [ ] **Step 4: Generate.** Add `"src/lib/learner-plan.ts"` to `LIB_ROOTS` and run `bun scripts/sync-app-code.ts`.
  Expected: it follows `roadmap-engine`, `i18n`, `learner-display` and their function helpers. Any `.tsx` or bare
  import error is a real blocker: ledger it and map it (for example a type-only import from a component file becomes a
  local type).
- [ ] **Step 5: `parle-plan-service/index.ts`**

```ts
import * as engine from "../_app/src/lib/learner-plan.ts";
import { appContext } from "../_shared/app-shims/context.ts";
import { createSuperdevClient } from "../_shared/superdev-compat.ts";
import { serveWith } from "../_shared/serve.ts";
import { aiActionLimit } from "../_shared/guards.ts";
import { json, fail, preflight } from "../_shared/http.ts";

type Body = Record<string, any>;
const ACTIONS: Record<string, (b: Body) => Promise<unknown>> = {
  get_or_create_plan: (b) => engine.getOrCreateMyLearnerPlan(typeof b.options === "object" && b.options ? b.options : {}),
  mark_task_done: (b) => engine.markMyLearnerTaskDone(String(b.task_id ?? "")),
  skip_task: (b) => engine.skipMyLearnerTask(String(b.task_id ?? "")),
  prepare_checkin: () => engine.prepareMyWeeklyCheckIn(),
  submit_checkin: (b) => engine.submitMyWeeklyCheckIn(b.input),
  load_roadmap: () => engine.loadMyLearnerRoadmap(),
  load_progress: () => engine.loadMyLearnerProgress(),
  submit_practice_report: (b) => engine.submitMyTaskPracticeReport(b.input),
};

/** The study-plan engine, run for the signed-in learner on the server (decision #48). */
serveWith(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const client = createSuperdevClient({});
  client.auth.setToken(token);
  try { await client.auth.me(); } catch { return fail("AUTH_REQUIRED", 401, "Authentication required"); }
  let body: Body;
  try { body = await req.json(); } catch { return fail("INVALID_INPUT", 400); }
  const run = ACTIONS[String(body.action)];
  if (!run) return fail("UNKNOWN_ACTION", 400);
  try {
    const result = await appContext.run({ client, token }, () => run(body));
    return json({ status: "complete", result: result ?? null });
  } catch (e) {
    console.error("parle-plan-service", body.action, (e as Error).message);
    return fail("PLAN_ACTION_FAILED", 400, "The plan could not be updated. Please try again.");
  }
}, aiActionLimit);
```

- [ ] **Step 6: Run** `bun test tests/fn-plan-service.test.ts tests/app-code-sync.test.ts`. Expected: 5 + 3 pass.
- [ ] **Step 7: Browser side.** Add to `parle-app/src/functions/index.ts`:
  `export const parlePlanService = functions.parlePlanService;`. Create `src/lib/learner-plan-remote.ts`:

```ts
import { parlePlanService } from "@/functions";
import type { LearnerPlanView, LearnerRoadmapData, LearnerProgressData, LearnerCheckInSession, LearnerCheckInResult, PracticeReportCategory } from "./learner-plan";

export {
  earliestOwnedPlacementDate, filterLearnerRowsByOwner, hasScoredLearnerAssessment, latestSavedSkillEstimateValues,
  latestScoredLearnerCheckIn, selectTodayWhatChangedNote, todayLevelHeadingKey, selectApprovedCheckInQuestionItems,
} from "./learner-plan";
export type * from "./learner-plan";

/** The plan engine runs on the server (decision #48); these keep the names and shapes the pages already use. */
async function run<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const response = (await parlePlanService({ action, ...payload })) as { result: T };
  return response.result;
}
type SubmitInput = Parameters<typeof import("./learner-plan").submitMyWeeklyCheckIn>[0];
export const getOrCreateMyLearnerPlan = (options: Record<string, unknown> = {}) => run<LearnerPlanView>("get_or_create_plan", { options });
export const markMyLearnerTaskDone = (taskId: string) => run<string | null>("mark_task_done", { task_id: taskId });
export const skipMyLearnerTask = (taskId: string) => run<void>("skip_task", { task_id: taskId });
export const prepareMyWeeklyCheckIn = () => run<LearnerCheckInSession>("prepare_checkin");
export const submitMyWeeklyCheckIn = (input: SubmitInput) => run<LearnerCheckInResult>("submit_checkin", { input });
export const loadMyLearnerRoadmap = () => run<LearnerRoadmapData>("load_roadmap");
export const loadMyLearnerProgress = () => run<LearnerProgressData>("load_progress");
export const submitMyTaskPracticeReport = (input: { taskId: string; category: PracticeReportCategory; note?: string }) => run<void>("submit_practice_report", { input });
```

In the five pages, change `from "@/lib/learner-plan"` to `from "@/lib/learner-plan-remote"`. Leave tests and
`learner-progress-summary.ts` (type-only) unchanged.
- [ ] **Step 8: Serialisation check.** In `learner-plan.ts`, search the result types (`LearnerPlanView`,
  `LearnerRoadmapData`, `LearnerProgressData`, `LearnerCheckInSession`, `LearnerCheckInResult`) for `Date`, `Map`, `Set`
  or functions. If any appear, ledger them and convert at the service boundary (for example `Date` to ISO string).
  Then `cd parle-app && bun run test && bun run build`. Expected: 359+ pass; build succeeds.
- [ ] **Step 9: Commit** `git commit -m "plan engine runs on the server (parle-plan-service); pages call it"`

---

### Task 12: Placement test scored on the server

**Files:**
- Create:
  - `supabase/migrations/20261016000005_placement_run.sql`;
  - `supabase/functions/parle-plan-service/placement.ts`;
  - `parle-app/src/lib/placement-remote.ts`;
  - `tests/fn-placement.test.ts`.
- Modify: `parle-plan-service/index.ts` (four actions), `scripts/sync-app-code.ts` (`LIB_ROOTS` += `src/lib/placement-test.ts`), `parle-app/src/pages/PlacementTest.tsx`

**Interfaces:**
- Table `placement_run` (server only), with these columns:
  `id uuid pk default gen_random_uuid()`, `owner_id uuid`, `user_id text`, `status text` (`open|finished|abandoned`),
  `state_json text`, `served_item_id text default ''`, `created_at`, `updated_at`.
  Unique `(user_id) where status = 'open'`.
- Actions (body, then reply):

| action | body | reply |
|---|---|---|
| `placement_open` | none | `{ screen: "access" }`, `{ screen: "result", record }` (retake gate) or `{ screen: "ready", runId, sections, writingPrompt }` |
| `placement_question` | `runId, section` | `{ question }` without `answer_option_id`, `answer` or `explanation`; or `{ done: true }` |
| `placement_answer` | `runId, optionId` | `{ is_correct, correct_option_id, explanation, completed, summary? }` |
| `placement_skip` | `runId, section` | `{ ok: true }` |
| `placement_finish` | `runId, writingAssessment` | `{ record, snapshot }` |

  `writingAssessment` is the output of the existing `score_writing` call, re-validated on the server with
  `validateWritingAssessment`.
- The pure functions from `src/lib/placement-test.ts` run on the server unchanged: `createAdaptiveRun`,
  `getNextQuestion`, `applyAdaptiveAnswer`, `summarizeAutoRun`, `assemblePlacementResult`, `getRetakeGate`,
  `selectApprovedDemoQuestionItems`, `selectPrompt`.

- [ ] **Step 1: Failing test** `tests/fn-placement.test.ts`

```ts
import { describe, it, expect, beforeAll } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { callFunction } from "./helpers/functions-env";
import { seedLocalContent } from "../scripts/seed-local-content";

const FN = "parle-plan-service";
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const tokenOf = async (u: Awaited<ReturnType<typeof makeUser>>) => (await u.client.auth.getSession()).data.session!.access_token;
async function learner() {
  const u = await makeUser("learner"), t = await tokenOf(u);
  await callFunction("parle-account-service", t, { action: "ensure_identity", role: "learner", age_confirmed: true });
  await callFunction("parle-account-service", t, { action: "save_learner_profile", track: "immigration", goals: ["immigration"], main_goal: "immigration", self_assessed_level: "A2", native_language: "English", time_zone: "America/Toronto" });
  return { u, t };
}
beforeAll(async () => { await seedLocalContent(); });

describe("placement test on the server", () => {
  it("questions are served without answers; feedback only after answering", async () => {
    const { t } = await learner();
    const open = await callFunction(FN, t, { action: "placement_open" });
    expect(open.body.result.screen).toBe("ready");
    const runId = open.body.result.runId;
    const q = (await callFunction(FN, t, { action: "placement_question", runId, section: "listening" })).body.result.question;
    for (const leak of ["answer_option_id", "\"answer\"", "explanation"]) expect(JSON.stringify(q)).not.toContain(leak);
    const fb = (await callFunction(FN, t, { action: "placement_answer", runId, optionId: q.options[0].id })).body.result;
    expect(typeof fb.is_correct).toBe("boolean");
    expect(typeof fb.correct_option_id).toBe("string");
  });
  it("an answer for a run that is not yours is refused", async () => {
    const a = await learner(), b = await learner();
    const runId = (await callFunction(FN, a.t, { action: "placement_open" })).body.result.runId;
    await callFunction(FN, a.t, { action: "placement_question", runId, section: "listening" });
    expect((await callFunction(FN, b.t, { action: "placement_answer", runId, optionId: "x" })).status).toBe(400);
  });
  it("a full run saves an assessed result for the learner and blocks a retake for 14 days", async () => {
    const { u, t } = await learner();
    const runId = (await callFunction(FN, t, { action: "placement_open" })).body.result.runId;
    for (const section of ["listening", "reading", "grammar_vocabulary"]) {
      for (let i = 0; i < 40; i++) {
        const r = (await callFunction(FN, t, { action: "placement_question", runId, section })).body.result;
        if (r.done) break;
        const fb = (await callFunction(FN, t, { action: "placement_answer", runId, optionId: r.question.options[0].id })).body.result;
        if (fb.completed) break;
      }
    }
    await callFunction(FN, t, { action: "placement_skip", runId, section: "writing" });
    await callFunction(FN, t, { action: "placement_skip", runId, section: "speaking" });
    const fin = await callFunction(FN, t, { action: "placement_finish", runId, writingAssessment: null });
    expect(fin.status).toBe(200);
    const { data } = await service().from("placement_result").select("status, source, owner_id").eq("user_id", u.id).eq("status", "assessed");
    expect(data!.map((r) => ({ s: r.source, o: r.owner_id }))).toEqual([{ s: "placement_test", o: u.id }]);
    expect((await callFunction(FN, t, { action: "placement_open" })).body.result.screen).toBe("result");
  });
  it("the browser cannot read the question bank", async () => {
    const { u } = await learner();
    const { data } = await u.client.from("question_item").select("id").limit(1);
    expect(data ?? []).toEqual([]);
  });
});
```

If writing is not optional in the page's section rules (`isOptionalSection`), use a queued AI writing score through
`score_writing` and pass it to `placement_finish`; ledger the change.

- [ ] **Step 2: Run** red.
- [ ] **Step 3: Migration** `20261016000005_placement_run.sql`

```sql
create table if not exists public.placement_run (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  user_id text not null,
  status text not null default 'open' check (status in ('open', 'finished', 'abandoned')),
  state_json text not null default '{}',
  served_item_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists placement_run_one_open on public.placement_run (user_id) where status = 'open';
alter table public.placement_run enable row level security;
revoke all on public.placement_run from anon, authenticated;
```

- [ ] **Step 4: `parle-plan-service/placement.ts`.** Server state is `{ selfAssessedLevel, track, targets,
  sectionOrder, sectionIndex, run: AdaptiveRun | null, autoResults: AutoSectionSummary[], skipped: string[] }`. The
  rules:
  - `placement_open` loads the learner profile (`learner_profile` via `client.entities`). With no
    `self_assessed_level`, it returns `access`.
  - It then applies `getRetakeGate(user.email)` and returns `result` when the learner is blocked.
  - Otherwise it reuses the open run or creates one, and loads the approved demo items exactly as `PlacementTest.tsx`
    does (`selectApprovedDemoQuestionItems`, the prompt filter, `validateQuestionBank` / `validatePromptBank` moved
    from the page into `placement-test.ts`). It picks the writing prompt with `selectPrompt` and stores the item ids
    in the state.
  - `placement_question` creates the section's `AdaptiveRun` on first call (`createAdaptiveRun(section, level)`).
    It calls `getNextQuestion(run, items)`, stores `served_item_id`, and returns the item without
    `answer_option_id`, `answer` and `explanation`.
  - `placement_answer` requires `served_item_id` and an open run owned by the caller (look it up by
    `id` **and** `owner_id`; otherwise throw, giving a 400). It calls `applyAdaptiveAnswer(run, item, optionId)`,
    clears `served_item_id`, and on `completed` pushes `summarizeAutoRun` and advances `sectionIndex`.
  - `placement_finish` builds the record with `assemblePlacementResult` and the same payload fields
    `saveCompletedResult` uses today. It inserts it through `client.entities.placement_result.create` (so the owner is
    stamped) and marks the run `finished`.
  - All `placement_run` access uses `client.serviceDb()`, with `owner_id = caller.id` in every query.

  Wire the four actions into `ACTIONS` in `index.ts`; they run inside `appContext` like the others.
- [ ] **Step 5: Page.** `src/lib/placement-remote.ts` exposes `openPlacement()`, `nextQuestion(runId, section)`,
  `answer(runId, optionId)`, `skipSection(runId, section)` and `finishPlacement(runId, writingAssessment)` over
  `parlePlanService`. In `PlacementTest.tsx`, keep every screen and its text. Replace:
  - `loadTestData` with `openPlacement`;
  - `startCurrentSection`'s local `createAdaptiveRun`, and `currentQuestion`, with `nextQuestion`;
  - `submitSelectedAnswer` with `answer`; feedback renders `correct_option_id` / `explanation` from the reply;
  - `saveCompletedResult`'s `placement_result.create` and filter with `finishPlacement`.

  The question / prompt entity imports are removed from the page. `createBalancedOptionOrder` stays on the page (it
  only reorders the options it was given). Run `bun run test && bun run build`.
- [ ] **Step 6: Run** `bun scripts/sync-app-code.ts && bun test tests/fn-placement.test.ts tests/app-code-sync.test.ts`. Expected: all pass.
- [ ] **Step 7: Commit** `git commit -m "placement test scored on the server; answer keys never sent before answering"`

---

### Task 13: Delete my account

**Files:**
- Create: `supabase/functions/_shared/account-deletion.ts`, `tests/account-deletion.test.ts`
- Modify: `tests/helpers/users.ts` (`makeUser` also returns its random `password`),
  `supabase/functions/parle-account-service/index.ts` (`delete_account`), `parle-app/src/pages/Settings.tsx`,
  `parle-app/src/lib/parle-profile.ts` (`deleteMyAccount`), `parle-app/src/lib/i18n.ts`

**Interfaces:**
- `delete_account` body `{ password, confirm: "DELETE" }`. Errors: `CONFIRMATION_REQUIRED` 400,
  `PASSWORD_INCORRECT` 403, `ADMIN_CANNOT_SELF_DELETE` 403, `ACTIVE_SUBSCRIPTION` 409. Success `{ status: "deleted" }`.
- `deleteAccountData(db, caller) -> { blocked?: string; deleted: Record<string, number> }`.

- [ ] **Step 1: Failing test** `tests/account-deletion.test.ts`

```ts
import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { callFunction } from "./helpers/functions-env";

const FN = "parle-account-service";
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const tokenOf = async (u: Awaited<ReturnType<typeof makeUser>>) => (await u.client.auth.getSession()).data.session!.access_token;

async function learnerWithData() {
  const u = await makeUser("learner"), t = await tokenOf(u);
  await callFunction(FN, t, { action: "ensure_identity", role: "learner", age_confirmed: true });
  await callFunction(FN, t, { action: "save_profile", time_zone: "UTC" });
  await callFunction(FN, t, { action: "save_learner_profile", track: "general", goals: ["general"], main_goal: "general" });
  const tutor = await makeUser("tutor");
  const db = service();
  const { data: booking } = await db.from("booking").insert({ owner_id: u.id, created_by: u.email, learner_user_id: u.id, learner_first_name: "Ana", learner_message: "Hi", tutor_user_id: tutor.id, tutor_display_name: "T", status: "requested" }).select("id").single();
  const { data: review } = await db.from("tutor_review").insert({ owner_id: u.id, created_by: u.email, tutor_email: tutor.email, stars: 5, comment: "Great, I'm Ana from Laval" }).select("id").single();
  return { u, t, bookingId: booking!.id, reviewId: review!.id };
}

describe("delete my account", () => {
  it("needs the typed confirmation and the right password", async () => {
    const { t, u } = await learnerWithData();
    expect((await callFunction(FN, t, { action: "delete_account", password: u.password })).body.error_code).toBe("CONFIRMATION_REQUIRED");
    expect((await callFunction(FN, t, { action: "delete_account", password: "wrong", confirm: "DELETE" })).body.error_code).toBe("PASSWORD_INCORRECT");
    expect((await service().auth.admin.getUserById(u.id)).data.user).not.toBeNull();
  });
  it("removes personal rows and the login, keeps other people's records anonymised", async () => {
    const other = await learnerWithData();
    const { u, t, bookingId, reviewId } = await learnerWithData();
    const r = await callFunction(FN, t, { action: "delete_account", password: u.password, confirm: "DELETE" });
    expect(r.body).toEqual({ status: "deleted" });
    const db = service();
    expect((await db.auth.admin.getUserById(u.id)).data.user).toBeNull();
    for (const table of ["ParleIdentity", "ParleProfile", "learner_profile"]) {
      expect((await db.from(table).select("id").eq("created_by", u.email)).data).toEqual([]);
    }
    const { data: booking } = await db.from("booking").select("learner_user_id, learner_first_name, learner_message, created_by, status").eq("id", bookingId).single();
    expect(booking).toEqual({ learner_user_id: "", learner_first_name: "Deleted learner", learner_message: "", created_by: "deleted-account", status: "requested" });
    const { data: review } = await db.from("tutor_review").select("stars, comment, created_by").eq("id", reviewId).single();
    expect(review).toEqual({ stars: 5, comment: "", created_by: "deleted-account" });
    expect((await db.from("ParleIdentity").select("id").eq("owner_id", other.u.id)).data!.length).toBe(1);
  });
  it("is refused while a paid subscription is active", async () => {
    const { u, t } = await learnerWithData();
    await service().from("Subscriber").insert({ owner_id: u.id, created_by: u.email, user_id: u.id, email: u.email, stripe_status: "active", cancel_at_period_end: false });
    expect((await callFunction(FN, t, { action: "delete_account", password: u.password, confirm: "DELETE" })).body.error_code).toBe("ACTIVE_SUBSCRIPTION");
  });
  it("administrators cannot delete themselves", async () => {
    const admin = await makeUser("admin");
    expect((await callFunction(FN, await tokenOf(admin), { action: "delete_account", password: admin.password, confirm: "DELETE" })).body.error_code).toBe("ADMIN_CANNOT_SELF_DELETE");
  });
});
```

- [ ] **Step 2: Run** red.
- [ ] **Step 3: `_shared/account-deletion.ts`**

```ts
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import RULES from "./entity-rules.json" with { type: "json" };

const ANON = "deleted-account";
/** Tables whose rows name a person by user id (column) besides owner_id. */
const BY_USER_ID: Record<string, string> = {
  ParleCoachNote: "user_id", ParleCompStatus: "user_id", Subscriber: "user_id", ai_message: "user_id", ai_session: "user_id",
  availability_exception: "user_id", availability_rule: "user_id", checkin: "user_id", learner_profile: "user_id", learner_task: "user_id",
  milestone: "user_id", mistake_log: "user_id", placement_result: "user_id", roadmap: "user_id", skill_estimate: "user_id",
  topic_mastery: "user_id", tutor_booking_settings: "tutor_user_id", tutor_document: "user_id", tutor_profile: "user_id",
  tutor_profile_public_edits: "user_id", tutor_public_profile: "tutor_user_id", usage_counter: "user_id", week_plan: "user_id",
  placement_run: "user_id",
};
const KEEP = new Set(["booking", "tutor_review", "admin_audit_log", "app_setting", "question_item", "prompt_item", "tutor_payout_country", "ParlePublicLevelCheckRun"]);

/** Removes a person's data (spec section 5, S2); records other people rely on stay, without personal data. */
export async function deleteAccountData(db: SupabaseClient, caller: { id: string; email: string }): Promise<{ blocked?: string; deleted: Record<string, number> }> {
  const { data: subs } = await db.from("Subscriber").select("stripe_status, cancel_at_period_end").eq("user_id", caller.id);
  if ((subs ?? []).some((s: any) => ["active", "trialing", "past_due"].includes(String(s.stripe_status)) && s.cancel_at_period_end !== true)) {
    return { blocked: "ACTIVE_SUBSCRIPTION", deleted: {} };
  }
  const must = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };
  // Bookings: the other person keeps the record.
  must(await db.from("booking").update({ learner_user_id: "", learner_first_name: "Deleted learner", learner_message: "", owner_id: null, created_by: ANON }).eq("learner_user_id", caller.id));
  must(await db.from("booking").update({ tutor_user_id: "", tutor_display_name: "Deleted tutor" }).eq("tutor_user_id", caller.id));
  // Reviews written by this person keep their stars, not their words.
  must(await db.from("tutor_review").update({ comment: "", owner_id: null, created_by: ANON }).eq("created_by", caller.email));
  // Reviews about a deleted tutor, and their replies, go with the tutor's profile.
  must(await db.from("tutor_review_reply").delete().eq("tutor_email", caller.email));
  must(await db.from("tutor_review").delete().eq("tutor_email", caller.email));
  must(await db.from("tutor_application_review").delete().eq("tutor_email", caller.email));
  const deleted: Record<string, number> = {};
  for (const table of [...Object.keys(RULES), "placement_run"]) {
    if (KEEP.has(table)) continue;
    const a = await db.from(table).delete({ count: "exact" }).eq("owner_id", caller.id); must(a);
    const col = BY_USER_ID[table];
    const b = col ? await db.from(table).delete({ count: "exact" }).eq(col, caller.id) : { count: 0, error: null };
    must(b as any);
    deleted[table] = (a.count ?? 0) + ((b as any).count ?? 0);
  }
  const { data: files } = await db.storage.from("profile-photos").list(caller.id);
  if (files?.length) await db.storage.from("profile-photos").remove(files.map((f) => `${caller.id}/${f.name}`));
  const gone = await db.auth.admin.deleteUser(caller.id);
  if (gone.error) throw new Error(gone.error.message);
  return { deleted };
}
```

- [ ] **Step 4: Action** in `parle-account-service/index.ts` (inside the `switch`):

```ts
      case "delete_account": {
        if (body.confirm !== "DELETE") return fail("CONFIRMATION_REQUIRED", 400, "Type DELETE to confirm.");
        if (caller.role === "admin") return fail("ADMIN_CANNOT_SELF_DELETE", 403);
        const check = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
        const signIn = await check.auth.signInWithPassword({ email: caller.email, password: String(body.password ?? "") });
        if (signIn.error) return fail("PASSWORD_INCORRECT", 403, "That password is not right.");
        const result = await deleteAccountData(admin, caller);
        if (result.blocked) return fail(result.blocked, 409, "Cancel your Premium subscription in Manage billing first.");
        console.info("account deleted", { tables: Object.keys(result.deleted).length });
        return json({ status: "deleted" });
      }
```

(Import `createClient` from `npm:@supabase/supabase-js@2` and `deleteAccountData` from `../_shared/account-deletion.ts`.)

- [ ] **Step 5: Settings.** Add a "Delete my account" section at the bottom of `Settings.tsx`:
  - a short explanation, a password field, a text field labelled "Type DELETE to confirm", and a red button;
  - on success, `logout` and navigate to `/`;
  - error codes map to text (`ACTIVE_SUBSCRIPTION` explains Manage billing).

  `parle-profile.ts` gains `deleteMyAccount(password: string, confirm: string)`, which calls
  `parleAccountService({ action: "delete_account", password, confirm })`. Add the i18n keys
  `settings.delete.title`, `.body`, `.password`, `.confirm`, `.button`, `.working`, `.error.password`,
  `.error.subscription` and `.error.generic`.
- [ ] **Step 6: Run** `bun test tests/account-deletion.test.ts tests/account-service.test.ts && cd ../parle-app && bun run test && bun run build`. Expected: all pass.
- [ ] **Step 7: Commit** `git commit -m "accounts: delete my account (personal data removed, shared records anonymised)"`

---

### Task 14: No Buildy assets; profile photos without the paid resizer

**Files:**
- Modify: `parle-app/src/components/parle/Brand.tsx`, `src/pages/Index.tsx`, `index.html`, `public/manifest.json`,
  `src/App.tsx` (remove `BrandingBadge`), `src/lib/parle-profile.ts` (photo display URL)
- Delete: `src/components/BrandingBadge.tsx`. Create: `public/brand/*` (downloaded images), `src/lib/no-buildy.test.ts`

- [ ] **Step 1: Failing test** `src/lib/no-buildy.test.ts`

```ts
import { describe, it, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { profilePhotoDisplayUrl } from "./parle-profile";

const ROOT = join(import.meta.dir, "../..");
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p]; });

describe("no Buildy at run time", () => {
  it("no source, page or manifest refers to Buildy hosts", () => {
    const targets = [...files(join(ROOT, "src")), join(ROOT, "index.html"), join(ROOT, "public/manifest.json")].filter((p) => /\.(tsx?|html|json)$/.test(p) && !p.endsWith(".test.ts"));
    const hits = targets.filter((p) => /buildy\.ai|buildy\.show|superdev|ellprnxjjzatijdxcogk/i.test(readFileSync(p, "utf8")));
    expect(hits.map((p) => p.slice(ROOT.length))).toEqual([]);
  });
  it("shows uploaded photos through the plain public address (D30)", () => {
    const url = "http://127.0.0.1:54321/storage/v1/object/public/profile-photos/u/p.png";
    expect(profilePhotoDisplayUrl(url, 240)).toBe(url);
  });
});
```

Use the photo URL helper's real name from `parle-profile.ts` (around line 204) in place of `profilePhotoDisplayUrl`.
The comments in `src/lib/superdev/client.ts` and `tutor-profile-load-state.ts` that mention `superdev` count as hits:
reword them.

- [ ] **Step 2: Run** red (Brand.tsx, Index.tsx, index.html, manifest, BrandingBadge, comments).
- [ ] **Step 3: Assets.** Download each Buildy-hosted image once with `curl -L -o public/brand/<name>.webp "<url>"`
  (read the URLs from the files) into `public/brand/`, then point the references to `/brand/<name>.webp`. Remove
  `BrandingBadge` from `App.tsx` and delete the component. In the photo helper, return the stored URL unchanged
  (sizing stays with CSS `object-fit`). Rename the `superdev` import path comment wording. Keep
  `src/lib/superdev/client.ts`: it is the old import path the pages use. Its comment must not contain the word.
- [ ] **Step 4: Run** `bun run test && bun run build`. Expected: all pass. Open `dist/index.html` and confirm the icon paths are local.
- [ ] **Step 5: Commit** `git commit -m "app: brand images served locally, Buildy badge removed, photos via plain public link (D30, D31)"`

---

### Task 15: AI model bake-off (founder chooses)

**Files:** Create `scripts/ai-bakeoff.ts`, `06_Build/export-decoupling/spikes/ai-bakeoff-report.md`, and later
`supabase/migrations/20261016000006_ai_models.sql` (after the founder's choice)

- [ ] **Step 1: Script.** It reads the NVIDIA key with `readSecret("NVIDIA_API_KEY")` and runs four prompts (spec
  section 7) through each candidate. The prompts are:
  - an A2 writing correction (Buildy's `score_writing` prompt and schema, copied from `parle-assessment-service.ts`);
  - an AI lesson opening (the tutor `opening` prompt for mode `lesson`, built with `buildTutorPrompt` and the same
    schema);
  - a Persian explanation of *depuis* vs *pendant* (plain text);
  - a check-in writing score (same as the first, at B1).

  The candidates are `moonshotai/kimi-k3`, `z-ai/glm-5.3`, `google/gemma-4-31b-it`, `deepseek-ai/deepseek-v4.1-flash`
  (with `max_tokens` 4096 and, if the API accepts it, reasoning off) and `nvidia/nemotron-3-super-120b-a12b`. It
  records time, whether the JSON passed `validateJson`, and the text (first 1,200 characters). It writes the report;
  the key is never printed. Model ids are checked against `/v1/models` first; missing ids are listed, not guessed.
- [ ] **Step 2: Run** `bun scripts/ai-bakeoff.ts`. Expected: a report with one table (model × prompt: seconds, JSON
  ok) and the answers. Add the COO's recommendation per feature: chat (`standard`, used by the live tutor) and
  background (`fast`: coach note, practice, drafts, audit).
- [ ] **Step 3: Founder decision.** Ask the founder to pick (show the table). Write the decision as #49 in
  `10_Decisions-Meetings/DECISIONS.md`, and a migration that inserts or updates `ai_model_standard`, `ai_model_fast`
  and `ai_global_daily_cap` (value JSON strings) in `app_setting`.
- [ ] **Step 4: Commit** `git commit -m "AI: model bake-off report; chosen models stored in settings (decision #49)"`

---

### Task 16: Live check, security list, report and hand-over

**Files:** Create `06_Build/export-decoupling/plans/2026-10-16-plan-3-report.md`; Modify `HANDOFF.md`,
`06_Build/export-decoupling/security-debt.md`, `deferred-defects.md`

- [ ] **Step 1: Run everything locally.**
  1. Stack and functions running.
  2. In `supabase/functions/.env`, set `AI_PROVIDER=nvidia`, then restart `functions serve`.
  3. Start the app: `cd parle-app && bun run dev -- --host 127.0.0.1 --port 5173`.
  4. Create local test users: a learner, a tutor and an admin (`makeUser`-style script, or sign-up plus `app_metadata` via the service client for the admin).
- [ ] **Step 2: Walk each role in the gstack browser** (new tab; reading codes and mail from Mailpit). Record pass or
  fail per item.
  - **Learner:**
    - onboarding, Today (plan built, a task marked done, a practice task opened);
    - AI tutor (one real NVIDIA message, the counter goes down by one);
    - weekly check-in submitted (writing scored by AI), Roadmap, Progress;
    - placement test end to end (result saved, retake blocked);
    - Tutors list and a tutor profile, a booking request;
    - Your plan, then **founder clicks the sandbox checkout**, then "Refresh my plan" shows Premium;
    - Settings photo, then delete a second throwaway learner account.
  - **Tutor:** application (profile, a PDF certificate upload), submit, availability, profile and pricing, reviews.
  - **Admin:**
    - every admin page loads;
    - approve the tutor (decision email visible in Mailpit), metrics, users, settings save (audit row present), content
      coverage and item edit, reported content.
  - **Signed out:** home, public level check (10 starts, then "too many"), tutors directory.
  - **Jobs:** run `select private.call_function('parle-marketplace-refresh')` and check the response row.
- [ ] **Step 3: Security list.** In `security-debt.md`, add "Status after backend Plan 3": every S1-S29 marked fixed /
  not applicable / open with reason and test name.
- [ ] **Step 4: Report** with per-flow results, both suites' counts, rulings, deferred items (including: Plan 4
  aggregates Buildy's one-row-per-message `usage_counter` into daily rows before loading; trusted client-IP header in
  production; Stripe webhook endpoint added in the sandbox dashboard; `x-forwarded-for` spoofing review).
- [ ] **Step 5:** Stop the servers (`bunx supabase stop`, the dev and functions shells). Commit
  `git commit -m "backend plan 3: functions, AI, email, jobs, plan engine, deletion; report and hand-over"` and push the branch.

---

## Self-review notes (writer)

- Spec coverage. Phase 3:
  - ported functions: Tasks 7-10;
  - caller checks: compat `me()` and each service;
  - transactions: usage (Task 8, atomic RPC), setting + audit (Task 9);
  - check-in re-plan: idempotent through the existing unique keys (Plan 1);
  - rate limits: Tasks 2, 6, 7, 8;
  - Stripe webhook: Task 10.

  Phase 4: AI module (Task 4), bake-off (Task 15), email module (Task 3), storage (Plan 2 bucket, plus Task 14 for the
  brand assets), cron (Task 10). Decision #48: Task 11. S2 deletion: Task 13. Answer keys server-side (S9, S12, S17):
  Tasks 7 and 12.
- **Deviation from spec section 7, for the founder to accept:**
  - tutor documents stay inside their database row (server-only, 512 KB limit, as built on Buildy) instead of a
    `tutor-private` bucket;
  - profile photos use the existing `profile-photos` bucket (one public bucket) instead of `tutor-public`;
  - "check-in -> re-plan -> audit" is made safe by unique keys and idempotent re-runs, not one SQL transaction (the
    engine's many writes cannot share one PostgREST transaction).
- Known risk: the plan-engine and placement tasks depend on payload formats that the tests copy from the pages. Each
  such step says where to read them, and every mismatch is ledgered.
