import { describe, it, expect } from "bun:test";
import { ruleAllows, ruleToFilter } from "../supabase/functions/_shared/rules";
import rules from "../supabase/functions/_shared/entity-rules.json";
import { generateEntityRules } from "../scripts/schema/generate-entity-rules";

const learner = { id: "u1", email: "a@b.c", full_name: null, role: "user" as const };
const admin = { ...learner, id: "ad", email: "admin@b.c", role: "administrator" as const };
const own = { created_by: "{{user.email}}" };
const ownOrAdmin = { $or: [{ created_by: "{{user.email}}" }, { user_condition: { role: "administrator" } }] };

describe("Buildy rules", () => {
  it("the committed rules file matches entities/*.json", () => {
    expect(rules).toEqual(generateEntityRules());
    expect(Object.keys(rules).length).toBe(36);
  });
  it("evaluates templates, user conditions, $or and $and on a row", () => {
    expect(ruleAllows(own, learner, { created_by: "a@b.c" })).toBe(true);
    expect(ruleAllows(own, learner, { created_by: "x@b.c" })).toBe(false);
    expect(ruleAllows(ownOrAdmin, admin, { created_by: "x@b.c" })).toBe(true);
    expect(ruleAllows({ $and: [own, { premium_comp_active: false }] }, learner, { created_by: "a@b.c", premium_comp_active: true })).toBe(false);
    expect(ruleAllows(undefined as any, learner, {})).toBe(false);
    expect(ruleAllows({ $and: [{ created_by: "__audit_immutable_condition_a__" }, { created_by: "__audit_immutable_condition_b__" }] }, admin, { created_by: "x" })).toBe(false);
  });
  it("turns a read rule into a PostgREST condition", () => {
    expect(ruleToFilter(own, learner)).toEqual({ kind: "where", expr: 'created_by.eq."a@b.c"' });
    expect(ruleToFilter(ownOrAdmin, admin)).toEqual({ kind: "all" });
    expect(ruleToFilter({ user_condition: { role: "administrator" } }, learner)).toEqual({ kind: "none" });
    expect(ruleToFilter({ $or: [own, { tutor_user_id: "{{user.id}}" }] }, learner)).toEqual({ kind: "where", expr: 'or(created_by.eq."a@b.c",tutor_user_id.eq."u1")' });
    expect(ruleToFilter({ $or: [{ user_condition: { role: "administrator" } }, { $and: [{ user_condition: { role: "user" } }, { is_published: true }] }] }, learner))
      .toEqual({ kind: "where", expr: "is_published.is.true" });
  });
});
