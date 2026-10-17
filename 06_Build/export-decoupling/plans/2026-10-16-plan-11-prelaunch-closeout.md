# Plan 11: pre-launch close-out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every open deferred item that code can close before launch (about 56 of the 71 open rows in
`deferred-inventory-2026-10-15.md`), each with a test that failed first; record a ruling for every item accepted or
moved; put the fixes in production and the preview; and leave every document current.

**Architecture:** Five code areas, one task each, in the order of risk to money and people: practice and the AI tutor
(Task 1), booking (Task 2, migration 000030), payouts (Task 3, migration 000031), administration and the waitlist (Task
4, migration 000032, plus the parle.buzz site), voice and AI providers (Task 5). The exact fixes come from five
read-only investigations of the current code (2026-10-16), each confirming the defect still exists. Three separate
migrations keep each area's tests able to prove RED before its SQL is applied. Wording that learners or tutors see goes
to the founder before deploy (Task 7).

**Tech Stack:** Bun (bun:test backend; app and relay tests in node:test style run by `bun run test`), Supabase (local
Docker stack, Edge Functions on Deno, Postgres), supabase-js 2, React + Vite app, the Vercel relay, the static
parle.buzz site, Playwright from the gstack install for browser checks, Supabase MCP for read-only production checks.

**Spec:** the deferred-items inventory `06_Build/export-decoupling/deferred-inventory-2026-10-15.md` (rows A29-A112,
as Plans 5 and 6 used it) and `deferred-defects.md` (R37-R120), with the specs of the plans that made each feature:
`specs/2026-10-16-plan-7-booking-payouts-design.md`, `specs/2026-10-16-plan-8-account-admin-waitlist-design.md`,
`specs/2026-10-16-plan-9-voice-design.md`, `specs/2026-10-16-plan-10-production-ai-providers-design.md`. Conventions:
`plans/2026-10-16-plan-10-production-ai-providers.md` (Global Constraints apply here too). Founder's request
(2026-10-16): "close as much as items as possible, try to be ready for launch, keep updating the documents".

## Before you start (founder steps, in the order they are needed)

1. **Task 0:** Docker Desktop running.
2. **Task 7:** approve or change the new wording (public pages about booking, cancellation and refund emails, the
   unsubscribe page, new messages). Nothing is deployed before this.
3. **Task 9:** apply three production migrations (`!` commands, dry run first); publish parle.buzz (`vercel --prod` in
   `parle-waitlist`); run the listening-audio reset script.
4. **Any time:** the items only you can do (Task 6 table): Azure S0, the Deepgram price, the real-iPhone test, the
   postal address and the owner checks, the tutor-microphone choice.

## Global Constraints

- Every fix: a test written first and watched failing for the reason named, then the fix, then the area's tests.
- Next free migration numbers: `20261016000030` (booking), `20261016000031` (payouts), `20261016000032` (admin and
  waitlist). SQL functions: `create or replace`, `security definer`, `set search_path = ''`, execute revoked from
  `public, anon, authenticated` and granted to `service_role` only. Copy a function's current body from the live local
  database (`pg_get_functiondef`) before replacing it, in case a later migration changed it.
- After changing app files that the server copies (`src/lib/*`, `functions/*`): `bun scripts/sync-app-code.ts` in
  `parle-backend`; `tests/app-code-sync.test.ts` must pass.
- Provider error bodies, keys and learners' words never appear in log lines (Plan 10).
- Wording: plain English, no em dashes; learner- and tutor-facing text goes to the founder (Task 7).
- Stripe stays in test mode; the app is never deployed with `--prod`; parle.buzz is published by the founder.
- Baselines (Plan 10): backend 517 pass / 1 skip / 0 fail; app 513; app type errors 62 (same list); relay 0.
- Records: every affected document is updated in the same pass (memory rule `docs-current-every-plan`): Task 11 greps
  the repo's `*.md` for each changed fact.

## Review Focus

1. **Two people acting on one lesson at the same moment** (two Book presses, learner and tutor cancelling, a report
   and a payout claim, two webhook deliveries): exactly one outcome, one refund, one transfer, nobody shown a payment
   error for something that succeeded (Tasks 2, 3).
2. **Money amounts after partial refunds and splits** (refund after payout following a split, a chargeback decided
   twice, `charge.refunded` arriving before our own record): the tutor and the learner each get the right cents, never
   counted twice (Task 3).
3. **A paused or deleted person** (tutor paused with "keep", learner deleting the account while on Stripe's page): no
   lesson is confirmed for them, any late payment is refunded, the listing stays hidden until enabled (Tasks 2, 4).
4. **Reading rules in the browser:** after the booking policy change no screen breaks (every screen goes through
   `parle-lesson-service`), and a tutor never sees a hold or a learner's message for a lesson that is not theirs
   (Task 2).
5. **Mail scanners and one-click unsubscribe:** opening the unsubscribe page never unsubscribes on its own, while a mail
   provider's one-click POST to the function still works (Task 4).

## Triage of the 71 open items

| Decision | Items |
|---|---|
| **Fix, Task 1 (practice, tutor)** | A29 (abort the repeat call; live check), A40, A41, A42, A43, A44, A46, A47, A48, A49 |
| **Fix, Task 2 (booking)** | A50 (wording, founder), A51, A52, A53, A54, A55, A56 (order; rest accepted), A57, A58, A59, A80 |
| **Fix, Task 3 (payouts)** | A60, A61, A62, A63, A64, A65, A66, A67, A68, A70, A101 |
| **Fix, Task 4 (admin, waitlist)** | A73, A74, A75, A76, A77, A78, A79, A82, A85, A87 |
| **Fix, Task 5 (voice, AI)** | A88, A89, A90, A91, A92, A98, A99 (code; iPhone check stays with the founder), A106, A107, A108, A109, A110, A111, A112 |
| **Fix, Task 9 (deploy step)** | A102 (reset the listening audio made in NVIDIA's voice) |
| **Accept with a reason (Task 6)** | A45 (a page cached before Plan 6: gone after reload, months old by launch), A81 (a token issued before a pause reads own rows for up to an hour; every function refuses it), A83 (paused-account lists capped at 1,000 rows: a handful exist), A96 (task audio links last an hour by design), A97 ("Listen slowly" is playback speed), A104 (OpenRouter single route for launch) |
| **Move to the Stripe live plan (row 5)** | A69 (rename `minimum_lesson_charge_usd` and `hourly_rate_usd` in the live-mode data migration), A71 (Accounts v2 for Connect), A72 (statement descriptor PARLE: a dashboard setting) |
| **Founder** | A84 (owner-session checks, after the postal address), A94 (tutor microphone in speaking mode only, or every mode), A95 and A99 (real iPhone), A103 (Deepgram price), A105 (Azure S0) |

---

### Task 0: Branch and baseline

**Files:** none changed.

- [ ] **Step 1: Branch.**

```bash
cd D:/AgentDevWork/repos/Parle
git checkout main && git pull --ff-only
git checkout -b plan-11-prelaunch-closeout
ls 07_Engineering/parle-backend/supabase/migrations | tail -1
```

Expected: `Switched to a new branch 'plan-11-prelaunch-closeout'`; the last migration is `20261016000029_voice.sql`.

- [ ] **Step 2: Local stack** (founder starts Docker Desktop):

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-backend
bunx supabase start -x imgproxy,vector,logflare,supavisor
bunx supabase migration up
bun scripts/setup-local-functions-env.ts
```

Then `bunx supabase functions serve` in the background. A first `HealthCheckTimeout`: run `start` again.

- [ ] **Step 3: Baselines** (as Plan 10 Task 0 Step 3). Expected: backend `517 pass`, `1 skip`, `0 fail`; app `513`;
  app type errors `62` (save the list to `<workspace>/tsc-baseline.txt`); relay `0`. Record them in the ledger.

---

### Task 1: Practice preparation, profile photos and the AI tutor (A29, A40-A44, A46-A49)

**Files:**
- Modify: `07_Engineering/parle-app/src/lib/learner-plan.ts` (`prepareMyTaskContent` ~1813-1844, `ownTask`, done/skip
  ~1850-1888, `refreshContent` ~1591)
- Modify: `07_Engineering/parle-backend/supabase/functions/_shared/superdev-compat.ts` (`update`, ~110-118)
- Modify: `07_Engineering/parle-app/src/pages/Settings.tsx` (~135-188, ~349), `src/lib/i18n.ts`
- Modify: `07_Engineering/parle-backend/supabase/functions/parle-account-service/index.ts` (~65-81)
- Modify: `07_Engineering/parle-app/functions/parle-tutor-service.helper.ts` (~1229-1285, `withExplanationLanguage`
  ~639-663), `functions/parle-assessment-service.ts` (~209-217); `parle-backend/supabase/functions/_shared/ai.ts`
  (`AiRequest`, `completeJson`, `aiTimeoutMs`)
- Test: `parle-backend/tests/fn-task-content.test.ts`, `account-service.test.ts`, `fn-tutor-language.test.ts`,
  `ai.test.ts`; `parle-app/src/lib/settings-errors.test.ts`, `explanation-language.test.ts`

Helpers: `fn-task-content.test.ts` has `freshPlan`, `prepare`, `PRACTICE`, `psql`, `service`, `FN`, and the AI queue
helpers `queueAiResponses`, `queueLeft`; `account-service.test.ts` has `makeUser`, `tokenOf`, `call`, `LOCAL_URL`;
`fn-tutor-language.test.ts` has `learner`, `openQuestion`, `ask`, `callFunction`, `AI`, `ARABIC`, `FRENCH`. Check each
helper's exact name and signature when writing the test; adapt the call, never the behaviour asserted.

- [ ] **Step 1: A41, A47, A48 (one preparation per task, never for a stale topic, read by id).** Tests first, in
  `fn-task-content.test.ts`:

```ts
it("two requests at once prepare a task with one AI call (A41)", async () => {
  const { t, plan } = await freshPlan();
  await queueAiResponses(PRACTICE, PRACTICE);
  const task = plan.tasks.find((x: any) => x.contentSource === "pending");
  const [a, b] = await Promise.all([prepare(t, task.id), prepare(t, task.id)]);
  expect([a.status, b.status]).toEqual([200, 200]);
  expect([a.body.result.contentSource, b.body.result.contentSource]).toEqual(["generated", "generated"]);
  expect(await queueLeft()).toBe(1);
}, 90000);

it("a plan rebuilt during preparation keeps the new topic pending (A47)", async () => {
  const { t, plan } = await freshPlan();
  await queueAiResponses(PRACTICE);
  const task = plan.tasks.find((x: any) => x.contentSource === "pending");
  const running = prepare(t, task.id);
  for (let i = 0; i < 200; i++) {
    const { data } = await service().from("learner_task").select("source_ref").eq("id", task.id).single();
    if (String(data!.source_ref).startsWith("preparing:")) break;
    await Bun.sleep(10);
  }
  await service().from("learner_task").update({ topic: "rebuilt", content_source: "pending", content_json: "{}", source_ref: "" }).eq("id", task.id);
  expect((await running).status).toBe(200);
  const { data } = await service().from("learner_task").select("content_source, topic").eq("id", task.id).single();
  expect(data).toEqual({ content_source: "pending", topic: "rebuilt" });
}, 60000);

it("prepares a task behind 500 newer rows (A48)", async () => {
  const { t, plan } = await freshPlan();
  await queueAiResponses(PRACTICE);
  const task = plan.tasks.find((x: any) => x.contentSource === "pending");
  psql(`insert into public.learner_task (owner_id, created_by, user_id, roadmap_id, week_plan_id, task_key, type, skill, status, content_source, created_at)
        select owner_id, created_by, user_id, roadmap_id, 'other-week', 'x:' || g, type, skill, 'done', 'generated', now() + interval '1 hour'
        from public.learner_task, generate_series(1, 500) g where id = '${task.id}'`);
  const r = await prepare(t, task.id);
  expect(r.status).toBe(200);
  expect(r.body.result.contentSource).toBe("generated");
}, 60000);
```

  Run them (`bun test tests/fn-task-content.test.ts`): A41 fails (queue left 0), A47 fails (no claim appears), A48
  fails (400). Fix:
  - `superdev-compat.ts` `update(id, row, match?)`: when `match` is given, add `.eq(k, v)` (`.is(k, null)` for null)
    for each entry and use `.select("*").maybeSingle()`; return `data ?? null` (null = the row no longer matched).
    Without `match` behaviour is unchanged.
  - `learner-plan.ts`:

```ts
const CLAIM_MS = 120_000;
const claimAge = (ref: unknown) => typeof ref === "string" && ref.startsWith("preparing:") ? Date.now() - Number(ref.slice(10)) : Infinity;
async function waitForContent(read: () => Promise<StoredTaskRecord | null>, view: LearnerTaskView): Promise<LearnerTaskView> {
  for (const until = Date.now() + 45_000; Date.now() < until;) {
    await new Promise((r) => setTimeout(r, 1500));
    const latest = await read();
    if (latest && latest.content_source !== "pending") return taskFromRecord(latest) ?? view;
  }
  throw new Error("Practice content is still being prepared."); // the page tries again, then offers a refresh
}
```

    `ownTask` reads by id: `(await ownerRows<StoredTaskRecord>(learner_task, { id: taskId, created_by: user.email, user_id: user.id }, "-created_at", 1))[0] ?? null`
    (same change in `markMyLearnerTaskDone` and `skipMyLearnerTask`). After the pending check in
    `prepareMyTaskContent`:

```ts
if (claimAge(record.source_ref) < CLAIM_MS) return waitForContent(ownTask, view);
const claim = `preparing:${Date.now()}`;
const claimed = await (learner_task as any).update(record.id, { source_ref: claim }, { content_source: "pending", source_ref: record.source_ref ?? null });
if (!claimed) return waitForContent(ownTask, view);
```

    and the final write (replacing the re-read and update at ~1838-1843):

```ts
const written = await (learner_task as any).update(record.id, update,
  { content_source: "pending", source_ref: claim, type: record.type, topic: record.topic ?? null, skill: record.skill ?? null });
if (!written) { const latest = await ownTask(); return (latest && taskFromRecord(latest)) ?? view; }
return taskFromRecord(written) ?? view;
```

  A plan rebuild writes `PENDING_CONTENT` with `sourceRef: ""`, which clears a claim; a claim older than 120 s (a worker
  stopped at its limit) can be taken again.

- [ ] **Step 2: A49 (an "unavailable" card is prepared again on refresh).** Test in `fn-task-content.test.ts`:

```ts
it("a writing, speaking or lesson card left unavailable is prepared again on refresh (A49)", async () => {
  const { t, plan } = await freshPlan();
  const task = plan.tasks.find((x: any) => x.contentSource === "pending" && !["vocabulary_drill", "listening_exercise"].includes(x.type));
  expect(task).toBeTruthy();
  await service().from("learner_task").update({ content_source: "unavailable", content_json: "{}" }).eq("id", task.id);
  const again = (await callFunction(FN, t, { action: "get_or_create_plan", options: {} })).body.result;
  expect(again.tasks.find((x: any) => x.id === task.id).contentSource).toBe("pending");
}, 60000);
```

  Fix (`learner-plan.ts` ~1591): `const refreshContent = contentChanged || existing.content_source === "unavailable" || (existing.content_source !== "pending" && needsTaskPracticeRefresh(task, existing));`

- [ ] **Step 3: A42, A43, A44 (photos).** Tests: `settings-errors.test.ts` (add `import { readFileSync } from "node:fs";`):

```ts
it("Save waits while a photo uploads, and a failed clean-up is logged (A42, A44)", () => {
  const src = readFileSync(new URL("../pages/Settings.tsx", import.meta.url), "utf8");
  assert.match(src, /disabled=\{saving \|\| photoBusy\}/);
  assert.match(src, /if \(photoBusy\) return;/);
  assert.doesNotMatch(src, /cleanUnsavedPhotos\(\)\.catch\(\(\) => undefined\)/);
  assert.match(src, /Parle unsaved photo clean-up failed/);
});
it("a photo removed before the save has its own message (A43)", () => {
  assert.equal(settingsSaveErrorKey(refused("PHOTO_MISSING", "That photo is no longer uploaded. Choose your photo again.")), "settings.photoMissingError");
});
```

  and `account-service.test.ts`:

```ts
it("a photo removed before the save asks to choose it again (A43, R51)", async () => {
  const u = await makeUser("learner"), t = await tokenOf(u);
  const gone = `${LOCAL_URL}/storage/v1/object/public/profile-photos/${u.id}/${crypto.randomUUID()}.png`;
  const r = await call(t, { action: "save_profile", time_zone: "UTC", photo_url: gone });
  expect(r.body.error_code).toBe("PHOTO_MISSING");
});
```

  Fix: `Settings.tsx`: first line of `handleSave` after `preventDefault()`: `if (photoBusy) return;`; the Save button
  `disabled={saving || photoBusy}`; the clean-up `await cleanUnsavedPhotos().catch((error) => console.warn("Parle unsaved photo clean-up failed; uploading anyway", { errorType: error instanceof Error ? error.name : "UnknownError" }));`;
  in `settingsSaveErrorKey`, before the `PHOTO_INVALID` line, `if (code === "PHOTO_MISSING") return "settings.photoMissingError";`.
  `parle-account-service/index.ts`, after the `"unreadable"` line: `if (kind === "missing") return fail("PHOTO_MISSING", 400, "That photo is no longer uploaded. Choose your photo again.");`.
  i18n: `"settings.photoMissingError": "Your photo upload is no longer available. Choose your photo again, then save."`.

- [ ] **Step 4: A40 and A46 (a tutor message is charged only once its reply exists; a 45 s budget).** Tests:
  `ai.test.ts`: change the standard-budget expectation to `expect(aiTimeoutMs("standard")).toBe(45_000);` and name it
  "a tutor reply gets 45 s (A40)"; `explanation-language.test.ts`:

```ts
it("a tutor message is charged only after its reply (A40, R48)", () => {
  const src = readFileSync(new URL("../../functions/parle-tutor-service.helper.ts", import.meta.url), "utf8");
  const send = src.slice(src.indexOf('if (action === "tutor_send_message")'));
  assert.ok(send.indexOf("await consumeMessage(") > send.indexOf("completeTutorProvider(provider, replyPrompt"));
});
```

  `fn-tutor-language.test.ts` (extend Review Focus 5):

```ts
const used = async (t: string) => (await callFunction(AI, t, { action: "tutor_get_plan_summary" })).body.summary.messages_used as number;
it("keeps the first reply when the second also misses, and charges the message once (Review Focus 5, A46)", async () => {
  const t = await learner("Arabic"), s = await openQuestion(t, ARABIC);
  const before = await used(t);
  const r = await ask(t, s, FRENCH, FRENCH);
  expect(r.status).toBe(200);
  expect(r.body.reply).toContain("Depuis");
  expect(await used(t)).toBe(before + 1);
}, 60000);
```

  Fix: `_shared/ai.ts` `aiTimeoutMs`: standard default `45_000` (update its comment: replies take 9 to 15 s on GPT-6
  Luna; 45 s plus the 40 s fast fallback stays inside the 150 s worker limit). In `parle-tutor-service.helper.ts`
  `tutor_send_message`: keep the limit check (`if (context.messagesRemaining <= 0) return tutorLimitResponse(...)`),
  remove the `consumeMessage` before the AI call and both `refundMessage` calls, and after the reply has passed its
  checks and before saving the tutor message:

```ts
// A40: the message is counted only once its reply exists, so a worker stopped at its time limit (546) never charges
const remaining = await consumeMessage(client, user, context, sessionId);
if (remaining === null) return tutorLimitResponse(context, origin);
```

  The prompt's `remainingMessages` becomes `Math.max(0, context.messagesRemaining - 1)`. `increment_usage` keeps the
  limit atomic. Remove `refundMessage` if it has no caller left. `fn-tutor-refund.test.ts` (a failed reply is not
  counted) must stay green.

- [ ] **Step 5: A29 (the language repeat is cancelled when its time is up).** Test in `ai.test.ts`:

```ts
it("an aborted request stops its provider call (A29)", async () => {
  const realFetch = globalThis.fetch;
  let aborted = false;
  process.env.AI_PROVIDER = "live"; process.env.OPENROUTER_API_KEY = "sk-or-test";
  globalThis.fetch = ((_u: unknown, init: RequestInit) => new Promise((_r, reject) => { init.signal?.addEventListener("abort", () => { aborted = true; reject(new DOMException("aborted", "AbortError")); }); })) as unknown as typeof fetch;
  const outer = new AbortController();
  try {
    const call = completeJson(db(), { prompt: "p", signal: outer.signal }, { capKey: `cap:${crypto.randomUUID()}` });
    setTimeout(() => outer.abort(), 50);
    await expect(call).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  } finally { globalThis.fetch = realFetch; delete process.env.OPENROUTER_API_KEY; process.env.AI_PROVIDER = "fake"; }
  expect(aborted).toBe(true);
});
```

  (It needs a model setting with the `openrouter:` prefix: `aiSettings` defaults to `openrouter:openai/gpt-6-luna`
  since Plan 10, so no setting row is needed; if the local `app_setting` has an NVIDIA model row, the test sets the
  route explicitly through `setSetting`-style SQL and restores it.) Fix: `AiRequest` gains `signal?: AbortSignal`;
  in `completeJson` each attempt's controller aborts when `req.signal` aborts
  (`req.signal?.addEventListener("abort", () => controller.abort(), { once: true })`); pass the signal through the
  compat `invokeLLM`, `makeAIProvider.complete(prompt, schema, mode, signal)` in `parle-assessment-service.ts` and
  `completeTutorProvider`; in `withExplanationLanguage` create an `AbortController`, call `again(ctrl.signal)` and
  `ctrl.abort()` when the timer wins. The live check of Arabic, Hindi and Persian explanations is Task 10.

- [ ] **Step 6: Run and commit.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-backend && bun scripts/sync-app-code.ts | tail -1
bun test tests/fn-task-content.test.ts tests/account-service.test.ts tests/fn-tutor-language.test.ts tests/fn-tutor-refund.test.ts tests/ai.test.ts tests/app-code-sync.test.ts 2>&1 | grep -E "^\(fail\)|^ [0-9]+ (pass|fail)"
cd ../parle-app && bun run test 2>&1 | grep -E "^\(fail\)|^ [0-9]+ (pass|fail)"
```

Expected: `0 fail` in both. Commit `fix(practice, tutor): pre-launch close-out (A29, A40-A44, A46-A49)`.

---

### Task 2: Booking fixes (A50-A59, A80)

**Files:**
- Create: `07_Engineering/parle-backend/supabase/migrations/20261016000030_booking_fixes.sql`
- Modify: `parle-backend/supabase/functions/_shared/lessons/booking.ts`, `store.ts`, `changes.ts`, `refunds.ts`,
  `deletion.ts`, `payments.ts` (fake refund), `mail-copy.ts`, `confirm.ts`, `notify.ts`, `view.ts`;
  `_shared/admin/accounts.ts`; `_shared/account-deletion.ts`
- Modify (app): `parle-app/src/lib/parle-booking.ts`, `src/pages/LearnerLessons.tsx`, `src/lib/i18n.ts` (keys listed in
  Step 1), `src/lib/public-info-content.ts` (none: keys only)
- Test: `parle-backend/tests/fn-lesson-booking.test.ts`, `fn-lesson-changes.test.ts`, `fn-lesson-payments.test.ts`,
  `lesson-mail.test.ts`, `booking-schema.test.ts`, `fn-admin-accounts.test.ts`, `account-deletion.test.ts`;
  `parle-app/src/lib/parle-booking.test.ts`, `public-info-pages.test.ts`

Paths below: L = `parle-backend/supabase/functions/_shared/lessons/`. Helpers from `tests/helpers/lessons`: `book`,
`bookAndPay`, `bookableTutor` (its `token` is the tutor's), `learner`, `lesson`, `slotAt`, `pay`, `refundCount`,
`service`, `statusOf`; `booking-schema.test.ts` has `row`, `at`, `makeUser`; `fn-admin-accounts.test.ts` has
`adminUser`, `adminCall`, `psql`. Verify each helper's exact signature when writing the test; adapt the call, never the
behaviour asserted.

- [ ] **Step 1: A50 (wording, founder approval in Task 7).** Write the test first in `public-info-pages.test.ts`:
  replace the "coming soon" phrase checks at lines ~82 and ~149 and the loop at ~157-165 with

```ts
for (const key of [...bookingNoticeKeys, "publicInfo.faq.oneAnswer", "publicInfo.faq.fiveAnswer", "publicInfo.plans.tutorPricingNote", "publicInfo.tutorVetting.demoNote", "publicInfo.howWorks.bookingNote"] as TranslationKey[])
  assert.doesNotMatch(t(key), /coming soon/i, key);
assert.ok(copy.toLowerCase().includes("when you book"));
```

  Run `bun run test src/lib/public-info-pages.test.ts` (FAIL), then change the English values (draft wording; the
  founder approves or changes it in Task 7):
  - `landing.pathBody`, `landing.howBody`: replace "Human-tutor booking is coming soon in this demo." with "You can
    also book a lesson with one of our founding tutors and pay when you book."
  - `landing.stepFourTitle`: "Add a human tutor". `landing.stepFourBody`, `landing.pricingNote`: "Tutors set their own
    lesson prices. You book a time and pay when you book."
  - `landing.faqFiveAnswer`, `publicInfo.plans.tutorPricingNote`, `publicInfo.faq.fiveAnswer`: "Tutors set their own
    lesson prices, and Parle adds no learner booking fee. You pay the lesson price when you book."
  - `publicInfo.faq.fiveQuestion`: "How do I book a tutor, and what does a lesson cost?"
  - `publicInfo.howWorks.bookingNote`: "Book a lesson with one of our founding tutors. Your time is held while you pay."
  - `publicInfo.tutorVetting.demoNote`: "Lessons are booked and paid on Parle. Demo and sample reviews are not proof of
    completed real lessons." (the second sentence is required by an existing test)
  - `publicInfo.faq.oneAnswer`: end "... and you can book a lesson with a human tutor."
  - Delete the unused key `tutorProfile.bookingComing` (grep first: no caller). Keep `booking.opensSoon` and
    `lessons.error.bookingNotOpen` (they describe a tutor without payouts, still true).
  - French overrides of these keys, if any (`grep -n` each key below `const frenchOverrides`): translate the same way.
  Run the app suite: PASS.

- [ ] **Step 2: the migration** `20261016000030_booking_fixes.sql` (A52, A53, A57, A59, A80), in this order:

```sql
-- A52 (R60): a move expires lapsed holds first (lesson_hold does; lesson_reschedule did not)
create or replace function public.lesson_reschedule(p_booking uuid, p_learner uuid, p_start timestamptz, p_window_hours int) returns text
language plpgsql security definer set search_path = '' as $$
declare v_changed int;
begin
  update public.booking set status = 'expired', status_changed_at = now()
   where tutor_id = (select tutor_id from public.booking where id = p_booking)
     and status = 'pending_payment' and hold_expires_at < now();
  begin
    update public.booking
       set start_at = p_start, end_at = p_start + make_interval(mins => minutes), reschedule_count = reschedule_count + 1,
           booked_at = now(), reminder_24h_sent_at = null, reminder_1h_sent_at = null, status_changed_at = now()
     where id = p_booking and learner_id = p_learner and status = 'confirmed' and reschedule_count = 0
       and start_at >= now() + make_interval(hours => p_window_hours);
    get diagnostics v_changed = row_count;
  exception when exclusion_violation then return 'slot_taken';
  end;
  if v_changed = 0 then return 'not_allowed'; end if;
  delete from public.lesson_brief where booking_id = p_booking;
  return 'rescheduled';
end; $$;

-- A53 (R61): one cancel at a time per lesson
alter table public.booking add column if not exists cancel_claimed_at timestamptz;
create or replace function public.lesson_claim_cancel(p_booking uuid) returns boolean
language sql security definer set search_path = '' as $$
  with c as (update public.booking set cancel_claimed_at = now()
              where id = p_booking and status = 'confirmed'
                and (cancel_claimed_at is null or cancel_claimed_at < now() - interval '2 minutes') returning id)
  select exists (select 1 from c);
$$;
revoke all on function public.lesson_claim_cancel(uuid) from public, anon, authenticated;
grant execute on function public.lesson_claim_cancel(uuid) to service_role;

-- A57 (R65): tutors never read holds; the browser reads only the columns the lesson_brief / lesson_notes rules need
drop policy if exists "booking: participants read" on public.booking;
create policy "booking: participants read" on public.booking for select to authenticated
  using (learner_id = (select auth.uid()) or (tutor_id = (select auth.uid()) and status not in ('pending_payment', 'expired')));
revoke select on public.booking from authenticated;
grant select (id, learner_id, tutor_id, tutor_profile_id, start_at, end_at, minutes, status, reschedule_count,
  booked_at, status_changed_at, cancelled_by, late_cancel, completed_at, created_at) on public.booking to authenticated;
```

  Then (A59, A80) the full `create or replace function public.lesson_confirm_payment(...)`: copy the current definition
  from `20261016000024_lesson_booking.sql` (lines ~172-208, signature and revoke/grant unchanged) and change only the
  late-payment branch: `elsif b.status = 'expired' then` becomes `elsif b.status = 'expired' and b.cancelled_by is null then`
  (its body unchanged); the final `else` returns `'slot_lost'` as now, so a hold ended by an account deletion or a pause
  (`cancelled_by` set) is refunded, never confirmed. Check the live definition first:
  `docker exec supabase_db_parle-staging psql -U postgres -tAc "select pg_get_functiondef('public.lesson_confirm_payment'::regproc)"`
  and copy from that if it differs from the file (a later migration may have replaced it).
  Apply locally: `bunx supabase migration up`.

- [ ] **Step 3: A51 (two quick Book presses).** Test first, in `fn-lesson-booking.test.ts`:

```ts
it("two presses at once both open the learner's own hold, and it is not busy to them (R59)", async () => {
  for (let run = 0; run < 3; run++) {
    const { profileId } = await bookableTutor();
    const [{ t }, other] = await Promise.all([learner(), learner()]);
    const start = slotAt(5, 13);
    const [a, b] = await Promise.all([book(t, profileId, start), book(t, profileId, start)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(b.body.booking_id).toBe(a.body.booking_id);
    const mine = (await lesson(t, "booking_options", { tutor_profile_id: profileId })).body.busy_intervals;
    expect(mine.some((x: any) => x.start_utc === start)).toBe(false);
    const theirs = (await lesson(other.t, "booking_options", { tutor_profile_id: profileId })).body.busy_intervals;
    expect(theirs.some((x: any) => x.start_utc === start)).toBe(true);
  }
}, 60000);
```

  Fix: in L`store.ts` `blockedRanges(db, tutorId, now, exceptId = "", ownLearnerId = "")` also selects `learner_id`
  and drops `pending_payment` rows whose `learner_id === ownLearnerId`; `bookingOptions` in L`booking.ts` passes
  `ctx.caller.id`; `bookLesson` keeps its own validation without `ownLearnerId`. Replace the own-hold lookup in
  `bookLesson` (lines ~81-88) with:

```ts
for (let i = 0; i < 8; i++) {
  const { data: own } = await db.from("booking").select("id, stripe_checkout_session_id")
    .eq("learner_id", caller.id).eq("tutor_id", listing.tutorId).eq("status", "pending_payment")
    .eq("start_at", start).eq("minutes", minutes).gt("hold_expires_at", now.toISOString()).limit(1);
  const hold = own?.[0];
  if (!hold) break; // none, or the first press failed and ended it
  if (hold.stripe_checkout_session_id) {
    const s = await ctx.payments.getCheckout(hold.stripe_checkout_session_id).catch(() => null);
    if (s?.status === "open") return { booking_id: hold.id, checkout_url: s.url };
    break;
  }
  await new Promise((r) => setTimeout(r, 500)); // the first press is still opening Stripe
}
```

- [ ] **Step 4: A52.** Test in `fn-lesson-changes.test.ts`:

```ts
it("a move onto a lapsed hold succeeds (R60)", async () => {
  const { profileId } = await bookableTutor();
  const [a, b] = await Promise.all([learner(), learner()]);
  const { bookingId } = await bookAndPay(a.t, profileId, slotAt(5, 8));
  const target = slotAt(5, 15);
  const hold = await book(b.t, profileId, target);
  await service().from("booking").update({ hold_expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", hold.body.booking_id);
  expect((await lesson(a.t, "reschedule_lesson", { booking_id: bookingId, start_utc: target })).status).toBe(200);
}, 30000);
```

  Prove RED by running it against the old function (before `migration up`, or by `git stash` of the migration and a
  `supabase db reset`), then GREEN after.

- [ ] **Step 5: A53 (two cancels at once).** Test in `fn-lesson-changes.test.ts`:

```ts
it("learner and tutor cancelling at once: one refund, nobody sees a payment error (R61)", async () => {
  const { profileId, token } = await bookableTutor();
  const { t } = await learner();
  const { bookingId, pi } = await bookAndPay(t, profileId, slotAt(4, 16));
  const rs = await Promise.all([t, token].map((tk) => lesson(tk, "cancel_lesson", { booking_id: bookingId, expected_refund_cents: 4000 })));
  expect(rs.map((r) => r.status)).not.toContain(503);
  expect(await refundCount(pi)).toBe(1);
  expect((await service().from("refund").select("id").eq("booking_id", bookingId)).data!.length).toBe(1);
}, 30000);
```

  Fix: make the fake refund behave like Stripe first (L`payments.ts` fake `refund()`: sum the stored refunds for the
  payment intent; if that plus the new amount exceeds the payment's `amount_cents`, throw
  `PaymentsUnavailable("charge_already_refunded")`), so the test fails for the real reason. Then in L`changes.ts`,
  after the `CANCEL_TERMS_CHANGED` check:

```ts
const claim = async (id: string) => { const { data, error } = await ctx.db.rpc("lesson_claim_cancel", { p_booking: id }); if (error) throw new Error(error.message); return data === true; };
if (!(await claim(row.id))) {
  for (let i = 0; i < 6; i++) { // the other cancel is refunding: wait for its result
    const fresh = await loadBooking(ctx.db, row.id);
    if (fresh && fresh.status !== "confirmed") return { lesson: await freshView(ctx, row.id, by, settings), refunded_cents: 0 };
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new LessonError("CANCEL_IN_PROGRESS", 409, "This lesson is being cancelled. Refresh in a moment.");
}
```

  and in the refund `catch`, before throwing `REFUND_UNAVAILABLE`: `await ctx.db.from("booking").update({ cancel_claimed_at: null }).eq("id", row.id);`.
  Use the real names of `loadBooking` / `freshView` / `settings` found in `changes.ts` (adapt; ledger the names).
  `deletion.ts` claims each confirmed row the same way; a row it cannot claim is re-read, and one still confirmed counts
  as `failed++` (or `RefundStopped` when `stopOnFailure`). App: map `CANCEL_IN_PROGRESS` in `parle-booking.ts` to a new
  key `"lessons.error.cancelInProgress": "This lesson is being cancelled. Refresh in a moment."`.

- [ ] **Step 6: A54 (cancellation email wording).** Test in `lesson-mail.test.ts` (reuse `ctx`, `cancellationMails`):

```ts
it("no money moving is described from who cancelled and the refund history (R62)", () => {
  const [l1] = cancellationMails(ctx(), { by: "tutor", refundCents: 0, refundedBeforeCents: 4000 });
  expect(l1.html).toContain("already refunded");
  expect(l1.html).not.toContain("less than 24 hours");
  const [l2] = cancellationMails(ctx(), { by: "account_deleted", refundCents: 0, deletedParty: "learner" });
  expect(l2.html).toContain("No payment was taken");
});
```

  Fix in L`mail-copy.ts`: `CancelInfo` gains `late?: boolean; refundedBeforeCents?: number`, and

```ts
const refundLine = info.refundCents > 0 ? `We refunded ${money(info.refundCents)} to your card. It can take 5 to 10 business days to appear.`
  : (info.refundedBeforeCents ?? 0) > 0 ? `This lesson was already refunded (${money(info.refundedBeforeCents!)}), so nothing more was charged.`
  : info.by === "learner" && info.late !== false ? "This cancellation came less than 24 hours before the lesson, so it is not refunded."
  : "No payment was taken for this lesson.";
```

  The tutor's opening says "They have been refunded in full" only when `refundCents > 0 || refundedBeforeCents > 0`.
  Callers (`changes.ts`, `deletion.ts`) read `payment.refunded_cents` before refunding (new helper `priorRefunded(db,
  bookingId)` in L`refunds.ts`) and pass `{ by, refundCents, late: outcome.late, refundedBeforeCents }`. The existing
  `by: "learner", refundCents: 0` test keeps the late wording.

- [ ] **Step 7: A55 (slot_lost refund visible and explained).** Tests: in `parle-booking.test.ts`

```ts
it("a slot_lost refund shows the refunded banner (R63)", () => assert.equal(returnBanner(safeLesson(raw({ status: "expired", refund_reason: "slot_lost" }))!), "refunded"));
```

  in `fn-lesson-payments.test.ts`'s existing slot_lost test add
  `expect((await lesson(a.t, "lesson_status", { booking_id: first.body.booking_id })).body.lesson.refund_reason).toBe("slot_lost");`,
  and a new test: seed a hold, set its `tutor_id` to null, `pay` it, then the learner's latest mail (`latestMail`
  helper) has the subject "Your payment was refunded" and no "someone else". Fix:
  - L`view.ts`: `viewsFor` also reads `refund (booking_id, reason)`; `lessonView` adds `refund_reason: string | null`.
  - L`booking.ts` `listLessons`: include `expired` rows, then keep only those with `refund_reason === "slot_lost"`.
  - App: `ParleLesson`/`safeLesson` gain `refund_reason`; `export const returnBanner = (l: ParleLesson) => l.status === "confirmed" ? "confirmed" : l.status === "expired" && l.refund_reason === "slot_lost" ? "refunded" : null;`;
    `LearnerLessons.tsx` stops waiting when `returnBanner(lesson)` is set and shows the banner; new key
    `"lessons.page.refunded": "This time could not be booked, so we refunded your payment in full. It can take 5 to 10 business days to appear."`.
  - L`confirm.ts`: after a slot_lost refund pick the reason: no `tutor_id` gives `"tutor_gone"`; a paused tutor
    (`isPaused`) gives `"tutor_unavailable"`; amount differs from `price_cents` gives `"amount_mismatch"`; otherwise
    `"time_taken"`; pass it to `sendSlotLost(db, id, cents, reason)`; `slotLostMail` opens per reason (e.g. "Your
    tutor is no longer taking lessons on Parle, so we refunded your payment in full.").
  - L`notify.ts` `mailContext(db, row, { allowMissingTutor: true })` (slot-lost only) uses
    `{ email: "", name: "your tutor", timeZone: learner.timeZone }` when the tutor is gone.

- [ ] **Step 8: A57.** Test in `booking-schema.test.ts`:

```ts
it("a tutor cannot read holds; the browser cannot read commission or messages (R65)", async () => {
  const [tu, le] = await Promise.all([makeUser("tutor"), makeUser("learner")]);
  const { data } = await row(tu.id, le.id, at(16), { status: "pending_payment", hold_expires_at: new Date(Date.now() + 600_000).toISOString(), learner_message: "secret" });
  expect(((await tu.client.from("booking").select("id").eq("id", data!.id)).data ?? []).length).toBe(0);
  expect((await le.client.from("booking").select("commission_pct").eq("id", data!.id)).error).not.toBeNull();
  expect((await le.client.from("booking").select("learner_message").eq("id", data!.id)).error).not.toBeNull();
});
```

  (RED before the migration, GREEN after; the app reads `booking` only through `parle-lesson-service`; the existing
  `access-rules` and `booking-schema` tests select only `id` and keep passing.)

- [ ] **Step 9: A58 (Checkout expiry margin).** Test in `fn-lesson-booking.test.ts`:

```ts
it("the Checkout page outlives the hold by about 3 minutes (R66)", async () => {
  const { profileId } = await bookableTutor(); const { t } = await learner();
  const r = await book(t, profileId, slotAt(6, 9));
  const { data: b } = await service().from("booking").select("stripe_checkout_session_id, hold_expires_at").eq("id", r.body.booking_id).single();
  const { data: s } = await service().from("stripe_test_object").select("data").eq("id", b!.stripe_checkout_session_id).single();
  expect(Number(s!.data.expires_at) - Math.floor(Date.parse(b!.hold_expires_at) / 1000)).toBeGreaterThanOrEqual(170);
});
```

  Fix in L`booking.ts` (~115): `expiresAt: Math.floor(Math.max(Date.parse(hold!.hold_expires_at!), Date.now() + 30 * 60_000) / 1000) + 180,`
  with the comment "Stripe needs at least 30 minutes from its own clock: 3 minutes past the hold".

- [ ] **Step 10: A59 and A80 (holds ended by deletion or a pause are refunded, never confirmed).** Tests: in
  `fn-lesson-payments.test.ts`

```ts
it("a payment for a hold ended by account deletion is refunded, not confirmed (R67)", async () => {
  const { profileId } = await bookableTutor(); const { t } = await learner();
  const r = await book(t, profileId, slotAt(4, 17));
  await service().from("booking").update({ status: "expired", cancelled_by: "account_deleted" }).eq("id", r.body.booking_id);
  const paid = await pay(r.body.booking_id);
  expect(paid.body.handled).toBe("slot_lost");
  expect(await refundCount(paid.pi)).toBe(1);
});
```

  and in `fn-admin-accounts.test.ts`

```ts
it("pausing with 'keep' ends payment holds, and a late payment is refunded (R88)", async () => {
  const admin = await adminUser(); const { tutor, profileId } = await bookableTutor(); const { t } = await learner();
  const r = await book(t, profileId, slotAt(5, 9));
  await adminCall(admin.token, "admin_disable_account", { user_id: tutor.id, reason: "Off-platform payments", cancel_lessons: false });
  expect(psql(`select status || '|' || cancelled_by from public.booking where id = '${r.body.booking_id}'`)).toBe("expired|admin");
  const paid = await pay(r.body.booking_id);
  expect(paid.body.handled).toBe("slot_lost");
  expect(await refundCount(paid.pi)).toBe(1);
}, 30000);
```

  Fix: in L`deletion.ts` extract

```ts
export async function endOpenHolds(db: SupabaseClient, payments: LessonPayments, who: { id: string }, now: Date, cause: CancelCause): Promise<number> {
  const { data: holds, error } = await db.from("booking").select("id, stripe_checkout_session_id")
    .or(`learner_id.eq.${who.id},tutor_id.eq.${who.id}`).eq("status", "pending_payment");
  if (error) throw new Error(error.message);
  for (const h of holds ?? []) {
    if (h.stripe_checkout_session_id) await payments.expireCheckout(h.stripe_checkout_session_id).catch(() => undefined);
    must(await db.from("booking").update({ status: "expired", cancelled_by: cause, status_changed_at: now.toISOString() }).eq("id", h.id).eq("status", "pending_payment"));
  }
  return (holds ?? []).length;
}
```

  `cancelFutureLessons` calls it (replacing its own hold loop, which must now also set `cancelled_by`), and
  `_shared/admin/accounts.ts` `disableAccount` calls `endOpenHolds(ctx.db, ctx.payments, { id }, ctx.now, "admin")`
  on every pause, before the keep/cancel branch. (`cancelled_by` allows `account_deleted` and `admin`, migration 027.)

- [ ] **Step 11: A56 (deletion order).** In `_shared/account-deletion.ts` move the photo listing (`listPhotos`) and the
  `listening_audio` select (with its error check) above the lessons block, so an unreachable storage or database
  stops the deletion before any refund; the removals stay where they are. A failure after the refunds is accepted (a
  retry finishes the deletion and refunds nothing twice). No new test (no storage fake); the existing
  `account-deletion.test.ts` must stay green. Ledger the acceptance.

- [ ] **Step 12: Run and commit.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-backend && bun scripts/sync-app-code.ts | tail -1
bun test tests/fn-lesson-booking.test.ts tests/fn-lesson-changes.test.ts tests/fn-lesson-payments.test.ts tests/lesson-mail.test.ts tests/booking-schema.test.ts tests/fn-admin-accounts.test.ts tests/account-deletion.test.ts tests/access-rules.test.ts 2>&1 | grep -E "^\(fail\)|^ [0-9]+ (pass|fail)"
cd ../parle-app && bun run test 2>&1 | grep -E "^\(fail\)|^ [0-9]+ (pass|fail)"
```

Expected: `0 fail` in both. Commit `fix(booking): pre-launch close-out (A50-A59, A80; migration 000030)`.

---

### Task 3: Payout fixes (A60-A68, A70, A101)

**Files:**
- Create: `07_Engineering/parle-backend/supabase/migrations/20261016000031_payout_fixes.sql`
- Modify: `parle-backend/supabase/functions/_shared/payouts/send.ts`, `admin.ts`, `accounts.ts`, `rules.ts`,
  `webhook.ts`, `earnings.ts`; `_shared/lessons/jobs.ts`, `_shared/lessons/payments.ts` (real and fake);
  `stripe-webhook/index.ts`
- Modify (app): `parle-app/src/lib/parle-payouts.ts`, `src/pages/TutorEarnings.tsx`, `src/lib/i18n.ts`
- Test: `parle-backend/tests/fn-payout-send.test.ts`, `fn-payout-webhook.test.ts`, `fn-payout-fixes.test.ts`,
  `fn-payout-accounts.test.ts`, `fn-payout-schedule.test.ts`, `payout-rules.test.ts`, `tests/helpers/lessons.ts`
  (`failNext` gains `"account_refused"`); `parle-app/src/lib/parle-payouts.test.ts`

Helpers (`tests/helpers/lessons.ts`): `service, bookableTutor, learner, lesson, seedConfirmed, schedulePayout, payoutOf,
payoutAction, adminToken, failNext, clearFakeFailures, runJobs, onlyTheseDue, fakeTransfers, refundCount, sendEvent,
setFakeAccount, ensurePayoutCountry, statusOf`; `fn-payout-fixes.test.ts` and `fn-payout-admin.test.ts` have a local
`heldLesson()` (a reported lesson, payout held, price 4000, 20 % commission, share 3200); `fn-payout-send.test.ts` has
`duePayout()` and `hoursAgo()`; `fn-payout-webhook.test.ts` has `accountEvent()` and `at()`. B =
`parle-backend/supabase/functions`.

- [ ] **Step 1: the migration** `20261016000031_payout_fixes.sql` (written now; applied in Step 2 after the SQL-backed
  tests have been watched failing):

```sql
-- A60 (R68): the jobs release account_not_ready holds whose account can now receive payouts
create or replace function public.payout_release_ready(p_limit int) returns table (id uuid)
language sql security definer set search_path = '' as $$
  update public.payout p set status = 'scheduled', hold_reason = null, held_at = null, updated_at = now()
   where p.id in (select p2.id from public.payout p2 join public.tutor_payout_account a on a.tutor_id = p2.tutor_id
                   where p2.status = 'held' and p2.hold_reason = 'account_not_ready' and p2.decision is null
                     and a.stripe_account_id is not null and a.payouts_enabled
                   order by p2.held_at limit greatest(1, least(p_limit, 500)) for update of p2 skip locked)
     and p.status = 'held' and p.hold_reason = 'account_not_ready' and p.decision is null
  returning p.id;
$$;
revoke all on function public.payout_release_ready(int) from public, anon, authenticated;
grant execute on function public.payout_release_ready(int) to service_role;

-- A61 (R69) and A64 (R72): a claim mark that is never cleared, and a count of decisions after payout
alter table public.payout add column if not exists transfer_claimed_at timestamptz;
alter table public.payout add column if not exists after_payout_decisions int not null default 0;
update public.payout set transfer_claimed_at = coalesce(transfer_started_at, updated_at)
 where transfer_claimed_at is null and (transfer_started_at is not null or hold_reason = 'transfer_failed' or stripe_transfer_id is not null);
```

  Then, from the live definitions (`pg_get_functiondef`), `create or replace`:
  - `public.payout_claim(uuid)`: body unchanged except the claiming update also sets
    `transfer_claimed_at = coalesce(p.transfer_claimed_at, now())`.
  - `public.payout_decide(uuid, text, int, int, text)`:

```sql
create or replace function public.payout_decide(p_payout uuid, p_kind text, p_amount int, p_commission int, p_by text) returns text
language plpgsql security definer set search_path = '' as $$
declare v public.payout%rowtype;
begin
  select * into v from public.payout where id = p_payout for update;
  if not found or v.decision is distinct from p_kind then return 'not_claimed'; end if;
  if p_kind = 'refund' then
    update public.payout set status = 'cancelled', hold_reason = null, held_at = null, decision = null, decision_by = null, decision_at = null,
           decided_by = p_by, decided_at = now(), updated_at = now() where id = v.id;
  elsif p_kind in ('release', 'split') then
    update public.payout set status = 'scheduled', release_at = now(), hold_reason = null, held_at = null, transfer_started_at = now(),
           transfer_claimed_at = coalesce(transfer_claimed_at, now()),
           amount_cents = coalesce(p_amount, amount_cents), commission_cents = coalesce(p_commission, commission_cents),
           transfer_attempt = transfer_attempt + case when v.transfer_claimed_at is not null or v.hold_reason = 'transfer_failed' or p_kind = 'split' then 1 else 0 end,
           decision = null, decision_by = null, decision_at = null, decided_by = p_by, decided_at = now(), updated_at = now()
     where id = v.id;
  elsif p_kind = 'refund_after_payout' then
    update public.payout set after_payout_decisions = after_payout_decisions + 1, decision = null, decision_by = null, decision_at = null,
           decided_by = p_by, decided_at = now(), updated_at = now() where id = v.id;
  else return 'invalid'; end if;
  update public.booking set status = disputed_from, status_changed_at = now() where id = v.booking_id and status = 'disputed' and disputed_from is not null;
  return 'decided';
end; $$;
```

    Compare with the live body first: any branch it has that this text lacks is kept (ledger the merge).

```sql
-- A64 backfill (check admin_audit_log.target_id's type first; cast as needed)
update public.payout p set after_payout_decisions = 1 where p.status = 'paid'
   and exists (select 1 from public.admin_audit_log l where l.target_id = p.id::text and l.action = 'payout.refund_after_payout');

-- A65 (R73): the Connect account key counts attempts; a second account can never replace the first
alter table public.tutor_payout_account add column if not exists connect_attempt int not null default 0;
create or replace function public.payout_account_connect_failed(p_tutor uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.tutor_payout_account (tutor_id, connect_attempt) values (p_tutor, 1)
  on conflict (tutor_id) do update set connect_attempt = public.tutor_payout_account.connect_attempt + 1, updated_at = now()
   where public.tutor_payout_account.stripe_account_id is null;
$$;
create or replace function public.payout_account_link(p_tutor uuid, p_account text, p_country text, p_enabled boolean, p_submitted boolean, p_reason text) returns text
language sql security definer set search_path = '' as $$
  insert into public.tutor_payout_account (tutor_id, stripe_account_id, country, payouts_enabled, details_submitted, disabled_reason, waitlisted_at)
  values (p_tutor, p_account, p_country, p_enabled, p_submitted, coalesce(p_reason, ''), null)
  on conflict (tutor_id) do update set stripe_account_id = excluded.stripe_account_id, country = excluded.country, payouts_enabled = excluded.payouts_enabled,
    details_submitted = excluded.details_submitted, disabled_reason = excluded.disabled_reason, waitlisted_at = null, updated_at = now()
   where public.tutor_payout_account.stripe_account_id is null
  returning stripe_account_id;
$$;
revoke all on function public.payout_account_connect_failed(uuid) from public, anon, authenticated;
grant execute on function public.payout_account_connect_failed(uuid) to service_role;
revoke all on function public.payout_account_link(uuid, text, text, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.payout_account_link(uuid, text, text, boolean, boolean, text) to service_role;

-- A67 (R75): refunded_cents is the refund rows' sum (or Stripe's higher total from charge.refunded), never added twice
create or replace function public.lesson_record_refund(p_booking uuid, p_amount int, p_refund_id text, p_reason text, p_by text, p_event text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_inserted int; v_rows int;
begin
  perform 1 from public.payment where booking_id = p_booking for update;
  insert into public.refund (booking_id, amount_cents, reason, stripe_refund_id, decided_by) values (p_booking, p_amount, p_reason, p_refund_id, p_by) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    select coalesce(sum(amount_cents), 0)::int into v_rows from public.refund where booking_id = p_booking;
    update public.payment set refunded_cents = least(amount_cents, greatest(refunded_cents, v_rows)),
           status = case when status = 'disputed' then 'disputed' when greatest(refunded_cents, v_rows) >= amount_cents then 'refunded' else 'partly_refunded' end,
           updated_at = now()
     where booking_id = p_booking;
  end if;
  if p_reason = 'slot_lost' then
    update public.booking set status = 'expired', status_changed_at = now(), hold_expires_at = null where id = p_booking and status = 'pending_payment';
  end if;
  if p_event is not null then insert into public.stripe_event (id, type) values (p_event, 'refund') on conflict (id) do nothing; end if;
  return case when v_inserted > 0 then 'recorded' else 'already' end;
end; $$;
```

  (Compare `lesson_record_refund` with its live body too; keep its grants.) Do not apply yet.

- [ ] **Step 2: the SQL-backed tests, RED, then apply.** Write these tests, run them (they fail against the current
  database), then `bunx supabase migration up` and the TypeScript changes of Steps 3-8, then run them GREEN:

  `fn-payout-send.test.ts`:

```ts
it("an account_not_ready hold is released by the jobs once the account is enabled (A60)", async () => {
  await clearFakeFailures();
  const { bookingId, payout } = await duePayout();
  await onlyTheseDue([payout.id]);
  await service().rpc("payout_hold", { p_payout: payout.id, p_reason: "account_not_ready" });
  await runJobs();
  expect(await payoutOf(bookingId)).toMatchObject({ status: "paid" });
});
it("a report after a failed transfer still gives Release a new attempt (A61)", async () => {
  await clearFakeFailures();
  const admin = await adminToken();
  const { profileId, tutor } = await bookableTutor();
  const { u, t } = await learner();
  const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: hoursAgo(5), status: "completed" });
  await schedulePayout(b.bookingId, 0);
  const p = await payoutOf(b.bookingId);
  await onlyTheseDue([p.id]); await failNext("transfer"); await runJobs();
  expect((await lesson(t, "report_problem", { booking_id: b.bookingId, kind: "other", details: "x" })).status).toBe(200);
  expect((await payoutOf(b.bookingId)).hold_reason).toBe("dispute");
  expect((await payoutAction(admin, "admin_release_payout", { payout_id: p.id })).body.sent).toBe("paid");
  expect((await payoutOf(b.bookingId)).transfer_attempt).toBe(1);
});
```

  `fn-payout-fixes.test.ts`:

```ts
it("a chargeback decided after payout leaves the list; a second decision gets its own reversal (A64)", async () => {
  await clearFakeFailures();
  const admin = await adminToken();
  const h = await heldLesson();
  await payoutAction(admin, "admin_release_payout", { payout_id: h.payout.id });
  await sendEvent("charge.dispute.created", { id: `dp_${crypto.randomUUID().slice(0, 8)}`, object: "dispute", payment_intent: h.pi });
  expect((await payoutAction(admin, "admin_refund_after_payout", { payout_id: h.payout.id, refund_cents: 2000, tutor_share: "reverse" })).status).toBe(200);
  expect((await payoutAction(admin, "admin_list_payouts")).body.after_payout.map((i: any) => i.payout_id)).not.toContain(h.payout.id);
  await payoutAction(admin, "admin_refund_after_payout", { payout_id: h.payout.id, refund_cents: 4000, tutor_share: "reverse" });
  expect((await payoutOf(h.bookingId)).reversed_cents).toBe(3200);
});
it("charge.refunded arriving before the refund is recorded does not count it twice (A67)", async () => {
  const { profileId, tutor } = await bookableTutor(); const { u } = await learner();
  const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-5), status: "completed" });
  await service().from("payment").update({ refunded_cents: 1000, status: "partly_refunded" }).eq("booking_id", b.bookingId);
  await service().rpc("lesson_record_refund", { p_booking: b.bookingId, p_amount: 1000, p_refund_id: `re_${crypto.randomUUID()}`, p_reason: "admin_split", p_by: "t", p_event: null });
  expect((await service().from("payment").select("refunded_cents").eq("booking_id", b.bookingId).single()).data!.refunded_cents).toBe(1000);
});
```

  `fn-payout-accounts.test.ts` (`accountOf` reads `tutor_payout_account` by tutor; add it locally if missing):

```ts
it("a refused account creation can be retried at once and makes one account (A65)", async () => {
  await clearFakeFailures(); await ensurePayoutCountry("Canada", "CA", "supported");
  const { tutor, token } = await bookableTutor({ payouts: false });
  await failNext("account_refused");
  expect((await payoutAction(token, "tutor_payout_onboarding")).status).toBe(503);
  expect((await payoutAction(token, "tutor_payout_onboarding")).status).toBe(200);
  expect((await accountOf(tutor.id))!.connect_attempt).toBe(1);
});
```

- [ ] **Step 3: A60 (TypeScript).** `send.ts`:

```ts
export const releaseReadyHolds: JobStep = async (db, _p, _s, now) => {
  const { data, error } = await db.rpc("payout_release_ready", { p_limit: BATCH });
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as Array<{ id: string }>)
    await auditPayout(db, { actorId: null, actorLabel: "system", action: "payout.auto_release", payoutId: r.id, oldValue: "held: account_not_ready", newValue: "scheduled: the payout account can receive payouts", now });
  return (data ?? []).length;
};
```

  (use the real audit helper's name and shape found in `_shared/payouts/`); `jobs.ts` `JOB_STEPS`: insert
  `["payouts_released", releaseReadyHolds]` before `["payouts_sent", ...]`. `webhook.ts`: `handlePayoutEvent` gains a
  `payments: LessonPayments` parameter (`stripe-webhook/index.ts` passes `lessonPayments(db)`) and, for
  `account.updated`, applies Stripe's current state (`await payments.getConnectAccount(String(object.id))`) instead of
  the payload (Stripe unreachable: the webhook answers 500 and Stripe retries). Test in `fn-payout-webhook.test.ts`:

```ts
it("an account.updated delivered late does not undo Stripe's current state (A60)", async () => {
  await ensurePayoutCountry("Canada", "CA", "supported");
  const { tutor, token } = await bookableTutor({ payouts: false });
  await payoutAction(token, "tutor_payout_onboarding");
  const id = (await service().from("tutor_payout_account").select("stripe_account_id").eq("tutor_id", tutor.id).single()).data!.stripe_account_id;
  await setFakeAccount(id, { payouts_enabled: true, details_submitted: true, requirements: { disabled_reason: null } });
  await sendEvent("account.updated", accountEvent(id, false), undefined, { account: id });
  expect((await service().from("tutor_payout_account").select("payouts_enabled").eq("tutor_id", tutor.id).single()).data!.payouts_enabled).toBe(true);
});
```

  The existing test "account.updated opens and closes booking" calls `setFakeAccount` before each event (the handler
  now reads the fake account); ledger that test change.

- [ ] **Step 4: A62 (a crashed refund decision cannot be followed by a Release or a split).** Test in
  `fn-payout-fixes.test.ts`:

```ts
it("release refuses when an earlier refund decision refunded the learner but crashed (A62)", async () => {
  await clearFakeFailures();
  const admin = await adminToken();
  const h = await heldLesson();
  await service().from("stripe_test_object").insert({ id: `re_fake_crash_${crypto.randomUUID().slice(0, 8)}`, kind: "refund",
    data: { payment_intent: h.pi, amount: 4000, booking_id: h.bookingId, reason: "admin" } });
  await service().from("payout").update({ decision: "refund", decision_at: new Date(Date.now() - 6 * 60_000).toISOString() }).eq("id", h.payout.id);
  expect((await payoutAction(admin, "admin_release_payout", { payout_id: h.payout.id })).body.error_code).toBe("ALREADY_REFUNDED");
  expect(await fakeTransfers(h.payout.id)).toBe(0);
  expect((await payoutAction(admin, "admin_refund_payout", { payout_id: h.payout.id })).status).toBe(200);
  expect(await refundCount(h.pi)).toBe(1);
});
```

  Fix in `admin.ts`: a `refuseIfRefunded(ctx, payout, booking, payment, kind)` called in `adminRelease` and
  `adminSplit` right after `begin(...)` (Release now loads `booking, payment` too): a `refund` row with reason
  `admin`, or a Stripe refund found by `ctx.payments.findRefund(payment.stripe_payment_intent_id, booking.id, "admin")`
  (recorded with `lesson_record_refund` when found), aborts the decision (`abort(ctx, payout.id, kind)`) and throws
  `new LessonError("ALREADY_REFUNDED", 409, "The learner was already refunded for this lesson. Press Refund the learner to finish cancelling the payout.")`;
  a lookup failure aborts and throws the existing `UNAVAILABLE()`. If `findRefund` does not exist on the payments
  interface, add it (real: list refunds for the payment intent and match `metadata.booking_id` and `reason`; fake: read
  `stripe_test_object` kind `refund`). Replace the "Nothing changed" text (`admin.ts` ~144 and ~167, `i18n.ts` ~2918)
  with "Stripe did not confirm the learner's refund. Press the same button again in a few minutes: a refund already
  made is not made twice." App: `ERROR_KEYS` in `parle-payouts.ts` gains `ALREADY_REFUNDED: "payouts.error.alreadyRefunded"`
  (and the missing `ALREADY_PAID`), with i18n keys.

- [ ] **Step 5: A63 (reversal base after a split).** Test in `fn-payout-fixes.test.ts`:

```ts
it("refund after payout following a split reverses the share of what the learner still paid (A63)", async () => {
  await clearFakeFailures();
  const admin = await adminToken();
  const h = await heldLesson();
  expect((await payoutAction(admin, "admin_split_payout", { payout_id: h.payout.id, refund_cents: 1000 })).body.sent).toBe("paid");
  expect((await payoutAction(admin, "admin_refund_after_payout", { payout_id: h.payout.id, refund_cents: 3000, tutor_share: "reverse" })).status).toBe(200);
  expect((await payoutOf(h.bookingId)).reversed_cents).toBe(2400);
});
```

  Fix in `admin.ts` (~199): `priceCents: payout.amount_cents + payout.commission_cents` (what the learner still paid
  when the payout was made, on every current path) in the `reversalCents` call.

- [ ] **Step 6: A64, A65 (TypeScript).** A64: `adminListPayouts` adds `.eq("after_payout_decisions", 0)` to the paid
  query; `PayoutRow` gains `after_payout_decisions`; the reversal key becomes
  `` `payout-reversal:${payout.id}:admin_after_payout:${payout.after_payout_decisions}` ``. A65: `rules.ts`
  `connectAccountKey(tutorId: string, attempt: number)` returns `` `connect-account:${tutorId}:${attempt}` ``;
  `createConnectAccount` takes `attempt` (`account?.connect_attempt ?? 0`); on failure `db.rpc("payout_account_connect_failed", { p_tutor: caller.id })`
  then `UNAVAILABLE()`; the upsert becomes `db.rpc("payout_account_link", {...})`; the message "a few minutes" becomes
  "Please try again."; the fake keys on `connectAccountKey(i.tutorId, i.attempt)` and learns an `account_refused`
  failure stored and replayed per key (copy the refund failure pattern). `payout-rules.test.ts` (~66-75) is rewritten:

```ts
expect(connectAccountKey("t1", 0)).toBe("connect-account:t1:0");
expect(connectAccountKey("t1", 0)).not.toBe(connectAccountKey("t1", 1));
expect(src).toContain("idempotencyKey: connectAccountKey(i.tutorId, i.attempt)");
```

- [ ] **Step 7: A66 (webhook dedupe and signing secrets).** Test in `fn-payout-webhook.test.ts`:

```ts
it("each signing secret only carries its own events; a duplicate delivered at once is handled once (A66)", async () => {
  const { tutor, profileId } = await bookableTutor(); const { u } = await learner();
  const done = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-80), status: "completed" });
  await schedulePayout(done.bookingId, 500); const p = await payoutOf(done.bookingId);
  const obj = { id: `tr_x_${crypto.randomUUID().slice(0, 8)}`, object: "transfer", amount: 3200, metadata: { kind: "lesson_payout", payout_id: p.id } };
  expect((await sendEvent("transfer.created", obj, undefined, { account: "acct_x" })).body.handled).toBe("wrong_destination");
  expect((await payoutOf(done.bookingId)).status).toBe("scheduled");
  const id = `evt_race_${crypto.randomUUID().slice(0, 8)}`;
  const both = await Promise.all([sendEvent("transfer.created", obj, id), sendEvent("transfer.created", obj, id)]);
  expect(both.map((r) => r.body.handled).sort()).toEqual(["duplicate", "payout_paid"]);
});
```

  Fix: `webhook.ts` claims the event first
  (`db.from("stripe_event").upsert({ id: eventId, type }, { onConflict: "id", ignoreDuplicates: true }).select("id")`;
  nothing claimed: `{ received: true, handled: "duplicate" }`), runs the existing branches in a `try`, deletes the
  claim on error and rethrows (the handlers are idempotent), and drops the final insert. `stripe-webhook/index.ts`:
  verify with the platform secret, then the Connect secret, remembering which matched; `account.updated` must come
  through the Connect secret and every other type through the platform secret, otherwise answer
  `{ received: true, handled: "wrong_destination" }`. Check how `sendEvent` signs (the `account` option means the
  Connect destination); the local secrets differ (`setup-local-functions-env.ts`).

- [ ] **Step 8: A70 (Earnings shows what Stripe sent) and A101 (a charge that already has a transfer group).** Tests:
  `payout-rules.test.ts`:

```ts
it("earnings show what the transfer sent when it differs (A70)", () => {
  const row = { booking_id: "b", start_at: "2026-10-01T10:00:00Z", minutes: 60, status: "completed", late_cancel: false, price_cents: 4000, commission_pct: 20, learner_name: "A",
    payout: { status: "paid", amount_cents: 3200, commission_cents: 800, release_at: "2026-10-04T10:00:00Z", hold_reason: null, paid_at: "2026-10-04T10:00:00Z", stripe_transfer_id: "tr", reversed_cents: 0, transfer_cents: 4480 } };
  expect(earningsView([row as EarningRow], "UTC").lines[0].sent_cents).toBe(4480);
  expect(earningsView([{ ...row, payout: { ...row.payout, transfer_cents: 3200 } } as EarningRow], "UTC").lines[0].sent_cents).toBeNull();
});
it("a charge that already has a transfer group gets no group of ours (A101)", () => {
  expect(transferGroupFor(null, "p1")).toBe("payout-p1");
  expect(transferGroupFor("group_manual", "p1")).toBeUndefined();
});
```

  `fn-payout-send.test.ts`:

```ts
it("a payout from a charge that already has a transfer group is still sent (A101)", async () => {
  await clearFakeFailures();
  const { bookingId, payout } = await duePayout();
  const { data: pay } = await service().from("payment").select("stripe_payment_intent_id").eq("booking_id", bookingId).single();
  await service().from("stripe_test_object").insert({ id: `ch_fake_${pay!.stripe_payment_intent_id.slice(-16)}`, kind: "charge", data: { transfer_group: "group_manual" } });
  await onlyTheseDue([payout.id]); await runJobs();
  const paid = await payoutOf(bookingId);
  expect(paid.status).toBe("paid");
  expect((await service().from("stripe_test_object").select("data").eq("id", paid.stripe_transfer_id).single()).data!.data.transfer_group).toBe("group_manual");
});
```

  (Check how the fake names a payment intent's charge; adapt the inserted id to it.) `parle-payouts.test.ts`: keeps
  `sent_cents` (4480) and null when missing, and `hasTranslationKey("earnings.line.sentConverted")`. Fixes:
  - A70: `earnings.ts` selects `transfer_cents, transfer_currency`; `rules.ts` `EarningPayout.transfer_cents`,
    `EarningLine.sent_cents = p && p.transfer_cents != null && Number(p.transfer_cents) !== p.amount_cents - reversed ? Number(p.transfer_cents) : null`;
    app `EarningLine.sent_cents` with `safeEarningLine`; `TutorEarnings.tsx` shows, for a paid line with `sent_cents`,
    `t("earnings.line.sentConverted", { amount: formatCadCents(line.sent_cents) })`; i18n
    `"earnings.line.sentConverted": "Stripe sent {amount} (converted from a payment in another currency)"`.
  - A101: `rules.ts` `transferGroupFor(chargeGroup, payoutId)` returns `chargeGroup ? undefined : \`payout-${payoutId}\``;
    the real `transfer` reads the source charge's `transfer_group` and sends our group only when it has none;
    `findTransfer(payoutId, accountId?)` looks up by our group, then (with `accountId`) lists the account's transfers
    and matches `metadata.payout_id`; callers (`send.ts` ~42 and ~86, `admin.ts` ~82) pass the tutor's
    `stripe_account_id`. The fake transfer refuses (`PaymentsUnavailable("transfer_group conflict")`) when the charge
    has a group and one is passed, so the test fails first for Stripe's real reason; it stores
    `transfer_group: group ?? chargeGroup`.

- [ ] **Step 9: A68 (the concurrent Review Focus 1 test).** In `fn-payout-schedule.test.ts` after the sequential test:

```ts
it("a report and a claim at the same instant: exactly one wins (Review Focus 1, concurrent)", async () => {
  const { profileId, tutor } = await bookableTutor(); const { u, t } = await learner();
  for (let i = 0; i < 5; i++) {
    const b = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-5 - i), status: "completed" });
    await schedulePayout(b.bookingId, 0); const p = await payoutOf(b.bookingId);
    const [claim, report] = await Promise.all([service().rpc("payout_claim", { p_payout: p.id }), lesson(t, "report_problem", { booking_id: b.bookingId, kind: "other", details: "" })]);
    const reported = report.body.lesson?.status === "disputed";
    expect(claim.data === "claimed").toBe(!reported);
    expect(await payoutOf(b.bookingId)).toMatchObject(reported ? { status: "held", transfer_started_at: null } : { status: "scheduled" });
    expect(await statusOf(b.bookingId)).toBe(reported ? "disputed" : "completed");
  }
});
```

  (A coverage test: it may pass at once; the SQL is believed race-safe. Ledger whether it passed first.)

- [ ] **Step 10: Run and commit.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-backend && bun scripts/sync-app-code.ts | tail -1
bun test tests/fn-payout-send.test.ts tests/fn-payout-webhook.test.ts tests/fn-payout-fixes.test.ts tests/fn-payout-accounts.test.ts tests/fn-payout-schedule.test.ts tests/fn-payout-admin.test.ts tests/payout-rules.test.ts tests/fn-lesson-payments.test.ts 2>&1 | grep -E "^\(fail\)|^ [0-9]+ (pass|fail)"
cd ../parle-app && bun run test 2>&1 | grep -E "^\(fail\)|^ [0-9]+ (pass|fail)"
```

Expected: `0 fail` in both. Commit `fix(payouts): pre-launch close-out (A60-A68, A70, A101; migration 000031)`.

---

### Task 4: Administration and waitlist fixes (A73-A79, A82, A85, A87)

**Files:**
- Create: `07_Engineering/parle-backend/supabase/migrations/20261016000032_admin_waitlist_fixes.sql`
- Modify: `parle-backend/supabase/functions/_shared/admin/accounts.ts` (`enableAccount`),
  `_shared/waitlist/send.ts`, `config.ts`, `token.ts`, `unsubscribe.ts`; `scripts/prod/env.ts`,
  `scripts/setup-local-functions-env.ts` (comment)
- Modify (app): `parle-app/src/lib/parle-admin.ts`, `src/pages/AdminWaitlist.tsx`, `src/lib/i18n.ts`,
  `src/pages/LearnerTutorPlaceholder.tsx`; create `src/lib/tutor-open.ts`; delete
  `functions/parle-admin-metrics.helper.ts` and `src/lib/admin-metrics.test.ts`; edit
  `functions/parle-marketplace-service.ts`, `functions/parle-admin-access.helper.ts`
- Modify (site): `07_Engineering/parle-waitlist/unsubscribe.html`, `vercel.json`, `README.md`
- Test: `parle-backend/tests/fn-admin-accounts.test.ts`, `fn-waitlist.test.ts`, `waitlist-mail.test.ts`,
  `waitlist-site.test.ts`, `admin-waitlist-schema.test.ts`, `fn-marketplace.test.ts`; `parle-app/src/lib/parle-admin.test.ts`,
  `admin-access.test.ts`, `tutor-open.test.ts` (new)

Helpers: `fn-admin-accounts.test.ts` has `adminUser`, `adminCall`, `psql`, a local `approve`, and `bookableTutor` from
`helpers/lessons`; `fn-waitlist.test.ts` has `joinWaitlist`, `resetWaitlist`, `runWaitlistJobs`, local `ready`, `drain`,
`addr`; `waitlist-site.test.ts` has `SITE`.

- [ ] **Step 1: the migration** `20261016000032_admin_waitlist_fixes.sql` (applied in Step 2 after its tests fail):

```sql
-- A73 (R81): no path publishes a paused tutor's listing; the listing is remembered so enabling republishes it
create or replace function private.keep_paused_listing_hidden() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_user text := coalesce(new.tutor_user_id, new.owner_id::text);
begin
  if new.is_published is true and exists (select 1 from public.account_status s where s.user_id::text = v_user and s.status = 'disabled') then
    new.is_published := false;
    update public.account_status set unpublished_listing_ids = array_append(unpublished_listing_ids, new.id::text)
     where user_id::text = v_user and not (new.id::text = any(unpublished_listing_ids));
  end if;
  return new;
end; $$;
drop trigger if exists keep_paused_listing_hidden on public.tutor_public_profile;
create trigger keep_paused_listing_hidden before insert or update of is_published on public.tutor_public_profile
  for each row execute function private.keep_paused_listing_hidden();
```

  (Check the real column names first: `tutor_public_profile.tutor_user_id` / `owner_id`, `account_status.user_id` and
  `unpublished_listing_ids`, and whether the `private` schema exists; if not, put the function in `public` with
  execute revoked from everyone. Adapt the SQL; ledger the names.)

  Then (A79) `create or replace function public.waitlist_overview()`: copy the live body and add, inside each
  campaign object, the count Send would queue now (same rules as `waitlist_queue`):

```sql
'to_send', (select count(distinct lower(trim(w.email))) from public.waitlist_signup w
             where coalesce(trim(w.email), '') <> '' and (c.campaign = 'launch' or w.role = 'tutor')
               and not exists (select 1 from public.waitlist_unsubscribe u where u.email = lower(trim(w.email)))
               and not exists (select 1 from public.waitlist_send s where s.campaign = c.campaign and s.email = lower(trim(w.email))))
```

  Compare the conditions with the live `waitlist_queue` body and copy them exactly. End with
  `grant execute on function public.waitlist_overview() to service_role;`. `waitlist_signup` and `join_waitlist()` are
  not touched.

- [ ] **Step 2: A73 and A79 tests, RED, then apply.** `fn-admin-accounts.test.ts`:

```ts
it("no other path republishes a paused tutor's listing; enabling republishes it (R81)", async () => {
  const admin = await adminUser(); const { tutor, profileId } = await bookableTutor(); approve(profileId, tutor.email);
  await adminCall(admin.token, "admin_disable_account", { user_id: tutor.id, reason: "Investigation", cancel_lessons: false });
  psql(`update public.tutor_public_profile set is_published = true where profile_id = '${profileId}'`);
  expect(psql(`select is_published from public.tutor_public_profile where profile_id = '${profileId}'`)).toBe("f");
  expect((await adminCall(admin.token, "admin_enable_account", { user_id: tutor.id })).body.republished).toBe(1);
  expect(psql(`select is_published from public.tutor_public_profile where profile_id = '${profileId}'`)).toBe("t");
}, 30000);
```

  `admin-waitlist-schema.test.ts`:

```ts
it("the Send count is the addresses that would be queued (R87)", async () => {
  const both = `both-${crypto.randomUUID().slice(0, 8)}@example.test`, l = `l-${crypto.randomUUID().slice(0, 8)}@example.test`, gone = `u-${crypto.randomUUID().slice(0, 8)}@example.test`;
  await joinWaitlist(both, "learner"); await joinWaitlist(both, "tutor"); await joinWaitlist(l); await joinWaitlist(gone);
  psql(`select public.waitlist_record_unsubscribe('${gone}', 'admin')`);
  const toSend = (c: string) => psql(`select public.waitlist_overview()->'campaigns'->'${c}'->>'to_send'`);
  expect(toSend("launch")).toBe("2"); expect(toSend("founding_tutor")).toBe("1");
  psql("select public.waitlist_queue('launch', 'test')"); expect(toSend("launch")).toBe("0");
});
```

  (If the test file does not reset the waitlist between tests, call `resetWaitlist()` first so counts start at 0.) Then
  `bunx supabase migration up`, and in `_shared/admin/accounts.ts` `enableAccount`: set the account's status row to
  `active` (`update({ status: "active" }).eq("user_id", id)`) before the republish loop, keep the delete at the end, so
  the trigger lets the republish through. App: `CampaignState.to_send` (`num(c.to_send)` in `campaignState`);
  `AdminWaitlist.tsx` uses `{ count: state.to_send }`; reword the Send explanation keys (~3244-3245) to say people who
  unsubscribed are not counted (founder approves in Task 7). `parle-admin.test.ts`:
  `safeWaitlist({...base, campaigns: {...launch: {..., to_send: 2}}}).campaigns.launch.to_send === 2` (shape as in the
  existing tests). GREEN.

- [ ] **Step 3: A74 (Send shows "unsaved" after a save).** Test `parle-admin.test.ts`:

```ts
it("the saved text is the server's text (R82)", () => {
  assert.deepEqual(campaignText({ launch_date: "Monday, November 2", personal_paragraph: "Hi\nthere" }), { launch_date: "Monday, November 2", personal_paragraph: "Hi\nthere" });
  assert.deepEqual(campaignText(null), { launch_date: "", personal_paragraph: "" });
});
```

  Fix: `parle-admin.ts` exports `campaignText(v)` (the normaliser `campaignState` uses for `blanks`);
  `saveCampaignText` returns `campaignText((await call("admin_waitlist_save_blanks", { campaign, blanks })).blanks)`;
  `AdminWaitlist.tsx` sets the text to what the server returned:
  `setText(await saveCampaignText(name, text))`. Backend check in `fn-waitlist.test.ts`: saving
  `personal_paragraph: PARA + "  \r\n"` returns `body.blanks.personal_paragraph === PARA`.

- [ ] **Step 4: A75 and A77 (pacing; the previous unsubscribe secret).** Tests `waitlist-mail.test.ts`:

```ts
it("sends at most 30 per run, one per second by default (R83)", async () => {
  delete process.env.WAITLIST_PACE_MS;
  const { RUN_LIMIT, paceMs } = await import("../supabase/functions/_shared/waitlist/send");
  expect(RUN_LIMIT).toBe(30); expect(paceMs()).toBe(1000);
});
it("a link signed with the previous secret still works (R85)", async () => {
  const old = "o".repeat(32), cur = "c".repeat(32), t = await unsubscribeToken(old, "a@x.test");
  expect(await emailFromAnyToken([cur, old], t)).toBe("a@x.test");
  expect(await emailFromAnyToken([cur], t)).toBeNull();
  const saved = [process.env.WAITLIST_UNSUBSCRIBE_SECRET, process.env.WAITLIST_UNSUBSCRIBE_SECRET_PREVIOUS];
  process.env.WAITLIST_UNSUBSCRIBE_SECRET = cur; process.env.WAITLIST_UNSUBSCRIBE_SECRET_PREVIOUS = old;
  try {
    const { unsubscribeSecrets } = await import("../supabase/functions/_shared/waitlist/config");
    expect(unsubscribeSecrets()).toEqual([cur, old]);
  } finally { process.env.WAITLIST_UNSUBSCRIBE_SECRET = saved[0]; if (saved[1] === undefined) delete process.env.WAITLIST_UNSUBSCRIBE_SECRET_PREVIOUS; else process.env.WAITLIST_UNSUBSCRIBE_SECRET_PREVIOUS = saved[1]; }
});
```

  (Check that `RUN_LIMIT` and `paceMs` are exported; export them if not.) Fix: `send.ts` `RUN_LIMIT = 30`, `paceMs`
  default `1000` (doc comment "up to 30 emails per run, one per second"; the local setup comment too); `token.ts`
  `emailFromAnyToken(secrets, token)` tries each; `config.ts` `unsubscribeSecrets()` returns `[current, previous]` when
  `WAITLIST_UNSUBSCRIBE_SECRET_PREVIOUS` is at least 32 characters and differs, else `[current]`; `unsubscribe.ts`
  uses `emailFromAnyToken(unsubscribeSecrets(), token)`; new emails are signed with the current secret only.
  `scripts/prod/env.ts` passes `WAITLIST_UNSUBSCRIBE_SECRET_PREVIOUS` only when its file exists. Write the rotation
  procedure in `security-debt.md` at Task 11: set PREVIOUS to the old value, CURRENT to the new, keep PREVIOUS for at
  least 60 days.

- [ ] **Step 5: A76 (a missing secret stops sending with a reason; the reason clears when sending works).** Tests in
  `fn-waitlist.test.ts`:

```ts
it("clears the last error once sending works again (R84)", async () => {
  const admin = await adminUser(); await joinWaitlist(addr("clear")); await ready(admin.token);
  await adminCall(admin.token, "admin_waitlist_start", { campaign: "launch", confirm: "SEND" });
  psql("update public.waitlist_campaign set last_error = 'Resend''s sending limit was reached.' where campaign = 'launch'");
  await drain();
  expect(psql("select last_error from public.waitlist_campaign where campaign = 'launch'")).toBe("");
}, 60000);
it("a missing unsubscribe secret stops the run with a reason (R84)", async () => {
  const admin = await adminUser(); await joinWaitlist(addr("secret")); await ready(admin.token);
  await adminCall(admin.token, "admin_waitlist_start", { campaign: "launch", confirm: "SEND" });
  const saved = process.env.WAITLIST_UNSUBSCRIBE_SECRET; process.env.WAITLIST_UNSUBSCRIBE_SECRET = "";
  try {
    const { runWaitlistJobs: inProcess } = await import("../supabase/functions/_shared/waitlist/send");
    expect(await inProcess(service(), new Date())).toMatchObject({ stopped: "secret_missing" });
  } finally { process.env.WAITLIST_UNSUBSCRIBE_SECRET = saved; }
  expect(psql("select last_error from public.waitlist_campaign where campaign = 'launch'")).toContain("WAITLIST_UNSUBSCRIBE_SECRET");
}, 30000);
```

  (The second can race the local pg_cron sender; run it right after queueing; a flaky first run is rerun once.) Fix in
  `send.ts`: before claiming rows, a `stop(message, stopped)` helper writes `last_error` on started, unfinished
  campaigns and returns `{ sent: 0, stopped }`; the address check uses it (`"address_missing"`), and
  `try { unsubscribeSecret(); } catch { return stop("The unsubscribe secret (WAITLIST_UNSUBSCRIBE_SECRET) is not set on the server. Nothing was sent; sending starts again once it is set.", "secret_missing"); }`;
  after each successful send, the first per campaign clears `last_error` (`update({ last_error: "" }).eq("campaign", row.campaign).neq("last_error", "")`).

- [ ] **Step 6: A78 and A85 (the unsubscribe page asks before acting; www redirects).** Tests `waitlist-site.test.ts`:

```ts
function runPage(search: string, answer: { status: number; body: unknown }) {
  const page = readFileSync(`${SITE}/unsubscribe.html`, "utf8");
  const script = page.match(/<script>([\s\S]*?)<\/script>/)![1];
  const el = () => ({ textContent: "", hidden: true, disabled: false, on: {} as any, addEventListener(t: string, f: any) { this.on[t] = f; } });
  const els: any = { title: el(), body: el(), confirm: el() }; const calls: unknown[] = [];
  const fetchStub = (...a: unknown[]) => { calls.push(a); return Promise.resolve({ status: answer.status, ok: answer.status < 300, json: async () => answer.body }); };
  new Function("document", "location", "fetch", "URLSearchParams", script)({ getElementById: (id: string) => els[id] }, { search }, fetchStub, URLSearchParams);
  return { els, calls };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
it("asks before unsubscribing; 429 and 500 are not 'not valid' (R86)", async () => {
  for (const [status, heading] of [[429, "Too many tries"], [500, "Something went wrong on our side"], [400, "This link is not valid"]] as const) {
    const { els, calls } = runPage("?t=abc.def", { status, body: {} });
    expect(calls.length).toBe(0);
    els.confirm.on.click(); await tick(); await tick();
    expect(calls.length).toBe(1); expect(els.title.textContent).toBe(heading);
  }
});
it("www redirects to the apex (R93)", () => {
  const cfg = JSON.parse(readFileSync(`${SITE}/vercel.json`, "utf8"));
  expect(cfg.redirects).toContainEqual({ source: "/:path*", has: [{ type: "host", value: "www.parle.buzz" }], destination: "https://parle.buzz/:path*", permanent: true });
});
```

  (Match the element ids `title` and `body` to the page's real ids; adapt the stub.) Fix `unsubscribe.html`: a hidden
  `<button id="confirm" type="button">Unsubscribe me</button>` in `<main>` styled like the page's links; after the
  missing-token check the script shows "Stop Parle emails?" / "Press the button to stop all Parle emails to this
  address." and posts only on the click; answers: OK with an email: "You're unsubscribed." / "You won't get any more
  Parle emails at {email}."; 429: "Too many tries" / "Wait an hour and press the button again, or write to
  hello@parle.buzz." (button enabled again); 500 and above: "Something went wrong on our side" / "Press the button
  again in a minute, or write to hello@parle.buzz."; other: "This link is not valid" / "Write to hello@parle.buzz from
  the address you signed up with, and we will remove you."; network error: "We could not reach Parle" / "Check your
  connection and press the button again, or write to hello@parle.buzz.". The one-click POST from mail providers goes
  to the function URL in the `List-Unsubscribe` header, not this page; `fn-waitlist-unsubscribe.test.ts` keeps proving
  it. `vercel.json` gains the `redirects` entry above; update the README's R93 line.

- [ ] **Step 7: A82 (remove the unused `admin_get_metrics`).** Test in `fn-marketplace.test.ts`: an admin calling
  `{ action: "admin_get_metrics" }` gets `ACTION_INVALID` (400) (FAIL today). Fix: delete the `case
  "admin_get_metrics"` and its import in `functions/parle-marketplace-service.ts`; remove it from
  `ADMIN_SCREEN_ACTIONS` (`parle-admin-access.helper.ts`), from `admin-access.test.ts`'s `SCREEN_ACTIONS` and from
  `fn-marketplace.test.ts`'s `ADMIN_ACTIONS`; delete `functions/parle-admin-metrics.helper.ts` and
  `src/lib/admin-metrics.test.ts` after `grep -rn "parle-admin-metrics" 07_Engineering --include=*.ts` shows no other
  user. Then `bun scripts/sync-app-code.ts` (it removes the server copy; check `_app/functions/` afterwards).

- [ ] **Step 8: A87 (no "could not open" line when a request is abandoned by leaving the page).** Test
  `src/lib/tutor-open.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAbandonedRequest } from "./tutor-open";
describe("tutor session open errors (R95)", () => {
  it("a request abandoned by leaving the page is not reported", () => {
    assert.equal(isAbandonedRequest(new TypeError("Failed to fetch"), true), true);
    assert.equal(isAbandonedRequest(Object.assign(new Error("x"), { name: "AbortError" }), false), true);
    assert.equal(isAbandonedRequest(new TypeError("Failed to fetch"), false), false);
  });
});
```

  Fix: `src/lib/tutor-open.ts`:
  `export const isAbandonedRequest = (error: unknown, leaving: boolean) => leaving || (error as { name?: string } | null)?.name === "AbortError";`.
  `LearnerTutorPlaceholder.tsx`: a `pageLeaving` ref set by `beforeunload` and `pagehide`, reset by `pageshow`
  (listeners added once in an effect and removed on unmount); the session-open catch (~945) returns early when
  `isAbandonedRequest(error, pageLeaving.current)`. Task 10 reruns the click-through: the tutor line is "none".

- [ ] **Step 9: A83 (accepted).** No change: the paused-account lists hold a handful of rows, far below the 1,000-row
  cap. Ledger the acceptance; Task 6 records it.

- [ ] **Step 10: Run and commit.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-backend && bun scripts/sync-app-code.ts | tail -1
bun test tests/fn-admin-accounts.test.ts tests/fn-waitlist.test.ts tests/fn-waitlist-unsubscribe.test.ts tests/waitlist-mail.test.ts tests/waitlist-site.test.ts tests/admin-waitlist-schema.test.ts tests/fn-marketplace.test.ts tests/app-code-sync.test.ts 2>&1 | grep -E "^\(fail\)|^ [0-9]+ (pass|fail)"
cd ../parle-app && bun run test 2>&1 | grep -E "^\(fail\)|^ [0-9]+ (pass|fail)"
```

Expected: `0 fail` in both. Commit `fix(admin, waitlist): pre-launch close-out (A73-A79, A82, A85, A87; migration 000032)`.

---

### Task 5: Voice and AI provider fixes (A88-A92, A98, A99, A106-A112)

**Files:**
- Modify: `07_Engineering/parle-backend/supabase/functions/_shared/voice/limits.ts` (~89), `listening.ts`,
  `actions.ts`; `parle-plan-service/placement.ts` (`save` ~94-97, `placementScoreSpeaking` ~215-232);
  `_shared/ai-provider.ts`; `scripts/prod/ai-model.ts`, `set-ai-model.ts`
- Modify (relay): `parle-app/api/_voice/handler.ts`, `deepgram.ts`, `azure.ts`
- Modify (app): `parle-app/src/lib/voice-playback.ts`, `voice-audio.ts`, `voice-recorder.ts`,
  `src/pages/LearnerTutorPlaceholder.tsx`, `src/lib/i18n.ts` (three unused keys)
- Test: `parle-backend/tests/fn-voice-limits.test.ts`, `fn-listening-audio.test.ts`, `fn-placement.test.ts`,
  `ai-provider.test.ts`, `ai-model-setting.test.ts`; relay `api/_voice/handler.test.ts`, `deepgram.test.ts`,
  `azure.test.ts`; app `src/lib/voice-playback.test.ts`, `voice-audio.test.ts`

Helpers: `tests/helpers/voice.ts` (`setSetting`, `tutorReply`, `voice`, `recordedAnswer`, `FRENCH_ANSWER`, `service`),
`onboardedLearner`; `fn-listening-audio.test.ts` (`bankItem`, `makeUser`, `tokenOf`, local `listen`);
`fn-placement.test.ts` (`learner`, `call`, `finishSection`, `queueAiResponses`, `clearAiQueue`, `SPEAKING_SCORE`);
relay `handler.test.ts` (`backend`, `jsonReq`, `ENV`); `deepgram.test.ts` and `azure.test.ts` (`answer`).

- [ ] **Step 1: A88 (replays capped per day).** Test `fn-voice-limits.test.ts`:

```ts
it("replays are capped at three times the replies limit a day (R96)", async () => {
  const undo = await setSetting("free_voice_replies_per_day", 1);
  try {
    const { u, t } = await onboardedLearner();
    const id = await tutorReply(u.id, u.email, "Je suis allé au marché.");
    const take = () => voice(t, { action: "voice_take", kind: "reply", ref: id, text: "Je suis allé au marché." }, true);
    expect((await take()).status).toBe(200);
    for (let i = 0; i < 3; i++) expect((await take()).body.again).toBe(true);
    const over = await take();
    expect([over.status, over.body.error_code]).toEqual([429, "RATE_LIMITED"]);
  } finally { await undo(); }
});
```

  Fix `limits.ts` (~89), with `day`, `limit`, `kind` already in scope in `voiceTake`:

```ts
if (r.again) {
  const hourly = await takeRateLimit(ctx.db, `voice:again:${ctx.caller.id}`, 3600, 100);
  const daily = hourly && await takeRateLimit(ctx.db, `voice:again-day:${ctx.caller.id}:${day}`, 86_400, Math.max(3, limit * 3));
  if (!daily) throw new VoiceError("RATE_LIMITED", 429, "Try again later.", { kind });
}
```

- [ ] **Step 2: A89 (a failed listening generation gives its claim back).** Tests: relay `handler.test.ts`

```ts
it("a failed listening generation gives the claim back (R97)", async () => {
  const calls = backend({ listening_claim: [200, { state: "generate", cache_key: "k1", script: "Bonjour." }] });
  const r = await handleVoice(jsonReq("listen", { item_kind: "question_item", item_id: "i-1" }), { ...ENV, VOICE_FAKE_FAIL: "1" });
  assert.equal(r.status, 503);
  assert.deepEqual(calls.map((c) => c.action), ["listening_claim", "listening_release"]);
  assert.equal(calls[1].body.cache_key, "k1");
});
```

  and `fn-listening-audio.test.ts` (first let the local `listen` helper take an `extra` env object merged into the
  relay env):

```ts
it("after a failed generation the next request makes the audio at once (R97)", async () => {
  const id = await bankItem("Le train part à sept heures.");
  const t = await tokenOf(await makeUser("learner"));
  expect((await listen(t, "question_item", id, { VOICE_FAKE_FAIL: "1" })).status).toBe(503);
  const next = await listen(t, "question_item", id);
  expect([next.status, next.body.generated]).toEqual([200, true]);
});
```

  Fix: `listening.ts`:

```ts
/** Relay: generation failed, so the claim goes and the next request may try again (R97). */
export async function listeningRelease(ctx: VoiceContext): Promise<Record<string, unknown>> {
  const key = String(ctx.body.cache_key ?? "");
  if (!key || key.length > 200) return { released: false };
  const { data: row, error } = await ctx.db.from("listening_audio").select("status, item_kind, owner_id").eq("cache_key", key).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row || row.status !== "pending") return { released: false };
  if (row.item_kind === "learner_task" && row.owner_id !== ctx.caller.id && ctx.caller.role !== "admin") return { released: false };
  const del = await ctx.db.from("listening_audio").delete().eq("cache_key", key).eq("status", "pending");
  if (del.error) throw new Error(del.error.message);
  return { released: true };
}
```

  `actions.ts` adds `listening_release: listeningRelease` to the relay-only actions; `handler.ts` `listen()` wraps the
  synthesis (`try { pcm = await synthesizeAll(...) } catch (e) { await release(); throw e; }`) and releases when
  `listening_store` fails, where `release = () => backend("listening_release", { cache_key: claim.body.cache_key })`.

- [ ] **Step 3: A90 (one time budget across pieces).** Test `handler.test.ts` (import `synthesizeAll`):

```ts
it("one time budget covers every piece (R98)", async () => {
  const slow = { name: "fake" as const, transcribe: async () => "", synthesize: () => new Promise<Int16Array>((r) => setTimeout(() => r(new Int16Array(1)), 30)) };
  const text = Array.from({ length: 3 }, () => "x".repeat(390) + ".").join(" ");
  await assert.rejects(synthesizeAll(slow, text, 50), { code: "VOICE_BUSY" });
});
```

  Fix `handler.ts`: `const BUDGET_MS = 50_000;` (under Vercel's 60 s, with room for the backend calls and the MP3);
  `synthesizeAll(provider, text, budgetMs = BUDGET_MS)` sets a deadline and gives each piece
  `withTimeout(provider.synthesize(piece), Math.min(PROVIDER_MS, deadline - Date.now()))`, throwing
  `new ProviderError("VOICE_BUSY")` when no time is left. Export it if it is not exported.

- [ ] **Step 4: A91 (page-only tutor messages use the browser voice without a relay call).** In
  `voice-playback.test.ts` change the existing ids `"m-1"`, `"m-2"`, `"m-3"` to UUIDs
  (`"00000000-0000-4000-8000-00000000000N"`), then add:

```ts
it("a message that exists only in the page never calls the relay (R99)", async () => {
  let calls = 0;
  setVoiceDeps({ token: async () => "tok", fetch: async () => { calls++; return new Response("", { status: 404 }); } });
  const outcome = await new ReplyPlayer().play("Je suis allé au marché.", `tutor-${crypto.randomUUID()}`);
  assert.equal(calls, 0);
  assert.ok(outcome === "local" || outcome === "unavailable", outcome);
});
```

  Fix `voice-playback.ts`: `PlayOutcome` gains `"local"`;
  `export const isSavedReplyId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);`;
  in `play()` the relay path runs only `if (isSavedReplyId(replyId))`; otherwise `return this.browser(chunks, rate, "local")`
  (widen `browser()`'s outcome type). The tutor page shows no note for `"local"`.

- [ ] **Step 5: A92 (placement speaking never reopens a finished run).** Test `fn-placement.test.ts`:

```ts
it("speaking scored in another tab never reopens a finished run (R100)", async () => {
  const { t } = await learner();
  const open = (await call(t, { action: "placement_open" })).body.result;
  const runId = open.runId;
  for (const s of ["listening", "grammar_vocabulary"]) await finishSection(t, runId, s);
  for (const s of ["reading", "writing"]) await call(t, { action: "placement_skip", runId, section: s });
  await clearAiQueue(); await queueAiResponses(JSON.stringify(SPEAKING_SCORE));
  const { ticketId } = await recordedAnswer(t, runId, FRENCH_ANSWER, 25_000, "placement");
  const prompt = open.prompts.find((p: any) => p.kind === "speaking");
  await Promise.all([
    call(t, { action: "placement_score_speaking", runId, promptId: prompt.id, ticketId }),
    call(t, { action: "placement_finish", runId }),
  ]);
  const { data } = await service().from("placement_run").select("status").eq("id", runId).single();
  expect(data!.status).toBe("finished");
}, 60000);
```

  (Adapt the action and field names to `fn-placement.test.ts`'s existing calls.) Fix `placement.ts` `save()`:

```ts
async function save(id: string, state: State, status: "open" | "finished" = "open") {
  // placementFinish has already claimed status 'finished' before its own final save (R20)
  const { data, error } = await db().from("placement_run")
    .update({ state_json: JSON.stringify(state), status, updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", status === "finished" ? "finished" : "open").select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new PlacementError("RUN_NOT_FOUND");
}
```

  Also `placementScoreSpeaking` calls `bank(state.bankSource ?? "demo")` as writing does (found on the same path:
  without it, a bank switch mid-run fails speaking with `PROMPT_INVALID`).

- [ ] **Step 6: A98 (remove the unused speech-recognition code).** In `LearnerTutorPlaceholder.tsx` delete the
  `BrowserRecognition*` interfaces and type (~123-142), `speechNote` / `setSpeechNote` (~730, ~1183),
  `speechListening` (~731), `recognitionRef` (~736) and its cleanup block (~959-962), and `speechSynthesisRef` if it is
  only written; delete the i18n keys `learner.tutor.speechListening`, `learner.tutor.speechUnavailable`,
  `learner.tutor.speechDenied` after `grep -rn` shows no use. Keep `speechTranscriptPending`,
  `speechTranscriptConfirmed`, `frenchVoiceAvailable`. Verified by the type check (no new errors) and the app suite.

- [ ] **Step 7: A99 (Safari and every iPhone browser record MP4 first).** Test `voice-audio.test.ts`:

```ts
it("Apple WebKit records MP4/AAC first; other browsers keep WebM/Opus (R107)", () => {
  assert.equal(pickRecordingType(() => true, true), "audio/mp4;codecs=mp4a.40.2");
  assert.equal(pickRecordingType(() => true), "audio/webm;codecs=opus");
  assert.equal(pickRecordingType((t) => t.startsWith("audio/webm"), true), "audio/webm;codecs=opus");
  assert.equal(isAppleWebKit("Apple Computer, Inc."), true);
  assert.equal(isAppleWebKit("Google Inc."), false);
});
```

  Fix `voice-audio.ts`: two orders `WEBM_FIRST` (today's) and `MP4_FIRST`
  (`["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]`);
  `export const isAppleWebKit = (vendor = typeof navigator === "undefined" ? "" : navigator.vendor ?? "") => /^Apple/.test(vendor);`;
  `pickRecordingType(isSupported, appleWebKit = false)`; `voice-recorder.ts` passes `isAppleWebKit()`. The real-iPhone
  check stays with the founder.

- [ ] **Step 8: A106, A107 (model switch script).** Tests `ai-model-setting.test.ts` (local stack; a service client
  as in `helpers/voice`):

```ts
it("an update matching no row is an error (R114)", async () => {
  await expect(writeModelSetting(service(), "openrouter:openai/gpt-6-luna", ["ai_model_missing_test"])).rejects.toThrow(/no row/);
});
it("warns when the model is not OpenAI's (R115)", () => {
  expect(privacyWarning("openrouter:openai/gpt-6-luna")).toBeNull();
  expect(privacyWarning("openrouter:anthropic/claude-haiku-5.5")).toMatch(/privacy page names OpenAI/);
});
```

  Fix `ai-model.ts`: `MODEL_KEYS`; `writeModelSetting(db, model, keys = MODEL_KEYS)` updates each key with
  `.select("key")`, throwing `` `${key}: no row to update` `` on 0 rows (`updated_at` is already set by the table's
  trigger); `privacyWarning(model)` returns null for `openai/`, else "Warning: the privacy page names OpenAI
  (legal.privacyAiBody in parle-app/src/lib/i18n.ts). Update it for "<author>" before or with this switch.";
  `set-ai-model.ts` calls both (exit 1 on an error).

- [ ] **Step 9: A108-A111 (speech provider edge cases).** Tests: `azure.test.ts`

```ts
it("characters XML forbids never reach the SSML (R116)", () => {
  const doc = ssml("A\u0000B\u0007C\uFFFFD\uD800E", DEFAULT_VOICE);
  assert.doesNotMatch(doc, /[\u0000-\u0008\uFFFF\uD800]/);
  assert.match(doc, /A B C D E/);
});
it("an empty 200 is 'Voice is busy', not silence (R119)", async () => {
  const lines: string[] = []; console.warn = (...a: unknown[]) => { lines.push(JSON.stringify(a)); };
  await assert.rejects(azureSpeaker({ key: "k" }, answer(200, new Uint8Array(0)))("Bonjour"), { code: "VOICE_BUSY" });
  assert.match(lines.join(" "), /empty/);
});
```

  `deepgram.test.ts`: add to the first test `assert.equal(url.searchParams.get("punctuate"), "true"); assert.equal(url.searchParams.get("smart_format"), null);`
  and

```ts
it("a 200 that is not a Deepgram answer is 'Voice is busy', logged without the body (R117)", async () => {
  const lines: string[] = []; console.warn = (...a: unknown[]) => { lines.push(JSON.stringify(a)); };
  await assert.rejects(deepgramTranscriber("k", answer(200, "<html>Ana</html>"))(new Uint8Array(4)), { code: "VOICE_BUSY" });
  await assert.rejects(deepgramTranscriber("k", answer(200, { error: "x" }))(new Uint8Array(4)), { code: "VOICE_BUSY" });
  assert.match(lines.join(" "), /unreadable/); assert.doesNotMatch(lines.join(" "), /Ana/);
});
```

  Fixes: `azure.ts` `escapeXml` first replaces
  `/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g`
  with a space; an answer under 2 bytes logs `"Azure speech answer empty"` with the status and throws `VOICE_BUSY`.
  `deepgram.ts`: query `{ model: "nova-3", language: "fr", punctuate: "true", mip_opt_out: "true" }` (no
  `smart_format`: spoken numbers stay words); a body without an array `results.channels` logs `"Deepgram answer
  unreadable"` with the status and throws `VOICE_BUSY` (an empty `channels` array stays silence). Update the Plan 10
  spec's Deepgram line (`smart_format` to `punctuate`) at Task 11.

- [ ] **Step 10: A112 (a reply cut off at the token limit is logged).** Test `ai-provider.test.ts` (add `spyOn` to the
  `bun:test` import):

```ts
it("a reply cut off at max_tokens is logged as such; an empty cut-off is status 'length' (R120)", async () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  try {
    expect(await chatOpenRouter("k", call(), fakeFetch(200, { choices: [{ message: { content: "Salut, je" }, finish_reason: "length" }] }))).toBe("Salut, je");
    await expect(chatOpenRouter("k", call(), fakeFetch(200, { choices: [{ message: { content: "" }, finish_reason: "length" }] }))).rejects.toMatchObject({ status: "length" });
    expect(JSON.stringify(warn.mock.calls)).toMatch(/cut off/);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Salut/);
  } finally { warn.mockRestore(); }
});
```

  Fix `ai-provider.ts`: `ProviderCallError.status` also allows `"length"`; in `post()`, when
  `choices[0].finish_reason === "length"` log `"AI reply cut off at max_tokens"` with the model and `maxTokens: 4096`
  (never the content), and an empty cut-off reply throws `new ProviderCallError("length")`. `ai.ts`'s log line already
  prints the status.

- [ ] **Step 11: Run and commit.**

```bash
cd D:/AgentDevWork/repos/Parle/07_Engineering/parle-backend && bun scripts/sync-app-code.ts | tail -1
bun test tests/fn-voice-limits.test.ts tests/fn-listening-audio.test.ts tests/fn-placement.test.ts tests/ai-provider.test.ts tests/ai-model-setting.test.ts tests/voice-relay.test.ts tests/app-code-sync.test.ts 2>&1 | grep -E "^\(fail\)|^ [0-9]+ (pass|fail)"
cd ../parle-app && bun run test 2>&1 | grep -E "^\(fail\)|^ [0-9]+ (pass|fail)"; bunx tsc --noEmit -p tsconfig.api.json 2>&1 | grep -c "error TS"
```

Expected: `0 fail`; relay type errors `0`. Commit `fix(voice, ai): pre-launch close-out (A88-A92, A98, A99, A106-A112)`.

---

### Task 6: Items accepted or moved, and the founder's items

**Files:** `06_Build/export-decoupling/deferred-defects.md`, `deferred-inventory-2026-10-15.md` (written in Task 11 with
the rest; this task decides and ledgers).

- [ ] **Step 1: Ledger one ruling per accepted item** (the Triage table's "Accept" row): A45, A81, A83, A96, A97, A104,
  each with its reason and cost if wrong, and the A56 remainder (Task 2 Step 11).
- [ ] **Step 2: Move A69, A71, A72 to the Stripe live plan** (SPEC-BACKLOG row 5 "What the spec must cover": rename the
  two USD-named fields in the live-mode data migration; Connect account creation on Accounts v2; the statement
  descriptor PARLE in the Stripe dashboard).
- [ ] **Step 3: Ask the founder about A94** (the tutor's microphone in speaking mode only, as today, or in every mode).
  If "every mode": a short follow-up within this plan (the recorder already exists; the change is where the button
  shows) with a test, or a new deferred row if the founder prefers later. Record the answer as decision #61.

---

### Task 7: Founder approval of the new wording

- [ ] **Step 1:** Show the founder, exactly as they will read:
  - the public booking wording (Task 2 Step 1: landing page, How it works, Plans, FAQ, tutor vetting);
  - the cancellation email lines (Task 2 Step 6) and the refund wording (Task 2 Step 7: the "refunded" banner and the
    reason-specific slot-lost emails);
  - the new error messages (`lessons.error.cancelInProgress`, `payouts.error.alreadyRefunded`, the Payouts
    "Stripe did not confirm" text, `settings.photoMissingError`, `earnings.line.sentConverted`);
  - the unsubscribe page texts and the Send explanation (Task 4 Steps 2 and 6).
- [ ] **Step 2:** Apply changes, rerun the app suite, record the approval as decision #62 (or the next free number).
  Nothing is deployed before this.

---

### Task 8: Final review before deploy

- [ ] **Step 1: Full suites and type checks** (Task 0 Step 3). Expected: backend `0 fail`; app `0 fail`; app type
  errors the same list; relay `0`.
- [ ] **Step 2: Review package and reviewer** on the most capable model, with this plan, the inventory, the Review
  Focus section verbatim and the ledger's rulings. Ask it to check especially the three migrations (grants, `search_path`,
  that each replaced function keeps every branch of its live body), the cancel claim and its release on failure, the
  booking read policy against every browser read, the webhook claim-then-handle order, and the unsubscribe page.
- [ ] **Step 3: One fix pass** (Critical and Important, each with a failing test first; Minor to the ledger). Commit
  `fix(prelaunch): final review fixes before deploy`.

---

### Task 9: Deploy

**Files:** create `07_Engineering/parle-backend/scripts/prod/reset-listening-audio.ts`; modify
`06_Build/export-decoupling/migration/close-out-report.md` ("Plan 11 deploy").

- [ ] **Step 1: The listening-audio reset script (A102).** It lists `listening_audio` rows with `status = 'ready'`
  created before `2026-10-16T23:00:00Z` (made in NVIDIA's voice), deletes their files from the `listening-audio`
  bucket and then the rows, printing counts only; `--check` prints the count without deleting. Test first in a new
  `tests/reset-listening-audio.test.ts` against the local stack: seed two rows (one before, one after the cut) with
  files, run the exported `resetBefore(db, iso)`, expect the old row and file gone and the new one kept.
- [ ] **Step 2: Founder applies the migrations** (dry run first):

```
! cd /d/AgentDevWork/repos/Parle/07_Engineering/parle-backend && bun scripts/prod/deploy.ts --migrations --dry-run
! cd /d/AgentDevWork/repos/Parle/07_Engineering/parle-backend && bun scripts/prod/deploy.ts --migrations
```

  Expected: `pending: 3` (000030, 000031, 000032), then `applied` for each. Before any function deploy.
- [ ] **Step 3: Functions and the preview** (Claude), as in Plan 10 Task 10 Step 4: sync, `supabase functions deploy`,
  `vercel deploy --target preview`, alias. Never `--prod` for the app.
- [ ] **Step 4: Founder publishes parle.buzz** (the unsubscribe page and the www redirect):

```
! cd /d/AgentDevWork/repos/Parle/07_Engineering/parle-waitlist && bunx vercel deploy --prod --yes --scope shayans-projects-d00acc44
```

  Then Claude checks `curl -sI https://www.parle.buzz/unsubscribe?t=x` answers 308 to `https://parle.buzz/unsubscribe?t=x`.
- [ ] **Step 5: Founder runs the listening reset:** `! cd ... && bun scripts/prod/reset-listening-audio.ts --check`, then
  without `--check`.
- [ ] **Step 6: Smoke checks** (relay 401, the click-through, read-only database checks of the new columns, functions
  and policy through the Supabase MCP). Record "Plan 11 deploy" in the close-out report (same table shape as Plan 10).
  Commit `deploy: Plan 11 on production and the preview`.

---

### Task 10: Live checks

- [ ] **Step 1: The tutor and the explanations.** `npx tsx scripts/prod/preview-click-through.ts`: the tutor's
  console line is "none" (A87). `bun scripts/prod/plan6-checks.ts explanations` three times (Arabic, Spanish, Hindi;
  add Persian `["fa", "Persian"]` to its list first): the native-script share at least 30 % in every Arabic, Hindi and
  Persian run (A29).
- [ ] **Step 2: Booking and payouts on the real system** (Stripe test mode), with a fresh check learner and m5tut1:
  book one lesson and press Book twice quickly (A51: one hold, no "just taken"); cancel it from the learner and the
  tutor at once (A53: one refund, no error); the held payout of lesson D from the Plan 7B checks: Release from the
  admin screen now sends it despite the probe's transfer group (A101; `plan7b-preview-checks.ts release d`, then
  `plan7b-checks.ts paid-d`); Earnings shows "Stripe sent CA$..." for the USD-era lessons (A70).
- [ ] **Step 3: Waitlist and voice.** The unsubscribe page with a bad link shows the button first and "This link is not
  valid" after it (A78); `plan9-checks.ts listening` makes audio again in the new voice (`generated true`, A102);
  `plan9-checks.ts reply` replays capped (A88) is covered by the local test, so only the reply check runs.
- [ ] **Step 4: Record** every outcome in "Plan 11 checks" (close-out report); clean up the check learner; commit
  `test(prelaunch): Plan 11 live checks`.

---

### Task 11: Records and every affected document

- [ ] **Step 1: `deferred-defects.md` and the inventory:** each closed R row marked `FIXED <date> (Plan 11: ...)` in its
  id cell, each A row `done`; accepted rows `accepted (Plan 11 ruling)`; moved rows `moved to backlog row 5`; new R and
  A rows for any check failure or deferred minor; the "Status as of" line; the plan ledger's rulings and minors copied
  into a "Plan 11 rulings" block before the workspace is deleted.
- [ ] **Step 2:** `SPEC-BACKLOG.md` (row 5 gains A69, A71, A72; row 6's checklist notes the close-out done),
  `security-debt.md` ("Status after Plan 11": the booking read policy, the webhook signing-secret split and atomic
  dedupe, the unsubscribe page no longer acting on load, the secret rotation procedure for
  `WAITLIST_UNSUBSCRIBE_SECRET_PREVIOUS`), `HANDOFF.md` (section 4 top paragraph; section 5 founder items), DECISIONS
  (#61 microphone, #62 wording, if made).
- [ ] **Step 3: Every other document that states a changed fact** (memory rule): grep the repo's `*.md` (excluding
  session logs, plan files, reports, spikes) for each changed fact and fix it in place. At least:
  - "coming soon" about booking, and "this demo" (product specs, READMEs, `02_Product`);
  - the Deepgram option `smart_format` (Plan 10 spec line, backend README);
  - waitlist pacing (600 ms, 50 per run) and the Send count (Plan 8 spec, waitlist README);
  - the tutor's AI time budget (100 s) and "the message is charged before the reply" (`04_ai-tutor.md`, `10_cross-cutting.md`);
  - the iPhone recording format (Plan 9 spec, `04_ai-tutor.md`);
  - the unsubscribe page behaviour (waitlist README, Plan 8 spec);
  - `admin_get_metrics` (any spec or README naming it).
  Record the list of files touched in the ledger.
- [ ] **Step 4: Commit** `docs: Plan 11 records and documents (deferred items closed, backlog, security, handoff)`.

---

### Task 12: Report and finishing

- [ ] **Step 1: Report** `06_Build/export-decoupling/plans/2026-10-16-plan-11-report.md` in the Plan 10 report's shape:
  tasks with commit ranges and test lines; every ruling with its cost if wrong; the final review fixes; the deferred
  minors; the item count closed, accepted, moved and left with the founder; the final suite numbers.
- [ ] **Step 2: Finish the branch:** full suites once more; commit the report (`docs: Plan 11 report`);
  `git checkout main && git merge --no-ff plan-11-prelaunch-closeout -m "merge: Plan 11 pre-launch close-out"`;
  `git push origin main`; `git branch -d plan-11-prelaunch-closeout`; delete this plan's workspace after copying its
  rulings; `bunx supabase stop`.

---

## Self-review notes (writer)

- **Coverage:** every open row of the inventory (A29-A112) appears in the Triage table and in exactly one task or
  ruling; the fixes and tests come from five read-only investigations of the current code (2026-10-16), each of which
  confirmed the defect still exists, except A106's `updated_at` half (already set by the table's trigger).
- **Migrations:** three files (000030 booking, 000031 payouts, 000032 admin and waitlist) so each area proves RED
  before its SQL; every replaced function is copied from its live body first.
- **Interfaces across tasks:** Task 2's `endOpenHolds` and `lesson_confirm_payment` change and Task 4's `enableAccount`
  reorder touch `_shared/admin/accounts.ts` in different functions; Task 2's `lesson_record_refund` is untouched (Task 3
  replaces it); Task 2 and Task 3 both edit `payments.ts`'s fake (refund over-limit, transfer group): different
  functions.
- **Placeholders:** values filled at run time: helper signatures adapted to the real test files, the founder's wording
  changes (Task 7), decision numbers, dates.
- **Review Focus:** 1 in Tasks 2 (A51, A53) and 3 (A66, A68); 2 in Task 3 (A63, A64, A67); 3 in Tasks 2 (A59, A80) and
  4 (A73); 4 in Task 2 (A57); 5 in Task 4 (A78).
