# ChatGPT "Full Product Package" - digest (received 2026-10-08)

Source: ChatGPT conversation pasted by the founder. This is a condensed digest of its 35 sections;
the full text lives in the Claude session of 2026-10-08. Status: INPUT, not decisions.

## Core positioning
"Tell us your goal. We'll build your path to French fluency." Be the layer connecting AI tutor,
content and human tutors around the learner's goal, not another French app.

## Central loop (the product)
Goal -> current level -> skill assessment -> personalized roadmap -> (AI learning | content library | tutor)
-> practice -> assessment -> weakness detection -> roadmap updated -> repeat

## Features proposed
1. Consultation-style onboarding: multiple goals, target ("what do you want to be able to do"), level
2. AI placement test across reading, listening, vocabulary, grammar, writing, speaking -> per-skill CEFR
3. Roadmap dashboard: goal, target, current, target date, progress %, weekly plan, "today's mission"
4. Free AI tier as acquisition engine
5. Context-aware AI tutor (knows goal, level, weaknesses, history): explain -> practice -> correct -> mini test -> mastery
6. Premium library: CEFR courses A1-C1 + goal courses (citizenship, work, healthcare, construction, business, interviews, travel)
7. Podcasts with pre/during/post activities + AI discussion (mentions founder's "Learn with Alphonso" experience)
8. Videos recommended by current weakness, not a catalog
9. Tutor marketplace: profiles, rating, specialties, price, availability
10. Match score: goal, level, availability, price, specialization
11. Tutor brief before each lesson + tutor updates progress after
12. Exam prep vertical + mock exam engine with readiness score that updates the roadmap
13. AI Coach: proactive nudges based on progress/consistency/weakness
14. Adaptive skill allocation (e.g. shift time to speaking when it lags)
15. Light gamification: streak, XP, words, readiness
16. Tutor dashboard + Tutor AI assistant (lesson generation)
17. Admin: users, tutors (verification, payouts), content, exam bank, analytics

## Monetization proposed
- Free $0 | Premium AI $12-20/mo | Premium Learning $25-50/mo | Tutor commission 15-25%
- Exam packages one-time: $29 / $79 / $149 / $249+ (to validate)

## Tech proposed
Next.js + TS, FastAPI or NestJS, Postgres, Supabase Auth/Clerk, Stripe, Mux/Cloudflare Stream,
AI gateway with provider abstraction, WebRTC for live lessons.

## Phasing proposed
1 Core learning engine -> 2 Premium -> 3 Exam engine -> 4 Tutor marketplace -> 5 Full adaptive ecosystem
