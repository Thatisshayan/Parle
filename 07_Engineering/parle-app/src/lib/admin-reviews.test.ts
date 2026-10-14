import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMIN_TUTOR_REVIEWS_PAGE_SIZE,
  adminManageTutorReviewsAction,
} from "../../functions/parle-admin-reviews.helper.ts";
import { dispatchWithAdminAccess } from "../../functions/parle-admin-access.helper.ts";
import { AdminActionError, type AdminActor } from "../../functions/parle-admin-settings.helper.ts";

const ADMIN: AdminActor = {
  id: "admin-review-test",
  email: "admin@parle.test",
  full_name: "Parle Admin",
  role: "administrator",
};
const LEARNER: AdminActor = { id: "learner-review-test", email: "learner@parle.test", role: "user" };
type Fixture = Record<string, unknown>;

function review(id: string, at: string, overrides: Fixture = {}): Fixture {
  return {
    id,
    profile_id: "tutor-profile-1",
    tutor_email: "tutor@parle.test",
    stars: 5,
    comment: `A thoughtful lesson for ${id}.`,
    is_test_review: false,
    is_visible: true,
    created_at: at,
    created_by: "learner@parle.test",
    private_field: "must not be returned",
    ...overrides,
  };
}

function reviewClient(
  inputReviews: Fixture[] = [],
  options: { failAudit?: boolean; failRollback?: boolean } = {},
  profileRows: Fixture[] = [{ id: "tutor-profile-1", created_by: "tutor@parle.test", display_name: "Marie Laurent", private_field: "private tutor data" }],
  replyRows: Fixture[] = [],
  accountRows: Fixture[] = [{ id: "learner-account-1", email: "learner@parle.test", full_name: "Nina Martin", password_hash: "private account data" }],
) {
  const reviews = structuredClone(inputReviews);
  const profiles = structuredClone(profileRows);
  const replies = structuredClone(replyRows);
  const accounts = structuredClone(accountRows);
  const operations = {
    reviewReads: 0,
    profileReads: 0,
    replyReads: 0,
    accountReads: 0,
    fields: [] as string[][],
    reviewUpdates: [] as Array<{ id: string; data: Fixture }>,
    audits: [] as Fixture[],
    auditAttempts: 0,
    auditActors: [] as Fixture[],
  };

  const selectedRows = (rows: Fixture[], filters: Fixture, offset: number, limit: number, fields: string[] = []) => {
    const matching = rows.filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
    return matching.slice(offset, offset + limit).map((row) => {
      if (fields.length === 0) return structuredClone(row);
      return Object.fromEntries(fields.filter((field) => Object.hasOwn(row, field)).map((field) => [field, structuredClone(row[field])]));
    });
  };

  const client = {
    entities: {
      tutor_review: {
        filter: async (filters: Fixture = {}, _sort = "id", limit = ADMIN_TUTOR_REVIEWS_PAGE_SIZE, offset = 0, fields: string[] = []) => {
          operations.reviewReads += 1;
          operations.fields.push([...fields]);
          return selectedRows(reviews, filters, offset, limit, fields);
        },
        update: async (id: string, data: Fixture) => {
          operations.reviewUpdates.push({ id, data: structuredClone(data) });
          const updateIndex = operations.reviewUpdates.length;
          if (options.failRollback && updateIndex > 1) throw new Error("rollback unavailable");
          const existing = reviews.find((row) => row.id === id);
          if (!existing) throw new Error("review missing");
          Object.assign(existing, structuredClone(data));
        },
      },
      tutor_profile: {
        filter: async (filters: Fixture = {}, _sort = "id", limit = ADMIN_TUTOR_REVIEWS_PAGE_SIZE, offset = 0, fields: string[] = []) => {
          operations.profileReads += 1;
          return selectedRows(profiles, filters, offset, limit, fields);
        },
      },
      tutor_review_reply: {
        filter: async (filters: Fixture = {}, _sort = "id", limit = ADMIN_TUTOR_REVIEWS_PAGE_SIZE, offset = 0, fields: string[] = []) => {
          operations.replyReads += 1;
          return selectedRows(replies, filters, offset, limit, fields);
        },
      },
      admin_audit_log: {
        create: async (entry: Fixture) => {
          operations.auditAttempts += 1;
          operations.auditActors.push({ actor_user_id: entry.actor_user_id, actor_label: entry.actor_label });
          if (options.failAudit) throw new Error("audit unavailable");
          operations.audits.push(structuredClone(entry));
          return { id: `audit-${operations.auditAttempts}` };
        },
      },
    },
    auth: {
      list: async () => {
        operations.accountReads += 1;
        return structuredClone(accounts);
      },
    },
  };

  return { client, operations, reviews };
}

function isAdminRequired(error: unknown): boolean {
  return error instanceof AdminActionError && error.code === "ADMIN_REQUIRED" && error.status === 403;
}

function manage(fixture: ReturnType<typeof reviewClient>, actor: AdminActor, operation: string, values: Fixture = {}) {
  return dispatchWithAdminAccess("admin_manage_reviews", actor, () =>
    adminManageTutorReviewsAction(fixture.client, actor, { operation, ...values }));
}

describe("Parle administrator tutor review actions", () => {
  it("lists reviews newest first with safe names, reply text, and the hidden count", async () => {
    const fixture = reviewClient([
      review("older", "2026-10-10T12:00:00.000Z"),
      review("newest", "2026-10-13T16:00:00.000Z", { is_visible: undefined, stars: 4, comment: "Clear, useful practice." }),
      review("hidden", "2026-10-12T09:00:00.000Z", { is_visible: false, is_test_review: true, created_by: "admin@parle.test" }),
    ], {}, undefined, [
      { id: "reply-1", profile_id: "tutor-profile-1", review_id: "newest", tutor_email: "tutor@parle.test", reply_text: "Thank you for practising with me.", created_by: "tutor@parle.test", created_at: "2026-10-13T17:00:00.000Z" },
    ]);

    const response = await manage(fixture, ADMIN, "list");

    assert.equal(response.status, "complete");
    assert.equal(response.count, 3);
    assert.equal(response.hidden_count, 1);
    const items = response.reviews as Fixture[];
    assert.deepEqual(items.map((item) => item.id), ["newest", "hidden", "older"]);
    assert.equal(items[0].is_visible, true, "missing visibility status defaults to visible");
    assert.equal(items[0].tutor_display_name, "Marie Laurent");
    assert.equal(items[0].learner_display_name, "Nina Martin");
    assert.equal(items[0].tutor_reply, "Thank you for practising with me.");
    assert.equal(items[1].learner_display_name, "", "test reviews use a translated demo-learner fallback in the page");
    assert.equal(JSON.stringify(response).includes("learner@parle.test"), false);
    assert.equal(JSON.stringify(response).includes("tutor@parle.test"), false);
    assert.equal(JSON.stringify(response).includes("private tutor data"), false);
    assert.equal(JSON.stringify(response).includes("private account data"), false);
    assert.equal(fixture.operations.reviewReads, 1);
    assert.equal(fixture.operations.profileReads, 1);
    assert.equal(fixture.operations.replyReads, 1);
    assert.equal(fixture.operations.accountReads, 1);
    assert.equal(fixture.operations.audits.length, 0);
    assert.equal(fixture.operations.fields[0].includes("comment"), true);
    assert.equal(fixture.operations.fields[0].includes("created_by"), true);
    assert.equal(fixture.operations.fields[0].includes("private_field"), false);
  });

  it("returns an empty, zero-count queue without reading unrelated profile or account records", async () => {
    const fixture = reviewClient([]);
    const response = await manage(fixture, ADMIN, "list");
    assert.deepEqual(response, { status: "complete", operation: "list", reviews: [], count: 0, hidden_count: 0 });
    assert.equal(fixture.operations.reviewReads, 1);
    assert.equal(fixture.operations.profileReads, 0);
    assert.equal(fixture.operations.replyReads, 0);
    assert.equal(fixture.operations.accountReads, 0);
  });

  it("loads every review page and keeps the returned list ordered newest first", async () => {
    const records = Array.from({ length: ADMIN_TUTOR_REVIEWS_PAGE_SIZE + 1 }, (_, index) => review(
      `review-${index}`,
      new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString(),
      { is_test_review: true, created_by: "admin@parle.test" },
    ));
    const fixture = reviewClient(records);
    const response = await manage(fixture, ADMIN, "list");
    const items = response.reviews as Fixture[];
    assert.equal(items.length, records.length);
    assert.equal(items[0].id, `review-${records.length - 1}`);
    assert.equal(fixture.operations.reviewReads, 2);
  });

  it("requires a non-empty bounded hide reason before reading or changing a review", async () => {
    for (const reason of ["", "   \n  ", null, 42, "x".repeat(1001)]) {
      const fixture = reviewClient([review("needs-reason", "2026-10-13T16:00:00.000Z")]);
      await assert.rejects(
        () => manage(fixture, ADMIN, "hide", { review_id: "needs-reason", reason }),
        (error: unknown) => error instanceof AdminActionError && ["REVIEW_HIDE_REASON_REQUIRED", "REVIEW_HIDE_REASON_TOO_LONG"].includes(error.code),
      );
      assert.equal(fixture.operations.reviewReads, 0);
      assert.equal(fixture.operations.reviewUpdates.length, 0);
      assert.equal(fixture.operations.auditAttempts, 0);
      assert.equal(fixture.reviews[0].is_visible, true);
    }
  });

  it("hides a visible review with only the visibility field changed and a reason in audit", async () => {
    const fixture = reviewClient([review("hide-me", "2026-10-13T16:00:00.000Z", { is_visible: undefined })]);
    const response = await manage(fixture, ADMIN, "hide", { review_id: "hide-me", reason: "  The comment includes private contact details.  " });

    assert.equal(response.status, "complete");
    assert.equal(response.operation, "hide");
    assert.equal(response.audit_status, "written");
    assert.deepEqual(response.review, { id: "hide-me", profile_id: "tutor-profile-1", is_visible: false });
    assert.equal(fixture.reviews[0].is_visible, false);
    assert.deepEqual(fixture.operations.reviewUpdates, [{ id: "hide-me", data: { is_visible: false } }]);
    assert.equal(fixture.operations.audits.length, 1);
    assert.equal(fixture.operations.audits[0].actor_user_id, ADMIN.id);
    assert.equal(fixture.operations.audits[0].action, "tutor_review.hidden");
    assert.equal(fixture.operations.audits[0].target_type, "tutor_review");
    assert.equal(fixture.operations.audits[0].target_id, "hide-me");
    assert.deepEqual(JSON.parse(String(fixture.operations.audits[0].old_value)), { is_visible: true });
    assert.deepEqual(JSON.parse(String(fixture.operations.audits[0].new_value)), {
      is_visible: false,
      hide_reason: "The comment includes private contact details.",
    });
    assert.deepEqual(fixture.operations.auditActors, [{ actor_user_id: ADMIN.id, actor_label: "Parle Admin" }]);
    assert.equal(JSON.stringify(fixture.operations.audits).includes("A thoughtful lesson"), false);
    assert.equal(JSON.stringify(fixture.operations.audits).includes("learner@parle.test"), false);
  });

  it("restores only a hidden review and records the restored status in audit", async () => {
    const fixture = reviewClient([review("restore-me", "2026-10-13T15:00:00.000Z", { is_visible: false })]);
    const response = await manage(fixture, ADMIN, "restore", { review_id: "restore-me" });

    assert.equal(response.status, "complete");
    assert.equal(response.operation, "restore");
    assert.equal(response.audit_status, "written");
    assert.deepEqual(response.review, { id: "restore-me", profile_id: "tutor-profile-1", is_visible: true });
    assert.equal(fixture.reviews[0].is_visible, true);
    assert.deepEqual(fixture.operations.reviewUpdates, [{ id: "restore-me", data: { is_visible: true } }]);
    assert.equal(fixture.operations.audits[0].action, "tutor_review.restored");
    assert.equal(fixture.operations.audits[0].target_id, "restore-me");
    assert.deepEqual(JSON.parse(String(fixture.operations.audits[0].old_value)), { is_visible: false });
    assert.deepEqual(JSON.parse(String(fixture.operations.audits[0].new_value)), { is_visible: true });
  });

  it("rejects stale hide and restore actions without duplicate audit entries", async () => {
    const visible = reviewClient([review("already-visible", "2026-10-13T14:00:00.000Z")]);
    await assert.rejects(
      () => manage(visible, ADMIN, "restore", { review_id: "already-visible" }),
      (error: unknown) => error instanceof AdminActionError && error.code === "REVIEW_NOT_HIDDEN" && error.status === 409,
    );
    const hidden = reviewClient([review("already-hidden", "2026-10-13T13:00:00.000Z", { is_visible: false })]);
    await assert.rejects(
      () => manage(hidden, ADMIN, "hide", { review_id: "already-hidden", reason: "Reviewed again." }),
      (error: unknown) => error instanceof AdminActionError && error.code === "REVIEW_ALREADY_HIDDEN" && error.status === 409,
    );
    assert.equal(visible.operations.reviewUpdates.length, 0);
    assert.equal(hidden.operations.reviewUpdates.length, 0);
    assert.equal(visible.operations.auditAttempts, 0);
    assert.equal(hidden.operations.auditAttempts, 0);
  });

  it("rolls back the visibility change if its audit entry cannot be written", async () => {
    const fixture = reviewClient([review("audit-fails", "2026-10-13T12:00:00.000Z")], { failAudit: true });
    await assert.rejects(
      () => manage(fixture, ADMIN, "hide", { review_id: "audit-fails", reason: "Duplicate test content." }),
      (error: unknown) => error instanceof AdminActionError && error.code === "REVIEW_AUDIT_FAILED" && error.status === 503,
    );
    assert.equal(fixture.reviews[0].is_visible, true);
    assert.deepEqual(fixture.operations.reviewUpdates, [
      { id: "audit-fails", data: { is_visible: false } },
      { id: "audit-fails", data: { is_visible: true } },
    ]);
    assert.equal(fixture.operations.auditAttempts, 1);
    assert.equal(fixture.operations.audits.length, 0);
  });

  it("refuses non-administrators before any list, hide, or restore review access", async () => {
    for (const operation of ["list", "hide", "restore"]) {
      const fixture = reviewClient([review("protected-review", "2026-10-13T10:00:00.000Z")]);
      await assert.rejects(
        () => manage(fixture, LEARNER, operation, { review_id: "protected-review", reason: "Must not reach review records." }),
        isAdminRequired,
      );
      assert.equal(fixture.operations.reviewReads, 0);
      assert.equal(fixture.operations.profileReads, 0);
      assert.equal(fixture.operations.replyReads, 0);
      assert.equal(fixture.operations.accountReads, 0);
      assert.equal(fixture.operations.reviewUpdates.length, 0);
      assert.equal(fixture.operations.auditAttempts, 0);
    }
  });
});
