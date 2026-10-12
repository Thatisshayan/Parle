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

## How to resume
1. Read the reply after the message containing "MODULE 8 - ADMIN PANEL, PART A"; save it as
   `module-08a_buildy-reply.txt`. "Didn't get through" -> click Retry.
2. Test as the owner in the preview: change "Free AI messages per day" to 12 and check learner A's tutor shows
   "of 12" (then set it back to 10); the audit log shows both changes; Users search finds learner B; comp Premium and
   remove; disable and enable a throwaway account only (not the owner, not the test learners in use); a learner
   opening /admin is sent away; 375px.
3. One fix round, defer the rest, then Part B, then BUILD-PLAN Task 9 (regression + export readiness) and the
   export itself (founder action in Buildy; code goes to `07_Engineering/`).

## Status: PART A BUILDING
