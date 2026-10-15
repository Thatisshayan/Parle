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
