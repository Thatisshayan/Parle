# Module 8 - Admin panel - verification log

Founder decision #35 (2026-10-12): build Module 8 on Buildy next, then export. Modules 6 (bookings, payments) and 7
(subscriptions) are finished in our own code after export.

Built in small prompts:
- **Part A:** `../prompts/08a_admin-settings-users-audit.txt`, sent 2026-10-12 evening. Audit log, Settings backed by
  app_setting and read live (AI message limit, commission %), Users (search, detail, comp Premium, disable), Admin
  users, server-side admin checks. BUILDING.
- **Part B (to write after Part A is tested):** Content (question bank: generate, review, edit, approve, retire;
  coverage per skill and level against the 360-item launch minimum), Reported content queue, Reviews hide / restore,
  Metrics for a date range (sign-ups, onboarding and placement completion, week-1 retention, AI messages and an AI
  cost estimate per active learner, tutor counts) **plus the "demand versus available tutor hours" view by time zone
  and specialty (decision #33)**.
- Left out because Modules 6 and 7 are not on Buildy: Bookings, disputes, refunds, payout release, Free -> Premium
  conversion, lessons booked, gross lesson value, commission earned, tutor utilization. These metrics get a
  "needs bookings / billing" placeholder.

## Part A first run (2026-10-12 evening; `module-08a_buildy-reply.txt`, 10.77 building credits): INCOMPLETE
Draft only, Preview unchanged, no checkpoint, tests not run. Settings screen and defaults drafted (ranges: Free
messages 0-100 per day; Premium fair use 1-5,000 and not below Free; voice 0-600 minutes per month; commission 0-50%;
payout delay 0-720 hours; cancellation window 0-168 hours; minimum charge $8-$500; flags off) but not read live.
Users, Admin users and the access checks not built. Buildy says disabling accounts and admin invitations "need a
supported account-control approach".
Buildy's security notes: signed-in users can read some question-bank records and the draft settings; direct admin
data edits could bypass the audit log; a change and its audit entry are not atomic. (To add to `security-debt.md`.)
**Continue prompt sent** (`../prompts/08a2_continue.txt`), four ordered parts with a checkpoint after each: Settings
read live; Audit log screen; Users read-only plus comp Premium; server-side admin checks. Left out and to be listed
as not built: disabling accounts, inviting or removing admins, admin checks on the question bank.

## Part A second run (`module-08a2_buildy-reply.txt`, 5.73 credits): Part 1 done, in the Preview
Settings save to app_setting and each change writes an audit entry with old and new value; Buildy's tests show a
saved limit of 12 gives "7 of 12" in the learner counter and that pricing and agreement text use the saved
commission. 106 tests, build passed. Not live-tested by the COO yet (values still 10 and 20%). Parts 2-4 not done;
Buildy asked whether to continue. `../prompts/08a3_continue.txt` sent: Parts 2, 3, 4 in one run. BUILDING.
New security notes: signed-in users can read the settings values; setting and audit writes are separate, so an
audit row can be missing after a setting is saved.

## How to resume
1. Read the reply after the message containing "Yes. Continue with Part 2 (Audit log screen)"; save it as
   `module-08a3_buildy-reply.txt`. "Didn't get through" -> click Retry.
2. Test as the owner in the preview: change "Free AI messages per day" to 12 and check learner A's tutor shows
   "of 12" (then set it back to 10); the audit log shows both changes; Users search finds learner B; comp Premium and
   remove; disable and enable a throwaway account only (not the owner, not the test learners in use); a learner
   opening /admin is sent away; 375px.
3. Then send Module 7 Part A (`../prompts/07a_plans-limits.txt`), which uses the comp flag and the settings. One fix
   round, defer the rest, then Module 8 Part B, then BUILD-PLAN Task 9 (regression + export readiness) and the
   export itself (founder action in Buildy; code goes to `07_Engineering/`).

## Status: PART A Part 1 in Preview; Parts 2-4 BUILDING
