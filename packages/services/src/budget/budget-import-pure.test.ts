import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { previewSpreadsheetImport } from "./budget-import-pure";

describe("previewSpreadsheetImport", () => {
  it("rejects empty spreadsheet", () => {
    const result = previewSpreadsheetImport([["", "header", ""]]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.field === "general"));
  });

  it("rejects child under ITEM parent", () => {
    const result = previewSpreadsheetImport([
      ["1", "Capítulo", ""],
      ["1.1", "Ítem hoja", "m²"],
      ["1.1.1", "Hijo inválido", "gl"],
    ]);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.field === "parent_code" && e.message.includes("ítem")),
    );
  });

  it("preview multi-rubro is valid with unidades en hojas", () => {
    const result = previewSpreadsheetImport([
      ["ARQ", "ARQUITECTURA", ""],
      ["EST", "ESTRUCTURA", ""],
      ["ARQ 1", "Cap ARQ", ""],
      ["EST 1", "Cap EST", ""],
      ["ARQ 1.1", "Sub ARQ", ""],
      ["EST 1.1", "Sub EST", ""],
      ["ARQ 1.1.1", "Ítem ARQ", "m²"],
      ["EST 1.1.1", "Ítem EST", "gl"],
    ]);
    assert.equal(result.profile, "multi_discipline");
    assert.equal(result.valid, true);
    assert.ok(result.rows.some((r) => r.code === "ARQ.1.1.1"));
    assert.ok(result.rows.some((r) => r.code === "EST.1.1.1"));
  });
});
