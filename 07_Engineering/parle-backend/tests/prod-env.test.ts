import { describe, it, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restrictExistingEnvFile, validateAdminAlertEmail, validateVoiceRelaySecret, writeRestrictedEnvFile } from "../scripts/prod/env";

describe("production environment safeguards", () => {
  it("requires explicit owner-managed payout alert recipients", () => {
    expect(() => validateAdminAlertEmail("")).toThrow("Set ADMIN_ALERT_EMAIL");
    expect(() => validateAdminAlertEmail("payout-alerts@example.test")).toThrow("Set ADMIN_ALERT_EMAIL");
    expect(() => validateAdminAlertEmail("obsidianteamhq+admin@agentmail.to")).toThrow("Set ADMIN_ALERT_EMAIL");
    expect(() => validateAdminAlertEmail("not-an-email")).toThrow("Set ADMIN_ALERT_EMAIL");
    expect(() => validateAdminAlertEmail("finance@parle.ca,")).toThrow("Set ADMIN_ALERT_EMAIL");
    expect(() => validateAdminAlertEmail("finance@staging.example.ca")).toThrow("Set ADMIN_ALERT_EMAIL");
    expect(() => validateAdminAlertEmail("finance@parle..ca")).toThrow("Set ADMIN_ALERT_EMAIL");
    expect(validateAdminAlertEmail("finance@parle.ca, owner@parle.ca, finance@parle.ca"))
      .toBe("finance@parle.ca,owner@parle.ca");
  });

  it("requires a non-placeholder voice relay secret with a minimum length", () => {
    expect(() => validateVoiceRelaySecret("")).toThrow("Set VOICE_RELAY_SECRET");
    expect(() => validateVoiceRelaySecret("pending")).toThrow("Set VOICE_RELAY_SECRET");
    expect(() => validateVoiceRelaySecret("short")).toThrow("Set VOICE_RELAY_SECRET");
    expect(validateVoiceRelaySecret("a".repeat(64))).toBe("a".repeat(64));
  });

  it("writes generated settings with restricted access before storing content", () => {
    const directory = mkdtempSync(join(tmpdir(), "parle-prod-env-test-"));
    const path = join(directory, ".env.production");
    const content = "STRIPE_SECRET_KEY=dummy-test-value\n";
    try {
      writeRestrictedEnvFile(path, "OLD=dummy\n");
      writeRestrictedEnvFile(path, content);
      expect(readFileSync(path, "utf8")).toBe(content);
      if (process.platform === "win32") {
        const account = spawnSync("whoami.exe", [], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
        const acl = spawnSync("icacls.exe", [path], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
        expect(account.status).toBe(0);
        expect(acl.status).toBe(0);
        expect(acl.stdout.toLowerCase()).toContain(account.stdout.trim().toLowerCase());
        expect(acl.stdout).not.toMatch(/Everyone:|BUILTIN\\Users:/i);
      } else {
        expect(statSync(path).mode & 0o777).toBe(0o600);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("restricts an existing ignored settings file without replacing its contents", () => {
    const directory = mkdtempSync(join(tmpdir(), "parle-existing-env-test-"));
    const path = join(directory, ".env");
    const content = "LOCAL_KEY=dummy-test-value\n";
    try {
      writeFileSync(path, content, "utf8");
      restrictExistingEnvFile(path);
      expect(readFileSync(path, "utf8")).toBe(content);
      if (process.platform === "win32") {
        const account = spawnSync("whoami.exe", [], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
        const acl = spawnSync("icacls.exe", [path], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
        expect(account.status).toBe(0);
        expect(acl.status).toBe(0);
        expect(acl.stdout.toLowerCase()).toContain(account.stdout.trim().toLowerCase());
        expect(acl.stdout).not.toMatch(/Everyone:|BUILTIN\\Users:/i);
      } else {
        expect(statSync(path).mode & 0o777).toBe(0o600);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
