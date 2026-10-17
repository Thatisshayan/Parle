# Parle waitlist (parle.buzz)

Single static page. Sign-ups go to the Supabase project "Parle" (ref hcphvipeplkfenugikrf, ca-central-1) through the
`public.join_waitlist(...)` function; the `waitlist_signup` table cannot be read with the public key (decision #43).
The key in `index.html` is the publishable key, which is meant to be public.

Deploy: `vercel` from this folder (team "Shayan's projects"). Read sign-ups: Supabase dashboard > Table editor >
waitlist_signup, or SQL as the project owner.

## Status (2026-10-16)
- **LIVE at https://parle.buzz** (https://www.parle.buzz redirects to it once Plan 11 is published: `vercel.json` `redirects`, A85);
  also https://parle-waitlist.vercel.app. Vercel team "Shayan's projects", project `parle-waitlist`. Published only by
  the founder (`vercel --prod` from this folder).
- Pages: `index.html` (the sign-up form), `privacy.html` (plain-language draft, not lawyer-reviewed; updated in Plan 8:
  it names the founding-tutor email, Resend as the sender and the do-not-email list of unsubscribes), `unsubscribe.html`
  (Plan 8; since Plan 11 it asks first: nothing happens until the person presses "Unsubscribe me", so a mail
  scanner opening the link cannot unsubscribe anyone; mail providers' one-click unsubscribe posts to the backend
  function `parle-waitlist-unsubscribe` directly).
- The launch email to the waitlist is sent from the app's Admin > Waitlist page (Plan 8) through Resend, in batches,
  with an unsubscribe link in every email. Real sends stay blocked until the founder sets the sender postal address
  (Canada's anti-spam law). After launch, the owner deletes the whole list from the same page.
- `waitlist_signup` and `join_waitlist()` are never changed; sign-ups are unique per email and role.
- Email forwarding at Porkbun (hello, support, tutors, privacy, legal, billing, team, admin, partnerships, press and
  unsubscribe @parle.buzz) goes to the founder's Gmail.

## History (2026-10-14)
- **LIVE at https://parle.buzz** (and https://www.parle.buzz); also https://parle-waitlist.vercel.app. Vercel team
  "Shayan's projects", project `parle-waitlist`. Tested: sign-up stored, duplicate ignored, bad input rejected, list
  not readable with the public key, phone width fits, no CSP errors. COO test rows deleted.
- DNS at Porkbun (done by the COO in the founder's signed-in session): parking ALIAS `@` and CNAME `*` ->
  pixie.porkbun.com deleted; added A `@` -> 216.150.1.1 and CNAME `www` -> bf1e4357e217add6.vercel-dns-016.com.
  (both noted "Parle waitlist on Vercel"). MX fwd1/fwd2.porkbun.com present (Porkbun email forwarding). Vercel
  verify: both names configured.
- Email forwarding (Porkbun, free, 10 of 20 used), all to the founder's Gmail: hello, support, tutors, privacy, legal,
  billing, team, admin, partnerships, press @parle.buzz. Test mail sent to hello@ from the agent's AgentMail inbox at
  ~5:45 pm (founder to confirm arrival). A Porkbun hosted-mail free trial "pending setup" (expires 2026-10-23) was
  left untouched; it lapses on its own.
- Footer contact: hello@parle.buzz and tutors@parle.buzz.
- Privacy page LIVE at https://parle.buzz/privacy (plain-language draft by the COO, not lawyer-reviewed), linked from
  the consent line, the "Your email stays with us" note and the footer.
- `vercel.json` (clean URLs + security headers incl. CSP) was missing from the first three deploys (a failed shell
  step); added and deployed ~6:00 pm; form re-tested under the CSP: works.
- Sending service: deferred at the time (D29); done in Plan 8 with Resend.
