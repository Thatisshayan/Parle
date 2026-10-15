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
});
