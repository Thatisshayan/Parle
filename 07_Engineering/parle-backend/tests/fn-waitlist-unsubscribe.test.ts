import { describe, it, expect, beforeEach } from "bun:test";
import { LOCAL_URL } from "./helpers/local";
import { callFunction, functionsEnv } from "./helpers/functions-env";
import { joinWaitlist, psql, resetWaitlist, waitlistRows } from "./helpers/admin";
import { unsubscribeToken } from "../supabase/functions/_shared/waitlist/token";

const URL_ = `${LOCAL_URL}/functions/v1/parle-waitlist-unsubscribe`;
const tokenFor = (email: string) => unsubscribeToken(functionsEnv().WAITLIST_UNSUBSCRIBE_SECRET, email);
const sourceOf = (email: string) => psql(`select source from public.waitlist_unsubscribe where email = '${email}'`);

describe("unsubscribe (spec 4.5)", () => {
  beforeEach(() => resetWaitlist());

  it("the page's POST records it and answers with the address; a second click changes nothing", async () => {
    const email = `zoe-${crypto.randomUUID().slice(0, 8)}@example.test`;
    const token = await tokenFor(email.toUpperCase());
    const r = await callFunction("parle-waitlist-unsubscribe", null, { token }, { Origin: "http://127.0.0.1:5173" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: "unsubscribed", email });
    expect(sourceOf(email)).toBe("link");
    expect((await callFunction("parle-waitlist-unsubscribe", null, { token })).status).toBe(200);
    expect(psql(`select count(*) from public.waitlist_unsubscribe where email = '${email}'`)).toBe("1");
  });

  it("the mail app's one-click POST records it without a page, and skips a queued email", async () => {
    const email = `oc-${crypto.randomUUID().slice(0, 8)}@example.test`;
    await joinWaitlist(email);
    psql("select public.waitlist_queue('launch', 'test')");
    const r = await fetch(`${URL_}?t=${encodeURIComponent(await tokenFor(email))}`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click",
    });
    expect(r.status).toBe(200);
    expect(sourceOf(email)).toBe("header");
    expect(waitlistRows("launch")).toEqual([{ email, status: "skipped_unsubscribed" }]);
  });

  it("a forged token is refused and records nothing; GET is not accepted", async () => {
    const real = await tokenFor("victim@example.test");
    const forged = `${btoa("victim@example.test").replace(/=+$/, "")}.${(await tokenFor("attacker@example.test")).split(".")[1]}`;
    for (const token of [forged, "garbage", "", `${real}x`]) {
      const r = await callFunction("parle-waitlist-unsubscribe", null, { token });
      expect(r.status).toBe(400);
      expect(r.body.error_code).toBe("TOKEN_INVALID");
    }
    expect(psql("select count(*) from public.waitlist_unsubscribe where email = 'victim@example.test'")).toBe("0");
    const oneClick = await fetch(`${URL_}?t=${encodeURIComponent(forged)}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
    expect(oneClick.status).toBe(400);
    expect((await fetch(`${URL_}?t=${encodeURIComponent(real)}`)).status).toBe(405);
  });
});
