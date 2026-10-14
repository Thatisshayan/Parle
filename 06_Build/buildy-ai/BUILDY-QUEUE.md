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
- [ ] B1 Admin Users detail to the spec (D19): role, plan, last activity; learner goal, track, levels, plan summary, AI messages today; tutor status, rate, availability
- [ ] B2 Roadmap / Today defects that are pure logic or display: one check-in per week (D5), the 120% day cap after a refresh (D6), current estimates and "What changed" after a check-in (D7), completed minutes counted on the local completion date (D8)
- [ ] B3 AI lesson: shuffle answer options, score by option id (D9); explain the empty tutor mode at the limit (D11). Option shuffle SENT 2026-10-13 ~10:25 pm ET (`prompts/09a_lesson-option-shuffle.txt`), building; the empty-mode message (D11) next
- [ ] B4 Small display fixes: clear "Tutor not found" page (D14); Applications list row refreshes after a decision (D15)
- [ ] B5 Check-in bank item r-a2-01 (D3): repair by hand in Admin > Question bank repair if the screen allows it, otherwise one prompt
- [ ] B6 Free public level check (idea 11): the placement test usable without an account, result page with a shareable summary and "create an account to save it". Check first that an anonymous visitor can call the test service on Buildy
- [ ] B7 Public pages: "How Parle works / how we estimate levels / how tutors are vetted / what the AI does and does not do" (idea 14, trust page), plans and prices page, FAQ. Static content, no data
- [ ] B8 AI Coach light version (Phase 2 item 2.1): a short coach note on Today's Plan from progress, consistency and stalled skills, generated on the server, clearly labelled, no email
- [ ] B9 Progress certificate (idea 3): a printable page of hours, level history and check-ins, labelled "Estimate - not an official score"
- [ ] B10 Tutor "Students" as a read-only list of learners who sent a request, once (and only if) C1 works

## C. One more attempt, low odds
- [ ] C1 The lesson request that cannot be saved (D17): one small message asking Buildy to create the booking through a server function that writes with the function's own access and returns the record, with the exact error text surfaced; stop after one try

## D. Stays for after export (needs our own backend)
Instant booking with a one-booking-per-slot guarantee, payments to tutors, refunds and disputes, tutor earnings,
lesson emails with calendar files and reminders, attendance evidence, account disabling and admin invitations,
server text-to-speech / speech-to-text and live voice, lesson packs (idea 8), outcome guarantee (idea 1), lesson
recordings into practice (idea 4), real email verification at sign-up (D16), and every item in `security-debt.md`.

## Then
BUILD-PLAN Task 9: regression pass, export readiness notes, export (founder action in Buildy; code into
`07_Engineering/`), COO inspection, protected Vercel preview, waitlist page on parle.buzz (decision #38).
