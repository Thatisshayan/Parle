# Buildy export handbook (Parle), 2026-10-14

Written by Buildy at the COO's request (`../buildy-ai/prompts/13a_export-notes.txt`), text only, no app changes. Scanned by the COO for secret values: none found (names only). Treat as Buildy's own account; verify against the exported code.

Parle export handbook
No app files or data were changed, and no handbook file was created. R/W means entity reads/writes; “owner” means the account matching the record’s creator or user ID. Server-action checks are separate from entity access rules.
Server functions
Callable endpoints and worker
functions/parle-assessment-service.ts — Routes placement scoring, AI-tutor actions, coach notes, billing, and admin content actions. Signed-in learners may call learner actions; administrators may call protected admin actions; no anonymous or human-tutor access. R: ParleIdentity, learner_profile, ParleProfile, roadmap, week_plan, skill_estimate, learner_task, checkin, ParleCoachNote, Subscriber, app_setting, usage_counter, ai_session, ai_message, mistake_log, topic_mastery. W: ParleCoachNote, Subscriber, ai_message, ai_session, learner_task, week_plan, usage_counter, mistake_log, topic_mastery, question_item, prompt_item, admin_audit_log.
functions/parle-marketplace-service.ts — Routes tutor, booking, admin, and review actions. Signed-in learners, tutors, and administrators may call actions permitted to their role; no anonymous access. R: ParleIdentity, ParleProfile, learner_profile, roadmap, week_plan, skill_estimate, tutor_profile, tutor_application_review, tutor_payout_country, tutor_document, tutor_profile_public_edits, tutor_public_profile, availability_rule, availability_exception, tutor_booking_settings, booking, question_item, prompt_item, app_setting, admin_audit_log, ParleCompStatus, practice_report, tutor_review, tutor_review_reply, plus Buildy account records via auth.list(). W: ParleIdentity, ParleCompStatus, admin_audit_log, app_setting, practice_report, question_item, prompt_item, tutor_profile, tutor_application_review, tutor_payout_country, tutor_document, tutor_profile_public_edits, tutor_public_profile, availability_rule, availability_exception, tutor_booking_settings, booking, tutor_review, tutor_review_reply.
functions/parle-public-level-check.ts — Starts and scores the no-sign-in French level check. Anyone may call it. R: question_item, ParlePublicLevelCheckRun. W: creates and deletes ParlePublicLevelCheckRun records.
functions/parle-marketplace-refresh.ts — Refreshes approved public tutor listings. Called by the system at startup and hourly; its HTTP handler returns 404. R: tutor_public_profile, tutor_profile, tutor_application_review, availability_rule, availability_exception, tutor_booking_settings, tutor_review, tutor_review_reply, booking, tutor_profile_public_edits. W: updates or unpublishes tutor_public_profile.
functions/parle-tutor-profile-refresh.ts — Retired 404 endpoint; no entity access.
Internal helper files, not separate URLs
functions/parle-admin-access.helper.ts — Checks administrator role; called inside protected actions; no entity reads/writes.
functions/parle-admin-content.helper.ts — Admin bank inventory and edits; admin actions; R: question_item, prompt_item; W: both plus admin_audit_log.
functions/parle-admin-draft-generation.helper.ts — Generates reviewable AI drafts; administrator only through its guarded action; W: question_item or prompt_item, admin_audit_log.
functions/parle-admin-metrics.helper.ts — Builds admin metrics; administrator only through its guarded action; R: ParleIdentity, ParleProfile, tutor_profile, tutor_application_review, availability_rule, booking; W: none.
functions/parle-admin-reports.helper.ts — Lists and resolves learner reports; administrator only; R/W: practice_report; W also admin_audit_log.
functions/parle-admin-reviews.helper.ts — Moderates tutor reviews; administrator only; R: tutor_review, tutor_profile, tutor_review_reply, Buildy accounts via auth.list(); W: tutor_review, admin_audit_log.
functions/parle-admin-settings.helper.ts — Reads and saves settings, audits changes, and supports bank edits; administrator only; R: app_setting, admin_audit_log, tutor_application_review, question_item, prompt_item; W: app_setting, admin_audit_log, question_item, prompt_item.
functions/parle-admin-users.helper.ts — Lists accounts and manages complimentary Premium; administrator only; R: Buildy accounts via auth.list(), ParleIdentity, ParleProfile, admin_audit_log, ParleCompStatus, tutor_profile, tutor_application_review, availability_rule, tutor_profile_public_edits, booking; W: ParleCompStatus, ParleIdentity, admin_audit_log.
functions/parle-billing-checkout.helper.ts — Checks learner billing eligibility and creates Stripe checkout; called for eligible signed-in learners; R: ParleIdentity, Subscriber; W: no entities.
functions/parle-booking-slots.helper.ts — Calculates and validates tutor availability; internal to marketplace actions; no entity access.
functions/parle-coach-note.helper.ts — Builds the daily coach note; called for an authenticated learner; reads/writes ParleCoachNote through the service’s storage adapter.
functions/parle-marketplace.helper.ts — Validates marketplace and booking data; internal to role-checked marketplace actions; no direct entity access, but its injected booking callback creates booking.
functions/parle-premium-language-point-trigger.helper.ts — Applies an optional Premium planner trigger; internal; no direct entity access.
functions/parle-premium-status.helper.ts — Resolves paid or complimentary Premium; internal to authenticated actions; reads/writes Subscriber and may retrieve Stripe records.
functions/parle-public-level-check.helper.ts — Selects and scores public-test questions; internal to the public endpoint; no direct entity access, uses callbacks for ParlePublicLevelCheckRun.
functions/parle-stripe-subscription.logic.helper.ts — Validates Stripe sessions/status and signs the cache; internal to billing; no entity access.
functions/parle-tutor-answer-options.helper.ts — Creates shuffled AI-tutor choices; internal to learner tutor actions; no entity access.
functions/parle-tutor-service.helper.ts — Handles learner AI-tutor sessions, practice, and usage; authenticated onboarded learners through the assessment service. R: ParleProfile, roadmap, mistake_log, topic_mastery, app_setting, skill_estimate, week_plan, usage_counter, ai_session, learner_task, ai_message, Subscriber. W: ai_message, mistake_log, usage_counter, topic_mastery, learner_task, week_plan, ai_session.
functions/parle-tutor.helper.ts — Supplies AI-tutor prompts and guardrails; internal to learner tutor actions; no entity access.
Entities
There are 36 app-defined entities plus Buildy’s managed User entity. “Signed-in” means any authenticated Buildy account; it does not mean a Parle learner. These are current entity-definition rules, separate from server-action checks.
Owner-controlled records
checkin — Weekly learner check-in; owner can create, read, update, delete.
learner_profile — Learner goals, level, schedule, preferences; owner CRUD.
learner_task — Learner plan tasks and completion; owner CRUD.
milestone — Learner roadmap milestones; owner CRUD.
ParleCoachNote — Daily learner coach note; owner CRUD.
ParleProfile — Parle profile and language preferences; owner CRUD.
placement_result — Learner placement history; owner CRUD.
roadmap — Learner roadmap; owner CRUD.
skill_estimate — Learner skill estimates; owner CRUD.
Subscriber — Learner Stripe subscription and signed entitlement cache; owner CRUD, but the billing code separately verifies Stripe before trusting it.
week_plan — Learner weekly plan; owner CRUD.
ai_session — AI-tutor session and progress; owner create/read/update, administrator delete.
ai_message — AI-tutor messages; owner create/read, administrator update/delete.
mistake_log — Learner corrections; owner create/read, administrator update/delete.
topic_mastery — Learner topic/language-point progress; owner create/read, administrator update/delete.
usage_counter — AI usage counts; owner create/read, administrator update/delete.
Other custom rules
admin_audit_log — Admin action history; administrator create/read; the current update/delete conditions appear to block those operations.
app_setting — Global app limits and tutor terms; signed-in users read, administrators write.
availability_exception — Tutor date-specific availability; tutor owner and administrators read, tutor owner writes.
availability_rule — Tutor weekly availability; tutor owner and administrators read, tutor owner writes.
booking — Lesson requests and decisions; learner creates own, creator/assigned tutor/administrator read, assigned tutor/administrator update, administrator delete. Direct writes can bypass service validation.
ParleCompStatus — Complimentary Premium status; matching user and administrators read, administrators write.
ParleIdentity — Parle role and complimentary Premium flag; owner may create only with the complimentary flag false; owner/administrator read; administrators update/delete.
ParlePublicLevelCheckRun — Temporary public-test scoring map; administrator-only by entity rules, with the public server function using its server-side service key.
practice_report — Learner practice issue reports; owner create/read, administrator read/update/delete.
prompt_item — Writing/speaking prompt bank; all signed-in users read, administrators write.
question_item — Placement/check-in question bank; all signed-in users read, administrators write.
tutor_application_review — Tutor application decisions; matching tutor email and administrators read, administrators write.
tutor_booking_settings — Tutor booking preferences; matching tutor may create/read/update; administrators read/update/delete.
tutor_document — Tutor application documents; owner create/read, administrator read/update, owner or administrator delete.
tutor_payout_country — Supported/waitlisted tutor payout countries; signed-in users read, administrators write.
tutor_profile — Private tutor application/profile; owner create/read/update, administrator read/delete.
tutor_profile_public_edits — Tutor-submitted listing edits; owner create/read/update, administrator read/delete.
tutor_public_profile — Published tutor listing snapshots; signed-in users read published rows, administrators manage them.
tutor_review — Tutor reviews; administrator-only CRUD.
tutor_review_reply — Tutor review replies; owner create/read, administrator read/update/delete.
User — Buildy login account fields such as email and role; platform-managed, not defined in the app entity files. App access uses Buildy Auth; the entity-level permissions are unknown from project files.
Secrets and integrations
Names only; no values are included.
STRIPE_SECRET_KEY — Set for Stripe billing; the app accepts test-mode keys only.
SUPERDEV_SERVICE_ROLE_KEY — Buildy-injected server key used by the public level-check and marketplace refresh.
SUPERDEV_APP_ID — Buildy app identifier used by server functions.
VITE_APP_ID and VITE_SUPERDEV_BASE_URL — Browser Buildy client settings; their actual values are supplied at deployment and are not visible here.
NEXT_PUBLIC_PUBLIC_CHAT_KEY — Present in the project’s secret list, but no current Parle source reference was found; its use here is unknown.
BUILDY_WORKSPACE_PROVIDER and SUPERDEV_SANDBOX — Build/build-time environment switches, not secrets.
No provider-specific AI key or STRIPE_WEBHOOK_SECRET reference was found; there is no Stripe webhook handler.
Integrations: Stripe is the only linked third-party platform. AI calls use Buildy’s invokeLLM, email notifications use Buildy’s sendEmail, and profile uploads use Buildy’s uploadFile; these do not require app-managed provider keys. Other integrations exported from src/integrations/core.ts were not found in active use.
Saved settings
Current app_setting values read from the project’s records on 2026-10-14:
free_ai_messages_per_day: 10; Free AI-tutor daily allowance.
premium_fair_use_ai_messages_per_day: 300; Premium AI-tutor daily allowance.
premium_live_voice_minutes_per_month: 60; stored voice-minute limit, currently inactive because live voice is disabled.
commission_percent: 20%; tutor commission setting and display; actual tutor payouts are not implemented.
payout_delay_hours: 72; configured payout policy; no payout job is running.
cancellation_window_hours: 24; configured policy; a full cancellation workflow is not implemented.
minimum_lesson_charge_usd: $8; minimum tutor lesson charge setting.
live_voice_enabled: false; turns live voice off.
premium_roadmap_triggers_enabled: false; turns Premium roadmap triggers off.
Other current settings:
Project features: SEO disabled; installable app disabled; CMS inactive; Stripe configured.
Buildy communication switches: email auto-reply off, SMS auto-reply off, inbound marketing-call answering on, booking calendar not connected. These are separate from Parle’s transactional emails and tutor bookings.
Client options in src/lib/superdev/client.ts: global requiresAuth false, Buildy branding on, empty affiliate ID, login route /login. Individual routes and server actions still perform their own access checks.
Code-defined Stripe prices: USD $14.99/month and $119/year; checkout uses inline subscription prices.
New-tutor booking defaults: 30/45/60-minute lessons, zero-minute buffer, 12-hour notice, 30-day window. Saved settings can vary by tutor; individual tutor records were not inventoried.
Vite build configuration uses SUPERDEV_SANDBOX; its workspace-provider value is unknown here.
Scheduled or background jobs
parle-marketplace-availability-refresh — 0 * * * *, hourly at minute zero, plus a startup run; refreshes approved public tutor listings and safe busy-time snapshots.
Public-level-check mappings expire after one hour and are deleted after scoring; there is no scheduled cleanup job.
No other cron job, webhook worker, or automatic email-retry worker was found; failed tutor email sends require an administrator retry.
Platform-specific parts to replace when exporting
src/lib/superdev/client.ts — Buildy client, authentication settings, and environment connection.
src/entities/index.ts and entities/*.json — Buildy entity access and row rules; all current entity rules need an equivalent outside Buildy.
src/functions/index.ts — Buildy function-call bridge.
functions/parle-assessment-service.ts, functions/parle-marketplace-service.ts, and functions/parle-public-level-check.ts — Buildy function deployment, auth, and entity clients.
functions/parle-marketplace-refresh.ts — Deno server, environment, and cron runtime.
src/integrations/core.ts and its active callers, including functions/parle-assessment-service.ts, functions/parle-tutor-service.helper.ts, functions/parle-admin-draft-generation.helper.ts, functions/parle-marketplace-service.ts, and src/pages/Settings.tsx — Buildy AI, email, and file-storage services.
src/App.tsx, src/pages/RoleShell.tsx, and src/lib/parle-profile.ts — Buildy-managed sign-in and account access; other files importing @/entities, @/functions, or @/integrations/core are platform-dependent too.
vite.config.ts — Buildy sandbox build behavior.
Stripe is external, but its current server actions and secret injection are tied to Buildy; replace those connections and preserve the test-mode restrictions if continuing billing.
Known gaps
The project is a test-only demo; current test-flagged inventory is 120 approved questions, 1 draft question, and 16 approved prompts.
Any signed-in user can directly read question/prompt rows across statuses, including answer-key fields; the placement and check-in screens filter what they serve but do not change entity access.
Owners can edit many of their own learner records, and usage counters are owner-writable; quota checks are not atomic, so concurrent requests can exceed limits.
Practice generation and writing scoring have no request rate limit; the public level-check’s five-starts-per-hour reminder is browser-only and bypassable.
Repeated public level-check starts can enumerate question text/options; simultaneous scoring can race, and expired run records have no automatic purge.
Stripe subscription handling is test-key-only and has no webhooks; external changes rely on checkout return, explicit refresh, or the one-hour signed cache.
Tutor booking writes can bypass service validation, simultaneous acceptances can race, and public availability snapshots may be hourly-stale; lesson payments/payouts and later cancellation/rescheduling/attendance/notes/reminders remain deferred.
Daily coach-note creation uses a non-atomic read-then-create flow; separate instances can race.
Admin metrics cannot read several owner-only learner sources, so affected values show unavailable rather than zero.
Listening remains transcript-only and speaking is not assessed in this demo; no speech provider is configured.
Google sign-in is unavailable; signup does not verify email, and self-service account deletion is unavailable.
