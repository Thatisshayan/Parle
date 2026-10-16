import { describe, it, expect } from "bun:test";
import { callFunction } from "./helpers/functions-env";
import { bookableTutor, learner, seedConfirmed, service } from "./helpers/lessons";

describe("lesson notes feed the weekly plan (spec section 6)", () => {
  it("the plan service passes the tutor's struggling skills; estimates do not change", async () => {
    const { profileId, tutor } = await bookableTutor();
    const { u, t } = await learner();
    const done = await seedConfirmed({ learnerId: u.id, tutorId: tutor.id, profileId, start: new Date(Date.now() - 2 * 86_400_000).toISOString(), status: "completed" });
    await service().from("lesson_notes").insert({ booking_id: done.bookingId, skills: { writing: "struggling", reading: "strong" }, notes: "" });
    const r = await callFunction("parle-plan-service", t, { action: "get_or_create_plan", options: {} });
    expect(r.status).toBe(200);
    expect(r.body.result.tutorFocusSkills).toEqual(["writing"]);
    const before = (await service().from("skill_estimate").select("skill, value").eq("user_id", u.id).order("skill")).data;
    await callFunction("parle-plan-service", t, { action: "get_or_create_plan", options: {} });
    expect((await service().from("skill_estimate").select("skill, value").eq("user_id", u.id).order("skill")).data).toEqual(before);
  }, 60000);
});
