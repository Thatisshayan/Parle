import { describe, it, expect } from "bun:test";
import { applyBuildyQuery, parseSort } from "./query";

function recorder() {
  const calls: string[] = [];
  const q: unknown = new Proxy({}, { get: (_t, name: string) => (...args: unknown[]) => { calls.push(`${name}(${args.map((a) => JSON.stringify(a)).join(",")})`); return q; } });
  return { q, calls };
}

describe("parseSort", () => {
  it("reads a leading minus as descending", () => {
    expect(parseSort("-created_at")).toEqual({ column: "created_at", ascending: false });
    expect(parseSort("date_local")).toEqual({ column: "date_local", ascending: true });
    expect(parseSort("")).toBeNull();
    expect(parseSort(undefined)).toBeNull();
  });
});

describe("applyBuildyQuery", () => {
  it("turns each filter key into an equality and null into is-null", () => {
    const { q, calls } = recorder();
    applyBuildyQuery(q, { created_by: "a@b.c", status: "done", completed_at_utc: null });
    expect(calls).toEqual(['eq("created_by","a@b.c")', 'eq("status","done")', 'is("completed_at_utc",null)']);
  });
  it("applies sort, limit and skip as order and range", () => {
    const { q, calls } = recorder();
    applyBuildyQuery(q, {}, "-created_at", 10, 20);
    expect(calls).toEqual(['order("created_at",{"ascending":false})', 'order("id",{"ascending":true})', "range(20,29)"]);
  });
  it("applies a limit without skip", () => {
    const { q, calls } = recorder();
    applyBuildyQuery(q, {}, undefined, 5);
    expect(calls).toEqual(["range(0,4)"]);
  });
  it("supports the operators Buildy accepted ($ne, $gt, $gte, $lt, $lte, $in, $nin)", () => {
    const { q, calls } = recorder();
    applyBuildyQuery(q, { a: { $ne: 1 }, b: { $gte: 2, $lt: 5 }, c: { $in: ["x", "y"] }, d: { $nin: ["z"] } });
    expect(calls).toEqual(['neq("a",1)', 'gte("b",2)', 'lt("b",5)', 'in("c",["x","y"])', 'not("d","in","(\\"z\\")")']);
  });
});
