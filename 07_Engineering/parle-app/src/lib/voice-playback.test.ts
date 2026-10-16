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

describe("reply player on phones that only play audio after a tap (final review, Important 3)", () => {
  type FakeAudio = { src: string; playbackRate: number; onended: (() => void) | null; onerror: (() => void) | null; play(): Promise<void>; pause(): void };
  const fakeAudio = (refuse: boolean) => {
    const made: FakeAudio[] = [];
    const make = () => {
      const a: FakeAudio = {
        src: "", playbackRate: 1, onended: null, onerror: null,
        play() { if (refuse && !a.src.startsWith("data:")) { const e = new Error("not allowed"); e.name = "NotAllowedError"; return Promise.reject(e); } setTimeout(() => a.onended?.(), 0); return Promise.resolve(); },
        pause() {},
      };
      made.push(a);
      return a as unknown as HTMLAudioElement;
    };
    return { make, made };
  };
  const mp3Answer = () => setVoiceDeps({ token: async () => "tok", fetch: async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Content-Type": "audio/mpeg" } }) });

  it("uses one audio element, unlocked by the tap, for every piece of the reply", async () => {
    mp3Answer();
    const audio = fakeAudio(false);
    const player = new ReplyPlayer(audio.make);
    player.unlock();
    assert.equal(await player.play("Je suis allé au marché. Nous avons acheté du pain.", "m-2"), "natural");
    assert.equal(audio.made.length, 1);
  });

  it("when the phone refuses to play without a tap, asks for a tap instead of saying the voice is unavailable", async () => {
    mp3Answer();
    const audio = fakeAudio(true);
    assert.equal(await new ReplyPlayer(audio.make).play("Je suis allé au marché.", "m-3"), "needs_tap");
  });
});
