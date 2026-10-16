import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { t } from "./i18n";
import {
  APP_SETTING_DEFAULTS,
  AdminActionError,
  getAdminSettings,
  initializeAppSettings,
  listAdminAudit,
  readAppSettings,
  saveAdminSettings,
  updateDemoBankContent,
  validateAdminSettings,
  type AdminActor,
} from "../../functions/parle-admin-settings.helper.ts";

const ADMIN: AdminActor = { id: "admin-1", email: "admin@parle.test", full_name: "Parle Admin", role: "administrator" };
const LEARNER: AdminActor = { id: "learner-1", email: "learner@parle.test", role: "user" };

type TestRow = Record<string, any> & { id?: string; created_at?: string; updated_at?: string };
type TestSettingOverrides = Partial<Record<keyof typeof APP_SETTING_DEFAULTS, number | boolean>>;

function createAdminFixture() {
  const store: Record<string, TestRow[]> = { app_setting: [], admin_audit_log: [], tutor_application_review: [], question_item: [], prompt_item: [] };
  const operations: string[] = [];
  let sequence = 0;
  const entities: Record<string, any> = {};
  for (const name of Object.keys(store)) {
    entities[name] = {
      filter: async (filters: Record<string, unknown> = {}, sort = "", limit = 500) => {
        operations.push(`${name}.filter`);
        const matching = store[name].filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
        const field = sort.startsWith("-") ? sort.slice(1) : sort;
        const direction = sort.startsWith("-") ? -1 : 1;
        return structuredClone([...matching].sort((left, right) => direction * String(left[field] ?? "").localeCompare(String(right[field] ?? ""))).slice(0, limit));
      },
      create: async (values: TestRow) => {
        operations.push(`${name}.create`);
        const now = new Date().toISOString();
        const row = { ...structuredClone(values), id: `${name}-${++sequence}`, created_at: now, updated_at: now, created_by: ADMIN.email };
        store[name].push(row);
        return structuredClone(row);
      },
      update: async (id: string, values: TestRow) => {
        operations.push(`${name}.update`);
        const row = store[name].find((entry) => entry.id === id);
        if (!row) throw new Error(`Missing ${name} row`);
        Object.assign(row, structuredClone(values), { updated_at: new Date().toISOString() });
        return structuredClone(row);
      },
    };
  }
  return { client: { entities }, store, operations };
}

function settings(overrides: TestSettingOverrides = {}) {
  return { ...APP_SETTING_DEFAULTS, ...overrides };
}

describe("Parle administrator settings and audit helpers", () => {

  it("saves each changed setting with its audit row in one atomic call when the server offers it (S24)", async () => {
    const fixture = createAdminFixture();
    await initializeAppSettings(fixture.client, ADMIN);
    const calls: any[] = [];
    const client = { ...fixture.client, atomic: { saveSettingWithAudit: async (input: any) => { calls.push(input); } } };
    fixture.operations.length = 0;
    await saveAdminSettings(client, ADMIN, settings({ free_ai_messages_per_day: 12 }));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].key, "free_ai_messages_per_day");
    assert.equal(calls[0].value, "12");
    assert.equal(calls[0].updatedBy, ADMIN.id);
    assert.equal(calls[0].audit.action, "setting.updated");
    assert.equal(JSON.parse(calls[0].audit.new_value), 12);
    assert.equal(fixture.operations.filter((op) => op === "admin_audit_log.create" || op === "app_setting.update").length, 0);
  });
  it("keeps every requested default and validates all setting ranges, precision, flags, and quota ordering", () => {
    assert.deepEqual(APP_SETTING_DEFAULTS, {
      free_ai_messages_per_day: 10,
      premium_fair_use_ai_messages_per_day: 300,
      premium_live_voice_minutes_per_month: 60,
      commission_percent: 20,
      payout_delay_hours: 72,
      cancellation_window_hours: 24,
      minimum_lesson_charge_usd: 8,
      founding_commission_percent: 10,
      min_notice_hours: 12,
      booking_horizon_days: 30,
      slot_hold_minutes: 30,
      auto_complete_hours: 48,
      tutor_cancellation_flag_count: 3,
      live_voice_enabled: false,
      premium_roadmap_triggers_enabled: false,
      free_voice_answers_per_day: 2,
      premium_voice_answers_per_day: 15,
      free_voice_messages_per_day: 5,
      premium_voice_messages_per_day: 60,
      free_voice_replies_per_day: 20,
      premium_voice_replies_per_day: 200,
    });
    assert.equal(validateAdminSettings(settings({ slot_hold_minutes: 29 })).valid, false);
    assert.equal(validateAdminSettings(settings({ slot_hold_minutes: 30 })).valid, true);
    assert.equal(validateAdminSettings(settings({ booking_horizon_days: 31 })).valid, false);
    assert.equal(validateAdminSettings(settings({ founding_commission_percent: 12.5 })).valid, true);

    const valid = (overrides: TestSettingOverrides = {}) => validateAdminSettings(settings(overrides)).valid;
    assert.equal(valid({ free_ai_messages_per_day: 0 }), true);
    assert.equal(valid({ free_ai_messages_per_day: 100 }), true);
    assert.equal(valid({ free_ai_messages_per_day: -1 }), false);
    assert.equal(valid({ free_ai_messages_per_day: 101 }), false);
    assert.equal(valid({ free_ai_messages_per_day: 10.5 }), false);
    assert.equal(valid({ premium_fair_use_ai_messages_per_day: 1, free_ai_messages_per_day: 0 }), true);
    assert.equal(valid({ premium_fair_use_ai_messages_per_day: 5000 }), true);
    assert.equal(valid({ premium_fair_use_ai_messages_per_day: 0 }), false);
    assert.equal(valid({ premium_fair_use_ai_messages_per_day: 5001 }), false);
    assert.equal(valid({ premium_fair_use_ai_messages_per_day: 9 }), false);
    assert.equal(valid({ premium_live_voice_minutes_per_month: 0 }), true);
    assert.equal(valid({ premium_live_voice_minutes_per_month: 600 }), true);
    assert.equal(valid({ premium_live_voice_minutes_per_month: 600.5 }), false);
    assert.equal(valid({ premium_live_voice_minutes_per_month: 601 }), false);
    assert.equal(valid({ commission_percent: 0 }), true);
    assert.equal(valid({ commission_percent: 50 }), true);
    assert.equal(valid({ commission_percent: 12.34 }), true);
    assert.equal(valid({ commission_percent: -0.01 }), false);
    assert.equal(valid({ commission_percent: 50.01 }), false);
    assert.equal(valid({ commission_percent: 12.345 }), false);
    assert.equal(valid({ payout_delay_hours: 0 }), true);
    assert.equal(valid({ payout_delay_hours: 720 }), true);
    assert.equal(valid({ payout_delay_hours: 721 }), false);
    assert.equal(valid({ payout_delay_hours: 1.5 }), false);
    assert.equal(valid({ cancellation_window_hours: 0 }), true);
    assert.equal(valid({ cancellation_window_hours: 168 }), true);
    assert.equal(valid({ cancellation_window_hours: -1 }), false);
    assert.equal(valid({ cancellation_window_hours: 169 }), false);
    assert.equal(valid({ minimum_lesson_charge_usd: 8 }), true);
    assert.equal(valid({ minimum_lesson_charge_usd: 8.01 }), true);
    assert.equal(valid({ minimum_lesson_charge_usd: 500 }), true);
    assert.equal(valid({ minimum_lesson_charge_usd: 7.99 }), false);
    assert.equal(valid({ minimum_lesson_charge_usd: 500.01 }), false);
    assert.equal(valid({ minimum_lesson_charge_usd: 8.001 }), false);
    assert.equal(valid({ live_voice_enabled: true }), true);
    assert.equal(validateAdminSettings({ ...APP_SETTING_DEFAULTS, live_voice_enabled: "true" }).valid, false);
    assert.equal(valid({ premium_roadmap_triggers_enabled: true }), true);
    assert.equal(validateAdminSettings({ ...APP_SETTING_DEFAULTS, unexpected: 1 }).valid, false);
  });

  it("denies a learner before reading administrator settings", async () => {
    const fixture = createAdminFixture();
    await assert.rejects(
      () => getAdminSettings(fixture.client, LEARNER),
      (error: unknown) => error instanceof AdminActionError && error.code === "ADMIN_REQUIRED" && error.status === 403,
    );
    assert.deepEqual(fixture.operations, []);
  });

  it("initializes one row per default and records the verified administrator as actor", async () => {
    const fixture = createAdminFixture();
    const loaded = await initializeAppSettings(fixture.client, ADMIN);
    assert.deepEqual(loaded, APP_SETTING_DEFAULTS);
    assert.equal(fixture.store.app_setting.length, Object.keys(APP_SETTING_DEFAULTS).length);
    assert.equal(fixture.store.admin_audit_log.length, Object.keys(APP_SETTING_DEFAULTS).length);
    assert.ok(fixture.store.app_setting.every((row) => row.updated_by === ADMIN.id));
    assert.ok(fixture.store.admin_audit_log.every((row) => row.actor_user_id === ADMIN.id && row.action === "setting.initialized"));
    await initializeAppSettings(fixture.client, ADMIN);
    assert.equal(fixture.store.app_setting.length, Object.keys(APP_SETTING_DEFAULTS).length);
    assert.equal(fixture.store.admin_audit_log.length, Object.keys(APP_SETTING_DEFAULTS).length);
  });

  it("saves a live Free limit and audits old and new values", async () => {
    const fixture = createAdminFixture();
    await initializeAppSettings(fixture.client, ADMIN);
    const saved = await saveAdminSettings(fixture.client, ADMIN, settings({ free_ai_messages_per_day: 12 }));
    assert.equal(saved.settings.free_ai_messages_per_day, 12);
    assert.deepEqual(saved.changed_keys, ["free_ai_messages_per_day"]);
    assert.equal(await readAppSettings(fixture.client).then((value) => value.free_ai_messages_per_day), 12);
    assert.equal(fixture.store.app_setting.find((row) => row.key === "free_ai_messages_per_day")?.value, "12");
    const audit = fixture.store.admin_audit_log.find((row) => row.action === "setting.updated" && row.target_id === "free_ai_messages_per_day");
    assert.ok(audit);
    assert.equal(audit.actor_user_id, ADMIN.id);
    assert.equal(audit.target_id, "free_ai_messages_per_day");
    assert.equal(JSON.parse(audit.old_value), 10);
    assert.equal(JSON.parse(audit.new_value), 12);
  });

  it("does not write settings or audit records when the submitted values are unchanged", async () => {
    const fixture = createAdminFixture();
    await initializeAppSettings(fixture.client, ADMIN);
    const auditCount = fixture.store.admin_audit_log.length;
    const operationCount = fixture.operations.length;

    const saved = await saveAdminSettings(fixture.client, ADMIN, APP_SETTING_DEFAULTS);

    assert.deepEqual(saved.changed_keys, []);
    assert.equal(fixture.store.admin_audit_log.length, auditCount);
    assert.equal(fixture.operations.length, operationCount + 1);
    assert.equal(fixture.operations.at(-1), "app_setting.filter");
  });

  it("reports a failed audit write instead of success after a setting value has already changed", async () => {
    const fixture = createAdminFixture();
    fixture.store.app_setting.push({ id: "free-setting", key: "free_ai_messages_per_day", value: "10", updated_by: "admin-1", updated_at: "2026-01-01T00:00:00.000Z" });
    fixture.client.entities.admin_audit_log.create = async () => { throw new Error("audit storage unavailable"); };

    await assert.rejects(
      () => saveAdminSettings(fixture.client, ADMIN, { free_ai_messages_per_day: 12 }),
      (error: unknown) => error instanceof AdminActionError && error.code === "AUDIT_WRITE_FAILED" && error.status === 503,
    );
    assert.equal(fixture.store.app_setting[0].value, "12");
    assert.equal(fixture.store.admin_audit_log.length, 0);
  });

  it("interpolates the saved commission in tutor pricing and agreement copy", async () => {
    const fixture = createAdminFixture();
    fixture.store.app_setting.push({ id: "commission-setting", key: "commission_percent", value: "22.5", updated_by: "admin-1" });
    const liveCommission = (await readAppSettings(fixture.client)).commission_percent;
    const tutorShare = Math.round((100 - liveCommission) * 100) / 100;

    const pricing = t("tutorApplication.commissionPreview", { commission: liveCommission });
    const agreement = t("tutorApplication.agreementCommission", { commission: liveCommission, tutorShare });

    assert.equal(liveCommission, 22.5);
    assert.match(pricing, /22\.5%/);
    assert.match(agreement, /22\.5%/);
    assert.match(agreement, /77\.5%/);
    assert.match(agreement, /does not process a tutor payment/i);
  });

  it("filters audit entries by action and UTC date, newest first", async () => {
    const fixture = createAdminFixture();
    fixture.store.admin_audit_log.push(
      { id: "old", action: "setting.updated", target_type: "app_setting", target_id: "commission_percent", actor_user_id: "admin-1", actor_label: "Parle Admin", old_value: "20", new_value: "22", occurred_at_utc: "2026-10-01T13:00:00.000Z", created_at: "2026-10-01T13:00:00.000Z" },
      { id: "new", action: "setting.updated", target_type: "app_setting", target_id: "commission_percent", actor_user_id: "admin-1", actor_label: "Parle Admin", old_value: "22", new_value: "24", occurred_at_utc: "2026-10-02T13:00:00.000Z", created_at: "2026-10-02T13:00:00.000Z" },
      { id: "other", action: "demo_review.hidden", target_type: "tutor_review", target_id: "review-1", actor_user_id: "admin-1", actor_label: "Parle Admin", old_value: "true", new_value: "false", occurred_at_utc: "2026-10-02T15:00:00.000Z", created_at: "2026-10-02T15:00:00.000Z" },
    );
    const result = await listAdminAudit(fixture.client, ADMIN, { action_type: "setting.updated", from_date: "2026-10-02", to_date: "2026-10-02" });
    assert.equal(result.count, 1);
    assert.equal(result.entries[0].id, "new");
    assert.equal(result.entries[0].new_value, "24");
  });

  it("includes recorded tutor decision history with its prior status, recorded actor label, and newest-first order", async () => {
    const fixture = createAdminFixture();
    fixture.store.tutor_application_review.push({
      id: "review-history-1",
      tutor_email: "private-tutor@example.test",
      decision_history_json: JSON.stringify([
        { status: "Submitted", actor: "administrator", at: "2026-10-12T05:50:00.000Z" },
        { status: "Needs changes", actor: "administrator", at: "2026-10-12T05:53:15.806Z" },
        { status: "Approved", actor: "administrator", at: "2026-10-12T06:00:00.000Z" },
        { status: "Rejected", actor: "administrator", at: "2026-10-12T06:03:00.000Z" },
        { status: "Suspended", actor: "administrator", at: "2026-10-12T06:05:00.000Z" },
      ]),
    });

    const result = await listAdminAudit(fixture.client, ADMIN, { action_type: "tutor_decisions" });
    assert.deepEqual(result.entries.map((entry) => JSON.parse(String(entry.new_value)).status), ["Suspended", "Rejected", "Approved", "Needs changes"]);
    const approved = result.entries.find((entry) => JSON.parse(String(entry.new_value)).status === "Approved");
    const needsChanges = result.entries.find((entry) => JSON.parse(String(entry.new_value)).status === "Needs changes");
    assert.ok(approved);
    assert.ok(needsChanges);
    assert.deepEqual(JSON.parse(String(approved.old_value)), { status: "Needs changes" });
    assert.deepEqual(JSON.parse(String(needsChanges.old_value)), { status: "Submitted" });
    assert.equal(approved.actor_label, "administrator");
    assert.equal(approved.source, "decision_history");
    assert.equal(needsChanges.occurred_at_utc, "2026-10-12T05:53:15.806Z");
    assert.equal(JSON.stringify(result).includes("private-tutor@example.test"), false);
  });

  it("applies inclusive UTC date filters to legacy tutor decisions too", async () => {
    const fixture = createAdminFixture();
    fixture.store.tutor_application_review.push({
      id: "review-date-1",
      decision_history_json: JSON.stringify([
        { status: "Needs changes", actor: "administrator", at: "2026-10-01T23:59:59.999Z" },
        { status: "Approved", actor: "administrator", at: "2026-10-02T00:00:00.000Z" },
        { status: "Rejected", actor: "administrator", at: "2026-10-02T23:59:59.999Z" },
        { status: "Suspended", actor: "administrator", at: "2026-10-03T00:00:00.000Z" },
      ]),
    });

    const result = await listAdminAudit(fixture.client, ADMIN, {
      action_type: "tutor_decisions",
      from_date: "2026-10-02",
      to_date: "2026-10-02",
    });
    assert.deepEqual(result.entries.map((entry) => JSON.parse(String(entry.new_value)).status), ["Rejected", "Approved"]);
  });

  it("deduplicates a historical decision against a matching persisted status audit row", async () => {
    const fixture = createAdminFixture();
    const time = "2026-10-12T05:53:15.806Z";
    fixture.store.tutor_application_review.push({
      id: "review-dedupe-1",
      decision_history_json: JSON.stringify([
        { status: "Submitted", actor: "administrator", at: "2026-10-12T05:50:00.000Z" },
        { status: "Needs changes", actor: "administrator", at: time },
      ]),
    });
    fixture.store.admin_audit_log.push({
      id: "saved-decision",
      action: "tutor_application.status_changed",
      target_type: "tutor_application_review",
      target_id: "review-dedupe-1",
      actor_label: "Parle Admin",
      old_value: JSON.stringify({ status: "Submitted" }),
      new_value: JSON.stringify({ status: "Needs changes" }),
      occurred_at_utc: time,
      created_at: time,
    });

    const result = await listAdminAudit(fixture.client, ADMIN, { action_type: "tutor_decisions" });
    const matching = result.entries.filter((entry) => JSON.parse(String(entry.new_value)).status === "Needs changes");
    assert.equal(matching.length, 1);
    assert.equal(matching[0].id, "saved-decision");
    assert.equal(matching[0].source, "admin_audit_log");
  });

  it("projects certificate verification audits to private, readable verified states", async () => {
    const fixture = createAdminFixture();
    const certificateId = "private-certificate-document-824";
    fixture.store.admin_audit_log.push({
      id: "certificate-verification",
      action: "tutor_certificate.verification_changed",
      target_type: "tutor_application_review",
      target_id: "review-certificate-1",
      actor_label: "Parle Admin",
      old_value: JSON.stringify({ verified_document_ids: [] }),
      new_value: JSON.stringify({ verified_document_ids: [certificateId] }),
      occurred_at_utc: "2026-10-12T12:00:00.000Z",
      created_at: "2026-10-12T12:00:00.000Z",
    });

    const result = await listAdminAudit(fixture.client, ADMIN, { action_type: "certificate_verification" });
    assert.equal(result.entries.length, 1);
    assert.deepEqual(JSON.parse(String(result.entries[0].old_value)), { verified: false });
    assert.deepEqual(JSON.parse(String(result.entries[0].new_value)), { verified: true });
    assert.equal(JSON.stringify(result).includes(certificateId), false);
  });

  it("applies category and inclusive UTC date boundaries before sorting newest first", async () => {
    const fixture = createAdminFixture();
    fixture.store.admin_audit_log.push(
      { id: "before", action: "setting.updated", target_type: "app_setting", target_id: "commission_percent", old_value: "20", new_value: "21", occurred_at_utc: "2026-10-01T23:59:59.999Z", created_at: "2026-10-01T23:59:59.999Z" },
      { id: "start", action: "setting.updated", target_type: "app_setting", target_id: "commission_percent", old_value: "20", new_value: "21", occurred_at_utc: "2026-10-02T00:00:00.000Z", created_at: "2026-10-02T00:00:00.000Z" },
      { id: "middle", action: "setting.initialized", target_type: "app_setting", target_id: "free_ai_messages_per_day", old_value: null, new_value: "10", occurred_at_utc: "2026-10-02T11:00:00.000Z", created_at: "2026-10-02T11:00:00.000Z" },
      { id: "end", action: "setting.updated", target_type: "app_setting", target_id: "commission_percent", old_value: "21", new_value: "22", occurred_at_utc: "2026-10-02T23:59:59.999Z", created_at: "2026-10-02T23:59:59.999Z" },
      { id: "after", action: "setting.updated", target_type: "app_setting", target_id: "commission_percent", old_value: "22", new_value: "23", occurred_at_utc: "2026-10-03T00:00:00.000Z", created_at: "2026-10-03T00:00:00.000Z" },
      { id: "other-action", action: "demo_review.hidden", target_type: "tutor_review", target_id: "test-review", occurred_at_utc: "2026-10-02T12:00:00.000Z", created_at: "2026-10-02T12:00:00.000Z" },
    );

    const result = await listAdminAudit(fixture.client, ADMIN, {
      action_type: "settings",
      from_date: "2026-10-02",
      to_date: "2026-10-02",
    });
    assert.deepEqual(result.entries.map((entry) => entry.id), ["end", "middle", "start"]);
    assert.equal(result.entries.every((entry) => typeof entry.action === "string" && entry.action.startsWith("setting.")), true);
  });

  it("keeps an AI draft target ID in audit results and removes all generated answer content", async () => {
    const fixture = createAdminFixture();
    const generatedAnswer = "generated answer text that must never reach the audit view";
    fixture.store.admin_audit_log.push({
      id: "draft-audit-1",
      action: "question_bank.ai_draft_created",
      target_type: "question_item",
      target_id: "question-created-42",
      actor_label: "Parle Admin",
      old_value: "null",
      new_value: JSON.stringify({ answer: generatedAnswer, options: [generatedAnswer] }),
      occurred_at_utc: "2026-10-12T12:00:00.000Z",
      created_at: "2026-10-12T12:00:00.000Z",
    });

    const result = await listAdminAudit(fixture.client, ADMIN, { action_type: "question_bank.ai_draft_created" });
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].target_id, "question-created-42");
    assert.equal(result.entries[0].target_type, "question_item");
    assert.equal(result.entries[0].old_value, "null");
    assert.equal(result.entries[0].new_value, "null");
    assert.equal(JSON.stringify(result).includes(generatedAnswer), false);
  });

  it("denies a learner audit read before querying either history source", async () => {
    const fixture = createAdminFixture();
    await assert.rejects(
      () => listAdminAudit(fixture.client, LEARNER),
      (error: unknown) => error instanceof AdminActionError && error.code === "ADMIN_REQUIRED" && error.status === 403,
    );
    assert.deepEqual(fixture.operations, []);
  });

  it("keeps audit access read/create only in the production app helper path", async () => {
    const fixture = createAdminFixture();
    await initializeAppSettings(fixture.client, ADMIN);
    await listAdminAudit(fixture.client, ADMIN);
    assert.equal(fixture.operations.some((operation) => operation === "admin_audit_log.update" || operation === "admin_audit_log.delete"), false);
    assert.equal(fixture.operations.filter((operation) => operation === "admin_audit_log.create").length, Object.keys(APP_SETTING_DEFAULTS).length);
  });

  it("server-checks and audits reviewed demo question content changes", async () => {
    const fixture = createAdminFixture();
    fixture.store.question_item.push({ id: "question-1", is_test_data: true, prompt: "Old prompt", created_at: "2026-01-01T00:00:00.000Z" });
    await assert.rejects(
      () => updateDemoBankContent(fixture.client, LEARNER, "question", "question-1", { prompt: "New prompt" }),
      (error: unknown) => error instanceof AdminActionError && error.code === "ADMIN_REQUIRED",
    );
    const result = await updateDemoBankContent(fixture.client, ADMIN, "question", "question-1", { prompt: "New prompt" });
    assert.equal(result.changed, true);
    assert.equal(fixture.store.question_item[0].prompt, "New prompt");
    assert.equal(fixture.store.admin_audit_log.length, 1);
    assert.equal(JSON.parse(fixture.store.admin_audit_log[0].old_value).prompt, "Old prompt");
    assert.equal(JSON.parse(fixture.store.admin_audit_log[0].new_value).prompt, "New prompt");
  });
});
