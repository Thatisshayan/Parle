# Module 4 - AI tutor - verification log

Prompt: `../prompts/04_ai-tutor.txt` (header + `04_ai-tutor.md` + AI tutor section of `09_data-model.md`), sent
2026-10-11 ~10:10 pm ET, one run, no pausing, do not start Module 5.

Platform choices written into the prompt (Buildy has no server text-to-speech or speech-to-text):
- Listen = browser speech synthesis (French voice, normal and slow); Speak = browser speech recognition with a typing
  fallback; pronunciation and fluency shown as "Not assessed in this demo"; no recordings stored.
- Live voice = "Coming soon" for Premium unless Buildy reports real-time voice.
- Every learner treated as Free (10 messages per day, server-enforced, reset at local midnight); Premium behind a flag.

## First attempt lost (2026-10-11 ~10:10 pm to ~11:03 pm ET)
The founder watched Buildy work for about 50 minutes and show it had finished; then the page reloaded and the chat
showed "That message didn't get through to Buildy. Please retry." under the Module 4 prompt. Checked afterwards: no
new checkpoint (latest is #16, 9:21 pm, from round 1c) and the preview's AI Tutor screen is still the Module 3
placeholder, so nothing from that run was kept. No reply text was recoverable. Clicked **Retry** at 11:05 pm; Buildy
started again on the same prompt. If this happens a second time, record it in `deferred-defects.md` as a platform
failure and tell the founder before spending more credits on the same prompt (credit balance shown: 10,600).

## How to resume
1. In the Buildy project chat, read the reply after the message that starts "Module 3 is closed for now". Save it as
   `module-04_buildy-reply.txt`.
2. Test the acceptance criteria of `04_ai-tutor.md` in the preview with learners A and B (see HANDOFF section 6 and 7),
   plus BUILD-PLAN Task 4 steps 3-6 (level difference, CRS guardrail, mic fallback, mistake log).
3. Decision #30: ONE fix round; whatever stays broken goes to `../../export-decoupling/deferred-defects.md`, then
   accept, give the founder a short status report and send Module 5.

## Status: BUILDING (second attempt, started 11:05 pm ET)
