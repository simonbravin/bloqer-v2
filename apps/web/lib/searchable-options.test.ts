import assert from "node:assert/strict";
import { test } from "node:test";
import {
  contactNameSearchValue,
  contactsToSearchableOptions,
  foldSearchText,
  formatContactPickerLabel,
  toContactPickerOption,
} from "./searchable-options";
test("formatContactPickerLabel puts fantasy beside legal when they differ", () => {
  assert.equal(
    formatContactPickerLabel("GOMEZ OSCAR DAVID", "OBDECO - MIP SOLUTIONS"),
    "GOMEZ OSCAR DAVID (OBDECO - MIP SOLUTIONS)",
  );
  assert.equal(formatContactPickerLabel("EQALQ S.R.L", "EQALQ S.R.L"), "EQALQ S.R.L");
  assert.equal(formatContactPickerLabel("Solo legal", null), "Solo legal");
});

test("toContactPickerOption indexes legal and fantasy, not CUIT", () => {
  const option = toContactPickerOption({
    id: "c1",
    legalName: "AX SISTEMAS Y SERVICIOS S.A ",
    fantasyName: "TODO COMPUTACIÓN",
    country: "AR",
    ivaCondition: "RI",
  });
  assert.equal(option.id, "c1");
  assert.equal(option.label, "AX SISTEMAS Y SERVICIOS S.A (TODO COMPUTACIÓN)");
  assert.match(option.searchValue, /AX SISTEMAS Y SERVICIOS S.A/);
  assert.match(option.searchValue, /TODO COMPUTACIÓN/);
  assert.equal(option.country, "AR");
});

test("contactsToSearchableOptions uses the same legal + fantasy label and search", () => {
  const [option] = contactsToSearchableOptions([
    { id: "c1", legalName: "PEIRO PABLO ESTEBAN", fantasyName: "Pablo" },
  ]);
  assert.equal(option?.value, "c1");
  assert.equal(option?.label, "PEIRO PABLO ESTEBAN (Pablo)");
  assert.match(option?.searchValue ?? "", /PEIRO PABLO ESTEBAN/);
  assert.match(option?.searchValue ?? "", /Pablo/);
});

test("foldSearchText matches accented names without requiring the accent", () => {
  const haystack = foldSearchText("DIAZ SQUARTINI PAULA ANAHÍ TODO COMPUTACIÓN");
  assert.ok(haystack.includes(foldSearchText("anahi")));
  assert.ok(haystack.includes(foldSearchText("computacion")));
});

test("contactNameSearchValue keeps legal and fantasy, not role tags", () => {
  const value = contactNameSearchValue("GOMEZ OSCAR DAVID", "OBDECO - MIP SOLUTIONS");
  assert.match(value, /GOMEZ OSCAR DAVID/);
  assert.match(value, /OBDECO - MIP SOLUTIONS/);
  assert.equal(value.includes("Proveedor"), false);
});
