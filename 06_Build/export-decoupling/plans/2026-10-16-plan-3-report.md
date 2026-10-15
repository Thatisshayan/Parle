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

## Rulings made during execution
See the plan ledger (copied into the final message of the session); the main ones: AI usage keeps Buildy's
append-only counting with a server "daily-total" row; billing origin allow-list; webhook and re-check act as the
subscription's learner; option ordering and writing scoring moved to the server for the placement test; migrations
numbered in the order written (000010 onward).

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

Deferred minors are listed in the session's final message and the ledger.

