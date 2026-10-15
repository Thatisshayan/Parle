# Deferred items: inventory after the cut-over

Date: 2026-10-15. Every open item from `deferred-defects.md` (D-list and R-register) and `security-debt.md`, sorted into
four groups. The founder asked to close the list; groups A and B become the next plan ("close-out plan"), C needs a
spec per feature first (`specs/SPEC-BACKLOG.md`), D is content and business work.

Closed or fixed items are not repeated here; see the two source files.

## Group A: code fixes (next plan)

Each fix gets a test that fails first. Order: security, then data safety and reliability, then display.

| # | Item | Problem | Fix |
|---|---|---|---|
| A1 | R10 (Sec) | Account service accepts any `photo_url`, unchecked `native_language` / `track`; tutors can call learner actions | Validate against the known lists and our storage address; refuse learner actions for tutors |
| A2 | R12 (Sec) | Sign-out while offline can leave the session in memory | Clear local session even when the server call fails; reload after sign-out |
| A3 | R21 (Sec) | `get_or_create_plan` accepts planning date, week number and "what changed" note from the browser | Server decides these; ignore browser values |
| A4 | R23 (Sec) | Scheduled-job secret compared with a plain string comparison | Constant-time comparison (`sameSecret`) |
| A5 | R25 (Sec) | "Not allowed" for another person's row vs "not found" for a missing row reveals that the row exists | Answer "not found" for both |
| A6 | R32 (Sec) | An exception in a function reaches the browser without CORS headers; `Vary: Origin` only on allowed answers | try/catch in `serveWith` returning a CORS-wrapped 500; always set `Vary` |
| A7 | R13 (Sec) | Old profile photos never deleted, no per-user limit, file type taken from the browser | Delete the previous photo on replace; size and count limit; check the file's real type |
| A8 | R20 | Two simultaneous "finish" calls can save two placement results | Claim the run first (one finish per run) |
| A9 | R19 | The placement writing score can be requested again for the same test (AI cost, overwrite) | Score once per run; return the saved score |
| A10 | R11 | Two simultaneous first saves of a profile return an error | Upsert |
| A11 | R27 | One checkout's three Stripe events race; two answer 500 until Stripe retries | Retry the sync once on a unique-key conflict |
| A12 | R30 | Webhook skips an unknown subscription without a log line | Log a warning with the event type; answer `handled: "missing"` |
| A13 | R17 | Account deletion ignores a failed subscription read and photo-removal errors; photo listing stops at 100 | Refuse deletion when the subscription cannot be read; page through photos; report removal errors |
| A14 | R24 | Daily billing re-check reads at most 1,000 subscribers, one by one | Page through all subscribers |
| A15 | R34 | "No learner profile" detected by matching an English sentence | Error code from the plan engine |
| A16 | R29 | Onboarding: failed sign-in check brings back the 7-step flow; "STEP 7 OF 6"; `aria-valuemax` 7 | Retry the check, clamp the step, fix the progress bar |
| A17 | D25 (a) | AI tutor shows "Free plan" until a chat opens, even for Premium | Read the plan summary on page load |
| A18 | R14 | Errors when re-sending the sign-up code are not shown | Show the error message |
| A19 | D23 | Audit log shows question-bank edits without old and new values | Record and show changed fields, as for settings |
| A20 | D13 | AI tutor replies to A1 learners mix in too much English | Tune the A1 instruction in the tutor prompt (checked in B) |
| A21 | D25 (b) | AI lesson items can repeat the answer inside the question stem | Reject such items in the content check (falls back to the bank) |
| A22 | R31 | Migration 000019 gaps: mixed policies skipped, waitlist visited, `is_admin()` per row | Follow-up migration: exclude the waitlist, wrap `is_admin()`, test mixed policies |
| A23 | R33 | The cut-over clean stops half-way on a concurrent waitlist sign-up | Check that the waitlist did not shrink |
| A24 | R35 | The loader never demotes a former admin; existing logins keep old roles | Set every login's role on each load |
| A25 | R9 | After choosing a role, the browser token keeps the old role until it refreshes | Refresh the session after `ensure_identity` |
| A26 | R15 | No automated test of the unverified-email branch or of sign-out clearing storage | Add the tests |
| A27 | R4 | Test-account helper rewrites every line sharing a label | Match the exact line |

## Group B: checks on the real system (same plan)

| # | Item | What to check | Who |
|---|---|---|---|
| B1 | D1 | Time to first Today for a new learner on production; if over about 10 s, plan the background build (then group A) | Claude |
| B2 | D2 | Check-in options are shuffled between displays and scored by option id | Claude |
| B3 | D10 | The AI message count resets at the learner's local midnight | Claude (local, time zone set near midnight) |
| B4 | D12 (non-voice) | A2 vs B2 explanations differ; explanations in Arabic, Spanish, Hindi; a tutor task from Today is marked done | Claude |
| B5 | D21 | Question-bank screens refuse non-admins on the server; commission text follows the setting; Settings / Audit / Users at 375 px | Claude |
| B6 | D3 | Audit all 137 bank items (121 questions + 16 prompts) and list the problems | Claude lists, founder decides |
| B7 | D13 / A20 | A1 tutor replies after the prompt change | Claude |
| B8 | R28 | How often AI practice content fails its check (production logs) | Claude, after launch too |

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
