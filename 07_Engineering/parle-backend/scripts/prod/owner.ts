import type { SupabaseClient } from "@supabase/supabase-js";

/** Plan 8 spec 2: the founder is the only owner. Owners are changed only by this step (or a later owner-only action). */
export const OWNER_EMAIL = "obsidianmedia.yt@gmail.com";

async function findByEmail(db: SupabaseClient, email: string) {
  const want = email.trim().toLowerCase();
  for (let page = 1; page < 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === want);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/** Sets app_metadata.owner = true on an existing administrator (service key only). Never changes the role. */
export async function setOwnerFlag(db: SupabaseClient, email: string): Promise<"set" | "already" | "not_found" | "not_admin"> {
  const user = await findByEmail(db, email);
  if (!user) return "not_found";
  const meta = (user.app_metadata ?? {}) as Record<string, unknown>;
  if (meta.role !== "admin") return "not_admin";
  if (meta.owner === true) return "already";
  // Supabase Auth merges app_metadata keys on update, so role and provider stay as they are.
  const { error } = await db.auth.admin.updateUserById(user.id, { app_metadata: { owner: true } });
  if (error) throw new Error(error.message);
  return "set";
}

/** Owners and administrators by address (no ids, tokens or keys). */
export async function listAdmins(db: SupabaseClient): Promise<string[]> {
  const out: string[] = [];
  for (let page = 1; page < 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const u of data.users) {
      const meta = (u.app_metadata ?? {}) as Record<string, unknown>;
      if (meta.role === "admin") out.push(`${u.email}${meta.owner === true ? " (owner)" : ""}`);
    }
    if (data.users.length < 1000) break;
  }
  return out.sort();
}
