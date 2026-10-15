import { AsyncLocalStorage } from "node:async_hooks";
import type { createSuperdevClient } from "../superdev-compat.ts";

export type AppContext = { client: ReturnType<typeof createSuperdevClient>; token: string };
/** The current request's caller for app code that imports @/entities and @/functions (one worker serves many requests). */
export const appContext = new AsyncLocalStorage<AppContext>();
export function current(): AppContext {
  const c = appContext.getStore();
  if (!c) throw new Error("App code ran outside a request");
  return c;
}
