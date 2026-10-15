import { describe, it, expect } from "bun:test";
import { normaliseCode } from "./verify-code";

describe("normaliseCode", () => {
  it("keeps exactly six digits", () => {
    expect(normaliseCode(" 123 456 ")).toBe("123456");
    expect(normaliseCode("12345")).toBeNull();
    expect(normaliseCode("12a456")).toBeNull();
    expect(normaliseCode("1234567")).toBeNull();
  });
});
