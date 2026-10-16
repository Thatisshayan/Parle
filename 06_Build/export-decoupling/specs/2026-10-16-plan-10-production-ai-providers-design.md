# Plan 10: production AI providers (design)

Date: 2026-10-16. Status: SPEC IN REVIEW. Author: COO (Claude). Product owner: the founder.

## 1. Why

NVIDIA's API Trial Terms of Service (read 2026-10-16) allow the build.nvidia.com key "for limited trial purposes only
and without use of the API Service or Generated Content in production" (1.2); production needs a paid subscription
(1.4); NVIDIA may use prompts and outputs to improve its models (3.3 iv). Every AI feature in Parle runs on that key:
the AI tutor, writing and speaking scores, practice items, placement writing (`_shared/ai.ts`, model in `app_setting`,
today `nvidia/nemotron-3-super-120b-a12b`), and Plan 9's voice (Whisper and Magpie through the Vercel relay). These are
launch blockers R101 and R108. No real learner has used them yet (the waitlist is empty), so nothing has to be undone.

Success: before launch, no request from Parle goes to NVIDIA; every AI and speech call goes to a paid provider whose
terms allow production use and do not train on Parle's data; quality and speed are at least as good as today; the
privacy page names the providers; the minimum age is 18.

## 2. Decisions (founder, 2026-10-16)

Source: the provider comparison `spikes/provider-comparison-2026-10-16.md` (official pricing and terms pages).

1. **Text AI: a quality test first, then the founder picks.** Candidates: OpenAI GPT-6 Luna (about $16 per 100 active
   learners a month), Anthropic Claude Haiku 5.5 (about $16), Google Gemini 3.1 Flash-Lite (about $46). The plan builds
   the OpenAI path by default and adds the other adapter only if it wins.
2. **Speech-to-text: Deepgram Nova-3** (`language=fr`), about $47 per 100 learners a month, paid from the $200 sign-up
   credit at first. Every request carries `mip_opt_out=true` so recordings are not used for training ("retained only for
   the duration necessary to process the request").
3. **Text-to-speech: Azure AI Speech, Canada Central**, voice `fr-CA-SylvieNeural` (Canadian French), about $270 per 100
   learners a month (half Deepgram's voice price).
4. **Minimum age 18** (was 16). Google's Gemini API and Moonshot require 18+; OpenAI and Anthropic allow 13 to 17 only
   with extra safeguards. Closes open question 1 in `02_Product/specs/phase-1-mvp/10_cross-cutting.md`.
5. **Read-aloud limits unchanged:** Free 20 a day, Premium 200.

Ruled out: Moonshot direct (trains on data by default, 18+ with consent rules), ElevenLabs (trains unless opted out),
Deepgram for voices (twice the price), Mistral (unclear training default on paid use).

## 3. Text AI

- **One call site.** `completeJson` and the plain-text calls in `_shared/ai.ts` choose a provider from the model setting.
  A model setting is written `provider:model`, for example `openai:gpt-6-luna`, `anthropic:claude-haiku-5-5`,
  `google:gemini-3.1-flash-lite`. A value without a prefix keeps meaning NVIDIA, for local work and the quality test
  only.
- **Adapters, each a small function returning the reply text:**
  - OpenAI: `POST https://api.openai.com/v1/chat/completions`, `Authorization: Bearer OPENAI_API_KEY`, the same messages
    as today; JSON calls add `response_format: { type: "json_object" }`; reasoning set to the lowest level the model
    accepts (settled in the quality test).
  - Anthropic (only if it wins): `POST https://api.anthropic.com/v1/messages`, `x-api-key`, `anthropic-version`,
    `system` separate from `messages`, no `temperature` (current models refuse values below 1).
  - Google (only if it wins): the OpenAI-compatible endpoint
    `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` with `GEMINI_API_KEY`.
- **Unchanged:** the JSON schema check and one retry (`validateJson`), the time budgets, the global daily cap
  (`ai_global_daily_cap`), per-learner limits, the approved-bank fallback for slow practice, the fake provider in tests.
- **Failure:** a provider error answers `AI_UNAVAILABLE` exactly as today; the provider's error body is never logged
  (it can echo the prompt), only the model and the status.

## 4. Speech (the Vercel relay)

The relay already selects a provider (`api/_voice/provider.ts`). Plan 10 splits it into two roles:

- **Transcriber: Deepgram.** `POST https://api.deepgram.com/v1/listen?model=nova-3&language=fr&smart_format=true&mip_opt_out=true`,
  `Authorization: Token DEEPGRAM_API_KEY`, body the 16 kHz mono WAV part (at most 60 s, unchanged), transcript from
  `results.channels[0].alternatives[0].transcript`. The opt-out is built into the request builder, and a test fails if
  any request lacks it.
- **Speaker: Azure.** `POST https://canadacentral.tts.speech.microsoft.com/cognitiveservices/v1`,
  `Ocp-Apim-Subscription-Key: AZURE_SPEECH_KEY`, `Content-Type: application/ssml+xml`,
  `X-Microsoft-OutputFormat: raw-22050hz-16bit-mono-pcm` (the relay's existing rate, so the MP3 step is unchanged),
  `User-Agent: parle-voice`. The SSML escapes the text (`&`, `<`, `>`, quotes) and sets `xml:lang="fr-CA"` and the voice.
  Pieces stay at most 400 characters.
- **Settings (Vercel, Sensitive, Production and Preview):** `DEEPGRAM_API_KEY`, `AZURE_SPEECH_KEY`,
  `AZURE_SPEECH_REGION` (`canadacentral`), `VOICE_TTS_VOICE` (default `fr-CA-SylvieNeural`). `VOICE_PROVIDER=fake` stays
  for tests. NVIDIA stays selectable only off Vercel, for comparison.
- **Unchanged:** the 30 s timeout and "Voice is busy", the 60 s parts, counting, the listening-audio cache (already-cached
  NVIDIA files may stay; the admin can prepare audio again), the browser's recording and conversion.

## 5. The quality test (before the founder picks the text model)

Extend `scripts/ai-bakeoff.ts` to call the three candidates through the new adapters with the founder's keys (never
printed). Tasks: the four existing prompts (A2 writing score JSON, AI lesson with 3 practice items JSON, an explanation
in Persian, B1 check-in score JSON) plus an explanation in Arabic, a tutor reply in French at A2, and a speaking score
from a transcript (the Plan 9 shape). Each task three times per model. The report records time, valid JSON or not, and
the answers, so the founder (and native speakers for Persian and Arabic, if available) can judge. The cheapest model
that passes every JSON task, keeps tutor replies under 15 s, and gives acceptable explanations wins; the founder decides.

## 6. Minimum age 18

- Sign-up: "I confirm that I am 18 years old or older." and "Confirm that you are at least 18 years old to create an
  account."; the onboarding note says 18+. The server keeps requiring the confirmation (`age_confirmed`).
- Existing accounts: test accounts only; no migration.
- The phase-1 specs' "Minimum age 16" lines are updated with a pointer to decision #58.

## 7. Privacy wording (founder approval before deploy)

`legal.privacyVoiceBody` today names NVIDIA. New draft:

> When you record an answer or a voice message, the recording is sent to Deepgram, the company that provides Parle's
> speech recognition, to be turned into text; Deepgram does not keep it or use it to train its models. Parle does not
> store or log your recordings. The text of what you said is saved with your practice history, like a typed answer, and
> is deleted when you delete your account. Replies read aloud are made from text by Microsoft Azure in Canada and are
> not linked to your recordings.

Plus one new paragraph `legal.privacyAiBody`: "Parle's AI tutor and scores use [the chosen provider]. What you write to
the tutor is sent to it to produce a reply; it does not use your messages to train its models. Parle keeps your
conversation in your account until you delete it." Both go to the founder before deploy and into the lawyer review
(D28).

## 8. Founder steps (accounts and keys)

1. Create paid API accounts: OpenAI (API platform), Anthropic (Console), Google AI Studio (billing on, so the paid
   terms apply), Deepgram (the $200 credit), Azure (a Speech resource in Canada Central, standard tier S0).
2. Set a monthly spending limit or alert on each account (suggested: $50 each until launch).
3. Save each key into `C:\Users\AgentDev\.parle-secrets\` (Claude opens Notepad on an empty file per key, as before);
   Claude never prints them.
4. After the switch is checked: delete `NVIDIA_API_KEY` from Supabase and Vercel, and the unused keys of the losing
   text providers from their dashboards.

## 9. Testing and checks

- Unit tests (fetch faked) for each adapter: the request shape, the reply parsing, a provider error giving
  `AI_UNAVAILABLE` or `VOICE_BUSY`, the key never in a log line; Deepgram's `mip_opt_out=true` on every request; Azure's
  SSML escaping of `<`, `&` and quotes; the `provider:model` routing and the NVIDIA fallback.
- The existing suites stay green (they run on the fake providers).
- Live checks on the preview: a tutor session (reply under 15 s), a writing score, a practice card, placement writing,
  a spoken answer scored, Listen in the Canadian voice, a listening item prepared again, the Free limits; and a check
  that no request reaches NVIDIA (Supabase and Vercel logs; the NVIDIA key removed).
- Measured times recorded against today's NVIDIA numbers.

## 10. Risks

1. **Deepgram's opt-out price.** Its docs mention a pricing impact for opting out without an amount. Check the first
   usage line in the Deepgram console (or ask support) before launch; if it is large, OpenAI transcription ($0.0045/min,
   no training on API data) is a drop-in second transcriber behind the same relay.
2. **Persian and Punjabi quality** is not published by any provider; the quality test shows real answers.
3. **Provider outages:** one provider per role; a failure shows the existing "not available" messages and the approved
   bank. A second provider can be added later behind the same switch.
4. **Keys in two places:** text keys in Supabase only; speech keys in Vercel only; `VOICE_RELAY_SECRET` unchanged.

## 11. Not in Plan 10

Pronunciation scoring (Azure has an API for it: a later plan), live voice conversation, Vertex AI or other Canadian
hosting of the text model, a second provider per role for failover, teen accounts (13 to 17).
