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

## Part B (`../prompts/05b_learner-tutor-list-match.txt`), reply `module-05b_buildy-reply.txt`
84 unit tests passed, build passed, **65.18 building credits** (the most expensive run so far; Part B of Module 4 cost 7).
COO test in the preview, 2026-10-12 morning. Owner approved Camille (Applications > Open review > Approve tutor; the
list row kept showing "In review" until the panel was read again). Then learner B (immigration, A2, Toronto, Persian):
| Item | Result | Evidence |
|---|---|---|
| Tutors page sorted by match score, top reason | PASS | "Camille T. · 81 /100 · New tutor · $28.00/ hour · Specializes in Canada immigration / TEF-TCF preparation · Tue, Oct 13 · 6:00 PM-9:00 PM". Only one tutor exists, so ordering between tutors is not shown |
| Public profile | PASS | Bio, levels, languages, specialties, Vimeo player embedded, prices $28.00 / $21.00 / $14.00, 14 days of availability "converted to your local time", "Booking opens in the next step", "New tutor" with the 3-review explanation |
| Filters | SEEN, not exercised | Specialty, price range, language, "available in my tutor time windows", rating 4+ |
| 375px | PASS | scrollWidth 360 on the profile |
| Not-approved / unknown tutor address | PARTLY | A made-up tutor id shows "Tutor profile could not be loaded - check your connection" (not a clear "not found"). A real non-approved tutor was not available to test |
Buildy's own security notes: the access rules cannot tell learners from tutors for direct data requests; system
record details may reveal the administrator's email; demo reviews can be duplicated by direct changes. Added to
`security-debt.md` at the next update (S17-S21 with the Module 3 and 4 notes).

## Module 5 status: ACCEPTED WITH DEFERRED DEFECTS (2026-10-12, decision #30)
Deferred as D14-D16 in `../../export-decoupling/deferred-defects.md`. Not tested, carried to the Phase 1 regression:
BUILD-PLAN Task 5 steps 3-4 with three tutors (Toronto, Paris, Dakar) and the Persian-speaking TEF tutor ranking
first; certificate upload and badge; Reject; the 3-review rule with demo reviews; the filters; privacy with a second
tutor account; the payout waitlist path.

## Reminder for the next modules (decision #33)
- Module 6 Part A prompt already includes join times and the no-show marker (item 6).
- Module 8 prompt: add the "demand versus available tutor hours" view by time zone and specialty.

## Addition 2026-10-13: tutor Dashboard home and Profile & Pricing (decision #39)
Prompts `../prompts/05c_tutor-home-profile.txt` and `05c2_continue.txt`; replies `module-05c_buildy-reply.txt`
(draft only, and a 5-minute refresh job deployed) and `module-05c2_buildy-reply.txt` (Parts 0-2 done; 158 of 159
tests). COO test as Camille T.: PASS for the Dashboard (status, comment, next step, checklist, "How learners see
you", week at a glance, note) and for Profile & Pricing (six editable details, save, persists after reload), 375px
PASS. Design forced by the platform: an approved tutor's edits go to a limited edit record; the learner-facing
profile is an administrator-published copy refreshed hourly or by "Refresh now". Not verified: the learner seeing the
change. Open: checklist shows "Profile photo added" with initials only (fix sent with the next prompt).

## 2026-10-14 small fixes on Buildy (queue item B4)
- D14 tutor not found: `../prompts/09g_tutor-not-found.txt` -> `module-09g_tutor-not-found_buildy-reply.txt` (294 /
  294 tests, 2.27 credits). COO live test ~1:15 am as learner B after a reload: FAIL. `/learner/tutors/not-a-real-id`
  and `/learner/tutors/00000000-0000-4000-8000-000000000000` show "Tutor profile could not be loaded - Check your
  connection and try again. The tutor's profile has not changed." + "Try again". Recorder: `404
  functions/parleMarketplaceService {"error":"NOT_FOUND","code":"NOT_FOUND"}`. Server correct, page misreads the
  error shape (unit tests pass on a different shape: again "tests pass, live fails"). Follow-up prompt:
  `../prompts/09g2_tutor-not-found-live.txt`.
- D15 Applications row: `../prompts/09h_applications-row.txt` sent ~1:10 am ET, BUILDING.
