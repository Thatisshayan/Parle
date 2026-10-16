import { describe, it, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./helpers/local";

const service = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
const anon = () => createClient(LOCAL_URL, localKeys().anon, { auth: { persistSession: false } });
const iso = () => new Date(Date.UTC(2027, 0, 1 + Math.floor(Math.random() * 300), 10)).toISOString();

describe("public tables never expose emails or owner ids (review finding 1)", () => {
  it("anon cannot select created_by, owner_id or tutor_user_id of a published profile", async () => {
    await service().from("tutor_public_profile").insert({ display_name: "Col", is_published: true, created_by: "tutor@example.test" });
    for (const col of ["created_by", "owner_id", "tutor_user_id"]) {
      const { error } = await anon().from("tutor_public_profile").select(col).limit(1);
      expect({ col, denied: !!error }).toEqual({ col, denied: true });
    }
    const ok = await anon().from("tutor_public_profile").select("display_name").eq("display_name", "Col");
    expect(ok.error).toBeNull();
  });
  it("anon cannot select tutor_email or created_by of reviews and replies", async () => {
    for (const [table, col] of [["tutor_review", "tutor_email"], ["tutor_review", "created_by"], ["tutor_review_reply", "tutor_email"], ["tutor_review_reply", "created_by"]]) {
      const { error } = await anon().from(table).select(col).limit(1);
      expect({ table, col, denied: !!error }).toEqual({ table, col, denied: true });
    }
  });
});

describe("replies follow their review's visibility (finding 2)", () => {
  it("a reply to a hidden review is not public; a reply to a visible review is", async () => {
    const s = service();
    const hidden = (await s.from("tutor_review").insert({ stars: 1, is_visible: false }).select("id").single()).data!;
    const shown = (await s.from("tutor_review").insert({ stars: 5, is_visible: true, is_test_review: false }).select("id").single()).data!;
    await s.from("tutor_review_reply").insert([{ review_id: hidden.id, reply_text: "to-hidden" }, { review_id: shown.id, reply_text: "to-shown" }]);
    const { data } = await anon().from("tutor_review_reply").select("reply_text").in("review_id", [hidden.id, shown.id]);
    expect(data).toEqual([{ reply_text: "to-shown" }]);
  });
});

describe("empty keys do not collide (finding 3)", () => {
  it("allows several rows whose key parts are empty strings", async () => {
    const s = service();
    for (const [table, row] of [
      ["week_plan", { user_id: "", week_start_local: "", status: "active" }],
      ["ParleCoachNote", { user_id: "", local_date: "" }],
      ["tutor_booking_settings", { tutor_user_id: "" }],
    ] as const) {
      expect({ table, error: (await s.from(table).insert(row)).error?.code ?? null }).toEqual({ table, error: null });
      expect({ table, error: (await s.from(table).insert(row)).error?.code ?? null }).toEqual({ table, error: null });
    }
  });
});

describe("canonical time and date text (finding 5)", () => {
  it("rejects a coach-note date and a week start that are not YYYY-MM-DD", async () => {
    expect((await service().from("ParleCoachNote").insert({ user_id: crypto.randomUUID(), local_date: "14/10/2026" })).error?.code).toBe("23514");
    expect((await service().from("week_plan").insert({ user_id: crypto.randomUUID(), week_start_local: "2026-10-12T00:00", status: "active" })).error?.code).toBe("23514");
  });
});

describe("increment_usage rejects bad arguments (finding 7)", () => {
  const call = (o: Record<string, unknown>) => service().rpc("increment_usage", { p_user_id: crypto.randomUUID(), p_period: "day", p_period_key: "2026-10-14", p_owner: null, p_amount: 1, p_limit: 10, ...o });
  it("raises on a missing or empty key, a missing limit, or a non-positive amount", async () => {
    for (const bad of [{ p_user_id: null }, { p_user_id: "" }, { p_period: null }, { p_period_key: "" }, { p_limit: null }, { p_amount: 0 }, { p_amount: -3 }]) {
      expect({ bad, failed: !!(await call(bad)).error }).toEqual({ bad, failed: true });
    }
    expect((await call({})).data?.ok).toBe(true);
  });
});
