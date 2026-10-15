import { describe, it, expect } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertCheckAlias, savePassword } from "../scripts/prod/test-admin";

describe("production test admin helpers (decision #52)", () => {
  it("accepts only an AgentMail check alias", () => {
    expect(() => assertCheckAlias("obsidianteamhq+admin@agentmail.to")).not.toThrow();
    for (const bad of ["obsidianmedia.yt@gmail.com", "obsidianteamhq@agentmail.to", "someone+admin@agentmail.to", "obsidianteamhq+admin@agentmail.to.evil"]) {
      expect(() => assertCheckAlias(bad)).toThrow();
    }
  });
  it("adds one password and keeps every other entry", () => {
    const file = join(mkdtempSync(join(tmpdir(), "parle-admin-")), "accounts.json");
    writeFileSync(file, JSON.stringify({ "obsidianteamhq+m3imm@agentmail.to": "one", "obsidianteamhq+m5tut1@agentmail.to": "two" }));
    savePassword(file, "obsidianteamhq+admin@agentmail.to", "three");
    savePassword(file, "obsidianteamhq+admin@agentmail.to", "four");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
      "obsidianteamhq+m3imm@agentmail.to": "one", "obsidianteamhq+m5tut1@agentmail.to": "two", "obsidianteamhq+admin@agentmail.to": "four",
    });
  });
  it("starts a missing file", () => {
    const file = join(mkdtempSync(join(tmpdir(), "parle-admin-")), "new.json");
    savePassword(file, "obsidianteamhq+admin@agentmail.to", "x");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ "obsidianteamhq+admin@agentmail.to": "x" });
  });
});
