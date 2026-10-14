# Parle waitlist (parle.buzz)

Single static page. Sign-ups go to the Supabase project "Parle" (ref hcphvipeplkfenugikrf, ca-central-1) through the
`public.join_waitlist(...)` function; the `waitlist_signup` table cannot be read with the public key (decision #43).
The key in `index.html` is the publishable key, which is meant to be public.

Deploy: `vercel` from this folder (team "Shayan's projects"). Read sign-ups: Supabase dashboard > Table editor >
waitlist_signup, or SQL as the project owner.

## Status (2026-10-14)
- Live at https://parle-waitlist.vercel.app (public; Vercel team "Shayan's projects", project `parle-waitlist`).
  Tested: sign-up stored, duplicate ignored, bad input rejected, list not readable with the public key, phone width
  fits, no CSP errors. COO test rows deleted.
- `parle.buzz` and `www.parle.buzz` attached to the project; waiting for DNS at Porkbun (nameservers
  *.ns.porkbun.com, currently Porkbun parking):
  - delete the parking records (A `@` 207.207.210.107 / 207.207.210.229 and CNAME `www` -> pixie.porkbun.com);
  - add A `@` -> `216.150.1.1`;
  - add CNAME `www` -> `bf1e4357e217add6.vercel-dns-016.com.`
  - then `vercel domains verify parle.buzz` (and www) from this folder.
- Not done yet: a contact address in the footer (needed for email consent rules before mailing anyone), a privacy
  page, and the launch email itself.
