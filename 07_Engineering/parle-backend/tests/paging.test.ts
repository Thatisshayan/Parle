import { describe, it, expect } from "bun:test";
import { allPages } from "../supabase/functions/_shared/paging";

describe("allPages", () => {
  it("reads past the first page until a short page", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => i);
    const asked: number[] = [];
    const all = await allPages(async (offset, size) => { asked.push(offset); return rows.slice(offset, offset + size); }, 500);
    expect(all.length).toBe(1001);
    expect(asked).toEqual([0, 500, 1000]);
  });
  it("stops after an exactly full last page with one more empty read", async () => {
    expect((await allPages(async (offset, size) => (offset < 200 ? new Array(size).fill(1) : []), 100)).length).toBe(200);
  });
  it("refuses to loop forever", async () => {
    await expect(allPages(async (_o, size) => new Array(size).fill(1), 10, 3)).rejects.toThrow("more than 3 pages");
  });
});
