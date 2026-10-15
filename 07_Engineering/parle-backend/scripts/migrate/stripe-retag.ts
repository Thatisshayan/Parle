import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { readSecret } from "../lib/secrets";
import type { ExportBundle } from "./types";

/**
 * Stripe tags each subscription and customer with metadata.user_id = the Buildy user id. After the move that id is
 * the person's new login id, so the server's re-check with Stripe can match the migrated row (Review Focus 5).
 * Changes only a tag that still holds the old Buildy id; sandbox keys only. Never prints Stripe ids or the key.
 */
export async function retagStripe(target: { url: string; serviceKey: string }, bundle: ExportBundle, stripeKey = readSecret("STRIPE_SECRET_KEY")) {
  if (!/^(sk|rk)_test_/.test(stripeKey)) throw new Error("retagStripe runs with a Stripe sandbox key only");
  const db = createClient(target.url, target.serviceKey, { auth: { persistSession: false } });
  const headers = { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" };
  const problems: string[] = [];
  let changed = 0;
  for (const old of bundle.rows.Subscriber ?? []) {
    const label = String(old.email ?? old.created_by ?? "a subscriber");
    const { data: row } = await db.from("Subscriber").select("user_id").eq("id", String(old.id)).maybeSingle();
    const oldId = String(old.user_id ?? ""), newId = String(row?.user_id ?? "");
    if (!newId || newId === oldId) { problems.push(`${label}: migrated row missing or not mapped`); continue; }
    for (const [kind, id] of [["subscriptions", old.stripe_subscription_id], ["customers", old.stripe_customer_id]] as const) {
      if (typeof id !== "string" || !id) continue;
      const url = `https://api.stripe.com/v1/${kind}/${encodeURIComponent(id)}`;
      const got = await fetch(url, { headers });
      if (!got.ok) { problems.push(`${label}: Stripe ${kind} read failed (${got.status})`); continue; }
      const obj = (await got.json()) as any;
      const tag = obj.metadata?.user_id;
      if (tag === newId) continue;
      // a tag from an earlier practice run is replaced only when Stripe itself confirms the object is this person's
      const owned = kind === "customers" ? obj.email === old.email : obj.customer === old.stripe_customer_id;
      if (tag !== oldId && !owned) { problems.push(`${label}: Stripe ${kind} tag is neither the old nor the new id; left alone`); continue; }
      const put = await fetch(url, { method: "POST", headers, body: new URLSearchParams({ "metadata[user_id]": newId }) });
      if (!put.ok) { problems.push(`${label}: Stripe ${kind} update failed (${put.status})`); continue; }
      changed++;
    }
  }
  return { changed, problems };
}

if (import.meta.main) {
  // usage: bun stripe-retag.ts <bundle.json> local
  const [file, where] = process.argv.slice(2);
  if (where !== "local") throw new Error("only the local target is enabled here");
  const { LOCAL_URL, localKeys } = await import("../../tests/helpers/local");
  const r = await retagStripe({ url: LOCAL_URL, serviceKey: localKeys().service }, JSON.parse(readFileSync(file, "utf8")));
  console.log(`changed ${r.changed}; problems: ${r.problems.length ? r.problems.join("; ") : "none"}`);
}
