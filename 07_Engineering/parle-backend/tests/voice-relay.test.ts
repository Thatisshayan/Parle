import { describe, it, expect, beforeAll, setDefaultTimeout } from "bun:test";
import { HAS_LOCAL_DEMO_FIXTURES } from "./helpers/migration-fixtures";
import { handleVoice } from "../../parle-app/api/_voice/handler";
import { pcmWav } from "../../parle-app/api/_voice/wav";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { functionsEnv } from "./helpers/functions-env";
import { seedLocalContent } from "../scripts/seed-local-content";
import { onboardedLearner } from "./helpers/learners";
import { learnerWithSpeakingTask, pause, tutorReply, voice } from "./helpers/voice";

setDefaultTimeout(60_000);
beforeAll(async () => { if (HAS_LOCAL_DEMO_FIXTURES) await seedLocalContent(); });
const env = (extra: Record<string, string> = {}) => ({ VOICE_PROVIDER: "fake", VOICE_RELAY_SECRET: functionsEnv().VOICE_RELAY_SECRET, VITE_SUPABASE_URL: LOCAL_URL, VITE_SUPABASE_PUBLISHABLE_KEY: localKeys().anon, ...extra });
const answer = (token: string, taskId: string, extra: Record<string, string> = {}) =>
  handleVoice(new Request(`http://app.test/api/voice?action=transcribe&purpose=answer&ref=${taskId}&part=1`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "audio/wav" }, body: pcmWav(new Int16Array(16000 * 20), 16000) }), env(extra));

describe.skipIf(!HAS_LOCAL_DEMO_FIXTURES)("the relay against the local backend (fake provider)", () => {
  it("a recorded answer goes through: the transcript comes back and the answer waits to be scored", async () => {
    const { t, taskId } = await learnerWithSpeakingTask();
    const r = await answer(t, taskId);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({ part: 1, duration_ms: 20_000, total_ms: 20_000, remaining: 1, plan: "free" });
    expect(body.transcript).toContain("marché");
    expect((await voice(t, { action: "voice_status" })).body.answers.used).toBe(1);
  });
  it("the limit is reached and refused", async () => {
    const { t, taskId } = await learnerWithSpeakingTask();
    await answer(t, taskId);
    await answer(t, taskId);
    const r = await answer(t, taskId);
    expect([r.status, (await r.json()).error_code]).toEqual([429, "LIMIT_REACHED"]);
  });
  it("a bad token is refused", async () => {
    const r = await answer("not-a-token", "00000000-0000-0000-0000-000000000000");
    expect(r.status).toBe(401);
  });
  it("a paused account is refused by the relay", async () => {
    const { u, t, taskId } = await learnerWithSpeakingTask();
    await pause(u.id);
    expect((await answer(t, taskId)).status).toBe(401);
  });
  it("a provider failure gives the use back", async () => {
    const { t, taskId } = await learnerWithSpeakingTask();
    expect((await answer(t, taskId, { VOICE_FAKE_FAIL: "1" })).status).toBe(503);
    expect((await voice(t, { action: "voice_status" })).body.answers.used).toBe(0);
  });
  it("a tutor reply is read aloud as MP3 and counted once", async () => {
    const { u, t } = await onboardedLearner();
    const id = await tutorReply(u.id, u.email, "Très bien ! Je suis allé au marché.");
    for (let i = 0; i < 2; i++) {
      const r = await handleVoice(new Request("http://app.test/api/voice?action=speak", { method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify({ text: "Très bien ! Je suis allé au marché.", reply_id: id }) }), env());
      expect(r.headers.get("content-type")).toBe("audio/mpeg");
    }
    expect((await voice(t, { action: "voice_status" })).body.replies.used).toBe(1);
  });
});
