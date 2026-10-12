# Module 6 - Booking, lessons and payments - verification log

Split in two because payments need the founder:
- **Part A, booking and lessons without payments:** `../prompts/06a_booking-lessons.txt`, sent 2026-10-12 morning.
  Slots module with time-zone and clock-change unit tests, demo booking through one server function, emails with
  .ics, lesson brief, attendance evidence (join times, no-show marker; decision #33), lesson notes feeding the
  roadmap, cancel and reschedule without money.
- **Part B, payments (NOT written yet):** Stripe Checkout in TEST mode replacing the demo button, Connect Express
  onboarding replacing the Module 5 placeholder, payout 72 h after completion, the cancellation table, the
  reconciliation job, section 6b of `10_cross-cutting.md`. Needs from the founder: a Stripe TEST secret key added to
  this Buildy project through Buildy's secure button, and the founder does every checkout click (the session's
  permission system refuses them). It may also need the site published on its buildy.show address for the Stripe
  return (ShipToPhone needed that); the founder decides.

## How to resume
1. Read the reply after the message containing "MODULE 6 PART A"; save it as `module-06a_buildy-reply.txt`.
2. Test in the preview: learner B books Camille (Tue or Thu 18:00 Toronto); the slot disappears; lesson shows in
   Lessons / Dashboard / Today; tutor sees the brief; both press Join; tutor marks Completed and writes notes; the
   learner's history and next week's plan show them; cancel and reschedule; 375px.
3. Ask the founder for the Part B prerequisites above before writing `06b`.

## Status: PART A BUILDING
