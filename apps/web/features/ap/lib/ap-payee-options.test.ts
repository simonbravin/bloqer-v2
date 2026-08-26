import assert from "node:assert/strict";
import { test } from "node:test";
import { formatApPayeeLabel, toApPayeeOption } from "./ap-payee-options";

test("AP payee label is legal name with fantasy beside it", () => {
  const option = toApPayeeOption({
    id: "c1",
    legalName: "GOMEZ OSCAR DAVID",
    fantasyName: "OBDECO - MIP SOLUTIONS",
    roles: [{ role: "SUPPLIER" }],
  });
  assert.equal(option.label, "GOMEZ OSCAR DAVID (OBDECO - MIP SOLUTIONS) · Proveedor");
  assert.match(option.searchValue ?? "", /GOMEZ OSCAR DAVID/);
  assert.match(option.searchValue ?? "", /OBDECO - MIP SOLUTIONS/);
});

test("AP payee label omits fantasy when it matches legal name", () => {
  assert.equal(
    formatApPayeeLabel({
      legalName: "EQALQ S.R.L",
      fantasyName: "EQALQ S.R.L",
      roles: [{ role: "SUPPLIER" }],
    }),
    "EQALQ S.R.L · Proveedor",
  );
});

test("AP payee label trims trailing spaces and ignores matching fantasy", () => {
  assert.equal(
    formatApPayeeLabel({
      legalName: "AX SISTEMAS Y SERVICIOS S.A ",
      fantasyName: "TODO COMPUTACIÓN",
      roles: [{ role: "SUPPLIER" }],
    }),
    "AX SISTEMAS Y SERVICIOS S.A (TODO COMPUTACIÓN) · Proveedor",
  );
  assert.equal(
    formatApPayeeLabel({
      legalName: "GUERRA CARLOS ENRIQUE",
      fantasyName: "GUERRA CARLOS ENRIQUE ",
      roles: [{ role: "SUPPLIER" }],
    }),
    "GUERRA CARLOS ENRIQUE · Proveedor",
  );
});
