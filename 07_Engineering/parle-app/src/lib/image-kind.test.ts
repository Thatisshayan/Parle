import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { imageKind } from "./image-kind.ts";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)].slice(0, 16));

describe("image type from the file's first bytes (A7, R13)", () => {
  it("recognises PNG, JPEG, GIF and WebP", () => {
    assert.deepEqual(imageKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), { mime: "image/png", ext: "png" });
    assert.deepEqual(imageKind(bytes(0xff, 0xd8, 0xff, 0xe0)), { mime: "image/jpeg", ext: "jpg" });
    assert.deepEqual(imageKind(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)), { mime: "image/gif", ext: "gif" });
    assert.deepEqual(imageKind(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50)), { mime: "image/webp", ext: "webp" });
  });
  it("refuses anything else, whatever the file is called", () => {
    assert.equal(imageKind(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'>")), null);
    assert.equal(imageKind(new TextEncoder().encode("<html>")), null);
    assert.equal(imageKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);
    assert.equal(imageKind(new Uint8Array()), null);
  });
});
