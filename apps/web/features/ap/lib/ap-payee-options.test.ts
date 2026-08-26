import assert from "node:assert/strict";
import { test } from "node:test";
import { toApPayeeOption } from "./ap-payee-options";

test("AP payee search includes legal name, not only fantasy name", () => {
  const option = toApPayeeOption({
    id: "c1",
    legalName: "GOMEZ OSCAR DAVID",
    fantasyName: "OBDECO - MIP SOLUTIONS",
    roles: [{ role: "SUPPLIER" }],
  });
  assert.equal(option.label, "OBDECO - MIP SOLUTIONS · Proveedor");
  assert.match(option.searchValue ?? "", /GOMEZ OSCAR DAVID/);
  assert.match(option.searchValue ?? "", /OBDECO - MIP SOLUTIONS/);
});
