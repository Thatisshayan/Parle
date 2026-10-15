import { readFileSync } from "node:fs";
import { join } from "node:path";

export const SECRETS_DIR = "C:/Users/AgentDev/.parle-secrets";
export const AGENTMAIL_KEY_FILE = "C:/Users/AgentDev/Downloads/agentmail_api_key_ClaudeCode-ObsidianTeamHQ.txt";

/** Reads a secret from a file. Never logs or returns it in an error message. */
export function readSecret(nameOrPath: string): string {
  const path = nameOrPath.includes("/") || nameOrPath.includes("\\") ? nameOrPath : join(SECRETS_DIR, nameOrPath);
  let value: string;
  try {
    value = readFileSync(path, "utf8").trim();
  } catch {
    throw new Error(`Secret file not found: ${path}`);
  }
  // Accept "NAME=value" and quoted values as well as the bare value.
  const m = value.match(/^[A-Z][A-Z0-9_]*=(.*)$/s);
  if (m) value = m[1].trim();
  value = value.replace(/^(["'])(.*)\1$/s, "$2");
  if (!value) throw new Error(`Secret file is empty: ${path}`);
  return value;
}
