import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminMetricsAction,
  buildAdminMetricsSnapshot,
  buildCurrentPremiumSplit,
  parseAdminMetricsDateRange,
  adminMetricsTimestampIsInRange,
  readAdminMetricsSources,
  type AdminMetricsRow,
  type AdminMetricsSources,
} from "../../functions/parle-admin-metrics.helper.ts";
import { createSubscriptionCacheSignature } from "../../functions/parle-stripe-subscription.logic.helper.ts";
import { AdminActionError, type AdminActor } from "../../functions/parle-admin-settings.helper.ts";
import {
  adminMetricsCalendarRangeIsValid,
  adminMetricsPresetRange,
} from "./admin-metrics-date";

const TEST_STRIPE_SECRET = "sk_test_parle-metrics-unit-test-key";
const NOW = new Date("2026-10-14T12:00:00.000Z");
const RANGE = parseAdminMetricsDateRange({ start_date: "2026-10-01", end_date: "2026-10-07" });
const ADMIN: AdminActor = { id: "metrics-admin-1", email: "admin@parle.test", role: "administrator" };
const LEARNER_CALLER: AdminActor = { id: "metrics-learner-1", email: "learner@parle.test", role: "user" };

const READABLE_SOURCES = [
  "ParleIdentity",
  "ParleProfile",
  "tutor_profile",
  "tutor_application_review",
  "availability_rule",
  "booking",
] as const;

type Row = AdminMetricsRow & Record<string, any>;
type ReadableSource = (typeof READABLE_SOURCES)[number];

function sourceSet(overrides: AdminMetricsSources = {}): AdminMetricsSources {
  return {
    ParleIdentity: [],
    ParleProfile: [],
    tutor_profile: [],
    tutor_application_review: [],
    availability_rule: [],
    booking: [],
    learner_profile: [],
    learner_task: [],
    ai_message: [],
    checkin: [],
    Subscriber: [],
    ...overrides,
  };
}

function identity(id: string, email: string, createdAt: string, overrides: Row = {}): Row {
  return {
    id,
    created_by: email,
    role: "learner",
    created_at: createdAt,
    updated_at: createdAt,
    premium_comp_active: false,
    ...overrides,
  };
}

function tutorProfile(
  id: string,
  userId: string,
  email: string,
  timeZone: string,
  specialties: string[],
  createdAt = "2026-09-20T12:00:00.000Z",
  overrides: Row = {},
): Row {
  return {
    id,
    user_id: userId,
    created_by: email,
    application_intent: "submitted",
    submission_revision: 1,
    time_zone: timeZone,
    specialties,
    created_at: createdAt,
    updated_at: createdAt,
    ...overrides,
  };
}

function approvedReview(id: string, profileId: string, updatedAt = "2026-09-21T12:00:00.000Z", overrides: Row = {}): Row {
  return {
    id,
    profile_id: profileId,
    status: "Approved",
    reviewed_revision: 1,
    created_at: updatedAt,
    updated_at: updatedAt,
    ...overrides,
  };
}

function learnerProfile(email: string, track: string, availability: Record<string, number>, updatedAt = "2026-09-21T12:00:00.000Z"): Row {
  return {
    id: `learner-profile-${email}`,
    created_by: email,
    track,
    availability: JSON.stringify(availability),
    created_at: updatedAt,
    updated_at: updatedAt,
  };
}

function timeZoneProfile(id: string, email: string, timeZone: string, updatedAt = "2026-09-21T12:00:00.000Z"): Row {
  return { id, created_by: email, time_zone: timeZone, created_at: updatedAt, updated_at: updatedAt };
}

function metricsReaderClient(options: {
  rows?: Partial<Record<ReadableSource, Row[]>>;
  fail?: ReadableSource[];
} = {}) {
  const reads: string[] = [];
  const entities: Record<string, any> = {};
  for (const source of READABLE_SOURCES) {
    entities[source] = {
      filter: async (_filters: Record<string, unknown>, _sort: string, limit: number, offset = 0, _fields: string[] = []) => {
        reads.push(source);
        if (options.fail?.includes(source)) throw new Error(`read denied for ${source}`);
        const rows = options.rows?.[source] ?? [];
        return { data: structuredClone(rows.slice(offset, offset + limit)), total: rows.length };
      },
    };
  }
  return { client: { entities }, reads };
}

function minimalReadableRows(): Partial<Record<ReadableSource, Row[]>> {
  const learnerEmail = "learner@parle.test";
  const tutorEmail = "tutor@parle.test";
  const tutor = tutorProfile("tutor-profile-1", "tutor-user-1", tutorEmail, "America/Toronto", ["canada_immigration_tef_tcf"]);
  return {
    ParleIdentity: [identity("learner-identity-1", learnerEmail, "2026-10-02T12:00:00.000Z")],
    ParleProfile: [timeZoneProfile("profile-1", learnerEmail, "America/Toronto")],
    tutor_profile: [tutor],
    tutor_application_review: [approvedReview("review-1", String(tutor.id))],
    availability_rule: [{
      id: "availability-1",
      profile_id: tutor.id,
      user_id: tutor.user_id,
      day_of_week: 1,
      start_local: "09:00",
      end_local: "10:00",
      time_zone: "America/Toronto",
      created_at: "2026-09-22T12:00:00.000Z",
    }],
    booking: [{ id: "booking-1", created_at: "2026-10-03T12:00:00.000Z", status: "requested" }],
  };
}

function submittedProfile(id: string, createdAt: string): Row {
  return tutorProfile(id, `user-${id}`, `${id}@parle.test`, "America/Toronto", [], createdAt);
}

async function signedSubscriber(userId: string, email: string, overrides: Partial<{
  plan: "premium_monthly" | "premium_annual";
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string;
  lastConfirmedAt: string;
}> = {}) {
  const payload = {
    userId,
    customerId: `cus_${userId}`,
    subscriptionId: `sub_${userId}`,
    plan: overrides.plan ?? "premium_monthly" as const,
    status: overrides.status ?? "active",
    cancelAtPeriodEnd: overrides.cancelAtPeriodEnd ?? false,
    currentPeriodEnd: overrides.currentPeriodEnd ?? "2026-11-14T12:00:00.000Z",
    lastConfirmedAt: overrides.lastConfirmedAt ?? new Date(NOW.getTime() - 30 * 60 * 1000).toISOString(),
  };
  const cacheSignature = await createSubscriptionCacheSignature(payload, TEST_STRIPE_SECRET);
  return {
    id: `subscriber-${userId}`,
    created_by: email,
    email,
    user_id: userId,
    stripe_customer_id: payload.customerId,
    stripe_subscription_id: payload.subscriptionId,
    plan: payload.plan,
    stripe_status: payload.status,
    cancel_at_period_end: payload.cancelAtPeriodEnd,
    current_period_end: payload.currentPeriodEnd,
    last_confirmed_at: payload.lastConfirmedAt,
    cache_signature: cacheSignature,
  } satisfies Row;
}

describe("Parle administrator metrics dates", () => {
  it("uses inclusive UTC calendar boundaries and excludes the next midnight", () => {
    const range = parseAdminMetricsDateRange({ start_date: "2026-04-30", end_date: "2026-05-02" });
    assert.equal(range.start_ms, Date.parse("2026-04-30T00:00:00.000Z"));
    assert.equal(range.end_exclusive_ms, Date.parse("2026-05-03T00:00:00.000Z"));
    assert.equal(range.start_date, "2026-04-30");
    assert.equal(range.end_date, "2026-05-02");
    assert.equal(new Date(range.end_exclusive_ms - 1).toISOString(), "2026-05-02T23:59:59.999Z");
  });

  it("accepts the first and last instant in a range, but not instants outside it", () => {
    const range = parseAdminMetricsDateRange({ start_date: "2026-10-01", end_date: "2026-10-07" });
    assert.equal(adminMetricsTimestampIsInRange("2026-09-30T23:59:59.999Z", range), false);
    assert.equal(adminMetricsTimestampIsInRange("2026-10-01T00:00:00.000Z", range), true);
    assert.equal(adminMetricsTimestampIsInRange("2026-10-07T23:59:59.999Z", range), true);
    assert.equal(adminMetricsTimestampIsInRange("2026-10-08T00:00:00.000Z", range), false);
    assert.equal(adminMetricsTimestampIsInRange("not-a-date", range), false);
  });

  it("validates server ranges and rejects malformed dates and reversed endpoints", () => {
    for (const invalid of [
      { start_date: "2026-02-30", end_date: "2026-03-01" },
      { start_date: "2026-10-08", end_date: "2026-10-07" },
      { start_date: "10/01/2026", end_date: "2026-10-07" },
      null,
    ]) {
      assert.throws(() => parseAdminMetricsDateRange(invalid), (error: unknown) =>
        error instanceof AdminActionError && error.code === "METRICS_DATE_RANGE_INVALID" && error.status === 400,
      );
    }
    assert.equal(adminMetricsCalendarRangeIsValid("2026-10-01", "2026-10-07"), true);
    assert.equal(adminMetricsCalendarRangeIsValid("2026-02-30", "2026-03-01"), false);
    assert.equal(adminMetricsCalendarRangeIsValid("2026-10-08", "2026-10-07"), false);
  });

  it("creates inclusive 7-, 30-, and 90-calendar-day presets ending on the local current date", () => {
    const now = new Date(2026, 9, 14, 23, 48, 0, 0);
    for (const days of [7, 30, 90] as const) {
      const range = adminMetricsPresetRange(days, now);
      const expectedStart = new Date(now.getTime());
      expectedStart.setHours(12, 0, 0, 0);
      expectedStart.setDate(expectedStart.getDate() - (days - 1));
      const expectedDate = (date: Date) => `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      assert.equal(range.endDate, "2026-10-14");
      assert.equal(range.startDate, expectedDate(expectedStart));
      const inclusiveDayDifference = (Date.parse(`${range.endDate}T00:00:00.000Z`) - Date.parse(`${range.startDate}T00:00:00.000Z`)) / 86_400_000 + 1;
      assert.equal(inclusiveDayDifference, days);
    }
  });
});

describe("Parle administrator metric definitions", () => {
  it("counts new learner identities, submitted applications, completed practice, assistant messages, check-ins, and lesson requests by their saved date and status", async () => {
    const sources = sourceSet({
      ParleIdentity: [
        identity("identity-alice-first", "Alice@parle.test", "2026-10-01T00:00:00.000Z", { premium_comp_active: true }),
        identity("identity-alice-duplicate", "alice@parle.test", "2026-10-05T12:00:00.000Z", { premium_comp_active: true }),
        identity("identity-bob", "bob@parle.test", "2026-10-07T23:59:59.999Z"),
        identity("identity-older", "older@parle.test", "2026-09-30T23:59:59.999Z"),
        identity("identity-tutor", "tutor@parle.test", "2026-10-02T10:00:00.000Z", { role: "tutor" }),
      ],
      tutor_profile: [
        submittedProfile("app-approved", "2026-10-01T12:00:00.000Z"),
        submittedProfile("app-review", "2026-10-07T23:59:59.999Z"),
        submittedProfile("app-old", "2026-09-30T23:59:59.999Z"),
        { ...submittedProfile("app-draft", "2026-10-02T12:00:00.000Z"), application_intent: "draft" },
      ],
      tutor_application_review: [
        approvedReview("review-approved", "app-approved"),
        { id: "review-in-progress", profile_id: "app-review", status: "In review", reviewed_revision: 1, updated_at: "2026-10-08T00:00:00.000Z" },
      ],
      learner_task: [
        { id: "task-a1", user_id: "learner-alice", status: "done", completed_at_utc: "2026-10-02T08:00:00.000Z" },
        { id: "task-a2", user_id: "learner-alice", status: "done", completed_at_utc: "2026-10-07T23:59:59.999Z" },
        { id: "task-old", user_id: "learner-bob", status: "done", completed_at_utc: "2026-09-30T23:59:59.999Z" },
        { id: "task-planned", user_id: "learner-bob", status: "planned", completed_at_utc: "2026-10-03T12:00:00.000Z" },
      ],
      ai_message: [
        { id: "assistant-reply", sender: "tutor_ai", created_at: "2026-10-03T09:00:00.000Z" },
        { id: "learner-message", sender: "learner", created_at: "2026-10-03T09:01:00.000Z" },
        { id: "assistant-outside", sender: "tutor_ai", created_at: "2026-10-08T00:00:00.000Z" },
      ],
      checkin: [
        { id: "submitted-checkin", status: "submitted", created_at: "2026-10-05T08:00:00.000Z" },
        { id: "unsubmitted-checkin", status: "draft", created_at: "2026-10-05T08:00:00.000Z" },
        { id: "old-checkin", status: "submitted", created_at: "2026-09-30T23:59:59.999Z" },
      ],
      booking: [
        { id: "booking-requested", status: "requested", created_at: "2026-10-02T10:00:00.000Z" },
        { id: "booking-confirmed", status: "confirmed", created_at: "2026-10-04T10:00:00.000Z" },
        { id: "booking-declined", status: "declined", created_at: "2026-10-06T10:00:00.000Z" },
        { id: "booking-outside", status: "requested", created_at: "2026-10-08T00:00:00.000Z" },
      ],
    });

    const snapshot = await buildAdminMetricsSnapshot(sources, RANGE, { testStripeSecret: TEST_STRIPE_SECRET, now: NOW });
    assert.equal(snapshot.metrics.new_learner_accounts, 2, "duplicate identity rows count once using the earliest identity creation date");
    assert.equal(snapshot.metrics.new_tutor_applications, 2, "only submitted tutor profiles created in the selected range count");
    assert.equal(snapshot.metrics.currently_approved_new_tutor_applications, 1, "approval is the current effective status of the in-range submissions");
    assert.equal(snapshot.metrics.distinct_learners_with_completed_practice, 1, "one learner with two completed tasks counts once");
    assert.equal(snapshot.metrics.completed_practice_task_records, 2, "both done task records use completed_at_utc in the range");
    assert.equal(snapshot.metrics.ai_tutor_assistant_messages, 1, "only saved tutor_ai messages are counted");
    assert.equal(snapshot.metrics.completed_weekly_checkins, 1, "only submitted check-in records count");
    assert.equal(snapshot.metrics.lesson_requests, 3, "all booking records created in range count, regardless of current state");
    assert.equal(snapshot.metrics.complimentary_premium_learners, 1);
    assert.equal(snapshot.metrics.paid_premium_learners, 0);
    assert.equal(snapshot.metrics.total_premium_learners, 1);
    assert.deepEqual(Object.keys(snapshot).sort(), ["comparisons", "metrics", "range", "status", "unavailable_metrics"].sort(), "the result contains only aggregate metrics and group labels");
  });

  it("counts distinct practice learners by user ID, and marks the learner total unavailable when an in-range completion has no owner ID", async () => {
    const sources = sourceSet({
      learner_task: [
        { id: "same-learner-task-1", user_id: "learner-1", status: "done", completed_at_utc: "2026-10-01T00:00:00.000Z" },
        { id: "same-learner-task-2", user_id: "learner-1", status: "done", completed_at_utc: "2026-10-01T12:00:00.000Z" },
        { id: "missing-owner-task", user_id: "", status: "done", completed_at_utc: "2026-10-02T12:00:00.000Z" },
      ],
    });
    const snapshot = await buildAdminMetricsSnapshot(sources, RANGE);
    assert.equal(snapshot.metrics.distinct_learners_with_completed_practice, null);
    assert.equal(snapshot.metrics.completed_practice_task_records, 3, "record count is known even when distinct learner identity is not");
  });

  it("requires saved assistant-message timestamps and never derives assistant replies from usage counters", async () => {
    const withoutMessageTimestamp = sourceSet({
      ai_message: [{ id: "assistant-no-date", sender: "tutor_ai" }],
    });
    const snapshot = await buildAdminMetricsSnapshot(withoutMessageTimestamp, RANGE);
    assert.equal(snapshot.metrics.ai_tutor_assistant_messages, null);

    const withNoAssistantReplies = sourceSet({
      ai_message: [{ id: "learner-only", sender: "learner", created_at: "2026-10-02T10:00:00.000Z" }],
    });
    const emptyReplySnapshot = await buildAdminMetricsSnapshot(withNoAssistantReplies, RANGE);
    assert.equal(emptyReplySnapshot.metrics.ai_tutor_assistant_messages, 0);
  });

  it("uses submitted status and creation date for check-ins and booking records", async () => {
    const sources = sourceSet({
      checkin: [
        { id: "submitted", status: "submitted", created_at: "2026-10-01T00:00:00.000Z" },
        { id: "other-status", status: "other", created_at: "2026-10-01T00:00:00.000Z" },
      ],
      booking: [
        { id: "requested", status: "requested", created_at: "2026-10-01T00:00:00.000Z" },
        { id: "confirmed", status: "confirmed", created_at: "2026-10-01T00:00:00.000Z" },
        { id: "declined", status: "declined", created_at: "2026-10-01T00:00:00.000Z" },
      ],
    });
    const snapshot = await buildAdminMetricsSnapshot(sources, RANGE);
    assert.equal(snapshot.metrics.completed_weekly_checkins, 1);
    assert.equal(snapshot.metrics.lesson_requests, 3);
  });
});

describe("Parle current Premium metrics", () => {
  it("counts a verified current paid Premium cache and a complimentary learner once each, with complimentary status taking precedence", async () => {
    const compEmail = "complimentary@parle.test";
    const paidEmail = "paid@parle.test";
    const compIdentity = identity("comp-identity", compEmail, "2026-09-10T10:00:00.000Z", { premium_comp_active: true });
    const paidIdentity = identity("paid-identity", paidEmail, "2026-09-11T10:00:00.000Z");
    const compSubscriber = await signedSubscriber("comp-account-id", compEmail);
    const paidSubscriber = await signedSubscriber("paid-account-id", paidEmail, { plan: "premium_annual" });
    const split = await buildCurrentPremiumSplit({
      identities: [compIdentity, paidIdentity],
      subscribers: [compSubscriber, paidSubscriber],
      testStripeSecret: TEST_STRIPE_SECRET,
      now: NOW,
    });
    assert.deepEqual(split, { complimentary_learners: 1, paid_learners: 1, total_learners: 2 });
  });

  it("reports paid and total Premium as unavailable when a saved subscription cache cannot be verified", async () => {
    const email = "paid@parle.test";
    const stale = await signedSubscriber("paid-account-id", email, {
      lastConfirmedAt: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
    });
    const split = await buildCurrentPremiumSplit({
      identities: [identity("paid-identity", email, "2026-09-11T10:00:00.000Z")],
      subscribers: [stale],
      testStripeSecret: TEST_STRIPE_SECRET,
      now: NOW,
    });
    assert.deepEqual(split, { complimentary_learners: 0, paid_learners: null, total_learners: null });
  });

  it("keeps complimentary totals known when the subscriber source cannot be read", async () => {
    const snapshot = await buildAdminMetricsSnapshot(sourceSet({
      ParleIdentity: [identity("comp", "comp@parle.test", "2026-09-10T10:00:00.000Z", { premium_comp_active: true })],
      Subscriber: null,
    }), RANGE, { testStripeSecret: TEST_STRIPE_SECRET, now: NOW });
    assert.equal(snapshot.metrics.complimentary_premium_learners, 1);
    assert.equal(snapshot.metrics.paid_premium_learners, null);
    assert.equal(snapshot.metrics.total_premium_learners, null);
  });
});

describe("Parle learner demand and tutor supply comparisons", () => {
  function comparisonSources(): AdminMetricsSources {
    const learners = [
      ["learner-a@parle.test", "America/Toronto", "immigration", { monday: 60 }],
      ["learner-b@parle.test", "America/Toronto", "immigration", { monday: 90 }],
      ["learner-c@parle.test", "America/Vancouver", "citizenship", { tuesday: 120 }],
      ["learner-d@parle.test", "Europe/Paris", "general", { wednesday: 30 }],
    ] as const;
    const tutorOne = tutorProfile("tutor-toronto", "tutor-user-toronto", "tutor-toronto@parle.test", "America/Toronto", ["canada_immigration_tef_tcf", "canadian_citizenship"]);
    const tutorTwo = tutorProfile("tutor-vancouver", "tutor-user-vancouver", "tutor-vancouver@parle.test", "America/Vancouver", ["canada_immigration_tef_tcf"]);
    return sourceSet({
      ParleIdentity: learners.map(([email], index) => identity(`identity-${index}`, email, "2026-09-10T10:00:00.000Z")),
      ParleProfile: learners.map(([email, timeZone], index) => timeZoneProfile(`parle-profile-${index}`, email, timeZone)),
      learner_profile: learners.map(([email, , track, availability]) => learnerProfile(email, track, availability)),
      tutor_profile: [tutorOne, tutorTwo],
      tutor_application_review: [
        approvedReview("review-toronto", String(tutorOne.id)),
        approvedReview("review-vancouver", String(tutorTwo.id)),
      ],
      availability_rule: [
        { id: "rule-toronto", profile_id: tutorOne.id, user_id: tutorOne.user_id, day_of_week: 1, start_local: "09:00", end_local: "11:00", time_zone: "America/Toronto" },
        { id: "rule-vancouver", profile_id: tutorTwo.id, user_id: tutorTwo.user_id, day_of_week: 7, start_local: "17:00", end_local: "17:30", time_zone: "America/Vancouver" },
      ],
    });
  }

  it("aggregates active learner demand and approved tutor availability by saved time zone and established track-specialty matches", async () => {
    const snapshot = await buildAdminMetricsSnapshot(comparisonSources(), RANGE, { now: NOW });
    const byZone = new Map(snapshot.comparisons.time_zones.rows.map((row) => [row.label, row]));
    assert.equal(byZone.get("America/Toronto")?.active_learners, 2);
    assert.equal(byZone.get("America/Toronto")?.learner_weekly_study_hours, 2.5);
    assert.equal(byZone.get("America/Toronto")?.approved_tutors, 1);
    assert.equal(byZone.get("America/Toronto")?.tutor_recurring_weekly_hours, 2);
    assert.equal(byZone.get("America/Vancouver")?.active_learners, 1);
    assert.equal(byZone.get("America/Vancouver")?.learner_weekly_study_hours, 2);
    assert.equal(byZone.get("America/Vancouver")?.tutor_recurring_weekly_hours, 0.5);
    assert.equal(byZone.get("Europe/Paris")?.approved_tutors, 0);
    assert.equal(byZone.get("Europe/Paris")?.tutor_recurring_weekly_hours, 0);
    assert.equal(byZone.get("Europe/Paris")?.short_of_tutors, true);

    const byTrack = new Map(snapshot.comparisons.tracks.rows.map((row) => [row.track, row]));
    assert.equal(byTrack.get("immigration")?.active_learners, 2);
    assert.equal(byTrack.get("immigration")?.learner_weekly_study_hours, 2.5);
    assert.equal(byTrack.get("immigration")?.approved_tutors, 2);
    assert.equal(byTrack.get("immigration")?.tutor_recurring_weekly_hours, 2.5);
    assert.equal(byTrack.get("citizenship")?.active_learners, 1);
    assert.equal(byTrack.get("citizenship")?.approved_tutors, 1, "a tutor with both saved specialties appears in each compatible row");
    assert.equal(byTrack.get("citizenship")?.tutor_recurring_weekly_hours, 2);
    assert.equal(byTrack.has("general"), false, "no mapping is invented for general tracks");
  });

  it("marks tutor shortage only when learner demand exists and known weekly supply is exactly zero", async () => {
    const base = sourceSet({
      ParleIdentity: [identity("learner", "learner@parle.test", "2026-09-10T10:00:00.000Z")],
      ParleProfile: [timeZoneProfile("learner-profile", "learner@parle.test", "America/Toronto")],
      learner_profile: [learnerProfile("learner@parle.test", "immigration", { monday: 60 })],
      tutor_profile: [],
      tutor_application_review: [],
      availability_rule: [],
    });
    const knownZero = await buildAdminMetricsSnapshot(base, RANGE);
    assert.equal(knownZero.comparisons.time_zones.rows[0]?.short_of_tutors, true);
    assert.equal(knownZero.comparisons.time_zones.rows[0]?.tutor_recurring_weekly_hours, 0);
    assert.equal(knownZero.comparisons.tracks.rows[0]?.short_of_tutors, true);

    const unavailableHours = await buildAdminMetricsSnapshot({ ...base, availability_rule: null }, RANGE);
    assert.equal(unavailableHours.comparisons.time_zones.rows[0]?.tutor_recurring_weekly_hours, null);
    assert.equal(unavailableHours.comparisons.time_zones.rows[0]?.short_of_tutors, false);
    assert.equal(unavailableHours.comparisons.tracks.rows[0]?.tutor_recurring_weekly_hours, null);
    assert.equal(unavailableHours.comparisons.tracks.rows[0]?.short_of_tutors, false);

    const noLearners = await buildAdminMetricsSnapshot(sourceSet({
      ParleIdentity: [],
      ParleProfile: [],
      learner_profile: [],
      tutor_profile: [],
      tutor_application_review: [],
      availability_rule: [],
    }), RANGE);
    assert.equal(noLearners.comparisons.time_zones.rows.length, 0);
    assert.equal(noLearners.comparisons.tracks.rows.length, 0);
  });
});

describe("Parle metrics authorization and unavailable sources", () => {
  it("denies a non-administrator before reading any business records", async () => {
    const { client, reads } = metricsReaderClient();
    await assert.rejects(
      () => adminMetricsAction(client, LEARNER_CALLER, { start_date: RANGE.start_date, end_date: RANGE.end_date }),
      (error: unknown) => error instanceof AdminActionError && error.code === "ADMIN_REQUIRED" && error.status === 403,
    );
    assert.deepEqual(reads, []);
  });

  it("keeps readable sources available while marking each denied administrator-readable source unavailable", async () => {
    const expectations: Array<{ source: ReadableSource; check: (snapshot: Awaited<ReturnType<typeof buildAdminMetricsSnapshot>>) => void }> = [
      { source: "ParleIdentity", check: (snapshot) => {
        assert.equal(snapshot.metrics.new_learner_accounts, null);
        assert.equal(snapshot.metrics.complimentary_premium_learners, null);
        assert.equal(snapshot.comparisons.time_zones.available, false);
      } },
      { source: "ParleProfile", check: (snapshot) => assert.equal(snapshot.comparisons.time_zones.available, false) },
      { source: "tutor_profile", check: (snapshot) => {
        assert.equal(snapshot.metrics.new_tutor_applications, null);
        assert.equal(snapshot.metrics.currently_approved_new_tutor_applications, null);
        assert.equal(snapshot.comparisons.time_zones.rows[0]?.approved_tutors, null);
      } },
      { source: "tutor_application_review", check: (snapshot) => {
        assert.equal(snapshot.metrics.new_tutor_applications, 0);
        assert.equal(snapshot.metrics.currently_approved_new_tutor_applications, null);
        assert.equal(snapshot.comparisons.time_zones.rows[0]?.approved_tutors, null);
      } },
      { source: "availability_rule", check: (snapshot) => {
        assert.equal(snapshot.comparisons.time_zones.rows[0]?.approved_tutors, 1);
        assert.equal(snapshot.comparisons.time_zones.rows[0]?.tutor_recurring_weekly_hours, null);
        assert.equal(snapshot.comparisons.time_zones.rows[0]?.short_of_tutors, false);
      } },
      { source: "booking", check: (snapshot) => assert.equal(snapshot.metrics.lesson_requests, null) },
    ];

    for (const { source, check } of expectations) {
      const { client } = metricsReaderClient({ rows: minimalReadableRows(), fail: [source] });
      const sources = await readAdminMetricsSources(client);
      assert.equal(sources[source], null, `${source} read failure is isolated`);
      for (const readable of READABLE_SOURCES) {
        if (readable !== source) assert.ok(Array.isArray(sources[readable]), `${readable} remains available when ${source} fails`);
      }
      const snapshot = await buildAdminMetricsSnapshot(sources, RANGE, { now: NOW });
      assert.equal(snapshot.status, "partial");
      check(snapshot);
    }
  });

  it("does not attempt owner-only learner, message, check-in, or subscription reads and returns Not available data instead of zero", async () => {
    const { client, reads } = metricsReaderClient({ rows: minimalReadableRows() });
    const sources = await readAdminMetricsSources(client);
    assert.deepEqual([...new Set(reads)].sort(), [...READABLE_SOURCES].sort());
    for (const ownerOnly of ["learner_profile", "learner_task", "ai_message", "checkin", "Subscriber"] as const) {
      assert.equal(sources[ownerOnly], null);
    }

    const snapshot = await buildAdminMetricsSnapshot(sources, RANGE, { now: NOW });
    assert.equal(snapshot.metrics.distinct_learners_with_completed_practice, null);
    assert.equal(snapshot.metrics.completed_practice_task_records, null);
    assert.equal(snapshot.metrics.ai_tutor_assistant_messages, null);
    assert.equal(snapshot.metrics.completed_weekly_checkins, null);
    assert.equal(snapshot.metrics.complimentary_premium_learners, 0);
    assert.equal(snapshot.metrics.paid_premium_learners, null);
    assert.equal(snapshot.metrics.total_premium_learners, null);
    assert.equal(snapshot.comparisons.time_zones.rows[0]?.learner_weekly_study_hours, null);
    assert.equal(snapshot.comparisons.time_zones.rows[0]?.approved_tutors, 1);
    assert.equal(snapshot.comparisons.time_zones.rows[0]?.tutor_recurring_weekly_hours, 1);
    assert.equal(snapshot.comparisons.tracks.available, false);
    assert.ok(snapshot.unavailable_metrics.includes("distinct_learners_with_completed_practice"));
    assert.ok(snapshot.unavailable_metrics.includes("track_comparisons"));
  });

  it("distinguishes an accessible empty source from an unreadable source", async () => {
    const emptySources = await readAdminMetricsSources(metricsReaderClient().client);
    const emptySnapshot = await buildAdminMetricsSnapshot(emptySources, RANGE, { now: NOW });
    assert.equal(emptySnapshot.metrics.new_learner_accounts, 0);
    assert.equal(emptySnapshot.metrics.new_tutor_applications, 0);
    assert.equal(emptySnapshot.metrics.currently_approved_new_tutor_applications, 0);
    assert.equal(emptySnapshot.metrics.lesson_requests, 0);

    const deniedSources = await readAdminMetricsSources(metricsReaderClient({ fail: ["booking"] }).client);
    const deniedSnapshot = await buildAdminMetricsSnapshot(deniedSources, RANGE, { now: NOW });
    assert.equal(deniedSnapshot.metrics.lesson_requests, null);
  });
});
