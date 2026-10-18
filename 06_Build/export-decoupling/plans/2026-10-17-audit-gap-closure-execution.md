# Parle Audit Gap-Closure Execution Plan

**Started:** 2026-10-17  
**Working branch:** `codex-branch`  
**Status:** Phases 1–11 engineering changes recorded; one unpatched dev-only dependency advisory requires security-owner disposition; release NO-GO; production and external evidence remains pending
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

**Baseline:** `e127fd6`; Phase 2 completion and regression fix are committed in the follow-up documented below.

### Phase 2 — Reproducible quality gate — COMPLETE (lint gate retained)

Run backend/app suites, app typecheck, lint, production build, function type checks and migration validation. Diagnose the weekend-only failures and the recorded app type diagnostics. Define weekend first-day behavior; add a repeatable app typecheck command; classify current failures. Docker Desktop is available for local Supabase; use the documented local stack and do not start production operations.

**Current evidence (2026-10-17):** app tests 541/541; app/API typechecks 0 diagnostics; relay typecheck 0; production build passes; generated app/backend sync test 3/3; all 15 generated function entry points pass Deno check; local migration history at Phase 2 was 33 versions. The first full backend run was 609 pass / 1 skip / 1 failure: the failed case was the sync test's stale untyped-handler assertion, not a backend runtime failure. After fixing that test, the complete backend suite passed 610 / 1 skip / 0 failures across 103 files (2,286 expectations). Booking and rescheduling cases passed in both runs. ESLint reports 279 errors / 22 warnings across 49 files (230 `no-explicit-any`, 40 `no-control-regex`, other rules) after two safe `prefer-const` auto-fixes; a JSON report was written outside the repository at `D:\tmp\parle-eslint.json`.

**Follow-up validation:** after Phase 2 source fixes, the installed Node TypeScript compiler (`node node_modules/typescript/bin/tsc`) passes both `tsconfig.app.json` and `tsconfig.api.json` with zero diagnostics. The generator now supports Node's `import.meta.url`/`fileURLToPath` fallback while preserving Bun behavior; `node scripts/sync-app-code.ts` refreshed 34 generated files, and `deno check --no-lock supabase/functions/*/index.ts` passed all 15 entry points with zero diagnostics. The backend integration suite passes cleanly. The remaining lint debt has an explicit engineering owner, file/rule priority, and a no-launch disposition: it remains open for later remediation and blocks public release. Phase 2's verification work is complete with this named exception carried forward.

The Deno gate also closed R134/A123: `payouts/send.ts` now includes the selected `created_at` field in the payout row type. The sync test now asserts the typed `Request` handler signature. R133 remains open; R135 and R136 engineering gaps are closed in Phase 5, with the R135 deployment/live validation gate pending.

**Exit:** app compile/test/build and Deno function gates pass, and the clean full backend suite has 610 pass / 1 skip / 0 fail. The lint exception is owned by Engineering, has an ordered cleanup list, has no blanket suppression, and blocks public launch until its 279 errors are cleared. Phase 2 is complete with the lint item carried forward as an open hard release gate. No production operations were performed.

### Phase 3 — Content/import/assessment integrity — ENGINEERING COMPLETE; PRODUCTION EVIDENCE PENDING

Read-only local source-bank dry-run found 544 questions and 72 prompts, 616 new, zero readiness problems, and expected cell counts; this is not production evidence or item-by-item human review. Fixes: strict shared readiness validation; service-role-only transactional import RPC and proved rollback on a local database; malformed JSONL/CLI diagnostics; changed-existing-row warnings and safe idempotent reruns; listening hash normalization; answered-only check-in count; bounded polling for an in-progress audio claim; local end-to-end prepare/cache test; assessment content is no longer used as practice fallback; shared bank-source parser. Public placement still permits at most three unscored audio skips per listening section. Full backend/app suites, Deno checks and typechecks pass (current results below); production status, prepared-audio counts, approval provenance and content blind-review remain unverified here.

**Exit:** engineering controls and regression evidence complete. Production bank status/audio readiness, actual content approval trail and independent blind-review evidence are open owner gates. Deployment required before production import/use: yes (migration 000034 and matching application/function release); no deployment/import/production mutation was performed.

### Phase 4 — Security/privacy/data handling — ENGINEERING REVIEW COMPLETE; EXTERNAL EVIDENCE PENDING

Verify anonymous/learner/tutor/admin boundaries for functions, database rows and storage. Trace public/expensive endpoints and rate limits; add bounded input/concurrency/cost controls where absent; run authorized abuse checks in preview/local. Map retention/deletion across database, storage, logs/backups, email, AI/speech and payment vendors. Confirm server-side adult age enforcement and provider retention/training/region settings. Prepare counsel-ready legal/privacy checklist; counsel sign-off remains external.

**Engineering evidence (2026-10-17):** source review covered OWASP A01–A10 across request auth/roles, owned data helper, account deletion, public assessment, rate limits, storage and Vercel headers. Targeted local Docker security regression set passed 52/52 across six files (165 expectations): account deletion/anonymization, active subscription protection, profile photos, caller ownership, email verification, auth flows, rate-limit ceilings/spoofed forwarded IP, answer/transcript privacy and selected audio signing. Public check caps body size at 32 KB, normalizes schemas, uses fixed 10 starts/hour and 30 scores/hour per-address limits, global 1,000 starts/hour, and scheduled daily cleanup. Static search found no learner/tutor-supplied server fetch target in the reviewed function/API call sites. No Critical/High issue confirmed in reviewed paths. `bun audit --json` for both packages was blocked by `ConnectionRefused`; this is unverified, not a pass. Age check is server-enforced self-attestation, not age verification. Production RLS, proxy header behavior, provider data/retention settings, backups and alerting were not inspected.

**Phase 4 disposition:** repository-level review and local tests are complete; full exit criteria remain open pending dependency advisory scan, authorized production boundary/config evidence, retention map across processors/backups, and counsel/privacy disposition. No production reads or writes, deployment or provider contacts were made.

**Exit:** source paths reviewed with no confirmed high-risk vulnerability in reviewed scope. Vendor/legal/production evidence disposition remains pending; therefore Phase 4 is not fully cleared for launch.

### Phase 5 — Payment/live money readiness — ENGINEERING COMPLETE; LIVE GATE OPEN

Added `specs/STRIPE_LIVE_READINESS.md` with a NO-GO checklist, owner evidence requirements, API-version/Accounts v2 decision, webhook inventory, reconciliation and operations controls. Fixed Connect account refusal classification so in-flight/idempotency errors (400 `idempotency_error`, 409) do not rotate account attempt keys. Added regressions for this behavior, a learner's independent tutor hold, AI reply claim release and the launch-switch guard. Backend full run: 622 pass / 1 skip / 1 failure across 104 files (2,328 expectations); the sole full-run failure was the AI abort case timing out at 45 seconds. Isolated AI tests passed 15/15. All 15 Edge Function entry points pass Deno check. No live keys/configuration or money movement performed.

**Exit:** engineering evidence complete; founder and finance owner explicitly approve live-mode configuration and controlled transactions. External action remains pending; public launch blocked. Deployment needed to deliver the backend fix: yes, deploy `parle-payout-service` after owner review. No live mode activation or controlled transaction is performed by this plan.

### Phase 6 — Real-device voice/accessibility

Desk review complete and recorded in `specs/DEVICE_ACCESSIBILITY_READINESS.md`. Source review found visible focus and reduced-motion rules; 47 focused voice/listening tests across 9 files and app/API typechecks passed. A local Vite server started, but the computer-use environment has no browser, and no physical iOS/Android or assistive-technology device is available. The matrix documents device recording/playback, permissions, background/resume, keyboard, screen-reader, contrast, copy and evidence criteria. No browser, device, screenshot, contrast measurement, axe/Lighthouse scan or WCAG conformance test was completed.

**Exit:** NOT CLEARED. Real-device/accessibility evidence or approved feature gating is still required from the assigned device operator/specialist. Public launch remains blocked. Deployment required to add this protocol: no; no product code was changed.

### Phase 7 — Operations/cutover rehearsal

Added `specs/OPS_CUTOVER_READINESS.md`. Read-only production `launch-check.ts` passed (exit 0) and found the pending Auth site URL, APP_URL and domain project blockers; it reported no missing required Vercel variable names, APP_ORIGINS domain, or reset-password redirect. `launch-switch.ts --dry-run` passed (exit 0) and printed four owner/script actions without changing state. `supabase migration list --linked` could not run because this checkout is not linked; no link or mutation was attempted. Repository evidence says the current Supabase Free plan has no managed backups; restore proof, alert delivery and named incident owners are absent. No live changes/deployment occurred.

**Exit:** NOT CLEARED. Dry-run passed, but rollback rehearsal, migration comparison, backup restoration, monitoring delivery and named-owner sign-off remain open. Exact domain blockers are in `specs/OPS_CUTOVER_READINESS.md`. Domain/Auth/environment/deployment operations stay founder-run.

### Phase 8 — Controlled release — NO-GO DECISION RECORDED

Prepared `specs/CONTROLLED_RELEASE_GO_NO_GO.md`. Reviewed HEAD was `30126ce`; last app/backend code commit was `3a980d5`, but no final release SHA is selected because quality, lint, dependency, legal, payment, device, operations and production gates remain blocked. The sheet records exact evidence, current decision, owner actions, future cohort monitoring and stop conditions. No internal/invited/public cohort was opened and no deployment was performed.

**Exit:** decision sheet prepared; release NOT CLEARED. Founder and named owners must close hard gates, freeze a new exact SHA, review evidence and record explicit GO/NO-GO. No public release is implied or authorized by this plan.

### Phase 9 — Lint and correctness remediation — ENGINEERING COMPLETE; RELEASE SHA VERIFICATION PENDING

Cleared actual ESLint errors from 279 to 0 (21 warnings remain), strengthened service/API/provider types, and fixed a learner-task compare-and-set update defect. Full app tests pass 547/547; app/API typechecks are clean; full backend suite previously passed 623/1 skip/0 fail; targeted current backend admin/marketplace/placement tests pass 25/25; all 15 Deno entry points pass. The Windows host Vite command is blocked by SWC native-binding cache ACL/owner validation; a current full production build passes in a Linux Docker container (2,726 modules; 3.51s) with recorded bundle/config warnings. Include code changes in the next reviewed preview release. Lint remediation is complete; final frozen-SHA verification remains in release readiness.

### Phase 10 — Dependency advisory remediation — ENGINEERING COMPLETE; SECURITY DISPOSITION PENDING

Registry-backed Bun 1.3.10 scan found 33 app advisories (20 high, 10 moderate, 3 low) and no backend findings. Migrated the legacy binary app lock to text, used checksum-verified Bun 1.4.3 for scoped overrides, and resolved all findings except `braces@3.0.3` (High GHSA-vfj7-8cjw-p6xm; upstream lists no patched version). It is dev-only under Tailwind file-scanning dependencies; checked-in patterns are developer-authored static globs. Tailwind CLI CSS compile passes after updates; full app suite and typechecks stay clean; full Vite build passes in Linux Docker (2,726 modules; 3.51s); host SWC cache remains blocked. Keep the residual advisory open for security-owner disposition; do not claim a clean scan. Deployment required: include lockfile changes in the next reviewed preview release after security-owner disposition and code review.

### Phase 11 — Operations preflight fail-closed hardening — ENGINEERING CHANGE COMPLETE; OPERATOR REHEARSAL PENDING

Launch preflight previously concatenated Vercel CLI stdout/stderr without checking the subprocess exit code, so an authentication or CLI failure could be mistaken for empty environment/domain configuration. Added a success guard: nonzero exit throws a command-and-exit-code-only error and omits captured output; successful command output retains prior parsing behavior. Regression coverage verifies failure and redaction. The launch-check/launch-switch tests pass 5/5 (22 expectations) in Docker Bun 1.4.3. No live API command, domain, auth setting, deployment or production state was changed.

**Status and rollout:** the engineering subprocess guard is complete. AUD-P1-06 remains open for authorized operator-context validation, domain/Auth rollback rehearsal and cutover evidence. Deployment required: **no** to validate this local preflight hardening. No deployment or production mutation occurred.

## Consolidated issue register

Severity: **P0** blocks public launch; **P1** must be closed or explicitly accepted with mitigation before public launch; **P2** is material and needs owner/disposition, with launch gating based on detailed risk. Owners are roles from the table above.

| ID | Severity | Gap / action | Owner | Phase | Status |
|---|---|---|---|---|---|
| AUD-P0-01 | P0 | Move `parle.buzz` from waitlist to app; align Supabase Auth site/redirects, `APP_URL`, `APP_ORIGINS`, Vercel production variables; run full final-domain smoke. | Founder/production operator + engineering | 7 | Read-only check confirms blockers: Auth site URL remains preview; APP_URL is not parle.buzz; domain remains on parle-waitlist. Required Vercel variable names, APP_ORIGINS and reset redirect are present by script checks. No change performed. |
| AUD-P0-02 | P0 | Complete business setup and Stripe live-mode spec/configuration; prove checkout, Connect, webhook, refund, dispute and payout operations. | Founder + finance + engineering | 5 | External action pending; Stripe recorded test-only |
| AUD-P0-03 | P0 | Counsel review legal/privacy/tutor/refund terms and AI/speech consent/vendor posture; approve commercial and adult-only policy. | Founder + counsel/privacy | 4–5 | External action pending |
| AUD-P1-01 | P1 | Produce one current green quality baseline; resolve or approve known 3 weekend-only failures and reconcile varying historical suite counts. | Engineering + product | 2, 9 | Partial: app suite 547/547 (62 files), app/API typechecks clean, and lint 0 errors / 21 warnings; Tailwind CLI CSS compile passes. Backend full suite 623 pass / 1 skip / 0 fail is from the prior full run; current targeted backend tests 25/25; Deno 15/15. Host Vite command is blocked by SWC native-binding cache ACL/owner rejection; isolated Docker Vite build passes with recorded warnings. Re-run every gate on frozen release SHA. |
| AUD-P1-02 | P1 | Reconcile 61 app TypeScript diagnostics and add reproducible typecheck release gate. | Engineering | 2 | Closed: app and API TypeScript checks pass with zero diagnostics. |
| AUD-P1-03 | P1 | Complete real iOS/Android voice and recovery checks; gate voice if evidence is absent. | Device QA + engineering | 6 | External device action pending |
| AUD-P1-04 | P1 | Prove public level-check and other unauthenticated/expensive endpoint limits, payload caps, privacy and abuse resistance. | Engineering/security | 3–4 | Partial: local limits/body cap/schema/privacy pass; production proxy/IP, rate-limit config and burst/cost load proof remain open. |
| AUD-P1-05 | P1 | Reconcile production migrations/schema/RLS and prove backup restoration and rollback. | Founder/production operator + engineering | 7 | `migration list --linked` blocked because checkout has no linked project. No link attempted. Backup/restore and rollback evidence remain open. |
| AUD-P1-06 | P1 | Harden and rehearse launch-switch operator context, subprocess failure handling, redacted outputs and rollback. | Engineering + founder/operator | 7, 11 | Phase 11: failed Vercel CLI subprocesses now throw a sanitized nonzero-exit error instead of being parsed as missing settings; regression test verifies failure output is not surfaced. Domain/Auth rollback rehearsal, production deployment and operator evidence remain open. |
| AUD-P1-07 | P1 | Establish support, incident ownership, alerting and provider/payment/database monitoring; test alert delivery. | Operations + engineering | 7 | Runbook created; named primary/backup owners, production alert configuration and delivery/acknowledgement test remain open. |
| AUD-P1-08 | P1 | Ensure learner-plan claim updates compare the current claim fields so concurrent workers cannot overwrite one another. | Engineering | 9 | Fixed in `entities.updateWhere`; null-aware filters use `IS NULL`, and a lost claim returns no row. Three regression tests pass. |
| AUD-P2-01 | P2 | Disposition Plan 13 import/readiness/atomicity/diagnostic/rerun and audio lookup/concurrency findings. | Engineering + content | 3 | Closed in code: R138–R144 individually resolved/tested; local migration 000034 applied only to local Docker DB. |
| AUD-P2-02 | P2 | Keep practice content separate from assessment content under AI fallback; add proof. | Engineering + product | 3 | Closed in code: fallback removed; unavailable response is empty; app/backend tests pass. |
| AUD-P2-03 | P2 | Verify content bank provenance, reviewer sign-off, answer keys, level/skill coverage and audio/transcript parity. | Content owner | 3 | Partial evidence in Plan 13; review pending |
| AUD-P2-04 | P2 | Define canonical ownership and stale-copy check for app/backend synchronized code. | Engineering | 2–4 | Partial: sync generator/test is current and full suite passes; ownership documentation still needs a durable rule. |
| AUD-P2-05 | P2 | Confirm end-to-end deletion/retention for app data and all processors, including exceptions for financial records. | Engineering + counsel/privacy | 4 | Partial: local deletion tests cover app rows/media and anonymization; provider/log/backup retention and legal exceptions pending owner/counsel evidence. |
| AUD-P2-06 | P2 | Review accessibility, locale copy and how placement estimates are represented. | Product + accessibility/counsel | 4, 6 | Desk-review protocol and source evidence documented in `specs/DEVICE_ACCESSIBILITY_READINESS.md`; real browser/device/AT, contrast and product/counsel review remain open. |
| AUD-P2-07 | P2 | Define provider timeouts/fallback, cost limits, concurrency and latency/error budgets; verify alerts. | Engineering + operations | 4, 7 | Open: bounded implementation paths exist, but production provider budgets/configuration and alert delivery are unverified. |
| LEDGER-R132 | P1 | Three weekend-dependent plan-service tests; product decision needed for what a weekend starter sees; make tests deterministic. | Engineering | 2 | Closed: explicit all-day test availability; existing UX starts on next available day and displays it. |
| LEDGER-R133 | P2 | Late payment for a hold the learner replaced (R127) gets the wrong "booked by someone else" refund email; define and use the approved replaced-hold reason. | Engineering + product | 5 | Open |
| LEDGER-R134 | P2 | Payout send type omits `created_at` in its local row cast; add the field and a real function typecheck. | Engineering | 2 | Closed: field added; all generated functions pass Deno check. |
| LEDGER-R135 | P2 | Stripe idempotency responses (400 `idempotency_error`, 409 in progress) may be counted as refusals and create a new Connect attempt. | Engineering + finance | 5 | Fixed in code and regression-tested; backend deployment and live Stripe validation pending. |
| LEDGER-R136 | P1 | Missing tests for R127 other-tutor holds, R128 reply-claim release after 502/throw, and launch-switch live path. | Engineering | 2, 7 | Code/test gaps closed in Phase 5; production cutover remains pending. |
| LEDGER-R138–R146 | P2 | Track individually by description in the deferred-defect ledger: audio hash normalization; skipped listening count; importer readiness/atomicity; JSONL/CLI errors; changed-row rerun; bounded public skips; concurrent audio 409; local integration preparation test; assessment item in practice fallback; shared bank-source parsing. | Engineering + product/content | 3 | Closed in code; production/content evidence remains owner gate. |
| AUD-P2-08 | P2 | Clear all remaining lint errors before public launch (current count follows Phase 3 closeout). | Engineering | 2, 9 | Lint error gate cleared: actual Node ESLint is 0 errors / 21 warnings, down from 279 / 22. Remaining warnings are tracked for cleanup; rerun on final release SHA. |
| AUD-P2-09 | P1 | Keep generated `_app` sources synchronized and check all 15 Supabase entry points with Deno. | Engineering | 2 | Complete: Node-compatible sync; Deno check 0 diagnostics; sync test 3/3 |
| AUD-P2-10 | P1 | Resolve confirmed app dependency advisories and record clean scans for both Bun graphs. | Engineering | 4, 10 | Partial: registry-backed scan reduced the app from 33 matches to one High `braces@3.0.3` advisory; upstream lists no patched version. It is dev-only under Tailwind's glob scanner, whose checked-in patterns are trusted static config. Backend scan is clean. Security-owner disposition and a clean/accepted release gate remain open. Full package and GHSA evidence is in `AUDIT_REPORT.md`. |
| AUD-DOC-01 | P2 | Align summaries: R137 is the Plan 12 prompt-minimum decision; R138–R146 are Plan 13 findings. Preserve the inclusive HANDOFF range and make its meaning explicit. | Engineering + product | 1 | Complete |
| AUD-DOC-02 | P2 | Decide whether to lower the prompt minimum from 10 to 5 or add one prompt to each of the 8 underfilled prompt cells; record product/content decision and update Content screen wording. | Product/content owner | 3 | Open |
| AUD-DESIGN-01 | P2 | Review historical open product/design choices documented in HANDOFF (account deletion with active Premium, reviews after tutor deletion, readable practice answers, payout design choices, admin choices and voice choices); carry forward only unresolved decisions that affect the launch scope. | Product owner + founder | 1, 3–6 | Open |
| AUD-EXT-01 | P1 | Complete outstanding owner prelaunch checks: owner-session checks (A84), real iPhone checks (A95/A99), Deepgram pricing (R111/A103), Azure F0→S0 (R113/A105), waitlist sender address/live campaign, founding tutors, Supabase Pro/backup decision, tutor review/blind audit/B2 bank review, and prompt minimum decision. | Founder + finance + product/content | 3–7 | External action pending |

**Reference note:** `deferred-defects.md` assigns R137 to the Plan 12 prompt-minimum decision and R138–R146 to Plan 13 findings. HANDOFF's R137–R146 wording is an inclusive range, not a duplicate assignment. `AUD-DOC-01` records this clarification; `AUD-DOC-02` tracks the still-open content decision.

## Phase evidence log

| Date | Phase | Commit | Checks/evidence | Result / next step |
|---|---|---|---|---|
| 2026-10-17 | 1 | a445948 | Confirmed `codex-branch` tracks `origin/codex-branch`; reconciled audit findings, Plan 12/13 deferred ledger and SPEC-BACKLOG; corrected R137–R146 summary attribution and refreshed stale README/HANDOFF status. | Complete. |
| 2026-10-17 | 2 | `4cae4d8`, `8b0e240`, `e127fd6`, `a29090d` | App tests 541/541; Node app/API typechecks 0; local build; Node sync generated 34 files; Deno checks 15/15 entry points with 0 diagnostics; local migration history has 31 applied versions. Backend 610/1/0 across 103 files (2,286 expectations); app sync test 3/3. ESLint 279 errors/22 warnings after two safe fixes. | Complete with explicitly owned lint debt retained as hard launch gate. Deployment required: no. |
| 2026-10-17 | 3 | `41df01f` | Backend 617 pass / 1 skip / 0 fail (2,308 expectations, 103 files); app 544/544; app/API TypeScript 0 diagnostics; Deno 15/15; Vite build passes with recorded warnings. Local bank dry-run: 544 questions + 72 prompts, 616 new, zero readiness problems. Local migration 000034 validated atomic rollback and anon denial. ESLint 279 errors/22 warnings across 61 files. | Engineering controls complete; production bank/read-only evidence, content blind review and migration deployment pending founder/operator. Deployment required before using the new import path in production: yes; none performed here. |
| 2026-10-17 | 4 | `de1c2fd` | OWASP A01–A10 source review; targeted local security suite 52 pass / 0 fail across 6 files (165 expectations); app suite 544/544, app/API typecheck clean, production build passed after React Router 7.18.4 upgrade. Confirmed app dependency advisories remain (AUD-P2-10); final scanner request blocked by ConnectionRefused. Production proxy/RLS/provider/backup/alert evidence not inspected. | Engineering review complete; dependency and external evidence criteria open. Deployment required: no for review/docs; no production changes. |
| 2026-10-17 | 5 | `3a980d5` | Stripe readiness checklist; backend 622 pass / 1 skip / 1 full-suite timing failure (AI abort at 45s); isolated AI 15/15; Deno 15/15; regression coverage for R135/R136 and launch-switch guard. | Engineering evidence complete; no live settings or money movement. Deploy `parle-payout-service` after owner review; founder/finance live setup and rehearsal pending. |
| 2026-10-17 | 6 | `15ebd13` | Source review: global visible focus and reduced-motion styles; focused voice/listening tests 47/47 across 9 files; app/API typecheck clean. Vite local server ran on 8082, but CUA had no browser; no physical device, AT or contrast scanner available. Protocol/checklist added. | Desk review recorded; phase exit NOT CLEARED pending device/operator evidence. Deployment required: no for documentation. |
| 2026-10-17 | 7 | `30126ce` | Production read-only launch check exit 0 found Auth site URL, APP_URL and domain project blockers; switch dry-run exit 0 showed four steps; no production mutations. `migration list --linked` unavailable (project not linked); backup/restore and alert delivery evidence absent. | Ops/cutover runbook added; phase exit NOT CLEARED. No deployment performed. |
| 2026-10-17 | 8 | `8f7b9cc` | Go/no-go sheet covers exact SHA, current gates, owners, future cohort signals, and stop/rollback conditions. Reviewed evidence SHA `30126ce`; code commit `3a980d5`; no release SHA selected. | NO-GO. No cohort, public launch or deployment. Revisit after all hard gates close and owners record approval. |
| 2026-10-18 | 9 (engineering complete; release SHA pending) | `ca7e3e3` | Actual Node ESLint: 0 errors / 21 warnings (down from 279 / 22). App suite 547/547 across 62 files and app/API typechecks clean. Backend suite 623 pass / 1 skip / 0 fail across 104 files (2,331 expectations) and Deno checks 15/15 are current; targeted admin/marketplace/placement backend tests pass 25/25 (120 expectations). The Windows host Vite command is blocked before compilation because SWC rejects its cache ACL/owner; a current Linux Docker production build passes (2,726 modules; 3.51s) with recorded warnings. Focused entity/learner-plan/billing tests 21/21. Code review found and fixed an ID-only learner-task update that ignored claim filters; tests cover filtered update, lost claim and database error. The codebase-memory MCP transport is closed, so indexing/discovery could not refresh. Bun's shell shim is inaccessible in this session; the installed executable was used directly for tests/build. | Engineering lint exit is complete. Final frozen-SHA verification remains in Phase 8 release readiness. Deployment required: yes for the reviewed preview release; none performed. No production mutation. |
| 2026-10-18 | 10 (engineering complete; disposition pending) | `b4f838e` | Bun 1.3.10 app audit found 33 matches (20 high/10 moderate/3 low), backend none; latest registry refresh returned ConnectionRefused; Bun 1.4.3 text lock + scoped overrides reduced app findings to one High braces advisory (no patched version). Patched lock entries: Babel runtime, brace-expansion, cross-spawn, flatted, glob, lodash, minimatch, picomatch, postcss-selector-parser, yaml. Full app tests 547/547; app/API typechecks clean; ESLint 0 errors/21 warnings; Tailwind CSS compile succeeds. Full Vite passes in Linux Docker (2,726 modules; 3.51s) with recorded warnings; host SWC cache remains blocked. `bun pm why braces` shows Tailwind dev-time scanning parents; checked-in globs are static. | One upstream unpatched High advisory remains for security-owner disposition; no clean scan claimed. Next reviewed preview after disposition and code review. No deployment or production change. |
| 2026-10-18 | 11 (engineering complete; operator evidence pending) | `d82ed07` | Launch-check/switch tests 5/5 (22 expectations) using Bun 1.4.3 in Docker; failed Vercel subprocess now fails closed, and failure output redaction is tested. No production or provider action. | Local code change; deployment required: **no**. AUD-P1-06 remains open for operator rollback/cutover rehearsal. |

## Deployment and approval log

| Date | Phase | Change/release | Evidence | Deployment disposition |
|---|---|---|---|---|

No deployment or production mutation has been performed as part of this plan. Each phase report must state **Deployment required: no**, or list the precise preview/production action, operator and evidence still pending. A production action is not complete merely because a script exists or a dry run passes.

| 2026-10-17 | 2 | N/A | Only local tests, typechecks, lint, and production bundle build. No remote provider, setting, migration, DNS, Stripe or Vercel action. | Deployment required: **no** for this verification phase. The UI/type/doc commit belongs in a later founder-approved release candidate. |
| 2026-10-17 | 3 | N/A | Local Docker SQL migration/test only; source bank read-only dry-run; code tests. No remote provider, setting, migration, import, DNS, Stripe or Vercel action. | Deployment required: **yes** before production import/use, via founder/operator release. No deployment performed. |
| 2026-10-18 | 10 | `b4f838e` | App dependency and lockfile update; no remote provider, setting, migration, DNS, Stripe or Vercel action. | Include in next reviewed preview after security-owner disposition and code review. Docker build validation passed; none performed. |
| 2026-10-18 | 11 | `d82ed07` | Local launch-preflight CLI guard and regression test only; no provider calls or production actions. | Deployment required: **no** for this code change. Operator rollback/cutover rehearsal remains open. |
