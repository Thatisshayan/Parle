import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAdminAuditCategory, presentAdminAuditEntry, type AdminAuditEntry } from "./admin-audit";
import { t, type TranslationKey } from "./i18n";

function auditEntry(overrides: Partial<AdminAuditEntry> = {}): AdminAuditEntry {
  return {
    id: "audit-1",
    actor_label: "Parle Admin",
    action: "setting.updated",
    target_type: "app_setting",
    target_id: "free_ai_messages_per_day",
    old_value: "10",
    new_value: "12",
    occurred_at_utc: "2026-10-12T12:00:00.000Z",
    source: "admin_audit_log",
    ...overrides,
  };
}

describe("administrator audit presentation", () => {
  it("turns a saved settings change into a translated name and formatted old/new values", () => {
    const view = presentAdminAuditEntry(auditEntry());
    assert.equal(view.category, "settings");
    assert.equal(t(view.title.key, view.title.values), "Setting changed");
    assert.equal(t(view.target.key, view.target.values), "Free AI messages per day");
    assert.equal(t(view.oldValue!.key, view.oldValue!.values), "10 messages per day");
    assert.equal(t(view.newValue!.key, view.newValue!.values), "12 messages per day");
  });

  it("maps recorded application statuses to human-readable labels and decision summaries", () => {
    const statuses: Array<{ value: string; key: TranslationKey }> = [
      { value: "Draft", key: "adminAudit.status.draft" },
      { value: "Submitted", key: "adminAudit.status.submitted" },
      { value: "In review", key: "adminAudit.status.inReview" },
      { value: "Approved", key: "adminAudit.status.approved" },
      { value: "Needs changes", key: "adminAudit.status.needsChanges" },
      { value: "Rejected", key: "adminAudit.status.rejected" },
      { value: "Suspended", key: "adminAudit.status.suspended" },
    ];
    for (const status of statuses) {
      const view = presentAdminAuditEntry(auditEntry({
        action: "tutor_application.status_changed",
        target_type: "tutor_application_review",
        old_value: JSON.stringify({ status: "Submitted" }),
        new_value: JSON.stringify({ status: status.value }),
      }));
      assert.equal(view.category, "tutor_decisions");
      assert.equal(t(view.newValue!.key, view.newValue!.values), t(status.key));
    }

    const decisionSummaries: Array<[string, TranslationKey]> = [
      ["Approved", "adminAudit.summary.tutorApproved"],
      ["Needs changes", "adminAudit.summary.tutorNeedsChanges"],
      ["Rejected", "adminAudit.summary.tutorRejected"],
      ["Suspended", "adminAudit.summary.tutorSuspended"],
    ];
    for (const [status, summary] of decisionSummaries) {
      const view = presentAdminAuditEntry(auditEntry({
        action: "tutor_application.status_changed",
        old_value: JSON.stringify({ status: "Submitted" }),
        new_value: JSON.stringify({ status }),
      }));
      assert.equal(t(view.title.key, view.title.values), t(summary));
    }
  });

  it("summarizes certificate verification without exposing document identifiers", () => {
    const privateDocumentId = "private-certificate-document-824";
    const view = presentAdminAuditEntry(auditEntry({
      action: "tutor_certificate.verification_changed",
      target_type: "tutor_application_review",
      old_value: JSON.stringify({ verified_document_ids: [] }),
      new_value: JSON.stringify({ verified_document_ids: [privateDocumentId] }),
    }));
    assert.equal(view.category, "certificate_verification");
    assert.equal(t(view.title.key, view.title.values), "Certificate marked verified");
    assert.equal(t(view.oldValue!.key, view.oldValue!.values), "Unverified");
    assert.equal(t(view.newValue!.key, view.newValue!.values), "Verified");
    assert.equal(JSON.stringify(view).includes(privateDocumentId), false);
  });

  it("labels Premium-comp grants and removals in the Audit filter and displays each recorded reason", () => {
    const cases = [
      {
        action: "user.premium_comp_granted",
        active: true,
        reason: "Approved scholarship support",
        title: "adminAudit.summary.compGranted",
        value: "Active, reason: Approved scholarship support",
      },
      {
        action: "user.premium_comp_removed",
        active: false,
        reason: "Award period ended",
        title: "adminAudit.summary.compRemoved",
        value: "Inactive, reason: Award period ended",
      },
    ] as const;

    assert.equal(t("adminAudit.action.premiumComp"), "Premium comp decisions");
    assert.equal(t("adminAudit.category.premiumComp"), "Premium comp");
    for (const item of cases) {
      const presentation = presentAdminAuditEntry(auditEntry({
        action: item.action,
        target_type: "user",
        target_id: "learner-user-42",
        old_value: JSON.stringify({ active: !item.active }),
        new_value: JSON.stringify({ active: item.active, reason: item.reason }),
      }));
      assert.equal(getAdminAuditCategory(item.action), "premium_comp");
      assert.equal(presentation.category, "premium_comp");
      assert.equal(t(presentation.title.key, presentation.title.values), t(item.title));
      assert.equal(t(presentation.target.key, presentation.target.values), "User account learner-user-42");
      assert.equal(t(presentation.oldValue!.key, presentation.oldValue!.values), item.active ? "Inactive" : "Active");
      assert.equal(t(presentation.newValue!.key, presentation.newValue!.values), item.value);
    }
  });

  it("keeps less common administrator actions understandable without rendering raw values", () => {
    const view = presentAdminAuditEntry(auditEntry({
      action: "tutor_application.email_retry",
      target_type: "tutor_application_review",
      old_value: JSON.stringify({ email: "private-tutor@example.test" }),
      new_value: JSON.stringify({ token: "secret" }),
    }));
    assert.equal(getAdminAuditCategory("tutor_application.email_retry"), "other");
    assert.equal(t(view.title.key, view.title.values), "Tutor decision email retry recorded");
    assert.equal(view.showValues, false);
    assert.equal(JSON.stringify(view).includes("private-tutor@example.test"), false);
    assert.equal(JSON.stringify(view).includes("secret"), false);
  });

  it("labels AI draft creation with its item ID while hiding generated answers", () => {
    const privateAnswer = "Réponse générée qui reste hors de l'audit";
    const view = presentAdminAuditEntry(auditEntry({
      action: "question_bank.ai_draft_created",
      target_type: "question_item",
      target_id: "question-created-42",
      old_value: "null",
      new_value: JSON.stringify({ answer: privateAnswer, choices: [privateAnswer] }),
    }));

    assert.equal(getAdminAuditCategory("question_bank.ai_draft_created"), "other");
    assert.equal(view.category, "other");
    assert.equal(t(view.title.key, view.title.values), "AI-generated content draft created");
    assert.equal(t(view.target.key, view.target.values), "Content item question-created-42");
    assert.equal(view.showValues, false);
    assert.equal(JSON.stringify(view).includes(privateAnswer), false);
  });
  it("shows a question-bank edit's changed fields with old and new values (A19, D23)", () => {
    const view = presentAdminAuditEntry(auditEntry({
      action: "question_bank.content_updated", target_type: "question_item", target_id: "q-1",
      old_value: JSON.stringify({ explanation: "Old text", status: "draft" }),
      new_value: JSON.stringify({ explanation: "New text", status: "approved" }),
    }));
    assert.equal(view.showValues, true);
    assert.equal(t(view.title.key, view.title.values), "Question bank item edited");
    assert.equal(t(view.target.key, view.target.values), "Content item q-1");
    assert.equal(t(view.oldValue!.key, view.oldValue!.values), "Explanation: Old text; Status: draft");
    assert.equal(t(view.newValue!.key, view.newValue!.values), "Explanation: New text; Status: approved");
  });
  it("summarises options and long text in a question-bank edit", () => {
    const view = presentAdminAuditEntry(auditEntry({
      action: "question_bank.content_updated", target_type: "question_item", target_id: "q-2",
      old_value: JSON.stringify({ options: [{ id: "a", text: "Au parc" }, { id: "b", text: "Parce que" }], is_test_data: true }),
      new_value: JSON.stringify({ prompt: "x".repeat(200) }),
    }));
    assert.equal(t(view.oldValue!.key, view.oldValue!.values), "Test item: yes; Options: Au parc / Parce que");
    assert.equal(t(view.newValue!.key, view.newValue!.values), `Question: ${"x".repeat(117)}...`);
  });
});
