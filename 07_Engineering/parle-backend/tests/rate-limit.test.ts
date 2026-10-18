import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { takeRateLimit, clientIp, readLimitedRequestText } from "../supabase/functions/_shared/rate-limit";

const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });

describe("rate limits", () => {
  it("lets exactly max requests through a window, even all at once", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 20 }, () => takeRateLimit(service(), key, 3600, 10)));
    expect(results.filter(Boolean).length).toBe(10);
  });
  it("cannot be called by a browser key", async () => {
    const anon = createClient(LOCAL_URL, localKeys().anon, { auth: { persistSession: false } });
    const { error } = await anon.rpc("take_rate_limit", { p_key: "x", p_window_seconds: 60, p_max: 1 });
    expect(error).not.toBeNull();
  });
  it("uses the address the gateway adds, not one the caller wrote (final review 1)", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } }))).toBe("10.0.0.1");
    expect(clientIp(new Request("http://x", { headers: { "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.9, 10.0.0.1" } }))).toBe("198.51.100.7");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
  it("counts request bytes and cancels a streamed body as soon as it exceeds the cap", async () => {
    let pulls = 0;
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        if (pulls > 4) return controller.close();
        controller.enqueue(new Uint8Array(16_000));
      },
      cancel() { canceled = true; },
    });
    const request = new Request("http://x", { method: "POST", body, duplex: "half" } as RequestInit);
    expect(await readLimitedRequestText(request, 32_000)).toEqual({ kind: "too_large" });
    expect(canceled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(3);
  });
  it("counts UTF-8 bytes rather than JavaScript string characters", async () => {
    const request = new Request("http://x", { method: "POST", body: "é".repeat(16_001) });
    expect(await readLimitedRequestText(request, 32_000)).toEqual({ kind: "too_large" });
  });
});
