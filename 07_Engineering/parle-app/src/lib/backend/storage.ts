import type { SupabaseClient } from "@supabase/supabase-js";
import { imageKind } from "@/lib/image-kind";

/** Profile photo upload into the caller's own folder; type and extension come from the file's bytes (R13). */
export async function uploadProfilePhoto(c: SupabaseClient, file: File): Promise<{ file_url: string }> {
  const { data: u } = await c.auth.getUser();
  if (!u.user) throw new Error("Authentication required");
  const kind = imageKind(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!kind) throw new Error("API request failed: PHOTO_INVALID");
  const path = `${u.user.id}/${crypto.randomUUID()}.${kind.ext}`;
  const { error } = await c.storage.from("profile-photos").upload(path, file, { contentType: kind.mime, upsert: false });
  if (error) throw new Error(`API request failed: ${error.message}`);
  return { file_url: c.storage.from("profile-photos").getPublicUrl(path).data.publicUrl };
}
