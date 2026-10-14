# Task 9 regression pass, 2026-10-14 (~5:00-5:40 am ET)

Method: the agent visited every page in the preview tab as each role (scratchpad `sweep.sh`: account shown, page
heading, page length, any error-like text) and investigated anything odd. Editor tabs on "Code" view throughout.

## Result
| Role | Pages | Result |
|---|---|---|
| Learner B (immigration, paid Premium) | Today, Roadmap, AI Tutor, Progress (card + printable summary), Your plan, Tutors, Lessons, Weekly check-in, Account settings | All load. Analytics card: Speaking 10 + Weekly check-ins 10 = 20 (verified after 10d4) |
| Learner B | Placement test (/placement-test) | **FAIL: blank page.** `TypeError: Cannot read properties of null (reading 'options') at PlacementTest (src/pages/PlacementTest.tsx:205:106)`. Same for a signed-out visitor. Fix sent: `../prompts/12a_placement-crash.txt` (D27) |
| Learner A (citizenship, comp Premium) | Today, Roadmap, AI Tutor, Progress, Your plan, Tutors, Lessons, Weekly check-in | All load |
| Tutor M5 | Dashboard, Application, Students, Lessons, Availability, Reviews, Profile & Pricing, Earnings | All load ("Not available" on Availability = days off). Students / Lessons / Earnings are empty shells (no bookings on Buildy) |
| Owner / admin | Applications, Users, Bookings, Content, Reported content, Reviews, Question bank audit, Settings, Metrics | All load. Known "Not available" fields (D19, D24). Bookings is a stub (no bookings) |
| Signed out | Home, Level check, six public pages, Login, Sign-up (learner and tutor), Onboarding | All load |
| Signed out | /legal/terms, /legal/privacy, /legal/tutor-agreement, /legal/refunds | **Heading only (about 45 characters): no legal text.** Needs real legal documents before any launch (not a Buildy task; D28) |

Not re-tested in this pass: Stripe checkout (founder-only clicks), AI lesson mini-test, check-in submission, tutor
application submission, admin approval of a new tutor.
