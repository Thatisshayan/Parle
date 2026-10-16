import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./local";
import { callFunction, functionsEnv } from "./functions-env";
import { onboardedLearner } from "./learners";

export const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
export const FRENCH_ANSWER = "Le week-end dernier, je suis allé au marché avec ma sœur. Nous avons acheté des légumes frais et du pain, puis nous avons pris un café sur la terrasse parce qu'il faisait très beau.";
export const relayHeaders = () => ({ "x-voice-secret": functionsEnv().VOICE_RELAY_SECRET });

/** parle-voice-service the way the app calls it, or (relay = true) the way the relay calls it. */
export const voice = (token: string, body: Record<string, unknown>, relay = false) => callFunction("parle-voice-service", token, body, relay ? relayHeaders() : {});

/** An onboarded learner (America/Toronto) with an open speaking task: the plan's own, or a task turned into one. */
export async function learnerWithSpeakingTask() {
  const { u, t } = await onboardedLearner();
  const plan = (await callFunction("parle-plan-service", t, { action: "get_or_create_plan", options: {} })).body.result;
  const open = (x: any) => x.status === "planned" || x.status === "rolled";
  let task = plan.tasks.find((x: any) => (x.type === "speaking_check" || x.type === "speaking_practice") && open(x));
  if (!task) {
    task = plan.tasks.find((x: any) => x.type !== "weekly_checkin" && x.type !== "tutor_lesson" && open(x));
    const { error } = await service().from("learner_task").update({ type: "speaking_practice", skill: "speaking", status: "planned" }).eq("id", task.id);
    if (error) throw error;
  }
  const { data, error } = await service().from("learner_task").select("id, roadmap_id").eq("id", task.id).single();
  if (error) throw error;
  return { u, t, taskId: String(data.id), roadmapId: String(data.roadmap_id) };
}

/** Takes an answer unit and saves one transcript part, as the relay does after Whisper answers. */
export async function recordedAnswer(t: string, ref: string, transcript = FRENCH_ANSWER, durationMs = 30_000, kind = "answer") {
  const take = await voice(t, { action: "voice_take", kind, ref }, true);
  if (take.status !== 200) return { take, part: null, ticketId: "" };
  const part = await voice(t, { action: "voice_part", ticket_id: take.body.ticket_id, part: 1, transcript, duration_ms: durationMs }, true);
  return { take, part, ticketId: String(take.body.ticket_id) };
}

export async function tutorSession(userId: string, email: string): Promise<string> {
  const { data, error } = await service().from("ai_session").insert({ owner_id: userId, created_by: email, user_id: userId, mode: "speaking", skill: "speaking", topic: "" }).select("id").single();
  if (error) throw error;
  return String(data.id);
}

export async function tutorReply(userId: string, email: string, text: string): Promise<string> {
  const session = await tutorSession(userId, email);
  const { data, error } = await service().from("ai_message").insert({ owner_id: userId, created_by: email, user_id: userId, session_id: session, sender: "tutor_ai", text, transcript: "", feedback_json: "{}", skill: "speaking", topic: "" }).select("id").single();
  if (error) throw error;
  return String(data.id);
}

export async function makePremium(userId: string) {
  const { error } = await service().from("ParleIdentity").update({ premium_comp_active: true }).eq("owner_id", userId);
  if (error) throw error;
}

/** Saves a setting as the admin page does (newest row wins); returns the undo. */
export async function setSetting(key: string, value: number): Promise<() => Promise<void>> {
  // another test may already have created the defaults (app_setting has one row per key): change it, then restore it
  const { data: before } = await service().from("app_setting").select("id, value").eq("key", key).maybeSingle();
  if (before) {
    const { error } = await service().from("app_setting").update({ value: JSON.stringify(value), updated_by: "plan9-test" }).eq("id", before.id);
    if (error) throw error;
    return async () => { await service().from("app_setting").update({ value: before.value }).eq("id", before.id); };
  }
  const { data, error } = await service().from("app_setting").insert({ key, value: JSON.stringify(value), updated_by: "plan9-test" }).select("id").single();
  if (error) throw error;
  return async () => { await service().from("app_setting").delete().eq("id", data.id); };
}

export async function pause(userId: string) {
  const { error } = await service().auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  if (error) throw error;
}
