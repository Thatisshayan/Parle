import { sendMail } from "../email.ts";
import { appUrl } from "../lessons/notify.ts";
import { lessonSettings } from "../lessons/settings.ts";
import { takeRateLimit } from "../rate-limit.ts";
import { AdminError, audit, ownerOnly, plainText, type AdminContext } from "../admin/context.ts";
import { blanksProblem, isCampaign, renderWaitlistMail, type Blanks, type Campaign } from "./copy.ts";
import { ADDRESS_KEY, postalAddress, unsubscribeHeaders, unsubscribeLinks } from "./config.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROBLEM_MESSAGES: Record<string, string> = {
  LAUNCH_DATE_INVALID: "Write the launch date (3 to 60 characters), for example Monday, November 2.",
  PARAGRAPH_REQUIRED: "Write your personal paragraph (at least 20 characters).",
  PARAGRAPH_TOO_LONG: "Keep the personal paragraph under 1,500 characters.",
};

function campaignOf(ctx: AdminContext): Campaign {
  if (!isCampaign(ctx.body.campaign)) throw new AdminError("CAMPAIGN_INVALID", 400, "Choose the founding-tutor email or the launch email.");
  return ctx.body.campaign;
}
function blanksOf(value: unknown): Blanks {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return { launch_date: plainText(v.launch_date, 60).replace(/\n/g, " "), personal_paragraph: plainText(v.personal_paragraph, 1500) };
}
function check(campaign: Campaign, blanks: Blanks, forSend: boolean) {
  const problem = blanksProblem(campaign, blanks, forSend);
  if (problem) throw new AdminError(problem, 400, PROBLEM_MESSAGES[problem]);
}
async function storedBlanks(ctx: AdminContext, campaign: Campaign): Promise<Blanks> {
  const { data, error } = await ctx.db.from("waitlist_campaign").select("blanks").eq("campaign", campaign).single();
  if (error) throw new Error(error.message);
  return blanksOf(data.blanks);
}
/** The page's preview and test send (real sends are rendered in send.ts): missing blanks and address show as brackets. */
async function render(ctx: AdminContext, campaign: Campaign, blanks: Blanks, test: boolean, role: string, goal: string) {
  const [address, settings, links] = await Promise.all([postalAddress(ctx.db), lessonSettings(ctx.db), unsubscribeLinks(ctx.caller.email)]);
  const shown: Blanks = test ? blanks : { launch_date: blanks.launch_date || "[launch date]", personal_paragraph: blanks.personal_paragraph || "[your personal paragraph]" };
  const mail = renderWaitlistMail(campaign, shown, { email: ctx.caller.email, role, goal, joinedOn: ctx.now.toISOString().slice(0, 10) }, {
    appUrl: appUrl(), unsubscribeUrl: links.page, postalAddress: address || "[the sender's postal address, not set yet]", test,
    foundingCommissionPercent: settings.founding_commission_percent, commissionPercent: settings.commission_percent,
  });
  return { mail, links };
}

/** Spec 4.3: counts, both campaigns, failures with their reason, the address and where the emails link to. */
export async function waitlistOverview(ctx: AdminContext): Promise<Record<string, unknown>> {
  const { data, error } = await ctx.db.rpc("waitlist_overview");
  if (error) throw new Error(error.message);
  const url = appUrl();
  return { ...(data as Record<string, unknown>), postal_address: await postalAddress(ctx.db), app_url: url, app_url_public: url === "https://parle.buzz", me_owner: ctx.caller.owner === true };
}

export async function saveBlanks(ctx: AdminContext): Promise<Record<string, unknown>> {
  const campaign = campaignOf(ctx);
  const blanks = blanksOf(ctx.body.blanks);
  check(campaign, blanks, false);
  const { count, error: countError } = await ctx.db.from("waitlist_send").select("id", { count: "exact", head: true }).eq("campaign", campaign).eq("status", "queued");
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) throw new AdminError("BLANKS_LOCKED", 409, "Wait until this campaign's emails have gone out before changing the text.");
  const before = await storedBlanks(ctx, campaign);
  const { error } = await ctx.db.from("waitlist_campaign").update({ blanks, updated_at: ctx.now.toISOString() }).eq("campaign", campaign);
  if (error) throw new Error(error.message);
  await audit(ctx, { action: "waitlist.blanks_saved", targetType: "waitlist_campaign", targetId: campaign, oldValue: before, newValue: blanks });
  return { blanks };
}

export async function saveAddress(ctx: AdminContext): Promise<Record<string, unknown>> {
  const address = plainText(ctx.body.address, 300).replace(/\s*\n\s*/g, ", ");
  if (address.length < 10) throw new AdminError("ADDRESS_INVALID", 400, "Write the full postal address (10 to 300 characters).");
  const before = await postalAddress(ctx.db);
  const { error } = await ctx.db.rpc("save_setting_with_audit", {
    p_key: ADDRESS_KEY, p_value: JSON.stringify(address), p_updated_by: ctx.caller.email, p_owner: ctx.caller.id, p_created_by: ctx.caller.email,
    p_audit: {
      actor_user_id: ctx.caller.id, actor_label: ctx.caller.email, action: "waitlist.address_saved", target_type: "app_setting", target_id: ADDRESS_KEY,
      old_value: JSON.stringify(before), new_value: JSON.stringify(address), occurred_at_utc: ctx.now.toISOString(),
    },
  });
  if (error) throw new Error(error.message);
  return { postal_address: address };
}

export async function preview(ctx: AdminContext): Promise<Record<string, unknown>> {
  const campaign = campaignOf(ctx);
  const role = campaign === "founding_tutor" || ctx.body.role === "tutor" ? "tutor" : "learner";
  const { mail } = await render(ctx, campaign, blanksOf(ctx.body.blanks), false, role, typeof ctx.body.goal === "string" ? ctx.body.goal : "immigration");
  return { subject: mail.subject, html: mail.html };
}

/** "Send test to me": the signed-in administrator's own address, marked TEST (spec 4.3). Works without the address. */
export async function sendTest(ctx: AdminContext): Promise<Record<string, unknown>> {
  const campaign = campaignOf(ctx);
  const blanks = blanksOf(ctx.body.blanks);
  check(campaign, blanks, false);
  if (!(await takeRateLimit(ctx.db, `waitlist-test:${ctx.caller.id}`, 3600, 20))) throw new AdminError("RATE_LIMITED", 429, "Too many test emails. Try again in an hour.");
  const role = campaign === "founding_tutor" || ctx.body.role === "tutor" ? "tutor" : "learner";
  const { mail, links } = await render(ctx, campaign, blanks, true, role, typeof ctx.body.goal === "string" ? ctx.body.goal : "immigration");
  await sendMail({ to: ctx.caller.email, subject: mail.subject, html: mail.html, text: mail.text, from: "people", headers: unsubscribeHeaders(links.oneClick) });
  await audit(ctx, { action: "waitlist.test_sent", targetType: "waitlist_campaign", targetId: campaign, oldValue: null, newValue: { to: ctx.caller.email } });
  return { sent_to: ctx.caller.email };
}

/** Send after typing SEND (spec 4.3): blanks and the postal address must be set; queues only people not yet queued. */
export async function startSend(ctx: AdminContext): Promise<Record<string, unknown>> {
  const campaign = campaignOf(ctx);
  if (ctx.body.confirm !== "SEND") throw new AdminError("CONFIRMATION_REQUIRED", 400, "Type SEND to confirm.");
  check(campaign, await storedBlanks(ctx, campaign), true);
  if (!(await postalAddress(ctx.db))) throw new AdminError("ADDRESS_REQUIRED", 409, "Add the sender's postal address first. The law requires it in every email.");
  const { data, error } = await ctx.db.rpc("waitlist_queue", { p_campaign: campaign, p_by: ctx.caller.email });
  if (error) throw new Error(error.message);
  await audit(ctx, { action: "waitlist.campaign_started", targetType: "waitlist_campaign", targetId: campaign, oldValue: null, newValue: { queued: data } });
  return { queued: data };
}

export async function retryFailed(ctx: AdminContext): Promise<Record<string, unknown>> {
  const campaign = campaignOf(ctx);
  const { data, error } = await ctx.db.rpc("waitlist_retry_failed", { p_campaign: campaign });
  if (error) throw new Error(error.message);
  await audit(ctx, { action: "waitlist.retry_failed", targetType: "waitlist_campaign", targetId: campaign, oldValue: null, newValue: { queued: data } });
  return { queued: data };
}

/** An emailed request to unsubscribe (spec 4.5): recorded with source "admin". */
export async function markUnsubscribed(ctx: AdminContext): Promise<Record<string, unknown>> {
  const email = String(ctx.body.email ?? "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) throw new AdminError("EMAIL_INVALID", 400, "Enter a valid email address.");
  const { data, error } = await ctx.db.rpc("waitlist_record_unsubscribe", { p_email: email, p_source: "admin" });
  if (error) throw new Error(error.message);
  await audit(ctx, { action: "waitlist.unsubscribed_by_admin", targetType: "waitlist_unsubscribe", targetId: email, oldValue: null, newValue: { result: data } });
  return { result: data };
}

/** Spec 4.6: owner only, after the launch campaign has finished, after typing DELETE. */
export async function deleteWaitlist(ctx: AdminContext): Promise<Record<string, unknown>> {
  ownerOnly(ctx);
  if (ctx.body.confirm !== "DELETE") throw new AdminError("CONFIRMATION_REQUIRED", 400, "Type DELETE to confirm.");
  const { data, error } = await ctx.db.rpc("waitlist_delete_all", { p_actor: ctx.caller.id, p_label: ctx.caller.email });
  if (error) throw new Error(error.message);
  const result = data as { status: string; signups?: number; send_records_cleared?: number };
  if (result.status !== "deleted") throw new AdminError("LAUNCH_NOT_FINISHED", 409, "The list can be deleted only after the launch email has gone out to everyone.");
  return { signups: result.signups, send_records_cleared: result.send_records_cleared };
}
