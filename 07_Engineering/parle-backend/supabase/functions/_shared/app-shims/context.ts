import { AsyncLocalStorage } from "node:async_hooks";
import type { createSuperdevClient } from "../superdev-compat.ts";

/** aiDeadline: after this time (ms since epoch), background AI practice requests fall back at once (decision #49). */
export type AppContext = { client: ReturnType<typeof createSuperdevClient>; token: string; aiDeadline?: number };
/** The current request's caller for app code that imports @/entities and @/functions (one worker serves many requests). */
export const appContext = new AsyncLocalStorage<AppContext>();
export function current(): AppContext {
  const c = appContext.getStore();
  if (!c) throw new Error("App code ran outside a request");
  return c;
}
