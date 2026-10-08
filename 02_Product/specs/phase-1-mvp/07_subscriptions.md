# Module 7 - Subscriptions and Limits

Status: DRAFT · Phase 1 · Build order 7 of 8

## Purpose
Run the Free and Premium plans through Stripe Billing and enforce plan limits across the app.

## 1. Plans (decision #15)
| | Free | Premium |
|---|---|---|
| Price | $0 | $14.99/month or $119/year (USD) |
| Placement test | Yes | Yes |
| Roadmap | Basic: roadmap, weekly plan, Today's Plan, feasibility check | Full: plus weakness boost, re-plan after every signal, detailed analytics |
| AI tutor text + audio | 10 messages/day | Unlimited (fair use 300/day) |
| Live voice | No | 60 min/month |
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
- One place in the app defines limits per plan (admin-editable in Module 8): AI messages/day, live voice minutes/month,
  fair-use ceiling.
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
