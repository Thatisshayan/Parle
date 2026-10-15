import { existsSync } from "node:fs";
import { join } from "node:path";
import { readSecret } from "../lib/secrets";

export const PROD_REF = "hcphvipeplkfenugikrf";
const API = "https://api.supabase.com";

/** The founder's Supabase access token: env var, the CLI's saved token, or the secrets folder. Never printed. */
export function managementToken(): string {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  const cli = join(process.env.USERPROFILE ?? "", ".supabase", "access-token");
  return readSecret(existsSync(cli) ? cli : "SUPABASE_ACCESS_TOKEN");
}

/** Management API call; errors carry the status and path, never the token. */
export async function api(path: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${managementToken()}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

export const runSql = (ref: string, query: string) => api(`/v1/projects/${ref}/database/query`, { method: "POST", body: JSON.stringify({ query }) });

/** The service-role key, kept in memory only. */
export async function serviceKey(ref: string): Promise<string> {
  const keys = (await api(`/v1/projects/${ref}/api-keys?reveal=true`)) as Array<{ name: string; api_key: string }>;
  const k = keys.find((x) => x.name === "service_role")?.api_key;
  if (!k) throw new Error("service_role key not returned");
  return k;
}

export type Migration = { version: string; name: string; file: string };

/** Migration files not yet in the history, in version order. */
export function pendingMigrations(files: string[], applied: string[]): Migration[] {
  const done = new Set(applied);
  return files
    .map((file) => { const m = file.match(/^(\d{14})_(.+)\.sql$/); return m ? { version: m[1], name: m[2], file } : null; })
    .filter((m): m is Migration => !!m && !done.has(m.version))
    .sort((a, b) => a.version.localeCompare(b.version));
}

/** One transaction: the file's statements, then its row in the migration history (as the CLI records it). */
export function migrationSql(m: Migration, body: string): string {
  const tag = "$parle_migration$";
  if (body.includes(tag)) throw new Error(`${m.file} contains ${tag}`);
  return `begin;\n${body}\n;\ninsert into supabase_migrations.schema_migrations (version, name, statements) values ('${m.version}', '${m.name}', array[${tag}${body}${tag}]);\ncommit;\n`;
}
