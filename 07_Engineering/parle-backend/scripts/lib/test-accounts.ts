import { readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";

export const ACCOUNTS_FILE = "C:/Users/AgentDev/.gstack/projects/Parle/test-accounts.txt";
export type Account = { label: string; email: string; password: string };

/**
 * Lines are either `label email password` or `date email password notes...` (older format).
 * The label is the email alias after "+" when present, otherwise the first field.
 */
function parseLine(line: string): { account: Account; passwordIndex: number; fields: string[] } | null {
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;
  const fields = t.split(/\s+/);
  const emailIndex = fields.findIndex((f) => f.includes("@"));
  if (emailIndex < 0 || emailIndex + 1 >= fields.length) return null;
  const email = fields[emailIndex];
  const alias = email.match(/\+([^@]+)@/)?.[1];
  const label = alias ?? fields[0];
  return { account: { label, email, password: fields[emailIndex + 1] }, passwordIndex: emailIndex + 1, fields };
}

export function readAccounts(path = ACCOUNTS_FILE): Account[] {
  return readFileSync(path, "utf8").split(/\r?\n/).map(parseLine).filter((p) => p !== null).map((p) => p!.account);
}

export function replacePassword(label: string, password: string, path = ACCOUNTS_FILE, emailIfNew?: string): void {
  const text = readFileSync(path, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  let found = false;
  const out = lines.map((l) => {
    const p = parseLine(l);
    if (p && p.account.label === label) {
      found = true;
      p.fields[p.passwordIndex] = password;
      return p.fields.join(" ");
    }
    return l;
  });
  if (!found) {
    if (!emailIfNew) throw new Error(`No account with label ${label}`);
    if (out[out.length - 1] === "") out.splice(out.length - 1, 0, `${label} ${emailIfNew} ${password}`);
    else out.push(`${label} ${emailIfNew} ${password}`);
  }
  writeFileSync(path, out.join(eol));
}

/** Pending passwords live in a side file (`<accounts>.pending`) until a sign-in confirms them (review finding 8). */
const pendingPath = (path: string) => `${path}.pending`;

export function readPending(path = ACCOUNTS_FILE): Account[] {
  try { return readAccounts(pendingPath(path)); } catch { return []; }
}

const formatLines = (accounts: Account[]) => accounts.map((a) => `${a.label} ${a.email} ${a.password}`).join("\n") + "\n";

export function savePending(label: string, email: string, password: string, path = ACCOUNTS_FILE): void {
  const others = readPending(path).filter((a) => a.label !== label);
  const tmp = `${pendingPath(path)}.tmp`;
  writeFileSync(tmp, formatLines([...others, { label, email, password }]));
  renameSync(tmp, pendingPath(path));
}

export function promotePending(label: string, path = ACCOUNTS_FILE): void {
  const pending = readPending(path);
  const hit = pending.find((a) => a.label === label);
  if (!hit) throw new Error(`No pending password for ${label}`);
  replacePassword(label, hit.password, path, hit.email);
  const rest = pending.filter((a) => a.label !== label);
  if (rest.length) writeFileSync(pendingPath(path), formatLines(rest));
  else rmSync(pendingPath(path), { force: true });
}
