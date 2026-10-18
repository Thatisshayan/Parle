# Parle Comprehensive Codebase, Launch, and Pre-Launch Audit

**Assessment date:** 2026-10-17  
**Repository:** `D:\AgentDevWork\repos\Parle`  
**Indexed project:** `D-AgentDevWork-repos-Parle`  
**Scope:** product and codebase understanding, architecture, application and backend readiness, security and privacy, data and migrations, payments, AI and voice providers, content, quality, accessibility, operations, deployment, compliance, and launch sequencing.  
**Evidence basis:** repository source/configuration, dated plans/decisions/close-out records, a full codebase-memory graph index, and Phase 2–3 checks recorded below. This remains a repository and local-environment audit; it is not an independent live penetration test, legal opinion, provider-console inspection, production migration rehearsal, or real-device test.

## 1. Executive assessment

### Overall disposition: **NO-GO for public launch; GO for controlled private preview and pre-launch closeout**

Parle is a substantial French learning and tutoring platform for adults. Its product flow combines goal selection, placement, an adaptive roadmap and weekly plan, AI tutoring and practice, speech input and output, vetted human tutors, booking and payment, subscriptions, and administration. The code has moved off the original builder platform onto a stack the team controls: React/Vite on Vercel, Supabase Auth/Postgres/Storage/Edge Functions, Stripe, Resend, OpenRouter, Deepgram and Azure Speech. The project has unusually strong written implementation history: staged plans, migration rehearsals, decision records, tests, operational scripts, and a deferred-defect register.

The evidence does not support turning on public access yet. The app remains a protected Vercel preview and Stripe is recorded in test mode. The domain/Auth cutover, founder business setup, Stripe live-mode activation, counsel review, real-device checks and final production deployment remain owner gates. Phase 3 closed the identified importer/assessment code gaps, and Phase 5 adds the Stripe live-readiness specification plus regression coverage for idempotency, independent booking holds, reply-claim release, and launch-switch settings. The latest backend full run was 622 pass / 1 skip / 1 timing failure; the isolated AI suite passed 15/15 and all 15 generated function Deno checks pass. A local source-bank dry-run validated 544 questions and 72 prompts with zero import-rule problems; local migration 000034 was tested against Docker Postgres, including rollback and anon denial. This is not production evidence or independent item-by-item content review. The local Vite build needed an elevated rerun due to Windows SWC cache ownership; the outcome is recorded in Phase 3 closeout. ESLint remains a release blocker; Phase 3's current count is recorded below. A real iPhone Safari microphone/playback check remains outstanding.

**Recommendation:** keep the production app private. Close the P0/P1 evidence gates below, rerun the full required verification on the exact release commit, review actual production provider/domain settings without disclosing their values, complete a controlled live-mode payment/payout rehearsal, and obtain explicit go/no-go from the founder. Promote public traffic only after the checklist has evidence attached.

### Snapshot

| Area | Assessment | Basis |
|---|---|---|
| Product definition | Strong | Clear adult-only French learning proposition and phase-one scope across learner, tutor and admin workflows. |
| Architecture | Sound for an initial controlled launch | App/backend split with server functions and provider adapters; single product stack and Canadian-region Supabase documented. |
| Core feature implementation | Broad, substantial | Repository records show end-to-end preview checks for onboarding, placement, AI, practice, marketplace, booking, test payments, payouts, admin, waitlist and voice. |
| Security design | Positive controls present; production proof incomplete | Server-side admin authorization, RLS/access rules, rate limiting, signed webhooks, secret hygiene and audit logging are represented in code and tests. No independent security test was run. |
| Release readiness | **Not ready** | App remains private preview; production domain/auth cutover and Stripe live mode are pending. |
| Quality gates | **Not green** | Phase 3 app suite 544/544; latest Phase 5 backend suite 622 pass / 1 skip / 1 failure across 104 files (2,328 expectations); the sole failure was an AI abort timeout that passed in the isolated 15-test AI suite. Deno checks 15/15. Local build and ESLint totals are recorded in Phase 3 evidence. Lint remains an explicit pre-launch gate. |
| Privacy/compliance | **Not launch-cleared** | Adult-only decision and AI provider disclosures are recorded; lawyer review and business setup are pending, and real data-flow/retention consent must be verified. |
| Operations | Promising but incomplete | Migration/cutover/launch scripts exist; rollback, alerting, support, incident ownership and production rehearsal evidence need final confirmation. |

## 2. Understanding of Parle

### Product and users

Parle serves adults learning French, with initial tracks for Canadian immigration (NCLC 7), citizenship (NCLC 4), and general conversation. A learner selects a goal, takes a placement assessment, receives a level estimate and personalized roadmap, then works through AI-supported lessons and practice. Human tutors provide a complementary paid service through profiles, availability, lesson bookings, cancellation/refund handling and payouts. A separate public waitlist currently occupies `parle.buzz`; the app itself is private.

This is therefore a multi-sided service rather than a single learning UI. It handles learner education records and voice, tutor identity/application/profile and payout data, payment events and entitlements, administrative access, and public marketing/waitlist data. The trust boundary crosses the browser, Vercel API/relay, Supabase functions and database, Stripe and Connect, email delivery, and AI/speech vendors.

### Architecture and data flow

- **Web client:** React 18, TypeScript, Vite, React Router, TanStack Query and a component system using Radix/shadcn-style dependencies. It contains learner, tutor and admin pages, shared domain helpers and client-side presentation logic.
- **App API and server functions:** Vercel API routes include the voice relay. Supabase Edge Functions provide application services, auth-checked data operations, jobs, public level check endpoints and integrations. There are duplicated/synchronized app and backend copies of some shared app code; a sync script and tests exist to guard this coupling.
- **Backend/data:** Supabase in `ca-central-1` is documented as the production project for Postgres, Auth, object storage and Edge Functions. SQL migrations define schema, access rules, rate limits, booking/payout behavior, idempotency and recent fixes. Entity compatibility code supports app-facing data shapes.
- **Payments:** Stripe is recorded in test mode. Lesson checkout is CAD; Premium subscription billing is USD; Stripe Connect payouts are CAD. Webhooks coordinate subscription, lesson, refund, dispute and payout state.
- **AI and voice:** Plan 10 records a move from an NVIDIA trial key to OpenRouter (OpenAI GPT-6 Luna), Deepgram Nova-3 transcription and Azure Canada Central Canadian French speech. The documents say OpenRouter requests use zero-retention routing and Deepgram requests carry a training opt-out. Those provider settings and actual live account policies require release-time verification.
- **Content:** A local dry-run of the Lesson Bank v1 source found 544 questions and 72 prompts (616 rows) accepted by the importer. Production import/approval/audio state was not independently verified in this phase. Listening assessments play audio; code tests cover transcript privacy.
- **Waitlist:** A static Vercel site and unsubscribe page are separate from the app. Domain movement and the waitlist-to-app cutover are an explicit launch-day operation.

### Repository graph inventory

The full graph index completed successfully: **10,521 nodes and 35,190 edges**, across 583 TypeScript, 32 SQL, 6 HTML, 5 JavaScript, 2 TOML and 1 CSS files. It identifies 49 route nodes and 33 test-file relationships. The two indexed code packages are `parle-app` and `parle-backend`; the repository also contains the waitlist site and extensive product, operational and build history. Note that route parsing includes some false route-like strings, so route-node counts should not be treated as an authoritative endpoint inventory.

## 3. Audit method and limits

The repository was indexed in full with codebase-memory-mcp. Graph architecture, symbol discovery and source snippets were used to locate launch checks, rate limiting, admin route access and Stripe webhook verification. The app/backend package scripts, README and HANDOFF, dated Plan 11–13 records, deferred defect ledger, and launch scripts were reviewed. The codebase index artifact was generated and is committed on the audit branch.

No application code, database, provider, DNS, Vercel, Stripe, Supabase or Resend production settings were changed. No tests were run in this audit turn, consistent with the task's audit scope and the repository's guardrails around founder-operated production steps. Historical test numbers below are reported as repository evidence, not as results from this run. No claims of legal compliance, penetration-test coverage or live uptime are made.

## 4. Findings by priority

Severity reflects launch impact, likelihood and availability of a safe mitigation. Findings marked **Gate** block public launch. A note in a plan is evidence of a recorded status; the underlying external state should still be checked at release time.

### P0 — Public launch blockers

#### P0-1. Production app/domain cutover is incomplete (**Gate**)

**Evidence:** README and HANDOFF say only the waitlist is live at `parle.buzz`; the app is a protected Vercel preview. The Plan 12 launch check describes the Auth site URL, `APP_URL` and domain move as remaining. `launchFindings` checks that Auth `site_url` equals `https://parle.buzz`, the redirect allowlist includes `/reset-password`, `APP_URL` points to `parle.buzz`, `APP_ORIGINS` contains the app origin, required Vercel Production variables exist, and the domain is assigned to `parle-app`.

**Impact:** public traffic could land on the waitlist, while sign-up/reset emails and lesson/Stripe return links point to the preview or fail. A partial cutover can strand account flows or direct customers to the wrong product.

**Required action:** execute the documented launch switch in its intended order after confirming the domain is attached to `parle-app`; verify root and `www` behavior, TLS, Auth sign-up/confirmation/password reset, app callbacks, Stripe return URLs, and email links from an external browser. Save a redacted checklist result, DNS/TLS evidence and deployment SHA. Keep the app private until the complete smoke test passes.

#### P0-2. Stripe production money movement is not enabled/rehearsed (**Gate**)

**Evidence:** repository status says Stripe is test mode only. The founder's business setup and live-mode plan are explicitly pending. Tutor bookings, refunds, Connect onboarding/payouts, chargebacks and subscription entitlement all involve real money or financial status.

**Impact:** activating traffic without verified live products/prices, account verification, webhook endpoints/secrets, payout capabilities, refund procedures, tax/business details and reconciliation can create failed checkout, orphaned bookings, incorrect entitlement or unrecoverable payout issues.

**Required action:** complete business setup; use a separate Stripe live-mode release plan. Confirm products, prices, currencies, tax/display language, Connect countries and capabilities, webhook event coverage, idempotency behavior, refund/dispute handling, payout holds and operator reconciliation. Run controlled low-value end-to-end transactions including cancellation/refund and tutor payout, with evidence and finance owner sign-off. Do not infer live readiness from successful test-mode checks.

#### P0-3. Legal, privacy and commercial launch approval is pending (**Gate**)

**Evidence:** README/HANDOFF explicitly list lawyer review of legal pages and founder business setup before public launch. Plan 10 records updated privacy disclosures for OpenRouter, Deepgram and Azure and a minimum age of 18.

**Impact:** the platform processes learner answers, learning/assessment profiles, voice recordings or transcriptions, tutor information, payment records and possibly sensitive immigration/citizenship goals. Missing or inaccurate disclosures, retention/deletion rules, vendor terms, refunds, tutor terms or age controls can expose the company and users to material risk.

**Required action:** obtain counsel review and founder approval for Terms, Privacy, cookies/tracking, AI/speech processing notice and consent, data retention/deletion, account deletion, tutor terms, cancellation/refund policy, pricing/tax presentation and consumer disclosures. Confirm all vendor DPAs, subprocessors, retention/training settings and data-region implications. Test that under-18 users are rejected by both UI and server-side flows. Keep the product adult-only until confirmed.

### P1 — Must resolve or explicitly accept before public launch

#### P1-1. Release quality evidence is not green or current (**Gate until rerun**)

**Evidence:** latest Plan 13 record says backend 606 pass / 1 skip / 3 weekend-only failures, app 541, and 61 TypeScript errors. Plan 12 separately reports 585 pass / 1 skip / 3 pre-existing weekend-only failures and 61 type errors. A later ledger note describes one backend run with additional timeout/load failures and says only a limited set of files changed before merge. Counts differ as work progressed.

**Impact:** known failures and a nonzero compiler error list make it difficult to distinguish harmless legacy noise from release regressions. Environment-sensitive weekend behavior also affects the learner's first-day experience.

**Required action:** establish one canonical CI/release gate on the exact candidate SHA: backend suite, app suite, typecheck, lint/build, Vercel production build, SQL/migration validation and function type checks. Classify every failure; fix or document/approve exceptions with owner, impact and expiry. Remove weekend nondeterminism or define expected weekend behavior. Attach machine output to the release record. The audit did not rerun these checks.

#### P1-2. Real-device voice/browser coverage is incomplete (**Gate for voice marketing/availability**)

**Evidence:** Plan 9/12 records say iPhone Safari microphone recording and audio playback/autoplay remain for a real-phone founder check; browser emulation could not exercise MediaRecorder. Plan 12 fixed a phone audio-unlock policy issue, but emulator limitations persist.

**Impact:** speaking assessment, tutor voice messages and spoken AI replies are key product capabilities. Permission, autoplay, backgrounding, network interruption and unsupported codec differences can break those flows on the target device even if desktop preview tests pass.

**Required action:** test current iOS Safari and at least one Android browser on real devices: grant/deny/revoke microphone permission; record and submit an answer; transcribe/score; play AI reply; resume after interruption; test listening audio failure/retry/skip; test weak network and tab backgrounding. Capture device/OS/browser and results. Provide a text alternative and clear recovery state. If this gate is not met, disable or qualify voice features at launch.

#### P1-3. Public level-check abuse and privacy load controls need explicit proof

**Evidence:** graph shows a dedicated public level-check service, IP rate-limit helper and rate-limit SQL migration. Public level check is unauthenticated by design and creates run/submission data; listening audio signing is intended to sign only shown questions. The audit did not inspect production rate-limit values or conduct load/abuse tests.

**Impact:** public endpoints are exposed to automated cost, storage/DB exhaustion, repeated AI/audio calls, enumeration or attempts to recover private question mappings. A control existing in code does not establish effective production thresholds or proxy-aware client identity.

**Required action:** inspect the public handlers end-to-end and verify rate-limit enforcement on every expensive path, including retries and audio generation; validate trusted proxy/IP parsing, bounded payloads, request timeouts, challenge/abuse thresholds and cleanup/retention. Confirm responses never return answer keys, hidden mappings or transcripts. Conduct authorized burst/abuse tests with cost and database monitoring before making the check public.

#### P1-4. App TypeScript errors are a release and maintenance risk

**Evidence:** Plans 11–13 repeatedly report 61 app TypeScript errors, described as unchanged. The app package has build/test scripts but no `typecheck` script in the inspected `package.json`; this makes the stated error count's gate and reproducibility unclear.

**Impact:** type errors can conceal real contract drift across shared app/backend code and make future regressions harder to detect. A successful Vite production build does not necessarily fail on every TypeScript semantic error.

**Required action:** identify and publish the exact 61 diagnostics, categorize generated/stale/intentional versus real defects, and add a reproducible release typecheck command. Prefer a zero-error gate; if a documented exception remains, scope it to exact files/diagnostics with owner and removal date.

#### P1-5. Production launch switch is a sensitive multi-system operation

**Evidence:** launch-check gathers Supabase Auth configuration, hashes secret values for comparison and invokes `bunx vercel` to inspect production environment and domain project. Launch-switch is designed to apply only the Supabase changes once domain prerequisites are met; recent plan notes describe prior ordering and secret-redaction fixes.

**Impact:** a false positive, stale CLI context, wrong Vercel scope or partial execution can change customer-facing auth and email behavior. Combining Vercel and Supabase verification in one local script also makes operator identity/context an important control.

**Required action:** run in a clean, documented operator session; verify project/ref/scope before any writes; capture only redacted output; run check before and after switch; require a second-person review of expected values and domain ownership. Keep an immediate rollback procedure for Auth URLs and domain routing. Confirm CLI errors cannot be parsed as valid empty state and all failed subprocess exit codes are surfaced.

#### P1-6. Production migration and rollback evidence should be consolidated

**Evidence:** the handoff records migrations applied in production by the founder, with recent migrations including booking, payouts, admin/waitlist, voice and webhook-claim fixes. It describes local application and historical migration/cutover rehearsals. Founder-run production migrations are an explicit repository rule.

**Impact:** a partially applied or out-of-order migration can disable booking, access policies, payout transitions or webhook deduplication. Some schema changes are not safely reversible by simply rolling back code.

**Required action:** before launch, reconcile migration files against production's migration ledger and actual schema; record exact project ref and SHA; take/verify a restorable backup; rehearse forward repair and app rollback; verify RLS/policies/triggers/functions after migration. Keep execution with the authorized founder as repo policy requires. This report does not authorize production writes.

#### P1-7. Operational monitoring, incident response and support readiness are not evidenced as complete

**Evidence:** source and plans show detailed scripts, audit logging, Stripe webhook handling and admin screens. The reviewed top-level readiness notes focus on cutover and external founder/legal gates; a complete production alerting, on-call, incident and customer-support runbook was not evident in the reviewed evidence.

**Impact:** payment discrepancies, failed email/AI/voice provider calls, account lockout, abusive public endpoints or broken lesson scheduling can persist without timely detection or a clear human owner.

**Required action:** before public launch, name primary/backup incident owners; define service and business alerts for auth, function errors, provider latency/errors, webhook backlog, failed payment/refund/payout, database/storage thresholds and signup conversion. Define support channels, escalation and response targets, status communication, evidence retention and incident rollback. Verify dashboards/alerts with a test event.

### P2 — Important post-gate remediation / controlled-launch risks

#### P2-1. Deferred defects remain and need product owner disposition

The Plan 13 ledger lists R138–R146. Examples include: imported content edge validation omits some readiness/track checks; partial question insertion could occur if prompt insertion fails; malformed JSONL/import CLI errors are not always clear; changed rows can be silently skipped on rerun; a prepared audio collision can be treated as failure; a check-in history count can include skipped audio; public level check can allow skips beyond audio failures; and practice fallback can select an assessment item. Some are described as low-stakes or requiring user-facing fallback; at least the assessment-content crossover and partial import transaction deserve explicit acceptance/fix before broad launch. R137 is the separate Plan 12 prompt-minimum decision.

The Plan 12 ledger lists R132–R136: date-dependent plan-service tests (now deterministic), the wrong late-payment refund email for a replaced hold, payout-send type shape drift, Stripe idempotency edge classification, and missing booking-hold/reply-claim/launch-switch tests. R132 is closed: saved availability is honored, the plan starts on the next available day, Today displays that date, and tests explicitly cover the intended current-week scenarios. R134 is also closed: the payout row type now includes its selected `created_at` field, and all 15 generated Edge Function entry points pass Deno check. R133, R135 and R136 retain the IDs and dispositions in `deferred-defects.md`. Prior plans also identify other accepted defects; every accepted item needs an owner, rationale, user impact, mitigation and revisit date.

#### P2-2. Content validity, assessment integrity and quality controls require ongoing governance

The 616-row bank has passed the recorded app rules and is approved in production. The audit trail also identifies importer validation omissions and content/audio edge cases. For a learning product whose placement result directs a learner's study plan, incorrect answer keys, level/skill tags, duplicate prompts or text/audio mismatches can directly undermine trust.

Maintain a reviewed content release workflow with provenance, reviewer, version, answer-key validation, level/skill coverage, listening audio-to-transcript parity and rollback. Add integrity checks for all records, not merely the current import. Keep assessment items isolated from practice fallback selection.

#### P2-3. Shared app/backend code synchronization increases drift risk

Architecture data indicates substantial cross-boundary dependencies; repository records mention shared copies synchronized into Supabase functions. The `sync-app-code` script and tests are useful controls, but source-of-truth direction and release enforcement should be explicit.

Document canonical ownership, make synchronization deterministic and fail CI when generated copies are stale. Include a drift check in release workflow, especially for auth, billing, public assessment and scoring helpers.

#### P2-4. Webhook idempotency/replay and financial reconciliation need durable operations

Code evidence shows Stripe webhook signature verification tries platform and Connect secrets and separates event destinations. Recent migrations add claim/retake behavior; plans fixed duplicate refunds and late-payment cases. These are good defensive steps, but payment correctness depends on duplicate delivery, delayed/out-of-order events, retries, provider downtime and manual reconciliation.

For controlled launch, verify event deduplication keys and claim expiry, replay behavior, alerting for dead letters, signature rotation procedure, event-to-database reconciliation and idempotent refund/payout transitions against production-like scenarios. Ensure an operator can find and correct a stuck booking without bypassing audit logs.

#### P2-5. Privacy/deletion must cover derived and vendor-held records

The product handles voice, transcripts, AI prompts/replies, assessments, roadmaps, coach notes, messages, bookings, tutor documents, email and payment references. Confirm account deletion and retention semantics cover database rows, object storage (including prepared listening audio and profile uploads), logs/backups, email provider, AI/speech providers and Stripe records. Financial records may require retention; communicate exceptions clearly. The existence of an account deletion test is helpful but does not establish end-to-end vendor deletion.

#### P2-6. Accessibility, localization and learning safety need focused sign-off

The product supports French learners and multiple explanation languages; previous plans report fixes to native-script output and wording. Voice, timed assessment, audio retry/skip, and placement feedback all need keyboard, screen-reader, contrast, reduced-motion and clear-language review. Confirm content does not overstate an AI score as official NCLC/citizenship certification, and label estimates appropriately. Use a qualified reviewer for French-Canadian and other translated critical consent/error/payment copy.

#### P2-7. Performance/cost guardrails should be measured at launch scale

Recorded preview latency for new AI providers was approximately 9–15 seconds for tutor replies and 5 seconds for writing score, with low bake-off spend. These are historical observations, not SLOs. Voice relays, signed audio, AI tokens, audio duration, public placement and image storage can create variable costs and tail latency.

Set per-user and global spend limits, request size/duration bounds, concurrency caps, provider timeout/fallback behavior and cost alerts. Establish p50/p95 latency and error targets from representative usage; test provider outage and exhaustion messaging. Recheck current prices and contract terms before setting launch budgets.

## 5. Positive controls and strengths

- Product, implementation and deployment decisions are documented in the handoff, decision log, plans and close-out records; founder-controlled production steps are explicit.
- The app has been moved to a first-party stack; production provider choices replace an NVIDIA trial key whose terms prohibited production use.
- Server-side admin authorization is represented in a dedicated access helper; database access policies and role/access tests are present in the backend suite inventory.
- Stripe signature verification is implemented for platform and Connect webhook secrets; the repository has dedicated booking, payout, webhook, refund, deletion and idempotency tests.
- A database-backed rate-limit helper exists and is used by multiple functions; migrations and tests cover rate limiting.
- Secret hygiene is a stated repository rule. The launch check compares secret digests rather than printing the values, and recent notes record a fix to redact Vercel bypass tokens from navigation errors.
- Migration and cutover scripts, production checks, local rehearsal reports and a launch-switch guard provide operational scaffolding.
- Listening assessments are designed to play prepared audio rather than expose transcripts; signed audio work was narrowed to shown items, and transcript leakage in feedback was explicitly addressed.
- Account deletion, audit logs, waitlist unsubscribe, payment state transitions and public assessment each have dedicated code/tests or documented plans.
- The codebase has broad test coverage by file count and strong historical regression practices, including failing tests first for recently discovered defects.

These are meaningful strengths, but they do not remove the need for current release evidence or external approval gates.

## 6. Launch plan and acceptance criteria

### Stage A — Freeze and baseline

1. Select the exact release commit and record its SHA, branch, build artifact and dependency lock state.
2. Run canonical backend/app suites, typecheck, lint, app production build, Vercel function build, database/migration checks and function type checks in CI.
3. Keep R132 closed with date-independent coverage; rerun the backend suite in a stable clean environment to resolve the one full-suite failure and two isolated-file runtime failures. App source typecheck is now green. Engineering owns the remaining 279 ESLint errors / 22 warnings; clear all errors before public launch, prioritizing the top files in the execution plan, with no blanket rule disablement.
4. Reconcile deferred defect IDs R132–R146 and prior open issues into one owner/status/acceptance register.

**Exit:** all required gates green, or exceptions signed by the founder and technical owner; no unexplained failures.

### Stage B — Data, security and service proof

1. Verify production bank counts/status, assessment coverage, listening audio availability and transcript privacy with read-only checks.
2. Reconcile production migrations/schema/access policies and confirm backup restoration evidence.
3. Verify server-side role enforcement, RLS and storage permissions with learner/tutor/admin/anonymous identities; inspect public endpoints and rate limits.
4. Complete authorized abuse, payload-boundary and outage exercises on preview/staging. Confirm alerting and operator response.
5. Run real-device iOS Safari and Android voice checks, plus keyboard/screen-reader critical flows.

**Exit:** security/privacy/quality owner signs off; no sensitive answer/transcript, unauthorized row or object exposure; required platform devices succeed or affected feature is gated off.

### Stage C — Commercial/legal/vendor readiness

1. Complete business setup and Stripe live account onboarding; verify products, prices, currencies, taxes, Connect country support, payout timing and webhook configuration.
2. Complete legal review of all public terms/privacy/refund/tutor/AI/speech materials and consent requirements.
3. Reconfirm AI/speech vendor accounts, zero-retention/training settings, data location, subprocessors, DPA/terms and cost limits.
4. Document support, refund, cancellation, dispute and account-deletion operations.

**Exit:** founder and counsel approve commercial/privacy posture; finance owner approves live payment/payout process.

### Stage D — Cutover rehearsal and controlled release

1. Rehearse the domain/Auth/APP_URL/APP_ORIGINS/production variables cutover against the launch checklist; verify branch/project/scope.
2. Complete backups and a rollback rehearsal; require a second operator to review expected values.
3. On launch day, move domain and Auth settings in the documented order, run launch check, deploy the approved SHA, then validate TLS, signup/password reset, critical learner/tutor/admin routes, email, AI, audio, booking, payment, cancellation/refund, webhook and support contact.
4. Start with an internal/controlled cohort and low traffic. Watch business and technical alerts continuously. Expand only after the defined observation period and no critical incidents.

**Exit:** signed go/no-go checklist, known rollback owner, successful smoke test and acceptable monitoring evidence.

## 7. Suggested release checklist

- [ ] Candidate SHA is frozen and reproducibly built.
- [ ] Backend/app tests, typecheck, lint and build gates pass; all deviations have owner and approval.
- [ ] R132–R146 and all older deferred items are dispositioned.
- [ ] Production Supabase project/ref, migrations, RLS/storage access and restore path verified.
- [ ] Production Lesson Bank status/counts and listening audio verified; assessment items isolated from practice.
- [ ] AI/speech keys and provider settings verified without logging secret values; spend limits/alerts set.
- [ ] iOS Safari and Android recording/playback flows completed on actual devices.
- [ ] Terms, privacy, cookie, AI/speech, refund, tutor and age restrictions approved by counsel/founder.
- [ ] Stripe live account, products/prices, Connect, webhook secrets/events, refund and payout rehearsal approved.
- [ ] Alerting, support channel, incident ownership, response and rollback plan ready.
- [ ] Vercel production variables, domain ownership, TLS, redirect and waitlist behavior confirmed.
- [ ] Supabase Auth site URL, callback/redirects, `APP_URL` and `APP_ORIGINS` point to the final app origin.
- [ ] Launch check passes before and after cutover; its output is redacted and stored with release record.
- [ ] External signup, confirmation/reset emails, onboarding, placement, roadmap, AI, listening/speaking, booking, cancellation/refund, subscription and tutor payout smoke tests pass.
- [ ] Founder signs go/no-go; controlled rollout and observation schedule are set.

## 8. Evidence register and key repository locations

- Architecture and product statement: `README.md`, `HANDOFF.md`, `02_Product/specs/00_master-spec.md`.
- Latest work/release notes: `06_Build/export-decoupling/plans/2026-10-17-plan-12-review-minors-launch-readiness.md`, `2026-10-17-plan-12-report.md`, `2026-10-17-plan-13-report.md`, `migration/close-out-report.md`.
- Deferred issues and accepted decisions: `06_Build/export-decoupling/deferred-defects.md`, `10_Decisions-Meetings/DECISIONS.md`, `06_Build/export-decoupling/specs/SPEC-BACKLOG.md`.
- Cutover gate: `07_Engineering/parle-backend/scripts/prod/launch-check.ts` and `launch-switch.ts`.
- Payment, account and backend behavior: `07_Engineering/parle-backend/supabase/functions/`, `supabase/migrations/`, and `tests/`.
- Frontend/application behavior: `07_Engineering/parle-app/src/`, `functions/`, `api/`, `package.json`.
- Explicit evidence gaps: no live settings/DNS values were inspected; no tests were run in this audit; no independent security, legal or accessibility assessment was performed.

## 9. Final conclusion

Parle demonstrates high implementation maturity for a founder-led, controlled preview: broad feature delivery, deliberate provider migration, migration history, a large test inventory, and careful fixes for concrete booking, payout, webhook and audio defects. The dominant launch risk is currently operational and governance closure, not a lack of product direction: public cutover, live payments, legal approval, a clean current release baseline and real-device voice validation remain necessary. Keep public launch blocked until all P0s and applicable P1 gates have named owners and evidence. Then use a controlled cohort and expand gradually with payment, privacy, support and reliability monitoring active.

## 10. Gap-closure execution plan

This plan translates the findings above into ordered work. Repository changes and evidence updates are appropriate for this branch. Production-only actions remain with the founder or authorized operator, including live migrations, production secrets/settings, DNS/domain changes, live Stripe transactions, legal sign-off and public deployment. Any item that needs one of those actions must be prepared here with exact steps and evidence requirements, then marked **external action pending** until the authorized owner completes it.

### Phase 1 — Baseline and ownership

**Work:** freeze a candidate SHA; set the launch scope; create a single issue register for P0/P1 findings and deferred items R132–R146 plus earlier open items; assign owners, severity, due date, disposition and evidence; preserve founder-only production controls.

**Exit:** candidate and scope recorded; every known issue has an owner and disposition; no release activity targets an unrecorded commit.

### Phase 2 — Quality gate

**Work:** run the backend and app test suites, typecheck, lint, production build, function checks and migration validation on the frozen candidate; fix the three weekend-only failures and define weekend first-day behavior; review all 61 recorded app type diagnostics; create a repeatable typecheck release command; reconcile failures against current code. The current app typecheck excludes test/spec files and uses ES2022 library types; app tests remain separately covered by Bun.

**Exit:** required checks pass on the candidate SHA or every exception is narrow, documented and approved, with no unexplained failure.

### Phase 3 — Content and assessment integrity

**Work:** verify the production bank counts/status, assessment coverage and listening audio; strengthen import validation and atomicity; improve malformed-input and rerun reporting; isolate assessment items from practice fallback; fix skipped-audio history and concurrent-audio edge cases; bound public assessment skips/retries; verify no transcript, answer key or private mapping can leak; record content provenance and reviewer approval.

**Exit:** production read-only evidence matches the intended bank; imports are safe to retry; assessment privacy and content separation are verified.

### Phase 4 — Security, privacy and data handling

**Work:** validate anonymous/learner/tutor/admin access across database, storage, server functions and admin routes; prove limits on public/expensive endpoints and run authorized abuse checks; audit deletion/retention across vendors and storage; confirm server-side age restriction; verify vendor retention/training/data-location settings and agreements; complete counsel review of privacy, terms, cookies, AI/speech, consent, refunds, tutor terms and deletion disclosures.

**Exit:** security/privacy evidence and counsel/founder approvals are recorded; no unresolved high-risk access or disclosure issue.

### Phase 5 — Payments and financial operations

**Work:** prepare live Stripe products, prices, currencies, Connect eligibility, webhooks and refund/payout operations; rehearse controlled live purchase, cancellation/refund, dispute/chargeback and tutor payout; verify event idempotency and reconciliation; define a finance owner and daily controlled-launch review.

**Exit:** business setup is complete and finance/founder approve the live money workflow. The agent must not independently change production settings or move funds.

### Phase 6 — Real-device voice and accessibility

**Work:** use real iOS Safari and Android devices to verify microphone permission, recording, upload, scoring, speech playback, background/resume, retries and provider/network failures; review keyboard, screen-reader, contrast, focus and reduced-motion behavior; review critical French-Canadian and translated copy; make certification limitations clear.

**Exit:** device/accessibility evidence is recorded; unsupported voice paths are disabled or gated with a usable recovery path.

### Phase 7 — Operations and cutover rehearsal

**Work:** name incident owners and support channels; configure and test production alerts; reconcile migrations/schema and restoration evidence; rehearse application/domain/Auth/environment cutover and rollback; verify project/scope, TLS, redirects, email links and final-domain flows; store redacted launch-check evidence.

**Exit:** cutover and rollback rehearsal succeed; alerts reach owners; founder confirms all production state changes.

### Phase 8 — Controlled release

**Work:** hold a formal go/no-go against the frozen SHA; start with internal or invited users; monitor technical, financial, support and provider-cost signals; expand only after the agreed observation period; retain rollback owner throughout.

**Exit:** founder approves each increase in access based on recorded evidence and no unresolved critical incident.

### Cross-phase documentation requirements

After every phase, update this audit report's execution log, the project handoff, and the appropriate plan/close-out record. Update the deferred defect register whenever an issue is fixed, accepted, or reclassified. Record changed files, commit SHA, commands/checks actually run and outcomes, external actions still pending, and any deployment requirement. Do not claim a phase complete without its exit evidence.

### Execution log

| Phase | Status | Evidence / remaining work |
|---|---|---|
| 1 — Baseline and ownership | Complete | Branch `codex-branch` tracks `origin/codex-branch`. Ordered plan and issue register created; README, HANDOFF, backlog, close-out and deferred-defect ledger aligned. Clarified R137 (Plan 12 prompt minimum) and R138–R146 (Plan 13 findings); no duplicate ID exists in the detailed ledger. |
| 2 — Quality gate | Complete with open lint gate | At Phase 2: backend 610 pass / 1 skip / 0 fail across 103 files; app 541/541; Node app/API typechecks 0; Deno 15/15; migration history had 33 versions. Phase 3 results supersede suite totals. ESLint remains red at 279 errors/22 warnings across 61 files; Engineering owns cleanup and public launch remains blocked. No production changes or deployment. |
| 3 — Content and assessment integrity | Engineering controls complete; production evidence pending | Backend 617 pass / 1 skip / 0 fail; app 544/544; Node app/API typechecks 0; Deno 15/15. Local source-bank dry-run: 544 questions + 72 prompts, 616 new, no rule problems. Migration 000034 locally validated for atomic rollback and anon denial; local DB now has 34 versions. Production import/audio/status, human content review and blind audit are not verified. Deployment is required before production import/use; none performed. |
| 4 — Security, privacy and data handling | Engineering review complete; external evidence pending | OWASP A01–A10 source review; local auth/account-deletion/photo/rate-limit/public-assessment tests 52/52. No Critical/High issue confirmed in reviewed paths. Dependency advisory scan was network-blocked. Production RLS/proxy/provider/backup/alert evidence and counsel disposition remain open. |
| 5 — Payments and financial operations | Engineering evidence complete; live-money gate pending | Added `specs/STRIPE_LIVE_READINESS.md`; fixed Connect idempotency classification and added regressions. Backend 622 pass / 1 skip / 1 full-suite timing failure; isolated AI tests 15/15; Deno 15/15. No live settings or money movement. Deploy `parle-payout-service` after owner review to deliver code changes; live setup/rehearsal remain founder/finance actions. |
| 6 — Real-device voice and accessibility | Desk review recorded; device gate pending | Added `specs/DEVICE_ACCESSIBILITY_READINESS.md`; source review found global visible focus and reduced-motion rules; focused voice/listening tests 47/47 across 9 files; app/API typecheck passed. Local Vite started, but no browser was available through CUA; no real devices, assistive technology or contrast scanner were available. No WCAG conformance claim. Device matrix and specialist review remain required; docs only, no deployment needed. |
| 7 — Operations and cutover rehearsal | External action pending | Production domain, Auth, provider settings and final smoke test require authorized operator. |
| 8 — Controlled release | Blocked by preceding gates | No public launch is implied or authorized by this report. |

## Phase 3 engineering closeout — 2026-10-17

**Importer and database:** tightened question and prompt readiness checks, required prompt `track: all`, validate full JSONL source before writes, provide file/line parse errors and an explicit missing-`--bank` error, detect duplicate and changed existing rows, and leave changed existing content untouched. New migration `20261017000034_atomic_lesson_bank_import.sql` adds a service-role-only atomic RPC. Local Docker/Postgres checks proved malformed rows are rejected before insert, anonymous execution is denied, and a deliberately invalid prompt causes the preceding question insert to roll back. Local schema history is at version 34; this migration has not been applied remotely.

**Content and learner flow:** source bank dry-run covered 544 questions and 72 prompts (616 new rows, zero importer rule problems); its cell distribution matches the recorded quality report. This verifies format/readiness only. It does not verify production rows/audio, the meaning of `reviewed_by`, independent human review of all items, the blind audit or the B2 review. The handoff says founder-approved, but quality notes say 199 A1/A2 items only passed automated gates. Treat content approval as a separate owner evidence gate. Practice no longer falls back to assessment bank rows when AI generation fails; it returns unavailable. Check-in listening history excludes skipped items. Audio claim handling polls briefly and ends in a bounded 409 if still running; listening script normalization now produces consistent cache hashes. Public listening placement retains at most three unscored skips per section. Public-level-check bank source now uses the shared parser.

**Verification:** full backend suite 617 passed, 1 opt-in skip, 0 failed (2,308 expectations, 103 files); full app suite 544 passed, 0 failed; app and API TypeScript checks returned 0 diagnostics; Deno checked all 15 function entry points. ESLint: 279 errors / 22 warnings across 61 files. Elevated local Vite production build passed (2,724 modules; 2m53s) with outdated Browserslist data, a >500 kB main JS chunk, an ineffective dynamic import warning and Vite `__dirname` config warning. No remote database, provider, DNS, Vercel, Stripe, deployment, production import or production content switch was touched.

**Deployment requirement:** yes, before using the atomic importer in production. Founder/authorized operator must deploy migration 000034 and the matching app/functions in a controlled release, reconcile remote schema, then run read-only production evidence and separately authorize any content import/audio preparation/switch. Public release remains NO-GO due to lint and owner/device/legal/operations gates.

## Phase 4 security, privacy and data handling review — 2026-10-17

**Scope and evidence:** reviewed backend request wrapper, bearer-token identity resolution, service-role database access helper, account/profile and deletion paths, public assessment handler and scoring parser, rate-limit SQL/guard, storage policies, app security headers, and server-side `fetch()` call sites. The codebase graph was refreshed after Phase 3. Targeted Docker-backed auth/account-deletion/photo/rate-limit/public-assessment tests passed **52/52 across six files (165 expectations)**. The first sandboxed attempt could not access Docker and produced misleading failures; the final elevated local-Docker run passed. Hardened `tests/account-service.test.ts` so its email-confirmation test checks that the database mutation succeeded before asserting authorization behavior.

### OWASP Top 10 coverage

| Category | Result | Evidence and limits |
|---|---|---|
| A01 Broken access control | **No source-level issue found in reviewed flows** | `getCaller` validates bearer tokens, confirmed email, paused status and server `app_metadata` roles (`supabase/functions/_shared/caller.ts:11-19`); `ownedTable` scopes reads/updates to the caller and overwrites ownership fields on insert (`_shared/db.ts:14-49`). Owner/profile/photo and account-delete tests passed. Handler-by-handler authorization coverage is broad but not an independent penetration test; production RLS/policy state remains unqueried. |
| A02 Cryptographic failures | **No code issue found; deployment proof open** | Application auth is delegated to Supabase; sensitive operations use server-side service credentials. Profile photo storage is explicitly public for viewing while writes/deletes are owner-folder scoped (`migrations/20261015000001_storage_profile_photos.sql:1-8`). Private listening audio is signed for shown public-check questions. Production encryption, key rotation, backups and provider retention settings were not inspected. |
| A03 Injection | **No source-level issue found in reviewed paths** | User data operations use Supabase query builders; public level-check body is capped at 32 KB and parsed/allowlisted (`supabase/functions/_app/functions/parle-public-level-check.ts:100-194`). Import uses a strict row allowlist and a service-role RPC. No dynamic SQL using caller-controlled query fragments was identified in the reviewed paths. |
| A04 Insecure design | **Controls present; production abuse proof open** | Public level check limits starts to 10/hour and scores to 30/hour per gateway-derived IP, with an additional global start ceiling of 1,000/hour (`_shared/guards.ts:20-28`); tests prove forwarded-address spoof attempts do not gain a new allowance. Input schema fixes question count/identifier lengths and rejects extra keys; public runs expire and daily cleanup is scheduled (`migrations/20261016000012_jobs.sql`). Authorized burst/cost/load behavior in production is not tested. |
| A05 Security misconfiguration | **Positive app headers; platform settings unverified** | Vercel config sets CSP, frame denial, `nosniff`, referrer policy and a microphone-only permission policy (`parle-app/vercel.json:7-12`). CORS for the public assessment reflects the requesting origin but does not return credential permission; that endpoint is intentionally public. Supabase/Vercel production config and custom-domain TLS settings require operator confirmation. |
| A06 Vulnerable components | **Confirmed dependency advisories; remediation and clean scan remain open** | An app dependency scan returned 44 advisory entries across 15 packages (26 high, 15 moderate, 3 low); the backend graph returned no advisories. Subsequent `bun audit --json` retries returned `ConnectionRefused`, so a final post-upgrade machine scan could not be captured. The app now resolves `react-router-dom@7.18.4`, which is beyond the v7.18.0 patch for [GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6). The current lock still contains confirmed affected versions: `brace-expansion@1.1.11` and `2.0.1` ([GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7)), `glob@10.4.5` ([GHSA-5j98-mcp5-4vw2](https://github.com/advisories/GHSA-5j98-mcp5-4vw2)), `minimatch@9.0.5` ([GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74)), `picomatch@2.3.1` ([GHSA-c2c7-rcm5-vvqj](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj)), `flatted@3.3.1` ([GHSA-rf6f-7fwh-wjgh](https://github.com/advisories/GHSA-rf6f-7fwh-wjgh)), and nested `cross-spawn@7.0.3` ([GHSA-3xgq-45jj-v275](https://github.com/advisories/ghsa-3xgq-45jj-v275)). Patched releases are available, but scoped overrides could not be materialized with the repository's Bun 1.3.10/legacy binary-lock workflow; these are hard release gates until a clean lockfile is generated and audited. |
| A07 Identification/authentication failures | **No source-level issue found in reviewed auth flows** | Auth requires confirmed email; server account setup requires `age_confirmed === true` and stores `age_confirmed_at` in private identity data (`parle-account-service/index.ts`, `ensure_identity` branch). Auth, unverified signup, password reset and deletion-password rate-limit tests passed. The age control is self-attestation; it does not establish actual age. Counsel/product must accept this design or require another check. |
| A08 Software/data integrity | **Controls present; CI/deployment proof open** | Stripe webhook signature and idempotency protections are represented in code/tests; migration history and imports have explicit validation. Branch protection, build provenance, dependency review automation and production deploy authorization settings were not inspected. |
| A09 Logging/monitoring | **No sensitive payload logging observed in reviewed path; operations evidence open** | Public level-check handler logs only error class/name and explicitly excludes bodies, run IDs, mappings and scores (`_app/functions/parle-public-level-check.ts:189-193`); shared wrapper logs exception name/message with generic client responses (`_shared/serve.ts:12-27`). Alert delivery, retention, access to provider logs and named incident ownership require operations/provider evidence. |
| A10 Server-side request forgery | **No user-controlled fetch sink found in reviewed server code** | Graph-augmented search found four `fetch()` call sites across backend/app server function/API paths, in Superdev/email integrations and the fixed backend relay; none was identified as fetching a learner/tutor supplied URL. This is static path coverage only; new fetch call sites must be reviewed as they are added. |

### Phase 4 residual actions

- Resolve the confirmed app dependency versions above (or update their dependency parents), regenerate the lockfile with the supported Bun version, and attach clean `bun audit --json` results for app and backend. Do not interpret the blocked final scan as a pass.
- Verify production proxy behavior overwrites/trusts `cf-connecting-ip` (and the fallback forwarding chain), actual rate-limit rows/settings, gateway request-size limits, and alerting. Current tests use the local Supabase gateway only.
- Reconcile deployed RLS/storage policies and production backups/restoration; confirm retention/deletion across storage, backups, Supabase logs, Resend, OpenRouter, Deepgram, Azure and Stripe with the providers and counsel. The account-delete path removes or anonymizes application records and owned media, but cannot prove downstream processor or backup erasure.
- Obtain counsel/product disposition for self-attested 18+ onboarding, AI/speech data disclosure/consent, retention and deletion exceptions. Real-user legal/age compliance is not cleared by source tests.

**Disposition:** no confirmed Critical/High vulnerability surfaced in the reviewed application source paths. The dependency graph does contain confirmed advisories and remains a launch blocker. This conclusion is limited to static review plus local tests; independent penetration/abuse testing and production access/storage/provider settings remain unverified. Phase 4 engineering review is complete; its dependency and external evidence criteria remain pending. No production configuration or data was read or changed.
