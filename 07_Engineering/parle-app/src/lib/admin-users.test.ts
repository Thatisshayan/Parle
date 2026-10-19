import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listAdminParleUsers,
  setLearnerPremiumComp,
  type AdminParleAccount,
} from "../../functions/parle-admin-users.helper.ts";
import { AdminActionError } from "../../functions/parle-admin-settings.helper.ts";
import type { AdminActor } from "../../functions/parle-admin-settings.helper.ts";

const ADMIN: AdminActor = { id: "admin-1", email: "admin@parle.test", full_name: "Parle Admin", role: "administrator" };
const LEARNER_CALLER: AdminActor = { id: "learner-1", email: "learner@parle.test", role: "user" };
const TUTOR_CALLER: AdminActor = { id: "tutor-1", email: "tutor@parle.test", role: "user" };
const UNAUTHENTICATED = null as unknown as AdminActor;

type TestRow = Record<string, unknown> & { id?: string; created_at?: string; occurred_at_utc?: string };

function createFixture(options: { authListAvailable?: boolean; unreadableSources?: string[] } = {}) {
  const store: Record<string, TestRow[]> = {
    ParleIdentity: [],
    ParleProfile: [],
    admin_audit_log: [],
    ParleCompStatus: [],
    tutor_profile: [],
    tutor_application_review: [],
    availability_rule: [],
    tutor_profile_public_edits: [],
    booking: [],
  };
  const userRows: TestRow[] = [];
  const operations: string[] = [];
  const filterArgumentCounts: number[] = [];
  const authListArgumentCounts: number[] = [];
  const entityLookupNames: string[] = [];
  const entities: Record<string, unknown> = {};

  for (const name of Object.keys(store)) {
    entities[name] = {
      filter: async (...args: unknown[]) => {
        operations.push(`${name}.filter`);
        filterArgumentCounts.push(args.length);
        if (options.unreadableSources?.includes(name)) throw new Error(`${name} read unavailable`);
        const filters = (args[0] ?? {}) as Record<string, unknown>;
        const sort = typeof args[1] === "string" ? args[1] : "";
        const limit = typeof args[2] === "number" ? args[2] : 500;
        const matching = store[name].filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
        const field = sort.startsWith("-") ? sort.slice(1) : sort;
        const direction = sort.startsWith("-") ? -1 : 1;
        const sorted = [...matching].sort((left, right) => direction * String(left[field] ?? "").localeCompare(String(right[field] ?? "")));
        const data = sorted.slice(0, limit).map((row) => structuredClone(row));
        return { data: structuredClone(data), total: matching.length, limit };
      },
      create: async (values: TestRow) => {
        operations.push(`${name}.create`);
        const row = { ...structuredClone(values), id: `${name}-${store[name].length + 1}`, created_at: new Date().toISOString() };
        store[name].push(row);
        return structuredClone(row);
      },
      update: async (id: string, values: TestRow) => {
        operations.push(`${name}.update`);
        const row = store[name].find((entry) => entry.id === id);
        if (!row) throw new Error(`Missing ${name} row`);
        Object.assign(row, structuredClone(values));
        return structuredClone(row);
      },
      delete: async (id: string) => {
        operations.push(`${name}.delete`);
        const index = store[name].findIndex((entry) => entry.id === id);
        if (index >= 0) store[name].splice(index, 1);
      },
    };
  }

  const userEntity = {
    get: async (id: string) => {
      operations.push("User.get");
      const row = userRows.find((user) => user.id === id);
      if (!row) throw Object.assign(new Error("Account not found"), { status: 404 });
      return structuredClone(row);
    },
  };
  const auth: Record<string, unknown> = {};
  if (options.authListAvailable !== false) {
    auth.list = async (...args: unknown[]) => {
      operations.push("auth.list");
      authListArgumentCounts.push(args.length);
      return structuredClone(userRows);
    };
  }

  const client = {
    auth,
    entities,
    entity(name: string) {
      entityLookupNames.push(name);
      return name === "User" ? userEntity : entities[name];
    },
  };
  return { client, store, userRows, operations, filterArgumentCounts, authListArgumentCounts, entityLookupNames };
}

function addLearner(fixture: ReturnType<typeof createFixture>, overrides: TestRow = {}) {
  const account: TestRow = {
    id: "learner-user-1",
    email: "learner@example.test",
    full_name: "Mina Learner",
    role: "user",
    created_at: "2026-01-10T10:00:00.000Z",
    plan_tier: "Free",
    password_hash: "never-return-this",
    ...overrides,
  };
  fixture.userRows.push(account);
  fixture.store.ParleIdentity.push({
    id: "identity-1",
    created_by: account.email,
    role: "learner",
    created_at: "2026-01-11T10:00:00.000Z",
    age_confirmed: true,
    age_confirmed_at: "private-age-confirmation",
    premium_comp_active: false,
  });
  fixture.store.ParleProfile.push({
    id: "profile-1",
    created_by: account.email,
    native_language: "French",
    time_zone: "America/Toronto",
    explain_in_native: true,
    email_product_updates: true,
    photo_url: "private-photo-url",
    created_at: "2026-01-12T10:00:00.000Z",
  });
  return account;
}

function addTutor(fixture: ReturnType<typeof createFixture>, overrides: TestRow = {}) {
  const account: TestRow = {
    id: "tutor-user-1",
    email: "tutor@example.test",
    full_name: "Mina Tutor",
    role: "user",
    created_at: "2026-01-10T10:00:00.000Z",
    ...overrides,
  };
  const profileId = "tutor-profile-1";
  fixture.userRows.push(account);
  fixture.store.ParleIdentity.push({
    id: "identity-tutor-1",
    created_by: account.email,
    role: "tutor",
    premium_comp_active: false,
    created_at: "2026-01-11T10:00:00.000Z",
  });
  fixture.store.ParleProfile.push({
    id: "profile-tutor-1",
    created_by: account.email,
    native_language: "English",
    time_zone: "America/Toronto",
    created_at: "2026-01-12T10:00:00.000Z",
  });
  fixture.store.tutor_profile.push({
    id: profileId,
    user_id: account.id,
    created_by: account.email,
    application_intent: "submitted",
    submission_revision: 3,
    hourly_rate_cents: 4550,
    specialties: ["conversation", "grammar"],
    bio: "Private application text",
    meeting_link: "private-tutor-meeting-link",
    created_at: "2026-02-01T10:00:00.000Z",
    updated_at: "2026-02-02T10:00:00.000Z",
  });
  fixture.store.tutor_application_review.push({
    id: "review-tutor-1",
    profile_id: profileId,
    tutor_email: account.email,
    status: "In review",
    reviewed_revision: 3,
    latest_comment: "Private administrator note",
    created_at: "2026-02-03T10:00:00.000Z",
    updated_at: "2026-02-04T10:00:00.000Z",
  });
  fixture.store.availability_rule.push(
    {
      id: "availability-tutor-1",
      profile_id: profileId,
      user_id: account.id,
      created_by: account.email,
      day_of_week: 1,
      start_local: "09:00",
      end_local: "12:00",
      time_zone: "America/Toronto",
      created_at: "2026-02-05T10:00:00.000Z",
      updated_at: "2026-02-06T10:00:00.000Z",
    },
    {
      id: "availability-tutor-2",
      profile_id: profileId,
      user_id: account.id,
      created_by: account.email,
      day_of_week: 4,
      start_local: "14:30",
      end_local: "16:00",
      time_zone: "America/Toronto",
      created_at: "2026-02-05T10:00:00.000Z",
      updated_at: "2026-02-06T10:00:00.000Z",
    },
  );
  fixture.store.tutor_profile_public_edits.push({
    id: "public-edit-tutor-1",
    profile_id: profileId,
    user_id: account.id,
    created_by: account.email,
    created_at: "2026-02-07T10:00:00.000Z",
    updated_at: "2026-02-08T10:00:00.000Z",
  });
  fixture.store.booking.push({
    id: "booking-tutor-1",
    tutor_profile_id: profileId,
    tutor_id: account.id,
    learner_id: "learner-user-other",
    created_at: "2026-02-09T10:00:00.000Z",
    updated_at: "2026-02-10T10:00:00.000Z",
  });
  return account;
}

function auditRow(overrides: TestRow = {}): TestRow {
  return {
    id: "audit-1",
    action: "user.premium_comp_granted",
    target_type: "user",
    target_id: "learner-user-1",
    actor_user_id: "admin-1",
    actor_label: "Parle Admin",
    old_value: JSON.stringify({ active: false }),
    new_value: JSON.stringify({ active: true, reason: "Access award" }),
    occurred_at_utc: "2026-05-10T11:00:00.000Z",
    ...overrides,
  };
}

function rejectsWith(code: string) {
  return (error: unknown) => error instanceof AdminActionError && error.code === code;
}

function assertCompTargetResolvedFromAuthList(fixture: ReturnType<typeof createFixture>) {
  assert.ok(fixture.operations.includes("auth.list"));
  assert.deepEqual(fixture.authListArgumentCounts, [0]);
  assert.equal(fixture.operations.includes("User.get"), false);
  assert.equal(fixture.entityLookupNames.includes("User"), false);
}

describe("Parle administrator user directory and Premium-comp records", () => {
  it("denies unsigned, learner, and tutor callers before auth.list or protected account reads", async () => {
    const fixture = createFixture();
    for (const actor of [UNAUTHENTICATED, LEARNER_CALLER, TUTOR_CALLER]) {
      await assert.rejects(() => listAdminParleUsers(fixture.client, actor), rejectsWith("ADMIN_REQUIRED"));
    }
    assert.deepEqual(fixture.operations, []);
    assert.deepEqual(fixture.authListArgumentCounts, []);
    assert.deepEqual(fixture.filterArgumentCounts, []);
    assert.deepEqual(fixture.entityLookupNames, []);
    assert.equal(fixture.operations.some((operation) => /ParleIdentity|ParleProfile|admin_audit_log/.test(operation)), false);
  });

  it("reports an unavailable account directory without falling back to generic User listing", async () => {
    const fixture = createFixture({ authListAvailable: false });
    await assert.rejects(() => listAdminParleUsers(fixture.client, ADMIN), rejectsWith("USER_DIRECTORY_UNAVAILABLE"));
    assert.deepEqual(fixture.operations, []);
    assert.deepEqual(fixture.entityLookupNames, []);
    assert.deepEqual(fixture.authListArgumentCounts, []);
  });

  it("denies unsigned and learner callers before account lookup or audit reads and writes", async () => {
    const fixture = createFixture();
    addLearner(fixture);
    for (const actor of [UNAUTHENTICATED, LEARNER_CALLER]) {
      for (const comp_action of ["grant", "remove"] as const) {
        await assert.rejects(
          () => setLearnerPremiumComp(fixture.client, actor, {
            target_user_id: "learner-user-1",
            comp_action,
            reason: "Approved hardship support",
          }),
          rejectsWith("ADMIN_REQUIRED"),
        );
      }
    }
    assert.deepEqual(fixture.operations, []);
    assert.deepEqual(fixture.authListArgumentCounts, []);
    assert.deepEqual(fixture.filterArgumentCounts, []);
    assert.equal(fixture.operations.some((operation) => /ParleIdentity|ParleProfile|admin_audit_log/.test(operation)), false);
    assert.equal(fixture.store.admin_audit_log.length, 0);
  });

  it("returns only the allowlisted Parle account projection and honors canonical identity/profile records", async () => {
    const fixture = createFixture();
    const learner = addLearner(fixture);
    fixture.userRows.push({ id: "administrator-1", email: "admin@parle.test", full_name: "Admin", role: "administrator", created_at: "2026-01-01T00:00:00.000Z", private_field: "hidden" });
    fixture.store.ParleIdentity.push(
      { id: "identity-older", created_by: learner.email, role: "learner", created_at: "2025-01-01T00:00:00.000Z", age_confirmed_at: "private" },
      { id: "identity-newer", created_by: learner.email, role: "tutor", created_at: "2026-02-01T00:00:00.000Z" },
    );
    fixture.store.ParleProfile.push(
      { id: "profile-older", created_by: learner.email, native_language: "English", time_zone: "UTC", created_at: "2025-01-01T00:00:00.000Z" },
      { id: "profile-newer", created_by: learner.email, native_language: "Spanish", time_zone: "Europe/Paris", created_at: "2026-02-01T00:00:00.000Z", email_product_updates: true },
    );
    fixture.store.admin_audit_log.push(
      auditRow({ id: "comp-old", occurred_at_utc: "2026-04-01T10:00:00.000Z", new_value: JSON.stringify({ active: true, reason: "Earlier comp" }) }),
      auditRow({ id: "comp-latest", action: "user.premium_comp_removed", occurred_at_utc: "2026-05-10T11:00:00.000Z", old_value: JSON.stringify({ active: true }), new_value: JSON.stringify({ active: false, reason: "Latest decision" }) }),
      auditRow({ id: "other-account", target_id: "somebody-else", new_value: JSON.stringify({ active: true, reason: "Private" }) }),
    );

    const result = await listAdminParleUsers(fixture.client, ADMIN);
    assert.equal(result.count, 1);
    const user = result.users[0];
    const allowedKeys = [
      "id", "full_name", "email", "account_role", "created_at", "parle_role", "native_language", "time_zone",
      "comp_active", "comp_reason", "comp_updated_at", "plan_status", "latest_parle_record_at", "learner_details", "tutor_details",
    ];
    assert.deepEqual(Object.keys(user).sort(), [...allowedKeys].sort());
    assert.deepEqual(user, {
      id: "learner-user-1",
      full_name: "Mina Learner",
      email: "learner@example.test",
      account_role: "user",
      created_at: "2026-01-10T10:00:00.000Z",
      parle_role: "learner",
      native_language: "Spanish",
      time_zone: "Europe/Paris",
      comp_active: false,
      comp_reason: "Latest decision",
      comp_updated_at: "2026-05-10T11:00:00.000Z",
      plan_status: "unavailable",
      latest_parle_record_at: "2026-05-10T11:00:00.000Z",
      learner_details: {
        goal: "unavailable",
        track: "unavailable",
        target_level: "unavailable",
        target_date: "unavailable",
        starting_level: "unavailable",
        current_estimates: { listening: "unavailable", reading: "unavailable", writing: "unavailable", speaking: "unavailable" },
        weekly_study_time: "unavailable",
        today_ai_messages_used: "unavailable",
        today_ai_messages_limit: "unavailable",
      },
      tutor_details: {
        application_status: "unavailable",
        hourly_rate_usd: "unavailable",
        specialties: "unavailable",
        weekly_availability_hours: "unavailable",
      },
    } satisfies AdminParleAccount);
    const serialized = JSON.stringify(result);
    for (const privateValue of ["never-return-this", "private-age-confirmation", "private-photo-url", "email_product_updates", "password_hash", "plan_tier", "private_field", "hidden", "somebody-else"]) {
      assert.equal(serialized.includes(privateValue), false, `projection included ${privateValue}`);
    }
    for (const unapprovedField of ["password_hash", "plan_tier", "private_field"]) {
      assert.equal(Object.prototype.hasOwnProperty.call(user, unapprovedField), false, `response included ${unapprovedField}`);
    }
    assert.ok(fixture.operations.includes("auth.list"));
    assert.deepEqual(fixture.authListArgumentCounts, [0]);
    assert.equal(fixture.entityLookupNames.includes("User"), false);
    assert.equal(fixture.filterArgumentCounts.length, 10);
    assert.ok(fixture.filterArgumentCounts.every((argumentCount) => argumentCount === 3));
  });

  it("labels complimentary Premium only when the canonical identity flag is true and never guesses Free or paid", async () => {
    const fixture = createFixture();
    const freeLookingAccount = addLearner(fixture, { id: "learner-free-looking", email: "free@example.test", plan_tier: "Free" });
    const premiumLookingAccount = addLearner(fixture, { id: "learner-premium-looking", email: "premium@example.test", plan_tier: "Premium" });
    const premiumIdentity = fixture.store.ParleIdentity.find((row) => row.created_by === premiumLookingAccount.email);
    assert.ok(premiumIdentity);
    premiumIdentity.premium_comp_active = true;
    fixture.store.admin_audit_log.push(auditRow({
      id: "premium-comp-grant",
      target_id: premiumLookingAccount.id,
      occurred_at_utc: "2026-06-01T10:00:00.000Z",
    }));

    const result = await listAdminParleUsers(fixture.client, ADMIN);
    assert.equal(result.users.find((user) => user.id === freeLookingAccount.id)?.plan_status, "unavailable");
    assert.equal(result.users.find((user) => user.id === premiumLookingAccount.id)?.plan_status, "premium_complimentary");
    assert.equal(JSON.stringify(result).includes("plan_tier"), false);
  });

  it("keeps owner-only learner details unavailable, never queries their sources, and adds no reads that write", async () => {
    const fixture = createFixture();
    const learner = addLearner(fixture);
    const result = await listAdminParleUsers(fixture.client, ADMIN);
    const user = result.users.find((entry) => entry.id === learner.id);
    assert.ok(user);
    assert.deepEqual(user.learner_details, {
      goal: "unavailable",
      track: "unavailable",
      target_level: "unavailable",
      target_date: "unavailable",
      starting_level: "unavailable",
      current_estimates: { listening: "unavailable", reading: "unavailable", writing: "unavailable", speaking: "unavailable" },
      weekly_study_time: "unavailable",
      today_ai_messages_used: "unavailable",
      today_ai_messages_limit: "unavailable",
    });
    const ownerOnlyEntities = ["learner_profile", "skill_estimate", "placement_result", "learner_task", "checkin", "ai_message", "usage_counter", "Subscriber"];
    for (const entity of ownerOnlyEntities) {
      assert.equal(fixture.entityLookupNames.includes(entity), false, `administrator query reached ${entity}`);
      assert.equal(fixture.operations.some((operation) => operation.startsWith(`${entity}.`)), false, `administrator query read ${entity}`);
    }
    assert.equal(fixture.operations.some((operation) => /\.(create|update|delete)$/.test(operation)), false, "supplemental reads do not write records");
  });

  it("derives tutor application status, rate, specialties, and recurring hours from administrator-readable records", async () => {
    const fixture = createFixture();
    addTutor(fixture);
    const result = await listAdminParleUsers(fixture.client, ADMIN);
    assert.equal(result.count, 1);
    assert.deepEqual(result.users[0].tutor_details, {
      application_status: "In review",
      hourly_rate_usd: 45.5,
      specialties: ["conversation", "grammar"],
      weekly_availability_hours: 4.5,
    });
    assert.equal(result.users[0].plan_status, "unavailable");
    const serialized = JSON.stringify(result);
    for (const privateValue of ["Private application text", "private-tutor-meeting-link", "Private administrator note"]) {
      assert.equal(serialized.includes(privateValue), false, `response included ${privateValue}`);
    }
  });

  it("selects the newest valid timestamp from only linked, administrator-readable Parle records", async () => {
    const fixture = createFixture();
    const tutor = addTutor(fixture);
    fixture.store.ParleIdentity[0].updated_at = "2026-06-01T10:00:00.000Z";
    fixture.store.ParleProfile[0].updated_at = "2026-06-02T10:00:00.000Z";
    fixture.store.tutor_profile[0].updated_at = "2026-06-03T10:00:00.000Z";
    fixture.store.tutor_application_review[0].updated_at = "9999-99-99T00:00:00.000Z";
    fixture.store.availability_rule[0].updated_at = "2026-08-10T10:00:00.000Z";
    fixture.store.tutor_profile_public_edits[0].updated_at = "2026-08-11T10:00:00.000Z";
    fixture.store.booking[0].updated_at = "2026-08-12T12:00:00.000Z";
    fixture.store.booking.push({
      id: "unrelated-newer-booking",
      tutor_id: "another-account",
      learner_id: "another-learner",
      created_at: "2099-01-01T00:00:00.000Z",
      updated_at: "2099-01-02T00:00:00.000Z",
    });

    const result = await listAdminParleUsers(fixture.client, ADMIN);
    assert.equal(result.users.find((user) => user.id === tutor.id)?.latest_parle_record_at, "2026-08-12T12:00:00.000Z");
  });

  it("keeps the directory available when a supplemental source fails and marks only its dependent detail unavailable", async () => {
    const fixture = createFixture({ unreadableSources: ["tutor_application_review"] });
    addTutor(fixture);
    const result = await listAdminParleUsers(fixture.client, ADMIN);
    assert.equal(result.count, 1);
    assert.equal(result.users[0].tutor_details.application_status, "unavailable");
    assert.equal(result.users[0].tutor_details.hourly_rate_usd, 45.5);
    assert.deepEqual(result.users[0].tutor_details.specialties, ["conversation", "grammar"]);
    assert.equal(result.users[0].tutor_details.weekly_availability_hours, 4.5);
    assert.equal(result.users[0].latest_parle_record_at, "unavailable");
  });

  it("reconciles a legacy grant once when an administrator reloads the user directory", async () => {
    const fixture = createFixture();
    addLearner(fixture);
    delete fixture.store.ParleIdentity[0].premium_comp_active;
    fixture.store.admin_audit_log.push(auditRow({ id: "legacy-grant" }));

    const first = await listAdminParleUsers(fixture.client, ADMIN);
    assert.equal(first.users[0].comp_active, true);
    assert.equal(first.users[0].plan_status, "premium_complimentary", "a successfully backfilled identity now matches the learner plan check");
    assert.equal(fixture.store.ParleIdentity[0].premium_comp_active, true, "the existing grant is backfilled to the owner-readable identity");
    assert.equal(fixture.store.ParleCompStatus.length, 1);
    assert.deepEqual(
      (({ user_id, plan, status }: TestRow) => ({ user_id, plan, status }))(fixture.store.ParleCompStatus[0]),
      { user_id: "learner-user-1", plan: "premium_comp", status: "active" },
    );

    const second = await listAdminParleUsers(fixture.client, ADMIN);
    assert.equal(second.users[0].comp_active, true);
    assert.equal(fixture.store.ParleCompStatus.length, 1, "repeated loads must not duplicate the current record");
    assert.equal(fixture.store.admin_audit_log.length, 1, "reconciliation must not append an audit event");
    assert.equal(fixture.operations.filter((operation) => operation === "ParleCompStatus.create").length, 1);
  });

  it("does not report a successful grant when the current status record cannot be maintained", async () => {
    const fixture = createFixture();
    addLearner(fixture);
    fixture.client.entities.ParleCompStatus.create = async () => { throw new Error("status write unavailable"); };

    await assert.rejects(
      () => setLearnerPremiumComp(fixture.client, ADMIN, {
        target_user_id: "learner-user-1",
        comp_action: "grant",
        reason: "Approved community comp",
      }),
      rejectsWith("COMP_STATUS_MAINTENANCE_FAILED"),
    );
    assert.equal(fixture.store.admin_audit_log.length, 1, "the existing history remains append-only if the separate status write fails");
    assert.equal(fixture.store.ParleCompStatus.length, 0);
  });

  it("caps the account source at 500 and explicitly marks a truncated directory", async () => {
    const fixture = createFixture();
    for (let index = 0; index < 501; index += 1) {
      const email = `learner-${index}@example.test`;
      const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
      fixture.userRows.push({
        id: `learner-user-${index}`,
        email,
        full_name: `Learner ${index}`,
        role: "user",
        created_at: createdAt,
        plan_tier: "Free",
        password_hash: "private-account-value",
      });
      if (index < 500) {
        fixture.store.ParleIdentity.push({ id: `identity-${index}`, created_by: email, role: "learner", created_at: createdAt });
        fixture.store.ParleProfile.push({ id: `profile-${index}`, created_by: email, native_language: "French", time_zone: "UTC", created_at: createdAt });
      }
    }

    const result = await listAdminParleUsers(fixture.client, ADMIN);
    assert.equal(result.count, 500);
    assert.equal(result.limit, 500);
    assert.equal(result.source_limit, 500);
    assert.equal(result.limit_reached, true);
    assert.equal(result.users.some((user) => user.id === "learner-user-500"), false);
    assert.equal(JSON.stringify(result).includes("private-account-value"), false);
    assert.equal(fixture.authListArgumentCounts[0], 0);
    assert.ok(fixture.filterArgumentCounts.every((argumentCount) => argumentCount === 3));
  });

  it("derives comp status from the newest UTC event and resolves equal timestamps by stable id", async () => {
    const fixture = createFixture();
    addLearner(fixture);
    fixture.store.admin_audit_log.push(
      auditRow({ id: "zzzz-old", action: "user.premium_comp_granted", occurred_at_utc: "2026-05-01T11:00:00.000Z", new_value: JSON.stringify({ active: true, reason: "Older date" }) }),
      auditRow({ id: "same-time-a", action: "user.premium_comp_granted", occurred_at_utc: "2026-06-01T11:00:00.000Z", new_value: JSON.stringify({ active: true, reason: "Lower tie id" }) }),
      auditRow({ id: "same-time-z", action: "user.premium_comp_removed", occurred_at_utc: "2026-06-01T11:00:00.000Z", new_value: JSON.stringify({ active: false, reason: "Stable tie winner" }) }),
    );
    fixture.store.ParleCompStatus.push({ id: "stale-active-status", user_id: "learner-user-1", plan: "premium_comp", status: "active" });

    const result = await listAdminParleUsers(fixture.client, ADMIN);
    assert.equal(result.users[0].comp_active, false);
    assert.equal(result.users[0].comp_reason, "Stable tie winner");
    assert.equal(fixture.store.ParleCompStatus.length, 0, "the latest removal must clear the current status record");
  });

  it("requires a trimmed, non-empty reason and rejects reasons beyond the server limit before reading accounts", async () => {
    const fixture = createFixture();
    addLearner(fixture);
    for (const [comp_action, reason, code] of [
      ["grant", "   \n  ", "COMP_REASON_REQUIRED"],
      ["remove", "x".repeat(501), "COMP_REASON_TOO_LONG"],
    ] as const) {
      await assert.rejects(
        () => setLearnerPremiumComp(fixture.client, ADMIN, { target_user_id: "learner-user-1", comp_action, reason }),
        rejectsWith(code),
      );
    }
    assert.deepEqual(fixture.operations, []);
    assert.equal(fixture.store.admin_audit_log.length, 0);
  });

  it("reports an unavailable auth directory for comp actions without a generic User lookup", async () => {
    const fixture = createFixture({ authListAvailable: false });
    await assert.rejects(
      () => setLearnerPremiumComp(fixture.client, ADMIN, {
        target_user_id: "learner-user-1",
        comp_action: "grant",
        reason: "Approved scholarship",
      }),
      rejectsWith("USER_DIRECTORY_UNAVAILABLE"),
    );
    assert.deepEqual(fixture.operations, []);
    assert.deepEqual(fixture.entityLookupNames, []);
    assert.equal(fixture.store.admin_audit_log.length, 0);
  });

  it("rejects IDs outside the first 500 auth-listed accounts before reading Parle records", async () => {
    const fixture = createFixture();
    for (let index = 0; index < 501; index += 1) {
      fixture.userRows.push({
        id: `learner-user-${index}`,
        email: `learner-${index}@example.test`,
        full_name: `Learner ${index}`,
        role: "user",
        created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        password_hash: "private-account-value",
      });
    }

    await assert.rejects(
      () => setLearnerPremiumComp(fixture.client, ADMIN, {
        target_user_id: "learner-user-500",
        comp_action: "grant",
        reason: "Approved scholarship",
      }),
      rejectsWith("USER_NOT_FOUND"),
    );
    assert.deepEqual(fixture.operations, ["auth.list"]);
    assert.deepEqual(fixture.authListArgumentCounts, [0]);
    assert.equal(fixture.operations.includes("User.get"), false);
    assert.equal(fixture.entityLookupNames.includes("User"), false);
    assert.equal(fixture.store.admin_audit_log.length, 0);
  });

  it("appends a grant event with the trimmed reason, verified actor, target ID, and old/new status", async () => {
    const fixture = createFixture();
    const account = addLearner(fixture);

    const result = await setLearnerPremiumComp(fixture.client, ADMIN, {
      target_user_id: account.id,
      comp_action: "grant",
      reason: "  Community scholarship   ",
    });

    assert.equal(result.status, "complete");
    assert.equal(result.comp_active, true);
    assert.ok(Number.isFinite(Date.parse(result.comp_updated_at)));
    assert.equal(fixture.store.admin_audit_log.length, 1);
    const entry = fixture.store.admin_audit_log[0];
    assert.equal(entry.action, "user.premium_comp_granted");
    assert.equal(entry.target_type, "user");
    assert.equal(entry.target_id, account.id);
    assert.equal(entry.actor_user_id, ADMIN.id);
    assert.equal(entry.actor_label, ADMIN.full_name);
    assert.deepEqual(JSON.parse(entry.old_value), { active: false });
    assert.deepEqual(JSON.parse(entry.new_value), { active: true, reason: "Community scholarship" });
    assert.equal(entry.occurred_at_utc, result.comp_updated_at);
    assert.equal(fixture.store.ParleCompStatus.length, 1);
    assert.deepEqual(
      (({ user_id, plan, status }: TestRow) => ({ user_id, plan, status }))(fixture.store.ParleCompStatus[0]),
      { user_id: "learner-user-1", plan: "premium_comp", status: "active" },
    );
    assert.equal(fixture.store.ParleIdentity[0].created_by, account.email, "the owner-readable projection uses the authenticated account email");
    assert.equal(fixture.store.ParleIdentity[0].premium_comp_active, true, "the administrator grant updates the canonical learner identity");
    assert.equal(fixture.store.ParleCompStatus[0].user_id, account.id, "the administrator grant retains the account ID used by auth.list()");
    assertCompTargetResolvedFromAuthList(fixture);
    assert.equal(account.role, "user");
    assert.equal(account.plan_tier, "Free");
    assert.equal(fixture.operations.some((operation) => operation === "User.update" || operation === "admin_audit_log.update" || operation === "admin_audit_log.delete"), false);
  });

  it("allows removal only for an active learner comp and preserves the earlier grant event", async () => {
    const fixture = createFixture();
    addLearner(fixture);
    fixture.store.admin_audit_log.push(auditRow({ id: "grant-before-removal" }));
    fixture.store.ParleCompStatus.push({ id: "status-before-removal", user_id: "learner-user-1", plan: "premium_comp", status: "active" });

    const result = await setLearnerPremiumComp(fixture.client, ADMIN, {
      target_user_id: "learner-user-1",
      comp_action: "remove",
      reason: "  Award period ended  ",
    });

    assert.equal(result.comp_active, false);
    assert.equal(fixture.store.admin_audit_log.length, 2);
    assert.equal(fixture.store.admin_audit_log[0].id, "grant-before-removal");
    const removal = fixture.store.admin_audit_log[1];
    assert.equal(removal.action, "user.premium_comp_removed");
    assert.equal(removal.target_id, "learner-user-1");
    assert.equal(removal.actor_user_id, ADMIN.id);
    assert.equal(JSON.parse(removal.old_value).active, true);
    assert.deepEqual(JSON.parse(removal.new_value), { active: false, reason: "Award period ended" });
    assert.equal(fixture.store.ParleCompStatus.length, 0);
    assert.equal(fixture.store.ParleIdentity[0].premium_comp_active, false, "administrator removal clears the owner-readable projection");
    assertCompTargetResolvedFromAuthList(fixture);
  });

  it("rejects comp changes for tutors and platform administrators without writing audit events", async () => {
    const fixture = createFixture();
    const tutor = addLearner(fixture, { id: "tutor-user-1", email: "tutor@example.test" });
    fixture.store.ParleIdentity[0].role = "tutor";

    await assert.rejects(
      () => setLearnerPremiumComp(fixture.client, ADMIN, { target_user_id: tutor.id, comp_action: "grant", reason: "A valid reason" }),
      rejectsWith("COMP_LEARNERS_ONLY"),
    );
    fixture.userRows.push({ id: "admin-account", email: "admin@parle.test", role: "administrator", created_at: "2026-01-01T00:00:00.000Z" });
    await assert.rejects(
      () => setLearnerPremiumComp(fixture.client, ADMIN, { target_user_id: "admin-account", comp_action: "grant", reason: "A valid reason" }),
      rejectsWith("COMP_LEARNERS_ONLY"),
    );
    assert.equal(fixture.store.admin_audit_log.length, 0);
    assert.equal(fixture.operations.some((operation) => operation === "admin_audit_log.create"), false);
  });

  it("does not append a duplicate grant or a removal for an inactive account", async () => {
    const fixture = createFixture();
    addLearner(fixture);
    fixture.store.admin_audit_log.push(auditRow());

    await assert.rejects(
      () => setLearnerPremiumComp(fixture.client, ADMIN, { target_user_id: "learner-user-1", comp_action: "grant", reason: "Duplicate" }),
      rejectsWith("COMP_ALREADY_ACTIVE"),
    );
    fixture.store.admin_audit_log.length = 0;
    await assert.rejects(
      () => setLearnerPremiumComp(fixture.client, ADMIN, { target_user_id: "learner-user-1", comp_action: "remove", reason: "No active comp" }),
      rejectsWith("COMP_NOT_ACTIVE"),
    );
    assert.equal(fixture.store.admin_audit_log.length, 0);
  });
});
