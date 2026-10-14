import { describe, it, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { accessSql } from "../scripts/schema/generate-access-rules";
import { ENTITY_DIR } from "../scripts/spikes/readability";

describe("accessSql", () => {
  it("owner_read lets the signed-in owner select only", () => {
    const s = accessSql("learner_task", { tier: "owner_read" });
    expect(s).toContain('alter table public."learner_task" enable row level security;');
    expect(s).toContain('revoke all on public."learner_task" from anon, authenticated;');
    expect(s).toContain('grant select on public."learner_task" to authenticated;');
    expect(s).toContain("using (owner_id = auth.uid())");
    expect(s).not.toMatch(/grant (insert|update|delete)/);
  });
  it("participant_read compares participant columns to the caller id as text", () => {
    expect(accessSql("booking", { tier: "participant_read", participantColumns: ["learner_user_id", "tutor_user_id"] }))
      .toContain('using (owner_id = auth.uid() or "learner_user_id" = auth.uid()::text or "tutor_user_id" = auth.uid()::text)');
  });
  it("public_read grants only the listed safe columns to anon and authenticated, with the condition", () => {
    const s = accessSql("tutor_public_profile", { tier: "public_read", condition: "is_published = true", hiddenColumns: ["created_by", "owner_id"] }, ["id", "created_at", "created_by", "owner_id", "display_name"]);
    expect(s).toContain('grant select ("id", "created_at", "display_name") on public."tutor_public_profile" to anon, authenticated;');
    expect(s).not.toContain('grant select on public."tutor_public_profile"');
    expect(s).toContain("using (is_published = true)");
  });
  it("server_only grants nothing", () => {
    const s = accessSql("question_item", { tier: "server_only" });
    expect(s).not.toContain("grant");
    expect(s).not.toContain("create policy");
  });
  it("the tier map covers every entity exactly once", () => {
    const map = JSON.parse(readFileSync(`${import.meta.dir}/../schema/access-tiers.json`, "utf8"));
    const names = readdirSync(ENTITY_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", "")).sort();
    expect(Object.keys(map).sort()).toEqual(names);
  });
});
