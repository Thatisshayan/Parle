import { readFileSync } from "node:fs";
import { LOCAL_URL, localKeys } from "./local";

let cached: Record<string, string> | null = null;
/** The local function settings written by scripts/setup-local-functions-env.ts (values stay in memory, never printed). */
export function functionsEnv(): Record<string, string> {
  if (cached) return cached;
  const text = readFileSync(`${import.meta.dir}/../../supabase/functions/.env`, "utf8");
  cached = Object.fromEntries(text.split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  return cached;
}

/** POST to a local Edge Function the way the browser does. */
export async function callFunction(name: string, token: string | null, body: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(`${LOCAL_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: localKeys().anon, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { status: r.status, body: parsed };
}
