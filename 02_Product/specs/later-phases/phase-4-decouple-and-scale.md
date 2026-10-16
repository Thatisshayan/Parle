# Phase 4 - Decouple from Buildy.ai and Scale

Status (2026-10-16): Part A (export and decouple) DONE: Plans 1-4, backend Supabase + Vercel (decision #44), production cut-over 2026-10-15 (decision #51); see HANDOFF.md section 4. Part B still PROPOSED (feature level).

## Goal
Own the full codebase and infrastructure, then add the platform features that need it: mobile apps, built-in
video lessons, interface translations, real-time voice (if not possible on Buildy).

## Part A - Export and decouple
| Step | Work |
|---|---|
| A1 | Export code (GitHub/ZIP) into `07_Engineering/`; record the generated stack |
| A2 | Code audit: security, data access rules, secrets, dead code, test coverage |
| A3 | Replace the Buildy platform layer (`@superdevhq/client`: database, auth, backend functions) and move hosting, storage and email to accounts the founder owns. Chosen: Supabase (Postgres, Auth, Edge Functions, Storage, cron) with the app on Vercel and email through Resend (decisions #44, #47) |
| A4 | Data migration with zero data loss; Stripe Connect accounts and subscriptions remain valid |
| A5 | AI calls go directly to providers through the provider-swappable interface |
| A6 | CI/CD, automated tests (roadmap engine unit tests, end-to-end flows), monitoring and error tracking |
| A7 | Cut-over with rollback plan (done 2026-10-15); Buildy frozen and untouched until 2026-11-14, then archived (decision #51) |

Reference playbook: Learn with Alphonso's Lovable -> own-stack decoupling (founder's experience).

## Part B - Scale features
| # | Feature |
|---|---|
| 4.1 | Real-time voice AI conversation (if it was "Coming soon" in Phase 1). It is: not built yet, planned for Plan 10 or later (Plan 9 spec) |
| 4.2 | Built-in video lessons (WebRTC provider), with recording opt-in and in-lesson shared notes |
| 4.3 | Mobile apps (iOS + Android) sharing the backend |
| 4.4 | Interface translations: Persian, Arabic, Spanish, French first (keys already in place) |
| 4.5 | Calendar sync (Google / Outlook) for tutors and learners |
| 4.6 | Regional pricing and more payout coverage |

## Success criteria
Export complete with no feature regression; uptime >= 99.5%; page and AI latency targets from Phase 1 held or improved.
