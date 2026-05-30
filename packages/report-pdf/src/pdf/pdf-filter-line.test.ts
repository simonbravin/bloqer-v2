import test from "node:test";
import assert from "node:assert/strict";
import { buildPdfFilterLine } from "./pdf-filter-line";

test("buildPdfFilterLine redacts structural UUID filters", () => {
  const line = buildPdfFilterLine({
    dateFrom: "2025-01-01",
    accountId: "550e8400-e29b-41d4-a716-446655440000",
  });
  assert.match(line, /Desde: 2025-01-01/);
  assert.match(line, /Cuenta: \(filtro activo\)/);
  assert.doesNotMatch(line, /550e8400/);
});

test("buildPdfFilterLine returns Ninguno when empty", () => {
  assert.equal(buildPdfFilterLine({}), "Ninguno");
});
