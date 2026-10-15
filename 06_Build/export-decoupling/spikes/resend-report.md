# Resend sending check (backend Plan 2, Task 8)

- **Date:** 2026-10-15 (UTC)
- **Domain:** `parle.buzz` added in Resend by the founder; DNS added at Porkbun by the COO agent (DKIM TXT
  `resend._domainkey`, CNAME `send` and `rsend` to `*.forge.rmta.net`, `_dmarc` TXT `v=DMARC1; p=none;`); Resend shows
  all four **Verified**. Porkbun's forwarding records (MX fwd1/fwd2, SPF on the root) were left untouched.
- **Key:** "Sending access", domain `parle.buzz`, created by the founder, stored only in
  `C:/Users/AgentDev/.parle-secrets/RESEND_API_KEY` (file uses `RESEND_API_KEY=...`; `readSecret` now accepts that form).
- **Test:** `bun scripts/spikes/resend-smoke.ts` sent "Parle sending test" from `Parle <hello@parle.buzz>` to
  `obsidianteamhq+resend@agentmail.to` at 01:52 UTC; Resend accepted it (id prefix `01a13d42`) and it **arrived** in the
  AgentMail inbox within two minutes.
- **Production use:** Supabase Auth SMTP settings recorded (commented) in `07_Engineering/parle-backend/supabase/config.toml`
  for Plan 4; the app's own mail (tutor decisions and others) uses the Resend API from Edge Functions in Plan 3.
- Not checked: SPF / DKIM pass results in the received headers (the AgentMail helper returns the body only); Resend's
  verified-domain status covers DKIM.
