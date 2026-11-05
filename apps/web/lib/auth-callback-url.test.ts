import assert from "node:assert/strict";
import { test } from "node:test";
import { safeCallbackUrl } from "./auth-callback-url";

test("callback locale normalization cannot turn an internal path into an external redirect", () => {
  assert.equal(safeCallbackUrl("/es//some-host.invalid//example.invalid/final"), "/dashboard");
  assert.equal(safeCallbackUrl("/es///example.invalid"), "/dashboard");
  assert.equal(
    safeCallbackUrl("/es/contabilidad/asientos?empresa=demo#detalle"),
    "/contabilidad/asientos?empresa=demo#detalle",
  );
});
