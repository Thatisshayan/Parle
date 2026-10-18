# AI and Speech Provider Budget and Alert Readiness — Parle

**Status:** engineering proposal for founder/finance/operations review; provider caps and alert delivery are not configured or verified.
**Date:** 2026-10-18
**Release effect:** NO-GO remains until the numeric limits are accepted, configured in provider accounts, tested, and assigned to named responders.

## Current repository evidence

- Text AI timeout configuration is bounded at 60 seconds; defaults are 40 seconds for fast calls and 45 seconds for standard calls.
- The `ai_global_daily_cap` setting defaults to 2,000, and per-learner request limits exist. These are request controls, not dollar caps or provider concurrency limits.
- Voice paths have per-feature/per-day usage accounting and bounded audio lengths. No cross-instance in-flight cap for text AI or speech providers has been verified.
- No provider account billing alert, hard spend cap, production usage dashboard, or real alert delivery/acknowledgement was inspected.
- Plan 10 records planning estimates of roughly US$47 per 100 learners/month for transcription and US$270 per 100 learners/month for Canadian Azure speech. Treat these as planning estimates only; actual provider pricing, opting-out surcharges and usage must be confirmed before launch.

## Proposed initial limits for a restricted cohort

These are decision-ready defaults, not approved settings. Founder/finance must accept or replace them before provider activation.

| Control | Proposal | Trigger and response | Owner |
|---|---:|---|---|
| OpenRouter spend | US$50/month hard cap | Alert at US$25 and US$40; block new paid AI requests at the cap; retain approved-bank fallback where supported | Finance + Engineering |
| Deepgram spend | US$50/month hard cap, only after confirming the opt-out price | Alert at US$25 and US$40; disable new transcription at the cap and show the existing unavailable path | Finance + Engineering |
| Azure Speech spend | US$50/month hard cap for the initial cohort; scale only from observed usage and a new approval | Alert at US$25 and US$40; stop new TTS generation at the cap while preserving cached audio | Finance + Engineering |
| Text AI concurrency | At most 5 concurrent provider requests per project | Requests above the cap fail or queue with a bounded wait; do not retry in a way that multiplies provider cost | Engineering |
| Speech concurrency | At most 2 concurrent requests per provider role per project | Excess work receives the existing busy/unavailable response; cached audio remains available | Engineering |
| AI latency | p95 completion <=15 seconds; retain the 60-second hard ceiling | Alert if p95 exceeds 15 seconds for 15 minutes; pause new cohort invitations if sustained | Operations + Engineering |
| Provider failure rate | <=1% text AI and <=2% speech errors over a rolling 15-minute window | Page primary/backup at threshold; disable affected feature if errors persist for 30 minutes | Operations + Engineering |
| Spend anomaly | Daily usage <=2x the preceding 7-day daily average after the first week | Alert at 2x; disable affected provider and investigate at 3x or on a confirmed runaway loop | Operations + Finance |

The proposed US$50 per-provider monthly cap follows the existing Plan 10 launch suggestion, but is not sufficient evidence that a chosen cohort size fits. For Azure, the recorded estimate implies US$50 covers only about 18 learner-months before pricing/usage variance. Finance must set the cohort size from measured usage and provider terms.

## Required implementation and verification

1. Engineering implements atomic distributed concurrency limits (per project and provider role), with bounded wait/fail behavior and concurrency regression tests. Local counters or per-process semaphores do not protect across Edge Function instances.
2. Operations selects one source of truth for spend, latency and provider-error metrics, configures the thresholds above or accepted replacements, and routes alerts to named primary and backup responders.
3. Finance applies provider account hard caps/credits where available and records dashboard screenshots or redacted exports. An alert alone is not a hard spending stop.
4. Run an authorized preview load rehearsal at and above each concurrency threshold; prove requests are bounded, cached speech remains available, fallback/error copy is correct, and retries do not create duplicate cost.
5. Run an alert test for spend, latency, provider errors and concurrency; capture delivery, acknowledgement time and recovery action.
6. Measure real request duration and cost from the first restricted cohort. Revisit limits before any cohort expansion.

## Exit evidence

- Founder/finance accepted numeric limits and maximum invited cohort size.
- Engineering's distributed concurrency limiter and regression tests pass on the frozen release SHA.
- Provider-side caps and alert rules are configured, and test notifications are acknowledged by primary and backup.
- Preview load results and an initial cost/latency report are attached to the release record.

Until all four are recorded, `AUD-P2-07` remains partial and public release is NO-GO. No provider settings or production traffic were changed in preparing this proposal.
