# Plan 7A report: tutor lesson booking (Stripe test mode)

Date: 2026-10-16. Branch `plan-7a-booking`, merged into main the same day at the founder's request, before the last
production check (attendance and review after booking B's lesson). Plan: `06_Build/export-decoupling/plans/2026-10-16-plan-7a-booking.md`.
Spec: `specs/2026-10-16-plan-7-booking-payouts-design.md` (approved 2026-10-15). Results: `migration/close-out-report.md`,
"Plan 7A deploy" and "Plan 7A checks". Final state: backend 344 pass (1 opt-in skip), app 430 pass, type errors 63.

## Still open from this plan

- Booking B attendance and review on production, after its lesson (2026-10-16 16:00-16:30 UTC): `cd 07_Engineering/parle-backend && bun scripts/prod/plan7a-checks.ts finish-b`, then `bun scripts/prod/plan7a-checks.ts delete`; write "Plan 7A checks" (meeting link, booking and confirmation, reschedule, cancel and refund, lesson card and brief, attendance and review, check learner deleted) into the close-out report. Check state is in `C:/Users/AgentDev/.parle-secrets/plan7a-check-state.json`.
- Founder: confirm the design choices (HANDOFF section 5), name founding tutors and dates, choose the booking wording (A50).

## Tasks

- Task 0: complete (commits a4afb15..a4afb15, tests: baselines backend 265/1 skip/0 fail, app 421/0 fail, type errors 63; stack and functions serve up)
- Task 1: complete (commits a4afb15..1b23690, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/booking-schema.test.ts tests/rules.test.ts tests/access-rules.test.ts tests/constraints.test.ts tests/review-fixes.test.ts tests/superdev-compat.test.ts tests/access-coverage.test.ts tests/clean-app-tables.test.ts tests/account-deletion.test.ts tests/tables.test.ts tests/generate-access-rules.test.ts tests/advisor-fixes.test.ts tests/fn-jobs.test.ts 2>&1 | tail -4' → Ran 70 tests across 13 files. [25.91s])
- Task 2: complete (commits 1b23690..43c4807, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/lesson-rules.test.ts tests/app-code-sync.test.ts 2>&1 | tail -3 && cd ../parle-app && bun run test 2>&1 | tail -3' → Ran 421 tests across 38 files. [2.40s])
- Task 3: complete (commits 43c4807..441b8f4, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/app-code-sync.test.ts tests/fn-marketplace.test.ts tests/fn-jobs.test.ts 2>&1 | tail -3 && cd ../parle-app && bun run test 2>&1 | tail -3' → Ran 424 tests across 38 files. [3.27s])
- Task 4: complete (commits 441b8f4..f858abb, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/fn-lesson-booking.test.ts tests/local-setup.test.ts tests/lesson-rules.test.ts 2>&1 | tail -3' → Ran 25 tests across 3 files. [13.37s])
- Task 5: complete (commits f858abb..07e9e22, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/fn-lesson-payments.test.ts tests/fn-stripe-webhook.test.ts tests/fn-lesson-booking.test.ts tests/fn-jobs.test.ts 2>&1 | tail -3' → Ran 32 tests across 4 files. [27.01s])
- Task 6: complete (commits 07e9e22..61decea, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/lesson-mail.test.ts tests/fn-lesson-mail.test.ts tests/fn-lesson-payments.test.ts tests/email.test.ts tests/set-password-mail.test.ts 2>&1 | tail -3' → Ran 22 tests across 5 files. [17.25s])
- Task 7: complete (commits 61decea..5be94d9, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/fn-lesson-changes.test.ts tests/fn-lesson-booking.test.ts tests/fn-lesson-payments.test.ts 2>&1 | tail -3' → Ran 30 tests across 3 files. [45.48s])
- Task 8: complete (commits 5be94d9..79ba5f0, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/account-deletion.test.ts tests/app-code-sync.test.ts tests/fn-lesson-changes.test.ts 2>&1 | tail -3 && cd ../parle-app && bun run test 2>&1 | tail -3' → Ran 424 tests across 38 files. [3.17s])
- Task 9: complete (commits 79ba5f0..e25facb, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/fn-booking-jobs.test.ts tests/fn-lesson-payments.test.ts tests/fn-lesson-mail.test.ts 2>&1 | tail -3' → Ran 17 tests across 3 files. [21.27s])
- Task 10: complete (commits e25facb..6051d71, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/fn-lesson-after.test.ts tests/fn-lesson-changes.test.ts 2>&1 | tail -3' → Ran 17 tests across 2 files. [26.22s])
- Task 11: complete (commits 6051d71..a9664f1, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/app-code-sync.test.ts tests/lesson-focus.test.ts tests/fn-plan-service.test.ts tests/fn-task-content.test.ts 2>&1 | tail -3 && cd ../parle-app && bun run test 2>&1 | tail -3' → Ran 425 tests across 38 files. [3.28s])
- Task 12: complete (commits a9664f1..30b258d, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/app-code-sync.test.ts 2>&1 | tail -3 && cd ../parle-app && bun run test 2>&1 | tail -3' → Ran 429 tests across 39 files. [3.19s])
- Task 13: complete (commits 30b258d..94b8b8f, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/app-code-sync.test.ts tests/fn-tutor-availability-price.test.ts tests/fn-marketplace.test.ts 2>&1 | tail -3 && cd ../parle-app && bun run test 2>&1 | tail -3' → Ran 429 tests across 39 files. [3.17s])
- Task 14: complete (commits 94b8b8f..00bb99b, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/app-code-sync.test.ts 2>&1 | tail -3 && cd ../parle-app && bun run test 2>&1 | tail -3' → Ran 429 tests across 39 files. [3.23s])
- Task 15: complete (commits 00bb99b..f2d5ce6, tests: bash -c 'set -o pipefail; cd 07_Engineering/parle-backend && bun test tests/app-code-sync.test.ts 2>&1 | tail -3' → Ran 3 tests across 1 file. [84.00ms])

## Pre-flight

- Pre-flight: T1 -> T4/T5/T7: lesson_hold, lesson_confirm_payment, lesson_record_refund, lesson_cancel, lesson_reschedule signatures match the Consumes lines; consistent.
- Pre-flight: T2 -> T4/T7/T9/T10: LessonError, lessonSettings, cancelOutcome, canReschedule, reminderDue and the can* rules; consistent.
- Pre-flight: T3 -> T4: lessonPriceCents, offeredLessonLengths, validateBookableSlot(minimumNoticeHours, lengths); consistent.
- Pre-flight: T4 -> T5..T10: LessonPayments, ownBooking, viewsFor, person, tutorInfo, LESSON_ACTIONS, JOB_STEPS; consistent.
- Pre-flight: T6 -> T7/T8/T9: sendCancellation, sendReschedule, sendReminder, sendReviewRequest; consistent.

## Production checks so far

- Task 16: production checks so far (2026-10-16 ~00:55-01:05 UTC): m5tut1 meeting link set (meet.google.com). Booking A: book 200, paid with the test card on Stripe's page by Playwright, confirmed by the webhook (1 Stripe event), both mails with lesson.ics and the link; reschedule 200 (moves left 0), both mails with lesson-cancelled.ics + lesson.ics; cancel 5 days ahead 200, refunded 1400 of 1400, payment refunded, one refund row learner_cancelled, both cancellation mails. Booking B: confirmed by the webhook, both confirmation mails.

## Rulings made during execution (each with what it costs if wrong)

- Task 0: Ruling: baseline backend is 265 pass / 1 skip (plan said 264; the practice-limit test 'background practice gets 40 s by default' was added after the plan was written), app 421, type errors 63; not re-run: main at a4afb15 equals the code of the last green full runs plus docs — cost if wrong: none (every task runs its tests).
- Task 2: Ruling: two existing app tests ('initializes one row per default...', 'keeps audit access read/create only...') hard-coded 9 settings rows and 9 audit creates; with the 6 new lesson settings there are 15 — replaced the literal 9 with Object.keys(APP_SETTING_DEFAULTS).length (5 assertions), the plan missed them — cost if wrong: none.
- Task 4: Ruling: the plan adds [functions.parle-booking-jobs] to config.toml in Task 4, but that function's folder is created in Task 5; functions serve refuses to start ('failed to read file ... parle-booking-jobs/index.ts') — moved the two config lines to Task 5 — cost if wrong: none.
- Task 7: Ruling: reschedule_options capped the list at 120 slots, which for a tutor open all day covers about 1.5 days, so the plan's own test (a move 5 days ahead) failed and a learner could not move a lesson to next week; raised the cap to 2000 (the whole 30-day horizon) — cost if wrong: a larger answer (about 60 KB at most).
- Task 14: Ruling: the new public page id needed an entry in PublicInformationPage.tsx's per-page icon map (type error 64 > 63 baseline, and the page would have had no section icons); added cancellations: [CalendarDays, CalendarDays, ShieldCheck, CalendarDays, FileText, MessageCircle] with icons already imported — cost if wrong: icon choice only.
- Task 16: Ruling: booking B needs an m5tut1 time 13-23 h ahead, which fell on a Friday (m5tut1 is open Tue and Thu evenings only); added a one-date "extra hours" exception for 2026-10-16 12:00-15:00 Toronto on m5tut1 (test account, through its own login) and ran parle-marketplace-refresh once with the job secret instead of waiting for the hourly run — cost if wrong: m5tut1 shows one extra Friday window on its test listing until that date passes.
- Task 16: Ruling: "pay a/b: page says something else" is the check script, not the app: its pay step uses a fresh browser that is not signed in, so Stripe's return lands on sign-in; a one-off check signed in as the check learner showed "Your lesson is booked" on /learner/lessons?checkout=done — cost if wrong: none.
- Task 16: lesson card and brief pass (01:12 UTC): the 01:10 jobs run built booking B's brief (goal, levels for 4 skills, the learner's message); m5tut1's Lessons page shows the lesson and opens the brief from ?lesson=, 0 console errors, scrollWidth 375 at 375 px. Ruling: the browser check matched 'Lesson brief' case-sensitively while the heading is styled uppercase (innerText 'LESSON BRIEF'); made the match ignore case — cost if wrong: none.
- Final: Ruling: reviewer "Declined to judge" items (7B payout timing and disputes; founding date as an admin date; Meet/Zoom-only links; the slot code's clock-change handling (only the new parts reviewed; tests cover 2026-11-01); production results; database tests not run by the reviewer (run here: 344 pass); copy and visual layout) — all either 7B scope, plan rulings, or verified here — cost if wrong: copy and layout issues would show in the founder's own look at the preview.

## Final whole-branch review (independent reviewer, strongest model)

Verdict: ready to merge with fixes; no Critical findings. Fixed in one pass, each with a test that failed first, then deployed (all 10 functions, preview `parle-aa8z84pad`):

- Final: fixed Important 1 (a paid session whose Checkout id was never saved found no booking: charged, no lesson, no refund) — fn-lesson-payments.test.ts "a payment whose Checkout id was never saved still confirms" RED->GREEN; completeCheckout links the session by metadata.booking_id; bookLesson checks the save and closes the page on failure; backend 344/1 skip/0 fail.
- Final: fixed Important 2 (pay-later methods could settle after the hold ended) — lesson-checkout-params.test.ts "cards only" RED->GREEN; Checkout pages are card-only (checkout-params.ts); suite as above.
- Final: fixed Important 3 (one unreadable Checkout session stopped the reconciliation job for everyone) — fn-lesson-payments.test.ts "one hold that Stripe cannot read does not stop the others" RED->GREEN; both reconcile loops catch per row; suite as above.
- Final: fixed Important 4 (a partly failed send could repeat a learner's email) — email.test.ts "passes a duplicate-protection key to Resend" and "every lesson email is sent with a key per lesson, kind and recipient" RED->GREEN; Resend Idempotency-Key per lesson, kind (and reschedule count) and recipient; suite as above.
- Final: fixed Minor 7 raised to Important (a deleted learner's message and problem report stayed visible to the tutor, against the deletion notice "without your name or words") — account-deletion.test.ts "a deleted learner's own words leave the tutor's past lessons" RED->GREEN; suite as above.
- Final: fixed Minor 10 raised to Important (Book and pay stuck on "Booking..." after the browser Back button from Stripe) — parle-booking.test.ts "the tutor profile resets Book and pay when the page is restored" RED->GREEN; app 430/430, type errors 63.

Deferred minors (also in `deferred-defects.md` as R59-R67 and the inventory as A51-A59):

- Final: minor (deferred): R59 two Book presses arriving within about a second can answer SLOT_TAKEN against the learner's own hold; the learner's own hold shows as busy after Back.
- Final: minor (deferred): R60 lesson_reschedule does not expire lapsed holds first, so a time shown free can be refused for up to 10 minutes.
- Final: minor (deferred): R61 learner and tutor cancelling at once (or cancel during deletion): the loser sees "could not reach our payment provider" though the refund happened; lesson_cancel records a refund even when unchanged.
- Final: minor (deferred): R62 the cancellation email says "less than 24 hours, not refunded" whenever no money moves (a tutor cancel after an earlier dashboard refund).
- Final: minor (deferred): R63 after a slot_lost refund the learner back from Stripe sees "still confirming" (the expired lesson is hidden); the slot_lost email always says "booked by someone else"; no email when the tutor was deleted.
- Final: minor (deferred): R64 account deletion can stop after lessons were cancelled and refunded (a later step failing), leaving the account with its lessons cancelled.
- Final: minor (deferred): R65 the booking read rule shows whole rows: a tutor can read pending and expired holds (learner message, id), a learner sees commission_pct.
- Final: minor (deferred): R66 Stripe page expiry is the hold plus 60 s against Stripe's 30-minute minimum; clock skew could breach it (use 2-3 minutes).
- Final: minor (deferred): R67 a payment landing in the seconds between "holds expired" and the login deletion confirms a lesson with no learner and no refund.
