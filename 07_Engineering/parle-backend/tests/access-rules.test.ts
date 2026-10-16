import { describe, it, expect, beforeAll } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";
import { makeUser } from "./helpers/users";

const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const anon = () => createClient(LOCAL_URL, localKeys().anon, { auth: { persistSession: false } });
let A: Awaited<ReturnType<typeof makeUser>>, B: Awaited<ReturnType<typeof makeUser>>, T: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  [A, B, T] = await Promise.all([makeUser("learner"), makeUser("learner"), makeUser("tutor")]);
  const s = service();
  await s.from("learner_task").insert([
    { owner_id: A.id, user_id: "shared-text", skill: "reading", minutes: 10 },
    { owner_id: B.id, user_id: "shared-text", skill: "speaking", minutes: 10 },
  ]);
  await s.from("question_item").insert({ owner_id: null });
  await s.from("tutor_public_profile").insert([{ owner_id: T.id, display_name: `Pub-${T.id}`, is_published: true }, { owner_id: T.id, display_name: `Draft-${T.id}`, is_published: false }]);
  const day = `2026-12-0${Math.floor(Math.random() * 9) + 1}`;
  await s.from("booking").insert({ learner_id: A.id, tutor_id: T.id, tutor_profile_id: "p", start_at: `${day}T10:00:00.000Z`, end_at: `${day}T10:30:00.000Z`, minutes: 30, price_cents: 1000, commission_pct: 20, status: "cancelled_learner" });
});

describe("owner_read", () => {
  it("a learner sees only their own task even when user_id text matches another learner's", async () => {
    const { data } = await A.client.from("learner_task").select("skill").eq("user_id", "shared-text");
    expect(data).toEqual([{ skill: "reading" }]);
  });
  it("a learner cannot insert, update or delete their own task from the browser", async () => {
    expect((await A.client.from("learner_task").insert({ owner_id: A.id, minutes: 5 })).error).not.toBeNull();
    await A.client.from("learner_task").update({ minutes: 999 }).eq("owner_id", A.id);
    await A.client.from("learner_task").delete().eq("owner_id", A.id);
    const { data } = await service().from("learner_task").select("minutes").eq("owner_id", A.id);
    expect(data).toEqual([{ minutes: 10 }]);
  });
});

describe("server_only", () => {
  it("nobody in the browser can read the question bank", async () => {
    expect((await A.client.from("question_item").select("id")).data ?? []).toEqual([]);
    expect((await anon().from("question_item").select("id")).data ?? []).toEqual([]);
  });
});

describe("public_read", () => {
  it("signed-out visitors see published tutor profiles only", async () => {
    // owner_id is hidden from anon (review finding 1), so look the rows up by their unique names.
    const { data } = await anon().from("tutor_public_profile").select("display_name").in("display_name", [`Pub-${T.id}`, `Draft-${T.id}`]);
    expect(data).toEqual([{ display_name: `Pub-${T.id}` }]);
  });
  it("signed-out visitors cannot read private learner tables", async () => {
    expect((await anon().from("learner_task").select("id")).data ?? []).toEqual([]);
  });
});

describe("participant_read", () => {
  it("the booked tutor and the learner both see the booking; another learner does not", async () => {
    expect(((await A.client.from("booking").select("id").eq("tutor_id", T.id)).data ?? []).length).toBe(1);
    expect(((await T.client.from("booking").select("id").eq("tutor_id", T.id)).data ?? []).length).toBe(1);
    expect(((await B.client.from("booking").select("id").eq("tutor_id", T.id)).data ?? []).length).toBe(0);
  });
});
