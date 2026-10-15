import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { transformBundle } from "./transform";
import type { ExportBundle, PersonMap } from "./types";

const PROTECTED_TABLES = new Set(["waitlist_signup"]);

/**
 * Loads one export into a target project (spec section 9): one confirmed login per person, created WITHOUT a
 * password (they set one from the emailed link), then every row upserted by its Buildy id, so a repeat is harmless.
 */
export async function loadBundle(target: { url: string; serviceKey: string }, bundle: ExportBundle, opts: { adminEmail: string | string[] }) {
  // one or more administrators (founder: obsidianmedia.yt@gmail.com, with room for a second)
  const admins = new Set((Array.isArray(opts.adminEmail) ? opts.adminEmail : [opts.adminEmail]).map((e) => e.trim().toLowerCase()).filter(Boolean));
  for (const t of Object.keys(bundle.rows)) if (PROTECTED_TABLES.has(t)) throw new Error(`refusing to write ${t}`);
  // Review Focus 1: a row naming someone outside the export stops the load before any login or row is written
  const dryRun: PersonMap = new Map(bundle.people.map((p) => [p.buildyId, { newId: p.buildyId, email: p.email }]));
  const unknown = transformBundle(bundle, dryRun).report.unknownPersonIds;
  if (unknown.length) throw new Error(`${unknown.length} rows name someone who is not in the export; nothing was loaded`);
  const db = createClient(target.url, target.serviceKey, { auth: { persistSession: false } });
  const existing = new Map<string, string>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email) existing.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 1000) break;
  }
  const identities = (bundle.rows.ParleIdentity ?? []) as Record<string, unknown>[];
  const roleOf = (email: string) => (admins.has(email.toLowerCase())
    ? "admin"
    // Buildy let people write their own identity row: only learner or tutor is taken from it, never admin
    : (identities.find((r) => String(r.created_by).toLowerCase() === email.toLowerCase())?.role === "tutor" ? "tutor" : "learner"));
  const people: PersonMap = new Map();
  let created = 0, reused = 0;
  for (const p of bundle.people) {
    let id = existing.get(p.email.toLowerCase());
    if (id) reused++;
    else {
      const { data, error } = await db.auth.admin.createUser({ email: p.email, email_confirm: true, user_metadata: { full_name: p.fullName ?? "" }, app_metadata: { role: roleOf(p.email) } });
      if (error) throw error;
      id = data.user.id;
      created++;
    }
    people.set(p.buildyId, { newId: id, email: p.email });
  }
  let adminsCreated = 0;
  const inExport = new Set(bundle.people.map((p) => p.email.toLowerCase()));
  for (const email of admins) {
    const id = existing.get(email);
    if (!id && !inExport.has(email)) {
      const { error } = await db.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "admin" } });
      if (error) throw error;
      adminsCreated++;
    } else if (id) {
      const { error } = await db.auth.admin.updateUserById(id, { app_metadata: { role: "admin" } });
      if (error) throw error;
    }
  }
  const { tables, report } = transformBundle(bundle, people);
  const rows: Record<string, number> = {};
  for (const [table, list] of Object.entries(tables)) {
    // settings are one row per key: a key that already exists (seeded or set earlier) is given Buildy's id first,
    // so the upsert below overwrites it with Buildy's value (nothing references setting ids)
    if (table === "app_setting") {
      for (const r of list) {
        if (!r.key) continue;
        const { error } = await db.from("app_setting").update({ id: r.id }).eq("key", r.key).neq("id", r.id);
        if (error) throw new Error(`app_setting ${r.key}: ${error.message}`);
      }
    }
    // rows already loaded are left untouched: an update would re-stamp updated_at (trigger) and break checks such as
    // "reviewed profile is still the latest". Settings are overwritten so Buildy's value wins over a seeded key.
    const ignoreDuplicates = table !== "app_setting";
    for (let i = 0; i < list.length; i += 200) {
      const { error } = await db.from(table).upsert(list.slice(i, i + 200), { onConflict: "id", ignoreDuplicates });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    rows[table] = list.length;
  }
  return { created, reused, adminsCreated, rows, report };
}

if (import.meta.main) {
  // usage: bun load.ts <bundle.json> <admin email> [local]   (production target is wired in Task 7)
  const [file, adminEmail, where] = process.argv.slice(2);
  if (!file || !adminEmail) throw new Error("usage: bun load.ts <bundle.json> <admin email> local");
  if (where !== "local") throw new Error("only the local target is enabled here");
  const { LOCAL_URL, localKeys } = await import("../../tests/helpers/local");
  const bundle = JSON.parse(readFileSync(file, "utf8")) as ExportBundle;
  const res = await loadBundle({ url: LOCAL_URL, serviceKey: localKeys().service }, bundle, { adminEmail });
  console.log(`logins created ${res.created}, reused ${res.reused}`);
  console.log("rows:", JSON.stringify(res.rows));
  console.log("report:", JSON.stringify({ unknown: res.report.unknownPersonIds.length, ownerless: res.report.ownerless.length, buildyHosts: res.report.buildyHosts.length, usage: res.report.usageMerged }));
}
