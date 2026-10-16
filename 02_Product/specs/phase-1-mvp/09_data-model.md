# Data Model (Phase 1)

Status (2026-10-16): BUILT on Parle's own stack (Supabase + Vercel); see HANDOFF.md section 4. Approved 2026-10-08 (decision #20) · Logical model; the physical schema is the Supabase migrations in `07_Engineering/parle-backend/supabase/migrations` (decision #44). Historical (Buildy era): Buildy.ai picked the physical schema, re-checked after each module and before export.
All timestamps UTC. Money in cents: lesson prices, payments, refunds and payouts in CAD (decision #55); Premium in USD.

## Accounts
| Entity | Key fields |
|---|---|
| user | id, email, role (learner / tutor / admin), name, photo, time_zone, native_language, explain_in_native (bool), email_verified, created_at, deleted_at; owner flag for admins (one owner, Plan 8); paused status kept in `account_status` (missing row = active, Plan 8) |
| admin_audit_log | id, admin_id, action, target_type, target_id, before, after, created_at |

## Learner
| Entity | Key fields |
|---|---|
| learner_profile | user_id, goals[], main_goal, track (immigration / citizenship / general), target_per_skill {L,R,W,S}, target_date, test_booked_date, availability {day: minutes}, tutor_windows[], tutor_budget_band, self_assessed_level |
| placement_result | id, user_id, taken_at, level_per_skill, nclc_estimate_per_skill, speaking_assessed (bool), responses[] |
| skill_estimate | user_id, skill, value (0-5, 0.25 steps), start_value, source (placement / checkin / retake), updated_at |
| roadmap | id, user_id, version, created_at, feasibility (on_track / tight / unlikely), required_hours, available_hours |
| milestone | id, roadmap_id, skill, from_value, to_value, can_do_text, status |
| week_plan | id, user_id, week_start, allocation {skill: pct}, what_changed_note |
| task | id, week_plan_id, date, type, skill, topic, minutes, reason_text, status (planned / done / skipped / rolled), source_ref |
| checkin | id, user_id, date, score_per_skill, delta_per_skill |
| mistake | id, user_id, skill, area, topic, example, correction, source (ai / tutor), created_at |
| topic_mastery | user_id, topic, score (0-100), last_items[] |

## AI tutor
| Entity | Key fields |
|---|---|
| ai_session | id, user_id, mode (lesson / speaking / writing / chat / question / live_voice), task_id, started_at, ended_at, voice_minutes |
| ai_message | id, session_id, sender (learner / tutor_ai), text, transcript, feedback {}, created_at (no learner audio stored, Plan 9) |
| usage_counter | user_id, period (day / month), period_key, ai_messages, voice_minutes (live voice not built yet) |
| voice_use | daily voice counters per learner: spoken answers, voice messages, replies read aloud (Plan 9) |
| speaking_result | transcript, four criteria scores, practice estimate, corrections, tip, duration, word count; no audio (Plan 9) |
| voice_preference | user_id, read replies aloud (on / off) (Plan 9) |

## Tutors and marketplace
| Entity | Key fields |
|---|---|
| tutor_profile | user_id, headline, bio, country, languages_spoken[], years_teaching, specialties[], levels_taught[], style_tags[], hourly_rate_cents, lengths_offered[], buffer_min, min_notice_hours, meeting_link, intro_video_url (unlisted YouTube / Vimeo link, provisional decision #25), status, status_comment, verified_at, founding_until (Plan 7) |
| tutor_payout_account | tutor_id, stripe_account_id (Stripe Connect Express), country, payouts_enabled, waitlisted_at (Plan 7B; holds what was planned as stripe_account_id and payouts_enabled on tutor_profile) |
| tutor_payout_country | countries Stripe cannot pay out to; tutors there join a waitlist (Plan 7B) |
| tutor_document | id, tutor_id, type (certificate), file_url (private), label, verified (bool). No ID documents (provisional decision #25) |
| availability_rule | id, tutor_id, weekday, start_local, end_local |
| availability_exception | id, tutor_id, date, start_local, end_local, kind (off / extra) |
| review | id, booking_id, learner_id, tutor_id, stars, comment, tutor_reply, hidden |

## Bookings and money
| Entity | Key fields |
|---|---|
| booking | id, learner_id, tutor_id, start_at, minutes, price_cents, commission_pct, status (pending_payment / confirmed / completed / learner_no_show / cancelled_learner / cancelled_tutor / disputed / refunded), learner_message, reschedule_count |
| lesson_brief | booking_id, content {}, generated_at |
| lesson_notes | booking_id, skills {skill: struggling/ok/strong}, notes, homework |
| payment | id, booking_id, stripe_payment_intent, amount_cents, status |
| payout | id, booking_id, tutor_id, amount_cents, release_at, stripe_transfer_id, status (scheduled / held / paid / cancelled) |
| refund | id, booking_id, amount_cents, reason, admin_id |
| subscription | user_id, plan (free / premium_monthly / premium_annual), stripe_subscription_id, status, current_period_end |

## Content
| Entity | Key fields |
|---|---|
| question_item | id, skill, cefr_level, format, prompt, audio_url (a real recording, if any; generated listening audio is cached separately, see below), options[], answer, explanation, status (draft / approved / retired), created_by (ai / admin), reviewed_by |
| prompt_item | id, kind (writing / speaking), cefr_level, track, text, status |
| listening_audio | index of generated listening audio, keyed by the item and its script, stored in the private bucket `listening-audio` (Plan 9) |

## Settings
| Entity | Key fields |
|---|---|
| app_setting | key, value, updated_by, updated_at (limits, commission, payout delay, cancellation window, feature flags) |

## Privacy notes
- tutor_document files and generated listening audio (bucket `listening-audio`) live in private storage, accessed
  through short-lived links. Learner recordings are sent for transcription and not stored; transcripts are kept with
  the account (Plan 9, decisions #57, #60).
- Learners see only their own records; tutors see learner data only through lesson briefs for their own bookings.
