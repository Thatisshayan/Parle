import { handler } from "../_app/functions/parle-assessment-service.ts";
import { serveWith } from "../_shared/serve.ts";
import { aiActionLimit } from "../_shared/guards.ts";

serveWith(handler, aiActionLimit);
