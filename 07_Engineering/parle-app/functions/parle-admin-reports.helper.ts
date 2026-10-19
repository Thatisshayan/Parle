import {
  AdminActionError,
  assertAdministrator,
  type AdminActor,
  writeAdminAudit,
} from "./parle-admin-settings.helper.ts";

export const ADMIN_REPORTED_CONTENT_PAGE_SIZE = 200;
export const ADMIN_REPORT_RESOLUTION_NOTE_LIMIT = 1000;

const REPORT_FIELDS = ["id", "task_id", "task_key", "note", "reported_at_utc", "status"];

export type AdminReportedContentStatus =
  | "open"
  | "fixed"
  | "dismissed"
  | "reviewed"
  | "closed"
  | "unknown";
export type PracticeReportResolution = "fixed" | "dismissed";

export interface AdminReportedContentRow {
  id: string;
  task_id: string;
  task_key: string;
  note: string;
  reported_at_utc: string;
  status: AdminReportedContentStatus;
}

type ReportRecord = Record<string, unknown> & { id?: unknown };
type PracticeReportEntity = {
  filter: (...args: unknown[]) => Promise<unknown>;
  update?: (id: string, data: Record<string, unknown>) => Promise<unknown>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function reportEntity(client: unknown, requiredMethods: Array<"filter" | "update">): PracticeReportEntity {
  if (!isObject(client) || !isObject(client.entities)) {
    throw new AdminActionError("REPORTS_UNAVAILABLE", 503);
  }
  const entity = client.entities.practice_report;
  if (!isObject(entity) || requiredMethods.some((method) => typeof entity[method] !== "function")) {
    throw new AdminActionError("REPORTS_UNAVAILABLE", 503);
  }
  return entity as unknown as PracticeReportEntity;
}

function reportRecords(response: unknown): ReportRecord[] {
  const candidate = Array.isArray(response)
    ? response
    : isObject(response) && Array.isArray(response.data)
      ? response.data
      : null;
  if (!candidate || candidate.some((value) => !isObject(value))) {
    throw new AdminActionError("REPORTS_READ_FAILED", 503);
  }
  return candidate as ReportRecord[];
}

function savedText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function displayedStatus(value: unknown): AdminReportedContentStatus {
  if (value === "new" || value === "open") return "open";
  if (value === "fixed" || value === "dismissed" || value === "reviewed" || value === "closed") return value;
  return "unknown";
}

function toAdminReportedContentRow(row: ReportRecord): AdminReportedContentRow {
  return {
    id: savedText(row.id),
    task_id: savedText(row.task_id),
    task_key: savedText(row.task_key),
    note: savedText(row.note),
    reported_at_utc: savedText(row.reported_at_utc),
    status: displayedStatus(row.status),
  };
}

function reportTime(row: ReportRecord): number {
  const time = Date.parse(savedText(row.reported_at_utc));
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function newestFirst(left: ReportRecord, right: ReportRecord): number {
  const leftTime = reportTime(left);
  const rightTime = reportTime(right);
  if (leftTime !== rightTime) return rightTime > leftTime ? 1 : -1;
  return savedText(right.id).localeCompare(savedText(left.id));
}

async function readAllReports(client: unknown): Promise<ReportRecord[]> {
  const entity = reportEntity(client, ["filter"]);
  const allRows: ReportRecord[] = [];
  const seenIds = new Set<string>();
  let offset = 0;

  while (true) {
    let response: unknown;
    try {
      response = await entity.filter(
        {},
        "-reported_at_utc",
        ADMIN_REPORTED_CONTENT_PAGE_SIZE,
        offset,
        REPORT_FIELDS,
      );
    } catch (error) {
      console.error("Parle administrator practice reports could not be read", error instanceof Error ? error.name : "unknown");
      throw new AdminActionError("REPORTS_READ_FAILED", 503);
    }

    const page = reportRecords(response);
    if (page.length > ADMIN_REPORTED_CONTENT_PAGE_SIZE) {
      throw new AdminActionError("REPORTS_READ_FAILED", 503);
    }
    for (const row of page) {
      const id = savedText(row.id);
      if (!id || seenIds.has(id)) throw new AdminActionError("REPORTS_READ_FAILED", 503);
      seenIds.add(id);
    }
    allRows.push(...page);
    if (page.length < ADMIN_REPORTED_CONTENT_PAGE_SIZE) break;
    offset += page.length;
  }

  return allRows.sort(newestFirst);
}

function resolutionNote(value: unknown): string {
  if (typeof value !== "string") throw new AdminActionError("REPORT_NOTE_REQUIRED", 400);
  const note = value
    .replace(/\r\n?/g, "\n")
// eslint-disable-next-line no-control-regex -- Intentional control-character validation or stripping for untrusted text.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
  if (!note) throw new AdminActionError("REPORT_NOTE_REQUIRED", 400);
  if (note.length > ADMIN_REPORT_RESOLUTION_NOTE_LIMIT) {
    throw new AdminActionError("REPORT_NOTE_TOO_LONG", 400);
  }
  return note;
}

export async function adminListReportedContentAction(
  client: unknown,
  actor: AdminActor,
): Promise<{
  status: "complete";
  reports: AdminReportedContentRow[];
  count: number;
  open_count: number;
}> {
  assertAdministrator(actor);
  const rows = await readAllReports(client);
  const reports = rows.map(toAdminReportedContentRow);
  return {
    status: "complete",
    reports,
    count: reports.length,
    open_count: reports.filter((report) => report.status === "open").length,
  };
}

export async function adminResolvePracticeReportAction(
  client: unknown,
  actor: AdminActor,
  input: { report_id?: unknown; resolution?: unknown; note?: unknown },
): Promise<{
  status: "complete" | "partial";
  report: AdminReportedContentRow;
  audit_status: "written" | "failed";
  audit_error_code?: string;
}> {
  assertAdministrator(actor);

  const reportId = typeof input.report_id === "string" ? input.report_id.trim() : "";
  if (!reportId || reportId.length > 160) throw new AdminActionError("REPORT_ID_INVALID", 400);
  if (input.resolution !== "fixed" && input.resolution !== "dismissed") {
    throw new AdminActionError("REPORT_RESOLUTION_INVALID", 400);
  }
  const resolution = input.resolution as PracticeReportResolution;
  const note = resolutionNote(input.note);
  const entity = reportEntity(client, ["filter", "update"]);

  let matches: ReportRecord[];
  try {
    matches = reportRecords(await entity.filter({ id: reportId }, "-reported_at_utc", 10, 0, REPORT_FIELDS));
  } catch (error) {
    if (error instanceof AdminActionError) throw error;
    console.error("Parle administrator practice report could not be loaded", error instanceof Error ? error.name : "unknown");
    throw new AdminActionError("REPORTS_READ_FAILED", 503);
  }
  const report = matches.find((row) => savedText(row.id) === reportId);
  if (!report) throw new AdminActionError("REPORT_NOT_FOUND", 404);
  const previousStatus = savedText(report.status);
  if (previousStatus !== "new" && previousStatus !== "open") {
    throw new AdminActionError("REPORT_NOT_OPEN", 409);
  }

  try {
    await entity.update!(reportId, { status: resolution });
  } catch (error) {
    console.error("Parle administrator practice report could not be resolved", { reportId, error });
    throw new AdminActionError("REPORT_SAVE_FAILED", 503);
  }

  try {
    await writeAdminAudit(client, actor, {
      action: "practice_report.resolved",
      target_type: "practice_report",
      target_id: reportId,
      old_value: { status: previousStatus },
      new_value: { status: resolution, note },
    });
  } catch (error) {
    const code = error instanceof AdminActionError ? error.code : "AUDIT_WRITE_FAILED";
    console.error("Parle practice report status was saved without its audit entry", { reportId, code });
    return {
      status: "partial",
      report: toAdminReportedContentRow({ ...report, status: resolution }),
      audit_status: "failed",
      audit_error_code: code,
    };
  }

  return {
    status: "complete",
    report: toAdminReportedContentRow({ ...report, status: resolution }),
    audit_status: "written",
  };
}
