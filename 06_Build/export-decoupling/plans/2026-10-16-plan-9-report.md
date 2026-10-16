# Plan 9 report: voice (natural French voice and scored speaking)

Plan `06_Build/export-decoupling/plans/2026-10-16-plan-9-voice.md`; spec `specs/2026-10-16-plan-9-voice-design.md`;
branch `plan-9-voice`, executed natively (one session) with one final review on the most capable model before the
deploy. Results on production and the preview: `migration/close-out-report.md`, "Plan 9 deploy" and "Plan 9 checks".

## Tasks

- Task 0: Setup and baselines. Branch plan-9-voice from main 8fc5a3a with bank-readers merged; latest migration 000028, Plan 9 uses 000029; stack and functions serve up.
- Task 1: Migration 000029 (voice tables, limits, listening bucket). Commits `8fc5a3a..377d564`; tests: Ran 17 tests across 5 files..
- Task 2: French text for speech (voice-text.ts). Commits `377d564..3aeb745`; tests: Ran 6 tests across 1 file..
- Task 3: Settings and parle-voice-service. Commits `3aeb745..ec3b54d`; tests: Ran 22 tests across 3 files..
- Task 4: The Vercel relay api/voice (NVIDIA Whisper and Magpie). Commits `ec3b54d..295518d`; tests: Ran 6 tests across 1 file..
- Task 5: Speaking task scoring. Commits `295518d..4480e23`; tests: Ran 22 tests across 3 files..
- Task 6: Placement speaking. Commits `4480e23..8df13c1`; tests: Ran 15 tests across 2 files..
- Task 7: Listening audio cache. Commits `8df13c1..8d8224f`; tests: Ran 26 tests across 3 files..
- Task 8: Recorder, client and result card. Commits `8d8224f..355e1a7`; tests: Ran 483 tests across 51 files..
- Task 9: Speaking task panel and placement UI. Commits `355e1a7..0f46742`; tests: Ran 485 tests across 51 files..
- Task 10: Tutor voice, listening buttons, admin prepare audio. Commits `0f46742..ffbe41d`; tests: Ran 487 tests across 52 files..
- Task 11: Admin voice settings. Commits `ffbe41d..0a75ef9`; tests: Ran 489 tests across 53 files..
- Task 12: Privacy and public wording. Commits `0a75ef9..6da0ea2`; tests: Ran 492 tests across 54 files..
- Task 13: Final review and fixes. Final review run before deploy; fixes 6da0ea2..498d9f9.
- Task 14: Production deploy and preview. 0cfb869; migration 000029 applied by the founder; VOICE_RELAY_SECRET in Supabase; Vercel NVIDIA_API_KEY + VOICE_RELAY_SECRET Production+Preview; functions; preview parle-4sopuwstj; smoke 401/405/401.
- Task 15: Live checks. 3c1e49d; live checks pass except the blocked-microphone message, left for the real-phone check; NVIDIA terms pending founder.
- Task 16: Records. 94e844f; R96-R107, A88-A99, decision #57.

## Rulings made during execution (each with what it costs if wrong)

- Task 0: Ruling: baselines from the bank-readers merge (same content as main 8fc5a3a): backend 461 pass / 1 skip / 0 fail, app 449, type errors 62 (list in tsc-baseline.txt, normalized by file + code + message start) — cost if wrong: none.
- Task 4: Ruling: protobufjs's postinstall (a version notice) stays blocked by bun; it is used only to generate the descriptor at dev time — cost if wrong: none.
- Task 6: Ruling: placement.ts's State already ended with bankSource (bank readers), so 'speaking?' is added after it rather than after counts — cost if wrong: none. Two of the three new fn-placement cases passed before the implementation (they pin existing refusals / finish-without-speaking), only the scoring case failed first.
- Task 10: Ruling: the voice prop appears twice in the tutor page; only the one inside <TutorConversationLog> becomes true, as the brief says — cost if wrong: the message bubble keeps showing the browser-voice note.
- Task 12: Ruling: public-info-pages.test pinned 'Speaking is not scored automatically yet.' as required wording; updated to the new speaking sentence in the same commit (the plan's instruction) — cost if wrong: none. Founder approval of the wording pending (asked with the review running); nothing deploys before it.
- Final: Ruling: declined-to-judge items stand (time-zone change resets limits like AI messages; transcript prompt injection only affects oneself, +0.25 max; Riva config from the working spike, checked live in Task 15; NVIDIA terms are a founder step; two tabs on one task) — cost if wrong: small.
- Final: Ruling: recording format preference (WebM before MP4) kept; Task 15 adds a real-iPhone check of recording and playback (the review's caveat) — cost if wrong: iPhone recording fails until the preference changes.
- Task 15: Ruling: the check script opened /learner/today (an unknown address, 'Coming soon'); Today is /learner — fixed in the script — cost if wrong: none.
- Task 15: Ruling: the check script's record() clicked the first 'Stop' button, which on the tutor page is 'Stop reading'; made the match exact — cost if wrong: none.

## Final review

An independent reviewer (opus) read the whole branch before the deploy: 0 Critical, 3 Important, 5 Minor. All three
Important findings were fixed in one pass, each with a test that failed first (commit `498d9f9`):

- Important 1 (failed scoring spends the allowance; no re-score) — fn-voice-limits "an answer left unscored for 15 minutes gives its use back" RED→GREEN; voice-client "afterScoreError" RED→GREEN; panel keeps the ticket for Try again, TASK_CLOSED loads the saved result
- Important 2 (placement speech-to-text unbounded) — fn-voice-limits "placement recordings are capped per learner per day" RED (proved by lifting the cap)→GREEN
- Important 3 (iPhone read-aloud silent, still counted) — voice-playback "one audio element, unlocked by the tap" and "asks for a tap" RED→GREEN; unlock on Listen, read-aloud switch, Send

## Deferred minors (also in `deferred-defects.md` R96-R100 and the inventory A88-A92)

- replays of a reply ('again') allow about 100 TTS calls an hour per account; cap per day or cache reply audio
- a failed listening generation blocks that item for 90 s (AUDIO_BEING_MADE); add a relay-only release
- a 1,100-character speak can take 3 x 30 s and hit Vercel's 60 s limit; one overall budget of about 50 s
- local-only tutor messages (non-UUID ids) call the relay and show 'not available'; skip the relay for them
- placement scoring can reopen a run finished in another tab (save without status guard)

Known items recorded at the same time: R101-R107 (NVIDIA terms, tutor microphone only in speaking mode, phone
read-aloud, one-hour audio links, "Listen slowly" as playback speed, leftover speech-recognition state, the real-iPhone
check).

## Design choices for the founder to confirm

The plan's section "Design choices and rulings made while writing this plan" explains each one and what it costs if
wrong:

1. The browser, not the relay, converts recordings to 16 kHz mono WAV
2. Recordings are sent in parts of at most 60 seconds
3. The relay checks the learner through the backend.
4. A new shared secret `VOICE_RELAY_SECRET`
5. Replies are sent to the browser as MP3 at 48 kbit/s
6. Counting.
7. Six settings, named like the AI ones:
8. Premium is read the way the admin user detail reads it (Plan 8):
9. The learner's day
10. A scored speaking task moves the speaking estimate one step of at most 0.25 toward the scored level
11. Placement speaking uses one prompt
12. NCLC on every speaking result, for every track
13. The tutor's microphone stays where it already was, in speaking practice
14. "Read replies aloud" is saved on the server
15. **Listening audio is made for approved `question_item` listening items and for the learner's own
16. Speaking results live in a new table `speaking_result`
17. "Mostly not French"
18. `vercel.json`
19. Privacy wording:
20. Speaking task cards keep "Mark done" and the tutor link

## Final suite

Backend 507 pass, 1 skip, 0 fail; app 495 pass, 0 fail; type errors 62 (the same list as before the plan); relay type
check 0 errors. Live checks on the preview passed (speaking task at phone width, tutor Listen and voice message, read
aloud, listening audio made once then cached, Free limit of 2 answers); the blocked-microphone message and iPhone
Safari await a real-phone check.
