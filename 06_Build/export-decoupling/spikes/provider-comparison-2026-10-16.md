# Parle: paid AI provider comparison (text LLM + speech)

Research date: 2026-10-16. Sources are official provider pages unless marked otherwise. All prices are USD list prices (pay-as-you-go, standard tier) as fetched today. "Not confirmed" means I could not verify it on an official page.

Important caveat about how I read the pages: several pricing pages render with JavaScript, and I read them through a fetch tool that summarises the page. For OpenAI, I checked the newest model rows (gpt-6-luna, gpt-6.1-sol, gpt-transcribe, gpt-4o-mini-transcribe) against the raw HTML. Older OpenAI rows (gpt-5-mini, gpt-5.4-mini, gpt-4.1-mini, TTS) come only from the rendered summary. Re-check any number before it goes into a budget.

---

## 0. Usage profile and assumptions

**Text, per active learner per day:**
- 10 chat messages × (1,500 in + 400 out) = 15,000 in + 4,000 out
- 3 scoring calls × (2,500 in + 800 out) = 7,500 in + 2,400 out
- Total = 22,500 input + 6,400 output tokens per day

**Per 100 learners × 30 days:** 67.5M input + 19.2M output tokens.

Formula: monthly cost = 67.5 × (input $/1M) + 19.2 × (output $/1M).

Assumptions:
- No prompt caching. Caching would cut input cost a lot, because the system prompt and rubric repeat on every call.
- No batch discount.
- Reasoning ("thinking") tokens are excluded. Thinking models bill thinking as output tokens, so the estimate is a floor for any model run with reasoning on.

**Speech, per active learner per day:**
- STT: 2 × 60 s + 5 × 20 s = 220 s = 3.67 min. Per 100 learners × 30 days = **11,000 audio minutes**.
- TTS: 20 replies × 300 characters = 6,000 characters. Per 100 learners × 30 days = **18,000,000 characters**.
- Listening audio is cached and ignored. Free monthly allowances are ignored, since they are small at this volume.

---

## A. TEXT LLM

### A1. Prices and monthly cost (100 active learners, 30 days)

| Provider / model | Input $/1M | Output $/1M | **Est. $/month per 100 learners** | Source |
|---|---|---|---|---|
| **OpenAI gpt-6-luna** | 0.10 | 0.50 | **$16.35** | OpenAI pricing (raw HTML checked) |
| OpenAI gpt-5.6-luna | 0.20 | 1.20 | $36.54 | OpenAI pricing (rendered summary only) |
| OpenAI gpt-5-mini | 0.25 | 2.00 | $55.28 | OpenAI pricing |
| OpenAI gpt-4.1-mini | 0.40 | 1.60 | $57.72 | OpenAI pricing |
| OpenAI gpt-5.4-mini | 0.75 | 4.50 | $137.03 | OpenAI pricing |
| OpenAI gpt-5.6-terra | 2.00 | 12.00 | $365.40 | OpenAI pricing (rendered summary only) |
| **Anthropic Claude Haiku 5.5** (prompts ≤100K tokens) | 0.10 | 0.50 | **$16.35** | Claude pricing doc |
| Anthropic Claude Haiku 4.5 | 1.00 | 5.00 | $163.50 | Claude pricing doc |
| Anthropic Claude Sonnet 5.5 | 2.00 | 10.00 | $327.00 | Claude pricing doc |
| Google Gemini 3.8 Flash (to 2026-12-31) | 0.75 | 3.75 | $122.63 | Gemini API pricing (page dated 2026-10-15) |
| Google Gemini 3.8 Flash (from 2027-01-01) | 1.50 | 7.50 | $245.25 | same |
| Google Gemini 3.5 Flash-Lite | 0.30 | 2.50 | $68.25 | same |
| Google Gemini 3.1 Flash-Lite | 0.25 | 1.50 | $45.68 | same |
| Mistral Small 4 | 0.15 | 0.60 | $21.65 | Mistral docs pricing |
| Mistral Large 4 ("sale" price) | 0.68 | 2.09 | $86.03 | same |
| Mistral Medium 3.5 | 1.50 | 7.50 | $245.25 | same |
| Moonshot kimi-k3 (first-party) | 3.00 | 15.00 | $490.50 | platform.kimi.ai pricing |
| Moonshot kimi-k2.6 (first-party, cache miss) | 0.95 | 4.00 | $140.93 | same |
| Together AI kimi-k3 | 2.70 | 13.50 | $441.45 | Artificial Analysis provider table; third-party report of a 2026-10-06 price cut (not confirmed on Together's own page) |
| Fireworks kimi-k3 | 3.00 | 15.00 | $490.50 | third-party listing (not confirmed on Fireworks' page) |
| OpenRouter (any model) | provider price | provider price | provider price + 5.5% card fee on credits | OpenRouter FAQ |

Notes on the table:
- **OpenAI data residency:** regional-processing endpoints add 10% for models released on or after 2026-03-05.
- **Anthropic US-only inference** (`inference_geo: "us"`) costs 1.1× on Claude 4.6 and later models.
- **Claude Haiku 5.5 long prompts:** for prompts over 100K tokens the price rises to $0.50/$2.50. Parle's prompts are far below that.
- **Gemini 3.8 Flash** doubles in price on 2027-01-01, according to the pricing page.
- **The current setup costs the most.** Kimi K3 is the most expensive option, about 30× Haiku 5.5 or gpt-6-luna.

### A2. Terms, data, region, onboarding

| Provider | Production use for end users | Trains on API data by default? | Retention | Region options relevant to Canada | Age / minors (learners may be 16-17) | Free tier / new-account limits / verification |
|---|---|---|---|---|---|---|
| **OpenAI** | Yes | **No.** "data sent to the OpenAI API is not used to train or improve OpenAI models" unless you opt in | Abuse-monitoring logs kept 30 days. Zero Data Retention available on approval. | Data residency in US, Europe, **Canada (storage only; processing in Canada = "No")**, and other regions. Requires approval from OpenAI sales; non-US regions also need a Modified Retention amendment. | Allowed with safeguards. The Under-18 API Guidance requires age-appropriate content filters, AI disclosure, monitoring and escalation, and age assurance. **Under-13 personal data requires Zero Data Retention first.** No ZDR requirement for ages 13-17. | Tiers: Free ($100/mo cap, eligible regions); Build after $5 of credit purchases ($500/mo cap); Launch after $100 ($5,000/mo); Grow after $500. No organization-verification requirement found for text models (not confirmed for every model). |
| **Anthropic (Claude API)** | Yes | **No.** Commercial Terms: "Anthropic may not train models on Customer Content from Services." | Inputs and outputs deleted within 30 days by default. ZDR by arrangement. | Inference geo: `global` (default) or `us` only. Workspace storage geo: `us` only. **No Canada or EU option.** | Allowed. The "organizations serving minors" guidelines require age verification and content filtering where appropriate, AI disclosure, and compliance with child-privacy law. Anthropic may audit. | Start tier spend cap $500/mo, then Build ($1,000/mo) and Scale ($200K/mo). New organizations may begin in a lower "Evaluation" tier. Start tier for Haiku 5.5: 1,000 RPM / 2M ITPM / 400K OTPM. |
| **Google Gemini API (AI Studio key)** | Yes, on Paid Services | Paid: **No**, though prompts are "logged for a limited period" for abuse detection (number of days not stated). Unpaid/free tier: **Yes**, human reviewers may read it. | "Limited period" (not confirmed in days) | Gemini API: no region choice. **Vertex AI** (Google Cloud) has a Montreal region, `northamerica-northeast1`, with data residency, but the list of Gemini models available there is older (not confirmed for 3.x). | **BLOCKER:** "You must be 18 years of age or older to use the APIs." "You also will not use the Services as part of a website, application, or other service... that is directed towards or is likely to be accessed by individuals under the age of 18." (Gemini API Additional Terms, last modified 2026-03-23.) | Free tier exists, but its data is used for training. Tier 1 needs a linked billing account; Tier 2 needs $100 paid + 3 days. Spend caps: Tier 1 $10 per 10 min, Tier 2 $50 per 10 min. Exact RPM numbers are shown only in the AI Studio console. |
| **Mistral** | Yes | **Ambiguous.** Commercial Terms (effective 2026-09-25) §4.2: no training "except when you... have not opted-out of training on a Mistral AI Product set to opt-in by default." The help centre says Studio free mode trains by default with opt-out, and pay-as-you-go customers "have the right to opt out at any time". Labs and Preview models are always trainable (§4.3). **Action: toggle the opt-out explicitly.** | Not stated in the terms (DPA governs). A third-party report says 30 days (not confirmed). | EU (France) company. Hosting location not stated in the terms (not confirmed). | §2.2(c): do not include personal information of children under 13 "or allow minors to use the Mistral AI Products without legally adequate consent from their parent or guardian". **This is relevant for 16-17-year-olds.** | Free "Experiment"/free mode, which trains on data unless you opt out. Limits not confirmed. |
| **Moonshot / Kimi (platform.kimi.ai)** | Yes. The licence allows integrating into Customer Applications offered to End Users. | **YES.** "Unless otherwise expressly agreed in writing, Customer Content may be used" to develop and improve the Services. Opt-out only via an enterprise arrangement. (ToS effective 2026-07-30) | Not specified | Operated by Moonshot AI PTE. LTD. (Singapore). Storage location not stated in the ToS; a third-party report says Singapore servers (not confirmed). | Individuals must be 18+. Do not send personal information of children under 14, or allow minors to use the Services without parental or guardian consent. | Not confirmed |
| **OpenRouter** | Yes | Depends on the routed provider. Prompts are not logged by OpenRouter by default, and routing avoids providers that train unless you enable it. | ZDR routing option available | Depends on provider | Depends on provider's terms | 5.5% fee on card credit purchases ($0.80 minimum). Free models: 50 req/day, or 1,000/day after buying $10. |
| **Together / Fireworks** | Yes | Not confirmed (not fetched) | Not confirmed | US hosting (not confirmed) | Not confirmed | Not confirmed |

### A3. Integration fit: OpenAI-compatible endpoint, strict JSON, speed

| Provider | OpenAI-compatible `/v1/chat/completions`? | JSON mode / strict schema | Speed: Artificial Analysis (output tok/s; latency = time to first chunk) |
|---|---|---|---|
| OpenAI | Native | `response_format: json_schema` with `strict: true` (Structured Outputs) | **GPT-6 Luna:** non-reasoning 117 tok/s, **0.94 s**; low reasoning 120 tok/s, 2.14 s; high reasoning 18.9 s. GPT-5.6 Terra: non-reasoning 116 tok/s, 0.76 s. GPT-5.4 mini, GPT-5 mini and GPT-4.1 mini were not listed on the leaderboard today. |
| Anthropic | Yes, at `https://api.anthropic.com/v1/`, but Anthropic says it is "not considered a long-term or production-ready solution". Through it, **`response_format` is ignored**, tool `strict` is ignored, and on Claude 4.7+ any `temperature` below 1 returns a 400 error. **Parle's code sends `temperature`, so it would break.** | Strict Structured Outputs only on the native Messages API, so it needs a small adapter. | **Haiku 5.5:** 183-237 tok/s. Latency depends on reasoning effort: low 6.85 s, medium 10.6 s, high 23.7 s, max 329 s. Thinking is on by default on Claude 5 models; I could not confirm whether it can be fully disabled. Sonnet 5.5: low effort 1.26 s, 110 tok/s. |
| Google Gemini | Yes, at `https://generativelanguage.googleapis.com/v1beta/openai/` | Structured outputs supported via `response_format` (Pydantic/Zod parse) | Gemini 3.8 Flash (high): 147 tok/s, 23.6 s. Gemini 3.5 Flash-Lite: 446 tok/s, 6.98 s. Thinking cannot be disabled on Gemini 3 models (only "minimal"/"low"). |
| Mistral | Yes (chat completions API) | `json_schema` with `strict: true` supported, plus a separate JSON mode | Mistral Small 4: 181 tok/s, **0.85 s**. Mistral Medium 3.5: 165 tok/s, 2.28 s. Mistral Large 4 Preview: 71 tok/s, 1.55 s. **But** their Intelligence Index scores are low: 11, 14 and 38 against Haiku 5.5 at 29-43 and Luna at 18-38. |
| Moonshot Kimi | Yes, at `https://api.moonshot.ai/v1` | `json_object` only; **no strict `json_schema`** documented | Kimi K3 first-party: **44 tok/s, 3.6 s TTFT** (slowest here). Other hosts of K3: Baseten 123 tok/s / 0.98 s, Fireworks 91 tok/s / 1.03 s, Together 51 tok/s / 1.27 s. |
| OpenRouter / Together / Fireworks | Yes | Passes through where the provider supports it | Depends on host (see Kimi row) |

**Latency against the timing limits** (150 s function limit, tutor reply under ~15 s, background items within 40 s):
- With reasoning off or low, every model above except first-party Kimi should return a 400-800-token reply well under 15 s. Example: at ~120 tok/s, 800 tokens is about 7 s plus about 1 s to first token.
- High or max reasoning modes (Haiku high is about 24 s TTFT; GPT-6 Luna high about 19 s) would break the 15 s tutor target. Keep reasoning low or off for chat. Use low or medium only for scoring.
- First-party Kimi K3 at 44 tok/s needs about 18 s for 800 output tokens. That fits the earlier 20-90 s experience on NVIDIA.
- These Artificial Analysis figures are benchmark medians, not Parle measurements. Run a 50-call smoke test from the edge-function region before committing.

### A4. Explanation quality in learners' own languages (Persian, Arabic, Hindi, Punjabi, Spanish, Mandarin)

- **Anthropic** is the only provider here with an official per-language table, and it covers older models (MMLU relative to English = 100%). Claude Haiku 4.5 with extended thinking scores: Spanish 96.4%, French 95.7%, Chinese (Simplified) 94.2%, Arabic 92.5%, Hindi 92.4%. Sonnet 4.5 scores 96.7-98.2% on those languages. **Persian and Punjabi are not benchmarked.** No table exists yet for Haiku 5.5 (not confirmed).
- **Artificial Analysis Multilingual Index** covers 16 languages, including Chinese, Hindi, Spanish, French and Arabic, but **not Persian or Punjabi**. None of the candidate models (Haiku 5.5, GPT-6 Luna, Gemini 3.8 Flash, Mistral, Kimi K3) appeared on it today. Its 2026 top models are Gemini 3.1 Pro, Claude Opus 4.6 and Opus 4.5.
- **OpenAI, Google, Mistral, Moonshot:** no official per-language quality data found for the current small models (not confirmed). Mistral's documentation and branding emphasise European languages. I found no official evidence for Persian or Punjabi quality from any provider.
- **Recommendation:** run a small in-house evaluation of about 20 grammar explanations in each of the 6 languages, rated by native speakers, on the two finalists before launch. Persian and Punjabi are the highest-risk languages.

---

## B. SPEECH

### B1. Speech-to-text

| Provider / model | Price | **$/month per 100 learners (11,000 min)** | French | Per-request limits | Training / retention | Region |
|---|---|---|---|---|---|---|
| **OpenAI gpt-transcribe** (recommended model) | $0.0045/min | **$49.50** | Yes (`fr`) | File ≤25 MB. Formats mp3, mp4, mpeg, mpga, m4a, wav, webm. A 60 s 16 kHz mono 16-bit WAV is about 1.9 MB, so this is fine. | No training; 30-day abuse logs | Canada storage-only residency (sales approval) |
| OpenAI gpt-4o-mini-transcribe | $0.003/min | $33.00 | Yes | same | same | same |
| OpenAI gpt-4o-transcribe / whisper-1 | $0.006/min | $66.00 | Yes | same | same | same |
| **Azure AI Speech: fast transcription** | $0.36/hr = $0.006/min (Canada Central retail price) | **$66.00** | fr-FR and **fr-CA** | Fast transcription supports fr-CA. Real-time REST for short audio is limited to about 60 s per request (from memory; not re-confirmed today). | "When doing real-time speech to text, fast transcription, pronunciation assessment... Microsoft does not retain or store the data." No training. | **Canada Central / Canada East** regions |
| Azure real-time STT | $1.00/hr = $0.0167/min | $183.33 | fr-FR, fr-CA | | same | same |
| Azure batch STT | $0.18/hr = $0.003/min | $33.00 (asynchronous, so too slow for interactive use) | | | customer-controlled storage | same |
| Google Cloud STT V2 (standard, includes Chirp) | $0.016/min (0-500K min); 1-yr savings plan $0.0144; 3-yr $0.0128 | $176.00 | fr-FR, fr-CA | not confirmed | Data logging is **opt-in**; by default no logging or training | Montreal region exists (Chirp 3 listed there) |
| Google STT dynamic batch | $0.003/min | $33.00 (not interactive) | | | | |
| ElevenLabs Scribe v2 | $0.22/hr = $0.00367/min | $40.33 (plus plan) | Yes | not confirmed | Uses content for training unless you opt out in settings. Zero Retention Mode exists (eligibility not confirmed). | EU residency option per their blog (not confirmed) |
| Deepgram Nova-3 pre-recorded | Monolingual $0.0043/min; multilingual $0.0052/min | $47.30 / $57.20 | French supported (not re-confirmed for Nova-3) | not confirmed | **Model Improvement Program:** `mip_opt_out` defaults to false, so data may be used for training unless you send `mip_opt_out=true`. Deepgram's docs mention a "pricing impact" for opting out; amount not confirmed. | US, plus EU/AU/IN endpoints (no Canada found) |
| **Groq whisper-large-v3** | $0.111/hr = $0.00185/min | **$20.35** | Yes | ≤25 MB (free) or 100 MB (dev). **10 s minimum billed per request** (20 s clips are fine). | No training; no retention by default; ZDR toggle | US (not confirmed) |
| Groq whisper-large-v3-turbo | $0.04/hr = $0.00067/min | $7.33 | Yes | same | same | same |
| Mistral Voxtral Mini Transcribe 2 | $0.003/min | $33.00 | Yes | not confirmed | See Mistral training ambiguity above | EU company |

Extra for "scored speaking": Azure AI Speech offers **Pronunciation Assessment** (fr-FR and fr-CA support listed). Its price is not confirmed; it may be billed as STT time. None of the other providers offer a pronunciation-scoring API.

### B2. Text-to-speech

| Provider / model | Price per 1M chars | **$/month per 100 learners (18M chars)** | French voices | fr-CA? | MP3? | Notes |
|---|---|---|---|---|---|---|
| **Azure Neural TTS** | $15 (Canada Central retail) | **$270** | fr-FR: Denise, Henri, Vivienne/Remy/Lucien Multilingual, plus about 11 more | **Yes:** fr-CA-SylvieNeural, JeanNeural, AntoineNeural, ThierryNeural | Yes (Azure output formats include mp3; from memory) | Free F0 tier: 0.5M chars/mo. No data persisted in TTS. |
| Azure Neural HD (DragonHD) | $22 | $396 | fr-FR Vivienne/Remy HD | **Yes:** Sylvie and Thierry DragonHD | Yes | |
| **OpenAI tts-1** | $15 | **$270** | Yes (50+ languages; voices "optimized for English") | No regional French accents documented | **Yes, MP3 is the default** | Must disclose to users that the voice is AI-generated. |
| OpenAI tts-1-hd | $30 | $540 | same | No | Yes | |
| OpenAI gpt-4o-mini-tts | $0.60/1M text tokens in + $12/1M audio tokens out | about $300 (my estimate, assuming about 15 chars/s and about $0.015/min; not confirmed) | same; tone can be steered with instructions | No | Yes | OpenAI recommends voices "marin" and "cedar" |
| Google Cloud Neural2 | $16 | $288 | Yes | **Yes** (fr-CA-Neural2-*) | Yes (MP3 encoding is a standard API option; not re-fetched) | Free: 1M chars/mo |
| Google Cloud Chirp 3: HD | $30 | $540 | Yes | **Yes** (fr-CA-Chirp3-HD-*) | Yes | Free: 1M chars/mo |
| Google Cloud Standard / WaveNet | $4 (page shows $4 for both; **WaveNet at $4 looks odd**, since both rows share the same SKU) | $72 | Yes | **Yes** | Yes | Free: 4M chars/mo; lower quality |
| ElevenLabs Flash/Turbo | $40 ($0.04 per 1K) | $720 | Yes (multilingual) | Canadian-accent voices not confirmed | Yes | **ToS: users must be 18+** (account holder). Applicability to an app's end users not confirmed. Training unless you opt out. |
| ElevenLabs v3/v4 | $80 | $1,440 | Yes | not confirmed | Yes | |
| Deepgram Aura-2 | $30 ($0.030 per 1K) | $540 | Yes (French added 2026-01) | not confirmed | Yes (from memory) | Same data-use caution (MIP) |
| Mistral Voxtral TTS | $16 | $288 | Yes (9 languages incl. French, Hindi, Arabic). Preset voices include "French dialects" | not confirmed | Yes (pcm, wav, mp3, flac, opus; third-party docs) | Voice cloning. Mistral training ambiguity applies. |
| Groq TTS | not confirmed | — | not confirmed | — | — | Not evaluated |

### B3. Combined speech cost per 100 learners per month (STT + TTS)

| Combination | STT | TTS | Total |
|---|---|---|---|
| Azure fast transcription + Azure Neural (fr-CA voices) | $66 | $270 | **$336** |
| Azure fast transcription + Azure HD (fr-CA HD) | $66 | $396 | $462 |
| OpenAI gpt-transcribe + tts-1 | $49.50 | $270 | **$319.50** |
| OpenAI gpt-4o-mini-transcribe + tts-1 | $33 | $270 | $303 |
| Groq whisper-large-v3 + Azure Neural | $20.35 | $270 | $290.35 |
| Google STT V2 + Google Neural2 (fr-CA) | $176 | $288 | $464 |
| Mistral Voxtral STT + Voxtral TTS | $33 | $288 | $321 |
| ElevenLabs Scribe + Flash TTS | $40 | $720 | $760 |

**TTS is about 80% of speech cost.** The cheapest lever is caching repeated tutor phrases and capping read-aloud length.

---

## C. Recommendation

### Text: top 2
1. **OpenAI**: gpt-6-luna for tutor chat (about $16/100 learners/mo), with gpt-5.4-mini or gpt-5.6-terra kept as the scoring model if Luna's rubric accuracy proves too weak in testing.
   - **Drop-in:** same `/v1/chat/completions` shape Parle already uses, with strict `json_schema`.
   - **Fast:** about 0.9 s TTFT and about 117 tok/s with reasoning off.
   - **Data:** no training by default, 30-day retention.
   - **Minors:** 13-17 allowed with documented safeguards.
   - **Canada:** a data-storage option exists (sales approval).
2. **Anthropic Claude Haiku 5.5**: same price as Luna, no training, minors allowed with safeguards.
   - **Multilingual:** the only provider with official multilingual evidence (Arabic and Hindi above 92% of English on the previous Haiku).
   - **Cost:** it needs a small native Messages API adapter, because the OpenAI-compatible layer ignores `response_format` and rejects `temperature` below 1.
   - **Latency:** with reasoning on by default, latency is higher than Luna's (about 7 s TTFT at low effort).
   - **Region:** US or global only.

**Rejected:**
- **Gemini API:** 18+ and no apps likely accessed by under-18s.
- **Moonshot first-party:** trains on data by default, needs an enterprise deal to opt out, 18+ or parental consent, slowest, most expensive.
- **Mistral as primary:** low benchmark scores for Small and Medium, an ambiguous training default, and a parental-consent clause for minors. It is a reasonable fast EU fallback.

### Speech: top 2
1. **Azure AI Speech** (Canada Central/East): about $336/100 learners/mo.
   - Real **fr-CA voices** (Sylvie, Jean, Antoine, Thierry, with HD versions).
   - **Canadian region.**
   - No storage of audio for real-time or fast transcription; no training.
   - Pronunciation Assessment for scored speaking.
   - MP3 output.
2. **OpenAI audio** (gpt-transcribe + tts-1 or gpt-4o-mini-tts): about $320/100 learners/mo.
   - Same vendor, key and data terms as the text model.
   - 25 MB per file easily fits 60 s WAV parts.
   - MP3 by default.
   - But no fr-CA accent, and the AI-voice disclosure is required.

**Alternative:** Groq whisper-large-v3 is the cheapest good STT ($20/mo) with no retention, but has no Canadian region and no French TTS confirmed.

---

## D. Blocking or important terms issues

1. **Google Gemini API: hard blocker.** Users must be 18+, and you may not use it in an app "directed towards or is likely to be accessed by individuals under the age of 18". The free tier also trains on data. Vertex AI (Google Cloud) has different terms and a Montreal region, but I did not verify Vertex's minor-related terms or which Gemini 3.x models it offers in Canada.
2. **Moonshot/Kimi first-party:** trains on Customer Content by default, with opt-out only via an enterprise agreement. Users must be 18+, and minors need parental consent. This is the provider closest to today's setup and the worst on terms.
3. **Mistral:** minors may not use the products "without legally adequate consent from their parent or guardian". The training default is ambiguous for pay-as-you-go, and Labs/Preview models always train.
4. **ElevenLabs:** 18+ in the general ToS, and trains unless you opt out.
5. **Deepgram:** the Model Improvement Program is on unless `mip_opt_out=true`, with an unspecified price impact.
6. **OpenAI:** for under-13 personal data, ZDR is mandatory first. Not relevant if Parle is 16+ only, but the 13-17 safeguards (age-appropriate filters, disclosure, monitoring, age assurance) apply. The TTS AI-voice disclosure is mandatory.
7. **Anthropic:** the minors guidelines apply (age verification and filters where appropriate, AI disclosure, child-privacy compliance). No data residency outside the US.

## E. Not confirmed

- **OpenAI prices:** only gpt-6-luna and the transcribe models were checked against raw HTML; the older text rows and the TTS prices come from the rendered summary.
- **gpt-4o-mini-tts:** the per-minute estimate is mine.
- **Gemini:** the paid-tier log retention period in days; the Gemini 3.x models available in Vertex's Montreal region.
- **Mistral:** API retention period, hosting location, the default training state for pay-as-you-go, and rate limits.
- **Moonshot:** storage location; rate limits for new accounts.
- **Together / Fireworks:** data policies, and Kimi K3 prices on their own pages (the figures come from third-party listings).
- **Google:** the WaveNet price shows $4 on today's page, which looks like a page error.
- **Azure:** the 60 s real-time REST limit and MP3 format list (from memory), and Pronunciation Assessment pricing.
- **Speech providers:** Deepgram's opt-out price impact, ElevenLabs end-user age rules and ZDR eligibility, Groq TTS French support, fr-CA voices for ElevenLabs, Deepgram and Voxtral.
- **Multilingual:** no official per-language quality data for Persian or Punjabi from any provider; no current per-language data for any of the shortlisted 2026 small models.
- **Latency:** the Artificial Analysis figures are benchmark medians (latency = time to first chunk, which includes reasoning time), not measurements from Parle's edge region.

---

## Sources

**OpenAI**
- Pricing: https://developers.openai.com/api/docs/pricing
- Your data / residency / retention: https://developers.openai.com/api/docs/guides/your-data
- Under-18 API guidance: https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance
- Speech-to-text guide: https://developers.openai.com/api/docs/guides/speech-to-text
- Text-to-speech guide: https://developers.openai.com/api/docs/guides/text-to-speech
- Rate limits / tiers: https://developers.openai.com/api/docs/guides/rate-limits

**Anthropic**
- Pricing: https://platform.claude.com/docs/en/about-claude/pricing and https://claude.com/pricing
- Data residency: https://platform.claude.com/docs/en/manage-claude/data-residency
- Commercial retention, 30 days: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
- API and data retention / ZDR: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
- Commercial Terms (effective 2025-06-17): https://www.anthropic.com/legal/commercial-terms
- Minors guidelines: https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors
- OpenAI SDK compatibility limits: https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk
- Rate limits: https://platform.claude.com/docs/en/api/rate-limits
- Multilingual support: https://platform.claude.com/docs/en/build-with-claude/multilingual-support

**Google**
- Gemini pricing (2026-10-15): https://ai.google.dev/gemini-api/docs/pricing
- Gemini API Additional Terms (2026-03-23): https://ai.google.dev/gemini-api/terms
- OpenAI compatibility: https://ai.google.dev/gemini-api/docs/openai
- Rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Vertex data residency: https://cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency
- STT pricing: https://cloud.google.com/speech-to-text/pricing
- TTS pricing: https://cloud.google.com/text-to-speech/pricing
- STT data logging: https://docs.cloud.google.com/speech-to-text/docs/data-logging
- Voices: https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types

**Mistral**
- Pricing: https://docs.mistral.ai/inference/pricing and https://mistral.ai/pricing
- Commercial Terms (effective 2026-09-25): https://legal.mistral.ai/terms/commercial-terms-of-service
- Training help article: https://help.mistral.ai/en/articles/323757-do-you-use-my-user-data-to-train-your-artificial-intelligence-models
- Structured outputs: https://docs.mistral.ai/capabilities/structured-output/custom_structured_output/

**Moonshot / Kimi**
- Pricing: https://platform.kimi.ai/docs/pricing/chat
- Terms (effective 2026-07-30): https://platform.kimi.ai/docs/agreement/modeluse
- JSON mode: https://platform.kimi.ai/docs/guide/use-json-mode-feature-of-kimi-api

**Aggregators**
- OpenRouter FAQ: https://openrouter.ai/docs/faq

**Azure**
- Speech pricing page: https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/
- Retail Prices API (Canada Central, queried 2026-10-16): https://prices.azure.com/api/retail/prices
- Language support: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts
- STT data privacy (updated 2026-08-26): https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/speech-to-text/data-privacy-security

**Other speech providers**
- ElevenLabs API pricing: https://elevenlabs.io/pricing/api
- ElevenLabs terms: https://elevenlabs.io/terms-of-use and https://elevenlabs.io/elevenapi-terms (updated 2026-10-09)
- Deepgram pricing: https://deepgram.com/pricing
- Deepgram MIP: https://developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program
- Deepgram Aura-2 French: https://deepgram.com/learn/aura-2-now-speaks-dutch-french-german-italian-japanese
- Groq STT docs and prices: https://console.groq.com/docs/speech-to-text
- Groq data: https://console.groq.com/docs/your-data (via search summary)

**Benchmarks (third-party, reputable)**
- Artificial Analysis models leaderboard: https://artificialanalysis.ai/leaderboards/models
- Kimi K3 providers: https://artificialanalysis.ai/models/kimi-k3/providers
- Multilingual index: https://artificialanalysis.ai/models/multilingual
