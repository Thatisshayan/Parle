# Related product: Learn with Alphonso

Repo: https://github.com/obsidian-media/LearnWithAlphonso (founder's own app, App Store submission pending;
another Claude Code session actively works on it, so treat it read-only from here).

What it already has (per README, 2026-10-08):
- English/French/Spanish courses, CEFR A1-C1, 15-question adaptive placement test
- AI conversation (voice) with scenarios, save-a-word, SM-2 spaced repetition
- Podcast "Listen" library with transcripts, admin app to publish episodes
- Heavy gamification (XP, streaks, leagues, duels, teams)
- Stack: TanStack Start + React 19, Supabase (Postgres/Auth/RLS), NVIDIA NIM + Deepgram, Vercel, native iOS/Android
- Built on Lovable first, then decoupled - the same path Parle took with Buildy.ai: exported 2026-10-14, moved to
  Supabase + Vercel, cut-over 2026-10-15 (decisions #44, #51)

Why it matters for Parle: overlapping French content, podcasts, placement logic and AI conversation,
plus a proven "AI builder -> export -> decouple" playbook.
