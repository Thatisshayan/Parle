import { readFileSync, readdirSync } from "node:fs";
import type { BuildyRow, ExportBundle, PersonMap, TransformReport } from "./types";

const ENTITY_DIR = `${import.meta.dir}/../../../parle-app/entities`;
type Prop = { type: "string" | "number" | "boolean" | "array" };
const SCHEMA: Record<string, Record<string, Prop>> = Object.fromEntries(
  readdirSync(ENTITY_DIR).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), JSON.parse(readFileSync(`${ENTITY_DIR}/${f}`, "utf8")).properties ?? {}]),
);
const SYSTEM = ["id", "created_at", "updated_at", "created_by"];
/** Columns that hold a person's Buildy user id; mapped to the new login id. */
export const PERSON_ID_COLUMNS = ["user_id", "learner_user_id", "tutor_user_id", "actor_user_id", "updated_by"];
const BUILDY_HOST = /buildy\.(ai|show|work)|ellprnxjjzatijdxcogk/i;

function convertValue(type: Prop["type"], v: unknown): unknown {
  if (v === undefined) return undefined;
  if (type === "number") return v === "" || v === null ? null : Number(v);
  if (type === "boolean") return v === "" || v === null ? null : v === true || v === "true" || v === "True";
  if (type === "array") {
    if (typeof v === "string") {
      try { return JSON.parse(v); } catch { return []; }
    }
    return v ?? [];
  }
  return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
}

/** One Buildy row in the shape of our table (spec section 4: same names; real number/boolean/array types). */
export function convertRow(entity: string, row: BuildyRow): Record<string, unknown> {
  const props = SCHEMA[entity];
  if (!props) throw new Error(`unknown entity ${entity}`);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SYSTEM.includes(k)) out[k] = v;
    else if (props[k]) {
      const c = convertValue(props[k].type, v);
      if (c !== undefined) out[k] = c;
    }
  }
  return out;
}

/** Replaces Buildy user ids with the new login ids; unknown ids are reported, never guessed (Review Focus 1). */
export function mapPersonIds(entity: string, row: Record<string, unknown>, people: PersonMap, report: Pick<TransformReport, "unknownPersonIds">) {
  const out = { ...row };
  for (const col of PERSON_ID_COLUMNS) {
    const v = out[col];
    if (typeof v !== "string" || !v) continue;
    const hit = people.get(v);
    if (hit) out[col] = hit.newId;
    else report.unknownPersonIds.push({ entity, id: String(row.id), column: col, value: v });
  }
  return out;
}

/** Buildy kept one usage row per AI message; our backend keeps one "daily-total" row per learner and day. */
export function aggregateUsage(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const key = `${r.user_id}|${r.period}|${r.period_key}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()]
    .map((g): Record<string, unknown> => {
      const first = [...g].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
      return { ...first, ai_messages: g.length, source_session_id: "daily-total", source_event_id: "" };
    })
    .sort((a, b) => String(a.period_key).localeCompare(String(b.period_key)));
}

/** The whole export in our tables' shape, with owners set from created_by, plus a report of anything doubtful. */
export function transformBundle(bundle: ExportBundle, people: PersonMap) {
  const report: TransformReport = { unknownPersonIds: [], ownerless: [], buildyHosts: [], usageMerged: { from: 0, to: 0 } };
  const byEmail = new Map([...people.values()].map((p) => [p.email.toLowerCase(), p.newId]));
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const [entity, rows] of Object.entries(bundle.rows)) {
    let out = rows.map((r) => mapPersonIds(entity, convertRow(entity, r), people, report));
    if (entity === "usage_counter") {
      report.usageMerged.from = out.length;
      out = aggregateUsage(out);
      report.usageMerged.to = out.length;
    }
    tables[entity] = out.map((r) => {
      const email = typeof r.created_by === "string" ? r.created_by.toLowerCase() : "";
      const owner = email ? byEmail.get(email) ?? null : null;
      if (email && !owner) report.ownerless.push({ entity, id: String(r.id), created_by: email });
      for (const [k, v] of Object.entries(r)) if (typeof v === "string" && BUILDY_HOST.test(v)) report.buildyHosts.push({ entity, id: String(r.id), column: k });
      return { ...r, owner_id: owner };
    });
  }
  return { tables, report };
}
