# Parle - French Learning & Teaching Platform

A French learning and tutoring web platform for adults (18+): placement test, a personal roadmap, an AI tutor with
voice, practice, and vetted human tutors. Launch tracks: Canada Immigration (NCLC 7), Canadian Citizenship (NCLC 4) and
General / Conversation. "Parle" is a working name; the domain is **parle.buzz**.

**Resuming work? Read [`HANDOFF.md`](HANDOFF.md) first**: current state, what is waiting on the founder, how to run and
deploy. Then `10_Decisions-Meetings/DECISIONS.md` for what has been decided (60 decisions so far).

## Status (2026-10-17)

- **The app runs on Parle's own stack**, no longer on Buildy.ai: Supabase (database, sign-in, storage and Edge
  Functions in ca-central-1), Vercel (protected app preview, voice relay and waitlist site), Stripe in **test mode**,
  Resend, OpenRouter, Deepgram and Azure Canada Central.
- **The real Lesson Bank v1 is imported and selected in production** (544 questions, 72 prompts and 178 prepared
  listening audio files; founder-approved on 2026-10-17). Assessment listening plays audio and is designed not to send
  transcripts to the browser.
- **Plan 10 is complete.** The app remains a protected Vercel preview; `parle.buzz` serves the waitlist. Stripe is
  still test-only.
- **Audit Phase 2 checks (2026-10-17):** app 541/541; app source typecheck 0 errors; relay typecheck 0; production build
  succeeds. Backend 609 pass / 1 skip / 1 full-suite reschedule failure; the reported test passes by itself, with two
  additional failures in a post-restart file rerun also passing in isolation. ESLint: 281 errors / 22 warnings across
  50 files, chiefly explicit `any` and intentional control-character regexes; the lint gap remains open. Node-based
  source and API typechecks pass, generated Edge Functions pass Deno checks (15/15). See
  `AUDIT_REPORT.md` for exact evidence and limitations.
- **Current work:** audit gap closure on `codex-branch`; see `06_Build/export-decoupling/plans/2026-10-17-audit-gap-closure-execution.md`
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
