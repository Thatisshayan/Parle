import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sendMail } from "../email.ts";
import { appUrl } from "../lessons/notify.ts";
import { lessonSettings } from "../lessons/settings.ts";
import { isCampaign, renderWaitlistMail, type Blanks, type Campaign } from "./copy.ts";
import { postalAddress, unsubscribeHeaders, unsubscribeLinks, unsubscribeSecret } from "./config.ts";
import { failureReason, sendOutcome } from "./outcome.ts";

// A75 (R83): 30 a run, one a second, leaves room under Resend's 2 requests per second for the lesson emails
export const RUN_LIMIT = 30;
type SendRow = { id: string; campaign: string; signup_id: string; email: string | null; role: string; goal: string; joined_on: string | null; attempts: number };
export const paceMs = () => { const v = Number(Deno.env.get("WAITLIST_PACE_MS") ?? "1000"); return Number.isFinite(v) && v >= 0 ? v : 1000; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mark(db: SupabaseClient, id: string, values: Record<string, unknown>) {
  const { error } = await db.from("waitlist_send").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "queued");
  if (error) throw new Error(error.message);
}
async function release(db: SupabaseClient, row: SendRow, undoAttempt: boolean) {
  await mark(db, row.id, { claimed_at: null, ...(undoAttempt ? { attempts: Math.max(0, row.attempts - 1) } : {}) });
}
async function unsubscribed(db: SupabaseClient, email: string): Promise<boolean> {
  const { data, error } = await db.from("waitlist_unsubscribe").select("email").eq("email", email).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/**
 * Spec 4.4: up to 30 emails per run, one a second (under Resend's rate limit, with room for lesson emails; Plan 11, A75), each with the Idempotency-Key
 * waitlist:<campaign>:<signup id>, so a retried or overlapping run never delivers twice (Review Focus 2). Nothing is
 * sent while the postal address is empty. A 429 (rate or daily quota) leaves the rest queued for the next run.
 */
export async function runWaitlistJobs(db: SupabaseClient, now: Date): Promise<Record<string, number | string>> {
  // A76 (R84): a run that cannot send says why on the Waitlist page, before any row is claimed
  const stop = async (message: string, stopped: string) => {
    await db.from("waitlist_campaign").update({ last_error: message, updated_at: now.toISOString() }).not("started_at", "is", null).is("finished_at", null);
    return { sent: 0, stopped };
  };
  const address = await postalAddress(db);
  if (!address) return stop("Add the sender's postal address on the Waitlist page. Nothing was sent.", "address_missing");
  try {
    unsubscribeSecret();
  } catch {
    return stop("The unsubscribe secret (WAITLIST_UNSUBSCRIBE_SECRET) is not set on the server. Nothing was sent; sending starts again once it is set.", "secret_missing");
  }
  const { data: claimed, error } = await db.rpc("waitlist_claim", { p_limit: RUN_LIMIT });
  if (error) throw new Error(error.message);
  const rows = (claimed ?? []) as SendRow[];
  const report = { sent: 0, failed: 0, skipped: 0, deferred: 0, retry: 0 };
  if (rows.length) {
    const { data: campaigns, error: campaignError } = await db.from("waitlist_campaign").select("campaign, blanks");
    if (campaignError) throw new Error(campaignError.message);
    const blanksBy = new Map((campaigns ?? []).map((c) => [c.campaign as string, (c.blanks ?? {}) as Blanks]));
    const settings = await lessonSettings(db);
    const cleared = new Set<string>(); // A76: the first email sent per campaign clears an old error
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (i > 0) await sleep(paceMs());
      if (!row.email || !isCampaign(row.campaign)) { await mark(db, row.id, { status: "failed", claimed_at: null, error: "This address is no longer on the list." }); report.failed++; continue; }
      if (await unsubscribed(db, row.email)) { await mark(db, row.id, { status: "skipped_unsubscribed", claimed_at: null }); report.skipped++; continue; }
      const links = await unsubscribeLinks(row.email);
      const mail = renderWaitlistMail(row.campaign as Campaign, blanksBy.get(row.campaign) ?? {}, { email: row.email, role: row.role, goal: row.goal, joinedOn: row.joined_on }, {
        appUrl: appUrl(), unsubscribeUrl: links.page, postalAddress: address, test: false,
        foundingCommissionPercent: settings.founding_commission_percent, commissionPercent: settings.commission_percent,
      });
      try {
        const sent = await sendMail({
          to: row.email, subject: mail.subject, html: mail.html, text: mail.text, from: "people",
          headers: unsubscribeHeaders(links.oneClick), idempotencyKey: `waitlist:${row.campaign}:${row.signup_id}`,
        });
        await mark(db, row.id, { status: "sent", resend_id: sent.id, sent_at: new Date().toISOString(), claimed_at: null, error: "" });
        if (!cleared.has(row.campaign)) {
          cleared.add(row.campaign);
          await db.from("waitlist_campaign").update({ last_error: "" }).eq("campaign", row.campaign).neq("last_error", "");
        }
        report.sent++;
      } catch (e) {
        const status = Number(/EMAIL_SEND_FAILED (\d+)/.exec((e as Error).message)?.[1] ?? 0);
        const outcome = sendOutcome(status, row.attempts);
        if (outcome === "defer") {
          for (const rest of rows.slice(i)) await release(db, rest, true);
          await db.from("waitlist_campaign").update({ last_error: "Resend's sending limit was reached. Sending continues automatically.", updated_at: now.toISOString() }).eq("campaign", row.campaign);
          report.deferred += rows.length - i;
          break;
        }
        if (outcome === "fail") { await mark(db, row.id, { status: "failed", claimed_at: null, error: failureReason(status) }); report.failed++; }
        else { await release(db, row, false); report.retry++; }
      }
    }
  }
  const { error: refreshError } = await db.rpc("waitlist_refresh_campaigns");
  if (refreshError) throw new Error(refreshError.message);
  return report;
}
