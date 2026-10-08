# Module 1 - Foundation - verification log (2026-10-08)

Buildy project: "Project 10/8/2026" (yuircx1jlz5bpg1jbv2th). Prompt: `../prompts/01_foundation.txt`.
Buildy's own report: `module-01_buildy-reply.txt`. Browser: gstack via bun CLI (browse.exe blocked by Smart App Control;
founder approved the bun/Node route 2026-10-08).

## Round 1 results (COO test in preview, desktop + 375px)
| Acceptance item | Result | Notes |
|---|---|---|
| Visitor starts onboarding without account | PARTIAL | /onboarding is a public placeholder (Module 2) |
| Email verification email | FAIL (platform) | Buildy auth has no verification step -> custom code flow requested |
| Google sign-in | N/A (platform) | Not supported by Buildy; email+password only. Logged as decision #24 |
| Password reset email | PASS (delivery) / BLOCKED (completion) | Email arrived in AgentMail inbox; link points to unpublished superdev.run domain ("Project Loading"). Retest after publish |
| Role navigation + redirects | PASS | Learner -> /tutor, /admin redirected; tutor -> /learner, /admin redirected; visitor -> /login |
| Time zone + native language saved | PASS | Persisted after reload. But time zone not auto-filled at sign-up (spec: auto-detect) |
| Delete account | FAIL (platform) | Not available -> server-side deletion request flow requested |
| 375px, no horizontal scroll | PASS | scrollWidth 360-375 on all pages tested |

## Other issues found
1. Landing page shows internal build language to visitors ("Module 7", "first release focuses on account foundations").
2. Landing shows invented "provisional" goal tracks instead of the 3 launch tracks; pricing hidden although decided.
3. Emails are branded "Parle Path" instead of "Parle".
4. Full-page capture shows large blank areas (scroll-reveal content invisible until scrolled) - check reduced-motion / no-JS visibility.
5. Duplicate role records possible (Buildy's own warning) - role must be created server-side, once.

## Round 2
Fix prompt: `../prompts/01_fix-round1.txt`. Results below.

## Round 2 results (after `01_fix-round1.txt`)
| Item | Result |
|---|---|
| Time zone auto-saved at sign-up | Done (Buildy) |
| Branding "Parle" | Pages done; Website name changed to "Parle" in Dashboard by COO (persisted). Email check pending a new reset email |
| Landing copy: no internal build language | PASS (0 occurrences of module/first release) |
| 3 launch tracks + NCLC targets + pricing $14.99 / $119 | PASS |
| Content visible without scroll animation | PASS (full-page capture complete) |
| 375px header | PASS (no overlap, scrollWidth 375) |
| Email verification | NOT POSSIBLE on Buildy (see below) |
| Delete account | NOT POSSIBLE on Buildy |
| One role per account enforced | NOT POSSIBLE on Buildy |

## Platform security finding (blocking for Modules 4-8)
Source: `../research/buildy-service-role-answer.txt`.
- User-initiated backend functions must run with the user's own permissions; the service-role key may only be used
  in no-session functions (verified webhooks, scheduled jobs).
- No unique constraints, transactions or atomic counters.
- Consequences: AI usage limits, one-role-per-account, email verification and account deletion cannot be enforced
  securely on Buildy. Payment/booking status can be protected only when written by a verified Stripe webhook.
- Escalated to founder as a plan decision (decision #21 trigger).
