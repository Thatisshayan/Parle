import { handler } from "../_app/functions/parle-assessment-service.ts";
import { serveWithLimitedBody } from "../_shared/serve.ts";
import { aiActionLimit } from "../_shared/guards.ts";

serveWithLimitedBody(handler, 256 * 1024, aiActionLimit);
