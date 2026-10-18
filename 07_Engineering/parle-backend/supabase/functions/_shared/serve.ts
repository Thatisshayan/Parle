import { withCors } from "./cors.ts";
import { fail } from "./http.ts";
import { readLimitedRequestText } from "./rate-limit.ts";

export type Handler = (req: Request) => Response | Promise<Response>;
export type Guard = (req: Request) => Promise<Response | null>;

/**
 * Runs each guard on a copy of the request (body untouched), then the handler; browser origins limited (R8).
 * Anything that throws becomes a 500 that still carries the CORS headers, so the browser sees an error answer
 * instead of a network failure (R32).
 */
export function wrapHandler(handler: Handler, ...guards: Guard[]) {
  return async (req: Request): Promise<Response> => {
    try {
      if (req.method !== "OPTIONS") {
        for (const g of guards) {
          const stop = await g(req.clone());
          if (stop) return withCors(req, stop);
        }
      }
      return withCors(req, await handler(req));
    } catch (e) {
      console.error("unhandled function error", (e as Error)?.name, (e as Error)?.message);
      return withCors(req, fail("INTERNAL", 500, "Something went wrong. Please try again."));
    }
  };
}

export function serveWith(handler: Handler, ...guards: Guard[]) {
  Deno.serve(wrapHandler(handler, ...guards));
}

/** Enforce a byte cap on the original upload before guards clone/parse its body. */
export function serveWithLimitedBody(handler: Handler, maxBytes: number, ...guards: Guard[]) {
  Deno.serve(async (request) => {
    if (request.method === "OPTIONS" || request.method === "GET" || request.method === "HEAD" || !request.body) {
      return wrapHandler(handler, ...guards)(request);
    }
    const body = await readLimitedRequestText(request, maxBytes);
    if (body.kind === "too_large") return withCors(request, fail("REQUEST_TOO_LARGE", 413));
    if (body.kind !== "ok") return withCors(request, fail("REQUEST_INVALID", 400));
    const bounded = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: body.text,
      signal: request.signal,
    });
    return wrapHandler(handler, ...guards)(bounded);
  });
}
