/** The app's own addresses (function setting APP_ORIGINS, comma separated). */
export function allowedOrigins(): string[] {
  return (Deno.env.get("APP_ORIGINS") ?? "").split(",").map((o) => o.trim()).filter(Boolean);
}

/**
 * Browsers may call the functions only from the app's own addresses (R8). Every response gets the request's origin
 * echoed back when it is listed, and no allow-origin header otherwise; this overrides "*" and Buildy's own echo.
 */
export function withCors(req: Request, res: Response): Response {
  const origin = req.headers.get("Origin") ?? "";
  const headers = new Headers(res.headers);
  if (origin && allowedOrigins().includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  } else {
    headers.delete("Access-Control-Allow-Origin");
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
