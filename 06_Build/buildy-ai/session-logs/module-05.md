# Module 5 - Tutor marketplace, vetting and matching - verification log

Built in small prompts (large prompts made Buildy's runs die on Module 4).
- Part A, tutor side and approval: `../prompts/05a_tutor-application.txt`, sent 2026-10-12 early morning. Application
  steps, availability editor, statuses, payout-country waitlist, minimal admin Applications screen, privacy.
  Decision #25 applied: no government ID upload, intro video as a link.
- Part B, learner side (to write and send after Part A is tested): public tutor profile, Tutors list sorted by match
  score with the top reason, filters, match score as deterministic code with unit tests (weights 30 / 20 / 25 / 15 /
  10), rating shown after 3 reviews and "New tutor" before, reviews display. BUILD-PLAN Task 5 steps 3-5 apply.

## How to resume
1. In the Buildy chat read the reply after the message containing "TUTOR MARKETPLACE, PART A"; save it as
   `module-05a_buildy-reply.txt`. "Didn't get through" -> click Retry (up to 3 times).
2. Test Part A in the preview: sign up a tutor (AgentMail plus-address, record the password in
   `C:\Users\AgentDev\.gstack\projects\Parle\test-accounts.txt`, never print it), complete and submit the application,
   approve / needs-changes as the owner (admin), check the tutor sees the status and comment, 375px.
3. Send Part B, test, one fix round, defer the rest (decision #30), accept, then Module 6 in small prompts.
   Module 6 is Stripe: checkout clicks are refused by the session's permission system, so the founder does those.

## Status: PART A BUILDING
