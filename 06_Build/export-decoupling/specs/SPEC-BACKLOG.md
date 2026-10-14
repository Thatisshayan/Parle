# Spec backlog: work that still needs its own spec

Created 2026-10-14 at the founder's request so these are not forgotten. They were explicitly left out of the backend
decoupling spec (`2026-10-14-backend-decoupling-design.md`, section 12). **None of them has a spec yet.** When one is
specified, link the spec here and change its status; do not delete rows.

Status values: `NO SPEC` -> `SPEC IN REVIEW` -> `SPEC APPROVED` -> `PLANNED` -> `BUILT` -> `VERIFIED`.

| # | Work | Status | Depends on | What the spec must cover | Starting material |
|---|---|---|---|---|---|
| 1 | **Full booking flow** | NO SPEC | Backend decoupling done (Supabase, transactions, unique slot rule) | Instant booking with one booking per tutor slot; tutor accept / decline (or instant-book rules); learner and tutor lesson lists; cancellation and rescheduling within the 24 h window; lesson brief 24 h before; attendance / no-show evidence; lesson notes feeding the next week's plan; reminder emails with calendar (.ics) files; tutor "Students" list (B10) | `02_Product/specs/phase-1-mvp/` Module 6 spec; D17, D18; S22; decisions #33, #34 |
| 2 | **Tutor payouts** | NO SPEC | 1 (bookings and lesson payments), Stripe live decision | Stripe Connect onboarding (also tutor identity, decision #25), learner pays per lesson, 20% commission (founding tutors 10% for 6 months, decision #22), $8 minimum charge, 72 h payout delay, refunds and disputes, tutor earnings page, tax / country rules (`tutor_payout_country`) | Module 6 / 7 specs; settings `commission_percent`, `payout_delay_hours`, `minimum_lesson_charge_usd` |
| 3 | **Voice** | NO SPEC | Backend decoupling; AI provider choice for speech | Text-to-speech for listening items and tutor replies; speech-to-text for speaking answers and pronunciation feedback; real speaking assessment (today speaking is never scored, S8); Premium live voice conversation with the monthly minute cap (`premium_live_voice_minutes_per_month`, decision #16) | Module 2 / 4 specs; S8; D12 |
| 4 | **Waitlist launch email** | NO SPEC | Resend set up in the backend project (decision #47) | Launch email to `waitlist_signup` from hello@parle.buzz; unsubscribe link and suppression (Canada's anti-spam law, consent already recorded); tutor-signup follow-up email; sending in batches; privacy page wording check | D29; `07_Engineering/parle-waitlist/`; parle.buzz/privacy |
| 5 | **Stripe live mode** | NO SPEC | Backend decoupling (webhook in place); founder business setup | Live Stripe account and verification, live prices ($14.99 / month, $119 / year), live keys as secrets, webhook in live mode, tax (GST/HST/QST) settings, receipts, refund policy page (D28), switching sandbox test data off | Decision #40; Module 7 spec; `security-debt.md` Stripe items |
| 6 | **Public launch** | NO SPEC | Backend decoupling done; 4; 5; content and legal ready | Launch checklist: real question bank (0 of 360 launch-ready today) and prompt bank; lawyer-reviewed legal pages (Terms, Privacy, Tutor Agreement, Refunds; D28); founding tutors recruited; monitoring and backups (Supabase Pro decision); moving the parle.buzz domain from `parle-waitlist` to `parle-app` in Vercel (decision #46); launch email (4) | Decision #46; D28; `05_Operations/tutors/recruiting/founding-tutor-plan.md`; `01_Strategy/user-research/interview-plan.md` |

## Related, already tracked elsewhere
- Defects and gaps: `../deferred-defects.md` (D1-D29) and `../security-debt.md` (S1-S29); the backend decoupling
  project marks each as fixed / not applicable / open.
- Product ideas for later phases: `02_Product/specs/later-phases/idea-bank-2026-10-12.md`.
