import { readFileSync, writeFileSync } from "node:fs";

export const ACCOUNTS_FILE = "C:/Users/AgentDev/.gstack/projects/Parle/test-accounts.txt";
export type Account = { label: string; email: string; password: string };

export function readAccounts(path = ACCOUNTS_FILE): Account[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(/\s+/))
    .filter((p) => p.length >= 3)
    .map(([label, email, password]) => ({ label, email, password }));
}

export function replacePassword(label: string, password: string, path = ACCOUNTS_FILE, emailIfNew?: string): void {
  const text = readFileSync(path, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  let found = false;
  const out = lines.map((l) => {
    const p = l.trim().split(/\s+/);
    if (!l.trim().startsWith("#") && p[0] === label && p.length >= 3) {
      found = true;
      return `${p[0]} ${p[1]} ${password}`;
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
