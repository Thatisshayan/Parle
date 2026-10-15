# Deferred items: inventory after the cut-over

Groups A and B closed by Plan 5 on 2026-10-15 (A1-A27 done, B1-B8 run); see `migration/close-out-report.md`. New: A28, A29.

Date: 2026-10-15. Every open item from `deferred-defects.md` (D-list and R-register) and `security-debt.md`, sorted into
four groups. The founder asked to close the list; groups A and B become the next plan ("close-out plan"), C needs a
spec per feature first (`specs/SPEC-BACKLOG.md`), D is content and business work.

Closed or fixed items are not repeated here; see the two source files.

## Group A: code fixes (next plan)

Each fix gets a test that fails first. Order: security, then data safety and reliability, then display.

| # | Item | Problem | Fix | Status (Plan 5) |
|---|---|---|---|---|
| A1 | R10 (Sec) | Account service accepts any `photo_url`, unchecked `native_language` / `track`; tutors can call learner actions | Validate against the known lists and our storage address; refuse learner actions for tutors | done (cb1c9ce) |
| A2 | R12 (Sec) | Sign-out while offline can leave the session in memory | Clear local session even when the server call fails; reload after sign-out | done (03956a8) |
| A3 | R21 (Sec) | `get_or_create_plan` accepts planning date, week number and "what changed" note from the browser | Server decides these; ignore browser values | done (cd1b0e0) |
| A4 | R23 (Sec) | Scheduled-job secret compared with a plain string comparison | Constant-time comparison (`sameSecret`) | done (0e8c615) |
| A5 | R25 (Sec) | "Not allowed" for another person's row vs "not found" for a missing row reveals that the row exists | Answer "not found" for both | done (3fd6347) |
| A6 | R32 (Sec) | An exception in a function reaches the browser without CORS headers; `Vary: Origin` only on allowed answers | try/catch in `serveWith` returning a CORS-wrapped 500; always set `Vary` | done (0e8c615) |
| A7 | R13 (Sec) | Old profile photos never deleted, no per-user limit, file type taken from the browser | Delete the previous photo on replace; size and count limit; check the file's real type | done (ef3f335) |
| A8 | R20 | Two simultaneous "finish" calls can save two placement results | Claim the run first (one finish per run) | done (74d4ac6) |
| A9 | R19 | The placement writing score can be requested again for the same test (AI cost, overwrite) | Score once per run; return the saved score | done (74d4ac6) |
| A10 | R11 | Two simultaneous first saves of a profile return an error | Upsert | done (0250932) |
| A11 | R27 | One checkout's three Stripe events race; two answer 500 until Stripe retries | Retry the sync once on a unique-key conflict | done (0250932) |
| A12 | R30 | Webhook skips an unknown subscription without a log line | Log a warning with the event type; answer `handled: "missing"` | done (b2b82f3) |
| A13 | R17 | Account deletion ignores a failed subscription read and photo-removal errors; photo listing stops at 100 | Refuse deletion when the subscription cannot be read; page through photos; report removal errors | done (b2b82f3) |
| A14 | R24 | Daily billing re-check reads at most 1,000 subscribers, one by one | Page through all subscribers | done (b2b82f3) |
| A15 | R34 | "No learner profile" detected by matching an English sentence | Error code from the plan engine | done (cd1b0e0) |
| A16 | R29 | Onboarding: failed sign-in check brings back the 7-step flow; "STEP 7 OF 6"; `aria-valuemax` 7 | Retry the check, clamp the step, fix the progress bar | done (c43af9c) |
| A17 | D25 (a) | AI tutor shows "Free plan" until a chat opens, even for Premium | Read the plan summary on page load | done (4c47d0a) |
| A18 | R14 | Errors when re-sending the sign-up code are not shown | Show the error message | done (4c47d0a) |
| A19 | D23 | Audit log shows question-bank edits without old and new values | Record and show changed fields, as for settings | done (4c47d0a) |
| A20 | D13 | AI tutor replies to A1 learners mix in too much English | Tune the A1 instruction in the tutor prompt (checked in B) | done (e03e6ea) |
| A21 | D25 (b) | AI lesson items can repeat the answer inside the question stem | Reject such items in the content check (falls back to the bank) | done (e03e6ea) |
| A22 | R31 | Migration 000019 gaps: mixed policies skipped, waitlist visited, `is_admin()` per row | Follow-up migration: exclude the waitlist, wrap `is_admin()`, test mixed policies | done (0a3b6d3) |
| A23 | R33 | The cut-over clean stops half-way on a concurrent waitlist sign-up | Check that the waitlist did not shrink | done (d0316d3) |
| A24 | R35 | The loader never demotes a former admin; existing logins keep old roles | Set every login's role on each load | done (d0316d3) |
| A25 | R9 | After choosing a role, the browser token keeps the old role until it refreshes | Refresh the session after `ensure_identity` | done (03956a8) |
| A26 | R15 | No automated test of the unverified-email branch or of sign-out clearing storage | Add the tests | done (03956a8) |
| A27 | R4 | Test-account helper rewrites every line sharing a label | Match the exact line | done (d0316d3) |
| A28 | D1, R36 | First Today for a new learner takes 21.3 s on production (B1) | Build practice content in the background or at plan creation; show the plan at once | open (next plan) |
| A29 | D12, R37 | Explanations in the learner's language: Arabic none, Spanish only a closing question (B4) | Strengthen the explain-in-native instruction; check the reply's script | open (next plan) |

## Group B: checks on the real system (same plan)

| # | Item | What to check | Who | Status (Plan 5) |
|---|---|---|---|---|
| B1 | D1 | Time to first Today for a new learner on production; if over about 10 s, plan the background build (then group A) | Claude | 21.3 s first Today: D1 open, A28 added |
| B2 | D2 | Check-in options are shuffled between displays and scored by option id | Claude | shuffled on each load: D2 closed |
| B3 | D10 | The AI message count resets at the learner's local midnight | Claude (local, time zone set near midnight) | resets at local midnight: D10 closed |
| B4 | D12 (non-voice) | A2 vs B2 explanations differ; explanations in Arabic, Spanish, Hindi; a tutor task from Today is marked done | Claude | levels differ; Hindi ok; Arabic, Spanish not: A29 added; task hand-off not run |
| B5 | D21 | Question-bank screens refuse non-admins on the server; commission text follows the setting; Settings / Audit / Users at 375 px | Claude | 7 admin actions 403: server half closed; commission and 375 px still to check |
| B6 | D3 | Audit all 137 bank items (121 questions + 16 prompts) and list the problems | Claude lists, founder decides | 137 items, 4 why-questions flagged for the founder |
| B7 | D13 / A20 | A1 tutor replies after the prompt change | Claude | French first, at most one English line: D13 closed |
| B8 | R28 | How often AI practice content fails its check (production logs) | Claude, after launch too | too little traffic: watch after launch |

## Group C: features that need a spec first (`specs/SPEC-BACKLOG.md`)

| Backlog | Covers |
|---|---|
| 1 Full booking flow | D17, D18, R18, R2 |
| 2 Tutor payouts | Stripe Connect, commission, refunds |
| 3 Voice | S8, D12 (play-aloud, speech recognition) |
| 4 Waitlist launch email | D29 (rest) |
| 7 Account administration | D19, D20, D24 |

## Group D: content and business (founder)

| Item | Note |
|---|---|
| D28 Legal pages | Lawyer-reviewed Terms, Privacy, Tutor Agreement, Refunds |
| D3 Real question bank | 360 launch-ready items; today 121 test items |
| Stripe live mode | SPEC-BACKLOG 5 |
| Real tutors | Founding tutors (decision #22) |
| Supabase Pro | Decision #50 |
| parle.buzz to the app | At launch |
| S17 (accepted) | Practice answers stay readable for self-checking; confirm or change |
| Plan 3 decisions | Deletion while Premium; reviews of a deleted tutor |
