import { sendMail } from "../email.ts";
import { escapeHtml } from "../lessons/mail-copy.ts";
import { appUrl } from "../lessons/notify.ts";

/**
 * Administrators' alerts (spec section 7: failed transfers, chargebacks; also reversals outside Parle and problem
 * reports): an email to each address in ADMIN_ALERT_EMAIL. Never throws; the Payouts screen shows the same items.
 */
export async function alertAdmins(subject: string, lines: string[], key: string): Promise<void> {
  console.warn("payout alert:", subject);
  const to = (Deno.env.get("ADMIN_ALERT_EMAIL") ?? "").split(",").map((s) => s.trim()).filter((s) => s.includes("@"));
  for (const address of to) {
    await sendMail({
      to: address,
      subject: `Parle payouts: ${subject}`,
      html: `${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}<p><a href="${appUrl()}/admin/payouts">Open the Payouts screen</a></p>`,
      idempotencyKey: `payout-alert:${key}:${address}`,
    }).catch((e) => console.warn("payout alert email failed", (e as Error).message));
  }
}
