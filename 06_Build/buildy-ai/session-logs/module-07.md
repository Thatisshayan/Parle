# Module 7 - Subscriptions and limits - verification log

Founder decision #36 (2026-10-12): attempt Module 7 on Buildy after all. Evidence it may work: a one-off Stripe
Checkout in test mode runs on Buildy in the ShipToPhone project. Risk: renewals, cancellations and keeping the plan
in step with Stripe (webhooks may not reach an unpublished Preview).

Two small prompts, both written 2026-10-12:
- **Part A, no Stripe:** `../prompts/07a_plans-limits.txt`. Subscription record, one "is Premium" helper, the limits
  engine by plan reading Module 8 settings, Premium roadmap triggers, "Your plan" page, upgrade prompts. To be sent
  when the Parle chat is free (Module 8 Part A is building; one run at a time per project).
- **Part B, Stripe TEST:** `../prompts/07b_stripe-billing.txt`. Checkout (monthly, yearly), plan changes from verified
  Stripe events with a "Refresh my plan" fallback, Customer Portal, live-key refusal.

**Needed from the founder before Part B is sent:**
1. A Stripe TEST secret key saved in the Parle Buildy project through Buildy's secure input (never in chat, never
   to the agent). It can be the same test key as ShipToPhone.
2. The founder does the checkout clicks (the session's permission system refuses them): card 4242 4242 4242 4242.
3. A decision if Buildy says the Stripe return or the webhooks need the site published on its buildy.show address.

## Stripe key added (2026-10-12 night)
The founder added Stripe to the Parle Buildy project himself (Dashboard > Integrations > Active Integrations:
"Stripe"), using the sandbox **Secret key** (`sk_test_...`; the publishable key is not needed for hosted Checkout,
and a restricted key was not used because the build's test-key guard may not recognise `rk_test_`). The agent never
saw the key. Prerequisite 1 for Part B is therefore met. Watch for Buildy's known quirk (ShipToPhone): adding a key
can auto-send "Please continue" and start an unrequested build; none was seen in the chat when checked.
Possibly still needed later: a webhook endpoint in the Stripe sandbox and its signing secret (`whsec_...`), if
Buildy's Part B report gives a webhook address.

## Part A first run (2026-10-12 night; `module-07a_buildy-reply.txt`): NOT completed
Both of Buildy's attempts stopped before making edits; Preview unchanged; no tests, no build. Buildy suggested a
smaller run "focused first on the subscription record, comp handling and tutor limits, then the account and roadmap
screens". `../prompts/07a2_smaller.txt` sent: PART 1 only (one "is Premium" helper fed by the comp record; the tutor's
server limit by plan using the saved settings; unit tests). BUILDING. Then: "Your plan" page, then upgrade links and
roadmap triggers, then Part B (Stripe).

## Part 1 result (`module-07a2_buildy-reply.txt`, 141 tests) and COO test: FAIL in the Preview
Buildy reports the Premium helper, the tutor limit by plan and the tests as done, and asked for one visit to
Admin > Users "to synchronise the existing comp grant". COO test: opened Admin > Users as the owner ("Test Citizenship
M3 - Comp active"), then signed in as that learner: the AI Tutor still says "Free plan", shows no "of 300" counter,
Send is disabled with the daily-allowance message, and parleAssessmentService returned HTTP 429. The comp record does
not reach the tutor's server check. `../prompts/07a3_fix-comp-premium.txt` sent (Module 7 Part 1 fix round): find
the cause, make comp readable by the learner's request without letting learners grant it, test the real path.
BUILDING.

## Fix round result (`module-07a3_buildy-reply.txt`, 144 tests) and COO retest: STILL FAILS
Buildy's stated cause: "the tutor checked ParleCompStatus through a different entity accessor than the registered
one, and the earlier tests masked that mismatch"; it reports the server-path test passing. COO retest at ~9:07 pm
as the comp learner: still "Free plan", no counter, Send disabled, parleAssessmentService HTTP 429 "Daily tutor
message limit reached." `../prompts/07a4_diagnose-comp.txt` sent: no more guessing; the server returns and the page
shows a diagnostic (tier, limit, count, day key, compRecordFound, lookup record and key type), and Buildy compares
the stored key with the lookup key. BUILDING. The preview tab (learner A signed in on the AI Tutor) is left open
to read the diagnostic.

## Diagnostic run (`module-07a4_buildy-reply.txt`, 147 tests) and the live values
Buildy added the diagnostic but could not confirm a cause ("a fresh database read was blocked by the project's read
limit"). The page does not display the diagnostic block; the COO read it from the tutor service's 429 response as
learner A at ~9:40 pm:
`tier free, limitApplied 10, messagesCountedToday 10, localDayKey 2026-10-12, compRecordFound false,
recordType ParleCompStatus, lookupField user_id, learnerKeyType "user id"`.
So the comp row exists (Admin > Users: "Comp active") and the learner's own request reads nothing. Two candidate
causes sent to Buildy in `../prompts/07a5_diag-result.txt`: (A) the row is admin-created and a learner's request
cannot read it; (B) the admin action stores a different id than the tutor lookup uses. Asked for a fix proven by a
real request. BUILDING.
Relevant platform fact from `../research/buildy-service-role-answer.txt`: Buildy's service-role credential works
only for server work with NO user session; inside a signed-in user's request the function keeps that user's
permissions. That is the same limit that broke bookings (D17) and it points to cause A.

## Part 1 FIXED and verified live (2026-10-12 ~10:25 pm; `module-07a5_buildy-reply.txt`)
Cause A confirmed by Buildy: the comp row was created by the administrator and the learner's own read returned
nothing. Fix: the status now lives on the learner's own `ParleIdentity` record (field `premium_comp_active`), readable
by the learner, changeable only by admin actions; refreshing Admin > Users backfills existing grants.
COO test as learner A after one Admin > Users refresh: "Premium plan", **"290 of 300 AI messages left today"**,
diagnostic: tier premium, limit 300, messages counted 10, comp record found true (record ParleIdentity).
**Pattern to reuse on Buildy** (Stripe part and anything similar): a status one account sets for another must be
written onto a record the affected learner can read, by an admin or server action; a learner's request cannot read
rows another account created, and functions keep the caller's permissions.
The "Diagnostic (demo)" block is still shown on the tutor page; remove it before any real use (D22).
Module 7 Part 1 cost five messages. Next for Module 7: "Your plan" page (queue item A3).

## How to resume
1. Read the reply after the message containing "Live diagnostic for Test Citizenship M3"; save it as
   `module-07a5_buildy-reply.txt`; test: comp Premium from admin Users lifts the 10-message limit for that learner;
   "Your plan" page for a Free and a comp learner; upgrade prompts link to it; 375px.
2. With the founder's key in place, send `07b_stripe-billing.txt`; the founder runs the checkout; the agent checks the
   plan change, the Portal link and the cancel-at-period-end state by reading the pages.
3. One fix round per part, the rest to `../../export-decoupling/deferred-defects.md`.

## Status: PART 1 DONE and verified live. Next: "Your plan" page, upgrade links, then Part B (Stripe). Learner A (Test Citizenship M3) has an active comp record for the Premium limit test
