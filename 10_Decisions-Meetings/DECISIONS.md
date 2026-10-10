# Decision Log

| # | Date | Decision | Notes |
|---|---|---|---|
| 1 | 2026-10-08 | Two-sided platform: learners + tutors | Adaptive course platform + tutor marketplace |
| 2 | 2026-10-08 | Onboarding = purpose + self-assessed level + placement exam | Purposes: Canadian citizenship/immigration (B1/B2), employment, general, conversation, travel |
| 3 | 2026-10-08 | Personalized roadmap that updates as the learner progresses | Includes live tutor, offline courses, videos, podcasts, practice, mock exams |
| 4 | 2026-10-08 | Tutor matching on learner availability x tutor availability x tutor price | |
| 5 | 2026-10-08 | Tutors vetted in-app; platform takes a commission | |
| 6 | 2026-10-08 | Content created by tutors + AI-generated | |
| 7 | 2026-10-08 | Revenue: subscription (content) + pay-per-session (tutors) | |
| 8 | 2026-10-08 | Web app first, mobile later | |
| 9 | 2026-10-08 | Launch worldwide | Canadian exam track is the sharpest wedge |
| 10 | 2026-10-08 | Build v1 on Buildy.ai, later export code and decouple | Prompts and logs kept in `06_Build/buildy-ai` |
| 11 | 2026-10-08 | MVP = Option A: onboarding + placement + roadmap + context-aware AI tutor + tutor marketplace (vetting, profiles, matching, booking, Stripe + commission, lesson brief/notes) + starter content | Exam engine, podcasts, full library deferred. Lessons via Zoom/Meet link. Canadian levels checked, see 01_Strategy/market-research/canada-french-requirements.md |
| 12 | 2026-10-08 | Parle is a completely separate product from Learn with Alphonso for now | Own brand and codebase; connection (shared login, funnel) to be discussed later |
| 13 | 2026-10-08 | Launch with 3 full tracks: Canada Immigration (NCLC 7, 4 skills), Canadian Citizenship (NCLC 4, speaking+listening), General/Conversation | Other goals selectable, served by a generic level-based roadmap; tutors can list any specialty |
| 14 | 2026-10-08 | App interface in English at launch, built ready for more languages; AI tutor explains in the learner's native language on request | Full translations of the interface come later |
| 15 | 2026-10-08 | Pricing: Free (placement, basic roadmap, ~10 AI msgs/day) / Premium $14.99/mo or $119/yr / tutors set price, Parle takes 20%, no learner fee | Competitor commissions to confirm before publishing (italki ~15%, Preply 33%->18%) |
| 16 | 2026-10-08 | AI tutor v1 = text + audio both ways (TTS replies, recorded answers transcribed and corrected, pronunciation beta) AND live real-time voice conversation | Live voice: Premium-only with monthly minute cap (cost); if Buildy.ai cannot do real-time voice, it is first item after export |
| 17 | 2026-10-08 | Tutor vetting: profile + ID + certificates + 2-min French intro video, manual admin approval, Verified badge, then ratings | |
| 18 | 2026-10-08 | Build approach: master spec, then Buildy.ai module by module (foundation > onboarding+placement > roadmap > AI tutor > marketplace+vetting > booking+Stripe > admin), verify each in browser | First Buildy session starts with a capability check (export, stack, Stripe split, uploads, TTS/STT, realtime voice) |
| 19 | 2026-10-08 | Full specs for every phase written before any build | Phase 1 detailed per module; Phases 2-5 at feature level, re-specified with real data before each starts |
| 20 | 2026-10-08 | Spec set approved by founder; self-critique fixes applied (failure handling, AI calibration, practice content source, payout coverage, $8 minimum lesson charge, Buildy fallback) | |
| 21 | 2026-10-08 | Accept 3 critique recommendations: (1) export after modules 1-4 if Buildy degrades, (2) 8 learner + 5 tutor interviews during the build, (3) founding-tutor recruitment plan starts before module 5 | |
| 22 | 2026-10-08 | Build plan approved; founder OK on design direction (deep blue #1E3A8A + coral #F97362, calm/trustworthy) and founding-tutor offer (10% commission for 6 months, badge, paid question review) | Execution: COO runs tasks in this session |
| 23 | 2026-10-08 | Buildy capability check: GO. Export = ZIP of React/TS/Vite/Tailwind frontend + entity schemas + Deno functions on Buildy SDK (@superdevhq/client). Own stack replaces data/auth/functions after export | Founder: create a new project, never use existing Buildy projects for Parle |
| 24 | 2026-10-08 | Platform limits accepted for Phase 1: no Google sign-in (email+password only), custom email-code verification, server-side account deletion requests | Revisit Google sign-in after export |
| 25 | 2026-10-08 | PROVISIONAL (founder to confirm): no ID uploads - tutor identity verified by Stripe Connect; intro video as unlisted YouTube/Vimeo link; live AI voice 'Coming soon' until after export | Founder asked COO to proceed autonomously; can be overruled |
| 26 | 2026-10-08 | Option B: build all 8 modules on Buildy as a TEST-ONLY demo (Stripe test mode, no real users or money); accept Buildy security gaps; rebuild backend securely at export | Gaps tracked in 06_Build/export-decoupling/security-debt.md |
| 27 | 2026-10-10 | PROVISIONAL (founder to confirm): weekly check-in scoring - sets of three questions: 0-1 correct = -0.25, 2 = no change, 3 = +0.25; writing scored by the Module 2 AI scorer; speaking self-rated for history only and never moves the estimate while speech cannot be assessed | Buildy proposed self-rating for writing and speaking; rejected so every shown level stays evidence-based. Prompt: 06_Build/buildy-ai/prompts/03_checkin-scoring-answer.txt |
| 28 | 2026-10-10 | Founder: the COO also runs the founder's other Buildy projects alongside Parle (ShipToPhone, TradeGate Pro, Listify Pro, Content Carousel, RepairReady); all built on Buildy, code exported later | One shared Buildy credit pool. Order: Parle first, ShipToPhone second. Each project has its own workstation and HANDOFF.md |
| 29 | 2026-10-10 | PROVISIONAL (founder to confirm): first-week plan rule - a learner who joins mid-week gets a plan for the remaining available days only; no tutor suggestion in that partial week unless at least 90 minutes and a tutor-window day remain; if no available day remains, the first plan starts the next week; every day is filled to 80-120% of its minutes | Found in Module 3 testing; written into 03_roadmap-engine.md sections 4-5 |

## Open
- Founder to confirm or overrule the provisional decisions: #25, #27, #29
- Later: connection to Learn with Alphonso (shared login, funnel)
- Open questions listed in 02_Product/specs/phase-1-mvp/10_cross-cutting.md section 9
- Final product name (working name: Parle)
