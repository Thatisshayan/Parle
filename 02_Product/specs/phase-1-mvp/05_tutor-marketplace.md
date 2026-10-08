# Module 5 - Tutor Marketplace, Vetting and Matching

Status: DRAFT · Phase 1 · Build order 5 of 8

## Purpose
Bring vetted human tutors into the learner's roadmap: tutors apply and get approved, learners find the
right tutor through a match score.

## 1. Tutor application (decision #17)
| Step | Content |
|---|---|
| 1. Account | Sign up via "Teach on Parle" |
| 2. Profile | Photo, display name, headline, bio (EN and/or FR), country, time zone, languages spoken (for explaining), years teaching |
| 3. Teaching | Specialties (Canada immigration / TEF-TCF prep, Canadian citizenship, Conversation, Grammar, Business French, Beginners, Kids excluded in Phase 1), levels taught (A1-C1), teaching style tags |
| 4. Pricing | Hourly rate in USD (min $10, max $150); 30 and 45-minute lessons are pro-rated |
| 5. Documents | Government ID (required), teaching certificates (optional but shown as badges once verified, e.g. DELF/DALF examiner, teaching degree) |
| 6. Intro video | 2-minute video in French (upload, max 200 MB) |
| 7. Meeting link | Personal Zoom or Google Meet link used for all lessons |
| 8. Agreement | Accept tutor agreement (commission 20%, cancellation rules, conduct) |
| 9. Payouts | Connect Stripe account (can be completed after approval, required before first booking) |

Statuses: Draft -> Submitted -> In review -> Approved / Needs changes / Rejected; Approved -> Suspended (admin).
Tutors see their status and admin comments; "Needs changes" lets them edit and resubmit.

## 2. Tutor profile (public, approved tutors only)
Photo, name, headline, Verified badge, certificate badges, rating (average + count, shown after 3 reviews),
"New tutor" badge until 3 reviews, specialties, levels, languages spoken, price per 60/45/30 min, intro video,
bio, next available slots, reviews.

## 3. Finding a tutor (learner)
- "Tutors" page lists approved tutors sorted by **match score** for this learner.
- Filters: specialty, price range, available in my tutor time windows, language spoken, rating 4+.
- Each card shows match score and the top reason ("Specializes in TEF prep · Free Tue 7 pm").

## 4. Match score (0-100)
| Factor | Weight | How |
|---|---|---|
| Goal / specialty fit | 30 | Tutor specialty matches learner's main goal = full; related = half |
| Level fit | 20 | Learner's current overall level within tutor's levels taught = full |
| Availability overlap | 25 | Share of learner's tutor time windows that overlap tutor availability in the next 14 days |
| Price fit | 15 | Within budget = full; up to 20% above = half; above = 0; no budget set = full |
| Shared language | 10 | Tutor speaks learner's native language = full; English only = half |
Rating is not in the score (protects new tutors) but breaks ties and is shown on the card.

## 5. Reviews
After a completed lesson the learner can leave 1-5 stars and an optional comment (one per lesson). Tutors can reply
once. Admin can hide abusive reviews.

## Acceptance criteria
- [ ] A tutor can complete all application steps, upload ID, certificates and video, and submit.
- [ ] Unapproved tutors never appear in search or have a public profile URL.
- [ ] Admin decision (approve / needs changes / reject) is emailed to the tutor and reflected in their status.
- [ ] The tutor list sorts by match score; filters work together; each card shows the top reason.
- [ ] Rating appears only after 3 reviews; "New tutor" shows before that.
- [ ] ID documents are only visible to admins (not to learners or other tutors).

## Out of scope (Phase 1)
Tutor-created courses or content sales (Phase 2), group lessons, kids' lessons, tutor subscriptions/packages,
tutors setting prices in other currencies.
