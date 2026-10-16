import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ReplyPlayer } from "./voice-playback";
import { setVoiceDeps } from "./voice-client";

afterEach(() => setVoiceDeps(null));

describe("reply player", () => {
  it("says there is nothing to read when a reply has no French", async () => {
    assert.equal(await new ReplyPlayer().play("Great job! Here is a tip.", "m-1"), "none");
  });
  it("falls back to the browser's voice (or says none is available) when the natural voice is refused at the limit", async () => {
    setVoiceDeps({ token: async () => "tok", fetch: async () => new Response(JSON.stringify({ error_code: "LIMIT_REACHED" }), { status: 429 }) });
    const outcome = await new ReplyPlayer().play("Je suis allé au marché.", "m-1");
    assert.ok(outcome === "browser_limit" || outcome === "unavailable", outcome);
  });
});
