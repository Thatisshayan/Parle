import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import type { BuildyRow, ExportBundle, Person } from "./types";

const BROWSE = `${homedir()}/.claude/skills/gstack/browse/src/cli.ts`;
const REPO = "D:/AgentDevWork/repos/Parle"; // gstack must run from the repo to reach the signed-in browser

function browse(args: string[]): string {
  const out = Bun.spawnSync(["bun", BROWSE, ...args], { cwd: REPO });
  return out.stdout.toString();
}

/** Runs owner-export.js in the owner's Buildy tab (checked by address first) and returns its JSON. */
export function exportOwner(tabId: string) {
  const href = browse(["js", "location.href", "--tab-id", tabId]).trim().split("\n").pop() ?? "";
  if (!href.includes("yuircx1jlz5bpg1jbv2th")) throw new Error(`tab ${tabId} is not the Parle Buildy preview (${href})`);
  const raw = browse(["eval", `${import.meta.dir}/owner-export.js`, "--tab-id", tabId]);
  const line = raw.split("\n").find((l) => l.trim().startsWith("{\"me\""));
  if (!line) throw new Error("owner export returned no data");
  return JSON.parse(line) as { me: { id: string; email: string; full_name: string | null }; rows: Record<string, BuildyRow[]>; notes: Record<string, unknown> };
}

const newer = (a: BuildyRow, b: BuildyRow) => String(a.updated_at ?? "") >= String(b.updated_at ?? "") ? a : b;

/** Accounts + owner, deduplicated by id (latest updated_at wins); the owner is the administrator. */
export function mergeBundle(accounts: { people: Person[]; rows: Record<string, BuildyRow[]> }, owner: ReturnType<typeof exportOwner>): ExportBundle {
  const rows: Record<string, BuildyRow[]> = {};
  for (const source of [accounts.rows, owner.rows]) {
    for (const [entity, list] of Object.entries(source)) {
      const byId = new Map((rows[entity] ?? []).map((r) => [String(r.id), r]));
      for (const r of list) { const prev = byId.get(String(r.id)); byId.set(String(r.id), prev ? newer(prev, r) : r); }
      rows[entity] = [...byId.values()];
    }
  }
  const people = [...accounts.people.filter((p) => p.email.toLowerCase() !== owner.me.email.toLowerCase()),
    { buildyId: owner.me.id, email: owner.me.email, fullName: owner.me.full_name, buildyRole: "administrator" as const }];
  return { exportedAt: new Date().toISOString(), people, rows };
}

if (import.meta.main) {
  const [dir, tabId] = [process.argv[2], process.argv[3]];
  if (!dir || !tabId) throw new Error("usage: bun export-owner.ts <export dir> <owner tab id>");
  const owner = exportOwner(tabId);
  writeFileSync(`${dir}/owner.json`, JSON.stringify(owner, null, 1));
  const accounts = JSON.parse(readFileSync(`${dir}/accounts.json`, "utf8"));
  const bundle = mergeBundle(accounts, owner);
  writeFileSync(`${dir}/bundle.json`, JSON.stringify(bundle, null, 1));
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8"));
  manifest.owner = Object.fromEntries(Object.entries(owner.rows).map(([k, v]) => [k, owner.notes[k] ? `unreadable ${owner.notes[k]}` : v.length]));
  manifest.bundle = Object.fromEntries(Object.entries(bundle.rows).map(([k, v]) => [k, v.length]));
  writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 1));
  console.log(`people: ${bundle.people.length}; rows: ${Object.values(bundle.rows).reduce((n, v) => n + v.length, 0)}`);
  console.log("bundle counts:", JSON.stringify(manifest.bundle));
}
