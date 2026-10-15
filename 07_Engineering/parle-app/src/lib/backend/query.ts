/** Translates Buildy's filter(query, sort, limit, skip) into PostgREST calls (backend Plan 1 filter report). */
export function parseSort(sort?: string): { column: string; ascending: boolean } | null {
  if (!sort) return null;
  return sort.startsWith("-") ? { column: sort.slice(1), ascending: false } : { column: sort, ascending: true };
}

const OPS: Record<string, string> = { $ne: "neq", $gt: "gt", $gte: "gte", $lt: "lt", $lte: "lte", $in: "in" };

export function applyBuildyQuery<Q>(query: Q, filters: Record<string, unknown>, sort?: string, limit?: number, skip?: number): Q {
  let q: any = query;
  for (const [field, value] of Object.entries(filters ?? {})) {
    if (value === null) { q = q.is(field, null); continue; }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [op, v] of Object.entries(value as Record<string, unknown>)) {
        if (op === "$nin") q = q.not(field, "in", `(${(v as unknown[]).map((x) => JSON.stringify(x)).join(",")})`);
        else if (OPS[op]) q = q[OPS[op]](field, v);
        else throw new Error(`Unsupported filter operator ${op} on ${field}`);
      }
      continue;
    }
    q = q.eq(field, value);
  }
  const order = parseSort(sort);
  if (order) q = q.order(order.column, { ascending: order.ascending });
  if (limit) q = q.range(skip ?? 0, (skip ?? 0) + limit - 1);
  return q as Q;
}
