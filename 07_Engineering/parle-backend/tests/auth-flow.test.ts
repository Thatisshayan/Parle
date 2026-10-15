import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { latestMail, codeFrom, tokenHashFrom } from "./helpers/mailpit";
import * as auth from "../../parle-app/src/lib/backend/auth";

const client = () => createClient(LOCAL_URL, localKeys().anon, { auth: { persistSession: false } });
const email = () => `flow-${crypto.randomUUID()}@example.test`;
const since = () => new Date(Date.now() - 2000).toISOString();

async function verifiedUser(name: string) {
  const c = client(), e = email(), s = since();
  await auth.signUpWithCode(c, name, e, "Passw0rd!x");
  await auth.verifySignupCode(c, e, codeFrom((await latestMail(e, s)).text));
  return { c, e };
}

describe("sign-up with a verification code", () => {
  it("unverified user cannot sign in; the emailed code verifies and signs in", async () => {
    const c = client(), e = email(), s = since();
    expect(await auth.signUpWithCode(c, "Test One", e, "Passw0rd!x")).toEqual({ pendingVerification: true });
    await expect(auth.signInWithPassword(client(), e, "Passw0rd!x")).rejects.toThrow();
    const mail = await latestMail(e, s);
    expect(mail.subject).toBe("Your Parle verification code");
    const user = await auth.verifySignupCode(c, e, codeFrom(mail.text));
    expect(user).toEqual({ id: expect.any(String), email: e, full_name: "Test One", role: "user" });
    expect(await auth.isAuthenticated(c)).toBe(true);
  });
  it("a wrong code is rejected", async () => {
    const c = client(), e = email();
    await auth.signUpWithCode(c, "X", e, "Passw0rd!x");
    await expect(auth.verifySignupCode(c, e, "000000")).rejects.toThrow();
  });
});

describe("roles and names", () => {
  it("reports administrator for app_metadata role admin and user otherwise", () => {
    expect(auth.toParleUser({ id: "1", email: "a@b.c", user_metadata: { full_name: "A" }, app_metadata: { role: "admin" } } as any).role).toBe("administrator");
    expect(auth.toParleUser({ id: "1", email: "a@b.c", user_metadata: {}, app_metadata: { role: "tutor" } } as any)).toEqual({ id: "1", email: "a@b.c", full_name: null, role: "user" });
  });
  it("updates the display name", async () => {
    const { c } = await verifiedUser("Old Name");
    expect((await auth.updateMyName(c, "New Name")).full_name).toBe("New Name");
    expect((await auth.me(c)).full_name).toBe("New Name");
  });
});

describe("password reset", () => {
  it("reset token works once", async () => {
    const { e } = await verifiedUser("R");
    const s2 = since();
    await auth.requestReset(client(), e, "http://127.0.0.1:5173/reset-password");
    const token = tokenHashFrom((await latestMail(e, s2)).html);
    await auth.resetWithToken(client(), token, "N3wPassword!");
    expect((await auth.signInWithPassword(client(), e, "N3wPassword!")).email).toBe(e);
    await expect(auth.resetWithToken(client(), token, "Other123!")).rejects.toThrow();
  });
});

describe("sign-out", () => {
  it("logout ends the session", async () => {
    const { c } = await verifiedUser("S");
    await auth.logout(c);
    expect(await auth.isAuthenticated(c)).toBe(false);
    await expect(auth.me(c)).rejects.toThrow("Authentication required");
  });
});
