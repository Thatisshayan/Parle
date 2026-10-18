# Controlled Release Go / No-Go — Parle

**Decision:** **NO-GO for public or invited-user release**
**Decision date:** 2026-10-18
**Audit branch:** `codex-branch`
**Reviewed code basis:** `23e4823` (Phase 28 concurrency controls and bounded request cancellation; full CI run 39168540577 passes all jobs).
**Release SHA:** not selected. Re-freeze and rerun all required checks after every blocking fix.
**Decision owners:** Founder / production operator, Finance, Product, Counsel/privacy, Device QA/Accessibility. Named individuals are not present in the available evidence.

This is a release decision prepared from repository and local checks. It is not permission to deploy, change DNS/provider settings, activate Stripe live mode, charge a customer, or open public traffic.

## Gate review

| Gate | Evidence available | Decision |
|---|---|---|
| Exact release candidate and reproducible quality | Run 39168540577 on `23e4823` passes all three jobs: backend 638 pass / 1 skip / 0 fail (2,400 expectations; 639 tests/105 files), app tests/types/lint/build, generated-source sync and Deno checks. The oversized-body timeout from run 39117187291 is fixed and integration-tested. R59 passes the latest ten-race CI regression and a local ten-race rerun (80 recent pairs total); its prior 500 remains unexplained. Run 39111505944 passed R59 and failed the oversized-body test. | **BLOCKED:** investigate/remediate R59, then freeze and verify the release SHA. The one skip still requires authorized real-account rehearsal. |
| Lint | Latest CI lint reports 0 errors and 18 Fast Refresh warnings. | **PASS with advisory warnings:** rerun on the final frozen SHA. |
| Dependency risk | Latest recorded registry scan found one unpatched dev-only High advisory in `braces@3.0.3` and no backend advisories; the upstream package has no patched version in the checked evidence. | **BLOCKED:** security-owner disposition and fresh successful scan/review on the final SHA. |
| Production app/domain cutover | Read-only check found Supabase Auth site URL is preview, APP_URL is not `https://parle.buzz`, and `parle.buzz` still belongs to `parle-waitlist`. Required Vercel variable names, APP_ORIGINS and reset redirect passed the launch script's narrow checks. | **BLOCKED:** founder must cut over, deploy the exact approved SHA, set Auth/APP_URL, and complete domain smoke tests. |
| Production schema, access and recovery | Production migration comparison could not run because this checkout is not linked. Production RLS/storage/proxy evidence and a successful backup restore are absent. Project notes state Supabase Free has no managed backups. | **BLOCKED:** owner must reconcile migrations/RLS and demonstrate recovery in an isolated project. |
| Monitoring and incident readiness | Local tests cover some admin payout alert behavior. Phase 28 implements distributed concurrency leases; no production alert delivery/acknowledgement or named incident owners are recorded. Proposed numeric provider budgets and thresholds are in `AI_PROVIDER_BUDGET_READINESS.md`; none is configured or approved. | **BLOCKED:** assign primary/backup, configure provider/operations alerts, prove delivery and acknowledge tests. |
| Payments and financial controls | Stripe remains test/fake mode; live readiness checklist is NO-GO. No live business/API approval, reconciliation, tax/receipt decision, controlled transaction or payout has been evidenced. | **BLOCKED:** founder and finance owner complete `specs/STRIPE_LIVE_READINESS.md`; do not add live credentials until approval. |
| Legal, privacy and commercial terms | Counsel review of Terms, Privacy, tutor/refund terms, adult-only policy, AI/speech consent, vendor retention/data processing and financial disclosures is not recorded. | **BLOCKED:** counsel/privacy and founder decisions required. |
| Content and learner safeguards | Local bank import code tested; production bank/audio state and independent blind/content review are unverified; prompt minimum decision R137 and other owner content actions remain. | **BLOCKED for broad access:** content owner verifies production evidence and disposition. |
| Voice and accessibility | 47 focused voice/listening tests passed; source has visible-focus and reduced-motion rules. No browser/real-device/assistive-technology review, contrast measurements or WCAG conformance evaluation was performed. | **BLOCKED:** device/accessibility protocol must be completed by named QA specialist. |
| Support and cohort design | No support owner, cohort size, observation duration, incident thresholds or approved success criteria are recorded. | **BLOCKED:** founder/product/operations define these before cohort release. |

## Required actions before reconsideration

1. Engineering resolves the open R59 intermittent failure and closes/disposes the dependency advisory, then reruns all checks on one frozen SHA. Record app/backend tests, app/API typecheck, all 15 Deno checks, production bundle, migration validation and fresh dependency scans.
2. Founder/production operator reviews `OPS_CUTOVER_READINESS.md`, reconciles production schema/RLS, proves backup restoration and rollback, and only then schedules domain/Auth/environment changes and exact-SHA deployment.
3. Founder/finance closes `STRIPE_LIVE_READINESS.md`, including the connected-account API decision, jurisdiction/currency/business setup, tax/receipt handling, webhook delivery, reconciliation and incident ownership. Any real-money rehearsal requires its own explicit operator authorization and consenting test participant.
4. Counsel/privacy approves terms, consent, retention/deletion disclosures, vendor posture, tutor/refund terms and adult-only policy.
5. Product/content confirms bank provenance/coverage, production audio/status, assessment and answer separation, prompt minimum and blind review.
6. Device QA completes the device/accessibility matrix on the exact candidate and records defects, owners and dispositions.
7. Operations names primary/backup responders, validates alert delivery, writes rollback evidence and defines numeric alert thresholds, cohort size/duration, success criteria and stop conditions.
8. Reassemble this gate table against the exact release SHA. Every hard gate must be PASS or have a documented, owner-approved exception with a bounded mitigation and review date. The founder records the final go/no-go.

## Controlled rollout outline (after a future GO)

1. Founder deploys the approved SHA to a restricted internal environment and verifies sign-up, login/reset, assessment, voice failure recovery, support contact and payment-mode guardrails.
2. Start only with the founder's named invited cohort and support coverage. Record actual size, duration and hours when human response is available; do not infer these from this report.
3. Review service availability/errors, auth/email completion, learner task completion, voice failure and retry behavior, provider spend, support issues, Stripe balance/webhook/reconciliation and held payouts at the owner-approved cadence.
4. Pause new invitations on an unresolved privacy/security incident, missing/duplicate charge, unexplained balance, failed backup/restore, sustained service error threshold, runaway provider cost, unowned payout hold or unavailable support. Thresholds and escalation actions must be filled by owners before GO.
5. Expand only with a dated founder decision and evidence from the prior observation window. Preserve the rollback operator and support route throughout.

## Current operator result

**NO-GO remains in effect.** The application is not deployed to the public domain, no live Stripe setup/transaction was performed, no production setting was changed by this audit, and no cohort was opened. Documentation-only decision-sheet update: deployment required **no**. Product/domain/backend deployment will be required later after blockers close; current operational code change from Phase 5 requires deployment of `parle-payout-service` after owner review.
