# Phase 2 - Coach, Tutor Assistant, Content Depth

Status: PROPOSED (feature level) · To be re-specified in detail with Phase 1 data before starting
Prerequisite: Phase 1 live; at least 8 weeks of usage data.

## Goal
Raise retention and Premium conversion by making the product proactive and richer, and make tutors more
effective with AI support.

## Features
| # | Feature | Summary | Success signal |
|---|---|---|---|
| 2.1 | AI Coach | Proactive messages on Today's Plan and weekly email: progress, consistency, stalled skills ("Speaking has stayed at A2+ for 3 weeks - I added two speaking sessions"). Rules decide when; AI writes the message | Week-4 retention +5 pts |
| 2.2 | Tutor AI assistant | Tutor asks for a lesson plan for a student; AI drafts structure, questions, exercises, vocabulary, homework from the lesson brief. Tutor edits; saved to lesson | 50% of tutors use it weekly |
| 2.3 | Tutor-created content | Approved tutors publish short lessons, exercise sets and vocabulary lists; admin review; usable in roadmaps; revenue share model to define | 100 approved tutor items |
| 2.4 | Podcast learning | Episodes with vocabulary preview, comprehension questions during, AI discussion and speaking prompt after. Informed by Learn with Alphonso's Listen feature (separate product, no shared code in this phase) | Podcast task completion >= 60% |
| 2.5 | Video lessons | Short videos recommended by current weakness ("you need this because of indirect object pronouns"), with transcript and quiz | Video tasks completed per Premium learner |
| 2.6 | Course library | Structured CEFR courses A1-B2 and goal courses (Canada immigration, citizenship, work, interviews) mixing AI, tutor and video content | Premium conversion +1 pt |
| 2.7 | Light gamification | Streak protection, words learned, goal readiness, weekly consistency. No leagues/duels (that's Alphonso's territory) | Days active per week |
| 2.8 | Push / SMS reminders | Optional reminder channels beyond email | Task completion rate |

## Data additions
coach_message, lesson_plan, content_item (lesson / exercise_set / vocab_list / podcast / video), course, module,
content_progress.

## Dependencies and risks
- Content moderation workload (admin queue) grows with 2.3.
- Video hosting cost (Mux / Cloudflare Stream) - choose at spec time.
- Phase 2 is built on Parle's own stack (Supabase + Vercel): Buildy is no longer used (export 2026-10-14, cut-over
  2026-10-15, decisions #44, #51). Historical (Buildy era): decide whether Phase 2 is built in Buildy or after export
  (Phase 4 may move earlier if Buildy limits bite).
