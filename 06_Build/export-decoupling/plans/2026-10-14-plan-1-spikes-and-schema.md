# Backend decoupling, Plan 1 of 4: Phase 0 spikes + Phase 1 schema and access rules

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the four assumptions the backend spec rests on (Buildy data can be read per account, Buildy filter behaviour, NVIDIA access, local Supabase on this PC), then stand up the local staging database with all 36 app tables, their unique rules and their row-level access rules, covered by tests.

**Architecture:** A new workspace `07_Engineering/parle-backend/` holds the Supabase project (config, SQL migrations), small Bun/TypeScript scripts (Buildy reader, AgentMail reader, schema generators, spikes) and Bun tests. Tables are generated from Buildy's `entities/*.json`; access rules are generated from a hand-written tier map. Nothing in `07_Engineering/parle-app/` changes in this plan.

**Tech Stack:** Bun 1.x (runner + tests), TypeScript, Supabase CLI via `bunx supabase` (Docker Desktop required), Postgres 17, `@supabase/supabase-js` v2, AgentMail REST API, NVIDIA API (OpenAI-compatible).

**Spec:** `06_Build/export-decoupling/specs/2026-10-14-backend-decoupling-design.md` (sections 4, 8, 9, 10a, 13).

## Global Constraints

- Secrets never appear in chat, the repo, logs or command lines: keys and passwords are read from files at point of use. NVIDIA key file: `C:\Users\AgentDev\.parle-secrets\NVIDIA_API_KEY` (founder creates it). AgentMail key: `C:\Users\AgentDev\Downloads\agentmail_api_key_ClaudeCode-ObsidianTeamHQ.txt`. Test-account passwords: `C:\Users\AgentDev\.gstack\projects\Parle\test-accounts.txt` (lines `label email password`).
- Never print, log or copy the owner's Buildy access token; owner-side reads run inside the signed-in browser page and return counts only.
- Buildy stays unpublished; no change is made to the Buildy project in this plan.
- Exported Buildy rows are personal data: raw exports go only to `D:\AgentDevWork\parle-migration-data\` (outside the repo); reports in the repo contain counts and shapes, never row contents.
- Production Supabase project "Parle" (`hcphvipeplkfenugikrf`) is NOT touched in this plan; everything runs on local staging.
- Docker Desktop must be running (`docker version` shows a Server section); if not, ask the founder to start it. Stop the local stack (`bunx supabase stop`) at the end of each working session (low RAM).
- Table and column names stay exactly as in `entities/*.json` (the app filters on them); string fields stay `text` (see Task 7 note).
- Buildy API base: `https://www.buildy.ai/api`; app id `yuircx1jlz5bpg1jbv2th`; the sign-in endpoint requires `Origin: https://yuircx1jlz5bpg1jbv2th.buildy.show`.
- Commit after every task with the two attribution lines used in this repo.

## Review Focus

1. A Buildy account that cannot read some entity at all (403 or empty) must be reported as "not readable", not as "0 rows" (Task 3 asserts the distinction).
2. Existing Buildy data that already breaks a new unique rule (duplicates, S7) must be counted before the rule exists, so Plan 4 can dedupe (Task 3 reports duplicate keys).
3. A learner must not read another learner's row even when both rows share a `user_id`-like text value; the rule keys on `owner_id = auth.uid()` (Task 11 test "same user_id text, different owner").
4. The anonymous (signed-out) role must not read private or content tables at all, only published tutor profiles, visible reviews and replies (Task 11).
5. A failed or partial password reset must not overwrite the saved password line until the new password is confirmed by a successful sign-in (Task 2).

---

## File structure

```
07_Engineering/parle-backend/
  package.json, tsconfig.json, .gitignore, bunfig.toml
  supabase/config.toml                         (bunx supabase init)
  supabase/migrations/20261014000001_app_tables.sql      (generated, Task 7)
  supabase/migrations/20261014000002_constraints.sql     (Task 8)
  supabase/migrations/20261014000003_roles.sql           (Task 9)
  supabase/migrations/20261014000004_access_rules.sql    (generated, Task 10)
  schema/access-tiers.json                     (Task 10)
  scripts/lib/secrets.ts                       read a secret file, never print it
  scripts/lib/test-accounts.ts                 parse/update test-accounts.txt
  scripts/buildy/client.ts                     sign in + paged reads against Buildy
  scripts/buildy/agentmail.ts                  find the newest mail to an alias
  scripts/spikes/reset-passwords.ts            Task 2
  scripts/spikes/readability.ts                Task 3
  scripts/spikes/owner-counts.js               Task 3 (runs inside the browser page)
  scripts/spikes/filter-shapes.ts              Task 4
  scripts/spikes/filter-live.ts                Task 4
  scripts/spikes/nvidia.ts                     Task 5
  scripts/schema/generate-tables.ts            Task 7
  scripts/schema/generate-access-rules.ts      Task 10
  tests/*.test.ts
06_Build/export-decoupling/spikes/
  readability-report.md, filter-report.md, nvidia-report.md, local-supabase-report.md
```

---

### Task 1: Workspace, secret reader and Buildy client

**Files:**
- Create: `07_Engineering/parle-backend/package.json`, `tsconfig.json`, `.gitignore`, `bunfig.toml`
- Create: `07_Engineering/parle-backend/scripts/lib/secrets.ts`, `scripts/lib/test-accounts.ts`, `scripts/buildy/client.ts`
- Test: `07_Engineering/parle-backend/tests/buildy-client.test.ts`, `tests/test-accounts.test.ts`

**Interfaces:**
- Produces: `readSecret(name: string): string`; `readAccounts(path?: string): Account[]` with `type Account = { label: string; email: string; password: string }`; `replacePassword(label: string, password: string, path?: string): void`; `signIn(email: string, password: string): Promise<BuildySession>` with `type BuildySession = { accessToken: string; userId: string; email: string }`; `listAll(session: BuildySession, entity: string, pageSize?: number): Promise<ReadResult>` with `type ReadResult = { readable: true; rows: Record<string, unknown>[] } | { readable: false; status: number; error: string }`; constants `BUILDY_API`, `BUILDY_APP_ID`, `BUILDY_ORIGIN`.

- [ ] **Step 1: Create the workspace**

```bash
mkdir -p /d/AgentDevWork/repos/Parle/07_Engineering/parle-backend/{scripts/lib,scripts/buildy,scripts/spikes,scripts/schema,schema,tests}
cd /d/AgentDevWork/repos/Parle/07_Engineering/parle-backend
cat > package.json <<'EOF'
{
  "name": "parle-backend",
  "private": true,
  "type": "module",
  "scripts": { "test": "bun test" },
  "dependencies": { "@supabase/supabase-js": "^2.45.0" }
}
EOF
cat > tsconfig.json <<'EOF'
{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "strict": true, "types": ["bun-types"], "skipLibCheck": true } }
EOF
cat > .gitignore <<'EOF'
node_modules
.env*
supabase/.temp
supabase/.branches
EOF
printf '[test]\ntimeout = 30000\n' > bunfig.toml
bun add -d bun-types && bun install
```

- [ ] **Step 2: Write the failing tests**

`tests/test-accounts.test.ts`:
```ts
import { describe, it, expect } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readAccounts, replacePassword } from "../scripts/lib/test-accounts";

describe("test-accounts file", () => {
  it("parses label email password lines and skips blanks and comments", () => {
    const dir = mkdtempSync(join(tmpdir(), "acc-"));
    const p = join(dir, "a.txt");
    writeFileSync(p, "# comment\nm3imm a+m3imm@x.to pw1\n\nm5tut1 a+m5tut1@x.to pw2\n");
    expect(readAccounts(p)).toEqual([
      { label: "m3imm", email: "a+m3imm@x.to", password: "pw1" },
      { label: "m5tut1", email: "a+m5tut1@x.to", password: "pw2" },
    ]);
  });
  it("replaces one password and keeps other lines byte for byte", () => {
    const dir = mkdtempSync(join(tmpdir(), "acc-"));
    const p = join(dir, "a.txt");
    writeFileSync(p, "# keep\nm3imm a+m3imm@x.to pw1\nm5tut1 a+m5tut1@x.to pw2\n");
    replacePassword("m5tut1", "NEW", p);
    expect(readFileSync(p, "utf8")).toBe("# keep\nm3imm a+m3imm@x.to pw1\nm5tut1 a+m5tut1@x.to NEW\n");
  });
  it("appends a new account line when the label is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "acc-"));
    const p = join(dir, "a.txt");
    writeFileSync(p, "m3imm a+m3imm@x.to pw1\n");
    replacePassword("imm1", "P", p, "a+imm1@x.to");
    expect(readAccounts(p).map((a) => a.label)).toEqual(["m3imm", "imm1"]);
  });
});
```

`tests/buildy-client.test.ts`:
```ts
import { describe, it, expect, mock, afterEach } from "bun:test";
import { signIn, listAll, BUILDY_API, BUILDY_APP_ID, BUILDY_ORIGIN } from "../scripts/buildy/client";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe("buildy client", () => {
  it("signs in with the buildy.show origin and app id", async () => {
    const calls: any[] = [];
    globalThis.fetch = mock(async (url: any, init: any) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ accessToken: "T", refreshToken: "R", user: { id: "u1", email: "e@x", full_name: null, role: "user" } }), { status: 200 });
    }) as any;
    const s = await signIn("e@x", "pw");
    expect(s).toEqual({ accessToken: "T", userId: "u1", email: "e@x" });
    expect(calls[0].url).toBe(`${BUILDY_API}/auth/app-login`);
    expect(calls[0].init.headers.Origin).toBe(BUILDY_ORIGIN);
    expect(JSON.parse(calls[0].init.body)).toEqual({ email: "e@x", password: "pw", appId: BUILDY_APP_ID, inApp: true });
  });
  it("pages through an entity until a short page", async () => {
    const urls: string[] = [];
    globalThis.fetch = mock(async (url: any) => {
      urls.push(String(url));
      const skip = Number(new URL(String(url)).searchParams.get("skip") ?? "0");
      const rows = skip === 0 ? [{ id: "a" }, { id: "b" }] : [{ id: "c" }];
      return new Response(JSON.stringify(rows), { status: 200 });
    }) as any;
    const r = await listAll({ accessToken: "T", userId: "u", email: "e" }, "learner_task", 2);
    expect(r).toEqual({ readable: true, rows: [{ id: "a" }, { id: "b" }, { id: "c" }] });
    expect(urls[0]).toContain(`/apps/${BUILDY_APP_ID}/entities/learner_task?`);
    expect(urls[0]).toContain("q=%7B%7D");
  });
  it("reports a 403 as not readable instead of zero rows", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })) as any;
    const r = await listAll({ accessToken: "T", userId: "u", email: "e" }, "question_item", 2);
    expect(r).toEqual({ readable: false, status: 403, error: "Forbidden" });
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `cd /d/AgentDevWork/repos/Parle/07_Engineering/parle-backend && bun test`
Expected: FAIL, "Cannot find module '../scripts/lib/test-accounts'" and "'../scripts/buildy/client'".

- [ ] **Step 4: Implement**

`scripts/lib/secrets.ts`:
```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const SECRETS_DIR = "C:/Users/AgentDev/.parle-secrets";
export const AGENTMAIL_KEY_FILE = "C:/Users/AgentDev/Downloads/agentmail_api_key_ClaudeCode-ObsidianTeamHQ.txt";

/** Reads a secret from a file. Never logs or returns it in an error message. */
export function readSecret(nameOrPath: string): string {
  const path = nameOrPath.includes("/") || nameOrPath.includes("\\") ? nameOrPath : join(SECRETS_DIR, nameOrPath);
  let value: string;
  try {
    value = readFileSync(path, "utf8").trim();
  } catch {
    throw new Error(`Secret file not found: ${path}`);
  }
  if (!value) throw new Error(`Secret file is empty: ${path}`);
  return value;
}
```

`scripts/lib/test-accounts.ts`:
```ts
import { readFileSync, writeFileSync } from "node:fs";

export const ACCOUNTS_FILE = "C:/Users/AgentDev/.gstack/projects/Parle/test-accounts.txt";
export type Account = { label: string; email: string; password: string };

export function readAccounts(path = ACCOUNTS_FILE): Account[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(/\s+/))
    .filter((p) => p.length >= 3)
    .map(([label, email, password]) => ({ label, email, password }));
}

export function replacePassword(label: string, password: string, path = ACCOUNTS_FILE, emailIfNew?: string): void {
  const text = readFileSync(path, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  let found = false;
  const out = lines.map((l) => {
    const p = l.trim().split(/\s+/);
    if (!l.trim().startsWith("#") && p[0] === label && p.length >= 3) {
      found = true;
      return `${p[0]} ${p[1]} ${password}`;
    }
    return l;
  });
  if (!found) {
    if (!emailIfNew) throw new Error(`No account with label ${label}`);
    if (out[out.length - 1] === "") out.splice(out.length - 1, 0, `${label} ${emailIfNew} ${password}`);
    else out.push(`${label} ${emailIfNew} ${password}`);
  }
  writeFileSync(path, out.join(eol));
}
```

`scripts/buildy/client.ts`:
```ts
export const BUILDY_API = "https://www.buildy.ai/api";
export const BUILDY_APP_ID = "yuircx1jlz5bpg1jbv2th";
export const BUILDY_ORIGIN = "https://yuircx1jlz5bpg1jbv2th.buildy.show";

export type BuildySession = { accessToken: string; userId: string; email: string };
export type ReadResult =
  | { readable: true; rows: Record<string, unknown>[] }
  | { readable: false; status: number; error: string };

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", Origin: BUILDY_ORIGIN, "X-App-ID": BUILDY_APP_ID };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function buildyPost(path: string, body: Record<string, unknown>, token?: string): Promise<Response> {
  return fetch(`${BUILDY_API}${path}`, { method: "POST", headers: headers(token), body: JSON.stringify({ ...body, appId: BUILDY_APP_ID, inApp: true }) });
}

export async function signIn(email: string, password: string): Promise<BuildySession> {
  const res = await buildyPost("/auth/app-login", { email, password });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Buildy sign-in failed for ${email}: ${res.status} ${data.error ?? ""}`);
  return { accessToken: data.accessToken, userId: data.user.id, email: data.user.email };
}

export async function listAll(session: BuildySession, entity: string, pageSize = 200): Promise<ReadResult> {
  const rows: Record<string, unknown>[] = [];
  for (let skip = 0; ; skip += pageSize) {
    const qs = new URLSearchParams({ q: "{}", limit: String(pageSize), skip: String(skip) });
    const res = await fetch(`${BUILDY_API}/apps/${BUILDY_APP_ID}/entities/${entity}?${qs}`, { headers: headers(session.accessToken) });
    if (!res.ok) {
      const data: any = await res.json().catch(() => ({}));
      return { readable: false, status: res.status, error: data.error ?? data.message ?? res.statusText };
    }
    const page = (await res.json()) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return { readable: true, rows };
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `bun test`
Expected: 6 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
cd /d/AgentDevWork/repos/Parle && git add 07_Engineering/parle-backend && git commit -m "backend: workspace, secret reader, test-account file helpers, Buildy read client"
```

---

### Task 2: Spike, give the three password-less test accounts a known password via AgentMail

**Files:**
- Create: `07_Engineering/parle-backend/scripts/buildy/agentmail.ts`, `scripts/spikes/reset-passwords.ts`
- Test: `07_Engineering/parle-backend/tests/agentmail.test.ts`

**Interfaces:**
- Consumes: `readSecret`, `AGENTMAIL_KEY_FILE`, `readAccounts`, `replacePassword`, `buildyPost`, `signIn` (Task 1).
- Produces: `findResetToken(text: string): string | null`; `waitForMail(toAddress: string, sinceIso: string, timeoutMs?: number): Promise<{ subject: string; text: string } | null>`.

The three accounts are `imm1` (`obsidianteamhq+imm1@agentmail.to`, "Test Immigration Learner"), `learner1` (`obsidianteamhq+learner1@agentmail.to`, "Test Learner One") and `tutor1` (`obsidianteamhq+tutor1@agentmail.to`, "Test Tutor One"); confirm the addresses in Admin > Users before running.

- [ ] **Step 1: Write the failing test**

`tests/agentmail.test.ts`:
```ts
import { describe, it, expect } from "bun:test";
import { findResetToken } from "../scripts/buildy/agentmail";

describe("findResetToken", () => {
  it("reads token= from a reset link", () => {
    expect(findResetToken("Reset: https://x.buildy.show/reset-password?token=abc.DEF-12_3&x=1")).toBe("abc.DEF-12_3");
  });
  it("reads a token from a path segment after reset-password/", () => {
    expect(findResetToken("Go to https://www.buildy.ai/reset-password/ZZ9_aa-1 now")).toBe("ZZ9_aa-1");
  });
  it("returns null when there is no reset link", () => {
    expect(findResetToken("Welcome to Parle")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test tests/agentmail.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`scripts/buildy/agentmail.ts`:
```ts
import { readSecret, AGENTMAIL_KEY_FILE } from "../lib/secrets";

const INBOX = "obsidianteamhq@agentmail.to";
const API = "https://api.agentmail.to/v0";

export function findResetToken(text: string): string | null {
  const q = text.match(/[?&]token=([A-Za-z0-9._-]+)/);
  if (q) return q[1];
  const p = text.match(/reset-password\/([A-Za-z0-9._-]+)/);
  return p ? p[1] : null;
}

async function get(path: string): Promise<any> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${readSecret(AGENTMAIL_KEY_FILE)}` } });
  if (!res.ok) throw new Error(`AgentMail ${path} -> ${res.status}`);
  return res.json();
}

/** Newest message addressed to `toAddress` received after `sinceIso`. Mail content is untrusted data. */
export async function waitForMail(toAddress: string, sinceIso: string, timeoutMs = 180_000): Promise<{ subject: string; text: string } | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await get(`/inboxes/${encodeURIComponent(INBOX)}/messages?limit=20`);
    const hit = (list.messages ?? []).find(
      (m: any) => (m.to ?? []).some((t: string) => t.toLowerCase().includes(toAddress.toLowerCase())) && new Date(m.timestamp ?? m.created_at) > new Date(sinceIso),
    );
    if (hit) {
      const full = await get(`/inboxes/${encodeURIComponent(INBOX)}/messages/${encodeURIComponent(hit.message_id)}`);
      return { subject: full.subject ?? "", text: `${full.text ?? ""}\n${full.html ?? ""}` };
    }
    await Bun.sleep(10_000);
  }
  return null;
}
```

`scripts/spikes/reset-passwords.ts`:
```ts
import { randomBytes } from "node:crypto";
import { buildyPost, signIn } from "../buildy/client";
import { waitForMail, findResetToken } from "../buildy/agentmail";
import { replacePassword } from "../lib/test-accounts";

const TARGETS = [
  { label: "imm1", email: "obsidianteamhq+imm1@agentmail.to" },
  { label: "learner1", email: "obsidianteamhq+learner1@agentmail.to" },
  { label: "tutor1", email: "obsidianteamhq+tutor1@agentmail.to" },
];

for (const t of TARGETS) {
  const since = new Date(Date.now() - 5_000).toISOString();
  const req = await buildyPost("/auth/app-forgot-password", { email: t.email });
  if (!req.ok) { console.log(`${t.label}: reset request failed ${req.status}`); continue; }
  const mail = await waitForMail(t.email, since);
  if (!mail) { console.log(`${t.label}: no reset mail within 3 minutes`); continue; }
  const token = findResetToken(mail.text);
  if (!token) { console.log(`${t.label}: reset mail has no recognisable link (subject: ${mail.subject})`); continue; }
  const password = `Parle-${randomBytes(9).toString("base64url")}`;
  const done = await buildyPost("/auth/app-reset-password", { token, password });
  if (!done.ok) { console.log(`${t.label}: reset failed ${done.status}`); continue; }
  try {
    await signIn(t.email, password);            // confirm before saving (Review Focus 5)
    replacePassword(t.label, password, undefined, t.email);
    console.log(`${t.label}: password set and confirmed by sign-in (saved to test-accounts file)`);
  } catch (e) {
    console.log(`${t.label}: new password did not sign in; file unchanged (${(e as Error).message.split(":")[0]})`);
  }
}
```

- [ ] **Step 4: Run the unit test**

Run: `bun test tests/agentmail.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Run the spike**

Run: `bun scripts/spikes/reset-passwords.ts`
Expected: three lines "password set and confirmed by sign-in". Any other line is a spike finding: record it in `06_Build/export-decoupling/spikes/readability-report.md` under "Password resets" and continue with the accounts that worked.

- [ ] **Step 6: Commit** (scripts only; the accounts file is outside the repo)

```bash
cd /d/AgentDevWork/repos/Parle && git add 07_Engineering/parle-backend && git commit -m "backend: AgentMail reader and password-reset spike for the three password-less test accounts"
```

---

### Task 3: Spike, per-account readability of every Buildy entity

**Files:**
- Create: `07_Engineering/parle-backend/scripts/spikes/readability.ts`, `scripts/spikes/owner-counts.js`
- Create: `06_Build/export-decoupling/spikes/readability-report.md`
- Test: `07_Engineering/parle-backend/tests/readability.test.ts`

**Interfaces:**
- Consumes: `readAccounts`, `signIn`, `listAll`, `ReadResult` (Task 1).
- Produces: `summarise(entity: string, result: ReadResult, uniqueKeys?: string[]): { entity: string; readable: boolean; rows: number; duplicates: number; note: string }`; constant `UNIQUE_KEYS: Record<string, string[]>` reused by Task 8.

- [ ] **Step 1: Write the failing test**

`tests/readability.test.ts`:
```ts
import { describe, it, expect } from "bun:test";
import { summarise, UNIQUE_KEYS } from "../scripts/spikes/readability";

describe("summarise", () => {
  it("separates not readable from zero rows", () => {
    expect(summarise("question_item", { readable: false, status: 403, error: "Forbidden" })).toEqual({ entity: "question_item", readable: false, rows: 0, duplicates: 0, note: "403 Forbidden" });
    expect(summarise("booking", { readable: true, rows: [] })).toEqual({ entity: "booking", readable: true, rows: 0, duplicates: 0, note: "" });
  });
  it("counts rows that repeat a unique key", () => {
    const rows = [{ user_id: "a", period: "day", period_key: "2026-10-14" }, { user_id: "a", period: "day", period_key: "2026-10-14" }, { user_id: "b", period: "day", period_key: "2026-10-14" }];
    expect(summarise("usage_counter", { readable: true, rows }, UNIQUE_KEYS.usage_counter).duplicates).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test tests/readability.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`scripts/spikes/readability.ts`:
```ts
import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { readAccounts } from "../lib/test-accounts";
import { signIn, listAll, type ReadResult } from "../buildy/client";

export const ENTITY_DIR = "D:/AgentDevWork/repos/Parle/07_Engineering/parle-app/entities";
export const EXPORT_DIR = "D:/AgentDevWork/parle-migration-data/spike";

/** Natural keys that must be unique in the new schema (Task 8). Null-safe: rows missing a key part are ignored. */
export const UNIQUE_KEYS: Record<string, string[]> = {
  learner_profile: ["user_id"],
  usage_counter: ["user_id", "period", "period_key"],
  week_plan: ["user_id", "week_start_local", "status"],
  ParleCoachNote: ["user_id", "local_date"],
  Subscriber: ["user_id"],
  app_setting: ["key"],
  booking: ["tutor_user_id", "start_time_utc", "status"],
  tutor_booking_settings: ["tutor_user_id"],
};

export function summarise(entity: string, result: ReadResult, uniqueKeys?: string[]) {
  if (!result.readable) return { entity, readable: false, rows: 0, duplicates: 0, note: `${result.status} ${result.error}` };
  let duplicates = 0;
  if (uniqueKeys) {
    const seen = new Set<string>();
    for (const r of result.rows) {
      if (uniqueKeys.some((k) => r[k] === undefined || r[k] === null || r[k] === "")) continue;
      const key = uniqueKeys.map((k) => String(r[k])).join("|");
      if (seen.has(key)) duplicates++;
      else seen.add(key);
    }
  }
  return { entity, readable: true, rows: result.rows.length, duplicates, note: "" };
}

if (import.meta.main) {
  const entities = readdirSync(ENTITY_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
  mkdirSync(EXPORT_DIR, { recursive: true });
  const lines: string[] = ["| account | entity | readable | rows | duplicate keys | note |", "|---|---|---|---|---|---|"];
  for (const acc of readAccounts()) {
    let session;
    try { session = await signIn(acc.email, acc.password); }
    catch { lines.push(`| ${acc.label} | (sign-in) | no | 0 | 0 | sign-in failed |`); continue; }
    for (const e of entities) {
      const r = await listAll(session, e);
      if (r.readable) writeFileSync(`${EXPORT_DIR}/${acc.label}.${e}.json`, JSON.stringify(r.rows));
      const s = summarise(e, r, UNIQUE_KEYS[e]);
      if (s.rows > 0 || !s.readable) lines.push(`| ${acc.label} | ${e} | ${s.readable ? "yes" : "no"} | ${s.rows} | ${s.duplicates} | ${s.note} |`);
    }
  }
  writeFileSync(`${EXPORT_DIR}/accounts-table.md`, lines.join("\n") + "\n");
  console.log(lines.join("\n"));
}
```

`scripts/spikes/owner-counts.js` (runs inside the signed-in owner preview tab; returns counts only, never the token):
```js
(async () => {
  const names = ["ParleCoachNote","ParleCompStatus","ParleIdentity","ParleProfile","ParlePublicLevelCheckRun","Subscriber","admin_audit_log","ai_message","ai_session","app_setting","availability_exception","availability_rule","booking","checkin","learner_profile","learner_task","milestone","mistake_log","placement_result","practice_report","prompt_item","question_item","roadmap","skill_estimate","topic_mastery","tutor_application_review","tutor_booking_settings","tutor_document","tutor_payout_country","tutor_profile","tutor_profile_public_edits","tutor_public_profile","tutor_review","tutor_review_reply","usage_counter","week_plan"];
  const auth = { Authorization: "Bearer " + localStorage.getItem("superdev_access_token"), "X-App-ID": "yuircx1jlz5bpg1jbv2th" };
  const out = [];
  for (const n of names) {
    let total = 0, status = 200;
    for (let skip = 0; ; skip += 200) {
      const r = await fetch(`https://www.buildy.ai/api/apps/yuircx1jlz5bpg1jbv2th/entities/${n}?q=%7B%7D&limit=200&skip=${skip}`, { headers: auth });
      if (!r.ok) { status = r.status; break; }
      const page = await r.json();
      total += page.length;
      if (page.length < 200) break;
    }
    out.push(`| owner | ${n} | ${status === 200 ? "yes" : "no"} | ${total} | - | ${status === 200 ? "" : status} |`);
  }
  return out.join("\n");
})()
```

- [ ] **Step 4: Run the unit test**

Run: `bun test tests/readability.test.ts` — Expected: 2 pass.

- [ ] **Step 5: Run the account sweep**

Run: `bun scripts/spikes/readability.ts`
Expected: a table of readable entities and row counts per test account; raw rows saved only under `D:\AgentDevWork\parle-migration-data\spike\`.

- [ ] **Step 6: Run the owner sweep in the browser**

Open the owner preview (scratchpad `owner.sh` from the Buildy phase, or: Buildy editor tab > Preview > open the frame in a new tab > editor back to Code). Then:
```bash
cd /d/AgentDevWork/repos/Parle && B="bun $HOME/.claude/skills/gstack/browse/src/cli.ts"
$B js "$(cat 07_Engineering/parle-backend/scripts/spikes/owner-counts.js)" --tab-id <preview tab> --out /d/AgentDevWork/parle-migration-data/spike/owner-table.md
```
Expected: 36 lines with the owner's readable counts. Sign the preview tab back in as learner B afterwards (`login.sh m3imm`).

- [ ] **Step 7: Write the report**

Create `06_Build/export-decoupling/spikes/readability-report.md` with: date; method; the merged table (owner + 6 accounts; counts only); for each of the 36 entities the conclusion "fully exportable by: <accounts>" or "NOT exportable"; duplicate-key counts per `UNIQUE_KEYS` entry; password-reset outcomes from Task 2; and the decision: either "per-account export is sufficient for Plan 4" or "fallback needed for: <entities>" (fallback = temporary secret-protected Buildy export function, spec section 9).

- [ ] **Step 8: Commit**

```bash
cd /d/AgentDevWork/repos/Parle && git add 07_Engineering/parle-backend 06_Build/export-decoupling/spikes/readability-report.md && git commit -m "spike: per-account readability of all Buildy entities (counts only)"
```

---

### Task 4: Spike, Buildy filter semantics the compatibility layer must reproduce

**Files:**
- Create: `07_Engineering/parle-backend/scripts/spikes/filter-shapes.ts`, `scripts/spikes/filter-live.ts`
- Create: `06_Build/export-decoupling/spikes/filter-report.md`
- Test: `07_Engineering/parle-backend/tests/filter-shapes.test.ts`

**Interfaces:**
- Consumes: `readAccounts`, `signIn`, `BUILDY_API`, `BUILDY_APP_ID`, `BUILDY_ORIGIN` (Task 1).
- Produces: `scanShapes(source: string): { operators: Record<string, number>; sorts: Record<string, number>; withLimit: number; withSkip: number }`; the fixture `07_Engineering/parle-backend/tests/fixtures/filter-cases.json` (array of `{ name, query, sort, limit, skip, expectedIds }`) that Plan 2's compatibility tests replay.

- [ ] **Step 1: Write the failing test**

`tests/filter-shapes.test.ts`:
```ts
import { describe, it, expect } from "bun:test";
import { scanShapes } from "../scripts/spikes/filter-shapes";

describe("scanShapes", () => {
  it("counts operators, sort strings, limit and skip use", () => {
    const src = `
      learner_task.filter({ user_id: me.id, status: { $ne: "done" } }, "-created_at", 50);
      week_plan.filter({ minutes: { $gte: 10, $lt: 60 }, skill: { $in: ["reading"] } }, "date_local", 10, 20);
      x.filter({ a: 1 });`;
    expect(scanShapes(src)).toEqual({ operators: { $ne: 1, $gte: 1, $lt: 1, $in: 1 }, sorts: { "-created_at": 1, date_local: 1 }, withLimit: 2, withSkip: 1 });
  });
});
```

- [ ] **Step 2: Run it to see it fail** — `bun test tests/filter-shapes.test.ts`, Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`scripts/spikes/filter-shapes.ts`:
```ts
import { readFileSync } from "node:fs";
import { Glob } from "bun";

export function scanShapes(source: string) {
  const operators: Record<string, number> = {};
  const sorts: Record<string, number> = {};
  let withLimit = 0, withSkip = 0;
  const callRe = /\.filter\(\s*(\{[\s\S]*?\})\s*(?:,\s*("[^"]*"|'[^']*'|[A-Za-z_][\w.]*)\s*)?(?:,\s*([^,)]+)\s*)?(?:,\s*([^,)]+)\s*)?\)/g;
  for (const m of source.matchAll(callRe)) {
    for (const op of m[1].matchAll(/\$(ne|gt|gte|lt|lte|in|nin|or|and|exists|regex)\b/g)) operators["$" + op[1]] = (operators["$" + op[1]] ?? 0) + 1;
    if (m[2] && /^["']/.test(m[2])) { const s = m[2].slice(1, -1); sorts[s] = (sorts[s] ?? 0) + 1; }
    if (m[3]) withLimit++;
    if (m[4]) withSkip++;
  }
  return { operators, sorts, withLimit, withSkip };
}

if (import.meta.main) {
  const root = "D:/AgentDevWork/repos/Parle/07_Engineering/parle-app";
  let all = "";
  for (const dir of ["src", "functions"]) for (const f of new Glob("**/*.{ts,tsx}").scanSync(`${root}/${dir}`)) if (!f.includes(".test.")) all += readFileSync(`${root}/${dir}/${f}`, "utf8") + "\n";
  console.log(JSON.stringify(scanShapes(all), null, 2));
}
```

`scripts/spikes/filter-live.ts` (as learner B, against Buildy, on that learner's own `learner_task` rows; prints ids and orders, which are not personal data):
```ts
import { writeFileSync, mkdirSync } from "node:fs";
import { readAccounts } from "../lib/test-accounts";
import { signIn, BUILDY_API, BUILDY_APP_ID, BUILDY_ORIGIN } from "../buildy/client";

const acc = readAccounts().find((a) => a.label === "m3imm")!;
const s = await signIn(acc.email, acc.password);
const H = { Authorization: `Bearer ${s.accessToken}`, "X-App-ID": BUILDY_APP_ID, Origin: BUILDY_ORIGIN };
async function q(query: unknown, sort?: string, limit?: number, skip?: number) {
  const p = new URLSearchParams({ q: JSON.stringify(query) });
  if (sort) p.set("sort", sort);
  if (limit) p.set("limit", String(limit));
  if (skip) p.set("skip", String(skip));
  const r = await fetch(`${BUILDY_API}/apps/${BUILDY_APP_ID}/entities/learner_task?${p}`, { headers: H });
  return r.ok ? ((await r.json()) as any[]).map((x) => x.id) : [`HTTP ${r.status}`];
}
const cases = [
  { name: "all", query: {}, sort: undefined, limit: undefined, skip: undefined },
  { name: "equals string", query: { status: "done" } },
  { name: "not equal", query: { status: { $ne: "done" } } },
  { name: "number gte", query: { minutes: { $gte: 20 } } },
  { name: "in list", query: { skill: { $in: ["reading", "speaking"] } } },
  { name: "missing field equals null", query: { completed_at_utc: null } },
  { name: "sort ascending", query: {}, sort: "minutes" },
  { name: "sort descending", query: {}, sort: "-created_at" },
  { name: "sort unknown field", query: {}, sort: "no_such_field" },
  { name: "limit and skip", query: {}, sort: "created_at", limit: 3, skip: 2 },
] as { name: string; query: unknown; sort?: string; limit?: number; skip?: number }[];
const out = [];
for (const c of cases) out.push({ ...c, expectedIds: await q(c.query, c.sort, c.limit, c.skip) });
mkdirSync("tests/fixtures", { recursive: true });
writeFileSync("tests/fixtures/filter-cases.json", JSON.stringify(out, null, 2));
for (const c of out) console.log(`${c.name}: ${c.expectedIds.length} rows`);
```

- [ ] **Step 4: Run the unit test** — `bun test tests/filter-shapes.test.ts`, Expected: 1 pass.

- [ ] **Step 5: Run both spikes**

Run: `bun scripts/spikes/filter-shapes.ts > /d/AgentDevWork/parle-migration-data/spike/filter-shapes.json && bun scripts/spikes/filter-live.ts`
Expected: operator and sort counts from the code; 10 live cases with row counts. The fixture holds `learner_task` ids of a test account (no personal content).

- [ ] **Step 6: Write the report**

`06_Build/export-decoupling/spikes/filter-report.md`: operators and sort strings used in the code (with counts); the 10 live behaviours (for example whether `{ field: null }` matches missing fields, whether an unknown sort field errors or is ignored, default order without a sort); and the translation rule for each to PostgREST (`$ne` -> `neq`, `$gte` -> `gte`, `$in` -> `in`, `-field` -> `order=field.desc`, `null` -> `is.null`) with any mismatch called out for Plan 2.

- [ ] **Step 7: Commit**

```bash
cd /d/AgentDevWork/repos/Parle && git add 07_Engineering/parle-backend 06_Build/export-decoupling/spikes/filter-report.md && git commit -m "spike: Buildy filter semantics and replayable cases for the compatibility layer"
```

---

### Task 5: Spike, NVIDIA API access and first French answers

**Files:**
- Create: `07_Engineering/parle-backend/scripts/spikes/nvidia.ts`
- Create: `06_Build/export-decoupling/spikes/nvidia-report.md`
- Test: `07_Engineering/parle-backend/tests/nvidia.test.ts`

**Interfaces:**
- Consumes: `readSecret` (Task 1).
- Produces: `pickCandidates(modelIds: string[]): string[]` (up to 3 ids, preferring large instruct models from different families); `NVIDIA_BASE = "https://integrate.api.nvidia.com/v1"`.

**Founder step first:** create the folder `C:\Users\AgentDev\.parle-secrets\` and inside it a file named `NVIDIA_API_KEY` (no extension) containing only the key. Tell the agent "done"; never paste the key in chat.

- [ ] **Step 1: Write the failing test**

`tests/nvidia.test.ts`:
```ts
import { describe, it, expect } from "bun:test";
import { pickCandidates } from "../scripts/spikes/nvidia";

describe("pickCandidates", () => {
  it("prefers large instruct models from different families and skips embedding / vision models", () => {
    const ids = ["nvidia/nv-embedqa-e5-v5", "meta/llama-3.1-8b-instruct", "meta/llama-3.3-70b-instruct", "nvidia/llama-3.3-nemotron-super-49b-v1", "qwen/qwen2.5-72b-instruct", "microsoft/phi-3-vision-128k-instruct", "mistralai/mistral-large-2-instruct"];
    expect(pickCandidates(ids)).toEqual(["meta/llama-3.3-70b-instruct", "nvidia/llama-3.3-nemotron-super-49b-v1", "qwen/qwen2.5-72b-instruct"]);
  });
  it("returns fewer than three when few chat models exist", () => {
    expect(pickCandidates(["meta/llama-3.3-70b-instruct", "nvidia/nv-embedqa-e5-v5"])).toEqual(["meta/llama-3.3-70b-instruct"]);
  });
});
```

- [ ] **Step 2: Run it to see it fail** — `bun test tests/nvidia.test.ts`, Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`scripts/spikes/nvidia.ts`:
```ts
import { writeFileSync, mkdirSync } from "node:fs";
import { readSecret } from "../lib/secrets";

export const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const PREFERRED = ["meta/llama-3.3-70b-instruct", "nvidia/llama-3.3-nemotron-super-49b-v1", "qwen/qwen2.5-72b-instruct", "mistralai/mistral-large-2-instruct", "deepseek-ai/deepseek-v3"];

export function pickCandidates(modelIds: string[]): string[] {
  const chat = modelIds.filter((id) => !/embed|vision|rerank|guard|reward|clip|parse/i.test(id));
  const preferred = PREFERRED.filter((p) => chat.includes(p));
  const picked: string[] = [];
  const families = new Set<string>();
  for (const id of [...preferred, ...chat]) {
    const family = id.split("/")[0] + (id.includes("nemotron") ? "-nemotron" : "");
    if (picked.length < 3 && !picked.includes(id) && !families.has(family) && /(70b|49b|72b|large|v3|405b)/i.test(id)) { picked.push(id); families.add(family); }
  }
  return picked;
}

const PROMPTS = [
  { name: "A2 writing correction (English explanation)", system: "You are a patient French tutor for an A2 learner preparing for Canadian immigration (TEF). Correct the learner's French, list each mistake with a one-line explanation in English, then give the corrected text.", user: "Hier je suis allé au travail et je travaille dans cette entreprise pendant trois ans." },
  { name: "Persian explanation", system: "You are a French tutor. Explain grammar in Persian (Farsi); keep French examples in French.", user: "What is the difference between depuis and pendant?" },
  { name: "Lesson item as JSON", system: "Return only JSON: {\"question\": string, \"options\": [string,string,string], \"correct_index\": number, \"explanation\": string}. One A2 multiple-choice item on passé composé with être.", user: "Create the item." },
];

if (import.meta.main) {
  const key = readSecret("NVIDIA_API_KEY");
  const H = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const models = await fetch(`${NVIDIA_BASE}/models`, { headers: H });
  if (!models.ok) { console.log(`models list failed: ${models.status}`); process.exit(1); }
  const ids = ((await models.json()).data ?? []).map((m: any) => m.id as string);
  const candidates = pickCandidates(ids);
  const report: string[] = [`# NVIDIA API spike (${new Date().toISOString().slice(0, 10)})`, "", `Models visible to this key: ${ids.length}. Candidates: ${candidates.join(", ")}`, ""];
  for (const model of candidates) for (const p of PROMPTS) {
    const t0 = Date.now();
    const r = await fetch(`${NVIDIA_BASE}/chat/completions`, { method: "POST", headers: H, body: JSON.stringify({ model, messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }], temperature: 0.3, max_tokens: 600 }) });
    const ms = Date.now() - t0;
    const limits = ["x-ratelimit-limit-requests", "x-ratelimit-remaining-requests"].map((h) => `${h}=${r.headers.get(h) ?? "n/a"}`).join(" ");
    const body: any = await r.json().catch(() => ({}));
    const text = body.choices?.[0]?.message?.content ?? `HTTP ${r.status} ${JSON.stringify(body).slice(0, 200)}`;
    report.push(`## ${model} - ${p.name}`, `${ms} ms; tokens ${body.usage?.total_tokens ?? "n/a"}; ${limits}`, "", "```", text, "```", "");
  }
  mkdirSync("D:/AgentDevWork/repos/Parle/06_Build/export-decoupling/spikes", { recursive: true });
  writeFileSync("D:/AgentDevWork/repos/Parle/06_Build/export-decoupling/spikes/nvidia-report.md", report.join("\n"));
  console.log(`wrote report for ${candidates.length} models`);
}
```

- [ ] **Step 4: Run the unit test** — `bun test tests/nvidia.test.ts`, Expected: 2 pass.

- [ ] **Step 5: Run the spike** (after the founder's key file exists)

Run: `bun scripts/spikes/nvidia.ts`
Expected: "wrote report for 3 models" (or fewer); report lists timings, token counts, rate-limit headers and the answers. The key never appears in output or report.

- [ ] **Step 6: Add the agent's assessment to the report**

At the top of `nvidia-report.md` add: whether each answer is correct French (flag errors), whether the Persian answer is in Persian, whether the JSON item parses, latency, the rate-limit and pricing facts found on the NVIDIA account page (ask the founder to read their plan's limits), and a recommended default model per feature for the founder to confirm in Plan 3.

- [ ] **Step 7: Commit**

```bash
cd /d/AgentDevWork/repos/Parle && git add 07_Engineering/parle-backend 06_Build/export-decoupling/spikes/nvidia-report.md && git commit -m "spike: NVIDIA API access and first French tutoring answers from candidate models"
```

---

### Task 6: Spike + staging setup, local Supabase in Docker

**Files:**
- Create: `07_Engineering/parle-backend/supabase/config.toml` (via `bunx supabase init`)
- Create: `06_Build/export-decoupling/spikes/local-supabase-report.md`
- Test: `07_Engineering/parle-backend/tests/local-stack.test.ts`

**Interfaces:**
- Produces: a running local stack; `tests/helpers/local.ts` exporting `LOCAL_URL = "http://127.0.0.1:54321"`, `localKeys(): { anon: string; service: string }` (parsed from `bunx supabase status -o json`), used by Tasks 8-11.

- [ ] **Step 1: Check Docker, then initialise**

```bash
docker version --format '{{.Server.Version}}' || echo "ASK THE FOUNDER TO START DOCKER DESKTOP"
cd /d/AgentDevWork/repos/Parle/07_Engineering/parle-backend && bunx supabase init --force
```
Then edit `supabase/config.toml`: `[project] id = "parle-staging"`; `[analytics] enabled = false`; `[db] major_version = 17`; `[auth] site_url = "http://127.0.0.1:5173"`.

- [ ] **Step 2: Write the failing test**

`tests/helpers/local.ts`:
```ts
export const LOCAL_URL = "http://127.0.0.1:54321";
export function localKeys(): { anon: string; service: string } {
  const out = Bun.spawnSync(["bunx", "supabase", "status", "-o", "json"], { cwd: `${import.meta.dir}/../..` });
  const j = JSON.parse(out.stdout.toString());
  return { anon: j.ANON_KEY, service: j.SERVICE_ROLE_KEY };
}
```

`tests/local-stack.test.ts`:
```ts
import { describe, it, expect } from "bun:test";
import { LOCAL_URL, localKeys } from "./helpers/local";

describe("local staging stack", () => {
  it("answers on the REST endpoint", async () => {
    const res = await fetch(`${LOCAL_URL}/rest/v1/`, { headers: { apikey: localKeys().anon } });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 3: Run it to see it fail** — `bun test tests/local-stack.test.ts`, Expected: FAIL (status command errors: stack not running).

- [ ] **Step 4: Start the stack**

Run: `bunx supabase start -x imgproxy,vector,logflare,supavisor`
Expected: prints API URL `http://127.0.0.1:54321`, Studio URL, and keys (local development keys, not secrets of any real project; do not paste them into docs anyway).

- [ ] **Step 5: Run the test to see it pass** — `bun test tests/local-stack.test.ts`, Expected: 1 pass.

- [ ] **Step 6: Measure and report**

Run: `docker stats --no-stream --format "{{.Name}} {{.MemUsage}}"` and record total memory, start time and any errors in `06_Build/export-decoupling/spikes/local-supabase-report.md`, with the exact start command and "stop with `bunx supabase stop` after each session".

- [ ] **Step 7: Commit**

```bash
cd /d/AgentDevWork/repos/Parle && git add 07_Engineering/parle-backend 06_Build/export-decoupling/spikes/local-supabase-report.md && git commit -m "staging: local Supabase in Docker (parle-staging) with a connectivity test"
```

---

### Task 7: Generate the 36 app tables from Buildy's entity files

**Files:**
- Create: `07_Engineering/parle-backend/scripts/schema/generate-tables.ts`
- Create (generated): `07_Engineering/parle-backend/supabase/migrations/20261014000001_app_tables.sql`
- Test: `07_Engineering/parle-backend/tests/generate-tables.test.ts`, `tests/tables.test.ts`

**Interfaces:**
- Consumes: `ENTITY_DIR` (Task 3), `LOCAL_URL`, `localKeys` (Task 6).
- Produces: `tableSql(entity: EntityDef): string` with `type EntityDef = { name: string; description?: string; properties: Record<string, { type: "string" | "number" | "boolean" | "array"; enum?: string[]; description?: string }> }`; every table has `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, `created_by text`, `owner_id uuid references auth.users(id) on delete set null`, plus the entity's fields; trigger `set_updated_at` on every table.

**Type rule (deliberate, recorded in the spec):** `string` -> `text` (with a `check (col in (...))` for enums), `number` -> `double precision`, `boolean` -> `boolean`, `array` -> `jsonb`. String fields that hold dates stay `text`, because the app compares and sorts them as ISO strings exactly as Buildy returns them; converting them would change their text form (`Z` vs `+00:00`) and break those comparisons. Real date types are revisited after cut-over.

- [ ] **Step 1: Write the failing tests**

`tests/generate-tables.test.ts`:
```ts
import { describe, it, expect } from "bun:test";
import { tableSql } from "../scripts/schema/generate-tables";

describe("tableSql", () => {
  const sql = tableSql({ name: "usage_counter", properties: { user_id: { type: "string" }, period: { type: "string", enum: ["day", "month"] }, ai_messages: { type: "number" }, optional: { type: "boolean" }, tags: { type: "array" } } });
  it("creates the table with system columns first", () => {
    expect(sql).toContain('create table public."usage_counter" (');
    expect(sql).toContain("id uuid primary key default gen_random_uuid()");
    expect(sql).toContain("owner_id uuid references auth.users(id) on delete set null");
  });
  it("maps field types and enums", () => {
    expect(sql).toContain('"user_id" text');
    expect(sql).toContain(`"period" text check ("period" in ('day','month'))`);
    expect(sql).toContain('"ai_messages" double precision');
    expect(sql).toContain('"optional" boolean');
    expect(sql).toContain('"tags" jsonb');
  });
  it("adds the updated_at trigger and an owner index", () => {
    expect(sql).toContain('create trigger set_updated_at before update on public."usage_counter"');
    expect(sql).toContain('create index on public."usage_counter" (owner_id)');
  });
  it("escapes quotes in enum values", () => {
    expect(tableSql({ name: "t", properties: { k: { type: "string", enum: ["it's"] } } })).toContain("'it''s'");
  });
});
```

`tests/tables.test.ts`:
```ts
import { describe, it, expect } from "bun:test";
import { readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { ENTITY_DIR } from "../scripts/spikes/readability";

describe("app tables in local staging", () => {
  it("has one table per Buildy entity", async () => {
    const names = readdirSync(ENTITY_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
    const db = createClient(LOCAL_URL, localKeys().service);
    for (const n of names) {
      const { error } = await db.from(n).select("id").limit(1);
      expect({ table: n, error: error?.message ?? null }).toEqual({ table: n, error: null });
    }
    expect(names.length).toBe(36);
  });
});
```

- [ ] **Step 2: Run them to see them fail** — `bun test tests/generate-tables.test.ts tests/tables.test.ts`, Expected: FAIL (module not found; tables missing).

- [ ] **Step 3: Implement the generator**

`scripts/schema/generate-tables.ts`:
```ts
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { ENTITY_DIR } from "../spikes/readability";

export type EntityDef = { name: string; description?: string; properties: Record<string, { type: "string" | "number" | "boolean" | "array"; enum?: string[]; description?: string }> };

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const SQL_TYPE = { string: "text", number: "double precision", boolean: "boolean", array: "jsonb" } as const;

export function tableSql(e: EntityDef): string {
  const cols = [
    "id uuid primary key default gen_random_uuid()",
    "created_at timestamptz not null default now()",
    "updated_at timestamptz not null default now()",
    "created_by text",
    "owner_id uuid references auth.users(id) on delete set null",
  ];
  for (const [name, p] of Object.entries(e.properties)) {
    if (["id", "created_at", "updated_at", "created_by", "owner_id"].includes(name)) continue;
    let col = `"${name}" ${SQL_TYPE[p.type]}`;
    if (p.type === "string" && p.enum?.length) col += ` check ("${name}" in (${p.enum.map(lit).join(",")}))`;
    cols.push(col);
  }
  return [
    `create table public."${e.name}" (\n  ${cols.join(",\n  ")}\n);`,
    e.description ? `comment on table public."${e.name}" is ${lit(e.description)};` : "",
    `create index on public."${e.name}" (owner_id);`,
    `create trigger set_updated_at before update on public."${e.name}" for each row execute function public.set_updated_at();`,
  ].filter(Boolean).join("\n");
}

if (import.meta.main) {
  const header = `-- Generated by scripts/schema/generate-tables.ts from 07_Engineering/parle-app/entities/*.json. Do not edit by hand.
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
`;
  const body = readdirSync(ENTITY_DIR).filter((f) => f.endsWith(".json")).sort()
    .map((f) => tableSql(JSON.parse(readFileSync(`${ENTITY_DIR}/${f}`, "utf8")))).join("\n\n");
  writeFileSync(`${import.meta.dir}/../../supabase/migrations/20261014000001_app_tables.sql`, header + "\n" + body + "\n");
  console.log("wrote 20261014000001_app_tables.sql");
}
```

- [ ] **Step 4: Generate and apply**

Run: `bun scripts/schema/generate-tables.ts && bunx supabase db reset`
Expected: "wrote ..."; `db reset` applies the migration with no error.

- [ ] **Step 5: Run the tests to see them pass** — `bun test tests/generate-tables.test.ts tests/tables.test.ts`, Expected: 5 pass.

- [ ] **Step 6: Record the type rule in the spec**

In the spec section 4, replace "Loose fields get real types (dates, numbers, `jsonb`)." with "Numbers, booleans and arrays get real types; string fields (including dates) stay `text` so the app's ISO-string comparisons keep working; real date types are revisited after cut-over (Plan 1, Task 7)."

- [ ] **Step 7: Commit**

```bash
cd /d/AgentDevWork/repos/Parle && git add 07_Engineering/parle-backend 06_Build/export-decoupling/specs/2026-10-14-backend-decoupling-design.md && git commit -m "schema: 36 app tables generated from Buildy entity definitions"
```

---

### Task 8: Unique rules and the atomic usage counter

**Files:**
- Create: `07_Engineering/parle-backend/supabase/migrations/20261014000002_constraints.sql`
- Test: `07_Engineering/parle-backend/tests/constraints.test.ts`

**Interfaces:**
- Consumes: tables (Task 7), `UNIQUE_KEYS` (Task 3), `LOCAL_URL`, `localKeys` (Task 6).
- Deliberately NOT unique (differs from the spec's list, recorded in the Task 12 report and the spec): `placement_result` (a learner may retake the test; the latest `assessed` row wins in server code) and `roadmap` (versioned by `version`; old versions are kept).
- Produces: unique indexes listed below; SQL function `public.increment_usage(p_user_id text, p_period text, p_period_key text, p_owner uuid, p_amount int, p_limit int) returns json` returning `{ "ok": boolean, "used": number }` atomically (Plan 3's AI limit uses it).

- [ ] **Step 1: Write the failing test**

`tests/constraints.test.ts`:
```ts
import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";

const db = () => createClient(LOCAL_URL, localKeys().service);

describe("unique rules", () => {
  it("allows one learner_profile per user_id", async () => {
    const u = crypto.randomUUID();
    expect((await db().from("learner_profile").insert({ user_id: u })).error).toBeNull();
    expect((await db().from("learner_profile").insert({ user_id: u })).error?.code).toBe("23505");
  });
  it("allows one active request per tutor and start time, but a new request after a decline", async () => {
    const t = crypto.randomUUID(), start = "2026-11-02T23:00:00.000Z";
    expect((await db().from("booking").insert({ tutor_user_id: t, start_time_utc: start, status: "requested" })).error).toBeNull();
    expect((await db().from("booking").insert({ tutor_user_id: t, start_time_utc: start, status: "confirmed" })).error?.code).toBe("23505");
    await db().from("booking").update({ status: "declined" }).eq("tutor_user_id", t);
    expect((await db().from("booking").insert({ tutor_user_id: t, start_time_utc: start, status: "requested" })).error).toBeNull();
  });
  it("keeps app_setting keys unique", async () => {
    const k = "test_" + crypto.randomUUID();
    expect((await db().from("app_setting").insert({ key: k, value: "1" })).error).toBeNull();
    expect((await db().from("app_setting").insert({ key: k, value: "2" })).error?.code).toBe("23505");
  });
});

describe("increment_usage", () => {
  it("never lets 20 simultaneous requests exceed the limit", async () => {
    const u = crypto.randomUUID();
    const results = await Promise.all(Array.from({ length: 20 }, () =>
      db().rpc("increment_usage", { p_user_id: u, p_period: "day", p_period_key: "2026-10-14", p_owner: null, p_amount: 1, p_limit: 10 })));
    const ok = results.filter((r) => r.data?.ok).length;
    expect(ok).toBe(10);
    const { data } = await db().from("usage_counter").select("ai_messages").eq("user_id", u).single();
    expect(data!.ai_messages).toBe(10);
  });
});
```

- [ ] **Step 2: Run it to see it fail** — `bun test tests/constraints.test.ts`, Expected: FAIL (duplicates accepted; function missing).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261014000002_constraints.sql`:
```sql
-- One-per-learner and natural-key rules (spec section 4; S5, S7, S14, S22). Existing duplicates are counted in
-- spikes/readability-report.md and removed by the migration in Plan 4 before these rules see real data.
create unique index learner_profile_user_key on public.learner_profile (user_id) where user_id is not null;
create unique index usage_counter_period_key on public.usage_counter (user_id, period, period_key);
create unique index week_plan_active_week_key on public.week_plan (user_id, week_start_local) where status = 'active';
create unique index coach_note_day_key on public."ParleCoachNote" (user_id, local_date);
create unique index subscriber_user_key on public."Subscriber" (user_id) where user_id is not null;
create unique index app_setting_key on public.app_setting (key);
create unique index booking_live_slot_key on public.booking (tutor_user_id, start_time_utc) where status in ('requested', 'confirmed');
create unique index tutor_booking_settings_tutor_key on public.tutor_booking_settings (tutor_user_id);
create unique index identity_owner_key on public."ParleIdentity" (owner_id) where owner_id is not null;
create unique index profile_owner_key on public."ParleProfile" (owner_id) where owner_id is not null;

-- Atomic AI-message counter (S18): the row is locked, so concurrent calls queue instead of overshooting.
create or replace function public.increment_usage(p_user_id text, p_period text, p_period_key text, p_owner uuid, p_amount int, p_limit int)
returns json language plpgsql security definer set search_path = public as $$
declare v_used double precision;
begin
  insert into public.usage_counter (user_id, period, period_key, owner_id, ai_messages)
  values (p_user_id, p_period, p_period_key, p_owner, 0)
  on conflict (user_id, period, period_key) do nothing;
  select ai_messages into v_used from public.usage_counter
   where user_id = p_user_id and period = p_period and period_key = p_period_key for update;
  if coalesce(v_used, 0) + p_amount > p_limit then
    return json_build_object('ok', false, 'used', coalesce(v_used, 0));
  end if;
  update public.usage_counter set ai_messages = coalesce(ai_messages, 0) + p_amount
   where user_id = p_user_id and period = p_period and period_key = p_period_key;
  return json_build_object('ok', true, 'used', coalesce(v_used, 0) + p_amount);
end; $$;
revoke all on function public.increment_usage(text, text, text, uuid, int, int) from public, anon, authenticated;
```

- [ ] **Step 4: Apply and run the tests** — `bunx supabase db reset && bun test tests/constraints.test.ts`, Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
cd /d/AgentDevWork/repos/Parle && git add 07_Engineering/parle-backend && git commit -m "schema: unique rules (profile, bookings, usage, settings, coach note) and atomic usage counter"
```

---

### Task 9: Roles that only server code can set

**Files:**
- Create: `07_Engineering/parle-backend/supabase/migrations/20261014000003_roles.sql`
- Create: `07_Engineering/parle-backend/tests/helpers/users.ts`
- Test: `07_Engineering/parle-backend/tests/roles.test.ts`

**Interfaces:**
- Consumes: `LOCAL_URL`, `localKeys` (Task 6).
- Produces: SQL functions `public.app_role() returns text` (from `auth.jwt() -> 'app_metadata' ->> 'role'`, default `'learner'`) and `public.is_admin() returns boolean`; test helper `makeUser(role: "learner" | "tutor" | "admin"): Promise<{ id: string; email: string; client: SupabaseClient }>` that creates a confirmed user with the role in `app_metadata` (service role) and returns a client signed in as that user.

- [ ] **Step 1: Write the helper and the failing test**

`tests/helpers/users.ts`:
```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./local";

export async function makeUser(role: "learner" | "tutor" | "admin"): Promise<{ id: string; email: string; client: SupabaseClient }> {
  const admin = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
  const email = `t-${crypto.randomUUID()}@example.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role } });
  if (error) throw error;
  const client = createClient(LOCAL_URL, localKeys().anon, { auth: { persistSession: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  return { id: data.user.id, email, client };
}
```

`tests/roles.test.ts`:
```ts
import { describe, it, expect } from "bun:test";
import { makeUser } from "./helpers/users";

describe("roles", () => {
  it("reports the role from app_metadata", async () => {
    const t = await makeUser("tutor");
    expect((await t.client.rpc("app_role")).data).toBe("tutor");
    const a = await makeUser("admin");
    expect((await a.client.rpc("is_admin")).data).toBe(true);
  });
  it("does not let a user make themselves admin", async () => {
    const l = await makeUser("learner");
    await l.client.auth.updateUser({ data: { role: "admin" } }); // user_metadata, not app_metadata
    await l.client.auth.refreshSession();
    expect((await l.client.rpc("is_admin")).data).toBe(false);
    expect((await l.client.rpc("app_role")).data).toBe("learner");
  });
});
```

- [ ] **Step 2: Run it to see it fail** — `bun test tests/roles.test.ts`, Expected: FAIL (function not found).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261014000003_roles.sql`:
```sql
-- Roles live in auth.users.app_metadata.role, which only the service role (server code) can write (S3).
create or replace function public.app_role() returns text language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'learner');
$$;
create or replace function public.is_admin() returns boolean language sql stable as $$
  select public.app_role() = 'admin';
$$;
grant execute on function public.app_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
```

- [ ] **Step 4: Apply and test** — `bunx supabase db reset && bun test tests/roles.test.ts`, Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
cd /d/AgentDevWork/repos/Parle && git add 07_Engineering/parle-backend && git commit -m "schema: server-only roles (app_role, is_admin) with tests"
```

---

### Task 10: Access rules generated from a tier map

**Files:**
- Create: `07_Engineering/parle-backend/schema/access-tiers.json`
- Create: `07_Engineering/parle-backend/scripts/schema/generate-access-rules.ts`
- Create (generated): `07_Engineering/parle-backend/supabase/migrations/20261014000004_access_rules.sql`
- Test: `07_Engineering/parle-backend/tests/generate-access-rules.test.ts`

**Interfaces:**
- Consumes: tables (Task 7), roles (Task 9).
- Produces: `accessSql(table: string, tier: Tier): string` with `type Tier = { tier: "owner_read" } | { tier: "participant_read"; participantColumns: string[] } | { tier: "public_read"; condition: string } | { tier: "server_only" }`. Browser roles get SELECT only, as the tier allows; **no browser INSERT/UPDATE/DELETE on any app table** (writes go through Edge Functions with the service role, which bypasses these rules). Plan 2 must route the 7 direct browser writes found in the code (`ParleIdentity.create`, `ParleProfile.create/update`, `learner_profile.create/update`, `placement_result.create/update`) through functions.

- [ ] **Step 1: Write the tier map**

`schema/access-tiers.json`:
```json
{
  "ParleCoachNote": { "tier": "owner_read" },
  "ParleCompStatus": { "tier": "owner_read" },
  "ParleIdentity": { "tier": "owner_read" },
  "ParleProfile": { "tier": "owner_read" },
  "ParlePublicLevelCheckRun": { "tier": "server_only" },
  "Subscriber": { "tier": "owner_read" },
  "admin_audit_log": { "tier": "server_only" },
  "ai_message": { "tier": "owner_read" },
  "ai_session": { "tier": "owner_read" },
  "app_setting": { "tier": "server_only" },
  "availability_exception": { "tier": "owner_read" },
  "availability_rule": { "tier": "owner_read" },
  "booking": { "tier": "participant_read", "participantColumns": ["learner_user_id", "tutor_user_id"] },
  "checkin": { "tier": "owner_read" },
  "learner_profile": { "tier": "owner_read" },
  "learner_task": { "tier": "owner_read" },
  "milestone": { "tier": "owner_read" },
  "mistake_log": { "tier": "owner_read" },
  "placement_result": { "tier": "owner_read" },
  "practice_report": { "tier": "owner_read" },
  "prompt_item": { "tier": "server_only" },
  "question_item": { "tier": "server_only" },
  "roadmap": { "tier": "owner_read" },
  "skill_estimate": { "tier": "owner_read" },
  "topic_mastery": { "tier": "owner_read" },
  "tutor_application_review": { "tier": "owner_read" },
  "tutor_booking_settings": { "tier": "owner_read" },
  "tutor_document": { "tier": "owner_read" },
  "tutor_payout_country": { "tier": "owner_read" },
  "tutor_profile": { "tier": "owner_read" },
  "tutor_profile_public_edits": { "tier": "owner_read" },
  "tutor_public_profile": { "tier": "public_read", "condition": "is_published = true" },
  "tutor_review": { "tier": "public_read", "condition": "is_visible = true and coalesce(is_test_review, false) = false" },
  "tutor_review_reply": { "tier": "public_read", "condition": "true" },
  "usage_counter": { "tier": "owner_read" },
  "week_plan": { "tier": "owner_read" }
}
```

- [ ] **Step 2: Write the failing generator test**

`tests/generate-access-rules.test.ts`:
```ts
import { describe, it, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { accessSql } from "../scripts/schema/generate-access-rules";
import { ENTITY_DIR } from "../scripts/spikes/readability";

describe("accessSql", () => {
  it("owner_read lets the signed-in owner select only", () => {
    const s = accessSql("learner_task", { tier: "owner_read" });
    expect(s).toContain('alter table public."learner_task" enable row level security;');
    expect(s).toContain('revoke all on public."learner_task" from anon, authenticated;');
    expect(s).toContain('grant select on public."learner_task" to authenticated;');
    expect(s).toContain("using (owner_id = auth.uid())");
    expect(s).not.toMatch(/grant (insert|update|delete)/);
  });
  it("participant_read compares participant columns to the caller id as text", () => {
    expect(accessSql("booking", { tier: "participant_read", participantColumns: ["learner_user_id", "tutor_user_id"] }))
      .toContain('using (owner_id = auth.uid() or "learner_user_id" = auth.uid()::text or "tutor_user_id" = auth.uid()::text)');
  });
  it("public_read grants anon and authenticated with the condition", () => {
    const s = accessSql("tutor_public_profile", { tier: "public_read", condition: "is_published = true" });
    expect(s).toContain('grant select on public."tutor_public_profile" to anon, authenticated;');
    expect(s).toContain("using (is_published = true)");
  });
  it("server_only grants nothing", () => {
    const s = accessSql("question_item", { tier: "server_only" });
    expect(s).not.toContain("grant");
    expect(s).not.toContain("create policy");
  });
  it("the tier map covers every entity exactly once", () => {
    const map = JSON.parse(readFileSync(`${import.meta.dir}/../schema/access-tiers.json`, "utf8"));
    const names = readdirSync(ENTITY_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", "")).sort();
    expect(Object.keys(map).sort()).toEqual(names);
  });
});
```

- [ ] **Step 3: Run it to see it fail** — `bun test tests/generate-access-rules.test.ts`, Expected: FAIL, module not found.

- [ ] **Step 4: Implement**

`scripts/schema/generate-access-rules.ts`:
```ts
import { readFileSync, writeFileSync } from "node:fs";

export type Tier =
  | { tier: "owner_read" }
  | { tier: "participant_read"; participantColumns: string[] }
  | { tier: "public_read"; condition: string }
  | { tier: "server_only" };

export function accessSql(table: string, t: Tier): string {
  const q = `public."${table}"`;
  const lines = [`alter table ${q} enable row level security;`, `revoke all on ${q} from anon, authenticated;`];
  if (t.tier === "owner_read") {
    lines.push(`grant select on ${q} to authenticated;`, `create policy "${table}: owner reads" on ${q} for select to authenticated using (owner_id = auth.uid());`);
  } else if (t.tier === "participant_read") {
    const cond = ["owner_id = auth.uid()", ...t.participantColumns.map((c) => `"${c}" = auth.uid()::text`)].join(" or ");
    lines.push(`grant select on ${q} to authenticated;`, `create policy "${table}: participants read" on ${q} for select to authenticated using (${cond});`);
  } else if (t.tier === "public_read") {
    lines.push(`grant select on ${q} to anon, authenticated;`, `create policy "${table}: public reads" on ${q} for select to anon, authenticated using (${t.condition});`);
  }
  return lines.join("\n");
}

if (import.meta.main) {
  const map: Record<string, Tier> = JSON.parse(readFileSync(`${import.meta.dir}/../../schema/access-tiers.json`, "utf8"));
  const body = Object.keys(map).sort().map((t) => accessSql(t, map[t])).join("\n\n");
  writeFileSync(`${import.meta.dir}/../../supabase/migrations/20261014000004_access_rules.sql`,
    `-- Generated by scripts/schema/generate-access-rules.ts from schema/access-tiers.json. Do not edit by hand.\n-- Browser roles never write app tables; Edge Functions write with the service role (spec section 4).\n\n${body}\n`);
  console.log("wrote 20261014000004_access_rules.sql");
}
```

- [ ] **Step 5: Generate, apply, run** — `bun scripts/schema/generate-access-rules.ts && bunx supabase db reset && bun test tests/generate-access-rules.test.ts`, Expected: 5 pass.

- [ ] **Step 6: Commit**

```bash
cd /d/AgentDevWork/repos/Parle && git add 07_Engineering/parle-backend && git commit -m "schema: row-level access rules generated from the tier map (browser read-only)"
```

---

### Task 11: Access-rule tests against the running database

**Files:**
- Test: `07_Engineering/parle-backend/tests/access-rules.test.ts`

**Interfaces:**
- Consumes: `makeUser` (Task 9), `LOCAL_URL`, `localKeys` (Task 6), access rules (Task 10).

- [ ] **Step 1: Write the tests**

`tests/access-rules.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";

const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const anon = () => createClient(LOCAL_URL, localKeys().anon, { auth: { persistSession: false } });
let A: Awaited<ReturnType<typeof makeUser>>, B: Awaited<ReturnType<typeof makeUser>>, T: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  [A, B, T] = await Promise.all([makeUser("learner"), makeUser("learner"), makeUser("tutor")]);
  const s = service();
  await s.from("learner_task").insert([
    { owner_id: A.id, user_id: "shared-text", skill: "reading", minutes: 10 },
    { owner_id: B.id, user_id: "shared-text", skill: "speaking", minutes: 10 },
  ]);
  await s.from("question_item").insert({ owner_id: null });
  await s.from("tutor_public_profile").insert([{ owner_id: T.id, display_name: "Pub", is_published: true }, { owner_id: T.id, display_name: "Draft", is_published: false }]);
  await s.from("booking").insert({ owner_id: A.id, learner_user_id: A.id, tutor_user_id: T.id, start_time_utc: `2026-12-0${Math.floor(Math.random() * 9) + 1}T10:00:00Z`, status: "requested" });
});

describe("owner_read", () => {
  it("a learner sees only their own task even when user_id text matches another learner's", async () => {
    const { data } = await A.client.from("learner_task").select("skill").eq("user_id", "shared-text");
    expect(data).toEqual([{ skill: "reading" }]);
  });
  it("a learner cannot insert, update or delete their own task from the browser", async () => {
    expect((await A.client.from("learner_task").insert({ owner_id: A.id, minutes: 5 })).error).not.toBeNull();
    await A.client.from("learner_task").update({ minutes: 999 }).eq("owner_id", A.id);
    const { data } = await service().from("learner_task").select("minutes").eq("owner_id", A.id);
    expect(data!.every((r) => r.minutes === 10)).toBe(true);
  });
});

describe("server_only", () => {
  it("nobody in the browser can read the question bank", async () => {
    expect((await A.client.from("question_item").select("id")).data ?? []).toEqual([]);
    expect((await anon().from("question_item").select("id")).data ?? []).toEqual([]);
  });
});

describe("public_read", () => {
  it("signed-out visitors see published tutor profiles only", async () => {
    const { data } = await anon().from("tutor_public_profile").select("display_name").eq("owner_id", T.id);
    expect(data).toEqual([{ display_name: "Pub" }]);
  });
  it("signed-out visitors cannot read private learner tables", async () => {
    expect((await anon().from("learner_task").select("id")).data ?? []).toEqual([]);
  });
});

describe("participant_read", () => {
  it("the booked tutor and the learner both see the booking; another learner does not", async () => {
    expect(((await A.client.from("booking").select("id").eq("tutor_user_id", T.id)).data ?? []).length).toBe(1);
    expect(((await T.client.from("booking").select("id").eq("tutor_user_id", T.id)).data ?? []).length).toBe(1);
    expect(((await B.client.from("booking").select("id").eq("tutor_user_id", T.id)).data ?? []).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run them** — `bun test tests/access-rules.test.ts`, Expected: 7 pass. A failure means the tier map or generator is wrong; fix there (never hand-edit the generated migration), regenerate, `db reset`, re-run.

- [ ] **Step 3: Run the whole suite** — `bun test`, Expected: every test from Tasks 1-11 passes.

- [ ] **Step 4: Run Supabase's own checks** — `bunx supabase db lint --level warning`, Expected: no errors; list any warning with a one-line reason in the Task 12 report.

- [ ] **Step 5: Commit**

```bash
cd /d/AgentDevWork/repos/Parle && git add 07_Engineering/parle-backend && git commit -m "tests: access rules (owner, participant, public, server-only) against local staging"
```

---

### Task 12: Phase report and hand-over to Plan 2

**Files:**
- Create: `06_Build/export-decoupling/plans/2026-10-14-plan-1-report.md`
- Modify: `HANDOFF.md` (section 4), `06_Build/export-decoupling/specs/SPEC-BACKLOG.md` (no change unless a spike moved scope), `06_Build/export-decoupling/security-debt.md` (mark S3, S7, S9, S12, S17, S19, S22, S23 "addressed in schema, Plan 1" where the tests prove it)

- [ ] **Step 1: Write the report**

`plan-1-report.md`: one paragraph per spike with its decision (readability: per-account export enough or fallback needed for which entities; filter semantics: mismatches Plan 2 must handle; NVIDIA: candidate models and the founder's pending choice; local Supabase: memory and start time); schema status (36 tables, constraints, roles, access rules, test count); the 7 direct browser writes Plan 2 must move to functions; duplicates that Plan 4 must clean; anything that changes the spec, with the spec edited to match.

- [ ] **Step 2: Stop the local stack** — `cd 07_Engineering/parle-backend && bunx supabase stop`

- [ ] **Step 3: Update HANDOFF.md** with the Plan 1 outcome and "next: write Plan 2 (compatibility layer + auth + Resend)".

- [ ] **Step 4: Commit**

```bash
cd /d/AgentDevWork/repos/Parle && git add -A && git commit -m "backend plan 1: spikes and schema complete; report and hand-over to plan 2"
```
