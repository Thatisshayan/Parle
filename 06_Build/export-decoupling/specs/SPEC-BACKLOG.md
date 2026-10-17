# Spec backlog: work that still needs its own spec

Created 2026-10-14 at the founder's request so these are not forgotten. They were explicitly left out of the backend
decoupling spec (`2026-10-14-backend-decoupling-design.md`, section 12). **None of them has a spec yet.** When one is
specified, link the spec here and change its status; do not delete rows.

Status values: `NO SPEC` -> `SPEC IN REVIEW` -> `SPEC APPROVED` -> `PLANNED` -> `BUILT` -> `VERIFIED`.

| # | Work | Status | Depends on | What the spec must cover | Starting material |
|---|---|---|---|---|---|
| 1 | **Full booking flow** | BUILT 2026-10-16 (Plan 7A, Stripe test mode; `2026-10-16-plan-7-booking-payouts-design.md`); production checks passed for booking, confirmation, reschedule, cancel and refund; attendance and review check pending (after the Friday lesson) | Backend decoupling done (Supabase, transactions, unique slot rule) | Instant booking with one booking per tutor slot; tutor accept / decline (or instant-book rules); learner and tutor lesson lists; cancellation and rescheduling within the 24 h window; lesson brief 24 h before; attendance / no-show evidence; lesson notes feeding the next week's plan; reminder emails with calendar (.ics) files; tutor "Students" list (B10) | `02_Product/specs/phase-1-mvp/` Module 6 spec; D17, D18; S22; decisions #33, #34 |
| 2 | **Tutor payouts** | BUILT 2026-10-16 (Plan 7B, Stripe test mode); VERIFIED 2026-10-16 (Plan 7B checks: onboarding, payout after a short delay, hold and alert, Earnings; the release transfer itself blocked by a test artefact, R109) (`2026-10-16-plan-7-booking-payouts-design.md`; tax, business setup and live stay deferred: see below) | 1 (bookings and lesson payments), Stripe live decision | Stripe Connect onboarding (also tutor identity, decision #25), learner pays per lesson, 20% commission (founding tutors 10% for 6 months, decision #22), CA$8 minimum charge (decision #55), 72 h payout delay, refunds and disputes, tutor earnings page, tax / country rules (`tutor_payout_country`) | Module 6 / 7 specs; settings `commission_percent`, `payout_delay_hours`, `minimum_lesson_charge_usd` |
| 3 | **Voice** | BUILT 2026-10-16 (Plan 9); VERIFIED 2026-10-16 (Plan 9 checks) (`2026-10-16-plan-9-voice-design.md`: natural voice and scored speaking). Pronunciation feedback and live voice conversation: Plan 10 or later. Decision #16 split: speaking scored now, pronunciation and live voice later | Backend decoupling; AI provider choice for speech | Text-to-speech for listening items and tutor replies; speech-to-text for speaking answers and pronunciation feedback; real speaking assessment (today speaking is never scored, S8); Premium live voice conversation with the monthly minute cap (`premium_live_voice_minutes_per_month`, decision #16) | Module 2 / 4 specs; S8; D12 |
| 4 | **Waitlist launch email** | BUILT 2026-10-16 (Plan 8; `2026-10-16-plan-8-account-admin-waitlist-design.md`); OPEN: sender postal address, small live campaign check | Resend set up in the backend project (decision #47) | Launch email to `waitlist_signup` from hello@parle.buzz; unsubscribe link and suppression (Canada's anti-spam law, consent already recorded); tutor-signup follow-up email; sending in batches; privacy page wording check | D29; `07_Engineering/parle-waitlist/`; parle.buzz/privacy |
| 5 | **Stripe live mode** | NO SPEC | Backend decoupling (webhook in place); founder business setup | Live Stripe account and verification, live prices ($14.99 / month, $119 / year), live keys as secrets, webhook in live mode, tax (GST/HST/QST) settings, receipts, refund policy page (D28), switching sandbox test data off; from Plan 11: rename `minimum_lesson_charge_usd` and `hourly_rate_usd` in the live-mode data migration (A69), create Connect accounts on Accounts v2 (A71), set the statement descriptor to PARLE in the Stripe dashboard (A72, today OBSIDIAN MEDIA) | Decision #40; Module 7 spec; `security-debt.md` Stripe items |
| 6 | **Public launch** | NO SPEC | Backend decoupling done; 4; 5; content and legal ready | Launch checklist: real question bank (0 of 360 launch-ready today; being written in a separate Lesson Bank session, import procedure to come; the readers serve the bank the admin switch names since 2026-10-16 (R94 fixed); production stays on demo until the import, then an administrator switches to Real on the Content page) and prompt bank; lawyer-reviewed legal pages (Terms, Privacy, Tutor Agreement, Refunds; D28); founding tutors recruited; monitoring and backups (Supabase Pro decision); moving the parle.buzz domain from `parle-waitlist` to `parle-app` in Vercel (decision #46); launch email (4); the pre-launch close-out of deferred code items is done (Plan 11, 2026-10-17: 56 fixed, 7 accepted, 3 moved to row 5; founder items A84, A95, A99 iPhone, A103, A105 remain) | Decision #46; D28; `05_Operations/tutors/recruiting/founding-tutor-plan.md`; `01_Strategy/user-research/interview-plan.md` |
| 7 | **Account administration** | BUILT 2026-10-16 (Plan 8); VERIFIED 2026-10-16 (Plan 8 checks: pause and enable, owner-only refusals; owner invite and remove checked locally); custom roles and bulk actions: later | Backend decoupling done (own sign-in; possible now, impossible on Buildy) | Disable / enable accounts; invite and remove administrators (today: an `adminEmail` list at migration, decision #51); fuller admin user detail (learner fields, paid plan; D19); admin metrics over learner records (D24) | D19, D20, D24; Module 8 spec |
| 8 | **Production AI providers** | BUILT 2026-10-16 (Plan 10); VERIFIED 2026-10-16 (Plan 10 checks: GPT-6 Luna through OpenRouter, Deepgram, Azure Canadian voice; NVIDIA key removed) (`2026-10-16-plan-10-production-ai-providers-design.md`; decisions #58 to #60) | Plan 9 relay; founder's provider accounts | Move text AI and speech off NVIDIA's trial key (R101, R108): quality test of three text models, Deepgram transcription, Azure Canadian voice, minimum age 18, privacy wording naming the providers | `spikes/provider-comparison-2026-10-16.md` |
| 9 | **Pre-launch close-out** | PLANNED 2026-10-16 (`plans/2026-10-16-plan-11-prelaunch-closeout.md`, Plan 11; the deferred-items inventory is its spec) | Plans 6-10 | Close every open deferred item code can close before launch (about 56 of 71), with a ruling for each accepted or moved item; wording to the founder | `deferred-inventory-2026-10-15.md` A29-A112 |

## Plan 7 scope decision (founder, 2026-10-15)

Plan 7 builds rows 1 and 2 on Stripe **test mode** (founder chose option B, 2026-10-15):
- Row 1, full booking flow, "ready for founding tutors at launch": payment into Parle's Stripe account, confirmations
  with calendar invites, reminders, cancel and reschedule with the refund rules, lesson brief, completion and no-show
  marking, lesson notes, the tutor's Lessons and Students pages, reviews.
- Row 2, tutor payouts, folded in (items 1-6 DONE 2026-10-16, Plan 7B: `plans/2026-10-16-plan-7b-payouts.md`):
  1. Tutor Earnings page (`/tutor/earnings`): upcoming, pending, owed, paid, per-lesson breakdown.
  2. Stripe Connect Express onboarding for tutors, including identity verification (decision #25, provisional).
  3. Transferring the tutor's 80 % (90 % for founding tutors in their first 6 months, decision #22) 72 hours after a
     completed lesson (`payout_delay_hours`, `commission_percent`).
  4. Payout holds: tutor no-show, a learner dispute within 72 hours, or a failed transfer; admin review.
  5. Refunds and disputes after the tutor has been paid; Stripe chargebacks.
  6. Tutors in countries Stripe cannot pay: the `tutor_payout_country` waitlist (`10_cross-cutting.md` section 9, Q10).

**Still deferred, needs the founder's business setup before it can be specified or switched on. Nothing here is dropped:**
7. Tax and reporting: Stripe Tax (Q3, needs a registered company), 1099-K / DAC7 reporting (Q9).
8. Business setup: the legal entity and Stripe account owner (Q4), the minimum age (Q1: answered, 18, decision #58),
   lawyer-reviewed Tutor Agreement and Refunds pages (D28).
9. Live Stripe (row 5): live account, live keys and webhook, GST/HST/QST, then live Connect payouts.

## Related, already tracked elsewhere
- Defects and gaps: `../deferred-defects.md` (D1-D31 and the review register R1-R35) and `../security-debt.md`
  (S1-S29); reviewed after the cut-over (2026-10-15), each marked closed / partly closed / open.
- Product ideas for later phases: `02_Product/specs/later-phases/idea-bank-2026-10-12.md`.
