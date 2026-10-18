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
- **Current work:** audit gap closure on `codex-branch`; Phases 1–38 are recorded. Exception-detail reduction covers backend, app-server and browser-console catch paths; Phase 36 code CI [39174068000](https://github.com/Thatisshayan/Parle/actions/runs/39174068000) and Phase 37 documentation CI [39176076803](https://github.com/Thatisshayan/Parle/actions/runs/39176076803) passed all jobs. The Phase 37 static scan returned zero validated findings but left source coverage incomplete; Phase 38 reviewed placement service state and authorization without a new reportable issue in that bounded area; security remains partial. The Phase 37 run required a backend-job retry after a 30-second test timeout. Production, legal, device and launch evidence gates remain open. See `06_Build/export-decoupling/plans/2026-10-17-audit-gap-closure-execution.md`
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
