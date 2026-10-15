# Backend decoupling, Plan 2 of 4: compatibility layer, sign-in, Resend, account writes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The exported app signs up (with email verification), signs in, resets passwords, signs out, completes onboarding (identity, profile, learner profile, self-assessed placement) and saves Settings against local Supabase, with no call to Buildy on those paths and no browser write to any app table.

**Architecture:** A new `src/lib/backend/` module in the app re-implements the small surface of Buildy's client the app uses (`entity().filter/get/list/create/update/delete/bulkCreate`, `auth.me/updateProfile/logout/setToken`, `isAuthenticated`, `functions.X`, `uploadFile`) on top of `supabase-js`. The four bridge files (`src/lib/superdev/client.ts`, `src/entities/index.ts`, `src/functions/index.ts`, `src/integrations/core.ts`) are re-pointed to it, so pages keep their imports. Account and onboarding writes move into one Edge Function, `parle-account-service`, built on shared `caller.ts` / `db.ts` helpers that Plan 3 reuses for every ported Buildy function. Sign-in uses Supabase Auth with a 6-digit email code for verification and password reset links carrying a token hash.

**Tech Stack:** React 18 + Vite (existing app), `@supabase/supabase-js` v2, Supabase Edge Functions (Deno), local Supabase in Docker (`bunx supabase`), Mailpit (local mail catcher, port 54324), Resend (production SMTP and API), Bun tests.

**Spec:** `06_Build/export-decoupling/specs/2026-10-14-backend-decoupling-design.md` (sections 3, 5, 6, 7 email/files, 8); Plan 1 report `06_Build/export-decoupling/plans/2026-10-14-plan-1-report.md`; decision #48.

## Global Constraints

- **No browser write to any app table** (spec section 4, decision #48). Every write in this plan goes through an Edge Function using the service role after `caller.ts` has verified the user.
- Out of scope here, moved to Plan 3 with the Buildy function port: the study-plan engine (`src/lib/learner-plan.ts`), the scored placement test (`src/pages/PlacementTest.tsx` reads the question bank and writes `placement_result`), AI, billing, admin and marketplace functions. Their screens keep calling the (not yet ported) functions and are expected to fail on the new stack until Plan 3.
- Also Plan 3: account deletion (spec section 5, S2), because it needs a per-table delete-or-anonymize rule across all 36 tables. Google sign-in stays switched off (decision #24).
- `User.me()` keeps Buildy's shape: `{ id, email, full_name, role }` where `role` is `"administrator"` for admins and `"user"` otherwise (pages compare `role === "administrator"`). The Supabase role is `app_metadata.role` (`"admin"`, `"learner"`, `"tutor"`, Plan 1 Task 9).
- Rows written by server code carry `owner_id = caller id` and `created_by = caller email` (pages filter on `created_by: user.email`, Plan 1 filter report).
- Text values stay as the app sends them (Plan 1 Task 7: strings are text, `""` kept).
- Secrets: `RESEND_API_KEY` lives only in `C:/Users/AgentDev/.parle-secrets/RESEND_API_KEY` and, for production, in Supabase secrets (Plan 4). Never printed, committed or put on a command line.
- Docker Desktop must be running; start the stack with `bunx supabase start -x imgproxy,vector,logflare,supavisor` in `07_Engineering/parle-backend`; stop it at the end of each session.
- App env (git-ignored `07_Engineering/parle-app/.env.local`): `VITE_SUPABASE_URL=http://127.0.0.1:54321`, `VITE_SUPABASE_PUBLISHABLE_KEY=<local anon key from bunx supabase status>`. The old `VITE_APP_ID` / `VITE_SUPERDEV_BASE_URL` are removed.
- App tests run with `cd 07_Engineering/parle-app && bun test`; backend tests with `cd 07_Engineering/parle-backend && bun test` (local stack running). Both must stay green after every task; the app build (`bun run build`) must pass from Task 6 on.
- Commit after every task with the repo's two attribution lines; push to `origin main` after the final review.

## Review Focus

1. A signed-in user calling `parle-account-service` must never be able to write a row owned by someone else, even by sending another user's id, email or a row id in the payload (Task 5 test "ignores owner fields in the payload").
2. A user who signs up but never enters the email code must not be able to sign in or call any function (Task 3 test "unverified user cannot sign in").
3. Signing out must leave no session or token in browser storage, so the next user on the same browser is not the previous one (Task 3 test "logout ends the session"; Task 9 flow 2 checks browser storage).
4. The compatibility `filter()` must return the same rows as Buildy for the app's query shapes: equality, sort strings with `-`, limit, skip; unknown sort fields ignored (Task 2 replays Plan 1's fixture).
5. The password-reset link must be single-use and must not sign anyone else in (Task 3 test "reset token works once").

---

## File structure

```
07_Engineering/parle-app/
  src/lib/backend/client.ts          supabase-js client from the two public env values
  src/lib/backend/query.ts           Buildy filter -> PostgREST translation (pure, unit-tested)
  src/lib/backend/entities.ts        entity(name): filter/get/list/create/update/delete/bulkCreate
  src/lib/backend/auth.ts            User/me/updateProfile/logout/isAuthenticated/signIn/signUp/verify/reset
  src/lib/backend/functions.ts       functions.X -> Edge Function call, Buildy-style errors
  src/lib/backend/storage.ts         uploadFile({file}) -> { file_url } via Storage
  src/lib/backend/index.ts           superdevClient-compatible object
  src/lib/superdev/client.ts         (modified) re-exports the compatibility object
  src/entities/index.ts, src/functions/index.ts, src/integrations/core.ts   (modified)
  src/lib/auth-pages.ts              (modified) Supabase sign-in, code verification, reset
  src/lib/parle-profile.ts           (modified) writes via parle-account-service
  src/pages/Onboarding.tsx, Signup.tsx, ResetPassword.tsx   (modified) code step, reset token
  src/components/parle/VerifyEmailCode.tsx   (new) 6-digit code entry
07_Engineering/parle-backend/
  supabase/functions/_shared/caller.ts   verify the bearer token, load role
  supabase/functions/_shared/db.ts       service-role data helper stamping owner_id / created_by
  supabase/functions/_shared/http.ts     JSON responses with Buildy-style error bodies
  supabase/functions/parle-account-service/index.ts   identity, profile, onboarding writes
  supabase/migrations/20261015000001_storage_profile_photos.sql
  supabase/templates/*.html             confirmation, recovery, invite emails (code + link)
  supabase/config.toml                  (modified) confirmations on, OTP, templates, SMTP for production
  scripts/spikes/resend-smoke.ts        one real email through Resend from hello@parle.buzz
  tests/compat-*.test.ts, tests/account-service.test.ts, tests/auth-flow.test.ts, tests/helpers/mailpit.ts
```

---

### Task 1: Supabase client and the filter translation

**Files:**
- Create: `07_Engineering/parle-app/src/lib/backend/client.ts`, `src/lib/backend/query.ts`
- Modify: `07_Engineering/parle-app/package.json` (add `@supabase/supabase-js`)
- Test: `07_Engineering/parle-app/src/lib/backend/query.test.ts`

**Interfaces:**
- Produces: `supabase: SupabaseClient` (singleton, `persistSession: true`, `storageKey: "parle-auth"`); `applyBuildyQuery<Q>(query: Q, filters: Record<string, unknown>, sort?: string, limit?: number, skip?: number): Q` where `Q` is a PostgREST filter builder; `parseSort(sort?: string): { column: string; ascending: boolean } | null`.

- [ ] **Step 1: Add the dependency and env template**

```bash
cd /d/AgentDevWork/repos/Parle/07_Engineering/parle-app && bun add @supabase/supabase-js@^2.45.0
printf 'VITE_SUPABASE_URL=http://127.0.0.1:54321\nVITE_SUPABASE_PUBLISHABLE_KEY=REPLACE_WITH_LOCAL_ANON_KEY\n' > .env.example
```
Then fill `.env.local` from `bunx supabase status -o json` (`API_URL`, `ANON_KEY`) with a one-line Bun script that writes the file without printing the key.

- [ ] **Step 2: Write the failing test**

`src/lib/backend/query.test.ts`:
```ts
import { describe, it, expect } from "bun:test";
import { applyBuildyQuery, parseSort } from "./query";

function recorder() {
  const calls: string[] = [];
  const q: any = new Proxy({}, { get: (_t, name: string) => (...args: unknown[]) => { calls.push(`${name}(${args.map((a) => JSON.stringify(a)).join(",")})`); return q; } });
  return { q, calls };
}

describe("parseSort", () => {
  it("reads a leading minus as descending", () => {
    expect(parseSort("-created_at")).toEqual({ column: "created_at", ascending: false });
    expect(parseSort("date_local")).toEqual({ column: "date_local", ascending: true });
    expect(parseSort("")).toBeNull();
    expect(parseSort(undefined)).toBeNull();
  });
});

describe("applyBuildyQuery", () => {
  it("turns each filter key into an equality and null into is-null", () => {
    const { q, calls } = recorder();
    applyBuildyQuery(q, { created_by: "a@b.c", status: "done", completed_at_utc: null });
    expect(calls).toEqual(['eq("created_by","a@b.c")', 'eq("status","done")', 'is("completed_at_utc",null)']);
  });
  it("applies sort, limit and skip as order and range", () => {
    const { q, calls } = recorder();
    applyBuildyQuery(q, {}, "-created_at", 10, 20);
    expect(calls).toEqual(['order("created_at",{"ascending":false})', "range(20,29)"]);
  });
  it("applies a limit without skip", () => {
    const { q, calls } = recorder();
    applyBuildyQuery(q, {}, undefined, 5);
    expect(calls).toEqual(["range(0,4)"]);
  });
  it("supports the operators Buildy accepted ($ne, $gt, $gte, $lt, $lte, $in, $nin)", () => {
    const { q, calls } = recorder();
    applyBuildyQuery(q, { a: { $ne: 1 }, b: { $gte: 2, $lt: 5 }, c: { $in: ["x", "y"] }, d: { $nin: ["z"] } });
    expect(calls).toEqual(['neq("a",1)', 'gte("b",2)', 'lt("b",5)', 'in("c",["x","y"])', 'not("d","in","(\\"z\\")")']);
  });
});
```

- [ ] **Step 3: Run it to see it fail** — `cd 07_Engineering/parle-app && bun test src/lib/backend/query.test.ts`; Expected: FAIL, module not found.

- [ ] **Step 4: Implement**

`src/lib/backend/client.ts`:
```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
if (!url || !key) throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set.");

export const AUTH_STORAGE_KEY = "parle-auth";
export const supabase: SupabaseClient = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: AUTH_STORAGE_KEY, detectSessionInUrl: false },
});
```

`src/lib/backend/query.ts`:
```ts
/** Translates Buildy's filter(query, sort, limit, skip) into PostgREST calls (Plan 1 filter report). */
export function parseSort(sort?: string): { column: string; ascending: boolean } | null {
  if (!sort) return null;
  return sort.startsWith("-") ? { column: sort.slice(1), ascending: false } : { column: sort, ascending: true };
}

const OPS: Record<string, string> = { $ne: "neq", $gt: "gt", $gte: "gte", $lt: "lt", $lte: "lte", $in: "in" };

export function applyBuildyQuery<Q>(query: Q, filters: Record<string, unknown>, sort?: string, limit?: number, skip?: number): Q {
  let q: any = query;
  for (const [field, value] of Object.entries(filters ?? {})) {
    if (value === null) { q = q.is(field, null); continue; }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [op, v] of Object.entries(value as Record<string, unknown>)) {
        if (op === "$nin") q = q.not(field, "in", `(${(v as unknown[]).map((x) => JSON.stringify(x)).join(",")})`);
        else if (OPS[op]) q = q[OPS[op]](field, v);
        else throw new Error(`Unsupported filter operator ${op} on ${field}`);
      }
      continue;
    }
    q = q.eq(field, value);
  }
  const order = parseSort(sort);
  if (order) q = q.order(order.column, { ascending: order.ascending });
  if (limit) q = q.range(skip ?? 0, (skip ?? 0) + limit - 1);
  return q as Q;
}
```

- [ ] **Step 5: Run it to see it pass** — Expected: 5 pass. Then `bun test` (whole app suite) still 350 pass.

- [ ] **Step 6: Commit** — `git add 07_Engineering/parle-app/src/lib/backend 07_Engineering/parle-app/package.json 07_Engineering/parle-app/bun.lockb 07_Engineering/parle-app/.env.example && git commit -m "app: supabase client and Buildy filter translation"`

---

### Task 2: `entity(name)` with Buildy's method surface, replayed against Buildy's real answers

**Files:**
- Create: `07_Engineering/parle-app/src/lib/backend/entities.ts`
- Test: `07_Engineering/parle-backend/tests/compat-entities.test.ts` (runs against the local stack; imports the app module)

**Interfaces:**
- Consumes: `applyBuildyQuery` (Task 1).
- Produces: `makeEntity(client: SupabaseClient, name: string)` returning `{ filter(query?, sort?, limit?, skip?): Promise<Row[]>; list(opts?: { sort?: string; limit?: number; skip?: number }): Promise<Row[]>; get(id: string): Promise<Row>; create(data): Promise<Row>; update(id, data): Promise<Row>; delete(id): Promise<void>; bulkCreate(rows): Promise<Row[]> }`. An unknown sort column is retried once without the order (Buildy ignores unknown sorts). Errors throw `new Error("API request failed: <message>")` (the app parses this prefix, survey §5).

- [ ] **Step 1: Write the failing test**

`07_Engineering/parle-backend/tests/compat-entities.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { makeEntity } from "../../parle-app/src/lib/backend/entities";

const SPIKE = "D:/AgentDevWork/parle-migration-data/spike/m3imm.learner_task.json";
const cases = JSON.parse(readFileSync(`${import.meta.dir}/fixtures/filter-cases.json`, "utf8")) as { name: string; query: Record<string, unknown>; sort?: string; limit?: number; skip?: number; expectedIds: string[] }[];
let L: Awaited<ReturnType<typeof makeUser>>;
let idMap = new Map<string, string>();

beforeAll(async () => {
  L = await makeUser("learner");
  const service = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
  const rows = JSON.parse(readFileSync(SPIKE, "utf8")) as Record<string, unknown>[];
  const cols = ["user_id", "status", "minutes", "skill", "completed_at_utc", "date_local", "type", "task_key"];
  for (const r of rows) {
    const row: Record<string, unknown> = { owner_id: L.id, created_by: L.email, created_at: r.created_date ?? r.created_at };
    for (const c of cols) if (c in r) row[c] = r[c];
    const { data, error } = await service.from("learner_task").insert(row).select("id").single();
    if (error) throw error;
    idMap.set(String(r.id), data!.id);
  }
});

describe("entity().filter replays Buildy's answers (Plan 1 fixture)", () => {
  for (const c of cases.filter((c) => c.name !== "in list" && c.name !== "missing field equals null")) {
    it(c.name, async () => {
      const got = await makeEntity(L.client, "learner_task").filter(c.query, c.sort, c.limit, c.skip);
      const expected = c.expectedIds.map((id) => idMap.get(id));
      if (c.sort || c.limit) expect(got.map((r: any) => r.id)).toEqual(expected);
      else expect(new Set(got.map((r: any) => r.id))).toEqual(new Set(expected));
    });
  }
});

describe("entity() surface", () => {
  it("get returns one owned row and list honours limit", async () => {
    const all = await makeEntity(L.client, "learner_task").filter({});
    expect((await makeEntity(L.client, "learner_task").get(all[0].id)).id).toBe(all[0].id);
    expect((await makeEntity(L.client, "learner_task").list({ limit: 3 })).length).toBe(3);
  });
  it("browser writes fail with Buildy's error prefix", async () => {
    await expect(makeEntity(L.client, "learner_task").create({ minutes: 5 })).rejects.toThrow(/^API request failed: /);
  });
});
```

Note on the fixture: Buildy sorts `created_at` by its own `created_date`; the loader copies it into `created_at` so order cases compare like with like. If the `sort ascending` case on `minutes` differs only in the order of equal values, compare per distinct value groups and record the tie-break as a ruling.

- [ ] **Step 2: Run it to see it fail** — `cd 07_Engineering/parle-backend && bun test tests/compat-entities.test.ts`; Expected: FAIL, cannot find `../../parle-app/src/lib/backend/entities`.

- [ ] **Step 3: Implement**

`src/lib/backend/entities.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyBuildyQuery } from "./query";

type Row = Record<string, any>;
const fail = (e: { message?: string } | null | undefined): never => { throw new Error(`API request failed: ${e?.message ?? "unknown error"}`); };
const UNKNOWN_COLUMN = /column .* does not exist|Could not find the '.*' column/i;

export function makeEntity(client: SupabaseClient, name: string) {
  async function filter(query: Record<string, unknown> = {}, sort?: string, limit?: number, skip?: number): Promise<Row[]> {
    const run = (s?: string) => applyBuildyQuery(client.from(name).select("*"), query, s, limit, skip) as unknown as Promise<{ data: Row[] | null; error: any }>;
    let { data, error } = await run(sort);
    if (error && sort && UNKNOWN_COLUMN.test(error.message)) ({ data, error } = await run(undefined)); // Buildy ignores unknown sort fields
    if (error) fail(error);
    return data ?? [];
  }
  return {
    filter,
    list: (opts: { sort?: string; limit?: number; skip?: number } = {}) => filter({}, opts.sort, opts.limit, opts.skip),
    async get(id: string) { const { data, error } = await client.from(name).select("*").eq("id", id).single(); if (error) fail(error); return data as Row; },
    async create(row: Row) { const { data, error } = await client.from(name).insert(row).select("*").single(); if (error) fail(error); return data as Row; },
    async update(id: string, row: Row) { const { data, error } = await client.from(name).update(row).eq("id", id).select("*").single(); if (error) fail(error); return data as Row; },
    async delete(id: string) { const { error } = await client.from(name).delete().eq("id", id); if (error) fail(error); },
    async bulkCreate(rows: Row[]) { const { data, error } = await client.from(name).insert(rows).select("*"); if (error) fail(error); return (data ?? []) as Row[]; },
  };
}
```

- [ ] **Step 4: Run it to see it pass** — Expected: 8 replay cases + 2 surface tests pass. Record any tie-break ruling.

- [ ] **Step 5: Commit** — `git commit -m "app: entity() compatibility surface, replayed against Buildy's filter answers"`

---

### Task 3: Sign-in with a 6-digit verification code, reset links, sign-out

**Files:**
- Create: `07_Engineering/parle-app/src/lib/backend/auth.ts`; `07_Engineering/parle-backend/supabase/templates/confirmation.html`, `recovery.html`; `07_Engineering/parle-backend/tests/helpers/mailpit.ts`
- Modify: `07_Engineering/parle-backend/supabase/config.toml`
- Test: `07_Engineering/parle-backend/tests/auth-flow.test.ts`

**Interfaces:**
- Produces (all take the `SupabaseClient` first so tests can pass their own; the app binds `supabase`):
  - `toParleUser(user): { id: string; email: string; full_name: string | null; role: "administrator" | "user" }`
  - `signUpWithCode(client, name, email, password): Promise<{ pendingVerification: true }>`
  - `verifySignupCode(client, email, code): Promise<ParleUser>`
  - `signInWithPassword(client, email, password): Promise<ParleUser>`
  - `requestReset(client, email, redirectTo): Promise<void>`
  - `resetWithToken(client, tokenHash, password): Promise<void>` (single use; signs out afterwards)
  - `me(client): Promise<ParleUser>` (throws `"Authentication required"` when signed out)
  - `updateMyName(client, fullName): Promise<ParleUser>`
  - `isAuthenticated(client): Promise<boolean>`
  - `logout(client): Promise<void>` (signs out and removes every `parle-*` / `superdev_*` / `sb-*` key from localStorage and the onboarding key from sessionStorage when running in a browser)
- Test helper: `latestMail(to: string, sinceIso: string): Promise<{ subject: string; text: string; html: string }>` (Mailpit API `http://127.0.0.1:54324/api/v1/messages`); `codeFrom(text): string` (first 6-digit number).

- [ ] **Step 1: Configure auth for codes and templates**

In `supabase/config.toml`: under `[auth]` set `site_url = "http://127.0.0.1:5173"` and `additional_redirect_urls = ["http://127.0.0.1:5173/reset-password", "http://localhost:5173/reset-password"]`; under `[auth.email]` set `enable_confirmations = true`, `otp_length = 6`, `otp_expiry = 3600`, `double_confirm_changes = true`; add
```toml
[auth.email.template.confirmation]
subject = "Your Parle verification code"
content_path = "./supabase/templates/confirmation.html"

[auth.email.template.recovery]
subject = "Reset your Parle password"
content_path = "./supabase/templates/recovery.html"
```
`templates/confirmation.html`:
```html
<p>Bonjour,</p>
<p>Your Parle verification code is <strong style="font-size:20px;letter-spacing:2px">{{ .Token }}</strong>.</p>
<p>Enter it on the sign-up screen. It expires in one hour. If you did not create a Parle account, you can ignore this email.</p>
<p>Parle &middot; hello@parle.buzz</p>
```
`templates/recovery.html`:
```html
<p>Bonjour,</p>
<p>To choose a new Parle password, open this link (it works once and expires in one hour):</p>
<p><a href="{{ .SiteURL }}/reset-password?token={{ .TokenHash }}">Reset my password</a></p>
<p>If you did not ask for this, you can ignore this email; your password has not changed.</p>
<p>Parle &middot; hello@parle.buzz</p>
```
Restart the stack (`bunx supabase stop && bunx supabase start -x imgproxy,vector,logflare,supavisor`).

- [ ] **Step 2: Write the failing tests**

`tests/helpers/mailpit.ts`:
```ts
const MAILPIT = "http://127.0.0.1:54324/api/v1";
export async function latestMail(to: string, sinceIso: string, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const list = await (await fetch(`${MAILPIT}/messages?limit=50`)).json();
    const hit = (list.messages ?? []).find((m: any) => (m.To ?? []).some((t: any) => t.Address?.toLowerCase() === to.toLowerCase()) && new Date(m.Created) >= new Date(sinceIso));
    if (hit) { const m = await (await fetch(`${MAILPIT}/message/${hit.ID}`)).json(); return { subject: m.Subject as string, text: m.Text as string, html: m.HTML as string }; }
    await Bun.sleep(500);
  }
  throw new Error(`No mail to ${to}`);
}
export const codeFrom = (text: string) => text.match(/\b(\d{6})\b/)![1];
export const tokenHashFrom = (html: string) => decodeURIComponent(html.match(/[?&]token=([^"&<\s]+)/)![1]);
```

`tests/auth-flow.test.ts`:
```ts
import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { latestMail, codeFrom, tokenHashFrom } from "./helpers/mailpit";
import * as auth from "../../parle-app/src/lib/backend/auth";

const client = () => createClient(LOCAL_URL, localKeys().anon, { auth: { persistSession: false } });
const email = () => `flow-${crypto.randomUUID()}@example.test`;

describe("sign-up with a verification code", () => {
  it("unverified user cannot sign in; the emailed code verifies and signs in", async () => {
    const c = client(), e = email(), since = new Date(Date.now() - 2000).toISOString();
    expect(await auth.signUpWithCode(c, "Test One", e, "Passw0rd!x")).toEqual({ pendingVerification: true });
    await expect(auth.signInWithPassword(client(), e, "Passw0rd!x")).rejects.toThrow();
    const mail = await latestMail(e, since);
    expect(mail.subject).toBe("Your Parle verification code");
    const user = await auth.verifySignupCode(c, e, codeFrom(mail.text));
    expect(user).toEqual({ id: expect.any(String), email: e, full_name: "Test One", role: "user" });
    expect(await auth.isAuthenticated(c)).toBe(true);
  });
  it("a wrong code is rejected", async () => {
    const c = client(), e = email();
    await auth.signUpWithCode(c, "X", e, "Passw0rd!x");
    await expect(auth.verifySignupCode(c, e, "000000")).rejects.toThrow();
  });
});

describe("roles and names", () => {
  it("reports administrator for app_metadata role admin", () => {
    expect(auth.toParleUser({ id: "1", email: "a@b.c", user_metadata: { full_name: "A" }, app_metadata: { role: "admin" } } as any).role).toBe("administrator");
    expect(auth.toParleUser({ id: "1", email: "a@b.c", user_metadata: {}, app_metadata: { role: "tutor" } } as any)).toEqual({ id: "1", email: "a@b.c", full_name: null, role: "user" });
  });
});

describe("password reset", () => {
  it("reset token works once", async () => {
    const c = client(), e = email(), since = new Date(Date.now() - 2000).toISOString();
    await auth.signUpWithCode(c, "R", e, "Passw0rd!x");
    await auth.verifySignupCode(c, e, codeFrom((await latestMail(e, since)).text));
    const since2 = new Date().toISOString();
    await auth.requestReset(client(), e, "http://127.0.0.1:5173/reset-password");
    const token = tokenHashFrom((await latestMail(e, since2)).html);
    await auth.resetWithToken(client(), token, "N3wPassword!");
    expect((await auth.signInWithPassword(client(), e, "N3wPassword!")).email).toBe(e);
    await expect(auth.resetWithToken(client(), token, "Other123!")).rejects.toThrow();
  });
});

describe("sign-out", () => {
  it("logout ends the session", async () => {
    const c = client(), e = email(), since = new Date(Date.now() - 2000).toISOString();
    await auth.signUpWithCode(c, "S", e, "Passw0rd!x");
    await auth.verifySignupCode(c, e, codeFrom((await latestMail(e, since)).text));
    await auth.logout(c);
    expect(await auth.isAuthenticated(c)).toBe(false);
    await expect(auth.me(c)).rejects.toThrow("Authentication required");
  });
});
```

- [ ] **Step 3: Run them to see them fail** — `bun test tests/auth-flow.test.ts`; Expected: FAIL, module not found.

- [ ] **Step 4: Implement**

`src/lib/backend/auth.ts`:
```ts
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type ParleUser = { id: string; email: string; full_name: string | null; role: "administrator" | "user" };

export function toParleUser(u: Pick<User, "id" | "email" | "user_metadata" | "app_metadata">): ParleUser {
  const name = (u.user_metadata as any)?.full_name;
  return { id: u.id, email: u.email ?? "", full_name: typeof name === "string" && name.trim() ? name : null, role: (u.app_metadata as any)?.role === "admin" ? "administrator" : "user" };
}

const raise = (e: { message?: string } | null) => { if (e) throw new Error(e.message ?? "Something went wrong. Please try again."); };

export async function signUpWithCode(c: SupabaseClient, name: string, email: string, password: string) {
  const { data, error } = await c.auth.signUp({ email, password, options: { data: { full_name: name } } });
  raise(error);
  if (data.user && (data.user.identities ?? []).length === 0) throw new Error("User already registered");
  return { pendingVerification: true as const };
}

export async function verifySignupCode(c: SupabaseClient, email: string, code: string): Promise<ParleUser> {
  const { data, error } = await c.auth.verifyOtp({ email, token: code, type: "signup" });
  raise(error);
  return toParleUser(data.user!);
}

export async function signInWithPassword(c: SupabaseClient, email: string, password: string): Promise<ParleUser> {
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  raise(error);
  return toParleUser(data.user);
}

export async function requestReset(c: SupabaseClient, email: string, redirectTo: string) {
  const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo });
  raise(error);
}

export async function resetWithToken(c: SupabaseClient, tokenHash: string, password: string) {
  const { error } = await c.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
  raise(error);
  const upd = await c.auth.updateUser({ password });
  raise(upd.error);
  await c.auth.signOut();
}

export async function me(c: SupabaseClient): Promise<ParleUser> {
  const { data, error } = await c.auth.getUser();
  if (error || !data.user) throw new Error("Authentication required");
  return toParleUser(data.user);
}

export async function updateMyName(c: SupabaseClient, fullName: string): Promise<ParleUser> {
  const { data, error } = await c.auth.updateUser({ data: { full_name: fullName } });
  raise(error);
  return toParleUser(data.user!);
}

export async function isAuthenticated(c: SupabaseClient): Promise<boolean> {
  const { data } = await c.auth.getUser();
  return !!data.user;
}

export async function logout(c: SupabaseClient) {
  await c.auth.signOut();
  if (typeof window !== "undefined") {
    for (const k of Object.keys(window.localStorage)) if (/^(parle-|superdev_|sb-)/.test(k)) window.localStorage.removeItem(k);
    window.sessionStorage.removeItem("parle-onboarding-session-v1");
  }
}
```

- [ ] **Step 5: Run them to see them pass** — Expected: 5 pass.

- [ ] **Step 6: Commit** — `git commit -m "auth: email-code sign-up, single-use reset links, full sign-out (compat module + local templates)"`

---

### Task 4: Edge Function scaffolding (`caller`, `db`, `http`)

**Files:**
- Create: `07_Engineering/parle-backend/supabase/functions/_shared/caller.ts`, `_shared/db.ts`, `_shared/http.ts`
- Test: `07_Engineering/parle-backend/tests/shared-db.test.ts`

**Interfaces:**
- Produces (Deno, also importable by Bun tests):
  - `type Caller = { id: string; email: string; role: "admin" | "learner" | "tutor" }`
  - `getCaller(req: Request, admin: SupabaseClient): Promise<Caller | null>` (null when no or bad bearer token or unconfirmed email)
  - `serviceClient(): SupabaseClient` (from `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, injected by the runtime)
  - `ownedTable(admin, caller, table)` → `{ findMine(filters, sort?, limit?), insertMine(row), updateMine(id, row) }`: every query adds `owner_id = caller.id`; every insert/update forces `owner_id = caller.id` and `created_by = caller.email` and drops `id`, `owner_id`, `created_by`, `created_at`, `updated_at` from the input.
  - `json(body, status = 200)`, `fail(code: string, status: number, message?: string)` → `{ error: code, error_code: code, message }` with CORS headers; `cors(req)` for preflight.

- [ ] **Step 1: Write the failing test** (`tests/shared-db.test.ts`, Bun, against the local stack):
```ts
import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";
import { ownedTable } from "../supabase/functions/_shared/db";

const admin = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });

describe("ownedTable", () => {
  it("stamps owner and creator on insert and ignores those fields in the input", async () => {
    const a = await makeUser("learner"), b = await makeUser("learner");
    const t = ownedTable(admin(), { id: a.id, email: a.email, role: "learner" }, "ParleProfile");
    const row = await t.insertMine({ owner_id: b.id, created_by: b.email, id: crypto.randomUUID(), time_zone: "America/Toronto" });
    expect({ owner: row.owner_id, by: row.created_by }).toEqual({ owner: a.id, by: a.email });
  });
  it("cannot update or find another user's row", async () => {
    const a = await makeUser("learner"), b = await makeUser("learner");
    const tb = ownedTable(admin(), { id: b.id, email: b.email, role: "learner" }, "ParleProfile");
    const rowB = await tb.insertMine({ time_zone: "UTC" });
    const ta = ownedTable(admin(), { id: a.id, email: a.email, role: "learner" }, "ParleProfile");
    await expect(ta.updateMine(rowB.id, { time_zone: "Europe/Paris" })).rejects.toThrow("NOT_FOUND");
    expect(await ta.findMine({ id: rowB.id })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to see it fail** — Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`_shared/db.ts`:
```ts
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Caller } from "./caller.ts";

const PROTECTED = ["id", "owner_id", "created_by", "created_at", "updated_at"];
const clean = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).filter(([k]) => !PROTECTED.includes(k)));

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}

export function ownedTable(admin: SupabaseClient, caller: Caller, table: string) {
  return {
    async findMine(filters: Record<string, unknown> = {}, sort = "-created_at", limit = 100) {
      let q: any = admin.from(table).select("*").eq("owner_id", caller.id);
      for (const [k, v] of Object.entries(filters)) q = v === null ? q.is(k, null) : q.eq(k, v);
      const desc = sort.startsWith("-");
      q = q.order(desc ? sort.slice(1) : sort, { ascending: !desc }).limit(limit);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as Record<string, any>[];
    },
    async insertMine(row: Record<string, unknown>) {
      const { data, error } = await admin.from(table).insert({ ...clean(row), owner_id: caller.id, created_by: caller.email }).select("*").single();
      if (error) throw new Error(error.message);
      return data as Record<string, any>;
    },
    async updateMine(id: string, row: Record<string, unknown>) {
      const { data, error } = await admin.from(table).update(clean(row)).eq("id", id).eq("owner_id", caller.id).select("*");
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error("NOT_FOUND");
      return data[0] as Record<string, any>;
    },
  };
}
```
For Bun tests, resolve `npm:@supabase/supabase-js@2` by adding to `07_Engineering/parle-backend/bunfig.toml` nothing and instead importing through a tiny `deps.ts` (`export { createClient } from "npm:@supabase/supabase-js@2"` in Deno; tests import `_shared/db.ts` with the Bun loader alias `bunfig.toml [install] ... ` is NOT available, so `db.ts` imports from `./deps.ts`, and `tests/setup.ts` registers a Bun plugin that maps `npm:@supabase/supabase-js@2` to `@supabase/supabase-js`). `tests/setup.ts`:
```ts
import { plugin } from "bun";
plugin({ name: "npm-specifier", setup(b) { b.onResolve({ filter: /^npm:@supabase\/supabase-js@2$/ }, () => ({ path: require.resolve("@supabase/supabase-js") })); } });
```
and in `bunfig.toml` under `[test]` add `preload = ["./tests/setup.ts"]`.

`_shared/caller.ts`:
```ts
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
export type Caller = { id: string; email: string; role: "admin" | "learner" | "tutor" };
export async function getCaller(req: Request, admin: SupabaseClient): Promise<Caller | null> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user || !data.user.email_confirmed_at) return null;
  const role = (data.user.app_metadata as any)?.role;
  return { id: data.user.id, email: data.user.email ?? "", role: role === "admin" || role === "tutor" ? role : "learner" };
}
```

`_shared/http.ts`:
```ts
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
export const fail = (code: string, status: number, message = code) => json({ error: code, error_code: code, message }, status);
export const preflight = (req: Request) => (req.method === "OPTIONS" ? new Response("ok", { headers: CORS }) : null);
```

- [ ] **Step 4: Run to see it pass** — Expected: 2 pass; whole backend suite still green.

- [ ] **Step 5: Commit** — `git commit -m "functions: shared caller, owned-table data helper, http helpers"`

---

### Task 5: `parle-account-service` (identity, profile, onboarding writes)

**Files:**
- Create: `07_Engineering/parle-backend/supabase/functions/parle-account-service/index.ts`
- Test: `07_Engineering/parle-backend/tests/account-service.test.ts`

**Interfaces:**
- Consumes: `getCaller`, `serviceClient`, `ownedTable`, `json`, `fail`, `preflight` (Task 4).
- Produces: POST `/functions/v1/parle-account-service` with `{ action, ... }`:
  - `ensure_identity { role: "learner" | "tutor", age_confirmed: true }` → `{ identity }`; refuses admins (`ADMIN_NOT_ALLOWED`), keeps an existing identity, refuses a different role (`ROLE_EXISTS`); sets `app_metadata.role` for new learners / tutors.
  - `save_profile { photo_url?, time_zone?, native_language?, explain_in_native?, email_product_updates? }` → `{ profile }` (creates or updates the caller's single `ParleProfile`; validates time zone with `Intl.DateTimeFormat`).
  - `save_learner_profile { ...learner_profile fields }` → `{ learner_profile }` (forces `user_id = caller.id`).
  - `save_unverified_placement { self_assessed_level, track }` → `{ placement_result }` (server builds the rest exactly like `Onboarding.tsx` today: `status: "unverified"`, `source: "self_assessment"`, `responses: "[]"`, `level_per_skill` all null).
  - Errors: no or bad token → 401 `AUTH_REQUIRED`; unknown action → 400 `UNKNOWN_ACTION`; validation → 400 `INVALID_INPUT`.

- [ ] **Step 1: Write the failing tests**

`tests/account-service.test.ts`:
```ts
import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";

const FN = `${LOCAL_URL}/functions/v1/parle-account-service`;
async function call(token: string | null, body: unknown) {
  const r = await fetch(FN, { method: "POST", headers: { "Content-Type": "application/json", apikey: localKeys().anon, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
const tokenOf = async (u: Awaited<ReturnType<typeof makeUser>>) => (await u.client.auth.getSession()).data.session!.access_token;
const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });

describe("parle-account-service", () => {
  it("rejects calls without a valid token", async () => {
    expect((await call(null, { action: "save_profile" })).status).toBe(401);
    expect((await call("not-a-token", { action: "save_profile" })).status).toBe(401);
  });
  it("rejects unknown actions", async () => {
    const u = await makeUser("learner");
    expect((await call(await tokenOf(u), { action: "drop_tables" })).body.error_code).toBe("UNKNOWN_ACTION");
  });
  it("creates one identity and refuses a second role", async () => {
    const u = await makeUser("learner"), t = await tokenOf(u);
    const first = await call(t, { action: "ensure_identity", role: "learner", age_confirmed: true });
    expect(first.body.identity.role).toBe("learner");
    expect((await call(t, { action: "ensure_identity", role: "learner", age_confirmed: true })).body.identity.id).toBe(first.body.identity.id);
    expect((await call(t, { action: "ensure_identity", role: "tutor", age_confirmed: true })).body.error_code).toBe("ROLE_EXISTS");
  });
  it("ignores owner fields in the payload (Review Focus 1)", async () => {
    const a = await makeUser("learner"), b = await makeUser("learner");
    const bRow = (await call(await tokenOf(b), { action: "save_profile", time_zone: "UTC" })).body.profile;
    const res = await call(await tokenOf(a), { action: "save_profile", id: bRow.id, owner_id: b.id, created_by: b.email, time_zone: "Europe/Paris" });
    expect(res.body.profile.owner_id).toBe(a.id);
    const bNow = (await service().from("ParleProfile").select("time_zone").eq("id", bRow.id).single()).data!;
    expect(bNow.time_zone).toBe("UTC");
  });
  it("rejects an invalid time zone", async () => {
    const u = await makeUser("learner");
    expect((await call(await tokenOf(u), { action: "save_profile", time_zone: "Mars/Olympus" })).body.error_code).toBe("INVALID_INPUT");
  });
  it("saves the learner profile and the unverified placement with the caller's ids", async () => {
    const u = await makeUser("learner"), t = await tokenOf(u);
    const lp = (await call(t, { action: "save_learner_profile", user_id: "someone-else", track: "immigration", goals: ["immigration"], main_goal: "immigration", time_zone: "America/Toronto" })).body.learner_profile;
    expect({ user: lp.user_id, owner: lp.owner_id, by: lp.created_by }).toEqual({ user: u.id, owner: u.id, by: u.email });
    const pr = (await call(t, { action: "save_unverified_placement", self_assessed_level: "A2", track: "immigration" })).body.placement_result;
    expect({ status: pr.status, source: pr.source, user: pr.user_id }).toEqual({ status: "unverified", source: "self_assessment", user: u.id });
    expect((await call(t, { action: "save_unverified_placement", self_assessed_level: "A2", track: "immigration" })).body.placement_result.id).toBe(pr.id);
  });
});
```

- [ ] **Step 2: Run to see them fail** — start the function server in another background shell: `bunx supabase functions serve --no-verify-jwt`; run `bun test tests/account-service.test.ts`; Expected: FAIL (404 function not found).

- [ ] **Step 3: Implement** `parle-account-service/index.ts`:
```ts
import { serviceClient, ownedTable } from "../_shared/db.ts";
import { getCaller } from "../_shared/caller.ts";
import { json, fail, preflight } from "../_shared/http.ts";

const validZone = (z: unknown) => { try { return typeof z === "string" && !!z && (new Intl.DateTimeFormat("en", { timeZone: z }), true); } catch { return false; } };
const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
const LEARNER_PROFILE_FIELDS = ["goals", "main_goal", "other_goal_text", "track", "target_per_skill", "target_date", "no_deadline", "test_booked", "test_booked_date", "availability", "tutor_windows", "tutor_budget_band", "self_assessed_level", "native_language", "time_zone"];
const PROFILE_FIELDS = ["photo_url", "time_zone", "native_language", "explain_in_native", "email_product_updates"];

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  const admin = serviceClient();
  const caller = await getCaller(req, admin);
  if (!caller) return fail("AUTH_REQUIRED", 401, "Authentication required");
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_INPUT", 400); }
  try {
    switch (body.action) {
      case "ensure_identity": {
        if (caller.role === "admin") return fail("ADMIN_NOT_ALLOWED", 403);
        if (body.role !== "learner" && body.role !== "tutor") return fail("INVALID_INPUT", 400);
        if (body.age_confirmed !== true) return fail("AGE_CONFIRMATION_REQUIRED", 400);
        const t = ownedTable(admin, caller, "ParleIdentity");
        const [existing] = await t.findMine({}, "created_at", 1);
        if (existing) return existing.role === body.role ? json({ identity: existing }) : fail("ROLE_EXISTS", 409);
        const identity = await t.insertMine({ role: body.role, age_confirmed: true, age_confirmed_at: new Date().toISOString(), premium_comp_active: false });
        await admin.auth.admin.updateUserById(caller.id, { app_metadata: { role: body.role } });
        return json({ identity });
      }
      case "save_profile": {
        const values = pick(body, PROFILE_FIELDS);
        if ("time_zone" in values && !validZone(values.time_zone)) return fail("INVALID_INPUT", 400, "A valid time zone is required.");
        const t = ownedTable(admin, caller, "ParleProfile");
        const [existing] = await t.findMine({}, "-created_at", 1);
        const profile = existing ? await t.updateMine(existing.id, values) : await t.insertMine({ photo_url: "", time_zone: "", native_language: "", explain_in_native: false, email_product_updates: false, ...values });
        return json({ profile });
      }
      case "save_learner_profile": {
        const values = { ...pick(body, LEARNER_PROFILE_FIELDS), user_id: caller.id };
        if ("time_zone" in values && values.time_zone !== "" && !validZone(values.time_zone)) return fail("INVALID_INPUT", 400);
        const t = ownedTable(admin, caller, "learner_profile");
        const [existing] = await t.findMine({}, "-created_at", 1);
        return json({ learner_profile: existing ? await t.updateMine(existing.id, values) : await t.insertMine(values) });
      }
      case "save_unverified_placement": {
        const values = { user_id: caller.id, taken_at: new Date().toISOString(), level_per_skill: JSON.stringify({ L: null, R: null, W: null, S: null }), nclc_estimate_per_skill: JSON.stringify({}), speaking_assessed: false, responses: "[]", status: "unverified", self_assessed_level: String(body.self_assessed_level ?? ""), source: "self_assessment", track: String(body.track ?? "") };
        const t = ownedTable(admin, caller, "placement_result");
        const [existing] = await t.findMine({ status: "unverified" }, "-created_at", 1);
        return json({ placement_result: existing ? await t.updateMine(existing.id, values) : await t.insertMine(values) });
      }
      default:
        return fail("UNKNOWN_ACTION", 400);
    }
  } catch (e) {
    console.error("parle-account-service", body.action, (e as Error).message);
    return fail("REQUEST_FAILED", 500);
  }
});
```

- [ ] **Step 4: Run to see them pass** — Expected: 6 pass. Whole backend suite green.

- [ ] **Step 5: Commit** — `git commit -m "functions: parle-account-service (identity, profile, learner profile, unverified placement)"`

---

### Task 6: Re-point the app's bridge files and account code to the new layer

**Files:**
- Create: `07_Engineering/parle-app/src/lib/backend/functions.ts`, `src/lib/backend/storage.ts`, `src/lib/backend/index.ts`
- Create: `07_Engineering/parle-backend/supabase/migrations/20261015000001_storage_profile_photos.sql`
- Modify: `src/lib/superdev/client.ts`, `src/entities/index.ts`, `src/functions/index.ts`, `src/integrations/core.ts`, `src/lib/auth-pages.ts`, `src/lib/parle-profile.ts`, `src/pages/Onboarding.tsx` (`saveMyLearnerProfile`, `saveMyUnverifiedPlacement`), `src/main.tsx` (unchanged import still valid), `vite.config.ts` (drop `superdev-tagger` / `superdevCompileCheck`), `package.json` (remove `@superdevhq/client`, `superdev-tagger`)
- Test: `src/lib/backend/functions.test.ts`; the existing 350 app tests; `07_Engineering/parle-backend/tests/storage.test.ts`

**Interfaces:**
- Produces: `superdevClient` (compat object) with `auth` (`me`, `updateProfile({ full_name })`, `logout(_redirect?)`, `setToken()` no-op), `isAuthenticated()`, `options: { showBranding: false, affiliateId: "" }`, `entity(name)`, `functions` (Proxy: `functions.parleAccountService(payload)` → POST `/functions/v1/parle-account-service`; camelCase name → kebab-case), `integrations.core.uploadFile({ file })` → `{ file_url }`.
- Function errors follow Buildy's client: non-2xx → `throw new Error("API request failed: " + (body.error_code ?? body.error ?? status))` with `(err as any).status = <http status>` so `RoleShell`'s 403 checks keep working.

- [ ] **Step 1: Write the failing tests**

`src/lib/backend/functions.test.ts`:
```ts
import { describe, it, expect, mock, afterEach } from "bun:test";
import { kebab, makeFunctions } from "./functions";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe("functions proxy", () => {
  it("maps camelCase names to kebab-case function urls", () => {
    expect(kebab("parleAccountService")).toBe("parle-account-service");
    expect(kebab("parlePublicLevelCheck")).toBe("parle-public-level-check");
  });
  it("posts the payload with the session token and returns the parsed body", async () => {
    let seen: any;
    globalThis.fetch = mock(async (url: any, init: any) => { seen = { url: String(url), init }; return new Response(JSON.stringify({ ok: true }), { status: 200 }); }) as any;
    const fns = makeFunctions("http://x", "pk", async () => "TOKEN");
    expect(await fns.parleAccountService({ action: "save_profile" })).toEqual({ ok: true });
    expect(seen.url).toBe("http://x/functions/v1/parle-account-service");
    expect(seen.init.headers.Authorization).toBe("Bearer TOKEN");
  });
  it("throws Buildy's error format with the http status", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ error: "ADMIN_REQUIRED", error_code: "ADMIN_REQUIRED" }), { status: 403 })) as any;
    const fns = makeFunctions("http://x", "pk", async () => null);
    const err: any = await fns.parleMarketplaceService({ action: "admin_authorize" }).catch((e: unknown) => e);
    expect(err.message).toBe("API request failed: ADMIN_REQUIRED");
    expect(err.status).toBe(403);
  });
});
```

`07_Engineering/parle-backend/tests/storage.test.ts`:
```ts
import { describe, it, expect } from "bun:test";
import { makeUser } from "./helpers/users";

describe("profile photos bucket", () => {
  it("lets a user upload into their own folder only, and the file is publicly readable", async () => {
    const u = await makeUser("learner"), other = await makeUser("learner");
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
    expect((await u.client.storage.from("profile-photos").upload(`${u.id}/a.png`, png)).error).toBeNull();
    expect((await u.client.storage.from("profile-photos").upload(`${other.id}/b.png`, png)).error).not.toBeNull();
    const url = u.client.storage.from("profile-photos").getPublicUrl(`${u.id}/a.png`).data.publicUrl;
    expect((await fetch(url)).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to see them fail** — app: `bun test src/lib/backend/functions.test.ts` (module not found); backend: `bun test tests/storage.test.ts` (bucket not found).

- [ ] **Step 3: Implement the layer pieces**

`src/lib/backend/functions.ts`:
```ts
export const kebab = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

export function makeFunctions(baseUrl: string, publishableKey: string, token: () => Promise<string | null>) {
  return new Proxy({} as Record<string, (payload?: Record<string, unknown>) => Promise<any>>, {
    get: (_t, name) => typeof name !== "string" || name === "then" ? undefined : async (payload: Record<string, unknown> = {}) => {
      const t = await token();
      const res = await fetch(`${baseUrl}/functions/v1/${kebab(name)}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: publishableKey, ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { const err: any = new Error(`API request failed: ${body.error_code ?? body.error ?? res.status}`); err.status = res.status; err.body = body; throw err; }
      return body;
    },
  });
}
```

`src/lib/backend/storage.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
export async function uploadProfilePhoto(c: SupabaseClient, file: File): Promise<{ file_url: string }> {
  const { data: u } = await c.auth.getUser();
  if (!u.user) throw new Error("Authentication required");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${u.user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await c.storage.from("profile-photos").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`API request failed: ${error.message}`);
  return { file_url: c.storage.from("profile-photos").getPublicUrl(path).data.publicUrl };
}
```

`src/lib/backend/index.ts`:
```ts
import { supabase } from "./client";
import { makeEntity } from "./entities";
import { makeFunctions } from "./functions";
import { uploadProfilePhoto } from "./storage";
import * as auth from "./auth";

const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? null;
export const functions = makeFunctions(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string, token);

export const parleClient = {
  options: { showBranding: false, affiliateId: "" },
  entity: (name: string) => makeEntity(supabase, name),
  functions,
  isAuthenticated: () => auth.isAuthenticated(supabase),
  auth: {
    me: () => auth.me(supabase),
    updateProfile: async ({ full_name }: { full_name: string }) => auth.updateMyName(supabase, full_name),
    logout: async (_redirect?: boolean) => auth.logout(supabase),
    setToken: (_token: string) => undefined,
  },
  integrations: { core: { uploadFile: ({ file }: { file: File }) => uploadProfilePhoto(supabase, file) } },
};
```

`supabase/migrations/20261015000001_storage_profile_photos.sql`:
```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', true, 5242880, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do nothing;
create policy "profile photos: owner uploads to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "profile photos: owner deletes own" on storage.objects for delete to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 4: Re-point the bridge files**

`src/lib/superdev/client.ts`:
```ts
// Buildy's client is gone (backend decoupling Plan 2); this keeps the old import path working.
export { parleClient as superdevClient } from "@/lib/backend";
```
`src/entities/index.ts`: keep every export line, change the import to `import { parleClient as superdevClient } from "@/lib/backend";` and `export const User = superdevClient.auth;`.
`src/functions/index.ts`:
```ts
import { functions } from "@/lib/backend";
export const parleAssessmentService = functions.parleAssessmentService;
export const parleMarketplaceService = functions.parleMarketplaceService;
export const parlePublicLevelCheck = functions.parlePublicLevelCheck;
export const parleAccountService = functions.parleAccountService;
```
`src/integrations/core.ts`:
```ts
import { parleClient } from "@/lib/backend";
export const uploadFile = parleClient.integrations.core.uploadFile;
const notAvailable = (name: string) => async () => { throw new Error(`${name} is not available outside Buildy (Plan 3 replaces it)`); };
export const invokeLLM = notAvailable("invokeLLM"), sendEmail = notAvailable("sendEmail"), getUploadedFile = notAvailable("getUploadedFile");
export const generateImage = notAvailable("generateImage"), editImage = notAvailable("editImage"), extractDataFromUploadedFile = notAvailable("extractDataFromUploadedFile");
export const core = { uploadFile, invokeLLM, sendEmail, getUploadedFile, generateImage, editImage, extractDataFromUploadedFile };
```

- [ ] **Step 5: Move the account writes to the service**

In `src/lib/parle-profile.ts`, replace every `ParleProfile.create/update` and `ParleIdentity.create` with the service (reads stay as they are):
```ts
import { parleAccountService } from "@/functions";
async function saveProfileFields(values: Record<string, unknown>) {
  const res = await parleAccountService({ action: "save_profile", ...values });
  return res.profile as ParleProfileRecord;
}
```
- `initializeMySignupProfile`: `if (profile?.time_zone?.trim()) return profile; return saveProfileFields({ time_zone: browserTimeZone() });` (keep the validity check on the result).
- `syncMyOnboardingProfile`: after the existing validation, `return saveProfileFields({ native_language: nativeLanguage, time_zone: timeZone });` and keep the confirmation check against the returned record.
- `createMyIdentity`: keep the admin and age checks, then `const res = await parleAccountService({ action: "ensure_identity", role, age_confirmed: true }); return res.identity as ParleIdentityRecord;` (the service enforces "one role").
- `saveMyProfile`: keep `User.updateProfile({ full_name })`, then `await saveProfileFields({ photo_url, time_zone, native_language, email_product_updates })` and `return loadMyParleAccount();`.
- `updateMyExplanationPreference`: `return saveProfileFields({ explain_in_native: explainInNative });` plus the existing confirmation check.

In `src/pages/Onboarding.tsx`:
- `saveMyLearnerProfile(user, answers)`: build `payload` exactly as today, then `await parleAccountService({ action: "save_learner_profile", ...payload });` (remove the `learner_profile.filter/update/create` calls and the re-read; the service returns the saved row).
- `saveMyUnverifiedPlacement(user, answers)`: `await parleAccountService({ action: "save_unverified_placement", self_assessed_level: answers.selfAssessment, track: trackForGoal(answers.mainGoal) });`.
- Remove the now-unused `learner_profile` / `placement_result` imports from that file.

In `src/lib/auth-pages.ts`, replace the Buildy `post()` helpers with the Supabase module, keeping the exported names and signatures the pages use:
```ts
import { supabase } from "@/lib/backend/client";
import * as auth from "@/lib/backend/auth";
export const signIn = (email: string, password: string) => auth.signInWithPassword(supabase, email, password);
export const signUp = (name: string, email: string, password: string) => auth.signUpWithCode(supabase, name, email, password);
export const verifySignupCode = (email: string, code: string) => auth.verifySignupCode(supabase, email, code);
export const requestPasswordReset = (email: string) => auth.requestReset(supabase, email, `${window.location.origin}/reset-password`).then(() => ({ success: true }));
export const resetPassword = (token: string, password: string) => auth.resetWithToken(supabase, token, password).then(() => ({ success: true }));
```
Keep `afterLoginPath`, `authErrorKey`, `passwordMeetsRequirements`, `isValidEmail` unchanged; extend `authErrorKey`'s regexes with Supabase's messages: `/Invalid login credentials/i` → invalid credentials key, `/Email not confirmed/i` → a new key `auth.emailNotConfirmed`, `/Token has expired or is invalid|otp_expired/i` → expired key, `/User already registered/i` → already-registered key.

In `vite.config.ts` remove the `superdev-tagger` and `superdevCompileCheck` imports and plugin entries and the `.mysuperdev.app` / `.superdev.run` allowed hosts; `bun remove @superdevhq/client superdev-tagger`.

- [ ] **Step 6: Run everything** — backend: `bunx supabase db reset && bun test` (storage test passes, all earlier tests green); app: `bun test` (350 existing + 3 new pass; fix any test that imported the Buildy client by pointing it at `@/lib/backend` with a stubbed `supabase`, ledgering each), `bun run build` passes, `grep -rn "superdevhq\|VITE_SUPERDEV\|VITE_APP_ID" src vite.config.ts package.json` returns nothing.

- [ ] **Step 7: Commit** — `git commit -m "app: bridge files on the Supabase layer; account and onboarding writes via parle-account-service; Buildy client removed"`

---

### Task 7: Verification-code step in Signup and Onboarding; reset page

**Files:**
- Create: `07_Engineering/parle-app/src/components/parle/VerifyEmailCode.tsx`
- Modify: `src/pages/Signup.tsx`, `src/pages/Onboarding.tsx` (`createAccountAndProfile`), `src/pages/ResetPassword.tsx`, `src/lib/i18n.ts` (new keys)
- Test: `src/components/parle/VerifyEmailCode.test.ts` (logic only: `normaliseCode`)

**Interfaces:**
- Produces: `<VerifyEmailCode email onVerified={(user) => void} />` (6 inputs collapsed into one numeric field; "Resend code" button calling `supabase.auth.resend({ type: "signup", email })` with a 60-second cooldown); `normaliseCode(raw: string): string | null` (digits only, exactly 6, else null).
- i18n keys (English and French): `auth.verifyTitle` "Check your email", `auth.verifyBody` "We sent a 6-digit code to {email}. Enter it to finish creating your account.", `auth.verifyCodeLabel` "Verification code", `auth.verifySubmit` "Verify", `auth.verifyResend` "Send a new code", `auth.verifyResendWait` "You can ask for a new code in {seconds} s", `auth.verifyWrongCode` "That code is not right or has expired.", `auth.emailNotConfirmed` "Please verify your email first. We can send you a new code."

- [ ] **Step 1: Write the failing test**
```ts
import { describe, it, expect } from "bun:test";
import { normaliseCode } from "./VerifyEmailCode";
describe("normaliseCode", () => {
  it("keeps exactly six digits", () => {
    expect(normaliseCode(" 123 456 ")).toBe("123456");
    expect(normaliseCode("12345")).toBeNull();
    expect(normaliseCode("12a456")).toBeNull();
  });
});
```
- [ ] **Step 2: Run to see it fail**, then implement `VerifyEmailCode.tsx` (export `normaliseCode`; component uses `verifySignupCode` from `@/lib/auth-pages`, shows `auth.verifyWrongCode` on failure, never logs the code).
- [ ] **Step 3: Wire the pages**
  - `Signup.tsx`: after `signUp` resolves `{ pendingVerification: true }`, render `<VerifyEmailCode email={email} onVerified={...existing post-sign-up continuation...} />` instead of navigating; the existing continuation (identity creation, profile init, redirect) runs in `onVerified`.
  - `Onboarding.tsx` `createAccountAndProfile`: after `signUp`, set `flow.phase = "verify_email"` (persisted in the saved flow so a reload keeps the step), render `<VerifyEmailCode>`; `onVerified` sets `accountCreated = true` and runs `finishAccountSetup()` then `placement_intro` exactly as today.
  - `ResetPassword.tsx`: unchanged API (`?token=` + `resetPassword(token, password)`); after success show the existing "password updated" state and link to `/login` (the user is signed out by `resetWithToken`).
- [ ] **Step 4: Run tests and build** — app `bun test` green, `bun run build` passes.
- [ ] **Step 5: Commit** — `git commit -m "app: email verification code step in sign-up and onboarding"`

---

### Task 8: Resend for production mail, proved with one real email

**Files:**
- Create: `07_Engineering/parle-backend/scripts/spikes/resend-smoke.ts`
- Modify: `07_Engineering/parle-backend/supabase/config.toml` (commented production SMTP block)
- Create: `06_Build/export-decoupling/spikes/resend-report.md`

**Interfaces:**
- Consumes: `readSecret("RESEND_API_KEY")` (Plan 1); founder has created a "Sending access, parle.buzz" key in that file.

- [ ] **Step 1: Write the smoke script**
```ts
import { readSecret } from "../lib/secrets";
const key = readSecret("RESEND_API_KEY");
const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ from: "Parle <hello@parle.buzz>", to: ["obsidianteamhq+resend@agentmail.to"], subject: "Parle sending test", text: "Test from the Parle backend set-up (Plan 2, Task 8). No action needed." }),
});
const body: any = await res.json().catch(() => ({}));
console.log(res.ok ? `sent, id ${String(body.id).slice(0, 8)}...` : `failed ${res.status} ${body.name ?? ""} ${body.message ?? ""}`);
```
- [ ] **Step 2: Run it and confirm delivery** — `bun scripts/spikes/resend-smoke.ts`; Expected: "sent". Then read the AgentMail inbox with `waitForMail("obsidianteamhq+resend@agentmail.to", <start time>)` (Plan 1 helper) and record the subject, the `From`, and whether SPF / DKIM pass (from the raw headers if exposed) in `resend-report.md`.
- [ ] **Step 3: Record the production SMTP settings** (applied to the cloud project in Plan 4, not locally): add to `config.toml` a commented block
```toml
# Production (Plan 4): Supabase Auth sends through Resend.
# [auth.email.smtp]
# enabled = true
# host = "smtp.resend.com"
# port = 465
# user = "resend"
# pass = "env(RESEND_API_KEY)"
# admin_email = "no-reply@parle.buzz"
# sender_name = "Parle"
```
- [ ] **Step 4: Commit** — `git commit -m "email: Resend sending verified from hello@parle.buzz; production SMTP settings recorded"`

---

### Task 9: Live check of the slice in a browser, report, hand-over

**Files:**
- Create: `06_Build/export-decoupling/plans/2026-10-15-plan-2-report.md`
- Modify: `HANDOFF.md`, `06_Build/export-decoupling/security-debt.md` (S1, S2 noted for Plan 3/4 if account deletion is not built here; S16, S21, S28 marked "addressed in the new sign-in" with the tests that prove it)

- [ ] **Step 1: Run the app against local staging** — backend stack running and `bunx supabase functions serve --no-verify-jwt` in the background; `cd 07_Engineering/parle-app && bun run dev -- --host 127.0.0.1 --port 5173` in the background.
- [ ] **Step 2: Walk the flows in the gstack browser** (new tab on `http://127.0.0.1:5173`), reading each verification code from Mailpit (`http://127.0.0.1:54324`):
  1. Learner onboarding end to end with a new `@example.test` address: code step, then identity, profile, learner profile, unverified placement saved (check the rows with the service client: `owner_id` and `created_by` set).
  2. Sign out; confirm localStorage has no `parle-auth`, `sb-*` or `superdev_*` key.
  3. Sign in again; Settings: change name and time zone, upload a small profile photo; reload and confirm they persist.
  4. Forgot password: link from Mailpit, new password, sign in with it; open the same link again and confirm it fails.
  5. Open `/learner` and note which screens fail because their functions are not ported yet (expected; list them for Plan 3).
- [ ] **Step 3: Write the report** with results per flow, test counts (app and backend), the list of screens waiting for Plan 3, and rulings.
- [ ] **Step 4: Stop the servers** (`bunx supabase stop`, stop the dev and functions-serve shells).
- [ ] **Step 5: Commit and push** — `git commit -m "backend plan 2: layer, sign-in, Resend, account writes; report and hand-over"` then `git push`.
