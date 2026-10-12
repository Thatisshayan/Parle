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

## How to resume
1. When Module 8 Part A has been read and tested, send `07a_plans-limits.txt`; save the reply as
   `module-07a_buildy-reply.txt`; test: comp Premium from admin Users lifts the 10-message limit for that learner;
   "Your plan" page for a Free and a comp learner; upgrade prompts link to it; 375px.
2. With the founder's key in place, send `07b_stripe-billing.txt`; the founder runs the checkout; the agent checks the
   plan change, the Portal link and the cancel-at-period-end state by reading the pages.
3. One fix round per part, the rest to `../../export-decoupling/deferred-defects.md`.

## Status: PROMPTS WRITTEN, Part A waiting for the Parle chat to be free
