# Phase 4 - Decouple from Buildy.ai and Scale

Status: PROPOSED (feature level) · Timing flexible: may move before Phase 2/3 if Buildy limits block the roadmap

## Goal
Own the full codebase and infrastructure, then add the platform features that need it: mobile apps, built-in
video lessons, interface translations, real-time voice (if not possible on Buildy).

## Part A - Export and decouple
| Step | Work |
|---|---|
| A1 | Export code (GitHub/ZIP) into `07_Engineering/`; record the generated stack |
| A2 | Code audit: security, data access rules, secrets, dead code, test coverage |
| A3 | Replace the Buildy platform layer (`@superdevhq/client`: database, auth, backend functions) and move hosting, storage and email to accounts the founder owns (e.g. Vercel + Supabase/Postgres, or AWS via infrastructure-as-code) |
| A4 | Data migration with zero data loss; Stripe Connect accounts and subscriptions remain valid |
| A5 | AI calls go directly to providers through the provider-swappable interface |
| A6 | CI/CD, automated tests (roadmap engine unit tests, end-to-end flows), monitoring and error tracking |
| A7 | Cut-over with rollback plan; Buildy subscription ended only after 30 stable days |

Reference playbook: Learn with Alphonso's Lovable -> own-stack decoupling (founder's experience).

## Part B - Scale features
| # | Feature |
|---|---|
| 4.1 | Real-time voice AI conversation (if it was "Coming soon" in Phase 1) |
| 4.2 | Built-in video lessons (WebRTC provider), with recording opt-in and in-lesson shared notes |
| 4.3 | Mobile apps (iOS + Android) sharing the backend |
| 4.4 | Interface translations: Persian, Arabic, Spanish, French first (keys already in place) |
| 4.5 | Calendar sync (Google / Outlook) for tutors and learners |
| 4.6 | Regional pricing and more payout coverage |

## Success criteria
Export complete with no feature regression; uptime >= 99.5%; page and AI latency targets from Phase 1 held or improved.
