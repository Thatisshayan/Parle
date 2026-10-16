# Plan 8 design: account administration and the waitlist launch email

Date: 2026-10-16. Status: **approved by the founder (2026-10-16)**. Author: COO (Claude), with the founder's decisions.
Builds `specs/SPEC-BACKLOG.md` rows 7 (account administration: D19, D20, D24) and 4 (waitlist launch email: D29, rest),
in the order of decision #54 (after Plan 7B payouts). Builds on the existing admin console (`AdminUsers`,
`AdminMetrics`, `AdminControlPanel`), the Resend email module and the parle.buzz waitlist (decision #43).

## 1. Purpose and success

Before launch, the founder can run Parle's accounts and its launch day from the admin console, without code changes:
- pause and restore any learner or tutor account, optionally cancelling and refunding their upcoming lessons;
- add and remove administrators, with the founder as the only owner;
- see a person's full picture when they write in, and real numbers on the metrics page;
- send the founding-tutor email and the launch email to the waitlist, keeping every promise made at sign-up.

## 2. Decisions this design rests on (founder, 2026-10-16)

| Topic | Decision |
|---|---|
| Disabling | Pause the account; the disable screen asks each time "Also cancel and refund their upcoming lessons?" |
| Administrators | Only an **owner** invites or removes admins; obsidianmedia.yt@gmail.com is the only owner; shayanezraeil@gmail.com and the test admin (decision #52) stay admins |
| Waitlist emails | Exactly as promised at sign-up: one launch email to everyone; one founding-tutor email to tutors before launch; one-click unsubscribe in every email; the list is deleted after launch |
| Who sends | An admin Waitlist page with preview, test send to self, typed confirmation, safe batches, no repeat sends, audit |
| Wording | Fixed text drafted by the COO and approved by the founder, with blanks the founder fills on the page (launch date, one personal paragraph) |
| Language | English only |
| Deleting the list | An owner-only button "Delete the waitlist (after launch)", the one deliberate exception to the rule that `waitlist_signup` is never modified |
| Out of scope | Custom roles beyond owner/admin; bulk actions on many accounts (recorded in SPEC-BACKLOG row 7 as later) |

## 3. Account administration

### 3.1 Roles and account status

- Roles stay in the login's `app_metadata.role` (`admin`, `learner`, `tutor`); a new flag `app_metadata.owner = true` marks
  an owner (written only with the service key). A one-time migration step sets it for obsidianmedia.yt@gmail.com
  (run by the founder as a `!` command, like every production migration).
- Account status lives in a new server-only table `account_status` (user_id, status `active | disabled`, reason,
  changed_by, changed_at). Missing row = active.
- Disabling uses Supabase Auth's ban (`ban_duration` far in the future) so every session ends and sign-in is refused,
  plus the status row for Parle's own checks. Enabling lifts the ban.

### 3.2 Disable and enable (any admin)

- Admin Users page, a selected account: **Disable account** opens a dialog with a required reason and the choice
  "Also cancel and refund their upcoming lessons?" (default: no).
- On disable:
  - the login is banned (all sessions end); the status row is written;
  - a disabled tutor's public listing is unpublished and their profile cannot be booked (`booking_options` and
    `book_lesson` refuse with "This tutor is not taking bookings right now");
  - if the admin chose yes: every upcoming confirmed lesson is cancelled with a full refund (the account-deletion
    path of Plan 7A, decision #53, reason `admin`), open holds end, and the other person is emailed;
  - if the admin chose no: lessons stay; the admin Bookings page lists "lessons with a disabled participant".
- A disabled person who tries to sign in sees: "Your account is paused. Contact hello@parle.buzz."
- **Enable account** lifts the ban, clears the status, and republishes a tutor's listing (if it was published
  before). Cancelled lessons stay cancelled.
- Admins and owners cannot be disabled here; an owner removes the admin role first. Nobody can disable themselves.
- Every disable and enable is written to `admin_audit_log` with the reason and the lessons choice.
- A Premium subscription is not touched; the admin cancels it in Stripe if needed (the user detail shows it).

### 3.3 Administrators (owner only)

- Admin Users page gains an **Administrators** section (visible to all admins; the actions only to owners):
  owner and admins with the date they became admin.
- **Invite administrator** by email: an existing Parle account is promoted to `admin` (its learner or tutor data
  stays readable as before); an unknown address gets an account created with role `admin` and the "Set your password
  for Parle" email (the flow used for the test admin).
- **Remove administrator**: the account becomes a learner (no data removed). Not allowed for oneself or for the last
  owner. Owners are changed only by the migration step or a later owner-only action (not in Plan 8).
- Every change is audited (`admin.invited`, `admin.removed`).

### 3.4 User details (D19)

Selecting an account shows, from server reads:
- everyone: role, owner flag, status (active or disabled with reason), sign-up date, last sign-in, email verified;
- learners: plan (Free or Premium, renewal or end date, Stripe customer link in test mode), goal, track, current
  levels per skill, this week's plan summary (tasks done of planned), AI tutor messages today and this month,
  lessons (upcoming, past, cancelled, refunds with amounts);
- tutors: application status, hourly rate, availability summary, founding date, lessons taught, average rating and
  count, payout account status (from Plan 7B);
- the person's recent admin audit entries.

### 3.5 Admin metrics (D24)

All computed on the server with service access (no "Not available"), for a chosen range (7, 30, 90 days):
- sign-ups per week (learners, tutors), active learners per week (practised at least once);
- Premium: paid, total, started and ended in the range;
- practice completed, weekly check-ins submitted, AI tutor messages;
- lessons: booked, completed, cancelled (by learner, by tutor), refunded amount, test-mode revenue and commission;
- tutor hours offered versus hours booked; learner demand (tutor windows chosen in onboarding) versus tutor supply,
  by weekday and time band;
- the track and specialty comparison from the current metrics page, now with real numbers.

## 4. Waitlist launch email

### 4.1 The list and new tables

- The list is `waitlist_signup` (id, email, role learner/tutor, goal, locale, source, consent_at, created_at), filled
  by `join_waitlist()` from parle.buzz. **Both stay unmodified** except by the owner-only delete in 4.6.
- New server-only tables:
  - `waitlist_send` (campaign `founding_tutor | launch`, signup_id, email, status `queued | sent | failed |
    skipped_unsubscribed`, resend_id, sent_at, error), unique (campaign, signup_id);
  - `waitlist_unsubscribe` (email, unsubscribed_at, source `link | header | admin`), unique email;
  - `waitlist_campaign` (campaign, blanks json, started_by, started_at, finished_at).

### 4.2 The emails

- From `Parle <hello@parle.buzz>`, English only, plain and warm, no em dashes.
- **Founding-tutor email** (role tutor, before launch): thanks for signing up to teach; the founding terms
  (10 % commission for the first 6 months, decision #22; the founding badge); what to prepare (rate, availability,
  a short intro, a Stripe payout account in test mode until launch); a "Create your tutor account" link to the app;
  the founder's personal paragraph (blank).
- **Launch email** (everyone): Parle is open on the launch date (blank); one line on what Parle does for their goal
  (learners: placement test, weekly plan, AI tutor, tutors; tutors: their listing is ready to set up); a "Start now"
  link; the founder's personal paragraph (blank).
- Every email ends with: why they are receiving it ("You joined the Parle waitlist at parle.buzz on <date>"), the
  sender's name and postal or contact address as Canada's anti-spam law requires, and an unsubscribe link.
- The COO drafts both texts in the plan; the founder approves the wording before it ships.

### 4.3 The admin Waitlist page (admins; sending by any admin, deleting by an owner)

- Counts: learners, tutors, unsubscribed, and for each campaign: queued, sent, failed.
- For each campaign: the blanks (launch date, personal paragraph), a live preview, **Send test to me** (to the
  signed-in admin's own address, marked "TEST"), then **Send** after typing `SEND`.
- Sending queues one `waitlist_send` row per eligible person (role matches, not unsubscribed, not already sent);
  pressing Send again queues nothing new.
- Progress updates while the batch runs; failures show with their reason and a **Retry failed** button.

### 4.4 Sending

- A jobs step (every minute while a campaign has queued rows) sends up to 50 per run, paced under Resend's rate
  limit, each with Resend's `Idempotency-Key` (`waitlist:<campaign>:<signup id>`), so a retried run never sends twice.
- Headers: `List-Unsubscribe` (the link and `mailto:unsubscribe@parle.buzz`) and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, so mail apps can show their own unsubscribe button.
- A person who unsubscribed after being queued is skipped (`skipped_unsubscribed`).

### 4.5 Unsubscribe

- Each email carries a personal link `/unsubscribe?t=<token>`; the token is an HMAC of the address with a server
  secret (no login needed, cannot be guessed for another address).
- The public page shows "You're unsubscribed. You won't get any more Parle emails at <address>." and records it.
  A one-click POST to the same address (from the mail app's button) records it without a page.
- An admin can also mark an address unsubscribed from the Waitlist page (for an emailed request).
- Unsubscribed addresses are never sent either campaign.

### 4.6 Deleting the list after launch (owner only)

- Enabled only after the launch campaign has finished. **Delete the waitlist** asks the owner to type `DELETE`, then
  removes every `waitlist_signup` row and the send records' addresses (keeping counts), and writes an audit entry.
- This is the one exception to the rule that `waitlist_signup` is never modified; it runs only from this button.
- `waitlist_unsubscribe` is kept (addresses that said no must stay suppressed if they sign up again later).

### 4.7 Privacy page

The parle.buzz privacy page is checked against this design and adjusted where needed (for example that the
founding-tutor email is a second email to tutors, and that unsubscribes are kept to honour them). Wording changes are
shown to the founder before publishing; a lawyer's review stays with D28.

## 5. Build, safety, testing, checks

- One plan, Plan 8, after Plan 7B; one migration (account status, owner flag step, waitlist tables, read rules);
  server actions in the existing admin services; one public unsubscribe function; jobs through the existing
  mechanism; pages in `parle-app`.
- Safety: owner-only actions checked on the server; nobody can disable or demote themselves or the last owner;
  every admin action audited; unsubscribe tokens signed; the waitlist read only by the server; `waitlist_signup` and
  `join_waitlist()` never changed except by 4.6.
- Testing: failing test first for each piece, on the local stack with the mail catcher; cases include disabling with
  and without lesson refunds, a disabled tutor's listing and booking, sign-in refused, invite of an existing and a new
  address, removing the last owner (refused), a campaign sent twice (no repeats), an unsubscribe between queueing and
  sending, the one-click POST, a forged token (refused), deleting the list before launch (refused).
- Checks on the real system (production, AgentMail): disable and enable an AgentMail test learner; invite and remove
  an AgentMail test admin; a test send of both emails to the founder's address and an AgentMail address; a small
  campaign to AgentMail addresses added through `join_waitlist()` and removed by the delete button afterwards, only
  with the founder's go (it touches the real list).

## 6. Not in Plan 8

Custom roles beyond owner/admin and bulk actions on many accounts (SPEC-BACKLOG row 7, later). Product news emails
(would need new consent). French versions of the emails.

## 7. Risks

- The checks in section 5 that add test addresses to the real waitlist touch production data; they run only with the
  founder's go and are deleted afterwards.
- Resend's plan limits (daily and monthly) are not documented here; the plan confirms them before a large send.
- Canada's anti-spam law: consent is express (the sign-up checkbox), but the email footer and unsubscribe must meet
  the law; the lawyer review of legal pages (D28) should include these emails.
