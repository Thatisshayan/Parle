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
4. Result of 3 (`module-06a2_buildy-reply.txt`): PARTIAL, 7 building credits. Settings record and slot calculator
   with 9 test cases drafted (tests not run); no screens, no request flow. Buildy's credit list for the chat now
   shows the 54.81-credit failed run as **"waived"** (not charged) and 65.18 for Module 5 Part B.
5. `06a3_finish-screens.txt` sent: finish in order (run tests, settings screen, slot preview, request, tutor
   accept / decline, lesson listings), checkpoint after step 3, stop cleanly if short. BUILDING.
6. `06a3` result: 5.21 credits, step 1 done (9 / 9 slot tests). `06a4_continue.txt` result
   (`module-06a4_buildy-reply.txt`): tutor settings and the learner slot preview done in draft, checkpoint saved
   after step 3; request form, tutor decisions, refresh and lesson views not done ("the public availability refresh
   fails to start").
7. `06a5_continue.txt` sent: fix the refresh, finish steps 4-6, final checkpoint, full test suite. BUILDING.
8. `06a5` result (`module-06a5_buildy-reply.txt`, 5.75 credits): steps 4-6 reported done in the preview, 93 tests,
   final checkpoint. Cause of the refresh failure: the booking schedule was declared twice.
9. **COO test, learner B:** the tutor profile offers slots in the learner's time zone (30 / 45 / 60 minutes, Tue and
   Thu for 30 days, 15-minute start times) - PASS. Requesting 45 min, Thu Oct 15, 7:00 PM with a message FAILS:
   "The lesson request could not be sent", server 409 TUTOR_NOT_AVAILABLE, Lessons stays empty.
10. `06a6_fix-request-409.txt` sent (Module 6 Part A fix round): same slots module and defaults on server and
    preview, a test for a tutor without saved settings, specific rejection messages. BUILDING.
11. `06a6` result (`module-06a6_buildy-reply.txt`): "fixed lesson requests with default tutor settings", 95 tests.
    COO retest, same learner / tutor / slot: the 409 is gone, now HTTP 500 REQUEST_FAILED; Lessons still empty.
12. `06a7_fix-request-500.txt` sent: read the function logs, fix, test the real server path. Declared the LAST fix
    for this step; if it still fails, the booking request goes to deferred-defects and the founder gets the
    export-versus-continue question.
Slice 2 after this: emails + .ics, lesson brief, attendance evidence, lesson notes into the roadmap, cancel and
reschedule.
**Credits:** Module 5 Part B 65.18 + this failed slice 54.81 = 120 building credits in two runs. The founder was
asked to check the balance; no answer yet. If the next run is also large or fails, STOP and report before sending more.

## How to resume
1. Read the reply after the message containing "Retested at about 6:23 am"; save it as `module-06a7_buildy-reply.txt`.
2. Test in the preview: learner B requests a lesson with Camille (Tue or Thu 18:00 Toronto); Camille accepts from the Dashboard; the slot disappears after the profile refresh; lesson shows in
   Lessons / Dashboard / Today; tutor sees the brief; both press Join; tutor marks Completed and writes notes; the
   learner's history and next week's plan show them; cancel and reschedule; 375px.
3. Ask the founder for the Part B prerequisites above before writing `06b`.

## Status: PART A (request-then-accept version) BUILDING
