# Cross-cutting Requirements (Phase 1)

Status: APPROVED 2026-10-08 (decision #20); open questions in section 9 still open

## 1. Security
- Every data rule (who sees what, limits, prices, payouts) is enforced on the server.
- Learners see only their own data; tutors see a learner's data only via briefs for their own bookings.
- Private storage for ID documents and voice recordings; short-lived signed links.
- Secrets (Stripe, AI provider keys) never reach the browser.
- Stripe webhooks are verified; booking and subscription state changes come from webhooks, not the browser.

## 2. Privacy and compliance (worldwide launch)
- Privacy policy covering GDPR (EU/UK) and PIPEDA (Canada) basics: what is collected, why, retention, rights.
- Download-my-data and delete-my-account in Settings.
- Retention: voice recordings 30 days; ID documents deleted 90 days after a tutor is rejected or leaves.
- Cookie banner only if non-essential analytics cookies are used.
- Minimum age 16.

## 3. AI usage
- One internal AI interface (provider swappable): chat, text-to-speech, speech-to-text, real-time voice.
- Cost controls: plan limits, fair-use ceiling, admin-visible AI cost per active learner.
- Generated assessment content is human-reviewed before use; tutoring content is generated live.
- Every AI-estimated level carries "Estimate - not an official score."

## 4. Notifications (email only in Phase 1)
Verification, password reset, onboarding welcome + roadmap ready, booking confirmed (.ics), reminders 24h/1h,
cancellation/reschedule, lesson notes posted, review request, tutor application status, payout sent, subscription
receipts and failed payment, weekly progress summary (learner can turn off).

## 5. Analytics events
onboarding_step_completed (step), account_created, placement_started / completed / skipped, roadmap_created,
task_started / completed (type), checkin_completed, ai_message_sent, limit_reached (kind), upgrade_viewed /
upgraded / cancelled, tutor_list_viewed, tutor_profile_viewed, booking_started / paid / completed / cancelled,
review_submitted, tutor_application_submitted / approved.

## 6. Performance and accessibility
- Pages interactive within 2.5s on a mid-range phone on 4G.
- AI text reply starts streaming within 3s; writing/speaking feedback within 20s.
- WCAG 2.1 AA: keyboard navigation, contrast, labels, captions/transcripts for all audio.

## 6b. Failure handling
| Failure | Behavior |
|---|---|
| AI provider down or slow (> 20s) | Friendly retry message; Today's Plan swaps AI tasks for stored bank items; nothing counts against limits; error logged |
| Speech-to-text fails | Keep the recording, offer "type your answer instead" |
| Live voice drops | Save transcript so far, offer reconnect; minutes counted only for connected time |
| Stripe webhook missed or delayed | Booking stays "pending payment" and a scheduled job reconciles with Stripe every 10 minutes; never double-charge |
| Payment succeeds but slot was taken meanwhile | Automatic full refund + email with alternative slots |
| Payout transfer fails (tutor account issue) | Payout marked held, tutor emailed to fix Stripe account, admin alerted |
| Email delivery fails | Retry, then show the information in-app (lesson link always visible on the lesson page) |
| Scheduled jobs (payout release, reminders, re-plans) | Idempotent; safe to re-run; failures alert admin |

## 6c. Calibration of AI estimates (before public launch)
Two founding tutors assess 20 beta learners independently; compare with the placement test and adjust the adaptive
rule and the NCLC mapping (Module 3, section 1) until AI and tutor agree within one sub-level for 80% of learners.
Feasibility hours (Module 3, section 7) are recalibrated after 8 weeks of real data.

## 7. Testing and verification (how each module is accepted)
- Each module's acceptance checklist is verified by the COO in the browser (gstack) on the Buildy preview before
  the next module starts; results and screenshots go to `06_Build/buildy-ai/session-logs/`.
- Test accounts: 1 admin, 3 tutors (different countries/time zones), 4 learners (one per track + one Premium).
- Emails verified by real delivery to a test inbox, not by assumption.
- Payments in Stripe test mode only until launch sign-off.
- Roadmap engine rules get unit tests with fixed inputs (after export at the latest).

## 8. Buildy.ai capability check (before Module 1)
Confirm and record in `06_Build/buildy-ai/session-logs/`: code export (GitHub or ZIP) and generated stack; Stripe
Checkout + Billing + Connect split payouts; private file uploads (ID, video up to 200 MB); server-side logic and
scheduled jobs (payout release, reminders); AI provider integration with own keys; text-to-speech and speech-to-text;
real-time voice. Any "no" is reported to the founder with a workaround before building.

**Fallback if Buildy fails the export check** (no real code export, or a proprietary backend that can't be moved):
stop before Module 1 and choose between Lovable (founder has done Lovable -> export before with Learn with Alphonso)
or building directly with Claude Code on an owned stack. The specs are tool-independent, so nothing is lost.

## 9. Open questions for the founder
| # | Question | COO recommendation |
|---|---|---|
| 1 | Minimum age 16 or 18? | 16 (18 if payments to minors prove complex) |
| 2 | Free trial for Premium? | No trial at launch; Free tier is the trial |
| 3 | Sales tax / VAT: use Stripe Tax? | Yes, needs a registered business entity first |
| 4 | Legal entity and Stripe account owner | Founder's company; needed before live payments |
| 5 | Final brand name and domain | Keep "Parle" as working name; decide before public launch |
| 6 | Support channel | Support email + help center FAQ in Phase 1 |
| 7 | Who reviews the 360-item question bank before launch? | 2 founding tutors, paid per batch |
| 8 | Founding tutor recruitment (first 20) | Founder network + immigration-focused French teacher groups; covered in `05_Operations/tutors/` |
| 9 | Marketplace tax reporting (US 1099-K, EU DAC7) for tutor earnings | Rely on Stripe Connect reporting; confirm with an accountant before live payments |
| 10 | Tutors in countries Stripe can't pay | Waitlist in Phase 1; evaluate Wise/Payoneer payouts in Phase 4 |
