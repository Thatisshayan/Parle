import { describe, it, expect } from "bun:test";
import { prepareAll } from "../scripts/prod/prepare-listening-audio";

describe("preparing listening audio for the whole bank (Plan 13)", () => {
  it("makes each missing item once, carries on past a failure, and reports counts", async () => {
    const seen: string[] = [];
    const counts = await prepareAll(
      [{ item_kind: "question_item", item_id: "a" }, { item_kind: "question_item", item_id: "b" }, { item_kind: "question_item", item_id: "c" }],
      async (item) => { seen.push(item.item_id); return item.item_id === "b" ? { status: 503 } : { status: 200, generated: true }; },
      { pauseMs: 0 },
    );
    expect(seen).toEqual(["a", "b", "c"]);
    expect(counts).toEqual({ made: 2, already: 0, failed: 1 });
  });
  it("an item made meanwhile by someone else counts as already there", async () => {
    const counts = await prepareAll([{ item_kind: "question_item", item_id: "a" }], async () => ({ status: 200, generated: false }), { pauseMs: 0 });
    expect(counts).toEqual({ made: 0, already: 1, failed: 0 });
  });
});
