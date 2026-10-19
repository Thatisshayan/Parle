import { handler } from "../_app/functions/parle-marketplace-service.ts";
import { serveWithLimitedBody } from "../_shared/serve.ts";

// Keep the handler's existing 2 MiB JSON contract, but enforce it while streaming.
serveWithLimitedBody(handler, 2 * 1024 * 1024);
