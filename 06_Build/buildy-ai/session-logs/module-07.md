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

## How to resume
1. When Module 8 Part A has been read and tested, send `07a_plans-limits.txt`; save the reply as
   `module-07a_buildy-reply.txt`; test: comp Premium from admin Users lifts the 10-message limit for that learner;
   "Your plan" page for a Free and a comp learner; upgrade prompts link to it; 375px.
2. With the founder's key in place, send `07b_stripe-billing.txt`; the founder runs the checkout; the agent checks the
   plan change, the Portal link and the cancel-at-period-end state by reading the pages.
3. One fix round per part, the rest to `../../export-decoupling/deferred-defects.md`.

## Status: PART A SENT 2026-10-12 night (after Module 8 Part A), BUILDING. Learner A (Test Citizenship M3) has an active comp record for the Premium limit test
