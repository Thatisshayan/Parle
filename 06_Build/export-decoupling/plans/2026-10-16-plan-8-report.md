# Plan 8 report: account administration and the waitlist launch email

Date: 2026-10-16. Branch `plan-8-admin-waitlist`, merged into `main`. Plan
`plans/2026-10-16-plan-8-account-admin-waitlist.md`; spec `specs/2026-10-16-plan-8-account-admin-waitlist-design.md`;
results `migration/close-out-report.md`, "Plan 8 deploy" and "Plan 8 checks". Executed natively (executing-plans), one
final review by a fresh reviewer on the strongest model, run before the production deploy.

## Tasks

- Task 0: complete (branch plan-8-admin-waitlist from main 2c28fd4; stack and functions serve up; migration number 000027)
- Task 1: complete (commits 2c28fd4..a1d0a71, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/admin-waitlist-schema.test.ts tests/clean-app-tables.test.ts tests/access-coverage.test.ts tests/booking-schema.test.ts tests/advisor-fixes.test.ts' → Ran 29 tests across 5 files. [21.07s])
- Task 2: complete (commits a1d0a71..90deb27, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/owner-flag.test.ts tests/auth-flow.test.ts tests/account-service.test.ts tests/superdev-compat.test.ts tests/fn-lesson-booking.test.ts' → Ran 48 tests across 5 files. [24.70s])
- Task 3: complete (commits 90deb27..3ec731f, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/fn-admin-administrators.test.ts' → Ran 3 tests across 1 file. [3.67s])
- Task 4: complete (commits 3ec731f..5684165, tests: bash -c 'docker exec supabase_db_parle-staging psql -U postgres -c 'delete from public.stripe_test_fail' >/dev/null; cd 07_Engineering/parle-backend && bun test tests/fn-admin-accounts.test.ts tests/lesson-mail.test.ts tests/account-deletion.test.ts tests/fn-lesson-booking.test.ts tests/fn-lesson-mail.test.ts' → Ran 40 tests across 5 files. [36.18s])
- Task 5: complete (commits 5684165..83c3e6f, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/fn-admin-user-detail.test.ts' → Ran 2 tests across 1 file. [2.73s])
- Task 6: complete (commits 83c3e6f..e306a1b, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/admin-metrics-rules.test.ts tests/fn-admin-metrics.test.ts' → Ran 5 tests across 2 files. [2.46s])
- Task 7: complete (commits e306a1b..3375ea9, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/waitlist-mail.test.ts tests/email.test.ts tests/local-setup.test.ts tests/fn-lesson-mail.test.ts tests/set-password-mail.test.ts' → Ran 18 tests across 5 files. [4.64s])
- Task 8: complete (commits 3375ea9..6e4e751, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/fn-waitlist.test.ts tests/waitlist-mail.test.ts tests/admin-waitlist-schema.test.ts' → Ran 24 tests across 3 files. [15.41s])
- Task 9: complete (commits 6e4e751..2a9d8a2, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/fn-waitlist-unsubscribe.test.ts tests/fn-waitlist.test.ts' → Ran 11 tests across 2 files. [10.74s])
- Task 10: complete (commits 2a9d8a2..6ce26ec, tests: bash -c 'cd 07_Engineering/parle-app && bun run test' → Ran 443 tests across 42 files. [3.67s])
- Task 11: complete (commits 6ce26ec..162c0b0, tests: bash -c 'cd 07_Engineering/parle-app && bun run test' → Ran 444 tests across 42 files. [3.32s])
- Task 12: complete (commits 162c0b0..18201e3, tests: bash -c 'cd 07_Engineering/parle-app && bun run test' → Ran 445 tests across 42 files. [3.35s])
- Task 13: complete (commits 18201e3..7cbf61e, tests: bash -c 'cd 07_Engineering/parle-backend && bun test tests/waitlist-site.test.ts' → Ran 2 tests across 1 file. [50.00ms])
- Task 14: complete (commits 7cbf61e..11b6a0d; parle.buzz published by the founder: /unsubscribe 200, privacy wording live; postal address not set yet)
- Task 15: complete (a2d3af9; deferred parts recorded)
- Task 16: complete (f501b1c; R81-R93, A73-A85; decision #56)

## Rulings made during execution (each with what it costs if wrong)

- Pre-flight: Ruling: Plan 7B's fix migration took 000026 (20261016000026_payout_fixes_cad.sql), so this plan's migration is 20261016000027_admin_waitlist.sql everywhere the plan says 000026 (plan's own rule, Global Constraints) — cost if wrong: none.
- Pre-flight: Ruling: decision #55 made lessons CAD after this plan was written; any lesson money or wording this plan adds uses formatCadCents / "CAD" (USD only for Premium) — cost if wrong: a wording fix.
- Task 0: Ruling: baselines taken from the 7B fix pass on the same commit content now on main (backend 400 pass / 1 skip / 0 fail; app 439 pass; type errors 63), not re-run; type-error list saved to the workspace as tsc-baseline.txt with line numbers and key counts stripped (the plan's /tmp path is replaced by the workspace) — cost if wrong: none, every task runs its tests.
- Task 1: Ruling: production waitlist_signup has unique (lower(email), role), role not null default 'learner', goal checked against a fixed list, join_waitlist returns json with parameter defaults; the plan's stand-in allowed one row per address and returned jsonb. Stand-in rewritten to production's definitions (read 2026-10-16). Consequence for Review Focus 3: an address can be listed as learner and tutor; the launch campaign must still send once per address (waitlist_send unique (campaign, email)).
- Task 1: Ruling: waitlist_queue filtered the role after picking one row per address, so a person who joined as a learner first and later as a tutor never got the founding-tutor email; the role filter now comes first, and for the launch email a person listed as both gets the tutor's version. New test "someone who joined as a learner and later as a tutor..." (red with the file, green after) — cost if wrong: such a person gets the tutor launch text.
- Task 1: Ruling: the schema test's two-spellings case now uses learner + tutor rows (production's unique index allows one row per address and role) — cost if wrong: none.
- Task 1: Ruling: waitlist_delete_all says "delete ... where true": PostgREST's pg_safeupdate refuses a DELETE without WHERE through the API (found by the test; plan bug) — cost if wrong: none. The plan test counting one "delete from public.waitlist_signup" still holds.
- Task 4: Ruling: the plan's lesson-mail test expected '$40.00 USD'; decision #55 made it CAD, so the test text reads CAD — cost if wrong: none.
- Task 7: Ruling: the founding-tutor email said 'hourly rate in US dollars'; decision #55 makes it 'Canadian dollars (CAD)' (test RED then GREEN) — cost if wrong: none.
- Task 8: Ruling: the 'address listed twice' test inserts learner + tutor rows (production's unique index (lower(email), role)) — cost if wrong: none.
- Task 10: Ruling: the plan's components used formatUsdCents; renamed to formatCadCents (decision #55). Type errors 63, same list (3 lines differ only in the quoted key count).
- Task 14: Ruling: the final whole-branch review (Task 17) runs BEFORE the production deploy, not after the checks — Plan 7B's review found Important money bugs after deploy; reviewing first keeps unreviewed code off production. Cost if wrong: the deploy waits for the review.
- Final: Ruling: declined-to-judge items stand: refund reason 'admin' shared with 7B (no collision found); non-ASCII lower-casing; www.parle.buzz in APP_ORIGINS (checked at deploy); join_waitlist sign-ups after the delete; safe_ts per-row cost; tokens in function request logs — cost if wrong: small, all recorded for the records task.
- Task 14: Ruling: www.parle.buzz serves the site without redirecting and APP_ORIGINS lists only https://parle.buzz; every unsubscribe link uses https://parle.buzz (WAITLIST_SITE_URL), so the page's POST is allowed — cost if wrong: someone opening the page by hand on www sees an error; fix by adding www to APP_ORIGINS or a redirect.
- Task 15: Ruling: the founder asked to defer what needs them; owner invite/remove live, their Gmail send test, and the small campaign + delete + reset are deferred (the campaign also needs the postal address); added 'non-owner' check instead (all three owner actions 403 OWNER_REQUIRED) — cost if wrong: an owner-path bug on production found later; covered by local tests.

## Final review

0 Critical, 4 Important, 12 Minor; Minor 1 and Minor 5 graded up by their effect on people.

- Final: fixed Important 1 (refused refund replayed 24 h) — fn-admin-fixes "retried with a new key" RED→GREEN (fake now replays refusals per key: failNext("refund_refused"))
- Final: fixed Important 2 (paused party's started lesson auto-completed and paid) — "already started is listed, never auto-completed" RED→GREEN
- Final: fixed Important 3 (one-click unsubscribes rate-limited per shared IP) — "many one-click unsubscribes" RED→GREEN
- Final: fixed Important 4 (removed admin becomes learner) — "gives back the role" RED→GREEN (spec 3.3 said learner; the effect on a former tutor rules it)
- Final: fixed Minor 1 graded up (failed ban, retry refused) — "pausing again ... applies it" RED→GREEN; Minor 2 (listing ids wiped) fixed in the same edit
- Final: fixed Minor 5 graded up (delete while launch failed) — "cannot be deleted while launch emails failed" RED→GREEN

## Deferred minors (also in `deferred-defects.md` R81-R93 and the inventory A73-A85)

- routine admin actions (approval, demo reviews) republish a paused tutor's listing (bookings still refused)
- Send can show "unsaved" after a save when the text had trailing spaces or newlines (reload fixes)
- pacing 600 ms x 50 per minute leaves little room under Resend's 2 requests per second; runs can overlap
- a missing unsubscribe secret makes every run fail without a reason on the page; last_error not cleared on success
- rotating WAITLIST_UNSUBSCRIBE_SECRET breaks unsubscribe links already sent (CASL expects 60 days): never rotate, or accept the previous secret
- the static unsubscribe page shows 429/500 as "not valid"; it posts on load (mail scanners that run scripts could unsubscribe)
- the Send explanation's count includes unsubscribed people and counts learner+tutor duplicates twice
- a paused person's access token keeps working against PostgREST and Storage until it expires (about 1 h); functions refuse it
- choosing "keep" leaves payment holds open: a learner already on Stripe Checkout can still pay the paused tutor

## Design choices for the founder to confirm

The list of 19 in the plan, section "Design choices and rulings made while writing this plan". Founder approvals so
far: the two email texts and the parle.buzz privacy wording (decision #56). Open: the sender postal address; the
owner-session checks and the small live campaign (deferred until the address is set).

## Final suite

Backend 455 pass, 1 skip, 0 fail; app 445 pass; type errors 62. Under the full suite's load the local edge runtime
logs "CPU time soft limit reached" and a test can see a 502 or a 5 s timeout; the two account-deletion tests now have
a 30 s limit (the plan's rule for multi-step tests), and single 502s passed on rerun (local only, not production).
