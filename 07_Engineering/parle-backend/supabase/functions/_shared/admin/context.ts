import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import type { Caller } from "../caller.ts";
import type { LessonPayments } from "../lessons/payments.ts";

export type AdminContext = { db: SupabaseClient; payments: LessonPayments; caller: Caller; body: Record<string, any>; now: Date };

/** A refusal the administrator can act on: a code the app translates, an HTTP status and a plain message. */
export class AdminError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message = code) {
    super(message);
    this.name = "AdminError";
    this.code = code;
    this.status = status;
  }
}

/** Owner-only actions are checked here, on the server (spec 5). */
export function ownerOnly(ctx: AdminContext): void {
  if (!ctx.caller.owner) throw new AdminError("OWNER_REQUIRED", 403, "Only an owner can do this.");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function targetUserId(ctx: AdminContext): string {
  const id = String(ctx.body.user_id ?? "");
  if (!UUID.test(id)) throw new AdminError("USER_NOT_FOUND", 404, "This account was not found.");
  return id;
}

/** Text from the page: control characters removed (line breaks kept), trimmed, at most `max` characters. */
export function plainText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, max);
}

/** One admin_audit_log row per administrator action (spec 5: every admin action audited). */
export async function audit(ctx: AdminContext, e: { action: string; targetType: string; targetId: string; oldValue: unknown; newValue: unknown }): Promise<void> {
  const { error } = await ctx.db.from("admin_audit_log").insert({
    actor_user_id: ctx.caller.id, actor_label: ctx.caller.email, action: e.action, target_type: e.targetType, target_id: e.targetId,
    old_value: JSON.stringify(e.oldValue ?? null), new_value: JSON.stringify(e.newValue ?? null), occurred_at_utc: ctx.now.toISOString(),
    owner_id: ctx.caller.id, created_by: ctx.caller.email,
  });
  if (error) throw new Error(error.message);
}

export async function authUser(ctx: AdminContext, id: string): Promise<User> {
  const { data, error } = await ctx.db.auth.admin.getUserById(id);
  if (error || !data?.user) throw new AdminError("USER_NOT_FOUND", 404, "This account was not found.");
  return data.user;
}

/** Every login, page by page. */
export async function allUsers(db: SupabaseClient): Promise<User[]> {
  const out: User[] = [];
  for (let page = 1; page < 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    out.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return out;
}

const meta = (u: User) => (u.app_metadata ?? {}) as Record<string, unknown>;
export const roleOf = (u: User): "admin" | "learner" | "tutor" => (meta(u).role === "admin" ? "admin" : meta(u).role === "tutor" ? "tutor" : "learner");
export const isOwner = (u: User): boolean => meta(u).role === "admin" && meta(u).owner === true;
