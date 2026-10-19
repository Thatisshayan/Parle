# Parle owner-gap closure plan

**Status:** Active execution plan — engineering can continue; public release remains **NO-GO**.

**As-of evidence:** `codex-branch` at `581cb64` (`Record Phase 59 CI verification`). Full CI run [39217414034](https://github.com/Thatisshayan/Parle/actions/runs/39217414034) is green: backend 665 passed / 1 authorized skip / 0 failed across 666 tests and 109 files, app tests/types/lint/build, generated-source checks, launch preflight, and Deno checks. `AUDIT_REPORT.md` and the external report copy have identical SHA-256 `ED951912AD3D696226D5D488FC7BF95670517AB411A875071A568AE53B4B85F1`.

This plan consolidates the open findings and release gates already recorded in the audit report, `HANDOFF.md`, `security-debt.md`, `CONTROLLED_RELEASE_GO_NO_GO.md`, `OPS_CUTOVER_READINESS.md`, `STRIPE_LIVE_READINESS.md`, and the readiness runbooks. It separates work that can be completed on `codex-branch` from actions that require a named production operator, founder, finance owner, counsel, product owner, or device/accessibility reviewer.

## Operating rules

1. Every engineering phase starts from a clean branch, records the exact commit, runs the applicable focused checks and full CI, and updates the audit report, execution plan, handoff, and affected registers.
2. A green CI run is evidence for the checked-out source only. It does not prove a deployed Supabase/Vercel configuration, DNS/Auth cutover, backup, alert delivery, live Stripe behavior, legal approval, or real-device accessibility.
3. No production credentials, live Stripe actions, DNS changes, Auth settings, migrations, provider budgets, or public traffic changes are performed by this plan without a separate owner-controlled release action.
4. A gate is closed only when its evidence is attached or linked, an owner is named, and the stop condition is tested or explicitly accepted with a review date. “Script exists” and “preview is READY” are not gate closure.

## Ordered closure workstreams

| Order | Workstream | Owner required | Required proof | Current status / stop condition |
|---|---|---|---|---|
| 1 | Evidence freeze and release packet | Engineering; founder reviews | Frozen SHA, full CI, dependency scan, generated-source parity, launch preflight, preview URL, migration/function inventory, report hash | **In progress (Phase 60).** Stop if the SHA changes or any required check is stale. |
| 2 | Security coverage and dependency disposition | Engineering; security owner | Resume the same Deep Scan when platform usage is available; final manifest/report; disposition for `braces@3.0.3`; tracked/ignored secret-file inventory without printing values | **Blocked.** Phase 59 returned no manifest after a terminal platform usage-limit error. No clean-scan claim is allowed. Stop if scan coverage remains partial or the advisory has no owner decision. |
| 3 | Production schema, functions, and app release reconciliation | Production operator + engineering | Linked-project migration diff; reviewed deployments of affected Edge Functions and Vercel app; RLS/storage/gateway checks; smoke evidence against the exact SHA | **Blocked.** No linked production project or reviewed production deployment is evidenced. Stop on migration drift, failed smoke test, or unverified client-IP header behavior. |
| 4 | Backup, restore, and rollback | Production operator | Provider plan/PITR decision; isolated restore; rollback rehearsal; named operator and recovery time/objective records | **Blocked.** No successful production backup/restore evidence or rollback rehearsal is recorded. Stop if restore is unverified or the operator is unavailable. |
| 5 | Payments, refunds, payouts, and finance | Founder + finance owner | Stripe live-readiness checklist; Accounts API decision; catalog/tax/receipts; webhook and idempotency proof; refund/dispute/payout reconciliation; held-payout review; explicit authorization for any controlled real-money test | **Blocked.** Stripe remains test/fake mode and live credentials/actions are not authorized. Stop on unreconciled refund/payout state, missing webhook evidence, or absent finance owner. |
| 6 | Legal, privacy, content, and learner safeguards | Counsel/privacy + product/content owner | Approved Terms/Privacy/consent/retention/deletion/adult-only/tutor-refund language; vendor/data-processing decision; blind content review; prompt-minimum decision; production audio/bank provenance | **Blocked.** No counsel or production content approval is recorded. Stop on unresolved consent, retention, safety, or content defects. |
| 7 | Device, accessibility, and UX verification | Named QA/accessibility reviewer | Exact-SHA browser and real-device matrix; keyboard/screen-reader/contrast/reduced-motion evidence; WCAG findings and dispositions | **Blocked.** Static source checks are not a device or assistive-technology review. Stop on any open blocker or missing test device. |
| 8 | Monitoring, incident response, provider budgets, and support | Operations + engineering + founder | Primary/backup responders; alert delivery and acknowledgement; provider caps; dashboards; incident/rollback runbook; cohort size/duration/stop thresholds/support hours | **Blocked.** No production alert delivery, named responders, or approved numeric thresholds are evidenced. Stop if an alert cannot be acknowledged or the support window is unowned. |
| 9 | Domain, Auth, waitlist, and controlled cutover | Founder/production operator | `parle.buzz` DNS/domain verification; Auth site URL and redirect update; `APP_URL`/origins; waitlist and app smoke tests; rollback record | **Blocked.** `parle.buzz` is still associated with the waitlist and Auth/APP_URL are preview-oriented. Stop on any redirect, cookie, email, or rollback failure. |
| 10 | Final GO/NO-GO and restricted cohort | Founder, with all owners | Reassembled gate table against one frozen SHA; every hard gate PASS or dated owner-approved exception; cohort decision and stop criteria | **Blocked.** No release candidate has been selected and owner approvals are absent. Public release cannot proceed. |

## Phase 60 — Evidence freeze and owner-gate closure plan

**Execution status:** Engineering documentation and evidence normalization started on 2026-10-19. No production or provider mutation occurred. The repository copy and external report copy were verified equal before this phase.

### Engineering outputs completed in this phase

- Added this ordered workstream plan and mapped every open gate to an owner, proof requirement, and stop condition.
- Reconciled the evidence baseline to branch `codex-branch`, commit `581cb64`, and CI run [39217414034](https://github.com/Thatisshayan/Parle/actions/runs/39217414034).
- Recorded that the current SHA has no Vercel deployment; the earlier READY deployments are protected previews for prior commits and are not production evidence.
- Preserved the Phase 59 scan limitation: the continuation stopped after three unsuccessful discovery workers because of a platform usage limit and returned no manifest, findings, or clean-scan result.

### Phase 60 acceptance criteria

- [x] Plan is present in the repository and linked from the audit/handoff documents.
- [x] Current branch, SHA, CI result, and report-copy hash are recorded.
- [x] No production/provider/credential mutation was performed.
- [ ] Security owner accepts or remediates `braces@3.0.3`.
- [ ] A successful repository-wide scan with a manifest is available.
- [ ] Founder/production operator completes production reconciliation, backup/restore, cutover, and rollback gates.
- [ ] Finance, counsel/privacy, product/content, accessibility, and operations owners provide their evidence.
- [ ] Founder records final GO/NO-GO against the frozen release SHA.

### Next executable phase

Phase 61 is the engineering security evidence continuation. It may resume the same Deep Scan only when platform usage is available; it must not start a replacement scan or claim clean coverage. If usage remains unavailable, engineering should continue with evidence-packet preparation and owner checklists while retaining the scan gate as blocked.

## Required owner packet

Before a future release review, collect one dated packet containing:

1. The frozen commit SHA and complete CI run.
2. Final scan manifest/report and dependency-owner decision.
3. Production migration/RLS/function/app deployment receipts and smoke output.
4. Backup/restore and rollback evidence.
5. Stripe/finance checklist and reconciliation evidence.
6. Counsel/privacy and content approvals.
7. Device/accessibility matrix and defect dispositions.
8. Monitoring/support ownership, alert acknowledgement, budgets, cohort limits, and stop conditions.
9. Domain/Auth/waitlist cutover and rollback evidence.
10. Signed founder GO/NO-GO decision.

