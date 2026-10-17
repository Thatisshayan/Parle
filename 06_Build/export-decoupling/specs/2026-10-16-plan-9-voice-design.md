# Plan 9 design: voice (natural French voice and scored speaking)

Date: 2026-10-16. Status: **approved by the founder (2026-10-16)**. Author: COO (Claude), with the founder's decisions.
Builds `specs/SPEC-BACKLOG.md` row 3 (voice), in the order of decision #54 (after Plan 8). Builds on the AI tutor
(Module 4), the placement test and weekly plan (Modules 2 and 3), the AI message counter and the admin Settings page.
Decision #16 (AI tutor v1: audio both ways, pronunciation beta, live voice) is split: this plan does the first part;
pronunciation feedback and live voice conversation are Plan 10 or later.

## 1. Purpose and success

Speaking is half of what TEF Canada and TCF Canada test, and today Parle says "speaking is not scored". After Plan 9:
- a learner records a spoken answer to a speaking task or the placement test's speaking section and gets a transcript,
  four criteria scores, a practice level estimate, corrections and a tip;
- the AI tutor reads its French replies aloud in a natural voice and accepts spoken messages;
- listening items that have only a script get natural French audio, made once and reused;
- Free and Premium learners both use voice, within daily limits an administrator can change.

## 2. Decisions this design rests on (founder, 2026-10-16)

| Topic | Decision |
|---|---|
| Scope | Natural voice out and scored speaking now; pronunciation feedback and live voice conversation later |
| Provider | NVIDIA hosted speech (the account already used for the AI tutor): Whisper large-v3 for French transcription, Magpie TTS multilingual, voice `Magpie-Multilingual.FR-FR.Louise`; France French |
| Path | A small Node relay on Vercel (`/api/voice`): NVIDIA's hosted speech is gRPC only, and gRPC does not run in Supabase functions (tested 2026-10-16: the call never connected; the same code worked under Node in about 1 s per call) |
| Surfaces | Speaking tasks, placement speaking, AI tutor replies read aloud and spoken messages, listening audio |
| Access | Everyone, with daily limits: recorded answers Free 2 / Premium 15; tutor voice messages 5 / 60; replies read aloud 20 / 200; placement speaking and cached listening audio never counted |
| Recordings | Transcribed, then discarded: no audio is stored or logged; transcripts are stored like typed answers |

## 3. The relay

- One Vercel serverless function in the app's project, `api/voice` (Node runtime), with two actions:
  - `speak { text }` returns French audio (Magpie, Louise, 22.05 kHz, sent to the browser as compressed audio);
  - `transcribe { audio, duration_ms }` returns `{ transcript }` (Whisper large-v3, language `fr`).
- Every call carries the learner's Supabase access token; the relay verifies it with Supabase (`auth.getUser`) and
  refuses a paused account. The NVIDIA key is a Vercel setting `NVIDIA_API_KEY`, never sent to the browser.
- Before transcribing or speaking, the relay asks the backend to take one unit of the learner's daily limit (a service
  call with a shared secret); the counters live in the database, so the limits hold whichever page calls.
- Limits per call: recordings up to 3 minutes and about 5 MB; text up to about 1,000 characters (longer replies are
  split into sentences by the app). Timeout 30 s, then "Voice is busy. Try again in a moment."
- Audio formats: browsers record WebM/Opus (Chrome, Firefox, Edge) or MP4/AAC (Safari and every iPhone browser, which
  try MP4 first since Plan 11, A99); the relay converts to
  what Whisper accepts (16 kHz mono) before sending.
- Tests use a fake provider (like the Stripe fake): fixed transcripts and a short silent audio file; no NVIDIA calls.

## 4. Scored speaking

### 4.1 Where

- Speaking practice tasks in the weekly plan: the card shows the prompt, Record, a timer, Stop, Re-record, Send.
- The placement test's speaking section, on its existing speaking prompts; its result replaces "speaking not scored".

### 4.2 The result (about 5 to 10 seconds)

1. "What we heard": the transcript.
2. Four criteria, each 0 to 4, from the official TEF/TCF speaking criteria: task completion (answered what was asked,
   at the right length); vocabulary (range and precision); grammar (accuracy and complexity); coherence and fluency
   (linking and structure, plus speaking rate in words per minute, measured from the recording's length).
3. An estimated speaking level (A1 to C1 with the NCLC equivalent), labelled "practice estimate, not an official
   result".
4. Up to three corrections ("You said ... -> better: ...") with a one-line reason, in the learner's explanation
   language.
5. One tip for next time, and the line "Pronunciation isn't scored yet."

### 4.3 Rules

- Under about 10 words or silent: "We couldn't hear enough. Try again." Not scored, not counted.
- Mostly not French: "Answer in French to get a score." Not scored, not counted.
- Re-recording before sending is free; each sent answer counts once.
- A scored speaking task marks the task done, and its estimate feeds the speaking level the weekly plan uses, the
  way writing scores do. Placement speaking sets the starting speaking level.
- Scoring uses the same NVIDIA language model and settings as the AI tutor (`ai_model_standard`), with a fixed rubric
  prompt and a strict answer shape checked on the server; an answer that fails the shape is retried once, then "We
  couldn't score this one. Try again."
- Stored: transcript, the four scores, the estimate, corrections, tip, duration, word count. No audio.

## 5. The AI tutor's voice and listening audio

- Every tutor reply has a Listen button: the reply is split into sentences and the French sentences are spoken in
  order (Magpie speaks France French only; explanations in other languages stay text). Stop at any time.
- A "Read replies aloud" switch in the tutor, off by default, remembered per learner.
- If voice is unavailable (limit reached, or the provider down), Listen falls back to the browser's own voice with a
  small note.
- A microphone button (in Speaking mode only, decision #61) records up to 1 minute; the transcript appears in the message box before sending so the learner
  can fix a mis-hearing. A sent voice message is treated like a typed one (corrections, the AI message count) plus one
  voice message count.
- Listening items with a script and no audio file get audio generated once and cached in Supabase Storage (keyed by
  the item and its script), so replays cost nothing and never count. A failed generation gives its claim back so the next
  request tries again (Plan 11, A89); audio made before the switch to Azure was removed and is made again (A102). Items with a real recording keep it. An admin
  "prepare audio" action fills the cache ahead of time (useful after the Lesson Bank import).
- Accessibility: labelled buttons; a visible timer and recording state; the microphone permission is asked only when
  Record is pressed, with the reason; if it is refused, the task offers to type the answer instead (scored as writing
  practice, marked as such).

## 6. Limits and settings

- New admin settings: `voice_answers_per_day` (Free 2, Premium 15), `voice_messages_per_day` (5, 60),
  `voice_replies_per_day` (20, 200). Counted per learner per day in their time zone, like AI messages; checked on the
  server before each use.
- At the limit: "You've used today's spoken answers. Type your answer, or try again tomorrow." (Premium learners see
  their higher limit; Free learners see an upgrade hint.)
- Not counted: placement speaking, cached listening audio, answers that were too short or not French.

## 7. Privacy

- Audio goes from the browser through the relay to NVIDIA for transcription and is not kept by Parle (not stored,
  not logged). Transcripts are personal data like typed answers and go with account deletion (already covered).
- The app's privacy page gains a short paragraph: voice recordings are sent to NVIDIA for transcription and not kept;
  the wording is shown to the founder before publishing; the lawyer review (D28) includes it.

## 8. Build, testing, checks

- One plan, Plan 9; one migration (voice counters and settings, speaking result fields, the listening audio cache
  table); the relay (`parle-app/api/voice`); backend actions for limits and scoring; the recorder component; speaking
  tasks and placement speaking; tutor Listen and microphone; listening audio caching; admin settings; privacy wording;
  deploy (one founder step: `NVIDIA_API_KEY` in the Vercel project settings); the final review before the deploy.
- Testing: failing test first for each piece, on the local stack with the fake voice provider; cases include too
  short, not French, the limit reached, a paused account refused by the relay, a bad token, Safari's audio format, the
  scoring answer shape, a cached listening item served twice with one generation.
- Checks on the real system (private preview): a generated French sample recorded through the browser's fake
  microphone and scored end to end; a tutor reply read aloud; a microphone message; a listening item cached; a limit
  reached and refused; microphone refused falls back to typing; phone width 375 px.

## 9. Not in Plan 9

Pronunciation feedback; live voice conversation (Premium, monthly minutes); Canadian French voices; replaying one's
own recordings; tutor or admin access to recordings.

## 10. Risks

1. NVIDIA's free developer access may have rate limits or terms that do not allow production use: confirm before
   launch. Fallback: OpenAI transcription and speech behind the same relay (one provider file).
2. Whisper can mishear strong accents: the learner always sees the transcript, and in the tutor can fix it before
   sending.
3. A transcript-based score cannot judge pronunciation; every result says so.
4. Vercel function limits (duration, Hobby plan usage) and audio conversion cost: clips are short; confirm the plan's
   limits during the build.
5. Two places now hold the NVIDIA key (Supabase functions and the Vercel relay): rotate both together.
