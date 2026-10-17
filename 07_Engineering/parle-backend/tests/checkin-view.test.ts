import { describe, it, expect } from "bun:test";
import { checkInForBrowser } from "../supabase/functions/parle-plan-service/checkin-view";

const session = { plan: {}, questions: [
  { id: "l1", kind: "listening", text: "A : Bonjour.", prompt: "Qui parle ?", options: [], answerOptionId: "o1", explanation: "x" },
  { id: "r1", kind: "reading", text: "Un texte.", prompt: "Quoi ?", options: [], answerOptionId: "o2", explanation: "y" },
] };

describe("the check-in sent to the browser (Plan 13)", () => {
  it("has no answer keys, and listening questions carry audio instead of their transcript", async () => {
    const out = await checkInForBrowser(session, async (ids) => new Map(ids.map((id) => [id, `https://audio.test/${id}.mp3`])));
    const [l, r] = (out as any).questions;
    expect("answerOptionId" in l || "explanation" in l || "answerOptionId" in r).toBe(false);
    expect(l.text).toBe("");
    expect(l.audioUrl).toBe("https://audio.test/l1.mp3");
    expect(r.text).toBe("Un texte.");
    expect("audioUrl" in r).toBe(false);
  });
  it("a listening question without prepared audio gets an empty address, still no transcript", async () => {
    const out = await checkInForBrowser(session, async () => new Map());
    const l = (out as any).questions[0];
    expect([l.text, l.audioUrl]).toEqual(["", ""]);
  });
});
