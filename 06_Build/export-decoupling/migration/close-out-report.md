# Plan 5 close-out report

Date: 2026-10-15. Plan: `06_Build/export-decoupling/plans/2026-10-16-plan-5-deferred-close-out.md` (groups A and B of
`deferred-inventory-2026-10-15.md`). Production Supabase "Parle" (hcphvipeplkfenugikrf); private preview
`https://parle-preview-shayans-projects-d00acc44.vercel.app`.

## Deploy

| Step | Result |
|---|---|
| Suites before deploy | backend 239 pass, 1 opt-in skip, 0 fail; app 396 pass; app type errors 63 (unchanged baseline) |
| App build | the local build cannot run here (Windows Smart App Control blocks the build tool's native file); the Vercel build succeeded (READY) |
| Migrations (founder) | dry run `pending: 2`; applied `20261016000021_profile_photo_limits` and `20261016000022_policy_wrap_followup` |
| Database check | waitlist 0 (unchanged); 0 read rules that work out the user per row; photo upload rule with the 10-file limit present; `private.wrap_policy_auth_calls()` not callable by signed-in users |
| Functions | all 8 deployed: account, assessment, billing-recheck, marketplace-refresh, marketplace-service, plan, public-level-check, stripe-webhook |
| Function settings | `PUBLIC_SUPABASE_URL` added; uploaded by the founder (11 settings) |
| Preview | deployment `parle-a2w14w3b2` (first attempt answered "Not authorized", the retry built), aliased to the stable address |

## Smoke checks on the preview

| Check | Result |
|---|---|
| New visitor sign-up | 6-digit code from no-reply@parle.buzz; lands on onboarding "STEP 1 OF 6", no account step |
| m3imm Today, Your plan, check-in | migrated plan; "Premium plan (monthly), renews 13 November 2026"; check-in opens |
| AI tutor plan label at 1.5 s (A17) | "PREMIUM PLAN, 299 of 300 AI messages left" (before: "Free plan" until a chat opened) |
| AI tutor | chat opened as Premium after 16 s; reply arrived |
| m5tut1, level check | listing published; question 1 of 10 |
| Wrong job secret (A4) | `parle-marketplace-refresh` 401 |
| Stranger origin (A6) | `parle-account-service` from evil.example: 401, `Vary: Origin`, no allow-origin header |
| Photo (A1, A7) | m3imm uploads a PNG in Settings, saves, reloads: the photo shows from our storage |
| Offline sign-out (A2) | lands on /login, no `parle-`/`sb-`/`superdev_` keys left |

Console messages seen and explained: the deliberate "same password" 422 after sign-up verification; 409
`ONBOARDING_REQUIRED` for a brand-new account; one "Failed to fetch" from the test leaving the tutor page mid-load; one
`ERR_INTERNET_DISCONNECTED` during the offline sign-out.

## Plan 6 deploy (2026-10-15, about 20:40 to 21:05 UTC)

| Step | Result |
|---|---|
| Suites before deploy | backend 264 pass, 1 opt-in skip, 0 fail; app 418 pass; app type errors 63 (baseline) |
| Migration (founder) | dry run `pending: 1`; applied `20261016000023_task_content_pending` |
| Database check | waitlist 0 (unchanged); `learner_task_content_source_check` now allows `pending` |
| Functions | all 8 deployed: account, assessment, billing-recheck, marketplace-refresh, marketplace-service, plan, public-level-check, stripe-webhook |
| Function settings | none added |
| Test admin (decision #52) | `obsidianteamhq+admin@agentmail.to` created with role admin; password set through the real "Set your password for Parle" mail; signs in as administrator; a read-only admin action answers 200 |
| Preview | deployment `parle-ja3aaxves` (first attempt failed without output, the retry built READY as a preview), aliased to the stable address |

| Smoke check | Result |
|---|---|
| New visitor sign-up | 6-digit code from no-reply@parle.buzz; lands on onboarding "STEP 1 OF 6", no account step; console: the explained 422 (same password) and 409 (ONBOARDING_REQUIRED) |
| m3imm Today, Your plan, Progress, check-in | all load; "Premium plan (monthly), renews 13 November 2026" |
| AI tutor plan label at 1.5 s | "PREMIUM PLAN" |
| AI tutor | opening in m3imm's saved language (Persian); first run: the script's message was sent while the second ("Free chat") session was still opening and no reply call was made; second run: chat open after 47 s, reply arrived, no error message. Every tutor call answered 200; no "missed the explanation language" warning |
| m5tut1, level check | listing published; question 1 of 10 |
| New actions without a sign-in | `clean_unsaved_photos` 401; `prepare_task_content` 401 |

## Group B checks (2026-10-15, about 18:50 to 19:10 UTC)

### B1 - first Today (D1)
- Environment: production, a fresh AgentMail A2 learner (deleted afterwards).
- Run: `bun scripts/prod/close-out-checks.ts first-today`
- Outcome: `B1 first Today: 200 in 21.3 s; 3 tasks; content {"generated":2,"approved_bank":1}`; `B1 second open: 1.6 s`.
- Decision: over 10 s, so **D1 stays open** and becomes **A28** (build practice content in the background or at plan
  creation; show the plan at once). 1 of 3 tasks fell back to the approved bank.

### B2 - check-in options shuffled (D2)
- Environment: preview, m3imm, check-in opened three times, not submitted.
- Code evidence: shuffle in the page (`shuffleQuestionOptions`), scoring by option id (`countCorrectAnswers`), unit test
  in `learner-display.test.ts`.
- Outcome (first question's options): round 1 `Jeudi à 14 h | Mardi à 14 h | Mardi à 10 h`; round 2 `Mardi à 14 h |
  Jeudi à 14 h | Mardi à 10 h`; round 3 `Mardi à 10 h | Jeudi à 14 h | Mardi à 14 h`.
- Decision: the order differs on every load: **D2 closed**.

### B3 - AI count resets at local midnight (D10)
- Environment: local stack, a learner in `Antarctica/Mawson` (7 minutes before its midnight).
- Run: `bun scripts/checks/midnight-reset.ts`
- Outcome: `before midnight 2 used, after midnight 0 used; counter rows [{"period_key":"2026-10-15","ai_messages":2}]`.
- Decision: **D10 closed**.

### B4 - explanations by level and language; tutor task hand-off (D12, non-voice)
- Environment: production, five fresh AgentMail learners (deleted afterwards), one question each: "Quelle est la
  différence entre « depuis » et « pendant » ?".
- Run: `bun scripts/prod/close-out-checks.ts explanations`
- Outcome:
  - A2 English (355 characters): short French with English examples in brackets.
  - B2 English (812 characters): longer, fully French explanation. A2 and B2 differ as intended.
  - A2 Hindi, explanations in Hindi: the explanation is in Hindi.
  - A2 Arabic, explanations in Arabic: **no Arabic at all**; the whole reply is French.
  - A2 Spanish, explanations in Spanish: explanation in French; only the closing question is in Spanish.
- Decision: level difference holds; explanations in the learner's language do not hold for Arabic and only partly for
  Spanish: new item **A29**. Tutor task hand-off from Today (complete a lesson, task shows done) **not run** this pass
  (a long manual flow); D12 stays open for it and for voice (SPEC-BACKLOG 3).

### B5 - question-bank screens and admin layout (D21)
- Server refusals on production as a learner (`close-out-checks.ts admin-refusals`): `audit_question_bank`,
  `admin_generate_content_drafts`, `admin_get_demo_bank`, `admin_update_demo_bank_content`, `admin_content_coverage`,
  `admin_get_content_item`, `admin_save_content_item`: all **403**.
- Pin test: `fn-assessment.test.ts` "refuses the question-bank audit to a learner" passes.
- Commission sentence and 375 px layout of Settings, Audit log and Users: **not run**. The local app no longer starts on
  this computer (Windows Smart App Control blocks the build tool's native file for `vite` too), and on the preview the
  admin screens need a founder admin sign-in.
- Decision: the server half of D21 is closed; **D21 stays open** for the commission sentence and 375 px layout (founder
  check on the preview, or a machine where the app runs).

### B6 - bank audit (D3)
- Run: `bun scripts/checks/bank-audit.ts local` (124 questions, 16 prompts: 3 extra local test rows), then `prod`.
- Outcome: `questions 121, prompts 16, items with problems 4` (137 in total). The four: R-B2-04, R-B2-02, R-B1-09,
  L-B2-07, each "a why-question whose answer gives no reason" (the correct option does not start with parce que / pour /
  à cause / car). Full list: `bank-audit-2026-10.md`.
- Decision: the audit part of D3 is done; the founder decides each of the four (fix, retire or keep). The real question
  bank stays in group D.

### B7 - A1 tutor replies (D13, A20)
- Environment: production, a fresh AgentMail A1 learner (deleted afterwards), three chat messages.
- Outcome: reply 1 "Bonjour Sam ! Enchanté. Vous habitez à Toronto. ... In English: Nice to meet you, Sam. What is your
  job?"; reply 2 all French; reply 3 French then "In English: You say "Je suis fatigué" (I am tired)."
- Decision: every reply French first with at most one "In English:" line: **D13 closed**.

### B8 - AI practice content failures (R28)
- `learner_task` (last 14 days, not check-ins): generated 35, suggestion 2 (mostly rows migrated from Buildy).
- Function logs (last 24 h): practice generation fell back 4 times, 1 AI reply failed its format check, 0 invalid
  content, 0 unavailable or cap; all from this plan's check learners.
- Decision: too little real traffic to judge; **R28 stays "watch after launch"**, re-run after launch.


## Plan 6 checks (2026-10-15, about 21:00 to 21:30 UTC)

Environment: production (`hcphvipeplkfenugikrf`) through the API, and the private preview
(`parle-preview-shayans-projects-d00acc44.vercel.app`, deployment `parle-ja3aaxves`) against production. Check learners
on AgentMail aliases, each deleted at the end (`deleted the check learner: 200`). Scripts:
`scripts/prod/plan6-checks.ts`, `scripts/prod/plan6-preview-checks.ts`.

### A28 - first Today

Run: `plan6-checks.ts first-today` (21:02) and `plan6-preview-checks.ts today-first-open` (21:03), new A2 learners.

```
A28 first Today: 200 in 1.5 s; 3 tasks; 2 pending
A28 prepare speaking_practice (2026-10-16): 200 approved_bank in 21.8 s
A28 prepare speaking_check (2026-10-16): 200 approved_bank in 21.6 s
A28 second open: 200 in 1.8 s; pending left 0
A28 browser: plan shown after 2.2 s
A28 browser: practice ready after 23.6 s; console errors (0): none
```

Logs: each prepare call's AI request ended "AI call took too long { mode: fast, limitMs: 20000 }", then the approved
bank was used. The browser script's label counts read 0 because its label text does not match the cards (not a result).

**Decision: A28 done, D1 closed** (first Today 1.5 s by API, 2.2 s in the browser; was 21.3 s). New defect **A39**:
the AI practice call times out at its 20 s limit, so every practice card waits about 22 s and shows bank content. This
was already so before Plan 6 (it was inside the 21 s); now it is visible as a card that fills late.

### A29 - explanations in the learner's language

Run: `plan6-checks.ts explanations` three times (21:04, 21:16, 21:23), new A2 learners with explanations in Arabic,
Spanish and Hindi, question "Quelle est la différence entre « depuis » et « pendant » ?".

- 21:04 (Task 3 code): Arabic 100 % Arabic letters, Hindi 84 %, Spanish in Spanish, but every reply stopped after one
  introduction sentence (97 to 131 characters). A learner with French-first explanations got the full answer (387
  characters). Cause: the new rule "Start the reply with one or two sentences in <language>". Fixed (a5d3b50).
- 21:16: Spanish full explanation in Spanish (643 characters); Hindi 227 characters, 79 % Devanagari; Arabic `reply
  failed 546` (the worker that served the 40.7 s opening was shut down at 150 s while the reply and its language repeat
  had run 109.6 s). Fixed: the repeat runs only after a first answer of at most 30 s and stops near 60 s (fffdce6).
- 21:23: Spanish full explanation in Spanish (824 characters, closing practice question); Arabic full explanation but
  in French (log: "missed the explanation language; no time to ask again", the first answer took over 30 s); Hindi
  `reply failed 546` (one AI answer ran 93.8 s with no repeat, on a worker already in use; shut down at its 150 s limit).

**Decision: A29 stays open, improved.** Spanish passes. Arabic followed in 1 of 3 runs, Hindi in 2 of 3. The rule and
the reminder work when the model follows them; the repeat cannot run when the first answer is slow. Next step for the
founder: a stronger or faster model for explain-in-native learners. New defect **A40**: tutor answers of 46 to 94 s on
the Free plan's 150 s worker limit end in 546 when a worker is reused, and the message stays charged (the refund never
runs). Options: Supabase Pro (400 s limit), or a shorter tutor AI budget (today 100 s per call).

### B4 - tutor task hand-off

Run: `plan6-preview-checks.ts tutor-task` (21:26), m3imm on the preview.

```
B4: opening the writing task from Today
B4: tutor feedback arrived and Finish enabled: true
B4: "task marked done" message shown: true
B4: Today still offers the tutor link for this task: false
B4: task status on the server after Finish: done
console errors (0): none
```

**Decision: B4 passes; D12's non-voice hand-off part is closed** (voice stays SPEC-BACKLOG 3). One real task on
m3imm's plan is now done.

### B5 - commission sentence and admin screens at 375 px

Run: `plan6-preview-checks.ts admin-screens` (21:29), the test admin of decision #52 and m5tut1.

```
B5 admin signed in, landed on /admin
B5 commission before: 20
B5 commission set to 25: saved
B5 tutor agreement at 25: Parle applies a 25% platform commission to the listed tutori...
B5 commission set to 20: saved
B5 tutor agreement after reset: Parle applies a 20% platform commission to the listed tutori...
B5 375 px Settings: scrollWidth 375 ok
B5 375 px Audit log: scrollWidth 375 ok
B5 375 px Users: scrollWidth 375 ok
console errors (0): none
```

**Decision: B5 passes; D21 closed.** The commission is back at 20 %; two audit rows under the test admin record the
change and the reset.

## Faster tutor model trial (2026-10-15, about 22:15 to 22:35 UTC)

Side test (NVIDIA directly, short prompt, one model at a time): GPT-OSS 20B answered an Arabic tutor question in 14 to
28 s (65 to 86 % Arabic) and a practice exercise in 12 to 24 s (format valid 3 of 5); Nemotron 3 Super 120B in 26 to
57 s (59 to 74 % Arabic) and 25 to 60 s (valid 5 of 5); Gemma 4 31B took 46 s to over 100 s for both. Gemma 3 12B and
4B, Mistral Nemo, Kimi K2.6, Phi 3.5 MoE and Nemotron 51B answer 404 for this key.

Live trial: the founder set `ai_model_standard` to `openai/gpt-oss-20b` (`scripts/prod/set-ai-model.ts`). The A1 tutor
check passed (simple French, one "In English:" line), but with the app's full tutor prompt every explain-in-native reply
was one French line ("Voici la différence entre « depuis » et « pendant ». "): Arabic, Spanish and Hindi all failed.
**Decision:** switched back to `google/gemma-4-31b-it` by the founder about 20 minutes later. Next: test candidates
through the real tutor prompt before any live switch.

Second live trial (22:30 to 22:40 UTC): the founder set `ai_model_standard` to `nvidia/nemotron-3-super-120b-a12b`.
Explanations: Arabic full answer, 70 % Arabic letters; Hindi full answer, 76 % Devanagari (one stray Polish word);
Spanish `reply failed 503`. A1 check: first run `open failed 503`, second run passed (simple French, one "In English:"
line per reply). Successful tutor calls took 21 to 34 s (Gemma 4 that evening: 46 to over 100 s); 2 of 8 calls failed as
"provider unavailable" (after 10 s and 71 s). **Decision (founder): keep Nemotron 3 Super for now** and watch the failure
rate. Switch back with `bun scripts/prod/set-ai-model.ts standard google/gemma-4-31b-it`.

Practice model (23:40 to 23:50 UTC): practice AI limit raised from 20 s to 40 s (deployed); with Gemma 4, 1 of 2 cards
was AI-written (15.6 s) and 1 timed out. The founder then set `ai_model_fast` to `nvidia/nemotron-3-super-120b-a12b`.
Two first-Today checks: 3 of 4 cards AI-written (20.8, 23.7, 30.6 s); the 4th failed the learner-content check and used
the approved bank, as designed. **Decision: keep Nemotron 3 Super for practice.**

## Plan 7A deploy (2026-10-16, about 00:30 to 00:50 UTC)

| Step | Result |
|---|---|
| Suites before deploy | backend 338 pass, 1 opt-in skip, 0 fail; app 429 pass; app type errors 63 (baseline) |
| Migration (founder) | dry run `pending: 1`; applied `20261016000024_lesson_booking.sql` (old `booking` table had 0 rows) |
| Database check | waitlist 0 (unchanged); booking columns `start_at`, `blocked_until`, `learner_id` present; `booking_no_overlap` present; cron `parle-booking-jobs` `*/10 * * * *`; `require_payout_account` absent (booking open in test mode) |
| Functions | all 10 deployed, including the new `parle-lesson-service` and `parle-booking-jobs` |
| Function settings | `APP_URL` set to the preview address by the founder |
| Preview | deployment `parle-ddpuo54wi` (READY, preview target), aliased to the stable address |

| Smoke check | Result |
|---|---|
| New functions without a sign-in or the job secret | `parle-lesson-service` 401; `parle-booking-jobs` 401 |
| m3imm Today, Your plan, AI tutor | all load; "PREMIUM PLAN"; tutor opening in Persian; reply arrived |
| m5tut1 dashboard, level check | load; 0 console errors |

## Plan 7B deploy (2026-10-16, about 02:40 to 03:20 UTC)

| Step | Result |
|---|---|
| Suites before deploy | backend 386 pass, 1 opt-in skip, 0 fail (344 + 42 new); app 438 pass; app type errors 63 (same list as the baseline) |
| Before-numbers (production, read only) | waitlist 0; lessons with a paying outcome 0 (so the backfill makes no payouts); confirmed lessons 1 (7A booking B, not yet held) |
| Migration (founder) | dry run `pending: 1`; applied `20261016000025_tutor_payouts.sql` |
| Database check | waitlist 0 (unchanged); tables `payout` and `tutor_payout_account` present; `require_payout_account` = true; 0 payout rows; cron `parle-booking-jobs` `*/10 * * * *` |
| Functions | all 11 deployed, including the new `parle-payout-service` (deployed before the Connect secret was set: the webhook skips a missing secret, so payments kept working) |
| Stripe sandbox (founder) | Parle's key belongs to the test mode of account `...4yE0` (country CA, currency CAD), not the separate "ObsidianStudios sandbox" `...Qhv3`. Connect is on (Stripe asked no setup questions in test mode). Branding (icon, logo, colour #1E3A8A) and public business name "Parle" set in the live view (test mode hides them; they are shared). Existing destination gained `transfer.created` and `transfer.reversed`; new destination "Parle connected accounts" with `account.updated`. Stripe asked for no business details. The founder also made one test connected account from Stripe's setup guide (harmless, not used by Parle). |
| Function settings (founder) | `STRIPE_CONNECT_WEBHOOK_SECRET` (from the secrets folder; Notepad had saved it as `.txt`, renamed) and `ADMIN_ALERT_EMAIL` = obsidianteamhq+admin@agentmail.to |
| Preview | deployment `parle-pfxureel2` (READY, preview target), aliased to the stable address |

| Smoke check | Result |
|---|---|
| `parle-payout-service` without a sign-in | 401 |
| `stripe-webhook` without a signature | 400 |
| Preview click-through | passes, 0 console errors |
| Jobs calls after the deploy | 5 of 5 answered 200 |

Go-live note: the account's statement descriptor is "OBSIDIAN MEDIA"; change it to PARLE before live payments.

### Plan 7B fix deploy (2026-10-16, about 04:00 UTC)

| Step | Result |
|---|---|
| Why | Final review: 7 Important findings. One confirmed on Stripe: USD lesson charges settle in CAD and a USD transfer from them is refused (1-cent probe; a CAD probe went through and was reversed). Founder decision #55: lessons charged in CAD, tutors paid in CAD. |
| Suites | backend 400 pass, 1 skip, 0 fail; app 439 pass; type errors 63 (same list) |
| Migration (founder) | dry run `pending: 1`; applied `20261016000026_payout_fixes_cad.sql`; check: waitlist 0, payment currency default `cad`, `payout_due`, `payout_missing`, `payout_record_transfer` present |
| Functions | all 11 redeployed |
| Preview | `parle-c3irt1dem` READY (first try "Not authorized", second try fine), aliased |
| Smoke | payout service 401 without sign-in; click-through 0 console errors; lessons C and D still confirmed; m5tut1 payout account enabled |
| Also on the way | Stripe "Accounts v1 support" switched on by the founder (Stripe now steers new Connect platforms to Accounts v2: move before going live); Connect account key per tutor per hour (Stripe replays a refusal for 24 h) |

## Plan 7B checks (2026-10-16, Stripe test mode, tutor m5tut1)

### m5tut1 before onboarding
Earnings page answered 200 with no payout account, country Canada, payout delay 72 h; no legacy payouts.

### Connect onboarding
The first try answered 503 `PAYOUT_SETUP_UNAVAILABLE`: Stripe refused `POST /v1/accounts` until the founder switched
on "Accounts v1 support" for the test platform. Stripe then replayed the cached refusal for the same idempotency key,
so the key became per tutor per UTC hour (ruling). After onboarding: state enabled, payouts enabled, details submitted,
7 `account.updated` events. Pass.

### Lessons C and D booked
Booked with m5tut1 (16:30 and 17:00 UTC), paid by Playwright with the test card, both confirmed. Both were charged in
USD, before decision #55 moved lessons to CAD.

### Payout after a shortened delay (and delay restored)
Delay set to 0 from Admin Settings; lesson C completed (payout scheduled: US$11.20 to the tutor, US$2.80 to Parle);
the 22:10 UTC jobs run paid it: transfer recorded, to m5tut1's account, from the lesson's charge, transfer group
matches. Stripe sent **CA$15.89** (the USD share converted, decision #55), so the script's "amount equals the payout"
line reads false by design. Delay restored to 72 h and confirmed. Pass.

### Problem report, alert and release from the admin screen
Lesson D completed (payout scheduled, 72 h), the learner's report answered 200 and held it (`dispute`); the
administrator mail "Parle payouts: a learner reported a problem" arrived with a link to the Payouts screen. Release
from the admin screen: Stripe refused the transfer ("You cannot use `transfer_group` if the `source_transaction`
already has one set"). Cause: lesson D's charge was used by the Plan 7B final review's currency probe (a 1-cent CAD
transfer with group `probe-currency`, reversed), so the charge already carried a group. The safety net behaved as
designed: the payout is held as `transfer_failed`, the administrator mail "a tutor transfer failed" carried Stripe's
reason, nothing was retried; audit `["payout.release"]`, lesson completed. The release path itself is the same code
the jobs used for lesson C. A real charge only gets a group when a transfer was made from it, so this needs a manual
transfer first; recorded as R109. Lesson D's payout stays held in test mode (the administrator can refund it from the
Payouts screen). Partial pass: hold, alert, release and failure handling verified; the successful release transfer
was not.

### Earnings page
Account ready, a paid lesson with its Stripe reference, monthly totals, 0 console errors, no sideways scroll at 375 px.
Pass.

### Check learner deleted
The check learner was deleted; the payouts stay `["paid","held"]`.

### Plan 7A booking B (after its lesson)
`finish-b`: attendance 200 completed; review 200, 5 stars, stored visible and not a test review; the check learner
deleted; their lessons stay (completed, and the earlier one cancelled by the learner). Pass.

## Plan 8 deploy (2026-10-16, about 05:30 to 06:15 UTC)

| Step | Result |
|---|---|
| Final review | run before the deploy (Plan 8 Task 14 ruling): 0 Critical, 4 Important, 12 Minor; Important 1-4 and Minor 1, 2, 5 fixed with failing tests first; the rest recorded (R81 onward) |
| Suites | backend 455 pass, 1 skip, 0 fail; app 445 pass; app type errors 62 (one fewer: the old Metrics page error went with the rewrite) |
| Before-number | waitlist 0 |
| Migration (founder) | dry run `pending: 1`; applied `20261016000027_admin_waitlist.sql` (000026 was Plan 7B's fix) |
| Database check | waitlist 0 (unchanged); 0 constraints point at `waitlist_signup`; tables `account_status`, `waitlist_campaign`, `waitlist_send`, `waitlist_unsubscribe`; campaigns `founding_tutor`, `launch`; cron `parle-waitlist-jobs` `* * * * *` (calls the job only while something is queued); `booking_cancelled_by_check` allows `admin` |
| Owner (founder) | `set-owner.ts`: obsidianmedia.yt@gmail.com set as owner; administrators obsidianteamhq+admin@agentmail.to and shayanezraeil@gmail.com unchanged |
| Function settings (founder) | `WAITLIST_UNSUBSCRIBE_SECRET` (generated into the secrets folder, never printed; never rotate it: links already sent would stop working) and `WAITLIST_SITE_URL` = https://parle.buzz |
| Mailbox and limits (founder) | `unsubscribe@parle.buzz` forward added at Porkbun; Resend Free plan: 100 emails a day, 3,000 a month (a launch list above 100 goes out over several days) |
| Functions | all 14 deployed, new: `parle-admin-service`, `parle-waitlist-jobs`, `parle-waitlist-unsubscribe` |
| Preview | `parle-jyosj6zhe` READY, aliased |
| parle.buzz (founder) | published: `/unsubscribe` 200; privacy page "Last updated October 16, 2026" with the founding-tutor email, Resend and the do-not-email list |
| Note | www.parle.buzz serves the site without redirecting; every unsubscribe link uses https://parle.buzz, which APP_ORIGINS allows |

| Smoke check | Result |
|---|---|
| `parle-admin-service` / `parle-waitlist-jobs` without sign-in or job secret | 401 / 401 |
| `parle-waitlist-unsubscribe` GET / forged token | 405 / 400 `TOKEN_INVALID` |
| Preview click-through | 0 console errors |
| Sender postal address | not set yet (founder types it on Admin > Waitlist; Send stays blocked until then) |

## Plan 8 checks (2026-10-16, about 06:30 to 07:10 UTC, production and the private preview `parle-jyosj6zhe`)

| Check | What was run | Outcome | Decision |
|---|---|---|---|
| Pause and enable a learner | `plan8-checks.ts pause`, `plan8-preview-checks.ts paused-signin`, `plan8-checks.ts enable` | pause 200 disabled; old session 401; sign-in `user_banned`; user detail shows disabled with the reason; the preview shows "Your account is paused. Contact hello@parle.buzz."; enable 200 active; sign-in works; check learner deleted 200 | pass |
| Owner-only actions refused for a regular administrator | `plan8-checks.ts non-owner` (the test administrator, not an owner) | overview 200, me.owner false, 1 owner listed; invite 403 `OWNER_REQUIRED`; remove the owner 403 `OWNER_REQUIRED`; delete the waitlist 403 `OWNER_REQUIRED` | pass |
| Both emails (test sends) | `plan8-checks.ts test-sends` to the test administrator's AgentMail address | founding_tutor and launch: 200; received; unsubscribe link; footer; no em dash: all true | pass |
| Admin pages and unsubscribe pages | `plan8-preview-checks.ts admin-pages` and `unsubscribe-pages` at 1280 and 375 px | Administrators, Metrics "Lessons and money", Waitlist "Sender's postal address", Bookings "Lessons with a paused participant", account panel: all true; scrollWidth equals the width; console errors 0; both unsubscribe pages turn a forged link away ("This link is not valid"; the parle.buzz page logs the expected 400 twice) | pass |
| Owner invites and removes an administrator (live) | not run | needs the founder's owner session in the browser; covered by local tests (fn-admin-administrators, fn-admin-fixes) | deferred (founder's call, 2026-10-16) |
| Founder's own "Send test to me" in Gmail | not run | needs the founder's session | deferred |
| Small campaign on the real list, unsubscribes, list deletion, reset | not run | needs the sender postal address (not set yet), the founder's go and the owner's Delete | deferred until the address is set; run before the first real send |

## Bank readers fix (R94) deploy (2026-10-16, about 06:30 to 06:55 UTC)

| Step | Result |
|---|---|
| Change | one switch `question_bank_source` (demo or real) for placement, weekly check-ins and the public level check; never mixed; read in pages of 1,000; a placement run keeps its bank; real items need no demo code; admin Content page card with counts per cell, switching to real refused until complete (audited) |
| Suites | backend 461 pass, 1 skip, 0 fail; app 449 pass; type errors 62 (same list as main) |
| Migration (founder) | dry run `pending: 1`; applied `20261016000028_question_bank_source.sql`; production: source demo, 120 approved demo questions, 0 real; waitlist 0 |
| Functions, preview | all deployed; preview `parle-518cbo5ot` READY, aliased |
| Smoke | public level check start: 10 questions (demo bank); click-through: the AI tutor opens and replies; one console line "tutor session could not open: Failed to fetch" from an abandoned second request (R95) |
| Next | the Lesson Bank import (HANDOFF-TO-REPO.md), then the Content page shows the real bank's counts and an administrator switches to Real |

## Plan 9 deploy (2026-10-16, about 07:40 to 08:00 UTC)

| Step | Result |
|---|---|
| Final review | run before the deploy: 0 Critical, 3 Important (failed scoring spent the allowance; placement speech-to-text unbounded; iPhone read-aloud silent), all fixed with failing tests first; 5 Minor recorded |
| Suites | backend 507 pass, 1 skip, 0 fail; app 495 pass; type errors 62 (same list); relay unit tests and `tsconfig.api.json` 0 errors |
| Migration (founder) | dry run `pending: 1`; applied `20261016000029_voice.sql`; check: 4 voice tables, bucket `listening-audio` private (audio/mpeg), `voice_take` and `listening_claim`, `skill_estimate` accepts `speaking_task`, no voice setting rows (defaults in code), waitlist 0 |
| Function setting (founder) | `VOICE_RELAY_SECRET` (generated into the secrets folder, never printed) |
| Vercel settings (founder) | `parle-app`: `NVIDIA_API_KEY` and `VOICE_RELAY_SECRET` as Sensitive for Production and Preview; `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are public by design and set for Preview only (add them for Production at launch) |
| Functions | all deployed, new `parle-voice-service` |
| Preview | `parle-4sopuwstj` READY, aliased |

| Smoke check | Result |
|---|---|
| Relay `POST /api/voice?action=speak` without sign-in | 401 `AUTH_REQUIRED` (the relay answers, not the page) |
| Relay GET | 405 |
| `parle-voice-service` without sign-in | 401 |
| Click-through | the AI tutor opens with "Read replies aloud"; one known console line (R95); other sections 0 errors |

## Plan 9 checks (2026-10-16, about 08:00 to 08:25 UTC, preview `parle-4sopuwstj`)

| Check | Result |
|---|---|
| French sample (one NVIDIA speech call) | 15.6 s of speech made for the browser's fake microphone |
| Check learner | ready, plan 200, two speaking tasks for today |
| Speaking task at 375 px (record, Whisper, score) | result shown; French heard; "Practice estimate" label; pronunciation line; no sideways scroll; relay 200 JSON; 0 console errors |
| Microphone refused | typed answer scored and marked as writing practice; no sideways scroll; 0 console errors. The "microphone is blocked" message was not seen: headless Chrome answered differently, then two reruns timed out before the button. Left for the real-phone check |
| Tutor Listen | played in the natural French voice (200 audio/mpeg) |
| Tutor voice message | transcript written into the box, French heard; 1 console line (the known tutor line, R95) |
| Reply read aloud | two replies 200 audio/mpeg; replies counted (6 of 20 after the browser checks) |
| Listening audio | first 200, generated; second 200 from the cache; file 200 audio/mpeg |
| Free daily answers | rerun on a fresh learner: answers 1 and 2 scored, answer 3 refused 429 LIMIT_REACHED (Free = 2 a day). The first run found no open task because the browser checks had used it |
| Status | 200, Free, answers 1/2, messages 1/5, replies 6/20, zone America/Toronto |
| Cleanup | check learners deleted; voice uses 0, results 0 left |
| Check script fixes | Today is `/learner`, not `/learner/today`; the record step now presses the exact "Stop" button (the tutor also has "Stop reading") |
| NVIDIA terms | founder to confirm on build.nvidia.com whether free developer access allows a live product (launch item) |
| Still to do on a real iPhone | record and play an answer in Safari; read-aloud after a tap; the blocked-microphone message |

## Plan 10 deploy (2026-10-16, about 22:55 to 23:05 UTC)

| Step | Result |
|---|---|
| Final review | run before the deploy: 0 Critical, 1 Important (a model setting without `openrouter:` could still reach NVIDIA while its key existed), fixed with a failing test first (`AI_PROVIDER=live` refuses it); the tutor prompt's age line moved to 18; 7 Minor recorded |
| Suites | backend 517 pass, 1 skip, 0 fail; app 513 pass; app type errors 62 (same list); relay 0 |
| Supabase settings (founder) | `OPENROUTER_API_KEY`, `AI_PROVIDER=live` |
| Vercel settings | founder: `DEEPGRAM_API_KEY`, `AZURE_SPEECH_KEY` (Sensitive, Production and Preview); Claude: `AZURE_SPEECH_REGION` (canadacentral), `VOICE_TTS_VOICE` (fr-CA-SylvieNeural); `VOICE_RELAY_SECRET` unchanged |
| Functions | all deployed (`Deployed Functions.`) |
| Preview | `parle-ldtdt177u` READY, aliased; after the NVIDIA key was removed, `parle-r6ttxv9j4` READY, aliased |
| Model switch (founder) | `set-ai-model.ts openrouter:openai/gpt-6-luna`: `ai_model_fast` and `ai_model_standard` set |
| Smoke | relay without sign-in 401 `AUTH_REQUIRED`; click-through: the AI tutor opens, the known R95 console line only |

## Plan 10 checks (2026-10-16, about 23:00 to 23:15 UTC)

| Check | Result |
|---|---|
| Quality test (Task 3) | 5 models x 7 tasks x 3 runs through OpenRouter's zero-retention routing: GPT-6 Luna, Claude Haiku 5.5 and Gemini 3.1 Flash-Lite 21/21 valid in 1.2 to 8.1 s; Nemotron 3 Super (the previous model) up to 120 s and one empty answer; Gemma 4 31B 7 to 23 s. Founder picked GPT-6 Luna (decision #59). Report `spikes/ai-bakeoff-openrouter-report.md` |
| Azure sample | 14.7 s of Canadian French speech (Sylvie, Canada Central) |
| Speaking task at 375 px (Deepgram, then scoring) | result shown; French heard; estimate label; pronunciation line; no sideways scroll; relay 200 JSON; 0 console errors; 51 s for the whole browser check |
| Tutor Listen and voice message | Listen in the natural voice (200 audio/mpeg); voice message transcribed into the box, French heard; the known R95 line |
| Read aloud | two replies 200 audio/mpeg, counted |
| Listening audio | served from the cache (`generated false`): the cached items keep the NVIDIA voice until prepared again (R110) |
| Tutor on GPT-6 Luna | session opened in 5 to 6 s; replies in 8.8 to 15.1 s (NVIDIA Nemotron: 26 s and more, with "provider unavailable" failures) |
| Writing score | 200 in 4.8 s |
| Practice | the check learner's cards: 2 AI-written, 1 from the approved bank |
| Nothing reaches NVIDIA | function logs from 23:00 UTC: no `AI call failed`, no prefix refusal, no NVIDIA line; OpenRouter shows the calls ($0.04 used in total, quality test included) |
| NVIDIA key removed | founder: `supabase secrets unset NVIDIA_API_KEY`; `vercel env rm NVIDIA_API_KEY` (Production and Preview); `env.ts` no longer uploads it; the preview redeployed; tutor and read-aloud checked again: ok |
| Cleanup | check learner deleted; voice uses and results 0 left |
| Deepgram opt-out price | to read in the Deepgram console (Usage) after today's requests (R111) |
| Still to do on a real iPhone | as Plan 9 (R103, R107), now on Deepgram and Azure |

## Plan 11 deploy (2026-10-17, about 02:40 to 03:00 UTC)

| Step | Result |
|---|---|
| Final review | run before the deploy: 0 Critical, 1 Important (a repeated refund after payout reversed the tutor's share twice), plus two Minor findings re-graded Important (a late payment could confirm a lesson for a paused person; an enable that stopped partway could not be retried); all three fixed with a failing test first; 9 Minor deferred (listed in the Plan 11 report) |
| Suites | backend 569 pass, 1 skip, 0 fail; app 516 pass; app type errors 61 (the baseline list minus the deleted Buildy metrics test); relay 0 |
| Migrations (founder) | dry run `pending: 3`; applied 000030 booking fixes, 000031 payout fixes, 000032 admin and waitlist fixes |
| Supabase settings | none new; `STRIPE_WEBHOOK_SECRET` and `STRIPE_CONNECT_WEBHOOK_SECRET` both present (the webhook now checks each against its own event types) |
| Functions | all 15 deployed and ACTIVE |
| Preview | `parle-lb7dq2b5l` READY, aliased to parle-preview |
| parle.buzz (founder) | published: www.parle.buzz answers 308 to parle.buzz with path and query kept; the unsubscribe page asks first ("Stop Parle emails?", "Unsubscribe me") |
| Listening audio reset (founder) | `--check` 1 file made before 2026-10-16T23:00Z (NVIDIA voice); removed 1 (A102, R110) |
| Smoke | relay without sign-in 401; preview home 200; production database (read only): the four new columns, every new or changed function with `search_path=""` and no `authenticated` execute, the paused-listing trigger, the paused-person check in `lesson_confirm_payment`, one booking read rule ("participants read") |

## Plan 11 checks (2026-10-17, about 03:00 to 03:40 UTC)

| Check | Result |
|---|---|
| Explanations in the learner's language (A29) | `plan6-checks.ts explanations` three times (Arabic, Spanish, Hindi, and Persian added): native-script share 67 to 78 % Arabic, 66 to 79 % Hindi, 72 to 81 % Persian (target at least 30 %); Spanish 9 to 15 markers |
| AI tutor console line (A87) | `preview-click-through.ts`: the tutor opens and replies; console errors 0 for the learner, the tutor and the signed-out level check (the R95 line is gone) |
| Lesson D's held payout (A101) | released on the Payouts screen (done, no longer held, 0 console errors); database: payout `paid` with a Stripe transfer, 1,589 CA cents for a 1,120-cent USD-era payout (the probe's transfer group no longer blocks it, R109) |
| Earnings converted amount (A70) | m5tut1's Earnings: account ready, Stripe reference, monthly totals, "Stripe sent CA$... (converted ...)" shown; 0 console errors; 375 px without sideways scroll |
| Book pressed twice at once (A51) | `plan11-checks.ts book`: both presses 200 with the same booking; one hold; no "just taken" |
| Payment | Stripe test card on the Checkout page; back on /learner/lessons (checkout=done); lesson `confirmed` |
| Learner and tutor cancel at once (A53) | both 200, no error; booking cancelled by the learner; payment refunded 1,400 of 1,400 cents; one refund row |
| Unsubscribe page, bad link (A78) | www link redirected to parle.buzz with its token; "Stop Parle emails?" and the button shown, nothing sent; after the press one request and "This link is not valid"; 375 px without sideways scroll |
| Listening audio in the new voice (A102) | first request `generated true` (made again in the Azure voice after the reset), second `generated false` from the cache; both 200 audio/mpeg |
| Read aloud | two replies 200 audio/mpeg; replies used 1 of 20 (the replay is not counted) |
| Clean-up | the Plan 9 and Plan 11 check learners deleted; no check accounts left (the 10 permanent test accounts remain) |

## Plan 12 deploy (2026-10-17, about 07:30 to 07:45 UTC)

| Step | Result |
|---|---|
| Final review | run before the deploy: 0 Critical, 2 Important (R127 ignored the tutor's buffer; R128 read usage before the claim) plus five Minor findings re-graded Important (claim lifetime and release by token, R127 ending a hold before checking or after payment, the bypass in navigation errors, the launch switch order); all fixed with failing tests first; 4 Minor deferred (R133-R136; R132 is the pre-existing weekend test item) |
| Suites | backend 585 pass, 1 skip, 3 fail (the weekend-only plan-service tests, R132, pre-existing); app 522 pass; app type errors 61 (unchanged); relay 0 |
| Migration (founder) | dry run `pending: 1`; applied 000033 (payout webhook claim retake; one AI reply at a time per learner) |
| Vercel Production | `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` added (public configuration, copied from Preview) |
| Functions | 14 deployed at new versions (the waitlist unsubscribe function was unchanged) |
| Preview | `parle-7yk9ig966` READY, aliased to parle-preview |
| Database (read only) | `stripe_event.claimed_at`; `tutor_reply_claim` with row security; `stripe_event_retake`, `tutor_reply_claim` (returns its token), `tutor_reply_release` with `search_path=""` and no anon or authenticated execute |

## Plan 12 checks (2026-10-17, about 07:45 to 08:00 UTC)

| Check | Result |
|---|---|
| A taken time (R130) | another learner choosing a time someone holds: 409 "just taken" in 507 ms (the slot check used to cost 1.3 to 2.6 s of CPU) |
| Changing one's mind (R127) | a different, overlapping time: 200 in 1.2 s; the first hold expired, ended by the learner |
| iPhone emulation (Playwright WebKit, iPhone 15) | Apple vendor; Listen in the natural voice; layout 393 px with no sideways scroll; console errors 0 (the audio unlock clip is now allowed, R131); this engine has no MediaRecorder, so recording shows the app's "This browser cannot record audio" message; real recording and iOS autoplay stay with the founder's real-iPhone check |
| Launch check | three findings, all expected before launch day: Auth site URL, APP_URL, parle.buzz still on parle-waitlist |
| Clean-up | both Plan 12 check learners and the Plan 9 check learner deleted |

## Plan 13 deploy (2026-10-17, about 09:25 to 09:50 UTC)

| Step | Result |
|---|---|
| Final review | 0 Critical, 5 Important (stale "transcript" wording; prepared audio with no way out when it will not play; listening feedback explanations quoting the transcript; the public check signing every file per start; real prompts filtered out of placement) plus two Minor findings re-graded Important (an audio lookup failure blocking a question; a Skip on the feedback screen); all fixed with failing tests first; 9 Minor deferred |
| Suites | backend 606 pass, 1 skip, 3 weekend-only fails (R132); app 541 pass; app type errors 61; relay 0 |
| Migration | none |
| Functions | plan service v28, voice service v7, public level check v23 (the others unchanged) |
| Preview | `parle-ckxmo0abe` READY, aliased |
| Bank | production stays on the demo bank; the Lesson Bank v1 import is local only until the founder's go |
| Demo listening audio (founder's go) | `prepare-listening-audio.ts prod --apply --founder-go`: 39 made, 0 failed, 0 left (Azure, about 16,000 characters) |

## Plan 13 checks (2026-10-17, about 09:35 to 09:50 UTC)

| Check | Result |
|---|---|
| Placement listening (production, demo bank) | no transcript sent; before the audio step the Listen path, after it a prepared audio address |
| Answer feedback | neither transcript nor explanation for a listening answer |
| Skip a listening question | 200, unscored, the next question is a different one |
| Public level check (signed out) | before the audio step 503 QUESTION_BANK_UNAVAILABLE (expected); after it 200 with 5 listening questions and no transcript |
| Clean-up | both check learners deleted |
