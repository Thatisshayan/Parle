import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { loadBundle } from "../scripts/migrate/load";
import { verifyLoad } from "../scripts/migrate/verify";
import { existsSync, readFileSync } from "node:fs";
import { latestMail, tokenHashFrom } from "./helpers/mailpit";
import { callFunction } from "./helpers/functions-env";
import { sendSetPasswordMail } from "../scripts/migrate/set-password-mail";
import { retagStripe } from "../scripts/migrate/stripe-retag";
import { readSecret } from "../scripts/lib/secrets";
import * as auth from "../../parle-app/src/lib/backend/auth";

describe("migration verifier", () => {
  it("passes a clean load and flags rows without an owner (Review Focus 1)", async () => {
    const email = `ver-${crypto.randomUUID()}@example.test`, buildyId = crypto.randomUUID();
    const rows = Array.from({ length: 3 }, () => ({ id: crypto.randomUUID(), user_id: buildyId, created_by: email, status: "planned" }));
    const bundle = { exportedAt: "t", people: [{ buildyId, email, fullName: null, buildyRole: "user" as const }], rows: { learner_task: rows } };
    const target = { url: LOCAL_URL, serviceKey: localKeys().service };
    const res = await loadBundle(target, bundle, { adminEmail: "n@x" });
    const good = await verifyLoad(target, bundle, res);
    expect(good.ok).toBe(true);
    const db = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
    await db.from("learner_task").update({ owner_id: null }).eq("id", rows[0].id);
    const bad = await verifyLoad(target, bundle, res);
    expect(bad.ok).toBe(false);
    expect(bad.lines.join("\n")).toContain("without an owner");
  }, 30000);
  it("fails when a person id has no account", async () => {
    const email = `ver2-${crypto.randomUUID()}@example.test`, buildyId = crypto.randomUUID();
    const rows = [{ id: crypto.randomUUID(), user_id: "someone-unknown", created_by: email, status: "planned" }];
    const bundle = { exportedAt: "t", people: [{ buildyId, email, fullName: null, buildyRole: "user" as const }], rows: { learner_task: rows } };
    const target = { url: LOCAL_URL, serviceKey: localKeys().service };
    const res = await loadBundle(target, bundle, { adminEmail: "n@x" });
    const v = await verifyLoad(target, bundle, res);
    expect(v.ok).toBe(false);
    expect(v.lines.join("\n")).toContain("person ids without an account: 1");
  }, 30000);
  it("judges only the exported rows, and content written by Buildy's AI needs no owner", async () => {
    const email = `ver3-${crypto.randomUUID()}@example.test`, buildyId = crypto.randomUUID();
    const db = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
    const code = `R-T-${crypto.randomUUID().slice(0, 6)}`;
    // rows already in the database that are not part of this export: a same-code question and an ownerless row by the same person
    await db.from("question_item").insert([{ demo_code: code, created_by: "ai" }, { demo_code: "other", created_by: email }]);
    const q = { id: crypto.randomUUID(), demo_code: code, created_by: "ai", options: [{ id: "a" }, { id: "b" }] };
    const bundle = { exportedAt: "t", people: [{ buildyId, email, fullName: null, buildyRole: "user" as const }], rows: { question_item: [q] } };
    const target = { url: LOCAL_URL, serviceKey: localKeys().service };
    const res = await loadBundle(target, bundle, { adminEmail: "n@x" });
    const v = await verifyLoad(target, bundle, res, undefined, [code]);
    expect(v.lines.filter((l) => l.startsWith("FAIL"))).toEqual([]);
    expect(v.lines.join("\n")).toContain(`${code} keeps its options`);
  }, 30000);
});

const REAL_BUNDLE = "D:/AgentDevWork/parle-migration-data/export-20261015-0515/bundle.json";
// Rehearsal only (PARLE_REHEARSAL=1 on a database reset without seed): the real export's question bank would
// duplicate the seeded bank that the placement tests rely on.
describe.skipIf(!existsSync(REAL_BUNDLE) || process.env.PARLE_REHEARSAL !== "1")("real export", () => {
  it("the paying learner is still Premium after migration and a set-password (Review Focus 5)", async () => {
    const bundle = JSON.parse(readFileSync(REAL_BUNDLE, "utf8"));
    const target = { url: LOCAL_URL, serviceKey: localKeys().service };
    const owner = bundle.people.find((p: any) => p.buildyRole === "administrator").email;
    await loadBundle(target, bundle, { adminEmail: owner });
    // Stripe still tags the subscription with the Buildy user id; the move re-tags it with the new login id
    const retag = await retagStripe(target, bundle);
    expect(retag.problems).toEqual([]);
    expect((await retagStripe(target, bundle)).changed).toBe(0);
    // a tag left by an earlier practice run (an id from another database) is replaced, since Stripe confirms the person
    const sub = bundle.rows.Subscriber[0];
    const key = readSecret("STRIPE_SECRET_KEY");
    for (const kind of ["subscriptions", "customers"]) {
      const id = kind === "subscriptions" ? sub.stripe_subscription_id : sub.stripe_customer_id;
      await fetch(`https://api.stripe.com/v1/${kind}/${id}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ "metadata[user_id]": crypto.randomUUID() }) });
    }
    expect(await retagStripe(target, bundle)).toEqual({ changed: 2, problems: [] });
    const email = "obsidianteamhq+m3imm@agentmail.to";
    const since = new Date(Date.now() - 2000).toISOString();
    await sendSetPasswordMail(target, email, "http://127.0.0.1:5173", "mailpit");
    const anon = () => createClient(LOCAL_URL, localKeys().anon, { auth: { persistSession: false } });
    const password = `Rehearsal-${crypto.randomUUID().slice(0, 8)}1`;
    await auth.resetWithToken(anon(), tokenHashFrom((await latestMail(email, since)).html), password);
    const c = anon();
    const { data } = await c.auth.signInWithPassword({ email, password });
    const r = await callFunction("parle-assessment-service", data.session!.access_token, { action: "tutor_get_plan_summary" });
    expect(r.status).toBe(200);
    expect(r.body.summary.plan_tier).toBe("premium");
  }, 60000);
});
