import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { latestMail, tokenHashFrom } from "./helpers/mailpit";
import { sendSetPasswordMail } from "../scripts/migrate/set-password-mail";
import * as auth from "../../parle-app/src/lib/backend/auth";

describe("set-password email", () => {
  it("a migrated learner sets a password from the email; the link works once (Review Focus 4)", async () => {
    const db = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
    const email = `setpw-${crypto.randomUUID()}@example.test`;
    await db.auth.admin.createUser({ email, email_confirm: true });
    const since = new Date(Date.now() - 2000).toISOString();
    await sendSetPasswordMail({ url: LOCAL_URL, serviceKey: localKeys().service }, email, "http://127.0.0.1:5173", "mailpit");
    const mail = await latestMail(email, since);
    expect(mail.subject).toBe("Set your password for Parle");
    const token = tokenHashFrom(mail.html);
    const anon = () => createClient(LOCAL_URL, localKeys().anon, { auth: { persistSession: false } });
    await auth.resetWithToken(anon(), token, "Fresh-Passw0rd");
    expect((await auth.signInWithPassword(anon(), email, "Fresh-Passw0rd")).email).toBe(email);
    await expect(auth.resetWithToken(anon(), token, "Other-Passw0rd1")).rejects.toThrow();
  }, 30000);
});
