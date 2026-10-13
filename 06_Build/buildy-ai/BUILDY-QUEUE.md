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
- [ ] A4 Module 7 upgrade links and Premium roadmap triggers (items 3 and 5)
- [ ] A5 Module 7 Part B, Stripe sandbox billing. BUILT 2026-10-13 (`prompts/07b2_stripe-no-webhook.txt`, `session-logs/module-07b2_buildy-reply.txt`, 177 tests): no webhooks, Stripe as the source of truth, "Refresh my plan", "Manage billing". NOT TESTED: waits for the founder's checkout as learner B; then the agent reads the pages
- [ ] A6 Module 8 Part B1 (`prompts/08b1_question-bank.txt`): Part 1 coverage table DONE in Preview 2026-10-13 (not yet looked at live); Parts 2-4 (item review + admin checks on bank screens, AI drafts, reported content) building since ~3:10 pm ET (`prompts/08b1_continue.txt`). Reviews hide / restore moved to A7
- [ ] A7 Module 8 Part B2: reviews hide / restore; Metrics for a date range + "demand versus available tutor hours" by time zone and specialty (decision #33)

## B. More that fits Buildy (self-contained screens and logic)
- [ ] B1 Admin Users detail to the spec (D19): role, plan, last activity; learner goal, track, levels, plan summary, AI messages today; tutor status, rate, availability
- [ ] B2 Roadmap / Today defects that are pure logic or display: one check-in per week (D5), the 120% day cap after a refresh (D6), current estimates and "What changed" after a check-in (D7), completed minutes counted on the local completion date (D8)
- [ ] B3 AI lesson: shuffle answer options, score by option id (D9); explain the empty tutor mode at the limit (D11)
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
