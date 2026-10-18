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
- **Audit Phases 9–24 (2026-10-18):** latest run [39110856957](https://github.com/Thatisshayan/Parle/actions/runs/39110856957) passes all CI jobs. Backend: 630 pass / 1 skip / 0 fail (2,348 expectations; 631 tests/104 files); app/static jobs pass. Phase 23's public oversized-body integration and stream-cancellation regression pass. R59 still intermittently returns one 500 in concurrent requests; it failed in three intervening full-suite runs and passed latest, so the cause remains open. The only skipped test is the real Plan 1 account rehearsal. App gates/Deno pass; lint has 0 errors/18 Fast Refresh warnings. Product copy approval, production proxy/IP verification, provider spend/concurrency and alert budgets, burst/load checks, device/accessibility, legal/privacy, advisory disposition, real-account rehearsal, and launch operations remain open. No deployment or production mutation occurred. See the execution plan.
- **Current work:** audit gap closure on `codex-branch`; Phases 1–24 engineering work and the NO-GO decision are recorded, with dependency, production, legal, device and launch evidence gates still open. See `06_Build/export-decoupling/plans/2026-10-17-audit-gap-closure-execution.md`
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
