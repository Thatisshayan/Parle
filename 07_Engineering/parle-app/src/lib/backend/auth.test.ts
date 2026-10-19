import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { isAuthenticated, logout, refreshRole } from "./auth";

class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  names() { return [...this.m.keys()]; }
}

async function withWindow(fn: (w: { local: MemoryStorage; session: MemoryStorage; visits: string[] }) => Promise<void>) {
  const local = new MemoryStorage(), session = new MemoryStorage(), visits: string[] = [];
  for (const k of ["parle-auth", "sb-abc-auth-token", "superdev_refresh_token", "theme"]) local.setItem(k, "x");
  session.setItem("parle-onboarding-session-v1", "{}");
  (globalThis as unknown).window = { localStorage: local, sessionStorage: session, location: { replace: (p: string) => visits.push(p) } };
  try { await fn({ local, session, visits }); } finally { delete (globalThis as unknown).window; }
}
function client(signOut: (scope?: string) => Promise<{ error: unknown }>) {
  const scopes: Array<string | undefined> = [];
  return { scopes, c: { auth: { signOut: async (o?: { scope?: string }) => { scopes.push(o?.scope); return signOut(o?.scope); } } } as unknown };
}

describe("sign-out (A2 R12, A26 R15)", () => {
  it("ends the session, clears auth keys and the onboarding answers, then reloads to sign-in", async () => {
    await withWindow(async ({ local, session, visits }) => {
      const { scopes, c } = client(async () => ({ error: null }));
      await logout(c);
      assert.deepEqual(scopes, [undefined]);
      assert.deepEqual(local.names(), ["theme"]);
      assert.equal(session.getItem("parle-onboarding-session-v1"), null);
      assert.deepEqual(visits, ["/login"]);
    });
  });
  it("still ends the local session and reloads when the server cannot be reached", async () => {
    await withWindow(async ({ local, visits }) => {
      const { scopes, c } = client(async (scope) => ({ error: scope === "local" ? null : new AuthRetryableFetchError("Failed to fetch", 0) }));
      await logout(c);
      assert.deepEqual(scopes, [undefined, "local"]);
      assert.deepEqual(local.names(), ["theme"]);
      assert.deepEqual(visits, ["/login"]);
    });
  });
  it("still clears and reloads when sign-out throws", async () => {
    await withWindow(async ({ local, visits }) => {
      const { c } = client(async () => { throw new Error("offline"); });
      await logout(c);
      assert.deepEqual(local.names(), ["theme"]);
      assert.deepEqual(visits, ["/login"]);
    });
  });
  it("reloads to the page the caller names (home after deleting an account)", async () => {
    await withWindow(async ({ visits }) => {
      await logout(client(async () => ({ error: null })).c, "/");
      assert.deepEqual(visits, ["/"]);
    });
  });
});

describe("sign-in check", () => {
  it("no saved session means signed out, without asking the server", async () => {
    let asked = false;
    const c: unknown = { auth: { getSession: async () => ({ data: { session: null }, error: null }), getUser: async () => { asked = true; return { data: { user: null }, error: null }; } } };
    assert.equal(await isAuthenticated(c), false);
    assert.equal(asked, false);
  });
  it("a network failure is not treated as signed out (used by the onboarding retry, A16)", async () => {
    const c: unknown = { auth: { getSession: async () => ({ data: { session: {} }, error: null }), getUser: async () => ({ data: { user: null }, error: new AuthRetryableFetchError("Failed to fetch", 0) }) } };
    await assert.rejects(isAuthenticated(c));
  });
});

describe("role after ensure_identity (A25, R9)", () => {
  it("refreshes the session and never throws", async () => {
    let refreshed = 0;
    await refreshRole({ auth: { refreshSession: async () => { refreshed += 1; return { data: {}, error: null }; } } } as unknown);
    await refreshRole({ auth: { refreshSession: async () => { throw new Error("offline"); } } } as unknown);
    assert.equal(refreshed, 1);
  });
  it("createMyIdentity refreshes the session right after the server sets the role", () => {
    const src = readFileSync(new URL("../parle-profile.ts", import.meta.url), "utf8");
    assert.match(src, /action: "ensure_identity"[\s\S]{0,300}refreshSession\?\.\(\)/);
  });
});
