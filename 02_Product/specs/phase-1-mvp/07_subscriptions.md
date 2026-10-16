# Module 7 - Subscriptions and Limits

Status (2026-10-16): BUILT on Parle's own stack (Supabase + Vercel), Stripe Billing in test mode only; live voice minutes not built; see HANDOFF.md section 4. Approved 2026-10-08 (decision #20) · Phase 1 · Build order 7 of 8

## Purpose
Run the Free and Premium plans through Stripe Billing and enforce plan limits across the app.

## 1. Plans (decision #15)
| | Free | Premium |
|---|---|---|
| Price | $0 | US$14.99/month or US$119/year (stays in USD, decision #55) |
| Placement test | Yes | Yes |
| Roadmap | Basic: roadmap, weekly plan, Today's Plan, feasibility check | Full: plus weakness boost, re-plan after every signal, detailed analytics |
| AI tutor text messages (a sent voice message also counts here) | 10 messages/day | Unlimited (fair use 300/day) |
| Voice, separate daily limits (Plan 9) | 2 spoken answers, 5 voice messages, 20 replies read aloud | 15 spoken answers, 60 voice messages, 200 replies read aloud |
| Live voice | No | 60 min/month (planned; not built yet, Plan 10 or later, "Coming soon") |
| Weekly check-in | Yes | Yes |
| Tutor marketplace | Yes (lessons paid separately) | Yes (lessons paid separately) |

"Basic" roadmap in Free still re-plans weekly from check-ins; Premium also re-plans from AI mastery and tutor notes
during the week.

## 2. Flows
- Upgrade from: Account page, limit-reached messages, locked features (live voice, analytics).
- Stripe Checkout for subscription; Stripe Customer Portal for card changes, invoices, cancel.
- Cancel: Premium stays until the end of the paid period, then falls back to Free; data is kept.
- Failed payment: Stripe retries; after the final failure the account returns to Free with an email.
- Annual plan shows "Save 34%".

## 3. Limits engine
- One place in the app defines limits per plan (admin-editable in Module 8): AI messages/day, live voice minutes/month
  (not built yet), fair-use ceiling, and the six voice daily limits (Plan 9): spoken answers per day (Free 2, Premium
  15), voice messages per day (5, 60) and replies read aloud per day (20, 200). Placement speaking and cached listening
  audio never count.
- Counters reset: daily at the learner's local midnight; monthly on the billing date (Free: calendar month).
- Every limited feature checks the limit on the server, never only in the browser.

## Acceptance criteria
- [ ] Monthly and annual checkout work in Stripe test mode and unlock Premium immediately.
- [ ] Customer Portal allows card change and cancellation; Premium lasts until period end.
- [ ] Failed final payment downgrades to Free and sends an email.
- [ ] Free learner is blocked at message 11 by the server even if the browser is manipulated.
- [ ] Changing a limit in admin takes effect without a redeploy.

## Out of scope (Phase 1)
Free trial, coupons and promo codes, regional pricing, family/team plans, exam packages (Phase 3), taxes beyond
what Stripe Tax provides (see open questions).
