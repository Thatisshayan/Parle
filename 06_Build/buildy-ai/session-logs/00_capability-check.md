# Task 0 - Buildy capability check (2026-10-08)

Method: Buildy docs (saved in `../research/`) + read-only look at the Code tab of an existing project of the
founder's (no changes made; founder asked that existing projects not be used for Parle work).

## Findings
| Capability | Result | Evidence |
|---|---|---|
| Code export | YES - ZIP download (Dashboard > Website Settings > Code Export; Dashboard > Developer) | docs-developer.txt, docs-website-settings.txt |
| Frontend stack | React + TypeScript + Vite + Tailwind (`src/pages/*.tsx`, `main.tsx`, `vite-env.d.ts`, `tailwind.config.ts`) | Code tab |
| Data model | `entities/*.json` schema files (platform-managed database) | Code tab |
| Backend | `functions/*.ts` run on Deno and import `npm:@superdevhq/client` (Buildy's hosted platform SDK) | Code tab |
| Auth / sign-in | Platform-managed (Dashboard > Sign-in Page) | How Buildy Works doc |
| Stripe | Ready-made integration (Dashboard > Integrations) | Features doc |
| Custom backend logic / external APIs | Backend Functions with secrets stored in Dashboard | How Buildy Works doc |
| Scheduled jobs | Yes (scheduled function seen in existing project) | Code tab |
| AI chat agents | Text Agents (built-in) | Features doc |
| Voice | Voice Agents: browser web calls + phone, billed in voice minutes | Features doc |
| Checkpoints / rollback | Yes, automatic | Features doc |
| Stripe Checkout, Billing, Portal, Connect Express, delayed transfers, verified webhooks | YES via Backend Functions + own Stripe secret key (Connect must be enabled on the Stripe account) | buildy-capability-answers.txt (A) |
| Private admin-only files, 200 MB video | NOT CONFIRMED - file URLs may be public regardless of data rules. Do not upload real IDs | (B) |
| Own AI keys for chat, TTS, STT | YES via Backend Functions (HTTP calls, billed by provider) | (C) |
| Real-time voice with per-learner context | NO custom WebSocket streaming; built-in voice agents do fr-FR/fr-CA browser calls but per-learner context not confirmed; billed in Buildy voice minutes (top-up) | (C) |
| Scheduled jobs every 10 min | YES (UTC, no overlap, min interval > 2 min) | (D) |
| Data access rules | Start OPEN by default - every entity needs explicit restrictions | Buildy reply to prompt 00 |
| Auth | Buildy-managed email + password (Google sign-in not mentioned - check in Module 1) | Buildy reply to prompt 00 |

## What this means for decoupling (Phase 4)
The export is portable for the **frontend** (React/Vite/Tailwind), the **data schemas** and the **business logic**,
but the database, auth and function runtime belong to Buildy's platform (`@superdevhq/client`). After export we
replace those with our own stack (founder confirmed 2026-10-08: "after we export we will use our own stack").
So Phase 4 = keep UI + logic, swap the data/auth/function layer, migrate data. Plan for that work explicitly.

## Decision
GO for Buildy, with the backend-replacement caveat above. Remaining unknowns are answered by Buildy in prompt 00.
