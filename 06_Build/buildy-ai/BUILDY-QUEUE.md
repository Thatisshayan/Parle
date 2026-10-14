# Buildy queue for Parle (what still goes on Buildy before export)

Founder, 2026-10-12: "keep pushing and develop as much as possible on Buildy; if there are other places we can
push it more on Buildy, do so." This is the ordered list. Rules that have worked: one small prompt (about 2,000
characters) per item, ordered parts with a checkpoint after each, test every step in the Preview before the next,
one fix round, then log what is left in `../export-decoupling/deferred-defects.md` and move on. Tick items here as
they finish.

## A. In progress and already planned
- [x] A1 Module 7 Part 1: Premium status + tutor limit by plan. DONE 2026-10-12, verified live ("290 of 300"); cause and reusable pattern in `session-logs/module-07.md`
- [x] A2 Tutor Dashboard home + Profile & Pricing (decision #39). DONE and tested live 2026-10-13 (`session-logs/module-05c2_buildy-reply.txt`). Public profile refreshes hourly; the earlier 5-minute job is reported removed, not independently verified
- [x] A3 Module 7 "Your plan" page with prices and usage, two small fixes, diagnostic block removed. DONE and tested live 2026-10-13 (`session-logs/module-07c_buildy-reply.txt`)
- [x] A4 Module 7 upgrade links and Premium roadmap triggers. DONE 2026-10-13: analytics card + plan link verified live (Premium and Free views); roadmap trigger built and unit-tested (239 / 239, five named tests), NOT exercised live; its setting is saved OFF
- [x] A5 Module 7 Part B, Stripe sandbox billing (no webhooks). DONE and verified live 2026-10-13 ~6:25 pm: the founder's checkout as learner B gave "Premium plan (monthly)", renews 2026-11-13, AI tutor limit 300. Not exercised: Manage billing / cancel, yearly, failed payment (`session-logs/module-07.md`)
- [x] A6 Module 8 Part B1. DONE and verified live 2026-10-13: coverage table, admin protection on bank screens, audited item editor, reported-content screen, AI-generated drafts (one Listening A1 draft generated and opened in the editor). Left out: three-report flag. Reviews hide / restore moved to A7
- [x] A7 Module 8 Part B2. DONE 2026-10-13: Reviews screen (empty state verified; 0 reviews exist, Hide / Restore unit-tested only); Metrics verified live with presets and the tutor-supply side, but learner-activity numbers, paid Premium, study hours and the track comparison show "Not available" (admin cannot read learner records; D24, for our backend)

## B. More that fits Buildy (self-contained screens and logic)
- [x] B1 Admin Users detail (D19). DONE 2026-10-14, verified live: role, plan (comp only), latest record, full tutor detail; every learner field shows "Not available to administrators on this platform" (access wall; learner side stays for our backend)
- [x] B2 Roadmap / Today defects D5, D6, D7, D8. DONE 2026-10-13/14: D7 and D8 verified live; D5 and D6 unit-tested with Today totals checked live
- [x] B3 AI lesson: option shuffle and scoring by option id (D9) and the daily-limit panel (D11). Both DONE and verified live 2026-10-13
- [x] B4 Small display fixes. DONE 2026-10-14: "Tutor not found" page (D14) verified live after one follow-up; Applications row refresh (D15) unit-tested only
- [x] B5 Check-in item r-a2-01 (D3). FIXED BY HAND 2026-10-14 in the item editor (place options, matching explanation), read back. The full 136-record audit is locked while the bank has 121 questions (one AI draft); not re-audited
- [x] B6 Free public level check (idea 11): the placement test usable without an account, result page with a shareable summary and "create an account to save it". Check first that an anonymous visitor can call the test service on Buildy. BUILT 2026-10-14 without a guaranteed limit (decision #41); tested signed out: works, but option ids leak the reading answers; fixed with random per-run option ids, verified signed out 2026-10-14
- [x] B7 Public pages. DONE 2026-10-14, read signed out: /how-it-works, /level-estimates, /tutor-vetting, /ai-tutor, /plans, /faq. Home page claims ("unlimited AI tutor", "full adaptive roadmap") to align: home page aligned and verified signed out 2026-10-14
- [x] B8 AI Coach light. DONE 2026-10-14, verified live as learner B (note in Persian, labelled, not regenerated on reload, allowance unchanged)
- [x] B9 Progress certificate. DONE 2026-10-14: printable summary verified live (check-in date and full statement fixed; minutes split was correct); "Weekly check-ins" row being added
- [x] B10 Tutor "Students" list: DROPPED from Buildy because C1 failed; after export with booking

## C. One more attempt, low odds
- [x] C1 Lesson request (D17), last try 2026-10-14: NOT POSSIBLE on Buildy (59.15 credits, no change; privileged write after learner sign-in not supported, error origin not traceable). Stays for our backend

## D. Stays for after export (needs our own backend)
Instant booking with a one-booking-per-slot guarantee, payments to tutors, refunds and disputes, tutor earnings,
lesson emails with calendar files and reminders, attendance evidence, account disabling and admin invitations,
server text-to-speech / speech-to-text and live voice, lesson packs (idea 8), outcome guarantee (idea 1), lesson
recordings into practice (idea 4), real email verification at sign-up (D16), and every item in `security-debt.md`.

## Then
Task 9 regression pass DONE 2026-10-14 (`session-logs/task-09_regression-2026-10-14.md`): placement test crash (D27) fix sent; legal pages empty (D28, not Buildy). Remaining: export notes, export.
BUILD-PLAN Task 9: regression pass, export readiness notes, export (founder action in Buildy; code into
`07_Engineering/`), COO inspection, protected Vercel preview, waitlist page on parle.buzz (decision #38).
