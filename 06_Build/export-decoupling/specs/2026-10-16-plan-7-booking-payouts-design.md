# Plan 7 design: tutor lesson booking and test-mode payouts

Date: 2026-10-15. Status: **approved by the founder (2026-10-15)**. Author: COO (Claude), with the founder's decisions.
Builds `specs/SPEC-BACKLOG.md` rows 1 (full booking flow) and 2 (tutor payouts) on Stripe **test mode**, as the founder
chose on 2026-10-15 (scope B). Builds on the approved product spec `02_Product/specs/phase-1-mvp/06_booking-payments.md`
(decision #20), `05_tutor-marketplace.md` (reviews), `09_data-model.md` (tables) and `10_cross-cutting.md` (failure
handling). Where this design differs from those, this design wins and says so.

## 1. Purpose and success

Founding tutors can teach paid lessons on Parle and be paid, end to end, in Stripe test mode, so that switching to live
money later is a configuration change (row 5), not new building.

Success means, on production in test mode:
- a learner books a tutor, pays with a test card, and both get confirmations with calendar invites and the meeting link;
- reminders, the lesson brief, attendance, notes and a review all happen around the lesson;
- cancel, reschedule and account deletion follow the rules below, with refunds that happen exactly once;
- 72 hours after a completed lesson, the tutor's share reaches their test Connect account, unless it is held;
- tutors see their earnings; admins resolve held payouts and disputes; every money decision is audited.

## 2. Decisions this design rests on

| Topic | Decision | Source |
|---|---|---|
| Booking model | Instant booking, one live booking per tutor slot; no tutor accept / decline | #35 (#34 lapsed) |
| Price and commission | Tutor sets the price in USD; Parle keeps 20 %, founding tutors 10 % for their first 6 months; no learner fee; Stripe fees come out of Parle's share | #15, #22, #20 |
| Minimum charge | $8 per lesson | #20 |
| Meeting | The tutor's own standing Zoom or Meet link (`tutor_profile.meeting_link`) | #11; data model |
| Payment timing | Hold the slot while the learner pays; confirm only on Stripe's payment event | founder, 2026-10-15 |
| Money flow | Parle takes the whole payment, then transfers the tutor's share 72 h after the lesson (separate charges and transfers) | founder, 2026-10-15; #20 |
| Account deletion | Cancels and fully refunds every upcoming lesson, for learner and tutor deletion; explained on a help page | #53 |
| Scope | Booking plus test-mode payouts; tax, business setup and live Stripe deferred | SPEC-BACKLOG "Plan 7 scope decision" |
| Webhooks | Stripe events reach our backend through the existing webhook | #40 |

## 3. Data

The old `booking` rows (statuses requested / confirmed / declined, text columns) are test data. They are deleted and the
table is rebuilt with real types. `tutor_booking_settings` and `tutor_payout_country` stay.

| Table | Columns (main ones) | Notes |
|---|---|---|
| `booking` | id, learner_id (uuid), tutor_id (uuid), start_at, end_at (timestamptz), minutes (30/45/60), buffer_minutes (frozen), price_cents, commission_pct (frozen), status, learner_message, reschedule_count, hold_expires_at, stripe_checkout_session_id, status_changed_at, cancelled_by, created_at | Price, commission and buffer are frozen at booking |
| `payment` | id, booking_id, stripe_payment_intent_id, amount_cents, status (succeeded / refunded / partly_refunded / disputed) | One per booking |
| `refund` | id, booking_id, amount_cents, reason (learner_cancelled / tutor_cancelled / account_deleted / slot_lost / admin), stripe_refund_id, decided_by, created_at | One refund per reason per booking |
| `payout` | id, booking_id, tutor_id, amount_cents, release_at, status (scheduled / held / paid / cancelled), hold_reason, stripe_transfer_id, created_at | One per booking |
| `tutor_payout_account` | tutor_id, stripe_account_id, payouts_enabled, country, updated_at | Kept, minimised, after a tutor's deletion only until their last payout is sent |
| `lesson_brief` | booking_id, content (json), built_at | Built from saved data, no AI |
| `lesson_notes` | booking_id, skills (json: skill -> struggling / ok / strong), notes, homework | |
| `review` | id, booking_id, learner_id, tutor_id, stars (1-5), comment, tutor_reply, hidden | One per completed lesson |
| `tutor_profile` (changed) | adds `founding_until` (date, nullable) | Commission 10 % for bookings made before this date |

### Booking states

- `pending_payment` -> `confirmed` -> `completed` or `learner_no_show`
- `pending_payment` -> `expired` (payment page abandoned; new, not in the data-model spec)
- `confirmed` -> `cancelled_learner` or `cancelled_tutor` (a refund, when due, is recorded in `refund` and on `payment`;
  the data-model spec's `refunded` status is replaced by the payment's status)
- `completed`, `learner_no_show` -> `disputed` (learner reports a problem) -> back to `completed` or `learner_no_show`
  after the admin's decision, with the money outcome in `refund` and `payout`

### Database rules

- **No overlap:** a tutor cannot have two live bookings (`pending_payment`, `confirmed`) whose time ranges, each
  extended by its frozen buffer, overlap. Enforced by an exclusion constraint on
  `tstzrange(start_at, end_at + buffer_minutes)` per tutor (`btree_gist`). Replaces `booking_live_slot_key`.
- A learner cannot book themselves (learner_id <> tutor_id).
- Read rules: a learner reads their own bookings; a tutor reads bookings where they are the tutor; payments, refunds and
  payouts are read through server actions only. Lesson briefs only by the booking's tutor. Notes by both parties.
- `waitlist_signup` and `join_waitlist()` are never touched.

### Settings (`app_setting`, admin-editable)

`commission_percent` 20, `founding_commission_percent` 10, `payout_delay_hours` 72, `cancellation_window_hours` 24,
`min_notice_hours` 12 (tutor may raise to 24 or 48), `booking_horizon_days` 30, `minimum_lesson_charge_usd` 8,
`slot_hold_minutes` 30, `auto_complete_hours` 48, `tutor_cancellation_flag_count` 3 (in 30 days).

## 4. Booking a lesson

1. On a tutor's profile the learner picks a length. Free slots are shown in the learner's time zone, using the existing
   slot calculation (`parle-booking-slots.helper.ts`), now respecting the buffer, minimum notice and the 30-day
   horizon. A length whose price is under $8 is not offered, and the tutor's availability screen says why.
2. The learner picks a slot, can add a message, and presses **Book and pay**.
3. The server re-checks the slot and the rules below, creates the booking as `pending_payment` with
   `hold_expires_at = now + 30 min` (this holds the slot), and opens a Stripe Checkout session (test mode) for the
   frozen price with the same expiry.
4. The learner returns to "Confirming your payment..." until the booking is `confirmed`; a return without payment
   shows "Payment not finished" and keeps the hold until it expires.
5. **Only Stripe's payment event confirms a booking** (`checkout.session.completed` with payment status paid).

Who can book: a signed-in learner with a verified email, not the tutor themselves, with an approved listed tutor whose
payout account can receive payouts (`payouts_enabled`). Otherwise the profile shows "Booking opens soon".

Edge cases:
- Two learners, one slot: the overlap rule lets only the first booking exist; the second sees "That time was just
  taken. Choose another." and no Checkout is opened.
- The same Stripe event twice: recorded once (event id and payment intent are unique).
- Payment after the hold expired: if the slot is still free, the booking is confirmed; if another booking holds it, the
  payment is refunded (reason `slot_lost`) and the learner is emailed.
- A missed Stripe event: a job every 10 minutes reconciles open Checkout sessions with Stripe and expires abandoned
  holds (`checkout.session.expired` also expires them).

On confirmation: the learner and the tutor each get an email from `no-reply@parle.buzz` with the time in their own time
zone, an .ics invite and the meeting link; the tutor's email includes the learner's message. The lesson appears on the
learner's Lessons page, on Today on its day, and on the tutor's Lessons page.

## 5. Changing a booking

| Action | When | Money | Status |
|---|---|---|---|
| Learner cancels | 24 h or more before | Full refund | `cancelled_learner` |
| Learner cancels | Less than 24 h before | No refund; the tutor is paid, payout due 72 h after the lesson's scheduled end | `cancelled_learner` |
| Tutor cancels | Any time | Full refund | `cancelled_tutor`; 3 in 30 days flags the tutor for admin review |
| Learner reschedules | Once, up to 24 h before | No new payment | stays `confirmed`, new time |
| Learner deletes account | Any time | Full refund of every future lesson (#53) | `cancelled_learner` |
| Tutor deletes account | Any time | Full refund of every future lesson; completed lessons still paid out (#53) | `cancelled_tutor` |

- The cancel screen states the money outcome before the learner confirms.
- Only the learner reschedules, once per booking: the new slot is held and the old one freed in one database
  transaction; both get updated invites and the old invite is cancelled. A tutor who cannot make a lesson cancels it.
- Account deletion runs the refunds first. If Stripe cannot be reached, deletion stops with "try again in a few minutes"
  (as for unreadable subscriptions today). A deleted learner's briefs and notes are deleted with them; the tutor's
  completed lessons stay as "Former learner" without notes. A deleted tutor's reviews stay anonymised.
- Every refund is recorded with its reason, happens once (Stripe idempotency key per booking and reason), and is
  emailed to the learner.

**Help page:** a public page "Cancellations, refunds and deleting your account" explains the table above in plain
language. Linked from the booking screen, the cancel screen, Settings -> Delete account and the footer. Marked as a
summary until the lawyer-reviewed Refunds page (D28) replaces or links it.

## 6. Around the lesson

- **Reminders:** 24 h and 1 h before, to both, with the link and each person's local time. A job every 10 minutes sends
  what is due, each reminder once. A booking made less than 24 h ahead skips the 24 h reminder.
- **Lesson brief:** built 24 h before from saved data (level per skill, goal and track, latest check-in, recent
  mistakes, earlier notes with this tutor, the learner's message). No AI call. Shown on the tutor's lesson card and
  linked from the 24 h email; only that tutor can read it.
- **Attendance:** from the lesson's end the tutor can mark **Completed** or **Learner didn't show**. Unmarked lessons
  complete automatically after 48 h.
- **Report a problem:** the learner can report a tutor no-show or dispute a no-show until the lesson's payout is sent.
  The booking becomes `disputed` and the payout `held` for admin review.
- **Notes:** after Completed, the tutor records struggling / ok / strong per skill practised, notes and optional
  homework. The learner sees them. "Struggling" skills become a focus in the learner's next weekly plan; notes never
  change skill estimates or levels.
- **Reviews:** after a completed lesson the learner is asked for 1-5 stars and an optional comment, one per lesson; the
  tutor may reply once; ratings show from 3 reviews ("New tutor" before); an admin can hide a review.
- **Tutor pages** (replace placeholders): Lessons (upcoming with brief, awaiting attendance or notes, cancelled) and
  Students (each learner taught, lesson count, last lesson, the tutor's notes).

## 7. Paying tutors

- **Connect onboarding:** on the Earnings page an approved tutor presses **Set up payouts** and completes Stripe Connect
  Express onboarding (test mode). Parle stores only the Stripe account id, country and `payouts_enabled`, updated from
  Stripe's `account.updated` event. A tutor whose country is on the unsupported list (`tutor_payout_country`) joins a
  waitlist instead and is told why; their profile stays approved but cannot be booked.
- **Payout creation:** when a lesson ends `completed` or `learner_no_show`, or a learner cancels late, a payout is
  scheduled for the frozen price minus the frozen commission, `release_at` = 72 h after the lesson's end (scheduled end
  for a late cancel, the later of the scheduled end and the completion time otherwise).
- **Sending:** a job every 10 minutes transfers due, unheld payouts (batches of 20) to the tutor's account with an
  idempotency key per payout, and records the transfer id. A failed transfer becomes `held` (reason `transfer_failed`)
  and alerts the admin; it is not retried automatically.
- **Holds:** a dispute or problem report, a tutor no-show report, an account that cannot receive payouts, or a failed
  transfer. An admin resolves each from a new **Payouts** screen: release (pay the tutor), refund the learner (cancel the
  payout), or split (partial refund, rest paid). The screen also lists disputed lessons and tutors flagged for 3
  cancellations in 30 days. Every decision goes to the audit log.
- **After a payout:** a refund needs an admin, who chooses to reverse the tutor's transfer or to have Parle absorb it. A
  Stripe chargeback (`charge.dispute.created`) holds any unpaid payout and alerts the admin.
- **Earnings page:** upcoming (booked lessons and their earnings), pending (completed, with payout dates), held (with the
  reason), paid (dates and Stripe references), per-lesson breakdown (price, commission, payout), monthly totals, and the
  payout account status with a link to Stripe's dashboard.

## 8. Build, safety, testing, checks

**Two plans, run back to back:** 7A Booking (sections 3-6 and the help page) merges first; 7B Payouts (section 7) next.
Until 7B is live, booking stays in test mode.

**Where:** pages in `parle-app`; booking actions in the marketplace service; a new payouts service; Stripe events in
the existing `stripe-webhook` (new: `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`,
`charge.dispute.created`, `account.updated`, `transfer.created`, `transfer.reversed`); jobs (expire holds, reconcile,
reminders, briefs, auto-complete, send payouts) every 10 minutes through the existing job mechanism; emails through
Resend.

**Safety:**
- Money amounts always come from the frozen booking on the server, never from the browser.
- Stripe events are verified with the webhook secret; idempotency keys on every refund and transfer.
- Each person sees only their own lessons and money; admin money actions are audited.
- Jobs work in batches so no run nears the function time limit.

**Testing:** every piece starts with a failing test against the local stack and Stripe test mode. Deliberate cases:
simultaneous booking of one slot, a duplicate or late Stripe event, payment after hold expiry (slot free / slot taken),
a double refund, a reschedule into a buffer, the 2026-11-01 clock change, deletion with future lessons (learner and
tutor), a failed transfer, a dispute before and after payout.

**Checks on the real system** (production, test mode, AgentMail accounts):
- After 7A: a learner books m5tut1, pays with a test card, both emails and invites arrive at AgentMail, the learner
  reschedules, then cancels 24 h ahead and is refunded; a second booking checks the lesson card, brief and review.
- After 7B: m5tut1 completes Connect test onboarding; a completed lesson's payout reaches the test account after a
  shortened delay (then restored to 72 h); a held payout is released from the admin screen.
- Each plan ends with an independent whole-branch review.

**Founder steps:** enable Connect in the Stripe sandbox; add the new event types to the sandbox webhook (exact list
above; instructions in the plan); run any production migration as before.

## 9. Not in Plan 7

Deferred in `SPEC-BACKLOG.md` (scope decision): tax and reporting (Q3, Q9), business setup (Q4, Q1, D28), live Stripe
(row 5). Out of scope per `06_booking-payments.md`: built-in video, lesson packages and discounts, recurring weekly
bookings, tips, tutor-set currencies.

## 10. Risks

- Supabase Free (decision #50): no backups and a 150-second function limit. Payments raise the cost of lost data;
  decide on Pro before live payments.
- Stripe test mode behaves like live for Connect and transfers, but cross-border payout coverage differs by country;
  the live switch (row 5) must re-check the unsupported-country list.
- R2 (uuid compared with text in the booking read rule) disappears with the rebuilt table; R18 (deleted learner's
  bookings blocking slots) is closed by section 5.
