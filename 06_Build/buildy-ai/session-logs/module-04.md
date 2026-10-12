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

## Second attempt also lost; switched to smaller steps
The Retry run ended the same way ("didn't get through", no reply, no checkpoint after #16). The gstack browser was
closed and reopened at the founder's suggestion; the chat still showed the failure. But the preview HAD changed:
`/learner/ai-tutor` now shows Free chat, Ask a question, AI lesson, Speaking practice and Writing correction, then
fails with "Your tutor session could not open - Parle could not prepare a private session." So the runs write code
and die before reporting or checkpointing.
New approach: small prompts. `../prompts/04a_finish-core.txt` (Part A: sessions open in all five modes as text,
first message, task hand-off from Today, server-side Free limit, guardrail, mistakes + mastery) sent ~11:12 pm by the
chat clock. Part B (browser audio, "Explain in my language", live voice "Coming soon", time-zone unit tests) is sent
after Part A is tested.
Credits: the "10,600" at the top of the editor is NOT the build-credit balance (founder, 2026-10-11); it looks like
Rewards points. Buildy prints "Building credits" per run in the chat (8.22 for fix round 2). Do not use the top
number to judge spend.

## Part A also refused (2026-10-11 late evening) - STOPPED, waiting on the founder
The small Part A prompt failed the same way within about a minute, so prompt size is not the cause. Evidence from
the editor page:
- Console: "[AutoResume] No active workflow run and no assistant message. Triggering failure UI." The chat request
  returns in 4-5 seconds with a tiny response and no run is started (`checkActiveStream`: isActive false, runId null).
- The account's subscription record reads **status "cancelled"** (the $99 plan).
- Credit charges listed for this chat today: 3.86 and 8.22 credits (rounds 1c and 2). The lost Module 4 runs show no
  charge. The 10,600 at the top is Rewards points (10,000 banked + 600 pending), not build credits.
Working theory (not confirmed): Buildy is refusing new runs for an account reason (plan cancelled or build credits
used up), not because of the prompts. Do not send more prompts until the founder has checked the plan and credit
balance in Buildy. The half-built AI Tutor from the earlier run is still in the preview without a checkpoint.

## Part A accepted on Retry
The founder checked: the account still shows Pro with credits left, so the "cancelled" subscription record is not the
cause (theory withdrawn). Clicked Retry on the Part A message; this time Buildy started and was tracing why tutor
sessions fail to open (50+ actions). So the refusals look like an intermittent Buildy fault: Retry is worth a couple
of tries before changing anything. During the retry the headed gstack browser died and the server came back headless
and logged out ("Session Expired"); running `connect` again restored the headed browser with the saved login.

## How to resume
1. In the Buildy project chat, read the reply after the message that contains "Do NOT start Module 4 again from zero". Save it as
   `module-04_buildy-reply.txt`.
2. Test the acceptance criteria of `04_ai-tutor.md` in the preview with learners A and B (see HANDOFF section 6 and 7),
   plus BUILD-PLAN Task 4 steps 3-6 (level difference, CRS guardrail, mic fallback, mistake log).
3. Decision #30: ONE fix round; whatever stays broken goes to `../../export-decoupling/deferred-defects.md`, then
   accept, give the founder a short status report and send Module 5.

## Status: PART A BUILDING (accepted on Retry)
