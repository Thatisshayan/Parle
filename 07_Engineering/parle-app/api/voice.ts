import { handleVoice } from "./_voice/handler.js";

/** Plan 9 voice relay (spec section 3): a Vercel Node function, POST only. */
export async function POST(request: Request): Promise<Response> {
  return handleVoice(request, process.env as Record<string, string | undefined>);
}
