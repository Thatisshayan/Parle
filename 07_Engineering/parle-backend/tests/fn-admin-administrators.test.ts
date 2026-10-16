import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { onboardedLearner } from "./helpers/learners";
import { latestMail } from "./helpers/mailpit";
import { adminCall, adminUser, psql } from "./helpers/admin";

const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const meta = async (id: string) => (await service().auth.admin.getUserById(id)).data.user!.app_metadata as Record<string, unknown>;

describe("administrators (spec 3.3)", () => {
  it("only an owner invites; a new address gets an administrator login and the set-password email", async () => {
    const owner = await adminUser({ owner: true });
    const plain = await adminUser();
    const { t: learnerToken } = await onboardedLearner();
    const email = `inv-${crypto.randomUUID()}@example.test`;
    const since = new Date(Date.now() - 2000).toISOString();
    expect((await adminCall(plain.token, "admin_invite_admin", { email })).body.error_code).toBe("OWNER_REQUIRED");
    expect((await adminCall(learnerToken, "admin_invite_admin", { email })).body.error_code).toBe("ADMIN_REQUIRED");
    const r = await adminCall(owner.token, "admin_invite_admin", { email: ` ${email.toUpperCase()} ` });
    expect(r.status).toBe(200);
    expect(r.body.invited).toMatchObject({ email, existing_account: false, mail_sent: true });
    expect(await meta(r.body.invited.id)).toMatchObject({ role: "admin" });
    expect(typeof (await meta(r.body.invited.id)).admin_since).toBe("string");
    const mail = await latestMail(email, since);
    expect(mail.subject).toBe("Set your password for Parle");
    expect(mail.html).toContain("/reset-password?token=");
    expect(mail.html).not.toContain("\u2014");
    expect(psql(`select action || '|' || actor_label from public.admin_audit_log where target_id = '${r.body.invited.id}'`)).toBe(`admin.invited|${owner.email}`);
    expect((await adminCall(owner.token, "admin_invite_admin", { email })).body.error_code).toBe("ALREADY_ADMIN");
    expect((await adminCall(owner.token, "admin_invite_admin", { email: "not-an-address" })).body.error_code).toBe("EMAIL_INVALID");
  }, 30000);

  it("an existing learner is promoted and keeps their data; the overview shows the owner and the administrators", async () => {
    const owner = await adminUser({ owner: true });
    const { u } = await onboardedLearner();
    const r = await adminCall(owner.token, "admin_invite_admin", { email: u.email });
    expect(r.body.invited).toMatchObject({ id: u.id, existing_account: true });
    expect((await meta(u.id)).role).toBe("admin");
    expect(psql(`select count(*) from public.learner_profile where user_id = '${u.id}'`)).toBe("1");
    const o = await adminCall(owner.token, "admin_accounts_overview");
    expect(o.body.me).toEqual({ id: owner.id, owner: true });
    expect(o.body.admins.find((a: any) => a.id === owner.id)).toMatchObject({ owner: true });
    expect(o.body.admins.find((a: any) => a.id === u.id)).toMatchObject({ owner: false, since_known: true });
    const plain = await adminUser();
    expect((await adminCall(plain.token, "admin_accounts_overview")).body.me).toEqual({ id: plain.id, owner: false });
  }, 30000);

  it("remove: the account becomes a learner; refused for oneself and for an owner (the last owner stays)", async () => {
    const owner = await adminUser({ owner: true });
    const other = await adminUser();
    const r = await adminCall(owner.token, "admin_remove_admin", { user_id: other.id });
    expect(r.status).toBe(200);
    const after = await meta(other.id);
    expect(after.role).toBe("learner");
    expect(after.owner ?? null).toBeNull();
    expect(psql(`select count(*) from auth.sessions where user_id = '${other.id}'`)).toBe("0");
    expect(psql(`select action from public.admin_audit_log where target_id = '${other.id}' and action = 'admin.removed'`)).toBe("admin.removed");
    expect((await adminCall(owner.token, "admin_remove_admin", { user_id: owner.id })).body.error_code).toBe("CANNOT_REMOVE_SELF");
    const second = await adminUser({ owner: true });
    expect((await adminCall(second.token, "admin_remove_admin", { user_id: owner.id })).body.error_code).toBe("OWNER_CANNOT_BE_REMOVED");
    expect(await meta(owner.id)).toMatchObject({ role: "admin", owner: true });
    expect((await adminCall(owner.token, "admin_remove_admin", { user_id: other.id })).body.error_code).toBe("NOT_ADMIN");
    expect((await adminCall(owner.token, "admin_nothing")).body.error_code).toBe("UNKNOWN_ACTION");
  }, 30000);
});
