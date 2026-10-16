import { AdminError, type AdminContext } from "./context.ts";
import { accountsOverview, inviteAdministrator, removeAdministrator } from "./administrators.ts";

type Handler = (ctx: AdminContext) => Promise<Record<string, unknown>>;

/** Every Plan 8 administrator action, by name. */
export const ADMIN_ACTIONS: Record<string, Handler> = {
  admin_accounts_overview: accountsOverview,
  admin_invite_admin: inviteAdministrator,
  admin_remove_admin: removeAdministrator,
  // Plan 8: later tasks add their actions above this line.
};

export async function runAdminAction(ctx: AdminContext): Promise<Record<string, unknown>> {
  const handler = ADMIN_ACTIONS[String(ctx.body.action ?? "")];
  if (!handler) throw new AdminError("UNKNOWN_ACTION", 400);
  return await handler(ctx);
}
