# Stripe Live Readiness — Parle

**Status:** NO-GO for live mode. This checklist records code evidence and owner evidence required before any live key, live connected account, charge, transfer, refund or public payment flow is enabled.

**Last reviewed:** 2026-10-17  
**Owner:** Founder / Finance owner  
**Engineering contact:** To be named before launch

## Current integration evidence

- Learner subscriptions and lesson checkout/payouts have local fake-provider coverage. Stripe test-mode checkout, Connect onboarding, payout, refund and webhook exercises are documented in `../migration/close-out-report.md` (Plans 7A/7B and 11/12).
- The current server payment adapter accepts the fake test provider or a Stripe secret beginning `sk_test_`. Live secrets are deliberately refused. A live key must not be added until the code, account model, review and launch checks in this document are approved.
- Lesson charges are in CAD. Tutor payout amounts are also sent in CAD, with conversions derived from Stripe charge settlement evidence. Lesson price minimum and subscription amounts are covered by local tests.
- Webhook verification, signature-secret separation, duplicate event handling and payout/refund idempotency have test coverage. Final live webhook delivery/retry behavior and finance reconciliation have not been tested against the production Stripe account.
- Plan 7B's test setup enabled Accounts v1 support for the test platform. The current Connect creation adapter uses the v1 `POST /v1/accounts` API. This is not production approval for Accounts v1. Stripe documents Accounts v2 configuration and its mapping from v1 controller settings; the platform owner must confirm the production account's supported integration path and migration requirement before creating a live connected account. Some v2 bank/card account APIs remain preview-gated. [Stripe: connected account configuration](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration), [Stripe: Accounts API](https://docs.stripe.com/api/accounts).

## Go-live checklist

Each checked item requires evidence attached to the release record. “Code/test” means repo evidence; “owner” means Stripe Dashboard, finance, legal or operations evidence that engineering cannot infer from source.

| Gate | Acceptance evidence | Owner | State |
|---|---|---|---|
| Stripe platform identity and eligibility | Production Stripe account ID and country/currency confirmed; legal entity, representative, beneficial-owner and business verification complete; Connect/Express, platform payments, CAD settlement and cross-border tutor countries approved by Stripe. Do not copy test-account conclusions into live. | Founder / Finance | Open |
| Connect Accounts API decision | Stripe confirms whether this platform can and should use Accounts v2 now, and identifies API version, capabilities, onboarding link/session model, webhook event set, test-mode availability and migration path for existing test data. Approve the one-way account responsibility settings (fees/losses/KYC/dashboard) before the first account. Implement and test the selected path before live account creation. | Founder + Engineering | Open; hard gate |
| Live catalog and pricing | Approved monthly/yearly subscription amounts, lesson prices, platform commission, tutor share and CAD currency documented; compare exact Checkout/session objects in test mode; live Product/Price IDs and enabled payment methods recorded if used. | Founder / Finance | Open |
| Tax and receipts | Accountant/counsel disposition on GST/HST/QST and other tax collection, seller/marketplace treatment, invoice/receipt obligations and Stripe Tax settings; receipt and refund wording approved. | Finance + Counsel | Open |
| Statement descriptor and branding | Live statement descriptor, support email/URL, business name, icon/logo and receipt branding verified on a harmless authorized test path; bank-statement wording approved. | Founder / Finance | Open |
| API keys and environments | Separate production secret set by an owner; no key in source, logs, PRs or local artifacts; rotation/expiry owner recorded; app/API live-mode guard changed only in an approved release; preview/local remain test/fake. Verify key mode by Stripe's API response and Dashboard, never by printing the key. | Founder + Engineering | Open; hard gate |
| Webhook destinations | Exact live endpoint URLs, event subscriptions, signing secrets and Stripe account/destination mapping recorded; verify signatures, duplicate delivery, retry, delayed/out-of-order events, disabled endpoint alert and secret rotation in a controlled test. | Engineering + Operations | Open; hard gate |
| Idempotency and uncertain outcomes | R135 classification regression passes; stable idempotency keys cover Checkout, Connect-account creation, refunds, transfers and reversals; simulate timeout-after-create, 409/in-progress and replay in test mode; reconciliation finds objects when responses are lost. | Engineering | In progress |
| Refunds, disputes and chargebacks | Approved cancellation/refund schedule and dispute evidence owner; full/partial refund, refund after tutor payout, transfer reversal, disputed payout hold and duplicate notification paths tested; owners know when a human must decide. | Founder / Finance + Engineering | Open |
| Settlement and reconciliation | Finance runbook matches Stripe balance transactions, charges, refunds, fees, transfers, reversals and bank settlements to Parle records; daily/weekly cadence, variance tolerance and escalation owner defined; execute a test-mode reconciliation with sample rows. | Finance | Open |
| Payouts and holds | Country availability confirmed for each launch cohort; Express identity/onboarding, payout capability changes, failed/held transfers, payout schedule, negative balance responsibility and manual release permissions approved; no automatic release without current Stripe status. | Founder / Finance + Engineering | Open |
| Access control and audit | Least-privilege Stripe Dashboard access, MFA, named admins, separation of test/live, payout/refund limits and audit review owner recorded. | Founder / Operations | Open |
| Incident response | Named primary/backup for payment outage, webhook backlog, duplicate charge, payout failure, dispute and key exposure; alerts reach them; rollback and customer communication templates approved. | Operations | Open |
| Controlled live transaction | Only after every hard gate above: founder/finance schedules a written, low-value test transaction and payout with a real consenting tester, observes charge, fee, settlement, refund/reversal and reconciliation, then explicitly approves cohort launch. Record amounts, object IDs (not secrets/PII), timestamps and result. | Founder / Finance | Not authorized / not run |

## Release procedure

1. Keep all public payment and payout routes in test/fake mode while any hard gate is open.
2. Attach evidence for every accepted row and resolve open engineering defects (R135/R136) in `deferred-defects.md`.
3. Freeze the reviewed commit SHA; run app/backend typechecks, full tests, Deno checks, build, lint gate and final dependency advisory scans.
4. Founder/finance verifies the live Stripe account configuration and enters production secrets through the approved secret manager. Engineering must never receive or print raw live secrets.
5. Founder approves a dated, bounded transaction window. Run only the agreed test; immediately reconcile the full lifecycle and roll back/disable the flow on any mismatch.
6. Founder/finance records explicit go/no-go for invited users. Monitor first charges, refunds, webhook lag, payout holds, disputes, support contact and cash reconciliation before increasing traffic.

## Stop conditions

- Any unresolved dependency or lint hard gate, unverified API mode, missing webhook secret/event, unknown tax treatment, missing reconciliation owner, uncertain duplicate/timeout outcome, untested rollback, or unexplained balance discrepancy means NO-GO.
- No work in this audit changes Stripe Dashboard settings, adds a live secret, creates a production account, runs a live transaction, or enables public payments.
