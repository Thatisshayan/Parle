# Data Model (Phase 1)

Status: DRAFT · Logical model; Buildy.ai picks the physical schema. Re-check against the generated schema after
each module and before export. All timestamps UTC. All money in USD cents.

## Accounts
| Entity | Key fields |
|---|---|
| user | id, email, role (learner / tutor / admin), name, photo, time_zone, native_language, explain_in_native (bool), email_verified, created_at, deleted_at |
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
| ai_message | id, session_id, sender (learner / tutor_ai), text, audio_url, transcript, feedback {}, created_at |
| usage_counter | user_id, period (day / month), period_key, ai_messages, voice_minutes |

## Tutors and marketplace
| Entity | Key fields |
|---|---|
| tutor_profile | user_id, headline, bio, country, languages_spoken[], years_teaching, specialties[], levels_taught[], style_tags[], hourly_rate_cents, lengths_offered[], buffer_min, min_notice_hours, meeting_link, intro_video_url, status, status_comment, stripe_account_id, payouts_enabled, verified_at |
| tutor_document | id, tutor_id, type (id / certificate), file_url (private), label, verified (bool) |
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
| question_item | id, skill, cefr_level, format, prompt, audio_url, options[], answer, explanation, status (draft / approved / retired), created_by (ai / admin), reviewed_by |
| prompt_item | id, kind (writing / speaking), cefr_level, track, text, status |

## Settings
| Entity | Key fields |
|---|---|
| app_setting | key, value, updated_by, updated_at (limits, commission, payout delay, cancellation window, feature flags) |

## Privacy notes
- tutor_document files and ai_message audio live in private storage, accessed through short-lived links.
- Learners see only their own records; tutors see learner data only through lesson briefs for their own bookings.
