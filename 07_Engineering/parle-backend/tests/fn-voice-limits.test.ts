import { describe, it, expect, beforeAll, setDefaultTimeout } from "bun:test";
import { seedLocalContent } from "../scripts/seed-local-content";
import { onboardedLearner } from "./helpers/learners";
import { learnerDay } from "../supabase/functions/_shared/voice/context";
import { learnerWithSpeakingTask, makePremium, pause, recordedAnswer, service, setSetting, tutorReply, tutorSession, voice } from "./helpers/voice";

setDefaultTimeout(60_000);
beforeAll(async () => { await seedLocalContent(); });

describe("voice limits (parle-voice-service)", () => {
  it("a Free learner gets 2 recorded answers a day; the third is refused with the limit and the plan", async () => {
    const { t, taskId } = await learnerWithSpeakingTask();
    expect((await recordedAnswer(t, taskId)).take.status).toBe(200);
    expect((await recordedAnswer(t, taskId)).take.status).toBe(200);
    const third = await recordedAnswer(t, taskId);
    expect(third.take.status).toBe(429);
    expect(third.take.body).toMatchObject({ error_code: "LIMIT_REACHED", kind: "answer", plan: "free", limit: 2 });
    expect((await voice(t, { action: "voice_status" })).body.answers).toEqual({ limit: 2, used: 2, remaining: 0 });
  });
  it("a Premium learner gets the Premium limits", async () => {
    const { u, t } = await onboardedLearner();
    await makePremium(u.id);
    const s = (await voice(t, { action: "voice_status" })).body;
    expect([s.plan, s.answers.limit, s.messages.limit, s.replies.limit]).toEqual(["premium", 15, 60, 200]);
  });
  it("an administrator's new limit applies at once", async () => {
    const undo = await setSetting("free_voice_messages_per_day", 1);
    try {
      const { u, t } = await onboardedLearner();
      const session = await tutorSession(u.id, u.email);
      expect((await voice(t, { action: "voice_take", kind: "message", ref: session }, true)).status).toBe(200);
      const second = await voice(t, { action: "voice_take", kind: "message", ref: session }, true);
      expect([second.status, second.body.limit]).toEqual([429, 1]);
    } finally {
      await undo();
    }
  });
  it("a voice message that heard nothing gives its use back (Review Focus 1)", async () => {
    const { u, t } = await onboardedLearner();
    const session = await tutorSession(u.id, u.email);
    const take = await voice(t, { action: "voice_take", kind: "message", ref: session }, true);
    const part = await voice(t, { action: "voice_part", ticket_id: take.body.ticket_id, part: 1, transcript: "Sous-titres réalisés par la communauté d'Amara.org", duration_ms: 4000 }, true);
    expect([part.status, part.body.transcript, part.body.words]).toEqual([200, "", 0]);
    expect((await voice(t, { action: "voice_status" })).body.messages.used).toBe(0);
  });
  it("a reply read again or in pieces counts once; text that is not in the learner's own reply is refused (Review Focus 5)", async () => {
    const { u, t } = await onboardedLearner();
    const id = await tutorReply(u.id, u.email, "Très bien ! Here is a small correction.\nJe suis allé au marché. Nous avons acheté du pain.");
    const first = await voice(t, { action: "voice_take", kind: "reply", ref: id, text: "Très bien ! Je suis allé au marché." }, true);
    expect(first.status).toBe(200);
    const again = await voice(t, { action: "voice_take", kind: "reply", ref: id, text: "Nous avons acheté du pain." }, true);
    expect(again.body).toMatchObject({ again: true, used: 1 });
    const foreign = await voice(t, { action: "voice_take", kind: "reply", ref: id, text: "Bonjour, je vends des voitures pas chères." }, true);
    expect([foreign.status, foreign.body.error_code]).toEqual([403, "TEXT_NOT_IN_REPLY"]);
    const other = await onboardedLearner();
    expect((await voice(other.t, { action: "voice_take", kind: "reply", ref: id, text: "Je suis allé au marché." }, true)).status).toBe(404);
    expect((await voice(t, { action: "voice_status" })).body.replies.used).toBe(1);
  });
  it("only the relay may take units or save transcripts", async () => {
    const { t, taskId } = await learnerWithSpeakingTask();
    const r = await voice(t, { action: "voice_take", kind: "answer", ref: taskId });
    expect([r.status, r.body.error_code]).toEqual([403, "RELAY_ONLY"]);
  });
  it("a bad token and a paused account are refused", async () => {
    expect((await voice("not-a-token", { action: "voice_status" }, true)).status).toBe(401);
    const { u, t } = await onboardedLearner();
    expect((await voice(t, { action: "voice_status" })).status).toBe(200);
    await pause(u.id);
    expect((await voice(t, { action: "voice_take", kind: "message", ref: "x" }, true)).status).toBe(401);
  });
  it("parts arrive in order, at most four, and none after the answer is closed (Review Focus 4)", async () => {
    const { t, taskId } = await learnerWithSpeakingTask();
    const { ticketId } = await recordedAnswer(t, taskId, "Première partie de ma réponse sur mon travail.", 60_000);
    const take = (n: number, ticket = ticketId, token = t) => voice(token, { action: "voice_take", kind: "answer", ref: taskId, part: n, ticket_id: ticket }, true);
    const part = (n: number, ms: number) => voice(t, { action: "voice_part", ticket_id: ticketId, part: n, transcript: `Partie ${n} de ma réponse.`, duration_ms: ms }, true);
    expect((await take(3)).status).toBe(409);
    expect((await take(2)).status).toBe(200);
    expect((await part(3, 10_000)).status).toBe(409);
    expect((await part(2, 60_000)).body.total_ms).toBe(120_000);
    expect((await take(3)).status).toBe(200);
    expect((await part(3, 60_000)).body.total_ms).toBe(180_000);
    expect((await take(4)).status).toBe(200);
    expect((await part(4, 3_000)).body.total_ms).toBe(183_000);
    expect((await take(5)).status).toBe(409);
    const other = await onboardedLearner();
    expect((await take(2, ticketId, other.t)).status).toBe(409);
    const second = await recordedAnswer(t, taskId);
    await voice(t, { action: "voice_release", ticket_id: second.ticketId }, true);
    expect((await take(2, second.ticketId)).status).toBe(409);
  });
  it("a use just before and just after the learner's local midnight counts on two days (Review Focus 3)", async () => {
    const { u } = await onboardedLearner(); // America/Toronto: UTC-4 in October
    const before = await learnerDay(service(), u.id, new Date("2026-10-17T03:59:00Z"));
    const after = await learnerDay(service(), u.id, new Date("2026-10-17T04:01:00Z"));
    expect([before.day, after.day, before.zone]).toEqual(["2026-10-16", "2026-10-17", "America/Toronto"]);
    for (const day of [before.day, after.day]) {
      const { data } = await service().rpc("voice_take", { p_user: u.id, p_kind: "answer", p_day: day, p_limit: 1, p_ref: "" });
      expect(data.ok).toBe(true);
    }
  });
  it("the read-aloud switch is off by default and remembered", async () => {
    const { t } = await onboardedLearner();
    expect((await voice(t, { action: "voice_status" })).body.read_aloud).toBe(false);
    expect((await voice(t, { action: "voice_set_read_aloud", read_aloud: true })).body.read_aloud).toBe(true);
    expect((await voice(t, { action: "voice_status" })).body.read_aloud).toBe(true);
  });
});
