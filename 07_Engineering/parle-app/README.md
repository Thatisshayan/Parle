# parle-app

The Parle web app (React + Vite + Tailwind) and its Vercel voice relay. It talks to Parle's own Supabase backend
(`../parle-backend`) for sign-in, data and server functions.

## Layout

| Path | What |
|---|---|
| `src/pages/` | One file per screen (learner, tutor, admin, public pages, legal pages) |
| `src/components/` | Shared components (`components/parle/` for Parle-specific ones, `components/ui/` for the base kit) |
| `src/lib/` | Client logic and its tests (`*.test.ts`): i18n (`i18n.ts`, all wording, English with French overrides), booking, placement, voice recording and playback, admin helpers |
| `src/integrations/` | The Supabase client |
| `api/voice.ts`, `api/_voice/` | The voice relay (a Vercel Node function): transcription (Deepgram), read-aloud (Azure, Canadian French), listening audio. It checks the learner with the backend before every provider call, caps audio at 2,400,000 bytes and JSON bodies at 8,192 bytes while streaming, and never stores audio |
| `entities/` | Buildy-era entity definitions, kept as schema reference |
| `scripts/` | Test loaders and the speech-protocol helpers used to build the old NVIDIA client |
| `vercel.json` | Rewrites (everything except `api/` and files goes to `index.html`), the relay's 60 s limit, security headers and the content security policy |

Some files in `src/lib/` are shared with the backend: `node scripts/sync-app-code.ts` (or `bun scripts/sync-app-code.ts`)
in `../parle-backend` copies them into `supabase/functions/_app/` (run it after changing them; a backend test checks
the copy is current). Canonical ownership, generation rules, and review/test steps are documented in
`../../06_Build/export-decoupling/specs/GENERATED_SOURCE_OWNERSHIP.md`. For audit Phase 3, practice generation no longer uses placement/check-in assessment bank rows
when AI generation fails; the learner sees an unavailable state until generated practice can be provided.

## Run and test

```bash
bun install
bun run dev                      # http://127.0.0.1:5173, against the local Supabase stack started from ../parle-backend
bun run test                     # app and relay tests (bun test, node:test style)
bun run typecheck                # app source and Vercel relay type checks
bun run build                    # production bundle, local only
bun run lint                     # current repository-wide baseline has known errors; see ../../../AUDIT_REPORT.md
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json   # app source check
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.api.json   # Vercel relay check
```

Settings the app reads at build time: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (both public by design).
Settings the relay reads at run time (Vercel, Sensitive): `DEEPGRAM_API_KEY`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`
(`canadacentral`), `VOICE_TTS_VOICE` (`fr-CA-SylvieNeural`), `VOICE_RELAY_SECRET` (shared with the backend). Tests use
`VOICE_PROVIDER=fake`; NVIDIA is selectable only off Vercel (`VOICE_PROVIDER=nvidia`) for comparison.

## Deploy

Only as a **protected preview** until launch (never `--prod`):

```bash
bunx vercel deploy --yes --target preview --scope shayans-projects-d00acc44
bunx vercel alias set <deployment URL> parle-preview-shayans-projects-d00acc44.vercel.app --scope shayans-projects-d00acc44
```

The preview is at https://parle-preview-shayans-projects-d00acc44.vercel.app (Vercel protection on; scripts use the
bypass header from the secrets folder). A first "Not authorized" from the CLI: run it once more.

### Audit Phase 58 — Vercel monorepo root

The Vercel project root is `07_Engineering/parle-app`. Vercel had attempted `vite build` from the Parle repository root, where the app's `package.json` and Vite binary are not present. The project is non-production (`live:false`) and remains SSO-protected. The corrected `codex-branch` previews [parle-592hbexf6](https://vercel.com/shayans-projects-d00acc44/parle-app/BvAs4ZfVqwuWKjERNuSMvhHWXP4m) and [parle-dcoy1uz19](https://vercel.com/shayans-projects-d00acc44/parle-app/7X4DEmGuKnF18RP2DoYvmCoHCWdH) reached READY; Vite built both app snapshots. Full CI [39208240037](https://github.com/Thatisshayan/Parle/actions/runs/39208240037) passed app tests/types/lint/build, backend integration, generated-source sync, launch preflight and Deno checks.
