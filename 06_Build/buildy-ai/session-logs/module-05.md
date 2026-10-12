# Module 5 - Tutor marketplace, vetting and matching - verification log

Built in small prompts (large prompts made Buildy's runs die on Module 4).
- Part A, tutor side and approval: `../prompts/05a_tutor-application.txt`, sent 2026-10-12 early morning. Application
  steps, availability editor, statuses, payout-country waitlist, minimal admin Applications screen, privacy.
  Decision #25 applied: no government ID upload, intro video as a link.
- Part B, learner side (to write and send after Part A is tested): public tutor profile, Tutors list sorted by match
  score with the top reason, filters, match score as deterministic code with unit tests (weights 30 / 20 / 25 / 15 /
  10), rating shown after 3 reviews and "New tutor" before, reviews display. BUILD-PLAN Task 5 steps 3-5 apply.

## Part A result (2026-10-12; output `module-05a_buildy-reply.txt`, the run ended without a final report)
COO test in the preview with a new tutor account (obsidianteamhq+m5tut1@agentmail.to, "Camille T.", Toronto; password
in the test-accounts file) and the owner as admin:
| Item | Result | Evidence |
|---|---|---|
| 1 Application steps | PASS | Eight steps (Profile, Teaching, Pricing, Certificates, Intro video, Meeting link, Agreement, Payouts), each saved as a draft. Rate $5 refused, $28 gives $14.00 / $21.00 for 30 / 45 min. A Google Meet link in the video field is refused ("Use a valid YouTube or Vimeo HTTPS link and confirm the video is unlisted"). No ID upload; "Identity is verified by Stripe when you connect payouts." Stripe button disabled "coming in the next step" |
| 2 Availability | PASS | Tue + Thu 18:00-21:00 saved in America/Toronto and still there after reload; one-date exceptions form present (not exercised) |
| 3 Statuses | PASS | Draft -> Submitted (read-only) -> In review when the admin opens it -> Needs changes with the comment shown to the tutor -> Resubmit -> Submitted |
| 4 Payout countries | PARTLY SEEN | Admin has an editable country list with supported / waitlist; Canada shows "Payout country supported". Waitlist path not exercised |
| 5 Admin Applications | PASS | List with status filters, "Open review" shows all details, comment box, Approve / Request changes / Reject. Decision email: "accepted by the sending service" (inbox delivery not checked) |
| 6 Privacy | NOT TESTED | Needs a second account trying another tutor's application |
| 375px | PASS | Application page scrollWidth 360 |
| Email verification on sign-up | NOTE | The tutor account was signed in straight after "Create account" with no email code step; check against Module 1 behaviour at the regression |
Not done yet: certificate upload + verify badge, Reject, Approve (needed for Part B: approve Camille before testing).

Preview operating notes learned here:
- The owner link in the editor's preview frame works ONCE per editor page load. To get an owner session again:
  reload the editor tab, click Preview, open the frame address in a new tab.
- After a test account signs out, `superdev_refresh_token` stays in localStorage and a new preview tab comes up as
  that account again (defect D4). Remove both `superdev_*` keys before opening the owner link.

## Part B (`../prompts/05b_learner-tutor-list-match.txt`, sent 2026-10-12) - BUILDING
Public profile for approved tutors, Tutors page sorted by match score with top reason, match score module with unit
tests, filters, reviews display rule (rating after 3 reviews), link from the roadmap suggestion.

## How to resume
1. Read the reply after the message containing "MODULE 5 PART B"; save it as `module-05b_buildy-reply.txt`.
2. As the owner: approve Camille (Applications > Open review > Approve tutor). Create two more tutors only if the
   match test needs them (BUILD-PLAN Task 5 step 3-4: Paris and Dakar, different specialties, prices, languages).
3. As learner B (immigration, budget $20-35, native Persian): Tutors page shows Camille with a match score and top
   reason; filters; profile page; slots in the learner's time zone; "New tutor" until 3 reviews (add test reviews as
   admin). As a learner, open the profile address of a non-approved tutor: expect not found.
4. One fix round, defer the rest (decision #30), accept Module 5, then Module 6 in small prompts (Stripe checkout
   clicks stay with the founder).

## Reminder for the next modules (decision #33)
- Module 6 prompt: add join times (learner, tutor) and a no-show marker per booking, visible to the admin.
- Module 8 prompt: add the "demand versus available tutor hours" view by time zone and specialty.

## Status: PART A TESTED (pass); PART B BUILDING
