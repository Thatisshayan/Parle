import type { LessonContext } from "../lessons/actions.ts";
import { LessonError } from "../lessons/errors.ts";
import { dashboardLink, joinWaitlist, startOnboarding } from "./accounts.ts";
import { tutorEarnings } from "./earnings.ts";
import { adminListPayouts, adminRefund, adminRefundAfterPayout, adminRelease, adminSplit } from "./admin.ts";

type Handler = (ctx: LessonContext) => Promise<Record<string, unknown>>;

/** Every payout action, by name (spec section 7). Task 7 adds the administrator's decisions. */
export const PAYOUT_ACTIONS: Record<string, Handler> = {
  tutor_earnings: tutorEarnings,
  tutor_payout_onboarding: startOnboarding,
  tutor_payout_waitlist: joinWaitlist,
  tutor_payout_dashboard: dashboardLink,
  admin_list_payouts: adminListPayouts,
  admin_release_payout: adminRelease,
  admin_refund_payout: adminRefund,
  admin_split_payout: adminSplit,
  admin_refund_after_payout: adminRefundAfterPayout,
};

export async function runPayoutAction(ctx: LessonContext): Promise<Record<string, unknown>> {
  const handler = PAYOUT_ACTIONS[String(ctx.body.action ?? "")];
  if (!handler) throw new LessonError("UNKNOWN_ACTION", 400);
  return await handler(ctx);
}
