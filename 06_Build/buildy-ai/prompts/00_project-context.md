# Prompt 00 - Project context (send first, once)

Paste everything between the lines into Buildy as the first message of the project.

---
We are building **Parle**, a web app for learning French toward a real-world goal. Tagline: "Tell us your goal.
We'll build your path to French fluency." Please read this whole message before building anything. Build nothing yet
except what I ask for at the end.

**Users (3 roles, one account = one role):**
- Learner: takes onboarding + placement test, gets a personal roadmap and daily plan, practises with an AI tutor,
  books paid lessons with human tutors.
- Tutor: applies, gets approved by an admin, sets availability and price, teaches lessons via their own Zoom/Meet
  link, writes lesson notes, gets paid 80% (platform keeps 20%) through Stripe Connect.
- Admin: approves tutors, manages users, bookings, disputes, content, settings, metrics.

**We will build in 8 modules, one at a time, in this order.** After each module I will test it before we continue.
Do not build later modules early.
1. Foundation (auth, roles, layout, settings)
2. Onboarding + placement test
3. Roadmap engine + Today's Plan
4. AI tutor (text, audio, live voice)
5. Tutor marketplace + vetting + matching
6. Booking, lessons, payments (Stripe Connect)
7. Subscriptions (Free / Premium via Stripe Billing) + limits
8. Admin panel

**Rules for the whole project:**
1. Mobile-first and responsive: every screen must work at 375px width with no horizontal scroll.
2. All interface text through translation keys (English only for now; more languages later).
3. Every permission, price, limit and payout rule is enforced on the server, never only in the browser.
4. All times stored in UTC, shown in the viewer's time zone. All money in USD cents.
5. Secrets (Stripe, AI keys) never reach the browser.
6. AI calls go through one internal service layer so the provider can be swapped later.
7. Every level estimate shown to users carries the label "Estimate - not an official score".
8. The AI never gives immigration or legal advice; it points to canada.ca and licensed consultants (RCIC).
9. Write clean, readable code with clear module boundaries - we plan to export the code and maintain it ourselves.

**Design direction (working, can change later):** calm, trustworthy, warm - a serious study tool, not a game.
Light theme. Primary color deep blue (#1E3A8A), accent warm coral (#F97362), neutral greys, generous white space,
rounded cards, a clean sans-serif (Inter or similar). Avoid emoji as icons; use a consistent icon set.

**For now:** confirm you understand, tell me (1) which frontend framework, backend, database and auth you will use,
(2) how I can export the full source code (GitHub or ZIP), and (3) any rule above you cannot follow. Do not build yet.
---
