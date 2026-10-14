import { describe, it, expect } from "bun:test";
import { findResetToken } from "../scripts/buildy/agentmail";

describe("findResetToken", () => {
  it("reads token= from a reset link", () => {
    expect(findResetToken("Reset: https://x.buildy.show/reset-password?token=abc.DEF-12_3&x=1")).toBe("abc.DEF-12_3");
  });
  it("reads a token from a path segment after reset-password/", () => {
    expect(findResetToken("Go to https://www.buildy.ai/reset-password/ZZ9_aa-1 now")).toBe("ZZ9_aa-1");
  });
  it("returns null when there is no reset link", () => {
    expect(findResetToken("Welcome to Parle")).toBeNull();
  });
});
