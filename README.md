# Parle - French Learning & Teaching Platform

A French learning and tutoring web platform for adults (18+): placement test, a personal roadmap, an AI tutor with
voice, practice, and vetted human tutors. Launch tracks: Canada Immigration (NCLC 7), Canadian Citizenship (NCLC 4) and
General / Conversation. "Parle" is a working name; the domain is **parle.buzz**.

**Resuming work? Read [`HANDOFF.md`](HANDOFF.md) first**: current state, what is waiting on the founder, how to run and
deploy. Then `10_Decisions-Meetings/DECISIONS.md` for what has been decided (60 decisions so far).

## Status (2026-10-18)

- **The app runs on Parle's own stack**, no longer on Buildy.ai: Supabase (database, sign-in, storage and Edge
  Functions in ca-central-1), Vercel (protected app preview, voice relay and waitlist site), Stripe in **test mode**,
  Resend, OpenRouter, Deepgram and Azure Canada Central.
- **Lesson Bank v1 source validated locally** (544 questions and 72 prompts; dry-run accepted all 616 rows). This does
  not prove current production import, approval, or prepared-audio status. Assessment listening plays audio and is
  designed not to send transcripts to the browser.
- **Plan 10 is complete.** The app remains a protected Vercel preview; `parle.buzz` serves the waitlist. Stripe is
  still test-only.
- **Audit Phases 3–4 checks (2026-10-17):** app 544/544; backend 617 pass / 1 skip / 0 fail across 103 files; app/API
  TypeScript checks 0 diagnostics; generated Edge Functions pass Deno checks (15/15). Local importer dry-run accepts
  616 source rows; local migration 000034 tested for atomic rollback and anonymous denial. ESLint remains at 279
  errors / 22 warnings across 61 files and is a hard launch gate. Production import/status is not independently
  verified; migration 000034 and matching application release need founder/operator deployment before production use.
  OWASP A01–A10 source review found no confirmed Critical/High issue in reviewed paths; targeted local security tests
  passed 52/52. The app dependency scan reported 44 advisories (26 high, 15 moderate, 3 low); React Router is upgraded
  to 7.18.4, but confirmed vulnerable transitive packages remain and final Bun scan attempts were blocked by registry
  connection refusal. Production provider/retention/RLS evidence remains pending. See
  `AUDIT_REPORT.md` for exact evidence and limitations.
- **Audit Phase 5 (2026-10-17):** backend 622 pass / 1 skip / 1 full-suite timing failure; isolated AI tests 15/15; Deno checks 15/15. Stripe Connect idempotency handling and regression coverage are updated. Live Stripe remains NO-GO; payment backend deployment is needed after owner review.
- **Audit Phase 7 (2026-10-17):** production launch check and switch dry-run passed without changes; Auth URL, APP_URL and domain project blockers remain. Migration comparison, backups/restore, alert delivery and incident owner evidence are open. See `06_Build/export-decoupling/specs/OPS_CUTOVER_READINESS.md`.
- **Audit Phase 8 (2026-10-17):** controlled-release decision sheet records NO-GO; no release SHA is selected, no cohort was opened, and no deployment occurred. See `06_Build/export-decoupling/specs/CONTROLLED_RELEASE_GO_NO_GO.md`.
- **Audit Phases 9–33 (2026-10-18):** Latest full CI [39172055868](https://github.com/Thatisshayan/Parle/actions/runs/39172055868) on `c173e13` passed all three jobs: app tests/types/lint/build, full disposable-Supabase backend integration, and generated-source/launch-preflight/Deno checks. The remaining backend skip is the real Plan 1 account rehearsal. R59's PostgreSQL deadlock fix passes the 30-pair regression locally and in CI; production behavior changes only after a reviewed migration release. Phase 32's Bun scans found one High `braces@3.0.3` app advisory and no backend findings; static Tailwind globs limit runtime reachability, while build/CI risk and security-owner disposition remain. Phase 33's bounded static continuation found no new confirmed issue in selected paths but did not complete a line-by-line 1,011-file review or verify production controls; security is not clean. No production deployment or mutation occurred. Remaining launch gates include provider budgets/alerts/load evidence, production proxy/IP verification, product copy approval, device/accessibility, legal/privacy, real-account rehearsal and operations. See the execution plan, `AUDIT_REPORT.md` and `06_Build/export-decoupling/specs/AI_PROVIDER_BUDGET_READINESS.md`.
- **Current work:** audit gap closure on `codex-branch`; Phases 1–50 are recorded. Phase 45 leaves the unpatched High `braces@3.0.3` advisory open pending security-owner acceptance; no Tailwind migration/fork exploration is authorized. Phase 46's Deep Scan (`dfb92ea3-b286-4bc2-ae92-3301a2534495`) validated five findings on revision `1f1a18d`, with partial coverage (792 indexed / 1,001 inventoried). Phase 47 implements refund-aware payout holds and an atomic payment-lock transfer-start gate, preserving explicit admin split refunds. Initial CI run [39189307264](https://github.com/Thatisshayan/Parle/actions/runs/39189307264) passed app and generated/Deno checks but exposed three report/claim tests that relied on the previous worker-lock marker; the migration now covers active claim leases in report/admin gates. Local report/claim, payout-schema, sender and admin tests pass 35/35 (174 assertions); Full CI [39190043991](https://github.com/Thatisshayan/Parle/actions/runs/39190043991) passed: app 551/551; backend 654 pass / 1 authorized skip / 0 fail across 655 tests and 106 files; generated-source sync, launch preflight and all 15 Deno checks. Migration 000038 and the webhook, booking-jobs, and payout-service functions need reviewed production deployment; none occurred. Remaining credential/configuration, diagnostics, request-body and scan coverage findings remain open. Production/provider controls, credential validity/distribution, deployed policies and ingress controls are unverified. Public launch remains NO-GO. See `06_Build/export-decoupling/plans/2026-10-17-audit-gap-closure-execution.md`
  and `AUDIT_REPORT.md`.
- **Public launch remains blocked** on a clean release gate, production domain/Auth cutover, Stripe live readiness and
  business setup, legal review, real-device voice checks and operations sign-off. See `HANDOFF.md` and
  `06_Build/export-decoupling/specs/SPEC-BACKLOG.md`.

## Folders

| Folder | What lives here |
|---|---|
| `00_Inbox` | Raw inputs not yet processed (sketches, chats, notes) |
| `01_Strategy` | Vision, market research, competitors, business model |
| `02_Product` | Specs: `specs/00_master-spec.md` (start here), `specs/phase-1-mvp/`, `specs/later-phases/`; user flows |
| `05_Operations` | Tutor recruiting, vetting and onboarding; support; legal and compliance |
| `06_Build` | `buildy-ai/`: the Buildy.ai era (prompts, session logs). `export-decoupling/`: the move to our own stack: plans and reports (`plans/`), specs (`specs/`, with `SPEC-BACKLOG.md`), spikes, deferred defects, security debt, the close-out report (`migration/close-out-report.md`) |
| `07_Engineering` | The code: `parle-app` (React app and the Vercel voice relay), `parle-backend` (Supabase migrations, server functions, tests, deploy and check scripts), `parle-waitlist` (parle.buzz) |
| `10_Decisions-Meetings` | `DECISIONS.md` (the decision log) and meeting notes |

Each code folder has its own README with how to run, test and deploy it.

## Rules that always apply

- Secrets live only in `C:\Users\AgentDev\.parle-secrets\` and in the Supabase and Vercel settings; never in the repo,
  never printed.
- The founder runs production database migrations and uploads production settings. The app is never deployed with
  `--prod` until launch; parle.buzz is published only by the founder.
- Stripe stays in test mode until the live-mode plan.

### Audit Phase 48 — streaming request limits

The marketplace service now applies its existing 2 MiB body maximum while streaming, before authentication and JSON parsing. Stripe webhook bodies are limited to 1,000,000 bytes before signature validation. The public level-check's existing 32,000-byte streaming cap was revalidated. Local tests pass 25/25 (95 assertions) and all three affected Edge Function entry points type-check. Full CI [39191149161](https://github.com/Thatisshayan/Parle/actions/runs/39191149161) passed: backend 656 pass / 1 authorized skip across 657 tests/106 files, app checks, generated-source sync, launch preflight and all 15 Deno checks. Reviewed deployment must include marketplace, public level-check and Stripe webhook; none has occurred. Public launch remains NO-GO.

### Audit Phase 49 — remove lesson exception diagnostics

Removed the deployment-controlled test flag/header that could include raw lesson-service exception detail in a 500 response; removed its unused local test env setting. The generic client failure response remains. Local lesson-booking tests pass 19/19 (171 assertions), Deno check passes, and no diagnostic flag/header references remain. Initial CI [39191860312](https://github.com/Thatisshayan/Parle/actions/runs/39191860312) timed out once in an unrelated account-service test; the backend rerun passed 656/1 authorized skip across 657 tests/106 files and all app/generated/Deno jobs. Reviewed deployment of parle-lesson-service is required; production remains unchanged and public launch remains NO-GO.

### Audit Phase 50 — require payout-alert owner and restrict generated settings

Production environment generation now requires an owner-managed ADMIN_ALERT_EMAIL and rejects the test mailbox fallback. Secret-bearing settings are written to a random temporary file with access restricted before content is written (POSIX mode 0600; Windows current-account ACL), then atomically renamed. Local Windows tests pass 2/2 (13 assertions), including ACL and replacement checks. Full CI [39193161716](https://github.com/Thatisshayan/Parle/actions/runs/39193161716) passed: backend 658 pass / 1 authorized skip across 659 tests/107 files, app checks, source sync, launch preflight and all 15 Deno checks. No production settings or secrets were changed; the owner must supply the recipient before generating production settings.
### Audit Phase 51 — deep scan and next remediation order

The sealed repository scan recorded 22 validated findings (8 medium, 14 low) with partial file-level coverage; Phase 50 CI passed in [run 39193161716](https://github.com/Thatisshayan/Parle/actions/runs/39193161716). Full report, scan limits, next phases (52–57), and owner-only runtime gates are in `AUDIT_REPORT.md` and the execution plan. Public launch remains NO-GO. Keep `braces@3.0.3` pending security-owner acceptance.

### Audit Phase 52 — voice relay secret

Relay-only voice operations now require a configured non-placeholder secret of at least 32 characters; production env generation fails closed if it is absent. Full CI passed in [run 39200433357](https://github.com/Thatisshayan/Parle/actions/runs/39200433357), attempt 3. The Vercel preview separately failed `vite build` with exit 127; see `AUDIT_REPORT.md` before relying on preview deployments. Owner-controlled secret verification and deployment remain pending.

### Audit Phase 53 — disabled account authorization

Shared account authentication now checks database disablement even when the Auth-provider ban failed; lookup errors fail closed. Fresh-stack CI passed in [run 39202332383](https://github.com/Thatisshayan/Parle/actions/runs/39202332383), including the disabled-row/Auth-unban regression. Reviewed deployment remains pending; see the audit report for rollout scope.

### Audit Phase 54 — dispute persistence retries

Stripe dispute webhooks now fail with retryable 500 when the payment status write fails, before payout handling. Focused regression and Deno check pass; CI [39203012068](https://github.com/Thatisshayan/Parle/actions/runs/39203012068) passed on attempt 2, including 662 backend tests and app/generated/Deno jobs. Reviewed webhook deployment remains pending.

### Audit Phase 55 — authenticated request body limits

Added streamed body caps to seven authenticated JSON endpoints, before auth and AI guards. The revised integration regression passed full CI [39205864136](https://github.com/Thatisshayan/Parle/actions/runs/39205864136): backend 664 pass/1 authorized skip plus app, generated-source, launch preflight and Deno jobs. Reviewed deployment remains required. See `AUDIT_REPORT.md`.

### Audit Phase 56 — local env file permissions

The local env setup now restricts ACLs before reading preserved values and writes via an owner-restricted atomic file writer. Windows ACL and Deno checks pass; CI [39205864136](https://github.com/Thatisshayan/Parle/actions/runs/39205864136) passed. No credential values were read or changed. See `AUDIT_REPORT.md`.

### Audit update (2026-10-19)

Phase 55 body caps passed full CI [39205864136](https://github.com/Thatisshayan/Parle/actions/runs/39205864136); reviewed deployment of seven Edge Functions remains pending. Phase 57 adds a per-tutor hourly cap on Stripe Connect account refreshes and passed full CI [39206743777](https://github.com/Thatisshayan/Parle/actions/runs/39206743777). Reviewed payout-service deployment and production evidence gates remain open; see the audit report and gap-closure execution plan.
