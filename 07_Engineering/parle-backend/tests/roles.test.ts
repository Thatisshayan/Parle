import { describe, it, expect } from "bun:test";
import { makeUser } from "./helpers/users";

describe("roles", () => {
  it("reports the role from app_metadata", async () => {
    const t = await makeUser("tutor");
    expect((await t.client.rpc("app_role")).data).toBe("tutor");
    const a = await makeUser("admin");
    expect((await a.client.rpc("is_admin")).data).toBe(true);
  });
  it("does not let a user make themselves admin", async () => {
    const l = await makeUser("learner");
    await l.client.auth.updateUser({ data: { role: "admin" } }); // user_metadata, not app_metadata
    await l.client.auth.refreshSession();
    expect((await l.client.rpc("is_admin")).data).toBe(false);
    expect((await l.client.rpc("app_role")).data).toBe("learner");
  });
});
