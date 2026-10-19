import { sendMail } from "../email.ts";
import { appUrl } from "../lessons/notify.ts";
import { takeRateLimit } from "../rate-limit.ts";
import { isPaused } from "../account-status.ts";
import { AdminError, allUsers, audit, authUser, isOwner, ownerOnly, targetUserId, type AdminContext } from "./context.ts";
import { adminInviteMail, adminPromotedMail } from "./invite-mail.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const warn = (e: unknown) => console.warn("administrator email failed", e instanceof Error ? e.name : "unknown");

/** The Administrators section (visible to every admin; actions only for owners) and the paused accounts. */
export async function accountsOverview(ctx: AdminContext): Promise<Record<string, unknown>> {
  const users = await allUsers(ctx.db);
  const admins = users.filter((u) => (u.app_metadata as Record<string, unknown> | undefined)?.role === "admin").map((u) => {
    const meta = (u.app_metadata ?? {}) as Record<string, unknown>;
    const known = typeof meta.admin_since === "string";
    return {
      id: u.id, email: u.email ?? "", name: String((u.user_metadata as Record<string, unknown> | undefined)?.full_name ?? ""), owner: isOwner(u),
      admin_since: known ? String(meta.admin_since) : u.created_at, since_known: known, last_sign_in_at: u.last_sign_in_at ?? null,
    };
  }).sort((a, b) => Number(b.owner) - Number(a.owner) || a.email.localeCompare(b.email));
  const { data, error } = await ctx.db.from("account_status").select("user_id, reason, lessons_choice, changed_by, changed_at").eq("status", "disabled").limit(5000);
  if (error) throw new Error(error.message);
  const paused = Object.fromEntries((data ?? []).map((r) => [r.user_id, { reason: r.reason, changed_by: r.changed_by, changed_at: r.changed_at, lessons_choice: r.lessons_choice }]));
  return { me: { id: ctx.caller.id, owner: ctx.caller.owner === true }, admins, paused };
}

/** Spec 3.3: an existing account is promoted; an unknown address gets an admin login and the set-password email. */
export async function inviteAdministrator(ctx: AdminContext): Promise<Record<string, unknown>> {
  ownerOnly(ctx);
  const email = String(ctx.body.email ?? "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) throw new AdminError("EMAIL_INVALID", 400, "Enter a valid email address.");
  if (!(await takeRateLimit(ctx.db, `admin-invite:${ctx.caller.id}`, 3600, 20))) throw new AdminError("RATE_LIMITED", 429, "Too many invitations. Try again in an hour.");
  const since = ctx.now.toISOString();
  const existing = (await allUsers(ctx.db)).find((u) => (u.email ?? "").toLowerCase() === email);
  if (existing) {
    const before = String((existing.app_metadata as Record<string, unknown> | undefined)?.role ?? "learner");
    if (before === "admin") throw new AdminError("ALREADY_ADMIN", 409, "This person is already an administrator.");
    if (await isPaused(ctx.db, existing.id)) throw new AdminError("ACCOUNT_PAUSED", 409, "This account is paused. Enable it first.");
    // the role before is kept, so removing the administrator role gives it back (Plan 8 review, Important 4)
    const { error } = await ctx.db.auth.admin.updateUserById(existing.id, { app_metadata: { role: "admin", admin_since: since, role_before_admin: before } });
    if (error) throw new Error(error.message);
    await audit(ctx, { action: "admin.invited", targetType: "user", targetId: existing.id, oldValue: { role: before }, newValue: { role: "admin", existing_account: true } });
    const mailSent = await sendMail({ ...adminPromotedMail({ inviter: ctx.caller.email, appUrl: appUrl() }), to: email, from: "automatic" }).then(() => true, (e) => { warn(e); return false; });
    return { invited: { id: existing.id, email, existing_account: true, mail_sent: mailSent } };
  }
  const { data, error } = await ctx.db.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "admin", admin_since: since } });
  if (error || !data?.user) throw new Error(error?.message ?? "the login could not be created");
  await audit(ctx, { action: "admin.invited", targetType: "user", targetId: data.user.id, oldValue: null, newValue: { role: "admin", existing_account: false } });
  // The one-time link proves the person controls the address (the flow used for the test admin, decision #52).
  let mailSent = false;
  const link = await ctx.db.auth.admin.generateLink({ type: "recovery", email });
  if (link.error) warn(link.error);
  else {
    const url = `${appUrl()}/reset-password?token=${encodeURIComponent(link.data.properties.hashed_token)}`;
    mailSent = await sendMail({ ...adminInviteMail({ inviter: ctx.caller.email, link: url }), to: email, from: "automatic" }).then(() => true, (e) => { warn(e); return false; });
  }
  return { invited: { id: data.user.id, email, existing_account: false, mail_sent: mailSent } };
}

/** Spec 3.3: the account goes back to the role it had before (a learner if it had none). Never oneself, never an owner. */
export async function removeAdministrator(ctx: AdminContext): Promise<Record<string, unknown>> {
  ownerOnly(ctx);
  const id = targetUserId(ctx);
  if (id === ctx.caller.id) throw new AdminError("CANNOT_REMOVE_SELF", 409, "You cannot remove your own administrator role.");
  const user = await authUser(ctx, id);
  if ((user.app_metadata as Record<string, unknown> | undefined)?.role !== "admin") throw new AdminError("NOT_ADMIN", 409, "This account is not an administrator.");
  if (isOwner(user)) throw new AdminError("OWNER_CANNOT_BE_REMOVED", 409, "An owner cannot be removed here.");
  const previous = (user.app_metadata as Record<string, unknown> | undefined)?.role_before_admin;
  const role = previous === "tutor" ? "tutor" : "learner";
  const { error } = await ctx.db.auth.admin.updateUserById(id, { app_metadata: { role, owner: null, admin_since: null, role_before_admin: null } });
  if (error) throw new Error(error.message);
  const ended = await ctx.db.rpc("account_end_sessions", { p_user: id });
  if (ended.error) console.warn("sessions could not be ended", "database_error");
  await audit(ctx, { action: "admin.removed", targetType: "user", targetId: id, oldValue: { role: "admin" }, newValue: { role } });
  return { removed: { id } };
}
