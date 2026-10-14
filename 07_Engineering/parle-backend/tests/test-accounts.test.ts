import { describe, it, expect } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readAccounts, replacePassword } from "../scripts/lib/test-accounts";

describe("test-accounts file", () => {
  it("parses label email password lines and skips blanks and comments", () => {
    const dir = mkdtempSync(join(tmpdir(), "acc-"));
    const p = join(dir, "a.txt");
    writeFileSync(p, "# comment\nm3imm a+m3imm@x.to pw1\n\nm5tut1 a+m5tut1@x.to pw2\n");
    expect(readAccounts(p)).toEqual([
      { label: "m3imm", email: "a+m3imm@x.to", password: "pw1" },
      { label: "m5tut1", email: "a+m5tut1@x.to", password: "pw2" },
    ]);
  });
  it("replaces one password and keeps other lines byte for byte", () => {
    const dir = mkdtempSync(join(tmpdir(), "acc-"));
    const p = join(dir, "a.txt");
    writeFileSync(p, "# keep\nm3imm a+m3imm@x.to pw1\nm5tut1 a+m5tut1@x.to pw2\n");
    replacePassword("m5tut1", "NEW", p);
    expect(readFileSync(p, "utf8")).toBe("# keep\nm3imm a+m3imm@x.to pw1\nm5tut1 a+m5tut1@x.to NEW\n");
  });
  it("reads date-first lines with trailing notes, labelling them by the email alias", () => {
    const dir = mkdtempSync(join(tmpdir(), "acc-"));
    const p = join(dir, "a.txt");
    writeFileSync(p, "2026-10-10 o+m3cit@x.to pwA learner A note words\nimm1 o+imm1@x.to pwB\n");
    expect(readAccounts(p)).toEqual([
      { label: "m3cit", email: "o+m3cit@x.to", password: "pwA" },
      { label: "imm1", email: "o+imm1@x.to", password: "pwB" },
    ]);
  });
  it("replaces the password of a date-first line and keeps its date and notes", () => {
    const dir = mkdtempSync(join(tmpdir(), "acc-"));
    const p = join(dir, "a.txt");
    writeFileSync(p, "2026-10-10 o+m3cit@x.to pwA learner A note\n");
    replacePassword("m3cit", "NEW", p);
    expect(readFileSync(p, "utf8")).toBe("2026-10-10 o+m3cit@x.to NEW learner A note\n");
  });
  it("appends a new account line when the label is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "acc-"));
    const p = join(dir, "a.txt");
    writeFileSync(p, "m3imm a+m3imm@x.to pw1\n");
    replacePassword("imm1", "P", p, "a+imm1@x.to");
    expect(readAccounts(p).map((a) => a.label)).toEqual(["m3imm", "imm1"]);
  });
});
