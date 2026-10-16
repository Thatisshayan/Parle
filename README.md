# Parle - French Learning & Teaching Platform

A French learning and tutoring web platform for adults (18+): placement test, a personal roadmap, an AI tutor with
voice, practice, and vetted human tutors. Launch tracks: Canada Immigration (NCLC 7), Canadian Citizenship (NCLC 4) and
General / Conversation. "Parle" is a working name; the domain is **parle.buzz**.

**Resuming work? Read [`HANDOFF.md`](HANDOFF.md) first**: current state, what is waiting on the founder, how to run and
deploy. Then `10_Decisions-Meetings/DECISIONS.md` for what has been decided (60 decisions so far).

## Status (2026-10-16)

- **The app runs on Parle's own stack**, no longer on Buildy.ai: Supabase project "Parle" (database, sign-in, storage,
  17 server functions, ca-central-1), Vercel (the app as a protected preview, the voice relay, the parle.buzz waitlist
  site), Stripe in **test mode** only, Resend for email.
- **Built and checked on the real system:** sign-up and onboarding, placement test, weekly plan and roadmap, AI tutor,
  practice, check-ins, the tutor marketplace, lesson booking and payment (Stripe test mode), tutor payouts in CAD
  (Stripe Connect test mode), account administration, the waitlist and its launch email, and voice (spoken answers
  scored, replies read aloud, listening audio).
- **In progress: Plan 10**, moving every AI and speech call off NVIDIA's trial key (its terms forbid production use)
  to paid providers: OpenAI GPT-6 Luna through OpenRouter for text, Deepgram for transcription, Azure (Canadian French
  voice) for read-aloud. Minimum age becomes 18.
- **Before public launch:** Stripe live mode, the real question bank (written in a separate Lesson Bank project),
  lawyer review of the legal pages, the founder's business setup. See `06_Build/export-decoupling/specs/SPEC-BACKLOG.md`.
- **Live today:** only the waitlist page at https://parle.buzz. The app itself is a private Vercel preview.

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
