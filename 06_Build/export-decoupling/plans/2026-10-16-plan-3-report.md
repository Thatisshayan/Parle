# Backend Plan 3 report: server functions, AI, email, jobs, plan engine and account deletion

- **Plan:** `2026-10-16-plan-3-functions-ai-engine.md` (16 tasks), executed inline ("native") on branch `backend-plan-3`.
- **Date:** 2026-10-15 (UTC).
- **Result:** all 16 tasks complete. Tests after the final review fixes: **backend 161 of 161**, **app 364 of 364**; production build passes.
  Every screen that worked on Buildy works on local staging, and no code path calls Buildy.

## What was built
| Task | Result |
|---|---|
| 1 | local demo content seed (question bank, prompts, settings from the Plan 1 export); function settings file (git-ignored) |
| 2 | atomic rate limits (`take_rate_limit`) |
| 3 | email module: Resend in production, local mail catcher on staging |
| 4 | AI module on NVIDIA: schema check with one retry, global daily cap, test provider, per-call time limits |
| 5 | Buildy's own per-entity access rules (from `entities/*.json`) enforced by a server `createSuperdevClient` (caller, service and act-as-user modes) |
| 6 | generated server copy of Buildy's code (`supabase/functions/_app`, checked by a test); serve wrapper and guards |
| 7-9 | `parle-public-level-check`, `parle-assessment-service`, `parle-marketplace-service` on Supabase, code unchanged except: AI usage via the atomic daily counter, billing origin allow-list (`APP_ORIGINS`), setting + audit in one transaction |
| 10 | pg_cron jobs (hourly listing refresh, daily clean-up, daily billing re-check) and a signed Stripe webhook |
| 11 | study-plan engine runs on the server (`parle-plan-service`), one request context per caller |
| 12 | placement test scored on the server; answer keys only after answering; writing scored on the server |
| 13 | "Delete my account" |
| 14 | Buildy images, badge and preview scripts removed; photos via plain public link (D30, D31 closed) |
| 15 | AI bake-off; decision #49: Gemma 4 for everything (GLM 5.3 first chosen for the tutor, revised after the live check) |
| 16 | live check, two fixes found live (below), security list |

## Live check (local staging, real NVIDIA and Stripe sandbox)
| Flow | Result |
|---|---|
| Learner sign-up with emailed code | pass |
| Placement test end to end | pass: 20 answers, writing scored by AI (A2) in 70 s, result saved as the learner's, retake blocked 14 days |
| Today | pass: plan with AI-written practice; with the first AI choice a first build passed the 150 s function limit, fixed by decision #49 time limits |
| All learner pages | pass (check-in, roadmap, AI tutor, plan, tutors, lessons, progress) |
| AI tutor | pass with Gemma: opened in 16 s, replied in 30 s with a correct depuis/pendant correction, counter 10 to 9; GLM could not open within 120 s |
| Weekly check-in | pass: writing scored by AI, plan rebuilt, 99 s |
| Stripe sandbox checkout (founder click) | pass: Premium (monthly), "Stripe confirmed"; daily re-check found and stored 1 subscription |
| Settings | pass: photo shown via plain link (200); Delete my account removed login and rows |
| Tutor | pass: all 8 pages, private certificate upload; application submitted |
| Admin | pass: all 9 pages; users list shows all 136 accounts (full-rights read); approval sent the decision email (seen in the mail catcher) |
| Marketplace | pass: hourly refresh published the approved tutor; learner sees "Live Tutor" |
| Public level check | pass: estimate per skill without signing in |

**Found and fixed during the live check:** (1) check-in questions were sent with their answer keys (S12) - now
removed before reaching the browser; (2) "Your plan" counted 0 AI messages because the daily usage row had no
`created_by` - fixed (migration 000016).

**Not checked live:** a booking request (needs tutor availability set; covered by Plan 1's one-booking-per-slot test);
the Stripe webhook from Stripe itself (needs a public address: Plan 4); 10 level-check starts in the browser (tested).

## For Plan 4
- Set function secrets in production: `NVIDIA_API_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `SUPERDEV_SERVICE_ROLE_KEY`, `CRON_SECRET`, `APP_ORIGINS` (https://parle.buzz + preview), `EMAIL_TRANSPORT=resend`,
  `AI_PROVIDER=nvidia`; run `set_job_config` with the production functions address.
- Founder adds the Stripe sandbox webhook endpoint (`/functions/v1/stripe-webhook`).
- Migration must merge Buildy's one-row-per-message `usage_counter` rows into one `daily-total` row per learner and day.
- Confirm which client-address header is trustworthy behind Supabase (level-check limits).
- Re-measure AI speed in production; a paid NVIDIA tier or a second provider may be needed for the tutor's speed.
- The weekly check-in took 99 s of the 150 s function limit with live AI; watch it on slow AI days.

## Rulings made during execution (complete list)
Each: what was decided, why, and the cost if wrong.

- Task 1: the seed adds rows whose natural key (`demo_code` / `key`) is missing instead of skipping non-empty tables (earlier test runs leave a few rows). If wrong: none.
- Task 1: the job-config test was skipped until Task 10 (as planned). If wrong: none.
- Task 1: each function's `verify_jwt = false` config entry is added in the task that creates the function (the local server refuses to start when a listed function folder is missing). If wrong: none.
- Task 4: `ai.ts` re-exports `validateJson`. If wrong: none.
- Task 5: tests use valid field values; `me()` returns `full_name: null` for a user without a name. If wrong: none.
- Task 7: tests use the level-check page's real field names. If wrong: none.
- Task 8: AI usage keeps Buildy's append-only counting; the server's atomic daily row is marked `source_session_id = "daily-total"` and counted by its value (migration 000010). If wrong: none for new data; Plan 4 must merge Buildy's per-message rows into daily-total rows.
- Task 8: the coach-note AI tests moved to Task 11 (the note deliberately falls back without a study plan). If wrong: none.
- Task 8: billing return address uses an allow-list when `APP_ORIGINS` is set; otherwise Buildy's "any https site" rule. If wrong: Plan 4 must set `APP_ORIGINS` (R22).
- Task 8: checkout test uses the real plan name `premium_monthly`. If wrong: none.
- Task 8: the code generator rewrites only changed files (deleting `_app` crashed the running function server). If wrong: none.
- Task 9: migrations after 000010 are numbered in the order written (000011-000017). If wrong: none.
- Task 9: the tutor-list test gives the learner an identity and learner profile first (Buildy requires both); the admin user-list test checks other accounts are listed (the list is capped). If wrong: none.
- Task 9: the atomic setting save updates every row with that key. If wrong: duplicate rows would all take the intended new value.
- Task 10: the webhook and the billing re-check store subscriptions acting as the subscription's learner (`createSuperdevClientAs`, server-only), so the learner owns the row. If wrong: none.
- Task 10: shared Stripe code in `_shared/stripe-sync.ts`; the webhook answers 500 on a sync failure so Stripe retries. If wrong: none.
- Task 10: schedules and pg_net reach are checked through the database container (the cron schema is not exposed to the API). If wrong: none.
- Task 11: test learners use the real onboarding payload. If wrong: none.
- Task 11: coach-note AI tests complete one task first and use a two-sentence note (Buildy's rules). If wrong: none.
- Task 11: the server stand-in exports all 36 entities (the app exported 35). If wrong: none.
- Task 12: answer-option ordering moved to the server (it needs the answer key). If wrong: none.
- Task 12: `placement_answer` returns the page's existing feedback shape, so the feedback screen is unchanged. If wrong: none.
- Task 12: writing is scored on the server; the browser cannot submit a writing score. If wrong: none.
- Task 12: opening the test abandons any earlier unfinished run (the page always restarts). If wrong: a reload mid-test restarts it, as on Buildy.
- Task 12: the page's pure helpers moved into `lib/placement-test.ts`, shared with the server. If wrong: none.
- Task 12: tests use a citizenship learner for the full run and an immigration learner for required sections. If wrong: none.
- Task 13: Settings deletion texts reuse the old notice keys; password + typed DELETE; sign-out and home after success. If wrong: wording only.
- Task 13: an active Premium subscription blocks deletion (cancel in Manage billing first); administrators cannot delete themselves. If wrong: one extra step for a paying learner. **Founder to confirm.**
- Task 13: a deleted learner's review keeps its stars, not its text; reviews about a deleted tutor and their replies are removed. If wrong: review text or tutor reviews lost. **Founder to confirm (reviewer declined to judge).**
- Task 14: Buildy's preview diagnostics and console-capture scripts removed from `index.html`. If wrong: none outside Buildy's editor.
- Task 14: the no-Buildy test ignores the internal import path `@/lib/superdev/client`. If wrong: none.
- Task 14: six images copied into `public/brand/`; photos via plain public link (D30). If wrong: none.
- Task 13 follow-up: regenerated `_app` after a text change (caught by the sync test). If wrong: none.
- Task 15: AI time limits added (founder approved): background calls and a plan-build AI budget, falling back to the approved bank. If wrong: more bank practice when the AI is slow.
- Task 16: check-in questions no longer carry answer keys to the browser (found live). If wrong: none.
- Task 16: the daily usage row carries the learner's email (found live; migration 000016). If wrong: none.
- Final: two test time limits lengthened to 20 s. If wrong: none.
- Final: the reviewer's "declined to judge" items stand as written (admin full reads per spec, S17 practice answers accepted, Buildy create/update semantics kept, production header and live webhook delivery in Plan 4). If wrong: revisited in Plan 4.

## Final review (fresh reviewer) and fixes
No Critical findings. Six Important findings plus one Minor raised to Important, all fixed with a test that failed first:
1. Level-check limit could be dodged with a fake forwarded address: the address now comes from cf-connecting-ip or
   the last forwarded entry, plus 1,000 starts per hour in total; S29 stays open until Plan 4 confirms the header.
2. One account could drain the global daily AI cap: 150 AI actions per account per day.
3. An AI call could outlast the function limit (120 s per attempt, plus a retry): one budget per call (100 s standard,
   20 s background), retry only with 40% of it left, each attempt counted against the cap.
4. A failed AI tutor reply still cost a message: the message is given back (`release_usage`).
5. "Delete my account" allowed unlimited password guesses: 5 per account per hour; the check session is closed.
6. Deletion tests were thin: a full sweep (no row anywhere names the person) and a tutor case; rows linked only by
   email are now deleted too.
7. (raised from Minor) placement questions carried staff fields (`created_by` emails): only learner fields are sent.

Deferred minors: R17-R26 in `../deferred-defects.md` ("Open minor findings from the backend reviews").

