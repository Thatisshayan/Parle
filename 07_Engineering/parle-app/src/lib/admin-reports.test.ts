import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMIN_REPORTED_CONTENT_PAGE_SIZE,
  adminListReportedContentAction,
  adminResolvePracticeReportAction,
} from "../../functions/parle-admin-reports.helper.ts";
import { dispatchWithAdminAccess } from "../../functions/parle-admin-access.helper.ts";
import { AdminActionError, type AdminActor } from "../../functions/parle-admin-settings.helper.ts";

type Fixture = Record<string, unknown>;

const ADMIN: AdminActor = {
  id: "admin-report-test",
  email: "admin@parle.test",
  full_name: "Parle Admin",
  role: "administrator",
};

function report(id: string, at: string, status = "new", overrides: Fixture = {}): Fixture {
  return {
    id,
    task_id: `task-record-${id}`,
    task_key: `week-1-${id}`,
    note: `Learner note for ${id}`,
    reported_at_utc: at,
    category: "content_issue",
    status,
    content_json: "private parent content that must not be returned",
    ...overrides,
  };
}

function reportClient(inputRows: Fixture[] = [], options: { failAudit?: boolean; failUpdate?: boolean } = {}) {
  const rows = structuredClone(inputRows);
  const operations = {
    reads: 0,
    taskReads: 0,
    fields: [] as string[][],
    updates: [] as Array<{ id: string; data: Fixture }>,
    audits: [] as Fixture[],
    auditAttempts: 0,
  };

  const client = {
    entities: {
      practice_report: {
        filter: async (
          filters: Fixture = {},
          _sort = "id",
          limit = ADMIN_REPORTED_CONTENT_PAGE_SIZE,
          skip = 0,
          fields: string[] = [],
        ) => {
          operations.reads += 1;
          operations.fields.push([...fields]);
          const matching = rows.filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
          return structuredClone(matching.slice(skip, skip + limit));
        },
        update: async (id: string, data: Fixture) => {
          operations.updates.push({ id, data: structuredClone(data) });
          if (options.failUpdate) throw new Error("report update unavailable");
          const existing = rows.find((row) => row.id === id);
          if (!existing) throw new Error("report missing");
          Object.assign(existing, structuredClone(data));
        },
      },
      admin_audit_log: {
        create: async (entry: Fixture) => {
          operations.auditAttempts += 1;
          if (options.failAudit) throw new Error("audit write unavailable");
          operations.audits.push(structuredClone(entry));
          return { id: `audit-${operations.auditAttempts}` };
        },
      },
      learner_task: {
        filter: async () => {
          operations.taskReads += 1;
          throw new Error("Report review must never read parent task text.");
        },
      },
    },
  };

  return { client, operations, rows };
}

function isAdminRequired(error: unknown): boolean {
  return error instanceof AdminActionError && error.code === "ADMIN_REQUIRED" && error.status === 403;
}

describe("Parle administrator reported-content actions", () => {
  it("lists saved report fields newest first and maps new records to Open", async () => {
    const fixture = reportClient([
      report("older-open", "2026-10-10T12:00:00.000Z", "new"),
      report("newest-fixed", "2026-10-13T16:00:00.000Z", "fixed"),
      report("middle-dismissed", "2026-10-12T09:30:00.000Z", "dismissed"),
      report("legacy-reviewed", "2026-10-11T09:30:00.000Z", "reviewed"),
    ]);

    const response = await dispatchWithAdminAccess("admin_list_reported_content", ADMIN, () =>
      adminListReportedContentAction(fixture.client, ADMIN));

    assert.equal(response.status, "complete");
    assert.equal(response.count, 4);
    assert.equal(response.open_count, 1);
    const items = response.reports;
    assert.deepEqual(items.map((item) => item.id), ["newest-fixed", "middle-dismissed", "legacy-reviewed", "older-open"]);
    assert.equal(items[3].status, "open");
    assert.equal(items[0].task_key, "week-1-newest-fixed");
    assert.equal(items[0].task_id, "task-record-newest-fixed");
    assert.equal(items[0].note, "Learner note for newest-fixed");
    assert.equal(JSON.stringify(response).includes("private parent content"), false);
    assert.equal(fixture.operations.taskReads, 0);
    assert.equal(fixture.operations.fields[0].includes("task_key"), true);
    assert.equal(fixture.operations.fields[0].includes("task_id"), true);
    assert.equal(fixture.operations.fields[0].includes("content_json"), false);
  });

  it("returns a clear zero-count result when there are no reports", async () => {
    const fixture = reportClient([]);
    const response = await dispatchWithAdminAccess("admin_list_reported_content", ADMIN, () =>
      adminListReportedContentAction(fixture.client, ADMIN));

    assert.deepEqual(response, { status: "complete", reports: [], count: 0, open_count: 0 });
    assert.equal(fixture.operations.reads, 1);
  });

  it("loads every report page through the caller client", async () => {
    const records = Array.from({ length: ADMIN_REPORTED_CONTENT_PAGE_SIZE + 3 }, (_, index) =>
      report(`paged-${index + 1}`, `2026-10-13T${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00.000Z`));
    const fixture = reportClient(records);

    const response = await dispatchWithAdminAccess("admin_list_reported_content", ADMIN, () =>
      adminListReportedContentAction(fixture.client, ADMIN));

    assert.equal(response.count, records.length);
    assert.equal(response.open_count, records.length);
    assert.equal(fixture.operations.reads, 2);
  });

  it("marks open reports fixed and records the trimmed required note in audit", async () => {
    const fixture = reportClient([report("fix-me", "2026-10-13T16:00:00.000Z")]);
    const response = await dispatchWithAdminAccess("admin_resolve_practice_report", ADMIN, () =>
      adminResolvePracticeReportAction(fixture.client, ADMIN, {
        report_id: "fix-me",
        resolution: "fixed",
        note: "  Replaced the incorrect prompt.  ",
      }));

    assert.equal(response.status, "complete");
    assert.equal(response.report.status, "fixed");
    assert.equal(fixture.rows[0].status, "fixed");
    assert.deepEqual(fixture.operations.updates, [{ id: "fix-me", data: { status: "fixed" } }]);
    assert.equal(fixture.operations.audits.length, 1);
    assert.equal(fixture.operations.audits[0].action, "practice_report.resolved");
    assert.equal(fixture.operations.audits[0].target_type, "practice_report");
    assert.equal(fixture.operations.audits[0].target_id, "fix-me");
    assert.deepEqual(JSON.parse(String(fixture.operations.audits[0].old_value)), { status: "new" });
    assert.deepEqual(JSON.parse(String(fixture.operations.audits[0].new_value)), {
      status: "fixed",
      note: "Replaced the incorrect prompt.",
    });
  });

  it("dismisses open reports through the same resolution action and audits the note", async () => {
    const fixture = reportClient([report("dismiss-me", "2026-10-13T15:00:00.000Z")]);
    const response = await dispatchWithAdminAccess("admin_resolve_practice_report", ADMIN, () =>
      adminResolvePracticeReportAction(fixture.client, ADMIN, {
        report_id: "dismiss-me",
        resolution: "dismissed",
        note: "Duplicate report; the earlier report covers this issue.",
      }));

    assert.equal(response.status, "complete");
    assert.equal(response.report.status, "dismissed");
    assert.equal(fixture.rows[0].status, "dismissed");
    assert.deepEqual(JSON.parse(String(fixture.operations.audits[0].new_value)), {
      status: "dismissed",
      note: "Duplicate report; the earlier report covers this issue.",
    });
  });

  it("rejects empty and whitespace-only notes before changing a report or writing audit", async () => {
    for (const note of ["", "   \n  ", null, 42]) {
      const fixture = reportClient([report("needs-note", "2026-10-13T14:00:00.000Z")]);
      await assert.rejects(
        () => dispatchWithAdminAccess("admin_resolve_practice_report", ADMIN, () =>
          adminResolvePracticeReportAction(fixture.client, ADMIN, {
            report_id: "needs-note",
            resolution: "fixed",
            note,
          })),
        (error: unknown) => error instanceof AdminActionError && error.code === "REPORT_NOTE_REQUIRED" && error.status === 400,
      );
      assert.equal(fixture.rows[0].status, "new");
      assert.equal(fixture.operations.updates.length, 0);
      assert.equal(fixture.operations.auditAttempts, 0);
    }
  });

  it("rejects overlong notes and invalid outcomes before any writes", async () => {
    const fixture = reportClient([report("limits", "2026-10-13T13:00:00.000Z")]);
    await assert.rejects(
      () => adminResolvePracticeReportAction(fixture.client, ADMIN, {
        report_id: "limits",
        resolution: "fixed",
        note: "x".repeat(1001),
      }),
      (error: unknown) => error instanceof AdminActionError && error.code === "REPORT_NOTE_TOO_LONG",
    );
    await assert.rejects(
      () => adminResolvePracticeReportAction(fixture.client, ADMIN, {
        report_id: "limits",
        resolution: "reviewed",
        note: "Review complete.",
      }),
      (error: unknown) => error instanceof AdminActionError && error.code === "REPORT_RESOLUTION_INVALID",
    );
    assert.equal(fixture.operations.updates.length, 0);
    assert.equal(fixture.operations.auditAttempts, 0);
  });

  it("resolves only open reports and never duplicates an audit entry for an already resolved row", async () => {
    const fixture = reportClient([report("already-fixed", "2026-10-13T12:00:00.000Z", "fixed")]);
    await assert.rejects(
      () => dispatchWithAdminAccess("admin_resolve_practice_report", ADMIN, () =>
        adminResolvePracticeReportAction(fixture.client, ADMIN, {
          report_id: "already-fixed",
          resolution: "dismissed",
          note: "Reviewed again.",
        })),
      (error: unknown) => error instanceof AdminActionError && error.code === "REPORT_NOT_OPEN" && error.status === 409,
    );
    assert.equal(fixture.operations.updates.length, 0);
    assert.equal(fixture.operations.auditAttempts, 0);
  });

  it("refuses non-administrator reads and resolutions before touching report or audit data", async () => {
    const fixture = reportClient([report("protected", "2026-10-13T10:00:00.000Z")]);
    const learner: AdminActor = { id: "learner-1", email: "learner@parle.test", role: "user" };

    await assert.rejects(
      () => dispatchWithAdminAccess("admin_list_reported_content", learner, () =>
        adminListReportedContentAction(fixture.client, learner)),
      isAdminRequired,
    );
    await assert.rejects(
      () => dispatchWithAdminAccess("admin_resolve_practice_report", learner, () =>
        adminResolvePracticeReportAction(fixture.client, learner, {
          report_id: "protected",
          resolution: "fixed",
          note: "Must not reach the data layer.",
        })),
      isAdminRequired,
    );

    assert.equal(fixture.operations.reads, 0);
    assert.equal(fixture.operations.updates.length, 0);
    assert.equal(fixture.operations.auditAttempts, 0);
  });

  it("reports an audit failure honestly after saving the selected status", async () => {
    const fixture = reportClient([report("audit-fails", "2026-10-13T09:00:00.000Z")], { failAudit: true });
    const response = await dispatchWithAdminAccess("admin_resolve_practice_report", ADMIN, () =>
      adminResolvePracticeReportAction(fixture.client, ADMIN, {
        report_id: "audit-fails",
        resolution: "fixed",
        note: "Corrected the exercise wording.",
      }));

    assert.equal(response.status, "partial");
    assert.equal(response.audit_status, "failed");
    assert.equal(response.audit_error_code, "AUDIT_WRITE_FAILED");
    assert.equal(response.report.status, "fixed");
    assert.equal(fixture.rows[0].status, "fixed");
    assert.equal(fixture.operations.auditAttempts, 1);
    assert.equal(fixture.operations.audits.length, 0);
  });
});
