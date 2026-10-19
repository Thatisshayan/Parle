/** Translates Buildy's filter(query, sort, limit, skip) into PostgREST calls (backend Plan 1 filter report). */
export function parseSort(sort?: string): { column: string; ascending: boolean } | null {
  if (!sort) return null;
  return sort.startsWith("-") ? { column: sort.slice(1), ascending: false } : { column: sort, ascending: true };
}

const OPS: Record<string, string> = { $ne: "neq", $gt: "gt", $gte: "gte", $lt: "lt", $lte: "lte", $in: "in" };

function queryMethod(query: unknown, method: string, ...args: unknown[]): unknown {
  if (!query || typeof query !== "object" || Array.isArray(query)) throw new Error("A query method is unavailable.");
  const candidate = (query as Record<string, unknown>)[method];
  if (typeof candidate !== "function") throw new Error(`A query method is unavailable: ${method}`);
  const result: unknown = candidate.apply(query, args);
  return result && typeof result === "object" ? result : query;
}

export function applyBuildyQuery<Q>(query: Q, filters: Record<string, unknown>, sort?: string, limit?: number, skip?: number): Q {
  let q: unknown = query;
  for (const [field, value] of Object.entries(filters ?? {})) {
    if (value === null) { q = queryMethod(q, "is", field, null); continue; }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [op, v] of Object.entries(value as Record<string, unknown>)) {
        if (op === "$nin") {
          if (!Array.isArray(v)) throw new Error(`Unsupported filter operator ${op} on ${field}`);
          q = queryMethod(q, "not", field, "in", `(${v.map((x) => JSON.stringify(x)).join(",")})`);
        }
        else if (OPS[op]) q = queryMethod(q, OPS[op], field, v);
        else throw new Error(`Unsupported filter operator ${op} on ${field}`);
      }
      continue;
    }
    q = queryMethod(q, "eq", field, value);
  }
  const order = parseSort(sort);
  // Ties (many rows share created_at when created in one batch) get a stable final order by id, so paging is repeatable.
  if (order) {
    q = queryMethod(q, "order", order.column, { ascending: order.ascending });
    q = queryMethod(q, "order", "id", { ascending: true });
  }
  if (limit) q = queryMethod(q, "range", skip ?? 0, (skip ?? 0) + limit - 1);
  return q as Q;
}
