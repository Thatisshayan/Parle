# Plan 12: Plan 11 review minors, iPhone emulation and launch readiness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the nine Plan 11 final-review minors (R121-R129, A113-A121), check the app on an emulated iPhone with
Playwright WebKit, and make the move of parle.buzz to the app a checked, scripted launch-day step.

**Architecture:** Server fixes in the existing `_shared/lessons`, `_shared/payouts` and tutor-service code, one migration
(000033: a stale-claim retake for payout webhook events and a per-learner AI reply claim), two founder wording lines,
and two production scripts (a read-only launch check and a launch switch the founder runs on launch day).

**Tech Stack:** Supabase Postgres and Deno edge functions (`07_Engineering/parle-backend`), React and Vite app and the
Vercel voice relay (`07_Engineering/parle-app`), Bun tests on the local stack, Playwright 1.58.2 (gstack install) for the
browser checks, Stripe test mode only.

**Spec:** no separate design document. The plan argues from the R rows R121-R129 in
`06_Build/export-decoupling/deferred-defects.md` (the Plan 11 final review, quoted in its "Plan 11 rulings" block),
R103/R107 (iPhone), HANDOFF section 5 (launch list) and the founder's request of 2026-10-17 (fold the iPhone check in
with Playwright). Two founder choices are asked at plan review: R129 (running total or extra amount) and the wording
in Task 6.

## Global Constraints

- Stripe test mode only; never a live key. `waitlist_signup` and `join_waitlist()` are never altered.
- The founder applies production migrations and publishes parle.buzz (`--prod`); Claude deploys functions and the
  preview, and never runs `--prod` for the app.
- Secrets are never printed, logged or committed; they live in `C:\Users\AgentDev\.parle-secrets\`.
- Every new security-definer function: `set search_path = ''`, revoked from public/anon/authenticated, granted to
  service_role only.
- Log lines carry ids, codes and statuses only; never learners' words, audio, transcripts or provider bodies.
- New learner-facing wording is approved by the founder before deploy (Task 6).
- The question bank is not imported in this plan (it waits for the Lesson Bank hand-off; Plan 13).
- No em dashes in AWS resource names (none are created here).

## Review Focus

1. **A deletion or pause racing the other side's cancel** (R121): the learner sees no refund error when the lesson is
   refunded by the other cancel; a lesson nobody refunds still stops the deletion. (Task 1 tests both.)
2. **A webhook claim that outlives its worker** (R122): Stripe's retry after the claim goes stale is handled; a retry
   while the first worker is still working is still a duplicate. (Task 2 tests both.)
3. **Two sends from two tabs with one message left** (R128): one AI call, one reply, the other told to wait; a claim
   left by a killed worker frees itself. (Task 3 tests both.)
4. **Changing one's mind on the booking page** (R127): booking a different, overlapping time ends the learner's own
   unpaid hold; a late payment for that ended hold is refunded, not confirmed. (Task 1 tests both.)
5. **Launch switch half-done** (Task 4): the launch check lists every setting still on the preview; running the switch
   twice is harmless. (Task 4 tests the check against a fixture.)

---

### Task 0: Setup

- [ ] **Step 1:** Branch `plan-12-review-minors` (created from `main` at `b984768`). Workspace and ledger via the
  executing-plans scripts.
- [ ] **Step 2:** Docker (ask the founder if it is not running), then the local stack:
  `bunx supabase start -x imgproxy,vector,logflare,supavisor` (retry on HealthCheckTimeout),
  `bunx supabase migration up`, `bun scripts/setup-local-functions-env.ts`, `bunx supabase functions serve` in the
  background.
- [ ] **Step 3: Baselines.** Backend `bun test` (expect 569 pass, 1 skip, 0 fail; reload blips rerun per file), app
  `bun run test` (516), app type errors (61; save the list), relay type errors (0). Ledger them.

---

### Task 1: Lessons (R121, R125, R126, R127)

**Files:**
- Modify: `07_Engineering/parle-backend/supabase/functions/_shared/lessons/deletion.ts` (`cancelFutureLessons`),
  `booking.ts` (`bookLesson`, `listLessons`), `confirm.ts` (reason), `mail-copy.ts` (`SlotLostReason`, `slotLostMail`)
- Test: `tests/account-deletion.test.ts`, `tests/fn-lesson-booking.test.ts`, `tests/fn-lesson-payments.test.ts`

**Interfaces:** Produces `SlotLostReason = "time_taken" | "tutor_gone" | "tutor_unavailable" | "amount_mismatch" | "account_paused"`.

- [ ] **Step 1: R121 test** (`account-deletion.test.ts`, inside the existing lessons `describe`):

```ts
it("a deletion while the other side's cancel is refunding waits for it instead of failing (R121)", async () => {
  const { profileId } = await bookableTutor();
  const { u, t } = await learner();
  const future = await bookAndPay(t, profileId, slotAt(7, 12));
  // the tutor's cancel holds the claim and finishes 2 s later
  await service().from("booking").update({ cancel_claimed_at: new Date().toISOString() }).eq("id", future.bookingId);
  setTimeout(() => { void service().from("booking").update({ status: "cancelled_tutor", cancelled_by: "tutor", cancel_claimed_at: null }).eq("id", future.bookingId); }, 2000);
  const r = await callFunction(FN, t, { action: "delete_account", password: u.password, confirm: "DELETE" });
  expect(r.status).toBe(200);
}, 60000);
```

  Run `bun test tests/account-deletion.test.ts -t "R121"`. Expected: FAIL (503 `LESSON_REFUND_FAILED`). The existing
  "stops with 'try again' when a refund cannot reach Stripe" test must stay green.

- [ ] **Step 2: R121 fix** in `cancelFutureLessons`, replacing the `claimed !== true` block:

```ts
    if (claimed !== true) {
      // R121: another cancel (the other side, or an administrator) is refunding this lesson: wait for its result
      let settled = false;
      for (let i = 0; i < 6 && !settled; i++) {
        const { data: now2 } = await db.from("booking").select("status").eq("id", row.id).maybeSingle();
        settled = now2?.status !== "confirmed";
        if (!settled) await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (settled) continue;
      if (opts.stopOnFailure) throw new RefundStopped();
      failed++;
      continue;
    }
```

- [ ] **Step 3: R125 test** (`fn-lesson-booking.test.ts`):

```ts
it("abandoned holds never push real lessons out of the learner's list (R125)", async () => {
  const { profileId, tutor } = await bookableTutor(); const { u, t } = await learner();
  const real = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: at(-24 * 30), status: "completed" });
  const { data: row } = await service().from("booking").select("*").eq("id", real.bookingId).single();
  const { id: _id, ...base } = row!;
  const abandoned = Array.from({ length: 110 }, (_, i) => ({ ...base, status: "expired", stripe_checkout_session_id: null,
    start_at: at(24 * (i + 2)), blocked_until: at(24 * (i + 2) + 1), hold_expires_at: at(-1) }));
  const { error } = await service().from("booking").insert(abandoned);
  if (error) throw error;
  const list = (await lesson(t, "learner_list_lessons")).body.lessons;
  expect(list.map((l: any) => l.id)).toContain(real.bookingId);
}, 60000);
```

  (Use the file's own `at`/`lesson` helpers or import them from `helpers/lessons`; drop any generated columns the
  insert refuses.) Expected: FAIL (the completed lesson is outside the 100 newest rows).

- [ ] **Step 4: R125 fix** in `listLessons`: query the non-expired rows and the slot_lost expired rows separately.

```ts
  const col = viewer === "learner" ? "learner_id" : "tutor_id";
  const statuses = (viewer === "learner" ? LEARNER_STATUSES : TUTOR_STATUSES).filter((s) => s !== "expired");
  const { data, error } = await ctx.db.from("booking").select("*").eq(col, ctx.caller.id).in("status", statuses)
    .order("start_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  let lost: BookingRow[] = [];
  if (viewer === "learner") {
    // A55, R125: an expired lesson is listed only when it was refunded as slot_lost; abandoned holds never fill the list
    const { data: refunds, error: refundError } = await ctx.db.from("refund").select("booking_id, booking!inner(learner_id)")
      .eq("reason", "slot_lost").eq("booking.learner_id", ctx.caller.id).limit(100);
    if (refundError) throw new Error(refundError.message);
    const ids = [...new Set((refunds ?? []).map((r: any) => String(r.booking_id)))];
    if (ids.length) {
      const { data: rows, error: lostError } = await ctx.db.from("booking").select("*").in("id", ids).eq("status", "expired");
      if (lostError) throw new Error(lostError.message);
      lost = (rows ?? []) as BookingRow[];
    }
  }
  const merged = [...((data ?? []) as BookingRow[]), ...lost].sort((a, b) => Date.parse(b.start_at) - Date.parse(a.start_at)).slice(0, 100);
  const rows = merged.filter((r) => r.status !== "pending_payment" || (r.hold_expires_at && Date.parse(r.hold_expires_at) > ctx.now.getTime()));
```

  Keep the existing `views` filter (`v.status !== "expired" || v.refund_reason === "slot_lost"`). Run the file:
  expected PASS, and the A55 refunded-banner tests stay green.

- [ ] **Step 5: R127 tests** (`fn-lesson-booking.test.ts`):

```ts
it("booking a different time that overlaps one's own unpaid hold ends that hold (R127)", async () => {
  const { profileId } = await bookableTutor(); const { t } = await learner();
  const first = await book(t, profileId, slotAt(5, 10));
  expect(first.status).toBe(200);
  const second = await book(t, profileId, slotAt(5, 10, 30)); // starts 30 minutes later, overlapping the first hour
  expect(second.status).toBe(200);
  expect(second.body.booking_id).not.toBe(first.body.booking_id);
  const { data } = await service().from("booking").select("status, cancelled_by").eq("id", first.body.booking_id).single();
  expect(data).toEqual({ status: "expired", cancelled_by: "learner" });
}, 30000);
it("a late payment for the hold the learner replaced is refunded, not confirmed (R127)", async () => {
  const { profileId } = await bookableTutor(); const { t } = await learner();
  const first = await book(t, profileId, slotAt(5, 14));
  await book(t, profileId, slotAt(5, 14, 30));
  const paid = await pay(first.body.booking_id);
  expect(paid.body.handled).toBe("slot_lost");
  expect(await refundCount(paid.pi)).toBe(1);
}, 30000);
```

  (`slotAt(day, hour, minute?)`: add the optional minute to the helper if it lacks one, and use a 60-minute length
  when the tutor offers it; the point is an overlapping, different start.) Expected: FAIL ("just taken", 409 `SLOT_TAKEN`).

- [ ] **Step 6: R127 fix** in `bookLesson`, after `const resumed = await resumeOwnHold(); if (resumed) return resumed;`:

```ts
  // R127: the learner chose a different time that overlaps their own unpaid hold with this tutor (the booking page
  // hides their own hold): they changed their mind, so that hold ends first. A late payment for it is refunded
  // (lesson_confirm_payment refunds an expired hold with cancelled_by set).
  const wantedEnd = new Date(Date.parse(start) + minutes * 60_000).toISOString();
  const { data: overlapping, error: overlapError } = await db.from("booking").select("id, stripe_checkout_session_id")
    .eq("learner_id", caller.id).eq("tutor_id", listing.tutorId).eq("status", "pending_payment")
    .lt("start_at", wantedEnd).gt("blocked_until", start);
  if (overlapError) throw new Error(overlapError.message);
  for (const old of overlapping ?? []) {
    if (old.stripe_checkout_session_id) await ctx.payments.expireCheckout(old.stripe_checkout_session_id).catch(() => undefined);
    const { error: endError } = await db.from("booking").update({ status: "expired", cancelled_by: "learner", status_changed_at: now.toISOString() })
      .eq("id", old.id).eq("status", "pending_payment");
    if (endError) throw new Error(endError.message);
  }
```

  Run the file: expected PASS; the A51 double-press tests stay green (same start and length is resumed before this).

- [ ] **Step 7: R126 test** (`fn-lesson-payments.test.ts`, in "a late payment for a paused person"):

```ts
it("a paused learner's refund email says their account is paused, not that the tutor is away (R126)", async () => {
  const { profileId } = await bookableTutor(); const { u, t } = await learner();
  const r = await book(t, profileId, slotAt(4, 21));
  await pause(u.id);
  const since = new Date().toISOString();
  expect((await pay(r.body.booking_id)).body.handled).toBe("slot_lost");
  const mail = await latestMail(u.email, since);
  const text = mail?.text ?? mail?.html ?? "";
  expect(text).toContain("account is paused");
  expect(text).not.toContain("not taking lessons");
}, 40000);
```

  Expected: FAIL (the email says the tutor is not taking lessons).

- [ ] **Step 8: R126 fix.** `mail-copy.ts`: add `"account_paused"` to `SlotLostReason`; in `slotLostMail`, before the
  `tutor_unavailable` branch:

```ts
  const opening = reason === "tutor_gone" ? `Your tutor is no longer on Parle, so the lesson could not be booked and we refunded ${money(refundCents)} in full.`
    : reason === "account_paused" ? `Your Parle account is paused, so the lesson could not be booked and we refunded ${money(refundCents)} in full. If you think this is a mistake, write to hello@parle.buzz.`
    : reason === "tutor_unavailable" ? ...
```

  `confirm.ts`:

```ts
    const reason: SlotLostReason = !row.tutor_id ? "tutor_gone"
      : (await isPaused(db, row.learner_id)) ? "account_paused"
      : row.cancelled_by === "admin" || (await isPaused(db, row.tutor_id)) ? "tutor_unavailable"
      : s.amountTotal !== row.price_cents ? "amount_mismatch" : "time_taken";
```

  (`row.learner_id` may be null for a deleted learner: guard `row.learner_id && await isPaused(...)`.) The wording is
  approved in Task 6 before deploy. Run the file: expected PASS.

- [ ] **Step 9: Commit** `fix(lessons): Plan 12 (R121, R125, R126, R127)` after `bun scripts/sync-app-code.ts` and the
  three files green.

---

### Task 2: Payouts and the payout webhook (R122, R123, R124, R129; migration 000033 part 1)

**Files:**
- Create: `07_Engineering/parle-backend/supabase/migrations/20261017000033_claims.sql`
- Modify: `_shared/payouts/webhook.ts`, `_shared/lessons/payments.ts` (`PaymentsUnavailable`, `guard`, `findTransfer`,
  fake account failure), `_shared/payouts/send.ts`, `_shared/payouts/admin.ts`, `_shared/payouts/accounts.ts`
- Test: `tests/fn-payout-webhook.test.ts`, `tests/payout-rules.test.ts` (or the file that tests `rules.ts`),
  `tests/fn-payout-accounts.test.ts`, `tests/fn-payout-fixes.test.ts`

**Interfaces:** Produces `PaymentsUnavailable.refused: boolean`; `findTransfer(payoutId, accountId?, sinceIso?)`;
`transferSearchParams(accountId: string, sinceIso?: string | null)`; RPC `stripe_event_retake(p_id text, p_stale_seconds int) returns boolean`.

- [ ] **Step 1: Migration part 1** (`20261017000033_claims.sql`):

```sql
-- Plan 12 (R122): a payout webhook claim records when it was taken and is cleared once handled; a claim older than
-- the stale window (a killed worker) may be taken again, so Stripe's retry is handled. Rows written by the lesson
-- webhook and every existing row have claimed_at null (handled).
alter table public.stripe_event add column if not exists claimed_at timestamptz;

create or replace function public.stripe_event_retake(p_id text, p_stale_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.stripe_event set claimed_at = now()
  where id = p_id and claimed_at is not null and claimed_at < now() - make_interval(secs => p_stale_seconds);
  return found;
end; $$;
revoke all on function public.stripe_event_retake(text, int) from public, anon, authenticated;
grant execute on function public.stripe_event_retake(text, int) to service_role;
```

  Apply locally (`bunx supabase migration up`).

- [ ] **Step 2: R122 tests** (`fn-payout-webhook.test.ts`):

```ts
describe("a claim left by a killed worker (Plan 12: R122)", () => {
  it("Stripe's retry after the claim went stale is handled; a retry while it is fresh is a duplicate", async () => {
    const id = `evt_${crypto.randomUUID().slice(0, 12)}`;
    const { tutor } = await bookableTutor();
    const acct = (await service().from("tutor_payout_account").select("stripe_account_id").eq("tutor_id", tutor.id).single()).data!.stripe_account_id;
    await service().from("stripe_event").insert({ id, type: "account.updated", claimed_at: new Date().toISOString() });
    expect((await sendEvent("account.updated", accountEvent(acct, true), id, { account: acct })).body.handled).toBe("duplicate");
    await service().from("stripe_event").update({ claimed_at: new Date(Date.now() - 5 * 60_000).toISOString() }).eq("id", id);
    expect((await sendEvent("account.updated", accountEvent(acct, true), id, { account: acct })).body.handled).toBe("account_updated");
    expect((await service().from("stripe_event").select("claimed_at").eq("id", id).single()).data!.claimed_at).toBeNull();
  });
});
```

  (Use the file's existing `accountEvent` helper and a tutor with a linked account, as its other tests do.) Expected:
  FAIL (the second delivery is a duplicate).

- [ ] **Step 3: R122 fix** in `handlePayoutEvent`:

```ts
const STALE_CLAIM_SECONDS = 120; // longer than a webhook worker can run

  const { data: claimed, error: claimError } = await db.from("stripe_event")
    .upsert({ id: eventId, type, claimed_at: new Date().toISOString() }, { onConflict: "id", ignoreDuplicates: true }).select("id");
  if (claimError) throw new Error(claimError.message);
  if (!claimed?.length) {
    // R122: a claim whose worker was stopped before finishing is taken again after the stale window
    const { data: retaken, error: retakeError } = await db.rpc("stripe_event_retake", { p_id: eventId, p_stale_seconds: STALE_CLAIM_SECONDS });
    if (retakeError) throw new Error(retakeError.message);
    if (retaken !== true) return { received: true, handled: "duplicate" };
  }
  try {
    const handled = await handleClaimedPayoutEvent(db, payments, type, object);
    await db.from("stripe_event").update({ claimed_at: null }).eq("id", eventId);
    return { received: true, handled };
  } catch (e) {
    await db.from("stripe_event").delete().eq("id", eventId);
    throw e;
  }
```

  Run the webhook files: expected PASS, including the A66 "duplicate delivered at once" test.

- [ ] **Step 4: R123 test** (unit, in the rules/payments unit test file):

```ts
import { transferSearchParams } from "../supabase/functions/_shared/lessons/payments";
it("the transfer search by account starts a day before the payout was made (R123)", () => {
  expect(transferSearchParams("acct_1", "2026-10-17T12:00:00Z")).toEqual({ destination: "acct_1", limit: 100, created: { gte: Math.floor(Date.parse("2026-10-17T12:00:00Z") / 1000) - 86_400 } });
  expect(transferSearchParams("acct_1", null)).toEqual({ destination: "acct_1", limit: 100 });
});
```

  Expected: FAIL (no export).

- [ ] **Step 5: R123 fix.** `payments.ts`:

```ts
/** R123: the fallback search for a transfer made without our group looks only at transfers made since the payout existed. */
export function transferSearchParams(accountId: string, sinceIso?: string | null): Record<string, unknown> {
  const since = sinceIso ? Date.parse(sinceIso) : NaN;
  return Number.isFinite(since) ? { destination: accountId, limit: 100, created: { gte: Math.floor(since / 1000) - 86_400 } } : { destination: accountId, limit: 100 };
}
```

  `findTransfer(payoutId, accountId, sinceIso)` uses `stripe.transfers.list(transferSearchParams(accountId, sinceIso) as any)`
  in the fallback loop; the interface gains `sinceIso?: string | null`; the fake ignores it. Callers pass the payout's
  `created_at`: `send.ts` (both calls; select `created_at` with the payout row if it is not already selected) and
  `admin.ts` `refuseIfAlreadyPaid` (load `created_at` with the payout). Run the payout files: expected PASS.

- [ ] **Step 6: R124 test** (`fn-payout-accounts.test.ts`): change the existing "Stripe being down creates nothing"
  expectation to `connect_attempt 0` (a network failure is not a refusal), then add:

```ts
it("a timed-out Connect call retries with the same key, so Stripe replays the account it made (R124)", async () => {
  await clearFakeFailures();
  await ensurePayoutCountry("Canada", "CA", "supported");
  const { tutor, token } = await bookableTutor({ payouts: false });
  await failNext("account"); // a timeout or 5xx: not a refusal
  expect((await payoutAction(token, "tutor_payout_onboarding")).status).toBe(503);
  expect((await service().from("tutor_payout_account").select("connect_attempt").eq("tutor_id", tutor.id).maybeSingle()).data?.connect_attempt ?? 0).toBe(0);
  await failNext("account_refused"); // a real refusal moves to a new key
  expect((await payoutAction(token, "tutor_payout_onboarding")).status).toBe(503);
  expect((await service().from("tutor_payout_account").select("connect_attempt").eq("tutor_id", tutor.id).single()).data!.connect_attempt).toBe(1);
});
```

  Expected: FAIL (the timeout already counts an attempt).

- [ ] **Step 7: R124 fix.** `payments.ts`:

```ts
export class PaymentsUnavailable extends Error {
  /** true when Stripe answered and refused (4xx); false for a timeout, a network error or a 5xx (R124) */
  refused: boolean;
  constructor(message: string, refused = false) { super(message); this.name = "PaymentsUnavailable"; this.refused = refused; }
}
  const guard = async <T>(run: () => Promise<T>): Promise<T> => {
    try { return await run(); } catch (e) {
      const status = Number((e as any)?.statusCode ?? (e as any)?.raw?.statusCode ?? 0);
      throw new PaymentsUnavailable((e as Error).message, status >= 400 && status < 500);
    }
  };
```

  (Keep the class's existing members; add `refused`.) The fake throws `new PaymentsUnavailable("fake account refused", true)`
  for `account_refused` (both the first refusal and the replay) and `refused = false` for `account`. `accounts.ts`:
  count the attempt only when `e instanceof PaymentsUnavailable && e.refused`. Run the file: expected PASS.

- [ ] **Step 8: R129 (founder choice at plan review; default: running total).** Test in `fn-payout-fixes.test.ts`:

```ts
it("a second chargeback decision states the new total, so only the difference is reversed (R129)", async () => {
  await clearFakeFailures();
  const admin = await adminToken();
  const h = await heldLesson();
  expect((await payoutAction(admin, "admin_release_payout", { payout_id: h.payout.id })).body.sent).toBe("paid");
  await sendEvent("charge.dispute.created", { id: `dp_${crypto.randomUUID().slice(0, 8)}`, object: "dispute", payment_intent: h.pi });
  await payoutAction(admin, "admin_refund_after_payout", { payout_id: h.payout.id, refund_cents: 1000, tutor_share: "reverse" });
  expect((await payoutOf(h.bookingId)).reversed_cents).toBe(800);
  await payoutAction(admin, "admin_refund_after_payout", { payout_id: h.payout.id, refund_cents: 2000, tutor_share: "reverse" });
  expect((await payoutOf(h.bookingId)).reversed_cents).toBe(1600); // the share of 2000 in total, not 800 + 1600
});
```

  Expected: FAIL (2400). Fix in `adminRefundAfterPayout`: for a chargeback, as for a repeated refund,

```ts
      reversed = earlier || chargeback
        ? Math.max(0, reversalCents({ ...base, alreadyReversed: 0 }) - Number(payout.reversed_cents ?? 0))
        : reversalCents({ ...base, alreadyReversed: payout.reversed_cents });
```

  and the Payouts screen's chargeback amount label says "total the bank took back so far" (i18n key found next to the
  refund-after-payout form; wording in Task 6). If the founder chooses "extra amount" instead, the test expects 2400
  and the fix is only the label ("this time"). The A64 test (2000 then 4000 gives 3200) stays green either way.

- [ ] **Step 9: Commit** `fix(payouts): Plan 12 (R122-R124, R129; migration 000033 part 1)` after sync and the payout
  files green.

---

### Task 3: One AI reply at a time per learner (R128; migration 000033 part 2)

**Files:**
- Modify: `supabase/migrations/20261017000033_claims.sql` (append), `_shared/superdev-compat.ts` (`usage.claimReply`,
  `usage.releaseReply`), `07_Engineering/parle-app/functions/parle-tutor-service.helper.ts` (send flow),
  `parle-app/src/lib/i18n.ts` and the tutor page's error mapping
- Test: `tests/fn-tutor-language.test.ts` (or the backend file that already sends tutor messages),
  `parle-app/src/lib/explanation-language.test.ts` (order test)

**Interfaces:** Produces RPCs `tutor_reply_claim(p_user uuid, p_seconds int) returns boolean`,
`tutor_reply_release(p_user uuid) returns void`; compat `usage.claimReply({ userId })`, `usage.releaseReply({ userId })`;
error code `REPLY_IN_PROGRESS` (409).

- [ ] **Step 1: Migration part 2** (append to 000033):

```sql
-- Plan 12 (R128): one AI reply at a time per learner, so two tabs with one message left cannot both run the AI. A claim
-- left by a stopped worker frees itself after p_seconds.
create table if not exists public.tutor_reply_claim (user_id uuid primary key references auth.users(id) on delete cascade, claimed_until timestamptz not null);
alter table public.tutor_reply_claim enable row level security;
revoke all on public.tutor_reply_claim from anon, authenticated;

create or replace function public.tutor_reply_claim(p_user uuid, p_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tutor_reply_claim (user_id, claimed_until) values (p_user, now() + make_interval(secs => p_seconds))
  on conflict (user_id) do update set claimed_until = excluded.claimed_until
    where public.tutor_reply_claim.claimed_until < now();
  return found;
end; $$;
create or replace function public.tutor_reply_release(p_user uuid) returns void
language sql security definer set search_path = '' as $$ delete from public.tutor_reply_claim where user_id = p_user; $$;
revoke all on function public.tutor_reply_claim(uuid, int) from public, anon, authenticated;
revoke all on function public.tutor_reply_release(uuid) from public, anon, authenticated;
grant execute on function public.tutor_reply_claim(uuid, int) to service_role;
grant execute on function public.tutor_reply_release(uuid) to service_role;
```

  Note for the executor: with `insert ... on conflict do update ... where`, `found` is false when the conflicting row is
  not updated; verify with the SQL test in Step 2 and switch to `get diagnostics v_rows = row_count` if needed.

- [ ] **Step 2: Tests.** SQL behaviour (backend, with `psql` from `helpers/admin`):

```ts
it("a reply claim is taken once, frees itself when stale, and is released (R128)", () => {
  const id = psql("select id from auth.users limit 1");
  psql(`select public.tutor_reply_release('${id}')`);
  expect(psql(`select public.tutor_reply_claim('${id}', 60)`)).toBe("t");
  expect(psql(`select public.tutor_reply_claim('${id}', 60)`)).toBe("f");
  psql(`update public.tutor_reply_claim set claimed_until = now() - interval '1 second' where user_id = '${id}'`);
  expect(psql(`select public.tutor_reply_claim('${id}', 60)`)).toBe("t");
  psql(`select public.tutor_reply_release('${id}')`);
});
```

  Send behaviour (in the tutor send test file): a learner with a live claim row (insert `claimed_until = now() + 60 s`)
  sends a message; expected 409 with `error_code` `REPLY_IN_PROGRESS`, and no AI call (queue one fake AI response first
  and assert it is still queued); after deleting the row the send is answered 200. Order test (app,
  `explanation-language.test.ts`): `claimReply(` appears before `completeTutorProvider(provider, replyPrompt` and
  `releaseReply(` after `consumeMessage(`. Expected: all FAIL.

- [ ] **Step 3: Fix.** `superdev-compat.ts` `usage`:

```ts
      /** R128: one AI reply at a time per learner; a claim left by a stopped worker frees itself after 60 s. */
      async claimReply(input: { userId: string }) {
        const user = await callerOnly();
        if (input.userId !== user.id) throw new CompatError("API request failed: Permission denied", 403);
        const { data, error } = await db.rpc("tutor_reply_claim", { p_user: user.id, p_seconds: 60 });
        if (error) failed(error, 500);
        return data === true;
      },
      async releaseReply(input: { userId: string }) {
        const user = await callerOnly();
        if (input.userId !== user.id) throw new CompatError("API request failed: Permission denied", 403);
        const { error } = await db.rpc("tutor_reply_release", { p_user: user.id });
        if (error) failed(error, 500);
      },
```

  `parle-tutor-service.helper.ts`, in `tutor_send_message` after the limit check and before `saveMessage`:

```ts
    // R128: one AI reply at a time per learner (two tabs with one message left would otherwise both run the AI)
    if (typeof client?.usage?.claimReply === "function" && !(await client.usage.claimReply({ userId: user.id }))) {
      return jsonResponse({ error: "Your last message is still being answered. Try again in a moment.", error_code: "REPLY_IN_PROGRESS" }, 409, origin);
    }
    try {
      ... the existing body up to and including the final jsonResponse ...
    } finally {
      if (typeof client?.usage?.releaseReply === "function") await client.usage.releaseReply({ userId: user.id }).catch(() => undefined);
    }
```

  The app maps `REPLY_IN_PROGRESS` to a new key `learner.tutor.replyInProgress`
  ("Your last message is still being answered. Try again in a moment.", wording in Task 6) where the tutor page maps
  its other send errors. Sync, run the backend tutor file and the app suite: expected PASS.

- [ ] **Step 4: Commit** `fix(tutor): one AI reply at a time per learner (Plan 12, R128; migration 000033 part 2)`.

---

### Task 4: Launch readiness (parle.buzz to the app)

**Files:**
- Create: `07_Engineering/parle-backend/scripts/prod/launch-check.ts`, `scripts/prod/launch-switch.ts`,
  `tests/launch-check.test.ts`
- Modify: Vercel Production settings for `parle-app` (two public configuration values)

**Interfaces:** `launchFindings(state: LaunchState): string[]` (pure), `LaunchState = { siteUrl: string; redirects: string[];
appUrl: string; appOrigins: string[]; vercelProdEnv: string[]; appDomains: string[]; waitlistDomains: string[] }`.

- [ ] **Step 1: Vercel Production values.** `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are public
  configuration (they ship in every page). Add both to Production with the same values as Preview:
  `bunx vercel env add VITE_SUPABASE_URL production` (value piped from the Preview value via `vercel env pull` into a
  scratch file, never printed), the same for the key; then `vercel env ls production` shows both names.
- [ ] **Step 2: Test** (`tests/launch-check.test.ts`):

```ts
import { describe, it, expect } from "bun:test";
import { launchFindings } from "../scripts/prod/launch-check";
const ready = { siteUrl: "https://parle.buzz", redirects: ["https://parle.buzz/reset-password"], appUrl: "https://parle.buzz",
  appOrigins: ["https://parle.buzz"], vercelProdEnv: ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "VOICE_RELAY_SECRET", "DEEPGRAM_API_KEY", "AZURE_SPEECH_KEY"],
  appDomains: ["parle.buzz"], waitlistDomains: [] };
describe("the launch check (Plan 12)", () => {
  it("a ready setup has no findings", () => expect(launchFindings(ready)).toEqual([]));
  it("names each setting still on the preview", () => {
    const today = { ...ready, siteUrl: "https://parle-preview-shayans-projects-d00acc44.vercel.app", appUrl: "https://parle-preview-shayans-projects-d00acc44.vercel.app",
      vercelProdEnv: ["VOICE_RELAY_SECRET"], appDomains: [], waitlistDomains: ["parle.buzz"] };
    const f = launchFindings(today).join("\n");
    for (const word of ["site URL", "APP_URL", "VITE_SUPABASE_URL", "parle.buzz is on parle-waitlist"]) expect(f).toContain(word);
  });
});
```

  Expected: FAIL (no module).

- [ ] **Step 3: `launch-check.ts`.** Exports `launchFindings` (the rules below, one finding per line) and, under
  `import.meta.main`, gathers the state read-only: Supabase Auth config (`/v1/projects/{ref}/config/auth`: `site_url`,
  `uri_allow_list`), `APP_URL` and `APP_ORIGINS` (compare against the expected values with the secrets list's
  digests: `GET /v1/projects/{ref}/secrets` returns names and SHA-256 digests; compute the digest of the expected value
  locally; never print values), Vercel Production env names for `parle-app` and the domains of `parle-app` and
  `parle-waitlist` (`vercel domains` / project domains via the CLI). Rules: site URL must be `https://parle.buzz`; the
  redirect list must contain `https://parle.buzz/reset-password`; `APP_URL` must be parle.buzz; `APP_ORIGINS` must
  contain parle.buzz; Production must have both `VITE_` values and the voice keys; `parle.buzz` must be a domain of
  `parle-app`, not `parle-waitlist`. Prints "ready" or the findings. Run it now: expected findings for the site URL,
  APP_URL and the domain (the switch happens on launch day).
- [ ] **Step 4: `launch-switch.ts`** (run by the founder on launch day only; `--dry-run` prints the steps): set Auth
  `site_url` to `https://parle.buzz` (Management API PATCH `config/auth`), set `APP_URL=https://parle.buzz` (secrets
  API), print the two Vercel commands to move the domain (`vercel domains` remove from `parle-waitlist`, add to
  `parle-app`) and the `--prod` deploy, then rerun the check. Each step is idempotent (setting a value it already has is
  a no-op). Test the dry run prints every step and changes nothing (`launch-check` findings unchanged).
- [ ] **Step 5: Commit** `feat(prod): launch check and launch switch for parle.buzz (Plan 12)`.

---

### Task 5: iPhone emulation check (A95, A99, R103, R107 partly)

**Files:** Create `07_Engineering/parle-backend/scripts/prod/iphone-emulation-check.ts`.

- [ ] **Step 1:** Install WebKit for the gstack Playwright:
  `node C:/Users/AgentDev/.claude/skills/gstack/node_modules/playwright/cli.js install webkit`.
- [ ] **Step 2: The script** (run with `npx tsx`, `@ts-nocheck` like the other preview checks): `webkit.launch()`,
  context from `devices["iPhone 15"]` (viewport, user agent, touch, device scale), the preview with the bypass cookie,
  a fresh AgentMail check learner (as `plan9-checks.ts learner` makes one; deleted at the end). Before any page script,
  an init script replaces `navigator.mediaDevices.getUserMedia` with one that returns an oscillator stream from an
  `AudioContext` (and, for the refusal step, one that rejects with `NotAllowedError`). Steps, each printed as an
  outcome: (1) `navigator.vendor` and the recording type the app picks (`pickRecordingType` result logged by reading
  `MediaRecorder.isTypeSupported` for the MP4 and WebM types; expected MP4 chosen when WebKit supports it); (2) a
  speaking task: record 8 s, stop, the relay answers 200 and a result shows; (3) the AI tutor: send a message, press
  Listen: audio plays or the "tap to listen" note shows (never an error); (4) "Read replies aloud" on, send again;
  (5) refuse the microphone: the page shows its microphone message, not an error; (6) no sideways scroll at 393 px;
  console errors listed. Outcomes only; never passwords, tokens or the bypass value.
- [ ] **Step 3:** Run it against the preview after Task 8's deploy (Task 8 Step 4). Whatever WebKit on Windows cannot
  do (a real microphone, iOS's own autoplay rules) is written down; the founder's real-iPhone check shrinks to: record
  one answer, play one reply.
- [ ] **Step 4: Commit** `test(prod): iPhone emulation check with Playwright WebKit (Plan 12)`.

---

### Task 6: Founder choices and wording

- [ ] **Step 1:** Show the founder exactly: the R126 email opening ("Your Parle account is paused, so the lesson could
  not be booked and we refunded $X in full. If you think this is a mistake, write to hello@parle.buzz."), the R128
  message ("Your last message is still being answered. Try again in a moment."), and the R129 label (running total or
  per-decision, as chosen at plan review).
- [ ] **Step 2:** Apply changes, rerun the affected tests, record the approval as the next decision number.

---

### Task 7: Final review and one fix pass

- [ ] **Step 1:** Full suites and type checks (Task 0 numbers plus the new tests).
- [ ] **Step 2:** Review package (`git merge-base main HEAD`..HEAD) to a fresh reviewer on the most capable model with this
  plan, the Review Focus verbatim and the ledger's rulings; ask it to check especially migration 000033 (grants,
  `search_path`, the `found` behaviour), the claim release in every exit of the tutor send (including thrown errors),
  the R127 hold ending against the A51 double press, and the launch scripts never printing a secret.
- [ ] **Step 3:** One fix pass (Critical and Important, failing test first; Minor to the ledger). Commit
  `fix(plan12): final review fixes before deploy`.

---

### Task 8: Deploy and live checks

- [ ] **Step 1: Founder applies migration 000033** (`bun scripts/prod/deploy.ts --migrations --dry-run`, expect
  `pending: 1`; then without `--dry-run`).
- [ ] **Step 2: Claude:** sync, `supabase functions deploy`, preview deploy and alias (never `--prod`).
- [ ] **Step 3: Live checks:** R127 on production (`plan11-checks.ts`-style: book, book an overlapping time, the first
  hold ends); the launch check prints its expected pre-launch findings; production database read-only: the new column,
  table and functions with `search_path=""` and no `authenticated` execute.
- [ ] **Step 4:** Run the iPhone emulation check (Task 5) on the preview.
- [ ] **Step 5:** Record "Plan 12 deploy" and "Plan 12 checks" in `migration/close-out-report.md`; commit
  `deploy: Plan 12 on production and the preview`.

---

### Task 9: Records and documents

- [ ] **Step 1:** `deferred-defects.md` and the inventory: R121-R129 and A113-A121 closed (or ruled); R103/R107 and
  A95/A99 narrowed to the real-device check; new rows for any finding; the "Plan 12 rulings" block from the ledger.
- [ ] **Step 2:** Stale lines found on 2026-10-17: `security-debt.md` Plan 9 "Open" line (NVIDIA's terms and the
  uncapped replay are done: Plan 10 and A88); inventory B1 status (first Today is 1.5 s since Plan 6; D1 closed);
  R28 (the model is GPT-6 Luna, not Gemma 4).
- [ ] **Step 3:** `HANDOFF.md` (section 4 top, section 5: the launch switch replaces the scattered launch-day notes; one
  consolidated list of the founder's unconfirmed design choices: Plan 3's two, S17, Plans 7B, 8 and 9), the backend
  README (`launch-check.ts`, `launch-switch.ts`, `iphone-emulation-check.ts`), `security-debt.md` "Status after Plan 12",
  DECISIONS (R129 choice, wording). Grep the repo's `*.md` for each changed fact (cancelled_by values, the claim
  behaviour, the parle.buzz launch steps) and fix in place; record the files touched in the ledger.
- [ ] **Step 4:** Commit `docs: Plan 12 records and documents`.

---

### Task 10: Report and finishing

- [ ] **Step 1:** `plans/2026-10-17-plan-12-report.md` in the Plan 11 report's shape.
- [ ] **Step 2:** Full suites once more; merge `--no-ff` into `main`, push, delete the branch, delete the workspace
  after its rulings are copied, `bunx supabase stop`.

---

## Self-review notes (writer)

- **Coverage:** R121 (T1 S1-2), R122 (T2 S2-3), R123 (T2 S4-5), R124 (T2 S6-7), R125 (T1 S3-4), R126 (T1 S7-8, T6),
  R127 (T1 S5-6), R128 (T3, T6), R129 (T2 S8, T6, plan review); iPhone (T5, T8); launch readiness (T4, T8); stale
  records (T9).
- **Interfaces:** migration 000033 is written in Task 2 and appended in Task 3 (one file, two parts, applied locally
  after each); `findTransfer` gains an optional third argument (fake ignores it); `PaymentsUnavailable` gains
  `refused` with a default, so other throws are unchanged.
- **Founder questions at plan review:** R129 semantics (recommended: running total); the Task 6 wording follows.
