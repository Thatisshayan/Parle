import { createClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./local";
const db = () => createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
/** Queue canned AI replies for the test provider (AI_PROVIDER=fake), oldest first. */
export async function queueAiResponses(...responses: string[]) {
  for (const response of responses) { const { error } = await db().from("ai_test_queue").insert({ response }); if (error) throw error; }
}
export async function clearAiQueue() { await db().from("ai_test_queue").delete().gte("id", 0); }
