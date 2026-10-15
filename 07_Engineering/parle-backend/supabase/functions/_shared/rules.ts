export type BuildyUser = { id: string; email: string; full_name: string | null; role: "administrator" | "user" };
export type Rule = Record<string, unknown>;
export type RuleFilter = { kind: "all" } | { kind: "none" } | { kind: "where"; expr: string };

const template = (v: unknown, u: BuildyUser) => (v === "{{user.email}}" ? u.email : v === "{{user.id}}" ? u.id : v);
const userMatches = (cond: unknown, u: BuildyUser) =>
  !!cond && typeof cond === "object" && Object.entries(cond as Rule).every(([k, v]) => (u as Record<string, unknown>)[k] === v);

/** Does Buildy's rule allow this user on this row? A missing rule allows nothing. */
export function ruleAllows(rule: Rule | undefined, user: BuildyUser, row: Record<string, unknown>): boolean {
  if (!rule || typeof rule !== "object") return false;
  return Object.entries(rule).every(([key, value]) => {
    if (key === "$or") return Array.isArray(value) && value.some((r) => ruleAllows(r as Rule, user, row));
    if (key === "$and") return Array.isArray(value) && value.every((r) => ruleAllows(r as Rule, user, row));
    if (key === "user_condition") return userMatches(value, user);
    return row[key] === template(value, user);
  });
}

const quote = (v: unknown) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const leaf = (k: string, v: unknown) => (typeof v === "boolean" || v === null ? `${k}.is.${v}` : `${k}.eq.${quote(v)}`);

function combine(op: "or" | "and", parts: RuleFilter[]): RuleFilter {
  const where = parts.filter((p): p is { kind: "where"; expr: string } => p.kind === "where");
  if (op === "or") {
    if (parts.some((p) => p.kind === "all")) return { kind: "all" };
    if (!where.length) return { kind: "none" };
  } else {
    if (parts.some((p) => p.kind === "none")) return { kind: "none" };
    if (!where.length) return { kind: "all" };
  }
  return { kind: "where", expr: where.length === 1 ? where[0].expr : `${op}(${where.map((w) => w.expr).join(",")})` };
}

/** Buildy's read rule as a PostgREST logic expression for `.or(expr)`, or all / none. */
export function ruleToFilter(rule: Rule | undefined, user: BuildyUser): RuleFilter {
  if (!rule || typeof rule !== "object") return { kind: "none" };
  return combine("and", Object.entries(rule).map(([key, value]): RuleFilter => {
    if (key === "$or" || key === "$and") return combine(key === "$or" ? "or" : "and", (Array.isArray(value) ? value : []).map((r) => ruleToFilter(r as Rule, user)));
    if (key === "user_condition") return userMatches(value, user) ? { kind: "all" } : { kind: "none" };
    return { kind: "where", expr: leaf(key, template(value, user)) };
  }));
}
