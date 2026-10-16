# Plan 10: production AI providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before launch, no Parle request goes to NVIDIA's trial API: text AI runs through OpenRouter on zero-retention
hosts with a model the founder picks from a quality test, speech-to-text runs on Deepgram (training opt-out on every
request), read-aloud runs on Azure in Canada with a Canadian French voice, the minimum age is 18, and the privacy page
names the providers.

**Architecture:**
- **Text AI (Supabase functions).** A new pure module `_shared/ai-provider.ts` builds and sends chat requests to
  OpenRouter (or NVIDIA, kept for local comparison only); keys and `fetch` are passed in, so the quality-test script
  sends exactly the production request. `_shared/ai.ts` picks the route from the model setting: `openrouter:<id>` goes to
  OpenRouter, a value without a prefix to NVIDIA. Everything around the call (schema check and one retry, time budgets,
  daily caps, the fake provider) is unchanged.
- **Speech (the Vercel relay `api/voice`).** Two new provider files: `deepgram.ts` (speech to text) and `azure.ts`
  (text to speech, raw 22,050 Hz PCM, the relay's existing rate). `providerFor()` combines them as `deepgram-azure`;
  NVIDIA becomes selectable only off Vercel with `VOICE_PROVIDER=nvidia`.
- **App.** Wording only: 18+ at sign-up, the privacy page's voice paragraph and a new AI paragraph.
- **Rollout.** Code first (still on NVIDIA in production), then the founder switches the model setting and adds the
  speech keys, then the NVIDIA key is removed everywhere.

**Tech Stack:** Bun (bun:test backend; app and relay tests in node:test style run by `bun run test`), Supabase (local
Docker stack, Edge Functions on Deno), Vercel Node functions (Web `Request`/`Response`), OpenRouter chat completions,
Deepgram `/v1/listen` (Nova-3), Azure AI Speech REST (`cognitiveservices/v1`), React + Vite app, Playwright from the
gstack install for the browser checks, Supabase MCP for read-only production checks.

**Spec:** `06_Build/export-decoupling/specs/2026-10-16-plan-10-production-ai-providers-design.md` (all sections),
decision #58, the provider comparison `spikes/provider-comparison-2026-10-16.md`. Conventions, helpers and quirks:
`plans/2026-10-16-plan-9-voice.md` and its report (Global Constraints there apply here too).

## Before you start (founder steps, in the order they are needed)

1. **Task 0:** Docker Desktop running (local Supabase staging).
2. **Task 1:** create the three accounts and save the keys (Claude opens an empty Notepad file per key):
   OpenRouter (buy $20 credit; Settings > Privacy: training providers off, zero data retention on if offered; give the
   key a credit limit), Deepgram (the $200 sign-up credit), Azure (a Speech resource in Canada Central, tier S0).
3. **Task 3, Step 5:** read the quality-test report and pick the text model.
4. **Task 8, Step 5:** approve or change the privacy wording. Nothing is deployed before this.
5. **Task 10:** upload `OPENROUTER_API_KEY` to Supabase and the speech keys to Vercel (`!` commands Claude gives you),
   then run the one-line model switch.
6. **Task 11, Step 4:** remove `NVIDIA_API_KEY` from Supabase and Vercel (`!` commands), after the live checks pass.

## Global Constraints

- Every OpenRouter request carries `provider: { data_collection: "deny", zdr: true, allow_fallbacks: true }` (spec 3).
- Every Deepgram request carries `mip_opt_out=true` (spec 4).
- A provider's error body is never logged (it can repeat the learner's words); log the provider, model and HTTP status
  only. Keys are never printed, logged or committed (secrets live in `C:\Users\AgentDev\.parle-secrets\`).
- Read-aloud pieces stay at most 400 characters; transcription parts stay at most 60 s; the 30 s provider timeout and
  "Voice is busy" are unchanged.
- Read-aloud limits unchanged: Free 20 a day, Premium 200. Minimum age 18.
- No em dashes in new wording. Wording changes on public pages go to the founder before deploy.
- The founder runs production settings uploads and the model switch as `!` commands; Claude never uses `--prod` for the
  app; Stripe stays in the sandbox.
- No database migration in this plan (the model lives in `app_setting` values).
- Baselines to keep: backend `0 fail`, app `0 fail`, app type errors the same list as Task 0 (normalized as in Plan 9).

## Review Focus

1. **A provider error whose body repeats the prompt** (OpenRouter 400/500, Deepgram or Azure errors): the learner sees
   the usual "not available" or "Voice is busy", and the log line holds no learner text and no key (Tasks 2, 4, 5).
2. **No zero-retention host for the chosen model, or OpenRouter out of credit (402/404):** `AI_UNAVAILABLE` and a log
   line naming the model and status; never a crash or a silent fallback to a host that keeps data (Task 2).
3. **Text read aloud containing XML characters** (`&`, `<`, `>`, quotes, apostrophes such as "C'est l'été & <b>"): the
   SSML is escaped and Azure is never sent broken markup (Task 5).
4. **Silence or a non-speech recording:** Deepgram returns an empty transcript and the existing "We couldn't hear
   enough" path runs, without spending a scoring call (Task 4).
5. **Deepgram out of credit (402):** "Voice is busy" for the learner and a log line saying out of credit, so the
   administrator can see why (Task 4).

---

### Task 0: Branch and baseline

**Files:** none changed.

- [ ] **Step 1: Branch from `main`.**

```bash
cd D:/AgentDevWork/repos/Parle
git checkout main && git pull --ff-only
git log --oneline -3 main
git checkout -b plan-10-ai-providers
```

Expected: the log shows `61dbf38 docs: Plan 10 spec uses OpenRouter for text AI (founder)` or later;
`Switched to a new branch 'plan-10-ai-providers'`.

- [ ] **Step 2: Local stack.** Ask the founder to start Docker Desktop, then:

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-backend
bunx supabase start -x imgproxy,vector,logflare,supavisor
bunx supabase migration up
bun scripts/setup-local-functions-env.ts
```

Expected: `Local database is up to date.`; `wrote SUPERDEV_APP_ID, ...` (names only). A first `HealthCheckTimeout`
while Docker warms up: run `start` again. Start `bunx supabase functions serve` in the background.

- [ ] **Step 3: Baselines.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-backend && docker exec supabase_db_parle-staging psql -U postgres -c "delete from public.stripe_test_fail" && bun test 2>&1 | tail -4
cd ../parle-app && bun run test 2>&1 | grep -E "^ [0-9]+ (pass|fail)"
bunx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "error TS" | sed -E 's/\([0-9]+,[0-9]+\)//; s/\| \.\.\. [0-9]+ more \.\.\. \|//' | sed -E "s/: error (TS[0-9]+): (.{0,90}).*/ \1 \2/" | sort > <workspace>/tsc-baseline.txt; wc -l < <workspace>/tsc-baseline.txt
bunx tsc --noEmit -p tsconfig.api.json 2>&1 | grep -c "error TS"
```

Expected: backend `507 pass`, `1 skip`, `0 fail`; app `495 pass`, `0 fail`; `62` app type errors; relay `0`. A lone 502
or 5 s timeout from the local edge runtime: run that file again once. Record the numbers in the ledger.

---

### Task 1: Founder accounts and keys

**Files:** none in the repo. Three new secret files.

- [ ] **Step 1: Create empty secret files and open them (nothing printed).**

```bash
for k in OPENROUTER_API_KEY DEEPGRAM_API_KEY AZURE_SPEECH_KEY; do f=C:/Users/AgentDev/.parle-secrets/$k; test -e $f || : > $f; done
```

```powershell
foreach ($k in "OPENROUTER_API_KEY","DEEPGRAM_API_KEY","AZURE_SPEECH_KEY") { Start-Process notepad -ArgumentList "`"C:\Users\AgentDev\.parle-secrets\$k`"" }
```

Tell the founder: "Three Notepad windows are open, one per key, each titled with its name. Paste only the key itself
(no name, no `=`), save, close. OpenRouter: openrouter.ai > Keys > Create key (credit limit $50). Deepgram:
console.deepgram.com > API Keys > Create (Member role is enough). Azure: portal.azure.com > Create a resource > Speech,
region **Canada Central**, pricing tier **Standard S0**; then Keys and Endpoint > KEY 1. Also on OpenRouter: Settings >
Privacy: turn off 'providers that may train', turn on zero data retention if offered."

- [ ] **Step 2: Check presence and shape only.**

```bash
for k in OPENROUTER_API_KEY DEEPGRAM_API_KEY AZURE_SPEECH_KEY; do f=C:/Users/AgentDev/.parle-secrets/$k; printf "%s %s %s\n" $k "$(test -s $f && echo present || echo missing)" "$(tr -d '\r\n' < $f | wc -c)"; done
head -c 6 C:/Users/AgentDev/.parle-secrets/OPENROUTER_API_KEY | grep -c "sk-or-"
```

Expected: three `present` lines with lengths above 20; `1` (OpenRouter keys start `sk-or-`). Never print a key.
If the founder pasted `NAME=value`, the readers strip it (`readSecret` does); no action.

- [ ] **Step 3: Ledger** `Task 1: complete (three keys present; values never printed)`.

---

### Task 2: The OpenRouter text call

**Files:**
- Create: `07_Engineering/parle-backend/supabase/functions/_shared/ai-provider.ts`
- Modify: `07_Engineering/parle-backend/supabase/functions/_shared/ai.ts` (the `nvidia()` function and its call)
- Modify: `07_Engineering/parle-backend/scripts/setup-local-functions-env.ts` (`SECRETS`)
- Test: `07_Engineering/parle-backend/tests/ai-provider.test.ts` (new), `tests/ai.test.ts` (two cases added)

**Interfaces:**
- Produces: `routeModel(setting: string): { provider: "openrouter" | "nvidia"; model: string }`;
  `openrouterBody(c: ChatCall): Record<string, unknown>`; `chatOpenRouter(key, c, fetchImpl?) => Promise<string>`;
  `chatNvidia(key, c, fetchImpl?) => Promise<string>`; `class ProviderCallError { status: number | "network" | "empty" }`;
  `type ChatCall = { model: string; system: string; prompt: string; json: boolean; signal?: AbortSignal }`;
  `ZERO_RETENTION`; in `ai.ts`: `export async function providerCall(model: string, system: string, prompt: string, json: boolean, signal: AbortSignal): Promise<string>`.
- Consumed by: Task 3 (the quality-test script), Task 10 (the model setting value `openrouter:<id>`).

- [ ] **Step 1: Write the failing tests** `tests/ai-provider.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { chatOpenRouter, openrouterBody, ProviderCallError, routeModel, ZERO_RETENTION, OPENROUTER_URL } from "../supabase/functions/_shared/ai-provider";

const call = (over: Partial<{ model: string; json: boolean }> = {}) => ({ model: "google/gemma-4-31b-it", system: "sys", prompt: "Bonjour", json: false, ...over });
type Seen = { url: string; init: RequestInit };
function fakeFetch(status: number, body: unknown, seen: Seen[] = []) {
  return (async (url: string, init: RequestInit) => { seen.push({ url, init }); return new Response(typeof body === "string" ? body : JSON.stringify(body), { status }); }) as unknown as typeof fetch;
}

describe("model routing (spec 3)", () => {
  it("openrouter:<id> goes to OpenRouter; a value without a prefix stays NVIDIA (local comparison only)", () => {
    expect(routeModel("openrouter:openai/gpt-6-luna")).toEqual({ provider: "openrouter", model: "openai/gpt-6-luna" });
    expect(routeModel(" openrouter:google/gemma-4-31b-it ")).toEqual({ provider: "openrouter", model: "google/gemma-4-31b-it" });
    expect(routeModel("nvidia/nemotron-3-super-120b-a12b")).toEqual({ provider: "nvidia", model: "nvidia/nemotron-3-super-120b-a12b" });
  });
});

describe("the OpenRouter request", () => {
  it("always asks for hosts that collect nothing and keep nothing, for plain and JSON calls", () => {
    expect(ZERO_RETENTION).toEqual({ data_collection: "deny", zdr: true, allow_fallbacks: true });
    expect(openrouterBody(call()).provider).toEqual(ZERO_RETENTION);
    expect(openrouterBody(call({ json: true })).provider).toEqual(ZERO_RETENTION);
  });
  it("asks for JSON only on JSON calls, and leaves out temperature for OpenAI and Anthropic models", () => {
    expect(openrouterBody(call({ json: true })).response_format).toEqual({ type: "json_object" });
    expect(openrouterBody(call()).response_format).toBeUndefined();
    expect(openrouterBody(call()).temperature).toBe(0.3);
    expect(openrouterBody(call({ model: "openai/gpt-6-luna" })).temperature).toBeUndefined();
    expect(openrouterBody(call({ model: "anthropic/claude-haiku-5.5" })).temperature).toBeUndefined();
  });
  it("posts to OpenRouter with the key, Parle's referer and title, and returns the reply text", async () => {
    const seen: Seen[] = [];
    const text = await chatOpenRouter("sk-or-test", call(), fakeFetch(200, { choices: [{ message: { content: "Salut" } }] }, seen));
    expect(text).toBe("Salut");
    expect(seen[0].url).toBe(OPENROUTER_URL);
    const h = seen[0].init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer sk-or-test");
    expect(h["HTTP-Referer"]).toBe("https://parle.buzz");
    expect(h["X-Title"]).toBe("Parle");
    expect(JSON.parse(String(seen[0].init.body)).messages).toEqual([{ role: "system", content: "sys" }, { role: "user", content: "Bonjour" }]);
  });
  it("an error answer, an empty reply and no network are ProviderCallErrors with the status only", async () => {
    await expect(chatOpenRouter("k", call(), fakeFetch(404, { error: { message: "No endpoints found matching your data policy: Bonjour" } }))).rejects.toMatchObject({ status: 404 });
    await expect(chatOpenRouter("k", call(), fakeFetch(402, "Insufficient credits"))).rejects.toMatchObject({ status: 402 });
    await expect(chatOpenRouter("k", call(), fakeFetch(200, { choices: [{ message: { content: "  " } }] }))).rejects.toMatchObject({ status: "empty" });
    await expect(chatOpenRouter("k", call(), (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch)).rejects.toBeInstanceOf(ProviderCallError);
  });
});
```

Append to `tests/ai.test.ts` (Review Focus 1 and 2):

```ts
import { providerCall } from "../supabase/functions/_shared/ai";

describe("the provider call (Plan 10)", () => {
  it("a provider error is AI_UNAVAILABLE and the log line holds no learner text and no key", async () => {
    const realFetch = globalThis.fetch, realWarn = console.warn;
    const lines: string[] = [];
    process.env.OPENROUTER_API_KEY = "sk-or-secret-test";
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: "bad request: Je m'appelle Leïla" } }), { status: 400 })) as unknown as typeof fetch;
    console.warn = (...args: unknown[]) => { lines.push(JSON.stringify(args)); };
    try {
      await expect(providerCall("openrouter:openai/gpt-6-luna", "sys", "Je m'appelle Leïla", false, new AbortController().signal)).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    } finally { globalThis.fetch = realFetch; console.warn = realWarn; delete process.env.OPENROUTER_API_KEY; }
    expect(lines.join(" ")).toContain("openai/gpt-6-luna");
    expect(lines.join(" ")).toContain("400");
    expect(lines.join(" ")).not.toContain("Leïla");
    expect(lines.join(" ")).not.toContain("sk-or-secret-test");
  });
  it("without the OpenRouter key the call is AI_NOT_CONFIGURED", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(providerCall("openrouter:openai/gpt-6-luna", "sys", "p", false, new AbortController().signal)).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
  });
});
```

- [ ] **Step 2: Run them to see them fail.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-backend && bun test tests/ai-provider.test.ts tests/ai.test.ts 2>&1 | grep -E "^\(fail\)|error:|^ [0-9]+ (pass|fail)" | head -12
```

Expected: FAIL: `Cannot find module '../supabase/functions/_shared/ai-provider'` and `providerCall` not exported.

- [ ] **Step 3: Write `_shared/ai-provider.ts`.**

```ts
/**
 * Text AI providers (Plan 10, spec 3). Pure: the key and fetch are passed in, so the quality-test script sends exactly
 * the production request. Errors carry the HTTP status only: a provider's error body can repeat the learner's words.
 */
export type ChatCall = { model: string; system: string; prompt: string; json: boolean; signal?: AbortSignal };
export type Route = { provider: "openrouter" | "nvidia"; model: string };

export class ProviderCallError extends Error {
  status: number | "network" | "empty";
  constructor(status: number | "network" | "empty") { super(`AI provider ${status}`); this.status = status; this.name = "ProviderCallError"; }
}

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
/** Every OpenRouter request: only hosts that collect nothing and keep nothing; another such host if one is down. */
export const ZERO_RETENTION = { data_collection: "deny", zdr: true, allow_fallbacks: true } as const;

/** `openrouter:<id>` goes to OpenRouter; a value without a prefix is an NVIDIA model (local comparison only). */
export function routeModel(setting: string): Route {
  const value = setting.trim();
  return value.startsWith("openrouter:") ? { provider: "openrouter", model: value.slice("openrouter:".length) } : { provider: "nvidia", model: value };
}

/** OpenAI's and Anthropic's current models refuse a temperature (OpenRouter's catalogue, 2026-10-16). */
export function acceptsTemperature(model: string): boolean {
  return !/^(openai|anthropic)\//.test(model);
}

const messages = (c: ChatCall) => [{ role: "system", content: c.system }, { role: "user", content: c.prompt }];

export function openrouterBody(c: ChatCall): Record<string, unknown> {
  return {
    model: c.model,
    messages: messages(c),
    max_tokens: 4096,
    ...(acceptsTemperature(c.model) ? { temperature: 0.3 } : {}),
    ...(c.json ? { response_format: { type: "json_object" } } : {}),
    reasoning: { effort: "low", exclude: true }, // ignored by models without reasoning
    provider: ZERO_RETENTION,
  };
}

async function post(url: string, key: string, body: unknown, signal: AbortSignal | undefined, headers: Record<string, string>, fetchImpl: typeof fetch): Promise<string> {
  const r = await fetchImpl(url, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal }).catch(() => null);
  if (!r) throw new ProviderCallError("network");
  if (!r.ok) { await r.body?.cancel().catch(() => undefined); throw new ProviderCallError(r.status); }
  const data: any = await r.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new ProviderCallError("empty");
  return text;
}

export function chatOpenRouter(key: string, c: ChatCall, fetchImpl: typeof fetch = fetch): Promise<string> {
  return post(OPENROUTER_URL, key, openrouterBody(c), c.signal, { "HTTP-Referer": "https://parle.buzz", "X-Title": "Parle" }, fetchImpl);
}

export function chatNvidia(key: string, c: ChatCall, fetchImpl: typeof fetch = fetch): Promise<string> {
  return post(NVIDIA_URL, key, { model: c.model, messages: messages(c), temperature: 0.3, max_tokens: 4096 }, c.signal, {}, fetchImpl);
}
```

- [ ] **Step 4: Route `ai.ts` through it.** Add the import after `import { takeRateLimit } from "./rate-limit.ts";`:

```ts
import { chatNvidia, chatOpenRouter, ProviderCallError, routeModel } from "./ai-provider.ts";
```

Delete the line `const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";` and replace the whole
`async function nvidia(...) { ... }` with:

```ts
/** One provider call (Plan 10): OpenRouter for `openrouter:<id>`, NVIDIA otherwise (local comparison only). */
export async function providerCall(model: string, system: string, prompt: string, json: boolean, signal: AbortSignal): Promise<string> {
  const route = routeModel(model);
  const key = Deno.env.get(route.provider === "openrouter" ? "OPENROUTER_API_KEY" : "NVIDIA_API_KEY");
  if (!key) throw new AiError("AI_NOT_CONFIGURED");
  try {
    const c = { model: route.model, system, prompt, json, signal };
    return route.provider === "openrouter" ? await chatOpenRouter(key, c) : await chatNvidia(key, c);
  } catch (e) {
    // provider, model and status only: an error body can repeat the learner's words
    console.warn("AI call failed", { provider: route.provider, model: route.model, status: e instanceof ProviderCallError ? e.status : "network" });
    throw new AiError("AI_UNAVAILABLE");
  }
}
```

and in `completeJson` replace `nvidia(model, system, req.prompt, controller.signal)` with
`providerCall(model, system, req.prompt, Boolean(req.schema), controller.signal)`.

In `scripts/setup-local-functions-env.ts` change
`const SECRETS = ["NVIDIA_API_KEY", "RESEND_API_KEY", "STRIPE_SECRET_KEY"];` to
`const SECRETS = ["NVIDIA_API_KEY", "OPENROUTER_API_KEY", "RESEND_API_KEY", "STRIPE_SECRET_KEY"];`.

- [ ] **Step 5: Run the tests.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-backend && bun test tests/ai-provider.test.ts tests/ai.test.ts tests/local-setup.test.ts 2>&1 | grep -E "^\(fail\)|^ [0-9]+ (pass|fail)"
grep -rn "nvidia(" supabase/functions/_shared/ai.ts | wc -l
```

Expected: all pass, `0 fail`; `0` (no call to the old function is left).

- [ ] **Step 6: Commit.**

```bash
cd D:/AgentDevWork/repos/Parle
git add 07_Engineering/parle-backend/supabase/functions/_shared/ai-provider.ts 07_Engineering/parle-backend/supabase/functions/_shared/ai.ts 07_Engineering/parle-backend/scripts/setup-local-functions-env.ts 07_Engineering/parle-backend/tests/ai-provider.test.ts 07_Engineering/parle-backend/tests/ai.test.ts
git commit -m "feat(ai): OpenRouter on zero-retention hosts behind the model setting (openrouter:<id>)"
```

---

### Task 3: The quality test, and the founder's pick

**Files:**
- Create: `07_Engineering/parle-backend/scripts/lib/bakeoff-prompts.ts` (the four prompts and two schemas moved out of
  `ai-bakeoff.ts`, plus three new prompts)
- Modify: `07_Engineering/parle-backend/scripts/ai-bakeoff.ts` (imports the moved prompts; no behaviour change)
- Create: `07_Engineering/parle-backend/scripts/ai-bakeoff-openrouter.ts`
- Create (output): `06_Build/export-decoupling/spikes/ai-bakeoff-openrouter-report.md`
- Modify: `07_Engineering/parle-backend/supabase/functions/_shared/ai.ts` (`DEFAULTS`, after the pick)

**Interfaces:**
- Consumes: `chatOpenRouter`, `ProviderCallError` (Task 2); `extractJson`, `validateJson` (`ai.ts`);
  `SPEAKING_SCHEMA`, `speakingPrompt` (`_shared/voice/speaking.ts`).
- Produces: the founder's model id `<PICK>` (for example `openai/gpt-6-luna`), used as `openrouter:<PICK>` in Tasks 8
  and 10.

- [ ] **Step 1: Move the prompts.** Create `scripts/lib/bakeoff-prompts.ts` by moving, unchanged, `WRITING_SCHEMA`,
  `LESSON_SCHEMA`, `writingPrompt()` and `PROMPTS` out of `scripts/ai-bakeoff.ts` (prefix each with `export`); in
  `ai-bakeoff.ts` add `import { PROMPTS } from "./lib/bakeoff-prompts";` and delete the moved lines. Then append to
  `bakeoff-prompts.ts`:

```ts
import { SPEAKING_SCHEMA, speakingPrompt } from "../../supabase/functions/_shared/voice/speaking";

const TRANSCRIPT = "Le week-end dernier je suis allé au marché avec ma sœur, nous avons acheté des légumes et du pain, après nous avons pris un café sur la terrasse parce que il faisait très beau.";

/** Plan 10: the production tasks the old bake-off did not cover. */
export const EXTRA_PROMPTS = [
  {
    name: "Arabic explanation (plain text)",
    schema: null,
    prompt: "Explain to an Arabic-speaking A2 learner of French, in Arabic, the difference between 'depuis' and 'pendant'. Give two short French examples with Arabic translations. Keep it under 150 words.",
  },
  {
    name: "Tutor reply at A2 (plain text, French)",
    schema: null,
    prompt: "You are Parle's French tutor. The learner (A2) wrote: \"Hier je suis allé au cinéma avec mon ami et nous avons vu un film très drôle.\" Reply in simple French in two or three sentences: react to what they said and ask one follow-up question.",
  },
  {
    name: "Speaking score from a transcript (JSON)",
    schema: SPEAKING_SCHEMA,
    prompt: speakingPrompt({ prompt: "Racontez votre dernier week-end.", transcript: TRANSCRIPT, words: TRANSCRIPT.split(/\s+/).length, durationMs: 15_000, language: "English", typed: false }),
  },
];
```

- [ ] **Step 2: Write `scripts/ai-bakeoff-openrouter.ts`.**

```ts
import { writeFileSync } from "node:fs";
import { readSecret } from "./lib/secrets";
import { PROMPTS, EXTRA_PROMPTS } from "./lib/bakeoff-prompts";
import { chatOpenRouter, ProviderCallError } from "../supabase/functions/_shared/ai-provider";
import { extractJson, validateJson } from "../supabase/functions/_shared/ai";

/**
 * Plan 10 quality test: the same production request (zero-retention routing) for each candidate, every task three
 * times, so the founder picks the text model from real answers and times. The key is never printed.
 */
const CANDIDATES = ["openai/gpt-6-luna", "anthropic/claude-haiku-5.5", "google/gemini-3.1-flash-lite", "nvidia/nemotron-3-super-120b-a12b", "google/gemma-4-31b-it"];
const RUNS = 3;
const REPORT = `${import.meta.dir}/../../../06_Build/export-decoupling/spikes/ai-bakeoff-openrouter-report.md`;
const key = readSecret("OPENROUTER_API_KEY");
const tasks = [...PROMPTS, ...EXTRA_PROMPTS];

type Row = { model: string; task: string; run: number; seconds: number; ok: string; text: string };
const rows: Row[] = [];
for (const model of CANDIDATES) {
  for (const t of tasks) {
    for (let run = 1; run <= RUNS; run++) {
      const system = t.schema ? `Reply with exactly one JSON value that matches this JSON schema, and nothing else:\n${JSON.stringify(t.schema)}` : "You are Parle's French tutor. Reply in plain text.";
      const started = Date.now();
      let text = "", ok = "";
      try {
        text = await chatOpenRouter(key, { model, system, prompt: t.prompt, json: Boolean(t.schema), signal: AbortSignal.timeout(120_000) });
        if (t.schema) {
          const value = extractJson(text);
          const problems = value === null ? ["not JSON"] : validateJson(value, t.schema);
          ok = problems.length ? `invalid (${problems.slice(0, 2).join("; ")})` : "valid";
        } else ok = "text";
      } catch (e) {
        ok = e instanceof ProviderCallError ? `error ${e.status}` : `error (${(e as Error).name})`;
      }
      const seconds = Math.round((Date.now() - started) / 100) / 10;
      rows.push({ model, task: t.name, run, seconds, ok, text: text.slice(0, 1200) });
      console.log(`${model} | ${t.name} | run ${run} | ${seconds}s | ${ok}`);
    }
  }
}

const cell = (model: string, task: string) => {
  const rs = rows.filter((r) => r.model === model && r.task === task);
  const good = rs.filter((r) => r.ok === "valid" || r.ok === "text").length;
  const times = rs.map((r) => r.seconds).sort((a, b) => a - b);
  return `${good}/${rs.length} ok, median ${times[Math.floor(times.length / 2)]}s, max ${times[times.length - 1]}s`;
};
const table = ["| model | " + tasks.map((t) => t.name).join(" | ") + " |", "|---|" + tasks.map(() => "---").join("|") + "|"];
for (const model of CANDIDATES) table.push(`| ${model} | ` + tasks.map((t) => cell(model, t.name)).join(" | ") + " |");
const answers = rows.filter((r) => r.run === 1).map((r) => [`### ${r.model} - ${r.task}`, `${r.seconds} s, ${r.ok}`, "", "```", r.text, "```", ""].join("\n"));
const errors = rows.filter((r) => r.ok.startsWith("error")).map((r) => `- ${r.model}, ${r.task}, run ${r.run}: ${r.ok}`);
writeFileSync(REPORT, [
  "# AI quality test through OpenRouter (Plan 10, Task 3)", "",
  `Date: ${new Date().toISOString().slice(0, 10)}. Production request (zero-retention routing: data_collection deny, zdr true). ${RUNS} runs per task; prices per 1M tokens from OpenRouter's catalogue.`, "",
  "## Results (runs ok, median and slowest time)", "", ...table, "",
  "## Errors", "", ...(errors.length ? errors : ["none"]), "",
  "## COO recommendation and founder decision", "", "(added after reading the answers)", "",
  "## Answers (first run, first 1,200 characters)", "", ...answers,
].join("\n"));
console.log("wrote report");
```

- [ ] **Step 3: Check that the old script still parses, then run the quality test.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-backend
bun build scripts/ai-bakeoff.ts --target bun --outdir /tmp/bakeoff-check >/dev/null && echo old-script-ok
bun --preload ./tests/setup.ts scripts/ai-bakeoff-openrouter.ts 2>&1 | tail -40
```

Expected: `old-script-ok`; 105 result lines (5 models x 7 tasks x 3 runs) and `wrote report`. Cost: well under $1.
A model answering `error 404` on every run has no zero-retention host: record it and drop it (Review Focus 2).
`error 402`: the OpenRouter credit is not loaded; ask the founder.

- [ ] **Step 4: Recommend.** Read the answers (French correctness, the Persian and Arabic explanations, the A2 level of
  the tutor reply, the speaking score's levels and corrections) and write under "COO recommendation" the cheapest
  model that has every JSON task valid in 3 of 3 runs and a tutor-reply median under 15 s, with one paragraph on each
  model. Prices per 1M tokens (2026-10-16): Luna and Haiku 5.5 $0.10 in / $0.50 out; Gemini 3.1 Flash-Lite $0.25 /
  $1.50; Nemotron 3 Super $0.08 / $0.45; Gemma 4 31B $0.20 / $0.40.

- [ ] **Step 5: Founder picks.** Show the founder the results table and the recommendation; ask which model to use for
  both "standard" and "fast" (one model for both unless the test shows a reason to split). Record the answer under
  "founder decision" in the report and as decision #59 in `10_Decisions-Meetings/DECISIONS.md` (date, model id, why).
  Native speakers' views on Persian and Arabic, if the founder gets them, go into the same row.

- [ ] **Step 6: Set the code defaults to the pick.** In `ai.ts` replace
  `const DEFAULTS = { standard: "moonshotai/kimi-k3", fast: "moonshotai/kimi-k3", cap: 2000 };` with
  `const DEFAULTS = { standard: "openrouter:<PICK>", fast: "openrouter:<PICK>", cap: 2000 };` (the founder's ids). Then:

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-backend && bun test tests/ai.test.ts 2>&1 | grep -E "^\(fail\)|^ [0-9]+ (pass|fail)"
```

Expected: if "reads model choices from settings with defaults" fails because it pins the old default, update its
expected default to the new value (that test pins the default, not behaviour) and ledger it as a ruling; then `0 fail`.

- [ ] **Step 7: Commit.**

```bash
cd D:/AgentDevWork/repos/Parle
git add 07_Engineering/parle-backend/scripts 07_Engineering/parle-backend/supabase/functions/_shared/ai.ts 07_Engineering/parle-backend/tests/ai.test.ts 06_Build/export-decoupling/spikes/ai-bakeoff-openrouter-report.md 10_Decisions-Meetings/DECISIONS.md
git commit -m "feat(ai): quality test through OpenRouter; default model is the founder's pick (decision #59)"
```

---

### Task 4: Deepgram speech-to-text in the relay

**Files:**
- Create: `07_Engineering/parle-app/api/_voice/deepgram.ts`
- Test: `07_Engineering/parle-app/api/_voice/deepgram.test.ts`

**Interfaces:**
- Consumes: `ProviderError` (`provider.ts`).
- Produces: `deepgramUrl(): string`; `deepgramTranscriber(key: string, fetchImpl?: typeof fetch): (wav: Uint8Array) => Promise<string>`.

- [ ] **Step 1: Write the failing test** `api/_voice/deepgram.test.ts`:

```ts
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { deepgramTranscriber, deepgramUrl } from "./deepgram";

const realWarn = console.warn;
afterEach(() => { console.warn = realWarn; });
type Seen = { url: string; init: RequestInit };
const answer = (status: number, body: unknown, seen: Seen[] = []) =>
  (async (url: string, init: RequestInit) => { seen.push({ url, init }); return new Response(typeof body === "string" ? body : JSON.stringify(body), { status }); }) as unknown as typeof fetch;
const words = (text: string) => ({ results: { channels: [{ alternatives: [{ transcript: text }] }] } });

describe("Deepgram (Plan 10)", () => {
  it("every request opts out of Deepgram's training program, in French, with Nova-3", () => {
    const url = new URL(deepgramUrl());
    assert.equal(url.origin + url.pathname, "https://api.deepgram.com/v1/listen");
    assert.equal(url.searchParams.get("mip_opt_out"), "true");
    assert.equal(url.searchParams.get("model"), "nova-3");
    assert.equal(url.searchParams.get("language"), "fr");
  });
  it("sends the WAV with the key and returns the transcript", async () => {
    const seen: Seen[] = [];
    const text = await deepgramTranscriber("dg-key", answer(200, words(" Bonjour, je m'appelle Ana. "), seen))(new Uint8Array([1, 2, 3]));
    assert.equal(text, "Bonjour, je m'appelle Ana.");
    assert.equal(new URL(seen[0].url).searchParams.get("mip_opt_out"), "true");
    const h = seen[0].init.headers as Record<string, string>;
    assert.equal(h.Authorization, "Token dg-key");
    assert.equal(h["Content-Type"], "audio/wav");
  });
  it("silence gives an empty transcript, so the relay's 'couldn't hear enough' path runs", async () => {
    assert.equal(await deepgramTranscriber("k", answer(200, words("")))(new Uint8Array(4)), "");
    assert.equal(await deepgramTranscriber("k", answer(200, { results: { channels: [] } }))(new Uint8Array(4)), "");
  });
  it("out of credit (402) is 'Voice is busy' with a log line that says so, without the key or the body", async () => {
    const lines: string[] = [];
    console.warn = (...args: unknown[]) => { lines.push(JSON.stringify(args)); };
    await assert.rejects(deepgramTranscriber("dg-secret", answer(402, "Insufficient credits for je m'appelle Ana"))(new Uint8Array(4)), { code: "VOICE_BUSY" });
    assert.match(lines.join(" "), /402/);
    assert.match(lines.join(" "), /outOfCredit":true/);
    assert.doesNotMatch(lines.join(" "), /dg-secret|Ana/);
  });
  it("no network is 'Voice is busy'", async () => {
    console.warn = () => undefined;
    await assert.rejects(deepgramTranscriber("k", (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch)(new Uint8Array(4)), { code: "VOICE_BUSY" });
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-app && bun run test api/_voice/deepgram.test.ts 2>&1 | grep -E "error|^ [0-9]+ (pass|fail)" | head -5
```

Expected: FAIL: `Cannot find module './deepgram'`.

- [ ] **Step 3: Write `api/_voice/deepgram.ts`.**

```ts
import { ProviderError } from "./provider.js";

/**
 * Deepgram Nova-3 speech to text (Plan 10, spec 4). mip_opt_out=true on every request: Deepgram keeps the audio only
 * while it processes the request and never uses it for training. The key and the answer body are never logged.
 */
export const DEEPGRAM_LISTEN = "https://api.deepgram.com/v1/listen";

export function deepgramUrl(): string {
  const query = new URLSearchParams({ model: "nova-3", language: "fr", smart_format: "true", mip_opt_out: "true" });
  return `${DEEPGRAM_LISTEN}?${query}`;
}

export function deepgramTranscriber(key: string, fetchImpl: typeof fetch = fetch) {
  return async (wav: Uint8Array): Promise<string> => {
    const r = await fetchImpl(deepgramUrl(), { method: "POST", headers: { Authorization: `Token ${key}`, "Content-Type": "audio/wav" }, body: wav as unknown as BodyInit }).catch(() => null);
    if (!r?.ok) {
      console.warn("Deepgram call failed", { status: r?.status ?? "network", outOfCredit: r?.status === 402 });
      await r?.body?.cancel().catch(() => undefined);
      throw new ProviderError("VOICE_BUSY");
    }
    const body: any = await r.json().catch(() => null);
    const text = body?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    return typeof text === "string" ? text.trim() : "";
  };
}
```

- [ ] **Step 4: Run the test.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-app && bun run test api/_voice/deepgram.test.ts 2>&1 | grep -E "^ [0-9]+ (pass|fail)"
```

Expected: `5 pass`, `0 fail`.

- [ ] **Step 5: Commit.**

```bash
cd D:/AgentDevWork/repos/Parle
git add 07_Engineering/parle-app/api/_voice/deepgram.ts 07_Engineering/parle-app/api/_voice/deepgram.test.ts
git commit -m "feat(voice): Deepgram Nova-3 transcription with the training opt-out on every request"
```

---

### Task 5: Azure read-aloud in the relay

**Files:**
- Create: `07_Engineering/parle-app/api/_voice/azure.ts`
- Test: `07_Engineering/parle-app/api/_voice/azure.test.ts`

**Interfaces:**
- Consumes: `ProviderError`, `TTS_RATE` (`provider.ts`).
- Produces: `DEFAULT_VOICE = "fr-CA-SylvieNeural"`; `AZURE_OUTPUT = "raw-22050hz-16bit-mono-pcm"`;
  `escapeXml(text: string): string`; `ssml(text: string, voice: string): string`;
  `azureSpeaker(cfg: { key: string; region?: string; voice?: string }, fetchImpl?: typeof fetch): (text: string) => Promise<Int16Array>`.

- [ ] **Step 1: Write the failing test** `api/_voice/azure.test.ts`:

```ts
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AZURE_OUTPUT, azureSpeaker, DEFAULT_VOICE, escapeXml, ssml } from "./azure";
import { TTS_RATE } from "./provider";

const realWarn = console.warn;
afterEach(() => { console.warn = realWarn; });
type Seen = { url: string; init: RequestInit };
const pcm = (samples: number[]) => new Uint8Array(Int16Array.from(samples).buffer);
const answer = (status: number, body: BodyInit, seen: Seen[] = []) =>
  (async (url: string, init: RequestInit) => { seen.push({ url, init }); return new Response(body, { status }); }) as unknown as typeof fetch;

describe("Azure read-aloud (Plan 10)", () => {
  it("asks for raw PCM at the relay's own rate, so the MP3 step is unchanged", () => {
    assert.equal(AZURE_OUTPUT, `raw-${TTS_RATE}hz-16bit-mono-pcm`);
  });
  it("escapes XML characters, so French with & < > and quotes never breaks the request", () => {
    assert.equal(escapeXml(`C'est l'été & <b>"oui"</b>`), "C&apos;est l&apos;été &amp; &lt;b&gt;&quot;oui&quot;&lt;/b&gt;");
    const doc = ssml(`Tom & Léa <3`, DEFAULT_VOICE);
    assert.match(doc, /xml:lang="fr-CA"/);
    assert.match(doc, /<voice name="fr-CA-SylvieNeural">Tom &amp; Léa &lt;3<\/voice>/);
  });
  it("posts SSML to Canada Central with the key and returns 16-bit samples", async () => {
    const seen2: Seen[] = [];
    const out = await azureSpeaker({ key: "az-key" }, answer(200, pcm([1, -2, 300]), seen2))("Bonjour");
    assert.deepEqual(Array.from(out), [1, -2, 300]);
    assert.equal(seen2[0].url, "https://canadacentral.tts.speech.microsoft.com/cognitiveservices/v1");
    const h = seen2[0].init.headers as Record<string, string>;
    assert.equal(h["Ocp-Apim-Subscription-Key"], "az-key");
    assert.equal(h["Content-Type"], "application/ssml+xml");
    assert.equal(h["X-Microsoft-OutputFormat"], AZURE_OUTPUT);
    assert.ok(h["User-Agent"]);
    assert.match(String(seen2[0].init.body), /fr-CA-SylvieNeural/);
  });
  it("a region or voice that is not a plain name falls back to Canada Central and Sylvie", async () => {
    const seen: Seen[] = [];
    await azureSpeaker({ key: "k", region: "evil.example/", voice: `x"><voice name="y` }, answer(200, pcm([0]), seen))("Salut");
    assert.equal(seen[0].url, "https://canadacentral.tts.speech.microsoft.com/cognitiveservices/v1");
    assert.match(String(seen[0].init.body), /<voice name="fr-CA-SylvieNeural">/);
    const other: Seen[] = [];
    await azureSpeaker({ key: "k", region: "canadaeast", voice: "fr-CA-AntoineNeural" }, answer(200, pcm([0]), other))("Salut");
    assert.equal(other[0].url, "https://canadaeast.tts.speech.microsoft.com/cognitiveservices/v1");
    assert.match(String(other[0].init.body), /fr-CA-AntoineNeural/);
  });
  it("an error answer is 'Voice is busy' and the log line has the status only", async () => {
    const lines: string[] = [];
    console.warn = (...args: unknown[]) => { lines.push(JSON.stringify(args)); };
    await assert.rejects(azureSpeaker({ key: "az-secret" }, answer(400, "bad SSML near Léa"))("Léa"), { code: "VOICE_BUSY" });
    assert.match(lines.join(" "), /400/);
    assert.doesNotMatch(lines.join(" "), /az-secret|Léa/);
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-app && bun run test api/_voice/azure.test.ts 2>&1 | grep -E "error|^ [0-9]+ (pass|fail)" | head -5
```

Expected: FAIL: `Cannot find module './azure'`.

- [ ] **Step 3: Write `api/_voice/azure.ts`.**

```ts
import { ProviderError } from "./provider.js";

/**
 * Azure AI Speech read-aloud (Plan 10, spec 4): Canada Central, Canadian French voice, raw 16-bit PCM at the relay's
 * TTS_RATE (22,050 Hz), so the relay's MP3 step is unchanged. The key and the answer body are never logged.
 */
export const DEFAULT_VOICE = "fr-CA-SylvieNeural";
export const AZURE_OUTPUT = "raw-22050hz-16bit-mono-pcm";
const DEFAULT_REGION = "canadacentral";

export function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function ssml(text: string, voice: string): string {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${voice.slice(0, 5)}"><voice name="${voice}">${escapeXml(text)}</voice></speak>`;
}

export function azureSpeaker(cfg: { key: string; region?: string; voice?: string }, fetchImpl: typeof fetch = fetch) {
  // settings are plain names; anything else falls back (it would otherwise reach the URL or the SSML)
  const region = /^[a-z0-9]+$/.test(cfg.region ?? "") ? String(cfg.region) : DEFAULT_REGION;
  const voice = /^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/.test(cfg.voice ?? "") ? String(cfg.voice) : DEFAULT_VOICE;
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  return async (text: string): Promise<Int16Array> => {
    const r = await fetchImpl(url, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": cfg.key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": AZURE_OUTPUT, "User-Agent": "parle-voice" },
      body: ssml(text, voice),
    }).catch(() => null);
    if (!r?.ok) {
      console.warn("Azure speech call failed", { status: r?.status ?? "network" });
      await r?.body?.cancel().catch(() => undefined);
      throw new ProviderError("VOICE_BUSY");
    }
    const bytes = new Uint8Array(await r.arrayBuffer());
    return new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
  };
}
```

- [ ] **Step 4: Run the test.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-app && bun run test api/_voice/azure.test.ts 2>&1 | grep -E "^ [0-9]+ (pass|fail)"
```

Expected: `5 pass`, `0 fail`.

- [ ] **Step 5: Commit.**

```bash
cd D:/AgentDevWork/repos/Parle
git add 07_Engineering/parle-app/api/_voice/azure.ts 07_Engineering/parle-app/api/_voice/azure.test.ts
git commit -m "feat(voice): Azure read-aloud in Canadian French (Sylvie, Canada Central)"
```

---

### Task 6: The relay uses Deepgram and Azure

**Files:**
- Modify: `07_Engineering/parle-app/api/_voice/provider.ts` (`VoiceProvider.name`, `providerFor`)
- Test: `07_Engineering/parle-app/api/_voice/provider.test.ts` (new)
- Modify: `07_Engineering/parle-backend/scripts/prod/voice-sample.ts` (the check sample uses Azure)

**Interfaces:**
- Consumes: `deepgramTranscriber` (Task 4), `azureSpeaker` (Task 5).
- Produces: `providerFor(env)` answers `name: "deepgram-azure"` when `DEEPGRAM_API_KEY` and `AZURE_SPEECH_KEY` are set;
  Vercel settings read: `DEEPGRAM_API_KEY`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `VOICE_TTS_VOICE`.

- [ ] **Step 1: Write the failing test** `api/_voice/provider.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { providerFor } from "./provider";

describe("which voice provider the relay uses (Plan 10)", () => {
  it("Deepgram and Azure when both keys are set, on Vercel or not", async () => {
    assert.equal((await providerFor({ VERCEL: "1", DEEPGRAM_API_KEY: "d", AZURE_SPEECH_KEY: "a" })).name, "deepgram-azure");
    assert.equal((await providerFor({ DEEPGRAM_API_KEY: "d", AZURE_SPEECH_KEY: "a", NVIDIA_API_KEY: "n" })).name, "deepgram-azure");
  });
  it("not configured without both speech keys, even when the NVIDIA key is still set", async () => {
    await assert.rejects(providerFor({ VERCEL: "1", NVIDIA_API_KEY: "n" }), { code: "VOICE_NOT_CONFIGURED" });
    await assert.rejects(providerFor({ VERCEL: "1", DEEPGRAM_API_KEY: "d" }), { code: "VOICE_NOT_CONFIGURED" });
  });
  it("NVIDIA only off Vercel, by name, for comparison; the fake only off Vercel", async () => {
    await assert.rejects(providerFor({ VERCEL: "1", VOICE_PROVIDER: "nvidia", NVIDIA_API_KEY: "n" }), { code: "VOICE_NOT_CONFIGURED" });
    await assert.rejects(providerFor({ VERCEL: "1", VOICE_PROVIDER: "fake" }), { code: "VOICE_NOT_CONFIGURED" });
    assert.equal((await providerFor({ VOICE_PROVIDER: "fake" })).name, "fake");
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-app && bun run test api/_voice/provider.test.ts 2>&1 | grep -E "^ [0-9]+ (pass|fail)|✗|fail" | head -6
```

Expected: FAIL (the first case answers `nvidia` or `VOICE_NOT_CONFIGURED`).

- [ ] **Step 3: Change `provider.ts`.** Replace `name: "nvidia" | "fake";` with
  `name: "deepgram-azure" | "nvidia" | "fake";`, and replace the whole `providerFor` (with its comment) by:

```ts
/**
 * Deepgram (speech to text) and Azure (read-aloud) in production (Plan 10). NVIDIA only off Vercel, by name, for
 * comparison: its trial terms do not allow production use. The fake only off Vercel (tests and local runs).
 */
export async function providerFor(env: Env): Promise<VoiceProvider> {
  if (env.VOICE_PROVIDER === "fake") {
    if (env.VERCEL) throw new ProviderError("VOICE_NOT_CONFIGURED");
    return (await import("./fake.js")).fakeProvider(env);
  }
  if (env.VOICE_PROVIDER === "nvidia") {
    if (env.VERCEL || !env.NVIDIA_API_KEY) throw new ProviderError("VOICE_NOT_CONFIGURED");
    return (await import("./nvidia.js")).nvidiaProvider(env.NVIDIA_API_KEY);
  }
  if (!env.DEEPGRAM_API_KEY || !env.AZURE_SPEECH_KEY) throw new ProviderError("VOICE_NOT_CONFIGURED");
  const [{ deepgramTranscriber }, { azureSpeaker }] = await Promise.all([import("./deepgram.js"), import("./azure.js")]);
  return {
    name: "deepgram-azure",
    transcribe: deepgramTranscriber(env.DEEPGRAM_API_KEY),
    synthesize: azureSpeaker({ key: env.AZURE_SPEECH_KEY, region: env.AZURE_SPEECH_REGION, voice: env.VOICE_TTS_VOICE }),
  };
}
```

- [ ] **Step 4: The check sample uses Azure.** In `parle-backend/scripts/prod/voice-sample.ts` replace the NVIDIA call
  line `const speech = await nvidiaProvider(readSecret("NVIDIA_API_KEY")).synthesize(TEXT);` with
  `const speech = await azureSpeaker({ key: readSecret("AZURE_SPEECH_KEY") })(TEXT);` and its `nvidiaProvider` import
  with `import { azureSpeaker } from "../../../parle-app/api/_voice/azure";` (match the existing import's relative
  path style). Run it:

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-backend && npx tsx scripts/prod/voice-sample.ts 2>&1 | tail -1
```

Expected: `sample: <n> s of speech written to the temp folder` (one real Azure call, a few cents of a cent). A `401`
in the log: the Azure key or region is wrong; ask the founder to recheck KEY 1 on the Canada Central resource.

- [ ] **Step 5: Run every relay and app test and the relay type check.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-app && bun run test 2>&1 | grep -E "^\(fail\)|^ [0-9]+ (pass|fail)"; bunx tsc --noEmit -p tsconfig.api.json 2>&1 | grep -c "error TS"
grep -rn '"nvidia"' api/_voice/*.ts | grep -v test | cut -c1-120
```

Expected: `0 fail` (495 + 13 new); `0` relay type errors. If an existing handler test expected NVIDIA from
`NVIDIA_API_KEY` alone, update it to the Plan 10 rule and ledger the ruling. The grep shows only the `name` union and
`VOICE_PROVIDER === "nvidia"`.

- [ ] **Step 6: Commit.**

```bash
cd D:/AgentDevWork/repos/Parle
git add 07_Engineering/parle-app/api/_voice 07_Engineering/parle-backend/scripts/prod/voice-sample.ts
git commit -m "feat(voice): the relay uses Deepgram and Azure; NVIDIA only off Vercel for comparison"
```

---

### Task 7: Minimum age 18

**Files:**
- Modify: `07_Engineering/parle-app/src/lib/i18n.ts` (three English keys and their French overrides if present)
- Test: `07_Engineering/parle-app/src/lib/provider-copy.test.ts` (new; Task 8 appends to it)
- Modify: `02_Product/specs/phase-1-mvp/01_foundation.md`, `10_cross-cutting.md` (the "Minimum age 16" lines)

- [ ] **Step 1: Write the failing test** `src/lib/provider-copy.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { t } from "./i18n";

describe("minimum age 18 (Plan 10, decision #58)", () => {
  it("sign-up asks for 18 or older", () => {
    assert.equal(t("auth.ageConfirmation"), "I confirm that I am 18 years old or older.");
    assert.equal(t("auth.ageRequired"), "Confirm that you are at least 18 years old to create an account.");
    assert.match(t("onboarding.account.emailPasswordNote"), /18\+ age confirmation/);
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-app && bun run test src/lib/provider-copy.test.ts 2>&1 | grep -E "^ [0-9]+ (pass|fail)"
```

Expected: `1 fail` (the text says 16).

- [ ] **Step 3: Change the wording.** In `i18n.ts`:
  - `"auth.ageConfirmation": "I confirm that I am 16 years old or older.",` becomes `... 18 years old or older.",`
  - `"auth.ageRequired": "Confirm that you are at least 16 years old to create an account.",` becomes `... at least 18 ...`
  - in `"onboarding.account.emailPasswordNote"`, `The 16+ age confirmation` becomes `The 18+ age confirmation`.
  Then `grep -nE "16 ans|16\+|at least 16|16 years" src/lib/i18n.ts`: change each remaining age line (French
  overrides: `16 ans` becomes `18 ans`) and nothing else. In the two phase-1 spec files, change "Minimum age 16" to
  "Minimum age 18 (decision #58, 2026-10-16)" and mark open question 1 answered: "18 (decision #58)".

- [ ] **Step 4: Run the test and the full app suite.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-app && bun run test 2>&1 | grep -E "^\(fail\)|^ [0-9]+ (pass|fail)"
```

Expected: `0 fail`. A test that pinned the 16+ wording (for example a sign-up page test) is updated to 18 in the same
commit and ledgered.

- [ ] **Step 5: Commit.**

```bash
cd D:/AgentDevWork/repos/Parle
git add 07_Engineering/parle-app/src 02_Product/specs/phase-1-mvp
git commit -m "feat(auth): minimum age 18 (decision #58)"
```

---

### Task 8: Privacy wording that names the providers

**Files:**
- Modify: `07_Engineering/parle-app/src/lib/i18n.ts` (`legal.privacyVoiceBody`; new `legal.privacyAiTitle`, `legal.privacyAiBody`)
- Modify: `07_Engineering/parle-app/src/pages/LegalPage.tsx` (a second section)
- Modify: `07_Engineering/parle-app/src/lib/voice-copy.test.ts` (the provider name)
- Test: `07_Engineering/parle-app/src/lib/provider-copy.test.ts` (appended)

**Interfaces:**
- Consumes: the founder's pick from Task 3 (`<COMPANY>`: OpenAI, Anthropic, Google or NVIDIA, the model's maker).

- [ ] **Step 1: Write the failing tests.** Append to `provider-copy.test.ts`:

```ts
import { readFileSync } from "node:fs";

describe("privacy wording names the providers (Plan 10, spec 7)", () => {
  it("the voice paragraph names Deepgram and Microsoft Azure, says recordings are not kept or trained on", () => {
    const body = t("legal.privacyVoiceBody");
    assert.match(body, /Deepgram/);
    assert.match(body, /does not keep it or use it to train/);
    assert.match(body, /Microsoft Azure in Canada/);
    assert.match(body, /Parle does not store or log your recordings/);
  });
  it("a new paragraph covers the AI tutor and scores through OpenRouter", () => {
    assert.equal(t("legal.privacyAiTitle"), "The AI tutor and scores");
    assert.match(t("legal.privacyAiBody"), /OpenRouter/);
    assert.match(t("legal.privacyAiBody"), /train/);
  });
  it("no English wording names NVIDIA any more, and the new wording has no em dash", () => {
    assert.equal(readFileSync(new URL("./i18n.ts", import.meta.url), "utf8").includes("NVIDIA"), false);
    for (const key of ["legal.privacyVoiceBody", "legal.privacyAiTitle", "legal.privacyAiBody", "auth.ageConfirmation"] as const) assert.equal(t(key).includes("\u2014"), false, key);
  });
});
```

(`i18n.ts` does not export its dictionaries, so the test reads the source file.) In `voice-copy.test.ts` replace
`assert.match(t("legal.privacyVoiceBody"), /NVIDIA/);` with `assert.match(t("legal.privacyVoiceBody"), /Deepgram/);`.

- [ ] **Step 2: Run them to see them fail.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-app && bun run test src/lib/provider-copy.test.ts src/lib/voice-copy.test.ts 2>&1 | grep -E "^ [0-9]+ (pass|fail)"
```

Expected: failures (the paragraph names NVIDIA; the AI keys do not exist).

- [ ] **Step 3: The wording.** In `i18n.ts`, set `legal.privacyVoiceBody` to:

```
When you record an answer or a voice message, the recording is sent to Deepgram, the company that provides Parle's speech recognition, to be turned into text; Deepgram does not keep it or use it to train its models. Parle does not store or log your recordings. The text of what you said is saved with your practice history, like a typed answer, and is deleted when you delete your account. Replies read aloud are made from text by Microsoft Azure in Canada and are not linked to your recordings.
```

and add after it:

```ts
  "legal.privacyAiTitle": "The AI tutor and scores",
  "legal.privacyAiBody": "Parle's AI tutor and scores use an AI model made by <COMPANY>, reached through OpenRouter. What you write to the tutor, and the answers you send for a score, are sent to it to produce a reply. Parle asks for providers that do not keep your messages or use them to train models. Parle keeps your conversations and results in your account until you delete it.",
```

with `<COMPANY>` replaced by the founder's pick (Task 3). In `LegalPage.tsx`, after the closing `</section>` of
`privacy-voice` and inside the same `policy === "privacy"` block (wrap both sections in a fragment `<>...</>`), add:

```tsx
            <section className="mt-8 max-w-2xl" aria-labelledby="privacy-ai">
              <h2 id="privacy-ai" className="font-display text-xl font-extrabold text-foreground">{t("legal.privacyAiTitle")}</h2>
              <p className="mt-3 text-base leading-7 text-muted-foreground">{t("legal.privacyAiBody")}</p>
            </section>
```

- [ ] **Step 4: Run the tests, the full app suite and the type check.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-app && bun run test 2>&1 | grep -E "^\(fail\)|^ [0-9]+ (pass|fail)"
bunx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "error TS" | sed -E 's/\([0-9]+,[0-9]+\)//; s/\| \.\.\. [0-9]+ more \.\.\. \|//' | sed -E "s/: error (TS[0-9]+): (.{0,90}).*/ \1 \2/" | sort | diff <workspace>/tsc-baseline.txt - | grep "^[<>]"
```

Expected: `0 fail`; no diff lines.

- [ ] **Step 5: Founder approval.** Show the founder both paragraphs exactly as they read on the page and the 18+
  sign-up line; ask to approve or change. Apply changes, rerun Step 4, record the approval as decision #60 (date,
  "approved as drafted" or the changes). Nothing is deployed before this.

- [ ] **Step 6: Commit.**

```bash
cd D:/AgentDevWork/repos/Parle
git add 07_Engineering/parle-app/src 10_Decisions-Meetings/DECISIONS.md
git commit -m "docs(privacy): name Deepgram, Microsoft Azure and the AI model through OpenRouter (decision #60)"
```

---

### Task 9: Final review before deploy

**Files:** whatever the fixes need.

- [ ] **Step 1: Full suites and type checks** (as Task 0 Step 3). Expected: backend `0 fail`; app `0 fail`; app type
  errors the same list; relay `0`.
- [ ] **Step 2: Review package and reviewer.** Run the executing-plans final review: `review-package` for
  `main..HEAD`, a reviewer on the most capable model with this plan, the spec, the Review Focus section verbatim and the
  ledger's `Ruling:` lines. Ask it to check especially: every OpenRouter and Deepgram request carries its privacy flag;
  no log line can hold learner text or a key; NVIDIA cannot be reached on Vercel or by a model setting without the
  prefix in production once its key is removed; Azure SSML escaping; the 18+ wording everywhere.
- [ ] **Step 3: One fix pass.** Critical and Important findings: each fixed with a failing test first, then the full
  suites; ledger `Final: fixed ...`. Minor: ledger `Final: minor (deferred): ...`. Commit
  `fix(ai-providers): final review fixes before deploy`.

---

### Task 10: Deploy

**Files:**
- Create: `07_Engineering/parle-backend/scripts/prod/set-ai-model.ts`, `scripts/prod/ai-model.ts`,
  `tests/ai-model-setting.test.ts`
- Modify: `07_Engineering/parle-backend/scripts/prod/env.ts` (`OPENROUTER_API_KEY`, `AI_PROVIDER`)
- Modify: `06_Build/export-decoupling/migration/close-out-report.md` (new section "Plan 10 deploy")

- [ ] **Step 1: The model switch script (test first).** `tests/ai-model-setting.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { modelSettingValue } from "../scripts/prod/ai-model";

describe("the production model switch (Plan 10)", () => {
  it("accepts an OpenRouter model id and stores it as a JSON string", () => {
    expect(modelSettingValue("openrouter:openai/gpt-6-luna")).toBe('"openrouter:openai/gpt-6-luna"');
    expect(modelSettingValue("openrouter:anthropic/claude-haiku-5.5")).toBe('"openrouter:anthropic/claude-haiku-5.5"');
  });
  it("refuses anything else, including a bare NVIDIA id", () => {
    for (const bad of ["nvidia/nemotron-3-super-120b-a12b", "openrouter:", "openrouter:gpt", "openrouter:a/b c", "openrouter:a/b'; drop table x;--"]) expect(() => modelSettingValue(bad)).toThrow();
  });
});
```

Run `bun test tests/ai-model-setting.test.ts` (FAIL: module missing), then write `scripts/prod/ai-model.ts`:

```ts
/** The value written to app_setting ai_model_standard and ai_model_fast (JSON strings, as Buildy stored them). */
export function modelSettingValue(model: string): string {
  if (!/^openrouter:[a-z0-9-]+\/[a-z0-9.\-:]+$/.test(model)) throw new Error("expected openrouter:<author>/<model>");
  return JSON.stringify(model);
}
```

and `scripts/prod/set-ai-model.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { PROD_REF, serviceKey } from "./management";
import { modelSettingValue } from "./ai-model";

/**
 * Plan 10's model switch on PRODUCTION, run by the founder as a `!` command:
 *   bun scripts/prod/set-ai-model.ts openrouter:<author>/<model>   sets ai_model_standard and ai_model_fast
 *   bun scripts/prod/set-ai-model.ts --check                       prints both (read only)
 * Prints model ids only, never keys.
 */
const db = createClient(`https://${PROD_REF}.supabase.co`, await serviceKey(PROD_REF), { auth: { persistSession: false } });
const arg = process.argv[2];
if (arg && arg !== "--check") {
  const value = modelSettingValue(arg);
  for (const key of ["ai_model_standard", "ai_model_fast"]) {
    const { error } = await db.from("app_setting").update({ value, updated_by: "plan10-switch" }).eq("key", key);
    if (error) { console.log(`${key}: failed (${error.code})`); process.exit(1); }
  }
}
const { data } = await db.from("app_setting").select("key, value").in("key", ["ai_model_standard", "ai_model_fast"]).order("key");
for (const row of data ?? []) console.log(`${row.key}: ${row.value}`);
```

Run the test again: `2 pass`. In `scripts/prod/env.ts` change `AI_PROVIDER: "nvidia",` to `AI_PROVIDER: "live",` and add
after `NVIDIA_API_KEY: readSecret("NVIDIA_API_KEY"),` the line `OPENROUTER_API_KEY: readSecret("OPENROUTER_API_KEY"),`.
Commit `feat(ai): the production model switch script`.

- [ ] **Step 2: Founder uploads the text key.** Ask the founder to run:

```
! cd /d/AgentDevWork/repos/Parle/07_Engineering/parle-backend && SUPABASE_ACCESS_TOKEN="$(sed -E 's/^SUPABASE_ACCESS_TOKEN=//' /c/Users/AgentDev/.parle-secrets/SUPABASE_ACCESS_TOKEN | tr -d '\r\n')" bunx supabase secrets set OPENROUTER_API_KEY="$(sed -E 's/^OPENROUTER_API_KEY=//' /c/Users/AgentDev/.parle-secrets/OPENROUTER_API_KEY | tr -d '\r\n')" AI_PROVIDER=live --project-ref hcphvipeplkfenugikrf
```

Expected: `Finished supabase secrets set.`

- [ ] **Step 3: Founder adds the speech settings to Vercel** (one `!` command each, Production then Preview; press
  Enter if asked for a Git branch):

```
! cd /d/AgentDevWork/repos/Parle/07_Engineering/parle-app && tr -d '\r\n' < /c/Users/AgentDev/.parle-secrets/DEEPGRAM_API_KEY | bunx vercel env add DEEPGRAM_API_KEY production --sensitive --scope shayans-projects-d00acc44
! cd /d/AgentDevWork/repos/Parle/07_Engineering/parle-app && tr -d '\r\n' < /c/Users/AgentDev/.parle-secrets/DEEPGRAM_API_KEY | bunx vercel env add DEEPGRAM_API_KEY preview --sensitive --scope shayans-projects-d00acc44
! cd /d/AgentDevWork/repos/Parle/07_Engineering/parle-app && tr -d '\r\n' < /c/Users/AgentDev/.parle-secrets/AZURE_SPEECH_KEY | bunx vercel env add AZURE_SPEECH_KEY production --sensitive --scope shayans-projects-d00acc44
! cd /d/AgentDevWork/repos/Parle/07_Engineering/parle-app && tr -d '\r\n' < /c/Users/AgentDev/.parle-secrets/AZURE_SPEECH_KEY | bunx vercel env add AZURE_SPEECH_KEY preview --sensitive --scope shayans-projects-d00acc44
```

Claude adds the two plain settings itself (not secrets):

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-app
for e in production preview; do printf canadacentral | bunx vercel env add AZURE_SPEECH_REGION $e --scope shayans-projects-d00acc44; printf fr-CA-SylvieNeural | bunx vercel env add VOICE_TTS_VOICE $e --scope shayans-projects-d00acc44; done
bunx vercel env ls --scope shayans-projects-d00acc44 2>&1 | grep -E "DEEPGRAM_API_KEY|AZURE_SPEECH_KEY|AZURE_SPEECH_REGION|VOICE_TTS_VOICE|VOICE_RELAY_SECRET" | awk '{print $1, $3}' | sort
```

Expected: each of the five names for Production and Preview (values never shown).

- [ ] **Step 4: Functions and preview.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-backend && bun scripts/sync-app-code.ts | tail -1
SUPABASE_ACCESS_TOKEN="$(sed -E 's/^SUPABASE_ACCESS_TOKEN=//' /c/Users/AgentDev/.parle-secrets/SUPABASE_ACCESS_TOKEN | tr -d '\r\n')" bunx supabase functions deploy --project-ref hcphvipeplkfenugikrf 2>&1 | tail -1
cd ../parle-app && bunx vercel deploy --yes --target preview --scope shayans-projects-d00acc44
bunx vercel alias set <deployment URL printed above> parle-preview-shayans-projects-d00acc44.vercel.app --scope shayans-projects-d00acc44
```

Expected: `Deployed Functions`; build READY; alias `Success!`. Never `--prod`. A first "Not authorized": run once more.
At this point the text AI still runs on NVIDIA (the production settings have no `openrouter:` prefix) and voice runs
on Deepgram and Azure.

- [ ] **Step 5: Founder switches the model.** Ask the founder to run:

```
! cd /d/AgentDevWork/repos/Parle/07_Engineering/parle-backend && bun scripts/prod/set-ai-model.ts openrouter:<PICK>
```

Expected: `ai_model_fast: "openrouter:<PICK>"` and `ai_model_standard: "openrouter:<PICK>"`.

- [ ] **Step 6: Smoke checks.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-backend
BYPASS="$(sed -E 's/^VERCEL_BYPASS=//' /c/Users/AgentDev/.parle-secrets/VERCEL_BYPASS | tr -d '\r\n')"; P=https://parle-preview-shayans-projects-d00acc44.vercel.app
curl -s -w "\n%{http_code}\n" -X POST "$P/api/voice?action=speak" -H "x-vercel-protection-bypass: $BYPASS" -H "Content-Type: application/json" -d '{}' | tail -2
npx tsx scripts/prod/preview-click-through.ts 2>&1 | grep -E "AI tutor opened|console errors"
```

Expected: `AUTH_REQUIRED` and `401`; the AI tutor opens and replies (the click-through's tutor line), console errors as
in Plan 9 (the known R95 line only). Record everything in `migration/close-out-report.md`, section "Plan 10 deploy"
(same table shape as "Plan 9 deploy", setting names only), and commit `deploy: Plan 10 providers on production and the
preview`.

---

### Task 11: Live checks, then NVIDIA removed

**Files:** Modify `06_Build/export-decoupling/migration/close-out-report.md` (section "Plan 10 checks").

- [ ] **Step 1: Voice on the new providers.** Run Plan 9's checks unchanged (they check behaviour, not the provider):

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-backend
npx tsx scripts/prod/voice-sample.ts
bun scripts/prod/plan9-checks.ts learner
npx tsx scripts/prod/plan9-preview-checks.ts speaking-task
npx tsx scripts/prod/plan9-preview-checks.ts tutor
bun scripts/prod/plan9-checks.ts reply
bun scripts/prod/plan9-checks.ts listening
bun scripts/prod/plan9-checks.ts status
bun scripts/prod/plan9-checks.ts cleanup
```

Expected as in Plan 9's close-out "Plan 9 checks" (result shown, French heard, `200 audio/mpeg`, Listen played,
limits counted, cleanup 0 left). For `listening`, prepare one item again from Admin > Content so it is made in the new
voice (`generated true`). Record the times: transcription and scoring for the 15 s sample, first audio for a reply.

- [ ] **Step 2: Text AI on OpenRouter.** With a fresh check learner (the `learner` step), through the preview:
  open the AI tutor and send one message (time to reply), get a writing score from the check-in, open one practice card
  on Today, and run placement writing. Use the Plan 9 preview script's browser helpers (`open()`, `bodyText()`) in a
  small `scripts/prod/plan10-checks.ts` with one check per item, printing `name: ok|failed, seconds`. Then `cleanup`.
  Expected: all `ok`; tutor reply under 15 s; practice card AI-written (not the bank fallback) at least once in three.

- [ ] **Step 3: Nothing reaches NVIDIA.** Read the logs (Supabase MCP `get_logs` for edge functions, last hour) for
  `AI call failed` lines and confirm every AI line names `provider: "openrouter"`; on OpenRouter's Activity page the
  founder sees the calls under the picked model (ask for a screenshot or the count). Expected: no `provider: "nvidia"`.

- [ ] **Step 4: Remove the NVIDIA key.** Ask the founder to run:

```
! cd /d/AgentDevWork/repos/Parle/07_Engineering/parle-backend && SUPABASE_ACCESS_TOKEN="$(sed -E 's/^SUPABASE_ACCESS_TOKEN=//' /c/Users/AgentDev/.parle-secrets/SUPABASE_ACCESS_TOKEN | tr -d '\r\n')" bunx supabase secrets unset NVIDIA_API_KEY --project-ref hcphvipeplkfenugikrf
! cd /d/AgentDevWork/repos/Parle/07_Engineering/parle-app && bunx vercel env rm NVIDIA_API_KEY production --yes --scope shayans-projects-d00acc44 && bunx vercel env rm NVIDIA_API_KEY preview --yes --scope shayans-projects-d00acc44
```

Then remove `NVIDIA_API_KEY: readSecret("NVIDIA_API_KEY"),` from `scripts/prod/env.ts` (it would upload it again),
redeploy the preview (Task 10 Step 4, the Vercel part) so it runs without the key, and rerun the tutor check and the
`reply` check. Expected: both still `ok`.

- [ ] **Step 5: Deepgram's opt-out price.** Ask the founder to open console.deepgram.com > Usage and read the price per
  minute charged for today's requests (or the remaining credit before and after). Record it; if it is more than double
  the listed $0.0043/min, record it as a deferred item (switching transcription to OpenAI's API behind the same relay
  is the fallback, spec risk 1).

- [ ] **Step 6: Record and commit.** Every outcome, the times next to Plan 9's NVIDIA times, and the Deepgram price in
  "Plan 10 checks"; commit `test(ai-providers): Plan 10 live checks; NVIDIA key removed`.

---

### Task 12: Records

**Files:** `06_Build/export-decoupling/deferred-defects.md`, `deferred-inventory-2026-10-15.md`,
`specs/SPEC-BACKLOG.md`, `security-debt.md`, `HANDOFF.md`, `10_Decisions-Meetings/DECISIONS.md` (only if the founder
decided something not yet recorded).

- [ ] **Step 1: `deferred-defects.md`.** R101 and R108: `FIXED <date> (Plan 10: ...)` in the id cell, as R94 was. New
  R rows (next free ids) for the final review's deferred minors, any check failures deferred, and: listening audio made
  in NVIDIA's voice stays until prepared again; Deepgram's opt-out price (if unconfirmed); OpenRouter as a single point
  of failure for text AI (spec risk 3). Update the "Status as of" line. Copy the plan ledger's `Ruling:` lines and
  deferred minors into a "Plan 10 rulings" block before deleting the workspace (project rule).
- [ ] **Step 2: `deferred-inventory-2026-10-15.md`.** A100 and A93 to done; new A rows for the new R rows; the title
  line "Plan 10 (production AI providers) done on <date>; see `migration/close-out-report.md` (Plan 10 sections)."
- [ ] **Step 3: `SPEC-BACKLOG.md`.** Row 8: `BUILT <date> (Plan 10); VERIFIED <date> (Plan 10 checks)`.
- [ ] **Step 4: `security-debt.md`.** "Status after Plan 10 (<date>)": no NVIDIA key anywhere; OpenRouter key in
  Supabase only, zero-retention routing on every request; Deepgram and Azure keys in Vercel only, Deepgram opt-out on
  every request, Azure in Canada; provider errors logged by status only; minimum age 18; **open:** the lawyer review
  (D28) to include the new privacy paragraphs and the providers as subprocessors; OpenRouter's data location not stated.
- [ ] **Step 5: `HANDOFF.md`.** Section 4: a new top paragraph "Plan 10 (production AI providers) DONE <date>, branch
  `plan-10-ai-providers`" (what changed, the picked model, the settings, the founder's approvals, test totals, check
  results, links). Section 5: replace the "LAUNCH BLOCKER, AI provider" item with the remaining founder items (spending
  limits, the Deepgram price if open). Remove nothing else.
- [ ] **Step 6: Commit** `docs: Plan 10 records (R101 and R108 fixed, backlog row 8, security, handoff)`.

---

### Task 13: Report and finishing

- [ ] **Step 1: Report.** `06_Build/export-decoupling/plans/2026-10-16-plan-10-report.md` in the Plan 9 report's shape:
  tasks with commit ranges and test lines; every ruling with its cost if wrong; the final review fixes; the deferred
  minors; the quality-test result and the founder's pick; the final suite numbers.
- [ ] **Step 2: Finish the branch** (superpowers:finishing-a-development-branch): run the full suites once more
  (backend `0 fail`, app `0 fail`, relay `0` type errors, no new app type errors); commit the report
  (`docs: Plan 10 report`); `git checkout main && git merge --no-ff plan-10-ai-providers -m "merge: Plan 10 production AI providers"`;
  `git push origin main`; `git branch -d plan-10-ai-providers`; delete this plan's workspace after copying its rulings
  (Task 12 Step 1); `bunx supabase stop`, and tell the founder Docker can be closed.

---

## Self-review notes (writer)

- **Spec coverage.** 1 why and success: Tasks 2, 6, 10, 11 (nothing reaches NVIDIA; key removed). 2 decisions: text via
  OpenRouter with a quality test and the founder's pick (Tasks 2, 3, 10); Deepgram with the opt-out (Task 4); Azure
  Canada Central Sylvie (Task 5); 18+ (Task 7); limits unchanged (no task changes them). 3 text AI: `openrouter:<id>`
  routing, zero-retention block, referer and title, JSON format, temperature rule, reasoning low, unchanged checks,
  status-only logging (Task 2). 4 speech: Deepgram request and parsing, Azure request, SSML escaping, settings, NVIDIA
  off Vercel only, unchanged limits and timeouts (Tasks 4, 5, 6, 10). 5 quality test: five candidates, seven tasks,
  three runs, report, founder pick (Task 3). 6 minimum age (Task 7). 7 privacy wording and approval (Task 8). 8 founder
  steps (Before you start, Tasks 1, 10, 11). 9 tests and live checks (Tasks 2 to 8, 11). 10 risks: Deepgram price
  (Task 11 Step 5), Persian and Punjabi quality (Task 3 answers; native speakers optional), outages (existing
  messages; records), keys (Task 12). 11 not in Plan 10: nothing built for it.
- **Placeholders:** values filled at run time only: `<PICK>` and `<COMPANY>` (the founder's choice in Task 3),
  `<workspace>` (the plan workspace path), the deployment URL (Task 10 Step 4), dates.
- **Type consistency:** `ChatCall`, `routeModel`, `chatOpenRouter`, `ProviderCallError.status` (Task 2) used by Task 3;
  `providerCall(model, system, prompt, json, signal)` (Task 2) is the only call in `completeJson`; `deepgramTranscriber`
  (Task 4) and `azureSpeaker` (Task 5) match the `VoiceProvider` methods `transcribe(wav: Uint8Array): Promise<string>`
  and `synthesize(text: string): Promise<Int16Array>` used in Task 6; `modelSettingValue` (Task 10) writes the
  `openrouter:` value `routeModel` reads.
- **Review Focus:** 1 in Tasks 2, 4, 5 (log-line tests); 2 in Task 2 (404 and 402 cases) and Task 3 (dropped model);
  3 in Task 5 (escaping and fallback); 4 in Task 4 (silence); 5 in Task 4 (402).
