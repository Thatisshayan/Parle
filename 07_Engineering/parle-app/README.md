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
| `api/voice.ts`, `api/_voice/` | The voice relay (a Vercel Node function): transcription (Deepgram), read-aloud (Azure, Canadian French), listening audio. It checks the learner with the backend before every provider call and never stores audio |
| `entities/` | Buildy-era entity definitions, kept as schema reference |
| `scripts/` | Test loaders and the speech-protocol helpers used to build the old NVIDIA client |
| `vercel.json` | Rewrites (everything except `api/` and files goes to `index.html`), the relay's 60 s limit, security headers and the content security policy |

Some files in `src/lib/` are shared with the backend: `bun scripts/sync-app-code.ts` in `../parle-backend` copies them
into `supabase/functions/_app/` (run it after changing them; a backend test checks the copy is current).

## Run and test

```bash
bun install
bun run dev                      # http://127.0.0.1:5173, against the local Supabase stack started from ../parle-backend
bun run test                     # app and relay tests (bun test, node:test style)
bunx tsc --noEmit -p tsconfig.app.json   # app type check (62 known errors from the Buildy export; do not add new ones)
bunx tsc --noEmit -p tsconfig.api.json   # relay type check (0 errors)
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
