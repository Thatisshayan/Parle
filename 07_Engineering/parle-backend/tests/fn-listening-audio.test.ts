import { describe, it, expect, afterAll, setDefaultTimeout } from "bun:test";
import { handleVoice } from "../../parle-app/api/_voice/handler";
import { fakeCalls } from "../../parle-app/api/_voice/fake";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { callFunction, functionsEnv } from "./helpers/functions-env";
import { onboardedLearner } from "./helpers/learners";
import { makeUser } from "./helpers/users";
import { service, voice } from "./helpers/voice";

setDefaultTimeout(60_000);
const env = () => ({ VOICE_PROVIDER: "fake", VOICE_RELAY_SECRET: functionsEnv().VOICE_RELAY_SECRET, VITE_SUPABASE_URL: LOCAL_URL, VITE_SUPABASE_PUBLISHABLE_KEY: localKeys().anon });
const tokenOf = async (u: Awaited<ReturnType<typeof makeUser>>) => (await u.client.auth.getSession()).data.session!.access_token;
async function listen(token: string, item_kind: string, item_id: string, extra: Record<string, string> = {}) {
  const r = await handleVoice(new Request("http://app.test/api/voice?action=listen", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ item_kind, item_id }) }), { ...env(), ...extra });
  return { status: r.status, body: await r.json() };
}
const created: string[] = [];
async function bankItem(transcript: string): Promise<string> {
  const { data, error } = await service().from("question_item").insert({
    demo_code: `VOICE-TEST-${crypto.randomUUID().slice(0, 8)}`, skill: "listening", cefr_level: "B2", format: "multiple_choice", prompt: "Où travaille Claire ?",
    transcript, audio_url: "", options: [{ id: "a", text: "Dans une banque" }, { id: "b", text: "Dans une école" }], answer_option_id: "a", answer: "Dans une banque",
    explanation: "Elle le dit.", status: "approved", is_test_data: true,
  }).select("id").single();
  if (error) throw error;
  created.push(String(data.id));
  return String(data.id);
}
async function listeningTask() {
  const { u, t } = await onboardedLearner();
  const plan = (await callFunction("parle-plan-service", t, { action: "get_or_create_plan", options: {} })).body.result;
  const task = plan.tasks.find((x: any) => x.type !== "weekly_checkin" && x.type !== "tutor_lesson");
  const { error } = await service().from("learner_task").update({ type: "listening_exercise", skill: "listening", content_json: JSON.stringify({ text: "Le bus arrive à huit heures. Il est souvent en retard le lundi.", questions: [] }) }).eq("id", task.id);
  if (error) throw error;
  return { u, t, taskId: String(task.id) };
}
afterAll(async () => { if (created.length) await service().from("question_item").delete().in("id", created); });

describe("listening audio, made once and cached", () => {
  it("a listening item with a script is made once: the next learner gets the cached file, with no new generation and no count", async () => {
    const id = await bankItem("Bonjour. Je m'appelle Claire et je travaille dans une banque à Montréal.");
    const a = await makeUser("learner"), b = await makeUser("learner");
    const before = fakeCalls.synthesize;
    const first = await listen(await tokenOf(a), "question_item", id);
    expect([first.status, first.body.generated]).toEqual([200, true]);
    const made = fakeCalls.synthesize - before;
    expect(made).toBeGreaterThan(0);
    const second = await listen(await tokenOf(b), "question_item", id);
    expect([second.status, second.body.generated, fakeCalls.synthesize - before]).toEqual([200, false, made]);
    const audio = await fetch(second.body.url);
    expect([audio.status, audio.headers.get("content-type")]).toEqual([200, "audio/mpeg"]);
    expect((await voice(await tokenOf(b), { action: "voice_status" })).body.replies.used).toBe(0);
  });
  it("a changed script makes new audio; an item with a real recording keeps it", async () => {
    const id = await bankItem("Le magasin ouvre à neuf heures.");
    const u = await makeUser("learner"), t = await tokenOf(u);
    expect((await listen(t, "question_item", id)).body.generated).toBe(true);
    await service().from("question_item").update({ transcript: "Le magasin ouvre à dix heures." }).eq("id", id);
    expect((await listen(t, "question_item", id)).body.generated).toBe(true);
    await service().from("question_item").update({ audio_url: "https://example.test/real-recording.mp3" }).eq("id", id);
    expect((await listen(t, "question_item", id)).body).toEqual({ url: "https://example.test/real-recording.mp3", generated: false });
  });
  it("two requests at once make it once", async () => {
    const id = await bankItem("La réunion commence dans dix minutes.");
    const u = await makeUser("learner"), t = await tokenOf(u);
    const before = fakeCalls.synthesize;
    const both = await Promise.all([listen(t, "question_item", id), listen(t, "question_item", id)]);
    for (const r of both) expect([200, 409]).toContain(r.status);
    expect(fakeCalls.synthesize - before).toBe(1);
  });
  it("a learner's own listening task gets audio; another learner's is refused", async () => {
    const { t, taskId } = await listeningTask();
    expect((await listen(t, "learner_task", taskId)).status).toBe(200);
    const other = await onboardedLearner();
    expect((await listen(other.t, "learner_task", taskId)).status).toBe(404);
  });
  it("the administrator's list of items without audio shrinks once one is prepared; learners cannot read it", async () => {
    const id = await bankItem("Le train pour Québec part du quai numéro trois.");
    const admin = await makeUser("admin"), at = await tokenOf(admin);
    const missing = async () => (await voice(at, { action: "admin_listening_missing" })).body.missing.map((m: { item_id: string }) => m.item_id);
    expect(await missing()).toContain(id);
    expect((await listen(at, "question_item", id)).status).toBe(200);
    expect(await missing()).not.toContain(id);
    const learner = await makeUser("learner");
    expect((await voice(await tokenOf(learner), { action: "admin_listening_missing" })).status).toBe(403);
  });
  it("deleting the account removes the person's task audio", async () => {
    const { u, t, taskId } = await listeningTask();
    await listen(t, "learner_task", taskId);
    const { data: row } = await service().from("listening_audio").select("path").eq("item_id", taskId).single();
    expect((await service().storage.from("listening-audio").download(row!.path)).error).toBeNull();
    expect((await callFunction("parle-account-service", t, { action: "delete_account", password: u.password, confirm: "DELETE" })).status).toBe(200);
    expect((await service().storage.from("listening-audio").download(row!.path)).error).not.toBeNull();
  });
});

describe("a failed generation (Plan 11: A89)", () => {
  it("after a failed generation the next request makes the audio at once (R97)", async () => {
    const id = await bankItem("Le train part à sept heures.");
    const t = await tokenOf(await makeUser("learner"));
    expect((await listen(t, "question_item", id, { VOICE_FAKE_FAIL: "1" })).status).toBe(503);
    const next = await listen(t, "question_item", id);
    expect([next.status, next.body.generated]).toEqual([200, true]);
  });
});
