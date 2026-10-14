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

## Part A result (reply `module-04a_buildy-reply.txt`, checkpoint "restored the AI tutor service")
Buildy's finding: the session failure was its own AI response service returning an internal error, hidden behind a
generic "private session" message by a missing await; fixed, with one fallback to the faster AI mode. 55 unit tests
passed, build passed. Parts of Part B already exist from the lost runs (Explain in my language toggle, live voice
"Coming soon", browser-voice note).

## COO test in the preview, learner B (immigration, A2), night of 2026-10-11
| Acceptance item | Result | Evidence |
|---|---|---|
| First message references goal and focus | PASS | "Ton objectif est les buts de langue pour l'immigration canadienne. Cette semaine, le focus est le travail et l'expérience de travail... niveau A2" |
| Ask a question | PASS | "When do I use passé composé vs imparfait?" -> short A1/A2 answer with work examples (J'ai travaillé hier / Je travaillais à l'usine), English support |
| Guardrail | PASS | "How many CRS points do I get for NCLC 7?" -> "I can't assess immigration eligibility, CRS points... canada.ca ... RCIC ... I can help you practise related French vocabulary". Did not use a message from the allowance |
| Writing correction | PASS | 4 errors planted, 4 found (allé, j'ai parlé, depuis, j'aime / collègues), each with before / after / why / example, plus a corrected version |
| Corrections in the mistake log with skill, area, topic | PASS with bugs | Four rows "WRITING · GRAMMAR · WORK" etc. Panel stays empty until the mode is switched; topic is the theme ("WORK"), not the language point |
| AI lesson full flow + mastery | PASS with bug | Explanation (depuis vs pendant, built from the learner's own writing mistakes) -> 4 practice items with feedback -> 3-item mini-test -> "Mini-test mastery: 100% · 3 of 3 correct". Topic mastery panel did not refresh |
| Free limit | BUG | The lesson alone used 8 of 10 daily messages (each "Check answer" and the mini-test count). 11th-message rejection not reached yet |
| A2 vs B2 difference | NOT TESTED | No B2 test learner exists (both learners are A1 / A2) |
| Play aloud at two speeds | NOT VERIFIABLE HERE | The gstack browser has no French voice ("No French voice is available in this browser", repeated above every message) |
| Explain in my language; Speaking practice; 375px | NOT TESTED YET | After Part B |
| Live voice | PASS | "Live voice conversation - COMING SOON", button disabled |

## Part B + fix round (`../prompts/04b_fix-and-audio.txt`), reply `module-04b_buildy-reply.txt`
Checkpoints "refined tutor limits and progress feedback" and "translated tutor goal and focus labels"; 58 unit tests
passed; build passed; 7 building credits. COO re-test in the preview, 2026-10-12 early morning:
| Item | Result | Evidence |
|---|---|---|
| 1 Limit counts only learner-written messages | PASS | Learner A: full AI lesson (4 practice checks + mini-test) left the counter at 10 of 10; ten chat messages took it 10 -> 0 one by one |
| Limit at 10 | PASS in the UI | At 0 the Send button is disabled; "Your daily tutor allowance resets at your local midnight. Your other planned practice remains available on Today's Plan." + "Premium upgrade, coming soon". Server rejection of a forced 11th request: unit tests only, not forced by the COO |
| 2 Panels refresh at once | PASS | Topic mastery and Recent corrections updated right after the practice checks and the mini-test |
| 3 Mistake topic = language point | PASS | "LANGUAGE POINT: basic present phrase order · Theme: Appointments"; mastery per point, rolling (100% then 50% after a failed mini-test) |
| 4 Header language | PASS | "Votre objectif est la citoyenneté canadienne et le français du quotidien..." |
| 5 Listen | NOT VERIFIABLE HERE | The test browser has no French voice; the note now appears once. Founder to try in Chrome or Safari |
| 6 Speak | PARTLY SEEN | Speaking practice shows "Speak in French", "You can type your answer at any time. No audio is stored.", typed answer box. Recognition itself not testable in this browser; typed speaking answer not sent (allowance) |
| 7 Explain in my language | PASS for Persian | Learner B, toggle on: explanation of "je suis allé" fully in Persian, French examples kept in French. Arabic, Spanish, Hindi not tested (would need the learner's native language changed) |
| 8 Time-zone unit tests | Buildy's report only | Toronto and Tehran cases in the suite |
| 375px | PASS | scrollWidth 360; screenshot `../screenshots/module-04/ai-tutor-375.png` |

Still open, recorded as D9-D13 in `../../export-decoupling/deferred-defects.md`:
- D9 correct answer is always the FIRST option in lesson practice and mini-test (7 of 7 in learner A's lesson).
- D10 learner B's counter still showed "3 of 10" after midnight Toronto (2026-10-12 ~1:30 am ET); reset at local
  midnight not confirmed in the preview (the learner's saved time zone was not checked).
- D11 at the limit, opening a new mode shows "Your tutor's first message will appear here" with no explanation.
- D12 not verified in this environment: play-aloud at two speeds, speech recognition, A2 vs B2 level difference
  (no B2 test learner), Arabic / Spanish / Hindi explanations, "Open AI tutor" from a Today task marking it done.
- D13 the greeting and feedback mix English into French-first text for an A1 learner; acceptable for the demo, review
  the prompt wording after export.

## Module 4 status: ACCEPTED WITH DEFERRED DEFECTS (2026-10-12, decision #30)
Next: Module 5 (tutor marketplace) in small prompts: `../prompts/05a_...`, then 05b.

## 2026-10-13 late fixes on Buildy (queue item B3)
- D9 option order: `../prompts/09a_lesson-option-shuffle.txt` -> `module-09a_option-shuffle_buildy-reply.txt`
  (269 / 269 tests). COO live test as learner B ~10:50 pm: new AI lesson on passe compose / depuis; correct answers
  at positions 2, 3, 1, 1 of the four practice items; radio values are option ids; item 1 answered with the correct
  second option -> "Correct answer."; item 2 answered with the wrong first option -> "The correct answer is
  depuis." with the explanation in Persian and a French example. PASS. Mini-test not taken; same-order-on-reload
  not checked (a full reload starts a new tutor session). New small defects: D25.
- D11 limit message: `../prompts/09b_limit-message.txt` sent ~10:45 pm ET, BUILDING.
