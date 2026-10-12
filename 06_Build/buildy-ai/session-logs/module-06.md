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

## Part A history (2026-10-12 morning)
1. `06a_booking-lessons.txt`: Buildy did not start; it proposed a first slice and asked (no credits charged).
   `module-06a_buildy-reply.txt`.
2. `06a1_slice1-go.txt` (slice 1 approved): **54.81 building credits, NOTHING built.** Buildy found a platform
   limit: a learner's booking action cannot see another learner's private bookings, so it cannot refuse a duplicate
   even later, and a public list of booked times would expose the creator's email and allow fake blocks. It asked:
   A) settings + slot preview only, or B) admin confirms each request. `module-06a1_buildy-reply.txt`.
3. `06a2_request-accept.txt` (COO's answer, sent): path A plus a **tutor-accepted request**. The learner sends a
   request (status "requested"); the tutor accepts from the Dashboard, and the tutor's own action checks the tutor's
   other accepted bookings, so no learner sees another learner's data. Busy times are published with the tutor's
   public profile refresh. BUILDING.
**Spec deviation for the demo (decision #34, provisional):** instant booking becomes request-then-accept on Buildy.
Instant booking with a real uniqueness guarantee comes back after export (own backend, unique constraint on
tutor + start time). Stripe in Part B will have to charge at the tutor's acceptance, or authorise at request and
capture at acceptance; decide when Part B is written.
Slice 2 after this: emails + .ics, lesson brief, attendance evidence, lesson notes into the roadmap, cancel and
reschedule.
**Credits:** Module 5 Part B 65.18 + this failed slice 54.81 = 120 building credits in two runs. The founder was
asked to check the balance; no answer yet. If the next run is also large or fails, STOP and report before sending more.

## How to resume
1. Read the reply after the message containing "tutor-accepted request instead of an instant booking"; save it as `module-06a2_buildy-reply.txt`.
2. Test in the preview: learner B requests a lesson with Camille (Tue or Thu 18:00 Toronto); Camille accepts from the Dashboard; the slot disappears after the profile refresh; lesson shows in
   Lessons / Dashboard / Today; tutor sees the brief; both press Join; tutor marks Completed and writes notes; the
   learner's history and next week's plan show them; cancel and reschedule; 375px.
3. Ask the founder for the Part B prerequisites above before writing `06b`.

## Status: PART A (request-then-accept version) BUILDING
