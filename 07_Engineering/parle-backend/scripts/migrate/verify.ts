import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { ExportBundle, TransformReport } from "./types";

type LoadResult = { rows: Record<string, number>; report: TransformReport };

/** Checks a load against its export (spec section 9). Every line starts with "ok" or "FAIL". */
export async function verifyLoad(target: { url: string; serviceKey: string }, bundle: ExportBundle, res: LoadResult, waitlistBefore?: number) {
  const db = createClient(target.url, target.serviceKey, { auth: { persistSession: false } });
  const lines: string[] = [];
  const check = (ok: boolean, text: string) => lines.push(`${ok ? "ok" : "FAIL"} ${text}`);
  const emails = bundle.people.map((p) => p.email);
  for (const [table, expected] of Object.entries(res.rows)) {
    // usage_counter rows were merged; the merged rows keep one of their source ids, so counting by source id works for every table
    const ids = (bundle.rows[table] ?? []).map((r) => String(r.id));
    let found = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const { count, error } = await db.from(table).select("id", { count: "exact", head: true }).in("id", ids.slice(i, i + 500));
      if (error) throw new Error(`${table}: ${error.message}`);
      found += count ?? 0;
    }
    check(found === expected, `${table}: ${found} of ${expected} rows`);
    if (emails.length) {
      const { count: ownerless } = await db.from(table).select("id", { count: "exact", head: true }).in("created_by", emails).is("owner_id", null);
      check((ownerless ?? 0) === 0, `${table}: ${ownerless ?? 0} migrated rows without an owner`);
    }
  }
  check(res.report.unknownPersonIds.length === 0, `person ids without an account: ${res.report.unknownPersonIds.length}`);
  check(res.report.ownerless.length === 0, `rows whose creator has no account: ${res.report.ownerless.length}`);
  check(res.report.buildyHosts.length === 0, `values pointing at Buildy hosts: ${res.report.buildyHosts.length}`);
  const total = async (t: string) => (await db.from(t).select("id", { count: "exact", head: true })).count ?? 0;
  if (bundle.rows.question_item?.length) check(await total("question_item") >= bundle.rows.question_item.length, `question bank: ${await total("question_item")} items`);
  if (bundle.rows.prompt_item?.length) check(await total("prompt_item") >= bundle.rows.prompt_item.length, `prompt bank: ${await total("prompt_item")} prompts`);
  if (bundle.rows.app_setting?.length) check(await total("app_setting") >= bundle.rows.app_setting.length, `settings: ${await total("app_setting")} rows`);
  if (bundle.rows.question_item?.some((r) => r.demo_code === "R-A2-01")) {
    const { data } = await db.from("question_item").select("options").eq("demo_code", "R-A2-01").maybeSingle();
    const options = typeof data?.options === "string" ? JSON.parse(data.options) : data?.options;
    check(Array.isArray(options) && options.length >= 2, "R-A2-01 keeps its options");
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
  // usage: bun verify.ts <bundle.json> <admin email> local  -> loads (idempotent) then verifies
  const [file, adminEmail, where] = process.argv.slice(2);
  if (where !== "local") throw new Error("only the local target is enabled here");
  const { LOCAL_URL, localKeys } = await import("../../tests/helpers/local");
  const { loadBundle } = await import("./load");
  const target = { url: LOCAL_URL, serviceKey: localKeys().service };
  const bundle = JSON.parse(readFileSync(file, "utf8")) as ExportBundle;
  const res = await loadBundle(target, bundle, { adminEmail });
  const v = await verifyLoad(target, bundle, res);
  console.log(v.lines.join("\n"));
  console.log(v.ok ? "VERIFIED" : "VERIFICATION FAILED");
}
