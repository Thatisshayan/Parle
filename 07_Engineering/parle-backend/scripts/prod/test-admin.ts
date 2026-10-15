import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

/** The production test admin lives only on an AgentMail check alias (decision #52), never a real person's address. */
export function assertCheckAlias(email: string): void {
  if (!/^obsidianteamhq\+[a-z0-9-]+@agentmail\.to$/.test(email)) throw new Error(`not an AgentMail check alias: ${email}`);
}

/** Adds or replaces one password in the flat { email: password } secrets map; every other entry is kept. */
export function savePassword(file: string, email: string, password: string): void {
  const map = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, string>) : {};
  map[email] = password;
  writeFileSync(`${file}.tmp`, JSON.stringify(map, null, 1));
  renameSync(`${file}.tmp`, file);
}
