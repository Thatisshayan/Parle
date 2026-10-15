import { handler } from "../_app/functions/parle-marketplace-service.ts";
import { serveWith } from "../_shared/serve.ts";

serveWith(handler);
