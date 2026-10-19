# Parle Comprehensive Codebase, Launch, and Pre-Launch Audit

**Assessment date:** 2026-10-19 (updated through Phase 43; original audit findings dated 2026-10-17)
**Repository:** `D:\AgentDevWork\repos\Parle`  
**Indexed project:** `D-AgentDevWork-repos-Parle`  
**Scope:** product and codebase understanding, architecture, application and backend readiness, security and privacy, data and migrations, payments, AI and voice providers, content, quality, accessibility, operations, deployment, compliance, and launch sequencing.  
**Evidence basis:** repository source/configuration, dated plans/decisions/close-out records, refreshed codebase-memory graph (10,808 nodes / 33,621 edges), local checks and GitHub Actions evidence recorded below. This remains a repository and local-environment audit; it is not an independent live penetration test, legal opinion, provider-console inspection, production migration rehearsal, or real-device test.

## 1. Executive assessment

### Overall disposition: **NO-GO for public launch; GO for controlled private preview and pre-launch closeout**

Parle is a substantial French learning and tutoring platform for adults. Its product flow combines goal selection, placement, an adaptive roadmap and weekly plan, AI tutoring and practice, speech input and output, vetted human tutors, booking and payment, subscriptions, and administration. The code has moved off the original builder platform onto a stack the team controls: React/Vite on Vercel, Supabase Auth/Postgres/Storage/Edge Functions, Stripe, Resend, OpenRouter, Deepgram and Azure Speech. The project has unusually strong written implementation history: staged plans, migration rehearsals, decision records, tests, operational scripts, and a deferred-defect register.

The evidence does not support turning on public access yet. The app remains a protected Vercel preview and Stripe is recorded in test mode. The domain/Auth cutover, founder business setup, Stripe live-mode activation, counsel review, real-device checks and final production deployment remain owner gates. Phase 3 closed the identified importer/assessment code gaps, and Phase 5 adds the Stripe live-readiness specification plus regression coverage for idempotency, independent booking holds, reply-claim release, and launch-switch settings. Earlier completed full CI run [39177703919](https://github.com/Thatisshayan/Parle/actions/runs/39177703919) on `320f130` passed all three jobs: app tests/types/lint/build, generated-source sync and all 15 Deno entry points, and full disposable-Supabase backend integration (640 tests across 105 files, including the Phase 39 oversized-unsubscribe regression). Latest completed full CI run [39180293455](https://github.com/Thatisshayan/Parle/actions/runs/39180293455) on `19b0bdd` passed all three jobs: backend 645 pass / 1 authorized skip / 0 fail across 646 tests and 106 files, app tests/types/lint/build, generated-source sync and all 15 Deno checks; all five Phase 40 handler integration cases passed. Phase 39's oversized request was also verified against the local disposable Edge Runtime, which returned 413. Earlier run [39176076803](https://github.com/Thatisshayan/Parle/actions/runs/39176076803) on `cb81cb6` had an initial backend timeout and passed after rerunning the failed job; that historical timeout remains recorded. Phase 36 code run [39174068000](https://github.com/Thatisshayan/Parle/actions/runs/39174068000) on `7a87a66` also passed all jobs. Phase 34 run [39173108388](https://github.com/Thatisshayan/Parle/actions/runs/39173108388) was cancelled when its successor commit was pushed. Phase 35 run [39173457025](https://github.com/Thatisshayan/Parle/actions/runs/39173457025) passed all three jobs. Phase 30 reproduced the intermittent R59 500 as PostgreSQL `deadlock detected`; Phase 31 migration 000036 serializes holds per tutor, and the 30-pair regression passed locally and in CI. The remaining backend skip is the real Plan 1 paying-account migration/set-password rehearsal, which needs authorized real-account/export evidence. Provider spend/latency/error thresholds remain proposals; dollar caps, owner approval, alerts and preview load/cost evidence remain open. Lint has 0 errors/18 Fast Refresh export advisories. Deterministic synthetic fixtures cover migration/demo/compatibility cases, and a local Stripe API stub exercises checkout and unknown-subscription webhook handling without external Stripe requests. AI completion timeout configuration is capped at 60 seconds with regression coverage. A local source-bank dry-run validated 544 questions and 72 prompts with zero import-rule problems; local migration 000034 was tested against Docker Postgres, including rollback and anon denial. These are not production evidence or independent item-by-item content review. Phase 32's fresh scan still finds one unpatched dev-only High `braces@3.0.3` advisory; a clean app scan is not claimed. Phase 33's bounded static continuation reported zero new confirmed findings in selected paths. Phase 37 Deep Scan f3010427-bb37-4210-85c7-2c7531f87a38 returned zero validated findings on revision 94a06ee, but its detailed manifest also explicitly says the 1,011-file repository was not reviewed line by line and lists app source, app server functions, other APIs, most backend functions, migrations, waitlist, CI/configuration and other files as unreviewed. The top-level coverage completeness flag conflicts with those explicit limitations; this audit treats coverage as partial. Deployed/provider controls remain unverified. Phases 34–36 reduce logged exception detail in shared backend, app server, and browser console catch paths; focused tests, sync tests and all 15 local Deno checks pass. Provider/platform logs and deployed configuration remain unverified. Local typecheck and lint pass; the local production build is blocked before bundling by SWC rejecting cache-directory ownership, GitHub Actions passes the production build, so the cache issue is local to this workstation. A real iPhone Safari microphone/playback check remains outstanding.

**Phase 41 engineering update:** the Vercel voice relay now caps streamed audio uploads at 2,400,000 bytes and JSON action bodies at 8,192 bytes before buffering/parsing. CI [39181566071](https://github.com/Thatisshayan/Parle/actions/runs/39181566071) on `947273e` passed all three jobs: app 551/551 tests across 62 files, backend 645 passed / 1 authorized skip / 0 failed across 646 tests and 106 files, generated-source sync, all 15 Deno checks, app/API typechecks, lint and production build. Both request-cap regressions passed. A reviewed Vercel app release is required to change production behavior.

**Phase 42 evidence update (CI verified):** a Phase 40 test described as per-address throttling actually exercised the per-email cap and varied addresses between calls. The test now names the per-email behavior accurately; a new integration regression sends 20 distinct emails from one fixed `cf-connecting-ip` address and requires the 21st to be rejected. GitHub Actions run [39182982378](https://github.com/Thatisshayan/Parle/actions/runs/39182982378) on `8b874f7` passed all three jobs; the disposable-Supabase suite reports 646 pass / 1 authorized skip / 0 fail across 647 tests and 106 files. The first attempt exposed that the test gateway's Cloudflare address takes precedence over `x-forwarded-for`; the follow-up sets the trusted header directly. This proves the configured 20/hour code path in CI, while production proxy/IP-header validation and aggregate-cap runtime evidence remain open.

**Phase 43 evidence update (CI verified):** added a route-level integration regression that sets the current-hour aggregate limiter key to its 1,000-request threshold, submits a valid signup from a unique source address, verifies HTTP 429 and no inserted row, then restores the prior aggregate counter (or deletes the seeded row). GitHub Actions [39183881876](https://github.com/Thatisshayan/Parle/actions/runs/39183881876) on `62d5d42` passed all three jobs; backend integration reports 647 pass / 1 authorized skip / 0 fail across 648 tests and 106 files. The test leaves the shared limiter state as it found it. Production gateway/IP behavior and authorized burst/cost testing remain open.

**Recommendation:** keep the production app private. Continue closing engineering findings in the order in the execution plan, then close P0/P1 owner evidence gates, rerun the full required verification on the exact release commit, review actual production provider/domain settings without disclosing their values, complete a controlled live-mode payment/payout rehearsal, and obtain explicit go/no-go from the founder. Promote public traffic only after the checklist has evidence attached.

### Snapshot

| Area | Assessment | Basis |
|---|---|---|
| Product definition | Strong | Clear adult-only French learning proposition and phase-one scope across learner, tutor and admin workflows. |
| Architecture | Sound for an initial controlled launch | App/backend split with server functions and provider adapters; single product stack and Canadian-region Supabase documented. |
| Core feature implementation | Broad, substantial | Repository records show end-to-end preview checks for onboarding, placement, AI, practice, marketplace, booking, test payments, payouts, admin, waitlist and voice. |
| Security design | Positive controls present; production proof incomplete | Server-side admin authorization, RLS/access rules, rate limiting, signed webhooks, secret hygiene and audit logging are represented in code and tests. No independent security test was run. |
| Release readiness | **Not ready** | App remains private preview; production domain/auth cutover and Stripe live mode are pending. |
| Quality gates | **Phase 31 full CI green; public launch remains NO-GO** | Run [39170462275](https://github.com/Thatisshayan/Parle/actions/runs/39170462275) on `d05f32b` passes all three jobs. Backend: 638 pass / 1 skip / 0 fail (2,480 expectations; 639 tests/105 files); app tests/types/lint/build and generated-source/Deno checks pass. The sole skip is the real Plan 1 paying-account rehearsal. R59 root cause was reproduced as PostgreSQL `deadlock detected` in run 39169643303 and addressed by migration 000036; the 30-pair regression passes locally and in full CI. A reviewed backend migration/function deployment is required before production behavior changes. |
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
| 6 — Real-device voice and accessibility | Desk review recorded; device gate pending | Added `specs/DEVICE_ACCESSIBILITY_READINESS.md`; source review found global visible focus and reduced-motion rules; focused voice/listening tests 47/47 across 9 files; app/API typecheck passed. Latest Docker Vite dev server started, but CUA reports no browser surfaces and `iab` is unavailable; no system browser, real devices, assistive technology or contrast scanner are available. No DOM/UI assertion or WCAG conformance claim. Device matrix and specialist review remain required; docs only, no deployment needed. |
| 7 — Operations and cutover rehearsal | Read-only rehearsal complete; operational gates open | Added `specs/OPS_CUTOVER_READINESS.md`. Production launch check and switch dry-run exited 0 without changing state; found Auth site URL still preview, APP_URL mismatch and `parle.buzz` still on `parle-waitlist`. Required Vercel variable names/APP_ORIGINS/reset redirect are present by script checks. Production migration comparison blocked (not linked); backup restore, alert delivery, named owners and rollback rehearsal unverified. No production deployment; cutover remains NOT CLEARED. |
| 8 — Controlled release | NO-GO recorded; release SHA not selected | `specs/CONTROLLED_RELEASE_GO_NO_GO.md` lists current blocking evidence, owner actions, future cohort signals and stop conditions. Reviewed HEAD was `30126ce`; last app/backend code commit was `3a980d5`; a new exact release SHA must be frozen and rechecked after closing blockers. No cohort or deployment occurred. |

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
| A06 Vulnerable components | **Mostly remediated; one unpatched dev-tool advisory remains open** | Registry-backed Bun 1.3.10 scan found 33 matches (20 high, 10 moderate, 3 low) across 11 app packages; the backend lock had none. The app binary lock was migrated to text and resolved with checksum-verified Bun 1.4.3 plus version-scoped overrides. Current safe versions include `@babel/runtime@7.26.10`, `brace-expansion@1.1.21`/`2.1.7`, `cross-spawn@7.0.6`, `flatted@3.4.2`, `glob@10.5.0`, `lodash@4.18.0`, `minimatch@9.0.7`, `picomatch@2.3.2`, `postcss-selector-parser@7.1.6`, and `yaml@2.8.3`; React Router remains patched at 7.18.4. Current app scan reports only `braces@3.0.3`, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) (High); the advisory lists no patched release. Bun's `why` trace shows it is development-only through Tailwind's glob scanner. The checked-in Tailwind patterns are static and developer-authored, so no learner/tutor input reaches that glob parser. This does not remove build/CI availability risk or make the scan clean; security-owner disposition remains a prelaunch gate. |
| A07 Identification/authentication failures | **No source-level issue found in reviewed auth flows** | Auth requires confirmed email; server account setup requires `age_confirmed === true` and stores `age_confirmed_at` in private identity data (`parle-account-service/index.ts`, `ensure_identity` branch). Auth, unverified signup, password reset and deletion-password rate-limit tests passed. The age control is self-attestation; it does not establish actual age. Counsel/product must accept this design or require another check. |
| A08 Software/data integrity | **Controls present; CI/deployment proof open** | Stripe webhook signature and idempotency protections are represented in code/tests; migration history and imports have explicit validation. Branch protection, build provenance, dependency review automation and production deploy authorization settings were not inspected. |
| A09 Logging/monitoring | **No sensitive payload logging observed in reviewed path; operations evidence open** | Public level-check handler logs only error class/name and explicitly excludes bodies, run IDs, mappings and scores (`_app/functions/parle-public-level-check.ts:189-193`); shared wrapper logs exception name/message with generic client responses (`_shared/serve.ts:12-27`). Alert delivery, retention, access to provider logs and named incident ownership require operations/provider evidence. |
| A10 Server-side request forgery | **No user-controlled fetch sink found in reviewed server code** | Graph-augmented search found four `fetch()` call sites across backend/app server function/API paths, in Superdev/email integrations and the fixed backend relay; none was identified as fetching a learner/tutor supplied URL. This is static path coverage only; new fetch call sites must be reviewed as they are added. |

### Phase 4 residual actions

- Preserve current registry-backed scan output and resolve `braces@3.0.3` when an upstream patch exists, or obtain documented security-owner acceptance of the dev-only/static-pattern exposure before launch. The backend scan is clean; the app scan is not clean. Do not interpret the absence of a patched release as a clean pass.
- Verify production proxy behavior overwrites/trusts `cf-connecting-ip` (and the fallback forwarding chain), actual rate-limit rows/settings, gateway request-size limits, and alerting. Current tests use the local Supabase gateway only.
- Reconcile deployed RLS/storage policies and production backups/restoration; confirm retention/deletion across storage, backups, Supabase logs, Resend, OpenRouter, Deepgram, Azure and Stripe with the providers and counsel. The account-delete path removes or anonymizes application records and owned media, but cannot prove downstream processor or backup erasure.
- Obtain counsel/product disposition for self-attested 18+ onboarding, AI/speech data disclosure/consent, retention and deletion exceptions. Real-user legal/age compliance is not cleared by source tests.

**Disposition:** no confirmed Critical/High vulnerability surfaced in the reviewed application source paths. The dependency graph does contain confirmed advisories and remains a launch blocker. This conclusion is limited to static review plus local tests; independent penetration/abuse testing and production access/storage/provider settings remain unverified. Phase 4 engineering review is complete; its dependency and external evidence criteria remain pending. No production configuration or data was read or changed.

## Phase 9 lint and correctness remediation — 2026-10-18 (engineering complete; release SHA verification pending)

**Lint remediation:** the baseline was 279 errors / 22 warnings. Actual ESLint was run through `node node_modules/eslint/bin/eslint.js .` because the PowerShell-facing Bun shim could not execute; current result is **0 errors / 21 warnings**. The lint-error gate is clear; warnings remain for separate cleanup. This update replaced unsafe test fixture `any` types with `unknown`, tightened service/provider types, and removed two unnecessary regex escapes. No blanket rule suppression was introduced; automatic control-character regex fixes were annotated narrowly where those characters are deliberately stripped or rejected.

**Correctness fix found during cleanup:** the entity adapter's `update(id, row, filters)` signature silently ignored `filters` and updated by ID alone. Learner-plan claim updates therefore lacked the intended compare-and-set guard under concurrent workers. Added `updateWhere` that applies equality and null filters (`IS NULL`) to the update and returns no row when the claim was lost. Added regression coverage for filter application, lost-claim behavior and database errors. This is a local code fix; the generated `_app` copies were synchronized and all 15 Edge Function entry points pass Deno check.

**Verification:** app/API TypeScript checks pass with zero diagnostics. Full app suite passes **547/547 across 62 files** (29 expectations). Full backend suite passes **623/1 skip/0 fail across 104 files** (2,331 expectations) from the prior checkpoint; current admin/marketplace/placement backend tests pass **25/25 across 3 files** (120 expectations). Focused entity/learner-plan/billing tests passed 21/21; the first full app run surfaced a CRLF-sensitive source assertion, which was normalized and then passed in the 547-test rerun. Deno checked all 15 function entry points in this checkpoint. The host Vite command remains blocked before compilation because SWC rejects its cache ACL/owner. A current Linux Docker build using Bun 1.4.3 succeeded: 2,726 modules in 3.51s. It emitted the Vite `__dirname` warning, a 2.38 MB JS chunk warning, and an ineffective dynamic-import warning; this is current build evidence. App/API TypeScript checks pass with zero diagnostics. Codebase-memory MCP was unavailable (`Transport closed`) during this update; local source search was used. No production configuration/data was accessed or changed.

**Status and rollout:** engineering lint/correctness remediation is complete. The release gate remains open until canonical backend/app, dependency, build, migration and function checks are rerun on a frozen release SHA and broader launch gates close. Deployment required for this batch: **yes for the reviewed preview release**; it changes application/backend code and generated Edge Function sources. No immediate deployment was performed. No deployment or production mutation occurred. Public launch remains NO-GO.

## Phase 10 dependency advisory remediation — 2026-10-18 (engineering complete; security disposition pending)

**Baseline and changes:** A fresh registry-backed scan with Bun 1.3.10 found **33 app advisory matches** (20 high, 10 moderate, 3 low) across 11 packages; the backend graph returned no findings. The legacy `bun.lockb` could not materialize version-scoped overrides with Bun 1.3.10. The app lockfile was migrated to Bun's current text format and the dependency tree was resolved using checksum-verified Bun 1.4.3. Scoped overrides now resolve `@babel/runtime@7.26.10`, `brace-expansion@1.1.21` and `2.1.7`, `cross-spawn@7.0.6`, `flatted@3.4.2`, `glob@10.5.0`, `lodash@4.18.0`, `minimatch@9.0.7`, `picomatch@2.3.2`, `postcss-selector-parser@7.1.6`, and `yaml@2.8.3`. The registry scan now reports **one** remaining finding: `braces@3.0.3`, GHSA-vfj7-8cjw-p6xm (High). The advisory currently lists no patched release. The dependency is dev-only and reaches the app through Tailwind CSS 3's `fast-glob`/`micromatch` and `chokidar` trees. The checked-in Tailwind config uses only static developer-authored globs; there is no user-controlled pattern path in the app. This lowers product runtime exposure but does not produce a clean dependency scan or remove CI/build availability risk. Keep the finding open for security-owner disposition; do not describe the scan as clean.

**Verification:** with the resolved tree installed, the full app suite passes **547/547 across 62 files**, app/API typechecks pass, and ESLint reports **0 errors / 21 warnings**. Tailwind's standalone CSS CLI rebuild passes. The host Vite command remains blocked by the Windows SWC cache ACL/owner check, but the current full production Vite build passes in a disposable Linux Docker container (2,726 modules; 3.51s) with `__dirname`, >500 kB bundle, and ineffective dynamic-import warnings. Backend full tests are unchanged from the preceding checkpoint; the current registry scan of its lockfile returns no findings. Codebase-memory MCP indexing remains unavailable (`Transport closed`); package-manager dependency tracing (`bun pm why braces`) confirms the remaining dev-only path.

**Status and rollout:** Phase 10 engineering remediation is **COMPLETE WITH AN OPEN RELEASE GATE**: one high-severity upstream advisory has no patched release and requires security-owner disposition before the release gate is accepted. Dependency updates are developer-tool/build inputs and do not need immediate deployment; include them in the next reviewed preview release after security-owner disposition and code review. Docker production build validation has passed. No deployment or production mutation occurred. Public launch remains NO-GO.


## Phase 11 operations preflight hardening — 2026-10-18 (engineering complete; operator rehearsal pending)

**Finding and fix:** gatherLaunchState() previously ignored the Vercel CLI subprocess exit code and parsed concatenated stdout/stderr as configuration output. If Vercel CLI authentication or execution failed, the preflight could report variables/domain as missing instead of surfacing an execution failure. Added an explicit exit-code guard. On failure it throws only the command and exit code; captured stderr/stdout (which may contain sensitive details) are not included. Successful output parsing remains unchanged.

**Verification:** regression coverage confirms a nonzero Vercel command fails closed and its stderr is not exposed. The launch-check/launch-switch test file passes **5/5 tests (22 expectations)** using Bun 1.4.3 in Docker. No live provider call, setting mutation, DNS change, deployment or production operation was performed. Codebase-memory MCP indexing again returned `Transport closed`; source inspection used the documented fallback.

**Status and rollout:** this engineering guard is complete, but AUD-P1-06 remains open pending authorized operator-context validation, domain/Auth rollback rehearsal and cutover evidence. Deployment required: **no** for this local preflight hardening. Public launch remains NO-GO.

## Phase 12 local browser verification attempt — UI evidence unavailable

Started the current app using Bun 1.4.3 in a disposable Docker container with the source mounted read-only. Vite reported ready on port 8080. CUA's surface inventory returned no apps or browsers, and attempting to create an in-app browser returned `Browser is not available: iab`. The repo has no Playwright/Puppeteer dependency and no system Chrome/Edge/Chromium/Firefox executable was found. The disposable container and node_modules volume were stopped and removed. This proves local dev-server startup only; it does not prove page rendering, navigation, accessibility, authenticated flows, mobile layout, voice capture/playback or WCAG conformance. Keep AUD-P1-03 and AUD-P2-06 open for browser/device/specialist evidence. No deployment or product change occurred.

## Phase 13 generated-source ownership and drift correction — engineering complete

The `tests/app-code-sync.test.ts` gate failed on two stale generated outputs, revealing canonical app changes had not been copied into the backend tree. Regenerated all 35 files from `parle-app` source. The exact ownership map, update procedure, generator responsibilities and review gates are now documented in `specs/GENERATED_SOURCE_OWNERSHIP.md` and linked from both codebase READMEs. The drift test now passes **3/3 (74 expectations)**; Deno checks pass **15/15** entry points. No canonical app logic changed in this phase; deployed Edge Functions have not been updated. The repository has no checked-in `.github/workflows` CI pipeline, so automatic enforcement is not established; require these checks in the release process until CI is added. Deployment is required before this generated runtime change reaches production, through a reviewed preview/release; none performed.

## Phase 14 current branch quality checkpoint — app gates pass; release remains NO-GO

Current app tests pass **547/547 across 62 files**; app/API TypeScript checks return zero diagnostics; ESLint exits cleanly with **0 errors / 21 warnings**. The generated-source drift test passes 3/3 (74 expectations), and Deno checks pass all 15 Edge Function entry points on the latest generated tree. App checks ran with Bun 1.4.3 in Docker against read-only source. The last full backend integration run is 623 pass / 1 skip / 0 fail from the preceding checkpoint; it was not rerun in this container setup. The full Vite production build passes in Docker as recorded in Phase 10 (2,726 modules; 3.51s; bundle/config warnings). Current registry refresh returned ConnectionRefused; last successful app scan found one unpatched dev-only High `braces@3.0.3` advisory. The verified code snapshot was `6206fcf` before this evidence-only documentation commit. No deployment or production mutation occurred. AUD-P1-01 remains partial until the full backend suite runs on the final release SHA and remaining advisory/external launch gates are dispositioned.

## Phase 15 CI quality gates — complete for safe automated checks

Added `.github/workflows/quality.yml`, triggered on pull requests and pushes to `main` and `codex-branch`. It pins Bun 1.4.3 and runs frozen installs, app test/typecheck/lint/build gates, backend generated-source and launch-preflight tests, and Deno checks for all 15 Edge Function entry points. GitHub Actions run [39100441733](https://github.com/Thatisshayan/Parle/actions/runs/39100441733) passed the original two jobs. Phase 16 adds a third job that runs the full backend integration suite against a disposable Supabase stack on a GitHub-hosted runner, so its cutover-clean test cannot affect local or production data. Initial run [39100696710](https://github.com/Thatisshayan/Parle/actions/runs/39100696710) failed before starting Supabase because CLI 2.84.2 rejected the repo's `db.orioledb_version` and `[local_smtp]` settings. The workflow uses Supabase CLI 2.121.0 and Bun 1.4.3, installs both dependency trees, and starts a disposable Supabase stack. After correcting runner setup and making fixture prerequisites explicit, GitHub Actions run [39102306852](https://github.com/Thatisshayan/Parle/actions/runs/39102306852) passed all three jobs. The backend suite reports 504 pass / 121 skip / 0 fail, 1,940 expectations across 625 tests/104 files. Skips require private demo/Plan 1 exports or test-mode Stripe API configuration. Fixture directories can be configured with `PARLE_MIGRATION_SPIKE_DIR` and `PARLE_MIGRATION_BUNDLE_PATH`; the data is not committed. AUD-P2-04 remains closed. AUD-P1-01 remains partial until fixture-backed checks run with authorized inputs on a frozen release SHA. No production mutation occurred.

## Phase 17 sanitized fixture coverage — CI green; external rehearsals open

The integration suite previously skipped 121 cases when private demo/migration exports were unavailable. Added deterministic, synthetic, repository-generated inputs for demo questions/prompts/settings, learner tasks, usage rows, and compatibility filter cases. `bun run test` creates these under an ignored test directory before executing Bun tests. The fixtures use synthetic identifiers and `.example.test` addresses, are not tracked, and do not read the private migration export directory unless the developer explicitly sets the existing override. The first expanded run exposed a synthetic owner mapping mismatch (the row creator email did not match the synthetic person); the fixture was corrected and the passing run confirms owner mapping and transform behavior.

GitHub Actions run [39103832233](https://github.com/Thatisshayan/Parle/actions/runs/39103832233) on `a71eb69` passed app tests/typecheck/lint/build, disposable Supabase integration, generated-source sync, launch-preflight checks and all Deno entry-point checks. Backend result: **622 pass / 3 skip / 0 fail**, **2,328 expectations**, **625 tests across 104 files**. Remaining skips: the real Plan 1 paying-account migration/set-password rehearsal, the unknown-subscription Stripe webhook case, and the Stripe checkout sandbox case. Those require a real authorized export/account or Stripe API inputs; no private fixture or production data was introduced. AUD-P1-01 is improved but remains partial pending disposition or local test-double coverage for Stripe, real migration rehearsal, dependency advisory disposition, and a final frozen-SHA run. No deployment or production mutation occurred.

## Phase 18 local Stripe stub — complete; real-account rehearsal open

To remove the two credential-only CI skips, added a local Stripe HTTP stub with a synthetic test key and responses for customer search, customer creation, subscription checkout and missing subscriptions. The backend Edge Functions use the optional test API host only when the configured key starts with `sk_test_`; absent those variables, the SDK keeps its default endpoint. CI starts and stops the stub as part of the disposable integration job. The first run showed that the webhook path was covered but checkout also needs customer search/create; those routes were added. No requests from this CI path go to Stripe.

GitHub Actions run [39104955489](https://github.com/Thatisshayan/Parle/actions/runs/39104955489) on commit `0dc26f7` passes all three jobs. Backend result: **624 pass / 1 skip / 0 fail**, **2,334 expectations**, **625 tests across 104 files**. The unknown-subscription webhook and sandbox checkout tests ran and passed against the stub. The sole skip is the real Plan 1 paying-account migration/set-password rehearsal, which requires an authorized real export/account. AUD-P1-01 remains partial pending that real-account rehearsal or an explicit owner disposition, final frozen-SHA verification, and remaining dependency/security and external launch gates. No deployment, live Stripe API request or production mutation occurred.

## Phase 19 bounded public level-check request body — code and local CI verified; production abuse proof open

The public level-check handler had a 32,000-character check after reading the entire body. Its rate-limit guard parsed a clone before the handler, so the cap did not bound the earlier parsing allocation. Added a streaming byte reader and `serveWithLimitedBody` middleware that reads the original request before guards clone/parse it. It counts UTF-8 bytes, rejects a trustworthy over-limit `Content-Length` before reading, cancels an unknown-length stream as soon as it exceeds the cap, and returns 413 with `REQUEST_TOO_LARGE`. The original handler retains its own length check as defense in depth. Unit tests cover multibyte UTF-8 and streamed cancellation; the disposable Supabase integration test confirms an oversized request receives 413. The first integration attempt exposed that awaiting cancellation of a declared oversized upload can stall Deno; that path now returns immediately, and the follow-up run passes.

GitHub Actions run [39105996735](https://github.com/Thatisshayan/Parle/actions/runs/39105996735) on commit `b64beac` passes all three jobs. Backend result: **627 pass / 1 skip / 0 fail**, **2,340 expectations**, **628 tests across 104 files**. All 15 function Deno checks pass. This closes the source-side body allocation gap for this public endpoint. AUD-P1-04 remains partial because production proxy/IP header behavior, live rate-limit configuration, authorized burst/cost load proof and monitoring/alert response have not been tested. Deploy the hardened function in a reviewed release before enabling public traffic; no deployment or production mutation occurred in this phase.

## Phase 20 AI completion timeout ceiling — CI PASSED; PROVIDER/OPERATIONS BUDGETS OPEN

`AI_TIMEOUT_FAST_MS` and `AI_TIMEOUT_STANDARD_MS` previously accepted arbitrarily large positive values. Added a hard 60,000 ms ceiling to each complete-operation budget, preserving at least 90 seconds within the documented 150-second Edge Function execution window for request processing and cleanup. Default budgets remain 40 s (fast) and 45 s (standard); non-finite/non-positive values continue to use defaults. A regression test covers oversized and invalid configuration. This ceiling limits duration only: it does not set provider dollar limits or concurrency caps and does not establish measured p50/p95 latency/error objectives or alert delivery.

GitHub Actions run [39106649007](https://github.com/Thatisshayan/Parle/actions/runs/39106649007) on commit `77abe7a` passes all three jobs. Backend: **628 pass / 1 skip / 0 fail**, **2,342 expectations**, **629 tests across 104 files**. The remaining skip is the real Plan 1 account rehearsal. App tests/types/lint/build, generated-source sync, launch-preflight regression and all 15 Deno checks pass. P2-07 remains partial pending owner-approved provider spend/concurrency limits, representative latency/error objectives, confirmation of deployed values and a tested alert path. The code change requires deployment before production functions receive this guard; no deployment or production mutation occurred in this phase.

## Phase 21 app effect dependency cleanup — CI PASSED

Resolved three `react-hooks/exhaustive-deps` warnings. `AdminAccountPanel` now memoizes its account loader by `userId`; `AdminQuestionBankRepair` memoizes its bank loader and declares it as the initialization effect dependency. The tutor session opening effect now calls the latest allowance updater through a ref, preserving the intended route/retry-only reopen behavior while avoiding a stale callback dependency. GitHub Actions run [39107382673](https://github.com/Thatisshayan/Parle/actions/runs/39107382673) on `1cfb30a` passes all three jobs: app tests/typechecks/lint/build, generated-source sync/launch-preflight and all 15 Deno checks, plus backend **628 pass / 1 skip / 0 fail** (2,342 expectations; 629 tests/104 files). ESLint reports **0 errors / 18 warnings**, all Fast Refresh export advisories on shared component/page modules. No production mutation occurred. No deployment required for this app-only code change; none performed.

## Phase 22 R133 replacement-specific late-refund email — REGRESSION PASSED; FULL BACKEND RUN FOUND R59 FAILURE

The late-payment path already refunds a hold that R127 expired after the learner selected an overlapping alternative. When that hold was eventually paid, `confirm.ts` always used the general `time_taken` email reason. It now maps the persisted `cancelled_by: learner` marker to `learner_replaced`, leaving Stripe refund reason/idempotency, accounting and booking outcome unchanged. In run [39108219158](https://github.com/Thatisshayan/Parle/actions/runs/39108219158), the new integration regression passed and verified the misleading “booked by someone else” copy was absent. The full backend suite had one unrelated R59 concurrent-booking failure (628 pass / 1 skip / 1 fail; 2,343 expectations; 630 tests/104 files); app and static backend/Deno jobs passed. Product/content owner approval of this factual proposed wording remains required. A reviewed backend deploy is required to change production behavior; none occurred.

## Phase 23 bounded request-body rejection stability — BODY FIX VERIFIED; INTERMITTENT R59 TRACKED IN PHASE 24

Run [39108763453](https://github.com/Thatisshayan/Parle/actions/runs/39108763453) timed out on the public level-check oversized-body integration test. Investigation found that the `Content-Length > cap` fast path returned 413 without consuming or canceling the HTTP request stream, which can leave local Edge Runtime requests hanging. Removed the header-only fast rejection: all bodies now pass through the bounded reader, which cancels immediately after observed bytes exceed the cap. The unit cancellation regression and the full public oversized-body integration test pass in runs [39109303469](https://github.com/Thatisshayan/Parle/actions/runs/39109303469) and [39110207289](https://github.com/Thatisshayan/Parle/actions/runs/39110207289). R59 intermittently returned one 200 and one generic 500 in three runs after passing once; see Phase 24. The body-cap code fix is verified. Latest full CI passes, while the intermittent R59 finding and other launch gates remain open.

## Phase 24 R59 concurrent booking failure — REOPENED; ROOT CAUSE UNKNOWN

Runs [39108219158](https://github.com/Thatisshayan/Parle/actions/runs/39108219158), [39109303469](https://github.com/Thatisshayan/Parle/actions/runs/39109303469) and [39110207289](https://github.com/Thatisshayan/Parle/actions/runs/39110207289) failed R59 with one HTTP 500 (`REQUEST_FAILED`) and one HTTP 200 for two simultaneous booking requests from the same learner. Run [39111505944](https://github.com/Thatisshayan/Parle/actions/runs/39111505944) passed R59; its full backend run failed separately on the oversized-body integration timeout. Ten-race tests in runs [39112619049](https://github.com/Thatisshayan/Parle/actions/runs/39112619049) and [39114130341](https://github.com/Thatisshayan/Parle/actions/runs/39114130341), plus two backend-only job reruns, pass: 40 simultaneous booking pairs across four backend executions, zero failures at the time of Phase 24. Phase 26 adds one further full workflow and one backend-only rerun. Full backend: 630 pass / 1 skip / 0 fail (2,376 expectations; 631 tests/104 files). To make a future failure diagnosable, local CI sets `PARLE_TEST_DIAGNOSTICS=1` only with the Stripe test stub; the R59 request must also include `x-parle-test-diagnostic: ci-r59` before a 500 response includes its exception details. These latest passes do not establish the cause or prove the intermittent fault fixed, so R59 remains open. No deployment or production mutation occurred.

## Phase 25 R59 test-only diagnostics and expanded race sample — GREEN; INTERMITTENT ISSUE OPEN

Commit `e6ed619` adds a test-only diagnostic to `parle-lesson-service`: the internal exception is included in the 500 body only when the local CI environment explicitly sets `PARLE_TEST_DIAGNOSTICS=1` alongside the Stripe test stub and the request includes the R59-only marker header. Production responses remain generic. Commit `d4d1a2f` raises the R59 regression from three to ten independent same-learner concurrent booking pairs per run, using fresh learners to avoid rate/hold limits. Runs [39112619049](https://github.com/Thatisshayan/Parle/actions/runs/39112619049) and [39114130341](https://github.com/Thatisshayan/Parle/actions/runs/39114130341) pass all CI jobs: backend 630 pass / 1 skip / 0 fail, 2,376 expectations, 631 tests/104 files; the R59 case completes in about 10 seconds. Two additional backend-only reruns on the same code SHA also pass all ten pairs (40/40 total across four executions). Earlier R59 failures were in runs 39108219158, 39109303469 and 39110207289; run 39111505944 passed R59 but failed the oversized-body integration test. No failure has occurred with the gated diagnostic enabled, so root cause remains unknown and R59 stays open. No production deploy or mutation occurred.


## Phase 26 R59 repeat validation on current documentation SHA — GREEN; ROOT CAUSE OPEN

Run [39115532867, attempt 1](https://github.com/Thatisshayan/Parle/actions/runs/39115532867/attempts/1) passes all three jobs on commit `6a50648`. Backend-only attempt 2 also passes all three job records, with backend 630 pass / 1 skip / 0 fail (2,376 expectations; 631 tests/104 files). The ten-pair R59 regression passed in 10.6 seconds and emitted no failure diagnostic. Across successful full runs 39112619049, 39114130341 and 39114707037 (attempt 1), plus three backend-only reruns, the expanded regression now has 60 successful simultaneous pairs. The diagnostic remains gated to the local Stripe-stub test environment and marker header. R59 remains open because the prior intermittent 500 has not been reproduced or explained. Migration 000024’s `lesson_hold` catches an exclusion violation and returns null; this inspection narrows one conflict path but does not identify the source of the historical `REQUEST_FAILED`. No deployment or production mutation occurred.


## Phase 27 Provider spend, concurrency and alert thresholds — UPDATED IN PHASE 28


Added `06_Build/export-decoupling/specs/AI_PROVIDER_BUDGET_READINESS.md` with proposed per-provider US$50 monthly launch caps, 50%/80% spend alerts, initial text/speech concurrency ceilings, latency/error targets, anomaly triggers, owner roles and a verification checklist. These remain proposals requiring founder/finance/operations acceptance; provider dashboards and alert delivery were not accessed. Phase 28 implements an atomic cross-instance lease limiter and targeted database-backed regression tests; dollar-level enforcement, accepted budgets, preview load verification and alert delivery remain open. Public release remains NO-GO. No provider or production settings were changed.

## Phase 28 Distributed provider concurrency and bounded cancellation — FULL CI GREEN; OWNER/DEPLOYMENT GATES OPEN

Added migration `20261017000035_provider_concurrency.sql` with service-role-only, RLS-protected provider lease storage and atomic acquisition/release RPCs. AI provider work uses per-role leases (default maximum 5) and paid Deepgram/Azure speech calls use separate configurable limits (default maximum 2 each); leases expire after 90 seconds, release in `finally`, and provider-full or capacity errors fail closed. The Vercel voice relay is the only caller permitted to acquire/release speech leases. Fake/test providers do not consume production leases. Environment variables may lower or raise concurrency within the validated 1–20 bound; these are concurrency controls, not dollar budgets.

Run 39117187291 failed only at the public oversized-body integration case after the request source's `reader.cancel()` promise stalled beyond 30 seconds; the app and generated-source/Deno jobs passed. The bounded reader now initiates cancellation without awaiting a source-controlled promise. A regression test uses a deliberately never-settling cancellation promise. Local focused backend checks pass **48/48 tests, 128 expectations**, including the public level-check integration, speech lease authorization, atomic lease capacity/expiry/release, AI timeout/abort behavior, rate limits and oversized-body handling. App voice tests pass **30/30**; app/API TypeScript typecheck completed without diagnostics; Deno checks pass **15/15**. Full CI run [39168540577](https://github.com/Thatisshayan/Parle/actions/runs/39168540577) on commit `23e4823` passes all three jobs: backend **638 pass / 1 skip / 0 fail** (2,400 expectations; 639 tests/105 files), app tests/types/lint/production build pass, and generated-source sync plus all 15 Deno checks pass. The R59 ten-race regression passes again; the cumulative recent sample is 70 passing concurrent pairs across seven executions, but the historical intermittent failure remains unexplained. No production deployment or provider setting change occurred.

P2-07 is now **partially implemented**: atomic engineering concurrency enforcement is present in code and the Phase 28 commit passes full CI, but provider dashboard dollar caps, alert rules and delivery test, owner approval of thresholds, representative load/cost measurements, and deployed production values remain unverified. Migration 000035, backend Edge Functions and the app voice relay must be included in a reviewed release before the production limiter is active. The earlier Phase 27 proposal remains subject to owner approval. The separate Phase 23 oversized-body issue is fixed and its integration regression passes in full CI; production proxy behavior and authorized abuse/load verification remain open.

## Phase 29 R59 evidence reconciliation and local revalidation — HISTORY CORRECTED; ROOT CAUSE OPEN

Review of the underlying GitHub Actions logs corrected an attribution error in earlier report text: runs 39108219158, 39109303469 and 39110207289 failed the R59 concurrent-booking test; run 39111505944 passed R59 and instead failed the public oversized-body integration test after a 30-second cancellation timeout. The latter is fixed in Phase 28 and passes in run 39168540577. This correction affects the incident timeline only; it does not change the R59 finding.

Ran `bun test tests/fn-lesson-booking.test.ts` against the local Docker Supabase stack: **19 pass / 0 fail**, 91 expectations. Its ten-pair concurrent R59 test passed in 10.3 seconds and emitted no diagnostic. The cumulative recent R59 sample is now 80 passing concurrent pairs (70 in seven full CI executions and 10 in one isolated local run). The three historical 500 responses remain unexplained; no diagnostic has captured an exception during the newer successful runs, so R59 stays open. No code or production setting changed in this evidence phase.

## Phase 30 Expanded R59 regression sample — ROOT CAUSE REPRODUCED

The ten-pair R59 test repeatedly passed but did not capture a cause for the three historical 500 responses. Increased the same-learner concurrent request loop to 30 independently seeded slot pairs in `fn-lesson-booking.test.ts`; the existing 90-second timeout remains adequate. Run [39169643303](https://github.com/Thatisshayan/Parle/actions/runs/39169643303) on `166618a` failed the backend job with one R59 response 200 and one 500. The gated diagnostic captured PostgreSQL `deadlock detected`, establishing the root cause. App tests/types/lint/build and generated-source/Deno jobs passed. The previous 110-pair clean sample did not rule out this intermittent database deadlock.

## Phase 31 Serialize concurrent lesson holds — FULL CI GREEN

Migration `20261017000036_serialize_lesson_holds.sql` replaces `public.lesson_hold` with the same hold behavior plus a transaction-scoped advisory lock keyed by tutor, taken before expired-hold cleanup and insertion. This serializes the critical section for a tutor and retains the GiST exclusion constraint as the final overlap guard. Local Docker Supabase booking integration suite passes **19/19 tests, 171 expectations**; the 30-pair R59 test passes in 32.9 seconds. Full CI [39170462275](https://github.com/Thatisshayan/Parle/actions/runs/39170462275) on `d05f32b` passes all jobs; backend 638 pass / 1 skip / 0 fail (2,480 expectations; 639 tests/105 files), app tests/types/lint/build pass, generated-source sync and Deno checks pass. Migration 000036 applied in the disposable CI Supabase database. No production deployment or mutation occurred. A reviewed backend migration/function release is required before this fix affects production; R59 is code-fixed and verified but remains awaiting deployment evidence.

## Phase 32 Fresh dependency scan and reachability review — SCAN CONFIRMED; BRANCH CI GREEN

Ran `bun audit --json` for both dependency graphs using Bun 1.4.3 in the existing Docker image at checkout `f28615e`. The app reports one High advisory: [`GHSA-vfj7-8cjw-p6xm`](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), `braces@3.0.3` (affected versions `<=3.0.3`, CWE-674); the backend returns `{}`. Run [39171370366](https://github.com/Thatisshayan/Parle/actions/runs/39171370366) on branch SHA `7abe4d2` then passes all three jobs: backend 638 pass / 1 skip / 0 fail (2,480 expectations; 639 tests/105 files), app tests/types/lint/build and generated-source/Deno checks. The app result is an open finding, not a clean scan. The advisory describes stack exhaustion from deeply nested brace patterns and currently lists no patched release. Repository inspection shows the package is a transitive Tailwind CSS 3 development dependency; the checked-in Tailwind content globs are static and developer-authored, and no learner/tutor-controlled glob pattern path was found. This lowers product runtime reachability but does not remove build/CI availability risk. Security-owner disposition is still required before public launch. No dependencies, production settings or remote state were changed.

## Phase 33 Bounded static security continuation — COMPLETED WITH PARTIAL COVERAGE

Codex Security Standard scan `d8fce14a-df70-407d-b1b2-f8fde17f6cb8` reviewed exact repository revision `c173e130ea71fb995dff9fdbb33ca926d487eae0`. It recorded zero new confirmed findings in selected source paths. Source notes examined the voice route and bearer-token gate, Stripe webhook signature verification and lesson payment-event handling, account-deletion ordering/anonymization, streamed request byte cap and rate-limit helper, and production launch-preflight checks. The scan generated a threat model and saved source-review notes in its scan workspace; the scope and limits are summarized here and in the execution plan.

This was a bounded continuation of the earlier Phase 4 source review, not a full line-by-line review of all 1,011 inventoried files. Delegated review workers were prohibited by session policy, and this account had no Daybreak access. No runtime penetration test, production/provider account access, credential use, or deployed-configuration inspection occurred. The scan does not close the known `braces@3.0.3` GHSA-vfj7-8cjw-p6xm High build/CI availability risk, which still needs security-owner disposition, nor the RLS/grants, proxy trust, provider retention, monitoring, backup and recovery evidence listed as open gates. No new source vulnerability was confirmed; security status is not clean. Latest full branch CI [39172055868](https://github.com/Thatisshayan/Parle/actions/runs/39172055868) on `c173e13` passed all jobs. Documentation/evidence only; deployment required: **no**. Public release remains NO-GO.

## Phase 34 Minimize server exception logging — CODE/TEST COMPLETE; CI CANCELLED BY SUCCESSOR PUSH

The shared Edge Function wrapper logged arbitrary exception messages even though it returned a generic client response. Lesson checkout and scheduled booking jobs did the same. Database/provider exception text may include request-specific or personal details, so the three paths now log a stable event label, the known job step where applicable, and the error class only. The shared-wrapper regression throws a deliberately sensitive message and confirms it is absent from captured logs while retaining the 500 `INTERNAL` response and CORS behavior.

Local focused test: `tests/cors.test.ts` — **1 pass / 0 fail, 6 expectations**, using local Bun 1.3.10. Local `deno check --no-lock supabase/functions/*/index.ts` — **15/15 entry points pass**. Phase 34 CI [39173108388](https://github.com/Thatisshayan/Parle/actions/runs/39173108388) was cancelled by the successor push; Phase 35 and 36 results are recorded below. No production deployment or log access occurred. A reviewed backend release is required for the logging change to take effect in production. This hardens these three paths but does not claim every application, provider, database, or infrastructure log was exhaustively reviewed. Public release remains NO-GO.

## Phase 35 Broaden exception-log minimization — CODE/LOCAL CHECKS COMPLETE; FULL CI PASSED

The Phase 34 search found more server-side sites that wrote full exception messages or error objects to logs. Across canonical backend Edge Function entry points/shared helpers and canonical app server functions, Phase 35 replaced 38 remaining backend raw-message sites and 15 app server-function error-object sites with error class or stable `database_error` labels, preserving safe action, event and job labels. The 35 generated app-to-Edge source files were refreshed from canonical app code and not edited manually.

Local checks: app-source sync tests — **3/3, 74 expectations**; all 15 Edge Function `deno check` entry points pass; the Phase 34 generic-wrapper sensitive-message regression passes **1/1, 6 expectations**. Phase 34 CI [39173108388](https://github.com/Thatisshayan/Parle/actions/runs/39173108388) was cancelled by the subsequent push. Phase 35 CI [39173457025](https://github.com/Thatisshayan/Parle/actions/runs/39173457025) passed app tests/types/lint/build, generated-source sync, launch preflight, all Deno entry points, and the full disposable-Supabase backend integration suite. This does not cover browser-console payload logging or logs owned by Vercel, Supabase infrastructure, Stripe, email or AI/speech providers. No production deployment occurred; a reviewed backend release is required for production effect. Public release remains NO-GO.


## Phase 36 Minimize caught exception details in browser console — CODE/LOCAL CHECKS COMPLETE; FULL CI PASSED

Replaced caught Error object arguments with their error class (or unknown) in 102 browser-console logging calls across 33 canonical app UI/source files; the generated Edge copy for learner-plan.ts was refreshed. User-visible error handling and messages were not changed. Local app suite: 549 passed, 0 failed across 62 files; TypeScript app/API checks passed; ESLint completed with the existing Fast Refresh advisories and no errors. Local production build did not reach bundling: SWC rejected the available cache directory ownership/DACL. GitHub Actions run 39174068000 passed the production build, so the cache issue is local to this workstation. The disposable backend integration job also passed. git diff --check passes. No production deployment occurred. This phase does not cover Vercel, Supabase infrastructure, Stripe, email, AI/speech provider, database, or other platform-owned logs, and does not establish deployed logging configuration. Public launch remains NO-GO.


## Phase 37 Repository-wide security scan — ZERO VALIDATED FINDINGS; COVERAGE PARTIAL

Codex Security Deep Scan f3010427-bb37-4210-85c7-2c7531f87a38 ran against checked-out revision 94a06eed0df342568bc81a68a1e31f21831f6a25 on 2026-10-18. Four independent Standard reviews produced zero validated reportable findings. The sealed manifest lists 19 reviewed security-relevant files, including package/lockfile/Tailwind configuration, selected payment/voice/admin/rate-limit/account-deletion code, shared service wrappers and the quality workflow. It also explicitly says the whole repository was not reviewed line by line and identifies app source beyond selected pages, app server functions, other APIs/plugins, most Edge Functions, migrations, waitlist code, remaining CI/configuration and other repository files as unreviewed. Its top-level coverage object says complete while the detailed manifest limitations say partial; this audit follows the specific limitations and does not call security clean. The credential-pattern check covered 1,010 visible files, excluded .git, node_modules, .cache, dist and build, and searched common private-key/token formats only. No production systems, credentials, external providers, destructive tests, runtime execution or network access were used. Reportable findings: zero validated in the reviewed scope; security/source coverage remains partial and production configuration remains unverified. GitHub Actions run [39176076803](https://github.com/Thatisshayan/Parle/actions/runs/39176076803) on unchanged code revision `cb81cb6` passed all three pipeline jobs after rerunning the failed backend job; the oversized-body test passed in 4.68 ms on retry. No deployment required; no production change. Public launch remains NO-GO.

## Phase 38 — Targeted placement-service security review

Reviewed the placement service dispatcher and state handlers, placement-run migration, and backend integration tests using the codebase-memory graph plus source review. The authenticated caller is established before dispatch. Run reads require both the supplied run ID and the caller's owner ID, and open status. RLS is enabled with direct anon/authenticated access revoked; a partial unique index limits each user to one open run. Browser question data is allowlisted, listening transcripts are removed, and answers are accepted only from the options served for the current question. Finishing claims the open run before result creation, with integration tests for cross-user refusal, question/answer redaction, browser bank denial, retake gating, and one-result concurrent finish.

No new reportable security candidate was identified in this area. Evidence receipt: `placement-service-review.md` in the standalone Codex Security artifact collection. This review covers one bounded service surface; the unreviewed areas named in Phase 37 remain open and the overall security review is still partial. No production access or mutation. Deployment required: **no**. Public release remains NO-GO.

## Phase 39 — Bound public waitlist unsubscribe request bodies — CI VERIFIED; DEPLOYMENT PENDING

**Finding PARLE-SEC-39-01 — Medium availability risk (CWE-400):** the public, unauthenticated waitlist unsubscribe handler called `req.text()` for non-JSON requests before applying token validation or rate limiting. The later 1,000-character token check did not bound request-body allocation. An attacker could send a large form body containing the one-click marker and make Edge Function memory use scale with the body. Supabase documents a 256 MB Edge Function memory limit; the project's deployed ingress limits were not inspected ([Supabase Edge Function limits](https://supabase.com/docs/guides/functions/limits)).

The handler now uses the existing streaming `serveWithLimitedBody` wrapper with a 2,048-byte maximum. Oversized payloads are rejected with 413 before the unsubscribe handler reads or parses the body. Added a backend integration regression that submits an oversized one-click form and expects `REQUEST_TOO_LARGE`. GitHub Actions run [39177703919](https://github.com/Thatisshayan/Parle/actions/runs/39177703919) on code commit `320f130` passed all three jobs, including the full disposable-Supabase suite (640 tests across 105 files), app checks/build and generated-source sync plus all 15 Deno entry points. The new integration regression passed. A direct request to the local disposable Edge Runtime returned HTTP 413. The workstation's direct Bun invocation was blocked by process permissions; the suite was verified in CI. **Deployment required: yes**, for a reviewed deployment of Supabase Edge Function `parle-waitlist-unsubscribe`; no deployment occurred. The function deployment is the only delivery required for this Phase 39 fix. Public release remains NO-GO.

## Phase 40 — Put public waitlist signup behind bounded server controls — CI VERIFIED; DEPLOYMENT PENDING

**Finding PARLE-SEC-40-01 — Medium abuse and availability risk (CWE-770):** `parle.buzz` sent browser submissions directly to the anonymous `public.join_waitlist(...)` SECURITY DEFINER RPC. The honeypot was checked only in JavaScript; direct callers bypassed it and there was no source-address, per-email, or aggregate admission limit. Inputs were validated for email/role/goal and inserted rows fed owner-operated email campaigns, so an attacker could add arbitrary addresses and grow the future campaign queue. The read-only production advisor record had accepted this as the pre-backend waitlist design; the Phase 40 change supersedes that access-path decision while preserving the table schema, RPC signature and insert behavior.

Added `parle-waitlist-join`, which enforces a streaming 2,048-byte body cap, requires a consent signal, honors the honeypot server-side, validates role/goal/email, applies 20 requests per source address per hour, 3 per normalized email per hour (email key stored as SHA-256), and a 1,000 request aggregate hourly ceiling. The waitlist page now calls this function. Migration `20261018000037_bound_public_waitlist_signup.sql` conditionally revokes `PUBLIC`/`anon`/`authenticated` execution on the existing RPC and retains `service_role` access; this avoids failing clean local stacks where the legacy production RPC is absent. The test-only stand-in now mirrors the restricted grant, seeding helpers use service role, a new integration suite covers successful signup, missing consent, server honeypot, per-address throttling, body cap and anonymous RPC denial, and a static page regression locks the endpoint/consent/honeypot contract.

Local Deno type check for the new entry point passed. The static waitlist-site suite passed 7/7 (26 expectations), including the new route/consent/honeypot contract. The first CI attempt exposed a test-fixture privilege gap: fresh Supabase default privileges had granted function execution directly to `anon`/`authenticated`; commit `19b0bdd` corrected the stand-in to revoke those explicit grants as well as `PUBLIC`. The follow-up GitHub Actions run [39180293455](https://github.com/Thatisshayan/Parle/actions/runs/39180293455) on `19b0bdd` passed all three jobs: backend 645 pass / 1 authorized skip / 0 fail across 646 tests and 106 files, including all five new signup integration cases; app tests, typechecks, lint and production build; generated-source sync and all 15 Deno entry points. The local focused function suite still could not register the new route (HTTP 404 from the pre-existing local Edge Runtime), so CI is the handler-level integration evidence. Migration SQL/grants were also verified locally: `anon=false, authenticated=false, service_role=true`. **Deployment required: yes.** An authorized operator must deploy the new Supabase Edge Function, apply migration 000037 to revoke the public RPC grant, and publish the updated static waitlist site as one coordinated change. Confirm the production gateway's client-IP header behavior and add an owner-approved test signup smoke before marking the production abuse control verified. This does not verify email ownership or implement double opt-in; counsel/privacy must decide whether the waitlist requires additional proof of consent. No production action occurred. Public launch remains NO-GO.

## Phase 41 — Enforce voice relay request limits while streaming — CI VERIFIED; DEPLOYMENT PENDING

**Finding PARLE-SEC-41-01 — Medium resource-exhaustion risk (CWE-400):** the Vercel voice relay checked `Content-Length` against its 2,400,000-byte audio limit but then called `req.arrayBuffer()` before checking the actual byte count. A missing or inaccurate header could make the application buffer the full request before rejecting it. Its JSON `speak`/`listen` actions similarly called `req.json()` without an application-level body cap, before text length, identifiers, or quotas were validated. Vercel has a documented request payload ceiling (also noted in source), which bounds the worst case at the platform layer; the application-level limits did not enforce their advertised bounds while reading.

Added a shared bounded stream reader in the voice relay. Audio uploads now stop as soon as the body exceeds 2,400,000 bytes, including when `Content-Length` is absent or understated. JSON actions are limited to 8,192 bytes before decoding/parsing. Oversized audio returns 413 `AUDIO_TOO_LARGE`; oversized JSON returns 413 `REQUEST_TOO_LARGE`. New route-level regressions assert the streamed reader cancels on byte 2,400,001 and that oversized JSON never reaches the backend. GitHub Actions [39181566071](https://github.com/Thatisshayan/Parle/actions/runs/39181566071) on `947273e` passed all three jobs: app 551/551 tests across 62 files, backend 645 pass / 1 authorized skip / 0 fail across 646 tests and 106 files, app/API typechecks, lint, production build, generated-source sync and all 15 Deno checks. Both new request-cap regressions passed. No production deployment or request was made. **Deployment required: yes** for the reviewed app/Vercel release so the voice relay enforces these limits in production. Public release remains NO-GO.

## Phase 42 — Prove the waitlist source-address limiter independently — CI VERIFIED

The Phase 40 waitlist integration case was named as a source-address cap test, but it repeated one email and generated a different address on each request; its fourth request was rejected by the per-email limit. This left the advertised 20/hour per-source-address control without an integration test. The implementation itself applies the address key before the email key, but the test did not independently prove that behavior.

Renamed the existing case to identify its actual per-email scope and added a new test that sends 20 unique emails from one stable source address, expects all 20 accepted and the 21st rejected with 429, and verifies exactly 20 rows were inserted. The first CI attempt [39182346275](https://github.com/Thatisshayan/Parle/actions/runs/39182346275) exposed that the test gateway supplies `cf-connecting-ip`, which correctly takes precedence over the test's `x-forwarded-for` value. Commit `8b874f7` supplies both headers with the controlled address. CI run [39182982378](https://github.com/Thatisshayan/Parle/actions/runs/39182982378) passed all three jobs; backend integration reports 646 pass / 1 authorized skip / 0 fail across 647 tests and 106 files. The app checks/build and generated-source sync plus all 15 Deno checks also passed. No production activity occurred; deployment is not needed for this test-only evidence update. Public launch remains NO-GO pending separate gateway/proxy and aggregate-rate-limit operational evidence.

## Phase 43 — Prove the waitlist aggregate limiter rejection — CI VERIFIED

Phase 40 implemented an aggregate ceiling of 1,000 requests per hour, but no route integration test forced the aggregate counter to its threshold. Added a disposable-database regression that seeds the current-hour `waitlist-join:all` counter to 1,000, sends a valid request from a unique source address, expects HTTP 429, verifies no signup row was inserted, and restores the counter's prior state in `finally`. CI run [39183881876](https://github.com/Thatisshayan/Parle/actions/runs/39183881876) on `62d5d42` passed all three jobs; backend integration reports 647 pass / 1 authorized skip / 0 fail across 648 tests and 106 files. This is test-only; deployment is not needed. Production proxy/IP-header validation and authorized burst/cost load testing remain open; public launch remains NO-GO.
