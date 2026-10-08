# Module 1 - Foundation

Status: DRAFT · Phase 1 · Build order 1 of 8

## Purpose
Accounts, the three roles, the app shell and settings that every other module sits on.

## User stories
- As a visitor, I see a landing page that explains Parle and starts onboarding without signing up first.
- As a learner, I can create an account with email + password or Google, and verify my email.
- As a tutor, I can sign up through a separate "Teach on Parle" entry and land in my application.
- As any user, I can reset my password, change my settings, and delete my account.
- As an admin, I sign in to a separate admin area that normal users cannot reach.

## Screens
| Screen | Notes |
|---|---|
| Landing page | Hero: "Tell us your goal. We'll build your path to French fluency." CTAs: "Start my roadmap" (onboarding) and "Teach on Parle" (tutor sign-up). Sections: how it works (goal > test > roadmap > tutor), the 3 tracks, pricing, FAQ |
| Sign up / Sign in | Email + password, Google. Learner sign-up normally happens at the end of onboarding |
| Email verification | Required before booking a tutor or paying; not required to see the roadmap |
| Forgot / reset password | Email link |
| App shell (learner) | Nav: Today · Roadmap · AI Tutor · Tutors · Lessons · Progress · Account |
| App shell (tutor) | Nav: Dashboard · Students · Lessons · Availability · Profile & Pricing · Earnings |
| App shell (admin) | Nav: Applications · Users · Bookings · Content · Settings · Metrics |
| Settings | Name, photo, time zone, native language, email preferences, password, plan (link to Module 7), delete account, download my data |
| Legal pages | Terms of service, privacy policy, tutor agreement, refund policy |

## Rules
1. One account = one role (learner, tutor or admin). A tutor who also wants to learn uses a second email in Phase 1.
2. Admin accounts are created only by an existing admin; there is no self-service admin sign-up.
3. Minimum age 16 (confirmed by checkbox at sign-up). See open questions.
4. Time zone auto-detected from the browser, editable. All times are stored in UTC and shown in the viewer's time zone.
5. Native language list: at least English, French, Spanish, Portuguese, Arabic, Persian, Hindi, Punjabi, Urdu,
   Tagalog, Mandarin, Vietnamese, Ukrainian, Russian, Turkish, Other.
6. All interface strings go through translation keys (English only at launch).
7. Layout is responsive and mobile-first: every screen works at 375px width.
8. Account deletion removes personal data within 30 days; completed lesson and payment records are kept in
   anonymized form for accounting.

## Acceptance criteria
- [ ] A visitor can start onboarding from the landing page without an account.
- [ ] Email sign-up sends a verification email that arrives and works (verified end to end with a real inbox).
- [ ] Google sign-in works.
- [ ] Password reset email arrives and resets the password.
- [ ] Learner, tutor and admin each see only their own navigation; visiting another role's URL redirects.
- [ ] Time zone and native language are saved and used by later modules.
- [ ] Delete account works and signs the user out.
- [ ] Every screen is usable at 375px width with no horizontal scroll.

## Out of scope (Phase 1)
Apple sign-in, phone/SMS login, multiple roles per account, interface translations, dark mode.
