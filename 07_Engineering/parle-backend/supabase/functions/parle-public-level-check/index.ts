import { handler, setPreparedAudioLookup } from "../_app/functions/parle-public-level-check.ts";
import { serveWithLimitedBody } from "../_shared/serve.ts";
import { publicLevelCheckLimit } from "../_shared/guards.ts";
import { serviceClient } from "../_shared/db.ts";
import { publicAudioHooks } from "../_shared/voice/public-audio.ts";

// Plan 13: listening questions play a real recording or audio already made from the transcript; the transcript itself
// never reaches the browser. Only the questions shown are signed (final review).
setPreparedAudioLookup(publicAudioHooks(serviceClient()));

serveWithLimitedBody(handler, 32_000, publicLevelCheckLimit);
