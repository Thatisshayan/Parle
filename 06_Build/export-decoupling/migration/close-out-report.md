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

