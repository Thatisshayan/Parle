import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAbandonedRequest } from "./tutor-open";

describe("tutor session open errors (Plan 11: A87, R95)", () => {
  it("a request abandoned by leaving the page is not reported; a real failure is", () => {
    assert.equal(isAbandonedRequest(new TypeError("Failed to fetch"), true), true);
    assert.equal(isAbandonedRequest(Object.assign(new Error("x"), { name: "AbortError" }), false), true);
    assert.equal(isAbandonedRequest(new TypeError("Failed to fetch"), false), false);
    assert.equal(isAbandonedRequest(null, false), false);
  });
});
