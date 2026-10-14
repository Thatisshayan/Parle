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
  if (!value) throw new Error(`Secret file is empty: ${path}`);
  return value;
}
