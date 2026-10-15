import { describe, it, expect } from "bun:test";
import { normaliseCode, resendErrorKey } from "./verify-code";

describe("normaliseCode", () => {
  it("keeps exactly six digits", () => {
    expect(normaliseCode(" 123 456 ")).toBe("123456");
    expect(normaliseCode("12345")).toBeNull();
    expect(normaliseCode("12a456")).toBeNull();
    expect(normaliseCode("1234567")).toBeNull();
  });
});

describe("resend-code errors (A18, R14)", () => {
  it("tells the person to wait when they asked too soon", () => {
    expect(resendErrorKey(Object.assign(new Error("For security purposes, you can only request this after 47 seconds."), { status: 429 }))).toBe("auth.verifyResendTooSoon");
    expect(resendErrorKey(new Error("Email rate limit exceeded"))).toBe("auth.verifyResendTooSoon");
  });
  it("says the code could not be sent for anything else", () => {
    expect(resendErrorKey(new Error("Failed to fetch"))).toBe("auth.verifyResendFailed");
    expect(resendErrorKey(null)).toBe("auth.verifyResendFailed");
  });
});
