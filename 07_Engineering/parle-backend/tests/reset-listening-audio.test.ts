import { describe, it, expect } from "bun:test";
import { resetBefore } from "../scripts/prod/reset-listening-audio";
import { service } from "./helpers/voice";

const BUCKET = "listening-audio";
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0, 0, 0, 0, 0]);

async function madeAt(readyAt: string) {
  const id = crypto.randomUUID(), path = `reset-test/${id}.mp3`;
  const up = await service().storage.from(BUCKET).upload(path, MP3, { contentType: "audio/mpeg" });
  if (up.error) throw up.error;
  const { error } = await service().from("listening_audio").insert({
    cache_key: `reset-test:${id}`, item_kind: "question_item", item_id: id, script_hash: "h", path, status: "ready", ready_at: readyAt,
  });
  if (error) throw error;
  return { key: `reset-test:${id}`, path };
}
const rowExists = async (key: string) => ((await service().from("listening_audio").select("cache_key").eq("cache_key", key)).data ?? []).length === 1;
const fileExists = async (path: string) => !(await service().storage.from(BUCKET).download(path)).error;

describe("the listening-audio reset (Plan 11: A102)", () => {
  it("removes audio made before the cut, file then row; keeps later audio", async () => {
    const old = await madeAt("2026-10-16T12:00:00Z"), kept = await madeAt("2026-10-17T01:00:00Z");
    const counted = await resetBefore(service() as any, "2026-10-16T23:00:00Z", { dryRun: true });
    expect(counted.found).toBeGreaterThanOrEqual(1);
    expect(await rowExists(old.key)).toBe(true);
    const done = await resetBefore(service() as any, "2026-10-16T23:00:00Z");
    expect(done.deleted).toBeGreaterThanOrEqual(1);
    expect([await rowExists(old.key), await fileExists(old.path)]).toEqual([false, false]);
    expect([await rowExists(kept.key), await fileExists(kept.path)]).toEqual([true, true]);
    await service().storage.from(BUCKET).remove([kept.path]);
    await service().from("listening_audio").delete().eq("cache_key", kept.key);
  }, 30000);
});
