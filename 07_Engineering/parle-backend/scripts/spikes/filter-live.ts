import { writeFileSync, mkdirSync } from "node:fs";
import { readAccounts } from "../lib/test-accounts";
import { signIn, BUILDY_API, BUILDY_APP_ID, BUILDY_ORIGIN } from "../buildy/client";

const acc = readAccounts().find((a) => a.label === "m3imm")!;
const s = await signIn(acc.email, acc.password);
const H = { Authorization: `Bearer ${s.accessToken}`, "X-App-ID": BUILDY_APP_ID, Origin: BUILDY_ORIGIN };
async function q(query: unknown, sort?: string, limit?: number, skip?: number) {
  const p = new URLSearchParams({ q: JSON.stringify(query) });
  if (sort) p.set("sort", sort);
  if (limit) p.set("limit", String(limit));
  if (skip) p.set("skip", String(skip));
  const r = await fetch(`${BUILDY_API}/apps/${BUILDY_APP_ID}/entities/learner_task?${p}`, { headers: H });
  return r.ok ? ((await r.json()) as any[]).map((x) => x.id) : [`HTTP ${r.status}`];
}
const cases = [
  { name: "all", query: {} },
  { name: "equals string", query: { status: "done" } },
  { name: "not equal", query: { status: { $ne: "done" } } },
  { name: "number gte", query: { minutes: { $gte: 20 } } },
  { name: "in list", query: { skill: { $in: ["reading", "speaking"] } } },
  { name: "missing field equals null", query: { completed_at_utc: null } },
  { name: "sort ascending", query: {}, sort: "minutes" },
  { name: "sort descending", query: {}, sort: "-created_at" },
  { name: "sort unknown field", query: {}, sort: "no_such_field" },
  { name: "limit and skip", query: {}, sort: "created_at", limit: 3, skip: 2 },
] as { name: string; query: unknown; sort?: string; limit?: number; skip?: number }[];
const out = [];
for (const c of cases) out.push({ ...c, expectedIds: await q(c.query, c.sort, c.limit, c.skip) });
mkdirSync("tests/fixtures", { recursive: true });
writeFileSync("tests/fixtures/filter-cases.json", JSON.stringify(out, null, 2));
for (const c of out) console.log(`${c.name}: ${c.expectedIds.length} rows${String(c.expectedIds[0] ?? "").startsWith("HTTP") ? " " + c.expectedIds[0] : ""}`);
