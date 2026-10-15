export type Handler = (req: Request) => Response | Promise<Response>;
export type Guard = (req: Request) => Promise<Response | null>;

/** Runs each guard on a copy of the request (body untouched), then the handler. */
export function serveWith(handler: Handler, ...guards: Guard[]) {
  Deno.serve(async (req) => {
    if (req.method !== "OPTIONS") {
      for (const g of guards) {
        const stop = await g(req.clone());
        if (stop) return stop;
      }
    }
    return handler(req);
  });
}
