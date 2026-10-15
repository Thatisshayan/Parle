import type { SupabaseClient } from "@supabase/supabase-js";

/** Profile photo upload into the caller's own folder; returns Buildy's { file_url } shape. */
export async function uploadProfilePhoto(c: SupabaseClient, file: File): Promise<{ file_url: string }> {
  const { data: u } = await c.auth.getUser();
  if (!u.user) throw new Error("Authentication required");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${u.user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await c.storage.from("profile-photos").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`API request failed: ${error.message}`);
  return { file_url: c.storage.from("profile-photos").getPublicUrl(path).data.publicUrl };
}
