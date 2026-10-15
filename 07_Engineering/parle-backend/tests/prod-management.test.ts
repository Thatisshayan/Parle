import { describe, it, expect } from "bun:test";
import { pendingMigrations, migrationSql } from "../scripts/prod/management";

describe("production migrations", () => {
  it("lists files not yet applied, in version order", () => {
    const files = ["20261016000002_b.sql", "20261014000001_a.sql", "20261016000018_c.sql"];
    expect(pendingMigrations(files, ["20261014000001"])).toEqual([
      { version: "20261016000002", name: "b", file: "20261016000002_b.sql" },
      { version: "20261016000018", name: "c", file: "20261016000018_c.sql" },
    ]);
  });
  it("wraps a file in one transaction that also records it in the history", () => {
    const sql = migrationSql({ version: "20261016000018", name: "payout_country_public", file: "x" }, "select 1;");
    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql).toContain("insert into supabase_migrations.schema_migrations (version, name, statements) values ('20261016000018', 'payout_country_public'");
  });
});

describe("production sign-in settings", () => {
  it("sends the 6-digit code the app asks for, like local config.toml (found in the Task 9 preview check)", async () => {
    const { authConfig } = await import("../scripts/prod/configure-auth");
    const local = Number(/\[auth\.email\][\s\S]*?otp_length = (\d+)/.exec(await Bun.file(`${import.meta.dir}/../supabase/config.toml`).text())?.[1]);
    expect(local).toBe(6);
    expect(authConfig("https://parle.buzz", "x").mailer_otp_length).toBe(local);
  });
});

describe("set-password links (final review, Minor 4 raised)", () => {
  it("emailed links last 24 hours, so migrated people have time to use them", async () => {
    const { authConfig } = await import("../scripts/prod/configure-auth");
    expect(authConfig("https://parle.buzz", "x").mailer_otp_exp).toBe(86400);
  });
});
