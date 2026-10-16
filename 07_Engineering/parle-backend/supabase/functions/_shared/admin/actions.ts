import { AdminError, type AdminContext } from "./context.ts";
import { accountsOverview, inviteAdministrator, removeAdministrator } from "./administrators.ts";
import { cancelPausedLessons, disableAccount, enableAccount, pausedLessons } from "./accounts.ts";
import { userDetail } from "./detail.ts";
import { adminMetrics } from "./metrics.ts";
import { deleteWaitlist, markUnsubscribed, preview, retryFailed, saveAddress, saveBlanks, sendTest, startSend, waitlistOverview } from "../waitlist/admin.ts";

type Handler = (ctx: AdminContext) => Promise<Record<string, unknown>>;

/** Every Plan 8 administrator action, by name. */
export const ADMIN_ACTIONS: Record<string, Handler> = {
  admin_accounts_overview: accountsOverview,
  admin_invite_admin: inviteAdministrator,
  admin_remove_admin: removeAdministrator,
  admin_disable_account: disableAccount,
  admin_enable_account: enableAccount,
  admin_cancel_paused_lessons: cancelPausedLessons,
  admin_paused_lessons: pausedLessons,
  admin_user_detail: userDetail,
  admin_metrics: adminMetrics,
  admin_waitlist_overview: waitlistOverview,
  admin_waitlist_save_blanks: saveBlanks,
  admin_waitlist_save_address: saveAddress,
  admin_waitlist_preview: preview,
  admin_waitlist_send_test: sendTest,
  admin_waitlist_start: startSend,
  admin_waitlist_retry_failed: retryFailed,
  admin_waitlist_mark_unsubscribed: markUnsubscribed,
  admin_waitlist_delete: deleteWaitlist,
  // Plan 8: later tasks add their actions above this line.
};

export async function runAdminAction(ctx: AdminContext): Promise<Record<string, unknown>> {
  const handler = ADMIN_ACTIONS[String(ctx.body.action ?? "")];
  if (!handler) throw new AdminError("UNKNOWN_ACTION", 400);
  return await handler(ctx);
}
