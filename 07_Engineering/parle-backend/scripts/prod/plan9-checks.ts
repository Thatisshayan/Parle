import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { PROD_REF, runSql, serviceKey } from "./management";
import { PROD_URL, anonKey, chat, fn, newLearner, removeLearner, type Learner } from "./check-learners";
import { readSecret, SECRETS_DIR } from "../lib/secrets";
import { frenchChunks } from "../../../parle-app/src/lib/voice-text";

/**
 * Plan 9 checks on production through the private preview's relay, with an AgentMail learner (obsidianteamhq+p9...).
 * Prints outcomes only: never passwords, tokens, signed links or keys. State in the secrets folder.
 * usage: bun scripts/prod/plan9-checks.ts <learner|reply|listening|limit|status|cleanup>
 */
const APP = "https://parle-preview-shayans-projects-d00acc44.vercel.app";
const STATE = `${SECRETS_DIR}/plan9-check-state.json`;
type State = { learner?: Learner & { id: string } };
const load = (): State => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {});
const save = (s: State) => writeFileSync(STATE, JSON.stringify(s, null, 2));
const service = async () => createClient(PROD_URL, await serviceKey(PROD_REF), { auth: { persistSession: false } });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function tokenFor(l: Learner): Promise<string> {
  const c = createClient(PROD_URL, await anonKey(), { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: l.email, password: l.password });
  if (error || !data.session) throw new Error(`sign-in failed: ${error?.message ?? "no session"}`);
  return data.session.access_token;
}
async function relay(token: string, query: string, body: BodyInit, json: boolean) {
  const r = await fetch(`${APP}/api/voice?${query}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "x-vercel-protection-bypass": readSecret("VERCEL_BYPASS"), "Content-Type": json ? "application/json" : "audio/wav" }, body });
  const type = r.headers.get("content-type") ?? "";
  return { status: r.status, type, body: type.includes("json") ? ((await r.json()) as Record<string, any>) : null };
}
/** Turns one of the check learner's own tasks into an open speaking task dated today (check account only). */
async function openSpeakingTaskToday(userId: string, except: string[] = []): Promise<string> {
  const db = await service();
  const { data } = await db.from("learner_task").select("id, type, status").eq("owner_id", userId).in("status", ["planned", "rolled"]).order("created_at").limit(50);
  const rows = (data ?? []).filter((x) => !except.includes(String(x.id)));
  const task = rows.find((x) => x.type === "speaking_check" || x.type === "speaking_practice") ?? rows.find((x) => x.type !== "weekly_checkin" && x.type !== "tutor_lesson");
  if (!task) throw new Error("no open task to use");
  const { error } = await db.from("learner_task").update({ type: task.type.startsWith("speaking") ? task.type : "speaking_practice", skill: "speaking", status: "planned", date_local: today() }).eq("id", task.id);
  if (error) throw new Error(error.message);
  return String(task.id);
}

const steps: Record<string, () => Promise<void>> = {
  learner: async () => {
    const l = await newLearner("voice", "A2", "English", false, "p9");
    const c = createClient(PROD_URL, await anonKey(), { auth: { persistSession: false } });
    const id = (await c.auth.getUser(l.token)).data.user?.id ?? "";
    const plan = await fn("parle-plan-service", l.token, { action: "get_or_create_plan", options: {} });
    console.log(`learner: ready, plan ${plan.status}`);
    const first = await openSpeakingTaskToday(id); // for the recorded answer
    const second = await openSpeakingTaskToday(id, [first]); // for the microphone-refused check
    console.log(`learner: two speaking tasks for today ${Boolean(first && second && first !== second)}`);
    save({ learner: { ...l, id } });
  },
  reply: async () => {
    const l = load().learner!;
    const token = await tokenFor(l);
    await chat({ ...l, token }, "chat", ["Bonjour ! Je voudrais pratiquer le passé composé avec un exemple sur le travail."]);
    const db = await service();
    const { data } = await db.from("ai_message").select("id, text").eq("owner_id", l.id).eq("sender", "tutor_ai").order("created_at", { ascending: false }).limit(1);
    const reply = data?.[0];
    const chunk = reply ? frenchChunks(String(reply.text))[0] : undefined;
    if (!reply || !chunk) { console.log("reply: the tutor's reply had no French sentence to read (recorded, not a failure)"); return; }
    for (let i = 1; i <= 2; i++) {
      const r = await relay(token, "action=speak", JSON.stringify({ text: chunk, reply_id: reply.id }), true);
      console.log(`reply read aloud ${i}: ${r.status} ${r.type}`);
    }
    const s = await fn("parle-voice-service", token, { action: "voice_status" });
    console.log(`reply: replies used ${s.body.replies?.used} of ${s.body.replies?.limit}`);
  },
  listening: async () => {
    const token = await tokenFor(load().learner!);
    const rows = (await runSql(PROD_REF, "select id from public.question_item where skill = 'listening' and status = 'approved' and coalesce(audio_url, '') = '' and coalesce(transcript, '') <> '' order by demo_code limit 1")) as Array<{ id: string }>;
    if (!rows[0]) { console.log("listening: no listening item with a script"); return; }
    for (let i = 1; i <= 2; i++) {
      const r = await relay(token, "action=listen", JSON.stringify({ item_kind: "question_item", item_id: rows[0].id }), true);
      const audio = r.body?.url ? await fetch(r.body.url) : null;
      console.log(`listening ${i}: ${r.status} generated ${r.body?.generated}; file ${audio?.status} ${audio?.headers.get("content-type")}`);
    }
  },
  limit: async () => {
    const l = load().learner!;
    const token = await tokenFor(l);
    const taskId = await openSpeakingTaskToday(l.id);
    const wav = readFileSync(`${tmpdir()}/parle-voice-sample-16k.wav`);
    for (let i = 1; i <= 3; i++) {
      const r = await relay(token, `action=transcribe&purpose=answer&ref=${taskId}&part=1`, wav, false);
      console.log(`limit answer ${i}: ${r.status} ${r.body?.error_code ?? ""} plan ${r.body?.plan ?? ""} French heard ${/marché|famille|café/i.test(String(r.body?.transcript ?? ""))}`);
    }
  },
  status: async () => {
    const s = await fn("parle-voice-service", await tokenFor(load().learner!), { action: "voice_status" });
    console.log(`status: ${s.status} plan ${s.body.plan}; answers ${s.body.answers?.used}/${s.body.answers?.limit}; messages ${s.body.messages?.used}/${s.body.messages?.limit}; replies ${s.body.replies?.used}/${s.body.replies?.limit}; zone ${s.body.time_zone}`);
  },
  cleanup: async () => {
    const l = load().learner!;
    await removeLearner({ ...l, token: await tokenFor(l) });
    const left = (await runSql(PROD_REF, `select (select count(*) from public.voice_use where user_id = '${l.id}')::int as uses, (select count(*) from public.speaking_result where user_id = '${l.id}')::int as results`)) as Array<Record<string, number>>;
    console.log(`cleanup: voice uses left ${left[0]?.uses}, results left ${left[0]?.results}`);
  },
};

const step = process.argv[2] ?? "";
if (!steps[step]) throw new Error(`usage: bun scripts/prod/plan9-checks.ts <${Object.keys(steps).join("|")}>`);
await steps[step]();
