const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
/** Error body in the shape the app already reads from Buildy's functions: { error, error_code, message }. */
export const fail = (code: string, status: number, message = code) => json({ error: code, error_code: code, message }, status);
export const preflight = (req: Request) => (req.method === "OPTIONS" ? new Response("ok", { headers: CORS }) : null);
