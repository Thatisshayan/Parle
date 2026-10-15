import { handler } from "../_app/functions/parle-public-level-check.ts";
import { serveWith } from "../_shared/serve.ts";
import { publicLevelCheckLimit } from "../_shared/guards.ts";

serveWith(handler, publicLevelCheckLimit);
