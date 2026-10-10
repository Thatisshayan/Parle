# Module 4 - AI Tutor

Status: APPROVED 2026-10-08 (decision #20); not built yet · Phase 1 · Build order 4 of 8

## Purpose
A French tutor that knows the learner's goal, level, roadmap and mistakes - not a generic chatbot. It delivers
the AI tasks in Today's Plan and is available for free practice.

## 1. What the tutor knows (context sent with every session)
Main goal and track, target per skill and date, current level per skill, this week's focus, the task being done
(if any), the last 20 logged mistakes, mastered and weak topics, native language, preferred explanation language,
plan (Free / Premium) and remaining limits.

## 2. Modes
| Mode | Flow | Output saved |
|---|---|---|
| AI lesson | Explain at the learner's level -> 3-5 practice items -> correction -> 3-item mini test | Mastery score 0-100 for the topic |
| Speaking practice | Scenario prompt by track (e.g. immigration: describe your work experience; citizenship: make an appointment) -> learner answers by voice -> feedback | Speaking feedback + mistakes |
| Writing correction | Prompt or learner's own text -> corrected version with each change explained | Writing feedback + mistakes |
| Free chat | Open conversation in French at the learner's level, gentle corrections | Mistakes |
| Ask a question | "Why is it 'je suis allé'?" -> explanation, then offer to practise | Optional mini practice |

## 3. Audio (all plans)
- **Listen**: every tutor reply has a play button (AI text-to-speech, natural French voice, normal and slow speed).
- **Speak**: the learner can record instead of typing; audio is transcribed and the transcript is shown and corrected.
- **Feedback dimensions for spoken answers**: task completion, grammar, vocabulary, fluency (pace, hesitations),
  pronunciation (labelled **Beta**).
- Recordings are kept 30 days for review, then deleted; transcripts and feedback are kept.

## 4. Live voice conversation (Premium only)
- Real-time spoken conversation with the tutor, like a call; transcript and feedback summary shown afterwards.
- Monthly cap: 60 minutes per Premium learner (admin-configurable). Remaining minutes shown before starting.
- At the cap: offer text + audio mode; caps reset on the billing date.
- **If Buildy.ai cannot deliver real-time voice, this mode ships first after export (Phase 4) and the button shows
  "Coming soon" for Premium.**

## 5. Explanation language
- Default: explanations in simple French with English support at A0-A2; French-first from B1.
- Toggle "Explain in my language": explanations in the learner's native language; examples and practice stay in French.

## 6. Mistake log and mastery
- Every correction is tagged: skill, area (grammar / vocabulary / pronunciation / structure), topic (e.g. passé composé
  with être), example sentence.
- Mastery per topic = rolling score of the last 10 practice and mini-test items on that topic.
- The roadmap engine reads mastery and the mistake log (Module 3, section 6).

## 7. Limits
| Plan | Text/audio messages | Live voice |
|---|---|---|
| Free | 10 learner messages per day (a recorded answer counts as one) | None |
| Premium | Unlimited (fair-use ceiling 300/day to stop abuse) | 60 min/month |
At the limit: friendly message, the rest of Today's Plan that doesn't need the AI stays available, upgrade CTA.

## 8. Guardrails
- Stays on French learning; politely redirects other requests.
- **No immigration or legal advice**: questions about eligibility, CRS points or applications get a short reply
  pointing to canada.ca and licensed consultants (RCIC); then the tutor offers to practise the related vocabulary.
- Never claims to give official TEF/TCF scores.
- No content unsuitable for a 16+ learning platform; harmful requests are refused.
- The AI provider sits behind one internal interface so it can be swapped (OpenAI / Anthropic / Gemini / other).

## Acceptance criteria
- [ ] The tutor's first message references the learner's goal and current focus.
- [ ] An A2 learner and a B2 learner asking the same question get explanations at clearly different levels.
- [ ] AI lesson completes the full flow and stores a mastery score.
- [ ] Every reply can be played aloud at two speeds; recorded answers are transcribed and corrected.
- [ ] Corrections appear in the mistake log with skill, area and topic.
- [ ] "Explain in my language" works for at least Persian, Arabic, Spanish and Hindi.
- [ ] Free limit stops at 10 messages per day and resets at the learner's local midnight.
- [ ] An immigration-eligibility question gets the redirect, not an answer.
- [ ] Live voice works for Premium within the cap, or shows "Coming soon" if not feasible on Buildy.

## Out of scope (Phase 1)
AI coach proactive messages (Phase 2), AI examiner for mock exams (Phase 3), avatars, video.
