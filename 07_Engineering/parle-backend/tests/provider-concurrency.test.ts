import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { providerConcurrencyLimit, ProviderBusyError, withProviderLease } from "../supabase/functions/_shared/provider-concurrency";

const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });

describe("distributed provider concurrency leases", () => {
  it("uses a safe default and rejects invalid configured limits", () => {
    expect(providerConcurrencyLimit(undefined)).toBe(5);
    expect(providerConcurrencyLimit("2")).toBe(2);
    expect(providerConcurrencyLimit("0")).toBe(5);
    expect(providerConcurrencyLimit("21")).toBe(5);
    expect(providerConcurrencyLimit("2.5")).toBe(5);
  });
  it("admits only the configured number of concurrent provider operations", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered = 0;
    const run = () => withProviderLease(service(), "ai_nvidia", 2, async () => { entered++; await gate; });
    const first = run(), second = run();
    for (let i = 0; i < 20 && entered < 2; i++) await new Promise((resolve) => setTimeout(resolve, 25));
    expect(entered).toBe(2);
    await expect(withProviderLease(service(), "ai_nvidia", 2, async () => { throw new Error("must not run"); })).rejects.toBeInstanceOf(ProviderBusyError);
    release();
    await Promise.all([first, second]);
    await expect(withProviderLease(service(), "ai_nvidia", 2, async () => "released")).resolves.toBe("released");
  }, 30000);
  it("releases a lease when the provider operation throws", async () => {
    await expect(withProviderLease(service(), "ai_nvidia", 1, async () => { throw new Error("provider failed"); })).rejects.toThrow("provider failed");
    await expect(withProviderLease(service(), "ai_nvidia", 1, async () => "next request")).resolves.toBe("next request");
  }, 30000);
  it("expires abandoned leases so a crashed worker cannot hold capacity forever", async () => {
    const s = service();
    const { data: id, error } = await s.rpc("acquire_provider_lease", { p_role: "speech_stt", p_max_active: 1, p_lease_seconds: 1 });
    expect(error).toBeNull(); expect(typeof id).toBe("string");
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const { data: next, error: nextError } = await s.rpc("acquire_provider_lease", { p_role: "speech_stt", p_max_active: 1, p_lease_seconds: 10 });
    expect(nextError).toBeNull(); expect(typeof next).toBe("string");
    await s.rpc("release_provider_lease", { p_id: next });
  }, 10000);
  it("rejects unknown provider roles and invalid lease bounds", async () => {
    const s = service();
    const badRole = await s.rpc("acquire_provider_lease", { p_role: "unknown", p_max_active: 1, p_lease_seconds: 10 });
    const badLease = await s.rpc("acquire_provider_lease", { p_role: "ai_openrouter", p_max_active: 1, p_lease_seconds: 121 });
    expect(badRole.error).not.toBeNull();
    expect(badLease.error).not.toBeNull();
  });
  it("does not expose provider lease RPCs to anonymous clients", async () => {
    const anon = createClient(LOCAL_URL, localKeys().anon, { auth: { persistSession: false } });
    const { error } = await anon.rpc("acquire_provider_lease", { p_role: "ai_openrouter", p_max_active: 1, p_lease_seconds: 10 });
    expect(error).not.toBeNull();
  });
});
