# Module 8 - Admin Panel

Status (2026-10-16): BUILT on Parle's own stack (Supabase + Vercel), money actions in Stripe test mode only; see HANDOFF.md section 4. Approved 2026-10-08 (decision #20) · Phase 1 · Build order 8 of 8

## Purpose
Give the founder and team control of tutor quality, money, content and costs.

## Sections
| Section | What admins can do |
|---|---|
| Applications | Queue of submitted tutor applications (oldest first); view profile, certificates, intro video link (no ID upload: identity checked by Stripe Connect, provisional decision #25); approve / needs changes (with comment) / reject (with reason); mark certificates verified; suspend or reinstate approved tutors |
| Users | Search learners and tutors; view profile, plan, roadmap summary, lessons, payments; change plan manually (comp Premium); pause and enable an account (optionally cancelling and refunding its lessons; a paused person is signed out and refused everywhere) (Plan 8) |
| Bookings | All lessons with status; disputes queue (tutor no-show, learner dispute); refund or release payout; tutor cancellation counts |
| Reviews | Hide / restore reviews |
| Reported content | Queue of practice tasks and AI replies learners reported as wrong; mark fixed / dismiss; repeated reports on a topic flag the prompt for revision |
| Content | Placement and check-in question bank: generate items with AI, review, edit, approve, retire; preview audio; counts per skill and level vs launch minimum (Module 2); one bank switch chooses demo or real items for every reader (default real; bank readers fix, R94) |
| Waitlist | Sign-ups from parle.buzz; send the founding-tutor and launch emails in safe batches with one-click unsubscribe; only the owner deletes the waitlist (Plan 8, decision #56) |
| Settings | Plan limits (AI messages, the six voice daily limits from Plan 9, voice minutes (live voice not built yet), fair use), commission % (default 20), payout delay (default 72h), cancellation window (default 24h), feature flags (e.g. live voice on/off) |
| Metrics | Sign-ups, onboarding completion, placement completion, week-1 retention, Free->Premium conversion, active Premium, lessons booked, gross lesson value, commission earned, AI cost per active learner, tutor utilization |
| Admin users | Invite / remove admins: the owner only (Plan 8, decision #56) |

## Rules
- Every admin action that changes money, status or content is logged (who, what, when).
- No ID documents are stored (provisional decision #25); tutor application details are viewable only here and only by
  admins.
- Commission changes apply to new bookings only.

## Acceptance criteria
- [ ] An admin can approve a test tutor end to end and the tutor appears in learner search.
- [ ] Needs-changes comment reaches the tutor and resubmission returns to the queue.
- [ ] Dispute refund and payout release work in Stripe test mode.
- [ ] Question bank shows coverage against the 360-item launch minimum.
- [ ] Settings changes take effect without a redeploy and are recorded in the audit log.
- [ ] Metrics page shows all listed numbers for a selectable date range.

## Out of scope (Phase 1)
Content management for courses, podcasts and videos (Phase 2), exam bank (Phase 3), finer role-based admin permissions.
Admins are equal in Phase 1 except for one owner role (Plan 8, decision #56): only the owner invites and removes
administrators and deletes the waitlist. The founder is the only owner.
