# Cut-over report

Date: 2026-10-15. Plan 4, Task 12. Founder "go" at 09:15 UTC ("YEs GO AHead").

From this point the production Supabase project "Parle" (hcphvipeplkfenugikrf, ca-central-1) is the source of truth.
Buildy is frozen: no edits since the final export; the Buildy site stays unpublished and untouched until 2026-11-14,
then it is archived.

## Steps (spec section 10, in order)

| Time (UTC) | Step | Result |
|---|---|---|
| 09:13 | Final export from Buildy (`export-20261015-0913`): six test accounts plus the owner preview (shayanezraeil@gmail.com, no table refused) | 7 people, 435 rows; identical counts to the review copy (nothing changed in Buildy) |
| 09:15 | Founder go; Buildy frozen | - |
| 09:15 | `clean-app-tables.ts obsidianmedia.yt@gmail.com,shayanezraeil@gmail.com prod --founder-go` | 39 tables emptied; 12 logins removed (preview test sign-ups, review logins, founder's test account); the 3 settings written by migrations kept; **waitlist 0 -> 0** |
| 09:16 | Final load and verify (`verify.ts ... prod`, both admins) | 83 checks ok, 0 FAIL, VERIFIED; question bank 121, prompts 16, settings 12; 0 person ids without an account; 0 Buildy hosts; **waitlist unchanged (0 -> 0)** |
| 09:17 | Stripe sandbox re-tag (`stripe-retag.ts ... prod`) | 2 tags changed, no problems |
| 09:18 | "Set your password for Parle" (Resend) to the 8 addresses the founder approved | all 8 sent: 6 AgentMail test accounts, shayanezraeil@gmail.com, obsidianmedia.yt@gmail.com |
| 09:20 | End-to-end check | m3imm and m5tut1 links received at AgentMail from hello@parle.buzz; passwords set from them |

## Logins after the cut-over

| Login | Role |
|---|---|
| obsidianmedia.yt@gmail.com | admin (new login; not in Buildy) |
| shayanezraeil@gmail.com | admin (Buildy owner; owns the question bank, prompts, settings and audit log) |
| obsidianteamhq+m3cit, +m3imm, +imm1, +learner1 @agentmail.to | learner |
| obsidianteamhq+m5tut1, +tutor1 @agentmail.to | tutor |

Everyone sets a password from the emailed link (passwords set during the review were removed with the clean).

## Smoke after the cut-over (private preview, clean browser)

| Who | Result |
|---|---|
| m3imm | Today with the migrated plan and levels; Your plan "Premium plan (monthly), renews on 13 November 2026"; AI tutor opened as Premium and replied |
| m5tut1 | "Your profile is visible to learners", approved |
| signed out | level check serves question 1 of 10 |

No console errors.

## Still to do before a public launch (spec section 10)

- Real question bank (the 121 items are clearly marked test content), lawyer-reviewed legal pages, real tutors.
- Stripe live mode (today sandbox only).
- Point parle.buzz at the new app (it still serves the waitlist site) and remove the preview-only protection.
- Supabase Pro instead of Free (decision #50): backups, larger compute, no pausing.
- Archive Buildy after 2026-11-14.
