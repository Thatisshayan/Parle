import { describe, it, expect } from "bun:test";
import { makeUser } from "./helpers/users";

describe("profile photos bucket", () => {
  it("lets a user upload into their own folder only, and the file is publicly readable", async () => {
    const u = await makeUser("learner"), other = await makeUser("learner");
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
    expect((await u.client.storage.from("profile-photos").upload(`${u.id}/a.png`, png)).error).toBeNull();
    expect((await u.client.storage.from("profile-photos").upload(`${other.id}/b.png`, png)).error).not.toBeNull();
    const url = u.client.storage.from("profile-photos").getPublicUrl(`${u.id}/a.png`).data.publicUrl;
    expect((await fetch(url)).status).toBe(200);
  });
  it("keeps at most 10 files in a person's folder (A7, R13)", async () => {
    const u = await makeUser("learner");
    const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });
    for (let i = 0; i < 10; i++) expect((await u.client.storage.from("profile-photos").upload(`${u.id}/${i}.png`, png)).error).toBeNull();
    expect((await u.client.storage.from("profile-photos").upload(`${u.id}/10.png`, png)).error).not.toBeNull();
  });
  it("keeps the 5 MB limit and the four image types on the bucket", () => {
    const out = Bun.spawnSync(["docker", "exec", "supabase_db_parle-staging", "psql", "-U", "postgres", "-tA", "-c",
      "select file_size_limit || '|' || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'profile-photos'"]).stdout.toString().trim();
    expect(out).toBe("5242880|image/png,image/jpeg,image/webp,image/gif");
  });
});
