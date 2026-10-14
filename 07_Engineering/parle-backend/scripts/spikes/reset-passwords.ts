import { randomBytes } from "node:crypto";
import { buildyPost, signIn } from "../buildy/client";
import { waitForMail, findResetToken } from "../buildy/agentmail";
import { replacePassword } from "../lib/test-accounts";

const TARGETS = [
  { label: "imm1", email: "obsidianteamhq+imm1@agentmail.to" },
  { label: "learner1", email: "obsidianteamhq+learner1@agentmail.to" },
  { label: "tutor1", email: "obsidianteamhq+tutor1@agentmail.to" },
];

for (const t of TARGETS) {
  const since = new Date(Date.now() - 5_000).toISOString();
  const req = await buildyPost("/auth/app-forgot-password", { email: t.email });
  if (!req.ok) { console.log(`${t.label}: reset request failed ${req.status}`); continue; }
  const mail = await waitForMail(t.email, since);
  if (!mail) { console.log(`${t.label}: no reset mail within 3 minutes`); continue; }
  const token = findResetToken(mail.text);
  if (!token) { console.log(`${t.label}: reset mail has no recognisable link (subject: ${mail.subject})`); continue; }
  const password = `Parle-${randomBytes(9).toString("base64url")}`;
  const done = await buildyPost("/auth/app-reset-password", { token, password });
  if (!done.ok) { console.log(`${t.label}: reset failed ${done.status}`); continue; }
  try {
    await signIn(t.email, password); // confirm before saving (Review Focus 5)
    replacePassword(t.label, password, undefined, t.email);
    console.log(`${t.label}: password set and confirmed by sign-in (saved to test-accounts file)`);
  } catch (e) {
    console.log(`${t.label}: new password did not sign in; file unchanged (${(e as Error).message.split(":")[0]})`);
  }
}
