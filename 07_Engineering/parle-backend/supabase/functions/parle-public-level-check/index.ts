import { handler, setPreparedAudioLookup } from "../_app/functions/parle-public-level-check.ts";
import { serveWith } from "../_shared/serve.ts";
import { publicLevelCheckLimit } from "../_shared/guards.ts";
import { serviceClient } from "../_shared/db.ts";
import { preparedAudioUrls } from "../_shared/voice/listening.ts";

// Plan 13: listening questions play a real recording (audio_url) or audio already made from the transcript; the
// transcript itself never reaches the browser
setPreparedAudioLookup(async (rows) => {
  const out = new Map<string, string>();
  const withoutRecording: Array<{ id: string; script: unknown }> = [];
  for (const row of rows) {
    const id = String(row.id ?? "");
    const recording = typeof row.audio_url === "string" ? row.audio_url.trim() : "";
    if (recording) out.set(id, recording); else withoutRecording.push({ id, script: row.transcript });
  }
  for (const [id, url] of await preparedAudioUrls(serviceClient(), "question_item", withoutRecording)) out.set(id, url);
  return out;
});

serveWith(handler, publicLevelCheckLimit);
