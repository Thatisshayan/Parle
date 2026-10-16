import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const config = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
const csp = String(config.headers[0].headers.find((h: { key: string }) => h.key === "Content-Security-Policy").value);

describe("vercel.json for the relay (ruling 18)", () => {
  it("leaves /api/voice to the relay and still sends app pages to index.html", () => {
    const rewrite = new RegExp(`^${config.rewrites[0].source}$`);
    assert.equal(rewrite.test("/api/voice"), false);
    assert.equal(rewrite.test("/learner/today"), true);
  });
  it("lets audio play from the relay (blob) and from storage, and gives the relay 60 seconds", () => {
    assert.match(csp, /media-src 'self' blob: https:\/\/hcphvipeplkfenugikrf\.supabase\.co/);
    assert.equal(config.functions["api/voice.ts"].maxDuration, 60);
  });
});
