import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { LOCAL_URL, localKeys } from "./local";

export async function makeUser(role: "learner" | "tutor" | "admin"): Promise<{ id: string; email: string; client: SupabaseClient }> {
  const admin = createClient(LOCAL_URL, localKeys().service, { auth: { persistSession: false } });
  const email = `t-${crypto.randomUUID()}@example.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role } });
  if (error) throw error;
  const client = createClient(LOCAL_URL, localKeys().anon, { auth: { persistSession: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  return { id: data.user.id, email, client };
}
