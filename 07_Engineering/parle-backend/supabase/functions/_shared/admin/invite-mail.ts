/** Administrator emails (pure). Plain, warm, no em dashes. */
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const page = (parts: string[]) => `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1E3A8A">${parts.join("")}<p style="color:#6B7280;font-size:13px">Parle</p></div>`;

/** A new address (spec 3.3): the "Set your password for Parle" email with a one-time link. */
export function adminInviteMail(i: { inviter: string; link: string }): { subject: string; html: string } {
  return {
    subject: "Set your password for Parle",
    html: page([
      `<p>${esc(i.inviter)} added you as an administrator of Parle.</p>`,
      "<p>Choose a password to sign in to the admin console.</p>",
      `<p><a href="${esc(i.link)}">Set your password</a></p>`,
      '<p>This link works once. If it has expired, use "Forgot password" on the sign-in page.</p>',
      "<p>If you did not expect this email, you can ignore it, or write to hello@parle.buzz.</p>",
    ]),
  };
}

/** An existing Parle account that became an administrator. */
export function adminPromotedMail(i: { inviter: string; appUrl: string }): { subject: string; html: string } {
  return {
    subject: "You are now a Parle administrator",
    html: page([
      `<p>${esc(i.inviter)} made your Parle account an administrator.</p>`,
      `<p>Sign in to <a href="${esc(`${i.appUrl}/admin/login`)}">the admin console</a> with your usual password. Your own learner or tutor records stay as they were.</p>`,
    ]),
  };
}
