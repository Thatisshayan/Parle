import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { ExportBundle, TransformReport } from "./types";

type LoadResult = { rows: Record<string, number>; report: TransformReport };

/** Checks a load against its export (spec section 9). Every line starts with "ok" or "FAIL". */
export async function verifyLoad(target: { url: string; serviceKey: string }, bundle: ExportBundle, res: LoadResult, waitlistBefore?: number, optionCodes = ["R-A2-01"]) {
  const db = createClient(target.url, target.serviceKey, { auth: { persistSession: false } });
  const lines: string[] = [];
  const check = (ok: boolean, text: string) => lines.push(`${ok ? "ok" : "FAIL"} ${text}`);
  const emails = bundle.people.map((p) => p.email);
  for (const [table, expected] of Object.entries(res.rows)) {
    // usage_counter rows were merged; the merged rows keep one of their source ids, so counting by source id works for every table
    const ids = (bundle.rows[table] ?? []).map((r) => String(r.id));
    let found = 0, ownerless = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const { count, error } = await db.from(table).select("id", { count: "exact", head: true }).in("id", chunk);
      if (error) throw new Error(`${table}: ${error.message}`);
      found += count ?? 0;
      // only exported rows are judged; rows already in the database are not this load's
      if (emails.length) ownerless += (await db.from(table).select("id", { count: "exact", head: true }).in("id", chunk).in("created_by", emails).is("owner_id", null)).count ?? 0;
    }
    check(found === expected, `${table}: ${found} of ${expected} rows`);
    check(ownerless === 0, `${table}: ${ownerless} migrated rows without an owner`);
  }
  check(res.report.unknownPersonIds.length === 0, `person ids without an account: ${res.report.unknownPersonIds.length}`);
  // content Buildy wrote itself ("ai", "anonymous", ...) has no owner by design; only an email creator needs an account
  const byPerson = res.report.ownerless.filter((o) => o.created_by.includes("@"));
  check(byPerson.length === 0, `rows whose creator has no account: ${byPerson.length}`);
  const byBuildy = res.report.ownerless.length - byPerson.length;
  if (byBuildy) lines.push(`ok ${byBuildy} rows written by Buildy itself (no owner by design)`);
  check(res.report.buildyHosts.length === 0, `values pointing at Buildy hosts: ${res.report.buildyHosts.length}`);
  const total = async (t: string) => (await db.from(t).select("id", { count: "exact", head: true })).count ?? 0;
  if (bundle.rows.question_item?.length) check(await total("question_item") >= bundle.rows.question_item.length, `question bank: ${await total("question_item")} items`);
  if (bundle.rows.prompt_item?.length) check(await total("prompt_item") >= bundle.rows.prompt_item.length, `prompt bank: ${await total("prompt_item")} prompts`);
  if (bundle.rows.app_setting?.length) check(await total("app_setting") >= bundle.rows.app_setting.length, `settings: ${await total("app_setting")} rows`);
  for (const code of optionCodes) {
    const row = bundle.rows.question_item?.find((r) => r.demo_code === code);
    if (!row) continue;
    const { data } = await db.from("question_item").select("options").eq("id", String(row.id)).maybeSingle();
    const options = typeof data?.options === "string" ? JSON.parse(data.options) : data?.options;
    check(Array.isArray(options) && options.length >= 2, `${code} keeps its options`);
  }
  if (bundle.rows.Subscriber?.length) {
    const ids = bundle.rows.Subscriber.map((r) => String(r.id));
    const { data } = await db.from("Subscriber").select("stripe_status, cache_signature").in("id", ids);
    check((data ?? []).length === ids.length && (data ?? []).every((r: any) => r.stripe_status && r.cache_signature), "subscription cache rows carry status and signature");
  }
  if (bundle.rows.availability_rule?.length) check(await total("availability_rule") >= bundle.rows.availability_rule.length, "tutor availability present");
  if (waitlistBefore !== undefined) {
    const { count: after } = await db.from("waitlist_signup").select("*", { count: "exact", head: true });
    check(after === waitlistBefore, `waitlist unchanged (${waitlistBefore} -> ${after})`);
  }
  return { ok: !lines.some((l) => l.startsWith("FAIL")), lines };
}

if (import.meta.main) {
  // usage: bun verify.ts <bundle.json> <admin email> local|prod  -> loads (idempotent) then verifies
  const [file, adminEmail, where] = process.argv.slice(2);
  if (where !== "local" && where !== "prod") throw new Error("target must be local or prod");
  const { loadBundle } = await import("./load");
  let target: { url: string; serviceKey: string };
  if (where === "prod") {
    const { PROD_REF, serviceKey } = await import("../prod/management");
    target = { url: `https://${PROD_REF}.supabase.co`, serviceKey: await serviceKey(PROD_REF) };
  } else {
    const { LOCAL_URL, localKeys } = await import("../../tests/helpers/local");
    target = { url: LOCAL_URL, serviceKey: localKeys().service };
  }
  const db = createClient(target.url, target.serviceKey, { auth: { persistSession: false } });
  const waitlistBefore = (await db.from("waitlist_signup").select("*", { count: "exact", head: true })).count ?? 0;
  const bundle = JSON.parse(readFileSync(file, "utf8")) as ExportBundle;
  const res = await loadBundle(target, bundle, { adminEmail: adminEmail.split(",") });
  const v = await verifyLoad(target, bundle, res, waitlistBefore);
  console.log(v.lines.join("\n"));
  console.log(v.ok ? "VERIFIED" : "VERIFICATION FAILED");
}
