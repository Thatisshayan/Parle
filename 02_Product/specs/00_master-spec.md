# Parle - Master Spec

Status (2026-10-16): BUILT on Parle's own stack (Supabase + Vercel), Stripe in test mode, live voice not built; see HANDOFF.md section 4. Approved by founder 2026-10-08 (decision #20) · Version 0.1
Owner: COO (Claude) · Approver: Founder
Source of decisions: `10_Decisions-Meetings/DECISIONS.md` (decisions #1-#60; later decisions override earlier ones; #25, #27, #29 provisional)

## 1. Product in one sentence
**Tell us your goal. We'll build your path to French fluency.**
Parle is a web platform that turns a learner's real-world goal (Canadian immigration, citizenship,
general fluency) into a personalized, self-updating roadmap that combines an AI tutor, practice,
and vetted human tutors.

## 2. Who it serves
| Role | Need |
|---|---|
| Learner | Reach a concrete French level by a date, without having to design their own study plan |
| Tutor | Get students, schedule, get paid, and arrive at each lesson knowing what the student needs |
| Admin | Vet tutors, run payments and plans, keep quality and costs under control |

## 3. The core loop (every feature must serve it)
Goal -> placement -> roadmap -> learn (AI tutor / practice / human tutor) -> check-in -> roadmap updates -> repeat

## 4. Phase map
| Phase | Name | Built where | Spec |
|---|---|---|---|
| 1 | MVP: roadmap + AI tutor + tutor marketplace | Built on Buildy.ai, then moved to Parle's own stack: Supabase + Vercel (decisions #44, #51) | `phase-1-mvp/` (detailed) |
| 2 | Coach, tutor assistant, content depth | Own codebase (Supabase + Vercel) | `later-phases/phase-2-engagement.md` |
| 3 | Exam engine (mock exams, readiness, exam packages) | Own codebase | `later-phases/phase-3-exam-engine.md` |
| 4 | Decouple from Buildy (DONE: Plans 1-4, cut-over 2026-10-15, decision #51), mobile apps, translations, built-in video | Own codebase | `later-phases/phase-4-decouple-and-scale.md` |
| 5 | Ecosystem: Alphonso connection, B2B, new tracks | Own codebase | `later-phases/phase-5-ecosystem.md` |

Phases 2-5 are specified at feature level and will be re-specified in detail, using real
Phase 1 data, before each one starts.

## 5. Phase 1 modules (historical (Buildy era): build order = Buildy prompt order)
| # | Module | Spec |
|---|---|---|
| 1 | Foundation: auth, roles, layout, settings | `phase-1-mvp/01_foundation.md` |
| 2 | Onboarding + placement test | `phase-1-mvp/02_onboarding-placement.md` |
| 3 | Roadmap engine + Today's Plan | `phase-1-mvp/03_roadmap-engine.md` |
| 4 | AI tutor (text, audio, live voice) | `phase-1-mvp/04_ai-tutor.md` |
| 5 | Tutor marketplace + vetting + matching | `phase-1-mvp/05_tutor-marketplace.md` |
| 6 | Booking, lessons, payments (Stripe Connect) | `phase-1-mvp/06_booking-payments.md` |
| 7 | Subscriptions + limits | `phase-1-mvp/07_subscriptions.md` |
| 8 | Admin panel | `phase-1-mvp/08_admin.md` |
| - | Data model | `phase-1-mvp/09_data-model.md` |
| - | Cross-cutting: security, privacy, AI, analytics, testing | `phase-1-mvp/10_cross-cutting.md` |

## 6. Launch tracks (decision #13)
| Track | Target | Skills weighted |
|---|---|---|
| Canada Immigration | NCLC 7 in all four skills (about B1/B2) | Reading, writing, listening, speaking equally |
| Canadian Citizenship | NCLC 4 in speaking + listening (about A2) | Speaking + listening only |
| General / Conversation | Learner-chosen CEFR level A2-C1 | Speaking + listening heavier, all four included |
Other goals (work, travel, school, other) are selectable and use the General engine with their goal as a label.

## 7. Product rules that apply everywhere
1. **Estimates are labelled.** Every level or NCLC figure the app shows says "Estimate - not an official score."
2. **No immigration advice.** Parle teaches French. Questions about eligibility, points or applications get a
   short pointer to canada.ca and licensed consultants (RCIC), never an answer.
3. **Honest roadmaps.** If a goal is unrealistic for the time available, the app says so and offers options.
4. **English interface, ready for more.** All interface text goes through translation keys from day one.
   The AI tutor explains in the learner's native language on request.
5. **Plan logic is rules, content is AI.** What to study and when is decided by testable rules; the AI writes
   explanations, exercises and feedback.
6. **Tutors are humans, AI assists.** Nothing the AI generates replaces a tutor's judgment on a lesson.

## 8. Pricing (decision #15)
| Plan | Price | Includes |
|---|---|---|
| Free | $0 | Placement test, basic roadmap, AI tutor 10 messages/day, voice per day: 2 spoken answers, 5 voice messages, 20 replies read aloud (Plan 9) |
| Premium | US$14.99/mo or US$119/yr (decision #55) | Unlimited AI tutor, voice per day: 15 spoken answers, 60 voice messages, 200 replies read aloud (Plan 9), full adaptive roadmap, analytics. Live voice conversation (monthly cap) not built yet: Plan 10 or later, shown as "Coming soon" |
| Tutor lessons | Tutor sets the price in CAD, CA$10 to CA$150 an hour (decision #55) | Parle keeps 20%, tutor receives 80% (founding tutors 90% for their first 6 months, decision #22), learner pays listed price in CAD |

## 9. Success criteria for Phase 1 (first 90 days after launch)
| Metric | Target |
|---|---|
| Onboarding completion (start -> account created) | >= 60% |
| Placement test completion | >= 50% of new accounts |
| Week-1 retention (active on 3+ days in first 7) | >= 30% |
| Free -> Premium conversion within 30 days | >= 4% |
| Approved tutors live | >= 20 |
| Lessons booked | >= 200 |
| Lesson rating average | >= 4.6 / 5 |

## 10. Glossary
- **CEFR**: European levels A1-C2.
- **NCLC / CLB**: Canadian French / English benchmarks (1-12). NCLC 4 ~ A2, NCLC 7 ~ B1/B2.
- **TEF Canada / TCF Canada**: official French tests accepted by IRCC.
- **Roadmap**: milestones per skill from current to target level.
- **Weekly plan / Today's Plan**: the scheduled tasks derived from the roadmap.
- **Check-in**: 10-minute weekly assessment that updates skill estimates.
- **Lesson brief**: auto-generated summary a tutor sees before a lesson.

## 11. Open questions (founder decision needed)
See `phase-1-mvp/10_cross-cutting.md` section 9.
