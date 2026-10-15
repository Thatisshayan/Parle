# Preview migration report (production, private preview)

Date: 2026-10-15. Plan 4, Task 11. Production Supabase project "Parle" (hcphvipeplkfenugikrf, ca-central-1); app at
the private Vercel preview `https://parle-preview-shayans-projects-d00acc44.vercel.app` (Vercel login required).

## 1. Migration into production for the review

| Step | Result |
|---|---|
| Export | six test accounts exported fresh (`export-20261015-0740`); owner rows reused from the 05:15 owner export (the signed-in owner tab was lost when the browser restarted). Bundle: 7 people, 435 rows |
| Load and verify (`verify.ts ... prod`) | 83 checks ok, 0 FAIL, VERIFIED; question bank 121, prompts 16, settings 12, 0 person ids without an account, 0 Buildy hosts; **waitlist unchanged (0 -> 0)** |
| Stripe re-tag (`stripe-retag.ts ... prod`) | 2 tags changed (subscription and customer), no problems |
| Set-password mail | the six AgentMail test accounts only, through Resend: "Set your password for Parle" from hello@parle.buzz, links received at AgentMail, passwords set (stored in `.parle-secrets/preview-test-accounts.json`). **No mail to real people.** |
| Admin | shayanezraeil@gmail.com (Buildy owner), pending the founder's choice of admin email |

## 2. COO click-through (clean browser, bypass cookie only; `scripts/prod/preview-click-through.ts`)

| Who | Check | Result |
|---|---|---|
| m3imm (paying learner) | Today | migrated levels and today's plan (30 min, 3 tasks) |
| m3imm | Your plan | "Premium plan (monthly), renews on 13 November 2026", 300 messages a day |
| m3imm | Progress, weekly check-in | migrated week (10 min, streak 1); check-in page opens |
| m3imm | AI tutor (real AI, NVIDIA) | chat opened as **Premium** after 25 s (the greeting is written by the AI), message sent, reply saved, usage 1 of 300 |
| m5tut1 (tutor) | Dashboard, availability | "Your profile is visible to learners"; Tue and Thu available (America/Toronto) |
| signed out | Level check | question 1 of 10 served from the migrated bank |
| new visitor (Task 9) | Sign-up | 6-digit code from no-reply@parle.buzz, verified, time zone saved, lands on the learner page |

No console errors on any of these pages.

## 3. S29: client address header on production

- A client-set `cf-connecting-ip` is refused by Cloudflare in front of Supabase ("error code: 1000").
- 12 level-check starts, each with a different faked `x-forwarded-for`: 6 answered 200, then 429 `RATE_LIMITED`
  (this machine's earlier calls made up the rest of the 10). The limit follows the real client address.
- S29 marked fixed in `security-debt.md`.

## 4. Security pass

- Advisors (first deploy): fixed in migration 000019 (search path on three helpers, `(select auth.uid())` in 28
  read rules, one payout-country read rule, `placement_run` owner index); the rest accepted with reasons in
  `security-debt.md` ("Production advisors"). Confirmed in the production database after the founder applied 000019.
  The advisor lists came back empty after the restart; re-check at cut-over.
- S1-S29: S29 fixed today; S8 open by scope (voice), S17 open by decision (practice answers), S4 and S27 not
  applicable; all others fixed (`security-debt.md`).
- R-items for Plan 4: R1, R3, R5, R6, R8, R22 done; R14 rate limit done, its page message moved to the backlog; R2
  moved after cut-over with a reason (`deferred-defects.md`).
- Scheduled jobs reach the functions on production (`parle-marketplace-refresh` succeeded).
- Function logs during the click-through: no errors; the only 4xx were a deliberate "same password" answer after
  sign-up verification and "finish onboarding first" for a brand-new account.

## 5. Found and fixed during Tasks 9-11

| Finding | Fix | Test |
|---|---|---|
| Production sent 8-digit sign-up codes; the app asks for 6 | `mailer_otp_length: 6` in the production auth config | `prod-management.test.ts` |
| The webhook answered 500 for a subscription Stripe does not have (Stripe would retry for days) | answers 200 "not handled" for `resource_missing`; other failures still 500 | `fn-stripe-webhook.test.ts` |
| First Vercel deploy went to the project's production address, which was public | deployment removed; every deploy is `--target preview` until cut-over | - |
| Advisor findings | migration 000019 | `advisor-fixes.test.ts` |

## 6. Incident: production database stalled

2026-10-15 07:55 to about 08:27 UTC the database stopped answering (database, data API, sign-in and storage
unhealthy; Supabase status showed no incident; no error in the database log). The founder restarted the project.
Afterwards: all services healthy, data intact (10 logins, 121 questions, 91 tutor messages, waitlist 0, 14 MB).
The organisation is on the Supabase **Free** plan (smallest shared compute, no backups, pauses when idle).
Recommendation: Pro before cut-over (founder decision).

## 7. Founder click-through

Pending: m3imm; a new sign-up with onboarding, placement and a sandbox checkout (Premium must appear through the
webhook without "Refresh my plan"); m5tut1; admin (founder's account, password set through "Forgot password");
signed-out level check.

## 8. Clean-up before cut-over

Delete the preview test sign-ups (obsidianteamhq+preview047249, +preview047323, +previewmv96w7v2) and any accounts the
founder creates during the click-through; the cut-over empties the app tables anyway (Task 12).
