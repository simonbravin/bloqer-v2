import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { verifyDocumentBytes } from "./document-integrity";

const original = Buffer.from("%PDF-1.7 original");
const hash = createHash("sha256").update(original).digest("hex");

test("stored bytes verify against the original checksum, including uppercase historical hashes", () => {
  assert.equal(verifyDocumentBytes(original, original.length, hash), true);
  assert.equal(verifyDocumentBytes(original, original.length, hash.toUpperCase()), true);
});
test("same-length changed bytes fail integrity verification", () => {
  const altered = Buffer.from(original);
  altered[altered.length - 1] = 0;
  assert.throws(() => verifyDocumentBytes(altered, original.length, hash), { code: "CONFLICT" });
});
test("legacy files without an original hash only verify length", () => {
  assert.equal(verifyDocumentBytes(original, original.length, null), false);
  assert.throws(() => verifyDocumentBytes(original, original.length + 1, null), { code: "CONFLICT" });
});
test("empty, oversized and malformed integrity records are not accepted as verified", () => {
  assert.throws(() => verifyDocumentBytes(Buffer.alloc(0), 0, null), { code: "CONFLICT" });
  const tooBig = Buffer.alloc(50 * 1024 * 1024 + 1);
  assert.throws(() => verifyDocumentBytes(tooBig, tooBig.length, null), { code: "CONFLICT" });
  assert.throws(() => verifyDocumentBytes(original, original.length, "invalid"), { code: "CONFLICT" });
});
