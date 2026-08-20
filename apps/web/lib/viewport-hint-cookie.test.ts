import assert from "node:assert/strict";
import { test } from "node:test";
import { parseViewportHint } from "./viewport-hint-cookie";

test("parseViewportHint accepts sm and md only", () => {
  assert.equal(parseViewportHint("sm"), "sm");
  assert.equal(parseViewportHint("md"), "md");
  assert.equal(parseViewportHint("lg"), null);
  assert.equal(parseViewportHint(""), null);
  assert.equal(parseViewportHint(null), null);
  assert.equal(parseViewportHint("SM"), null);
});
