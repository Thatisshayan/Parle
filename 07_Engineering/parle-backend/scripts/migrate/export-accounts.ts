import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { listAll, signIn } from "../buildy/client";
import { readAccounts } from "../lib/test-accounts";
import type { BuildyRow, Person } from "./types";

/** The six Buildy test accounts; each can read only its own rows (Plan 1 readability report). */
export const ACCOUNT_LABELS = ["m3cit", "m3imm", "m5tut1", "imm1", "learner1", "tutor1"];
const ENTITY_DIR = `${import.meta.dir}/../../../parle-app/entities`;
export const ENTITIES = readdirSync(ENTITY_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
export const DATA_ROOT = "D:/AgentDevWork/parle-migration-data";

export function newExportDir(): string {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;
  const dir = `${DATA_ROOT}/export-${stamp}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Reads every entity as each test account; passwords come only from the accounts file. */
export async function exportAccounts(dir: string) {
  const accounts = readAccounts().filter((a) => ACCOUNT_LABELS.includes(a.label));
  const missing = ACCOUNT_LABELS.filter((l) => !accounts.some((a) => a.label === l));
  if (missing.length) throw new Error(`accounts file lacks: ${missing.join(", ")}`);
  const people: Person[] = [];
  const rows: Record<string, BuildyRow[]> = {};
  const manifest: Record<string, Record<string, number | string>> = {};
  for (const account of accounts) {
    const session = await signIn(account.email, account.password); // throws with the account's email on failure
    people.push({ buildyId: session.userId, email: session.email, fullName: session.fullName ?? null, buildyRole: session.role === "administrator" ? "administrator" : "user" });
    manifest[account.label] = {};
    for (const entity of ENTITIES) {
      const result = await listAll(session, entity);
      if (!result.readable) { manifest[account.label][entity] = `unreadable ${result.status}`; continue; }
      manifest[account.label][entity] = result.rows.length;
      rows[entity] = [...(rows[entity] ?? []), ...result.rows];
    }
  }
  writeFileSync(`${dir}/accounts.json`, JSON.stringify({ people, rows }, null, 1));
  writeFileSync(`${dir}/manifest.json`, JSON.stringify({ accounts: manifest }, null, 1));
  return { people, rows, manifest };
}

if (import.meta.main) {
  const dir = process.argv[2] ?? newExportDir();
  const { manifest } = await exportAccounts(dir);
  const totals = Object.fromEntries(Object.entries(manifest).map(([label, m]) => [label, Object.values(m).filter((v) => typeof v === "number").reduce((a, b) => a + (b as number), 0)]));
  console.log(`export dir: ${dir}`);
  console.log("rows per account:", JSON.stringify(totals));
}
