# Parle Audit Gap-Closure Execution Plan

**Started:** 2026-10-17  
**Working branch:** `codex-branch`  
**Status:** Phase 1 complete; Phase 2 next  
**Authority boundary:** local code, tests, documentation, and reversible preview checks are in scope. Production migrations/settings, DNS/domain changes, live Stripe activity, legal approval, and public deployment remain founder/authorized-operator actions. Prepare exact runbooks and evidence for those gates; do not mark them complete from repository inspection alone.

## Goal

Close and evidence the audit's software, content, security/privacy, operations, and release-readiness gaps in the sequence below. Preserve an auditable record in this plan, `AUDIT_REPORT.md`, `HANDOFF.md`, the deferred-defect register, and the close-out report. At each phase boundary, record the commit, actual checks and results, external actions, and deployment need. A phase is complete only when its exit criteria are met.

## Roles

| Role | Responsibility |
|---|---|
| Engineering owner (Codex on this branch) | Repository changes, local/preview validation, technical runbooks and evidence. |
| Founder / production operator | Production migrations and settings, Vercel/domain cutover, provider-account actions, live Stripe authorization and public deployment. |
| Product/content owner | Weekend learner experience, bank review, assessment policy, prompt coverage and learner-facing copy. |
| Finance owner | Live payment/payout configuration, reconciliation, refund and dispute operations. |
| Counsel/privacy reviewer | Legal terms, privacy, consent, retention and vendor terms review. |
| Device QA / accessibility reviewer | Real iOS/Android validation and accessibility sign-off. |

Names are intentionally roles until the project assigns named people. Do not treat an absent role owner as approval.

## Phase sequence

### Phase 1 — Baseline and ownership — COMPLETE

- [x] Candidate working branch confirmed as `codex-branch`; planning push established `origin/codex-branch`.
- [x] Scope fixed to pre-public launch audit closure for the current Phase 1 app and its waitlist, provider, payment and content paths.
- [x] Audit findings and known deferred items consolidated into the register below.
- [x] External owner actions separated from code tasks and retained as launch blockers.
- [x] Current project docs corrected to point to the audit plan and not claim that the older Plan 10 status is current.

**Baseline candidate:** the latest commit after this phase's documentation changes. Phase 2 must report its exact SHA and must not claim the existing historical test counts as current results.

### Phase 2 — Reproducible quality gate — NEXT

Run backend/app suites, app typecheck, lint, production build, function type checks and migration validation on the Phase 1 SHA. Diagnose the 3 recorded weekend-only failures and 61 app type diagnostics. Define expected weekend behavior with product owner; add or repair a reproducible typecheck gate; classify all failures. Docker Desktop is available for local Supabase where needed, but use the project's documented stack and do not start production operations.

**Exit:** repeatable checks pass on a recorded SHA, or each exception has narrow evidence, an owner and explicit approval. No unclassified failures.

### Phase 3 — Content/import/assessment integrity

Verify the 544-question/72-prompt bank and listening audio with read-only production evidence. Fix importer readiness/track validation, transactional/atomic import, useful malformed-input and changed-row handling, and rerun behavior. Ensure practice fallback cannot serve assessment content. Resolve skip accounting and the concurrent `AUDIO_BEING_MADE` behavior. Bound public assessment skips/retries and verify answer/transcript/mapping privacy. Add/update regression checks and record content review/provenance.

**Exit:** safe repeatable imports; assessment separation and privacy verified; bank status and coverage evidence recorded. Production changes remain founder-operated.

### Phase 4 — Security/privacy/data handling

Verify anonymous/learner/tutor/admin boundaries for functions, database rows and storage. Trace public/expensive endpoints and rate limits; add bounded input/concurrency/cost controls where absent; run authorized abuse checks in preview/local. Map retention/deletion across database, storage, logs/backups, email, AI/speech and payment vendors. Confirm server-side adult age enforcement and provider retention/training/region settings. Prepare counsel-ready legal/privacy checklist; counsel sign-off remains external.

**Exit:** access-control and privacy evidence recorded; no unresolved high-risk leak or policy bypass; vendor and legal items have authorized disposition.

### Phase 5 — Payment/live money readiness

Write or finish the Stripe live-mode spec/checklist, including business verification, live catalog/currencies, tax/receipts, Connect Accounts v2, statement descriptor, country support, webhook secrets/events/retries, idempotency, reconciliation, refunds/disputes, payout holds and on-call contacts. Test code paths in test mode. Live-mode setup and real movement of money require founder/finance authorization.

**Exit:** code/test evidence complete; founder and finance owner explicitly approve live-mode configuration and controlled transactions. Otherwise mark external action pending and public launch blocked.

### Phase 6 — Real-device voice/accessibility

Document and perform available preview/browser checks. Real iPhone Safari and Android recording/playback, permission-denial, background/resume and network-failure checks must be completed by a device operator. Review keyboard/screen reader/focus/contrast/reduced motion and critical locale copy. Scope or disable features that lack evidence.

**Exit:** real device/accessibility evidence or approved feature gating recorded. Device availability and specialist review are external dependencies.

### Phase 7 — Operations/cutover rehearsal

Create alert and incident ownership runbook; test alerts; reconcile production migration/schema state read-only; verify backup/restore evidence; review rollback; rehearse launch-check and launch-switch in dry-run. Validate Vercel/Supabase project/scope and final-domain settings without exposing secrets. Production domain, Auth, environment and deploy operations remain founder-run.

**Exit:** dry run and rollback plan signed off; monitoring reaches named owner; production actual cutover remains marked pending until founder executes it and verifies external smoke tests.

### Phase 8 — Controlled release

Prepare a go/no-go sheet for exact release SHA, gates, known exceptions, support/incident owner and rollback operator. Public launch is not performed by this plan. Founder launches to internal/invited cohort, observes defined service/payment/cost/support signals and approves each expansion.

**Exit:** controlled cohort evidence and founder decision recorded; broader rollout only after acceptable observation.

## Consolidated issue register

Severity: **P0** blocks public launch; **P1** must be closed or explicitly accepted with mitigation before public launch; **P2** is material and needs owner/disposition, with launch gating based on detailed risk. Owners are roles from the table above.

| ID | Severity | Gap / action | Owner | Phase | Status |
|---|---|---|---|---|---|
| AUD-P0-01 | P0 | Move `parle.buzz` from waitlist to app; align Supabase Auth site/redirects, `APP_URL`, `APP_ORIGINS`, Vercel production variables; run full final-domain smoke. | Founder/production operator + engineering | 7 | External action pending |
| AUD-P0-02 | P0 | Complete business setup and Stripe live-mode spec/configuration; prove checkout, Connect, webhook, refund, dispute and payout operations. | Founder + finance + engineering | 5 | External action pending; Stripe recorded test-only |
| AUD-P0-03 | P0 | Counsel review legal/privacy/tutor/refund terms and AI/speech consent/vendor posture; approve commercial and adult-only policy. | Founder + counsel/privacy | 4–5 | External action pending |
| AUD-P1-01 | P1 | Produce one current green quality baseline; resolve or approve known 3 weekend-only failures and reconcile varying historical suite counts. | Engineering + product | 2 | Open |
| AUD-P1-02 | P1 | Reconcile 61 app TypeScript diagnostics and add reproducible typecheck release gate. | Engineering | 2 | Open |
| AUD-P1-03 | P1 | Complete real iOS/Android voice and recovery checks; gate voice if evidence is absent. | Device QA + engineering | 6 | External device action pending |
| AUD-P1-04 | P1 | Prove public level-check and other unauthenticated/expensive endpoint limits, payload caps, privacy and abuse resistance. | Engineering/security | 3–4 | Open |
| AUD-P1-05 | P1 | Reconcile production migrations/schema/RLS and prove backup restoration and rollback. | Founder/production operator + engineering | 7 | Read-only/code preparation open; production proof pending |
| AUD-P1-06 | P1 | Harden and rehearse launch-switch operator context, subprocess failure handling, redacted outputs and rollback. | Engineering + founder/operator | 7 | Open |
| AUD-P1-07 | P1 | Establish support, incident ownership, alerting and provider/payment/database monitoring; test alert delivery. | Operations + engineering | 7 | Open |
| AUD-P2-01 | P2 | Disposition Plan 13 import/readiness/atomicity/diagnostic/rerun and audio lookup/concurrency findings. | Engineering + content | 3 | Open; map to R137–R146 by description |
| AUD-P2-02 | P2 | Keep practice content separate from assessment content under AI fallback; add proof. | Engineering + product | 3 | Open |
| AUD-P2-03 | P2 | Verify content bank provenance, reviewer sign-off, answer keys, level/skill coverage and audio/transcript parity. | Content owner | 3 | Partial evidence in Plan 13; review pending |
| AUD-P2-04 | P2 | Define canonical ownership and stale-copy check for app/backend synchronized code. | Engineering | 2–4 | Open |
| AUD-P2-05 | P2 | Confirm end-to-end deletion/retention for app data and all processors, including exceptions for financial records. | Engineering + counsel/privacy | 4 | Open |
| AUD-P2-06 | P2 | Review accessibility, locale copy and how placement estimates are represented. | Product + accessibility/counsel | 4, 6 | Open |
| AUD-P2-07 | P2 | Define provider timeouts/fallback, cost limits, concurrency and latency/error budgets; verify alerts. | Engineering + operations | 4, 7 | Open |
| LEDGER-R132 | P1 | Three weekend-dependent plan-service tests; product decision needed for what a weekend starter sees; make tests deterministic. | Product + engineering | 2 | Open |
| LEDGER-R133 | P2 | Payout send type omits `created_at` in local cast; add correct type/runtime check. | Engineering | 2 | Open |
| LEDGER-R134 | P2 | Stripe idempotency responses may be counted as refusals and create rare orphaned Connect attempts. | Engineering + finance | 5 | Open |
| LEDGER-R135 | P2 | Add booking other-tutor-hold, reply-claim release on 502/throw, and switch-live-path test coverage. | Engineering | 2, 7 | Open |
| LEDGER-R136 | P1 | Exercise live launch-switch path and exact operational failure states; production portion is founder-run. | Engineering + founder/operator | 7 | Open |
| LEDGER-R137–R146 | P2 | Track individually by description in the deferred-defect ledger: audio hash normalization; skipped listening count; importer readiness/atomicity; JSONL/CLI errors; changed-row rerun; excessive public skips; concurrent audio 409; stub-only preparation test; assessment item in practice fallback; bank-source parsing discrepancy. | Engineering + product/content | 3 | Open; existing source ledger has an ID collision described below |
| AUD-DOC-01 | P2 | Resolve ID collision: HANDOFF labels an older prompt-cell minimum decision as R137, while Plan 13 uses R137 for audio hash normalization. Preserve history; assign distinct stable IDs and update references. | Engineering + product | 1, 3 | Open |
| AUD-DOC-02 | P2 | Decide whether to lower the prompt minimum from 10 to 5 or add one prompt to each of the 8 underfilled prompt cells; record product/content decision and update Content screen wording. | Product/content owner | 3 | Open |
| AUD-DESIGN-01 | P2 | Review historical open product/design choices documented in HANDOFF (account deletion with active Premium, reviews after tutor deletion, readable practice answers, payout design choices, admin choices and voice choices); carry forward only unresolved decisions that affect the launch scope. | Product owner + founder | 1, 3–6 | Open |
| AUD-EXT-01 | P1 | Complete outstanding owner prelaunch checks: owner-session checks (A84), real iPhone checks (A95/A99), Deepgram pricing (R111/A103), Azure F0→S0 (R113/A105), waitlist sender address/live campaign, founding tutors, Supabase Pro/backup decision, tutor review/blind audit/B2 bank review, and prompt minimum decision. | Founder + finance + product/content | 3–7 | External action pending |

**ID caution:** `deferred-defects.md` contains an earlier Plan 12 table row R137 for the prompt-minimum decision and a later Plan 13 R137–R146 list where R137 is the audio-hash issue. HANDOFF inherited the earlier label. The audit register identifies the Plan 13 range by description and records `AUD-DOC-01`/`AUD-DOC-02`; do not silently renumber historical records until cross-references are reconciled.

## Phase evidence log

| Date | Phase | Commit | Checks/evidence | Result / next step |
|---|---|---|---|---|
| 2026-10-17 | 1 | Documentation commit pending | Confirmed `codex-branch` tracks `origin/codex-branch`; reconciled audit findings, Plan 12/13 deferred ledger and SPEC-BACKLOG; discovered R137 label collision and stale README/HANDOFF status. | Documentation updates in progress; record implementation commit and freeze resulting baseline before Phase 2. |

## Deployment and approval log

No deployment or production mutation has been performed as part of this plan. Each phase report must state **Deployment required: no**, or list the precise preview/production action, operator and evidence still pending. A production action is not complete merely because a script exists or a dry run passes.
