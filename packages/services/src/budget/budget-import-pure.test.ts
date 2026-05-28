import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { previewSpreadsheetImport, validateImportRows } from "./budget-import-pure";

describe("previewSpreadsheetImport", () => {
  it("rejects empty spreadsheet", () => {
    const result = previewSpreadsheetImport([["", "header", ""]]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.field === "general"));
  });

  it("reconcilia padre con hijo a GROUP aunque venga como ITEM", () => {
    const { errors } = validateImportRows(
      [
        { code: "1.1.1", type: "ITEM", name: "Ítem hoja", _row: 1 },
        { code: "1.1.1.1", type: "ITEM", name: "Hijo", parent_code: "1.1.1", _row: 2 },
      ],
      [],
    );
    assert.equal(errors.length, 0);
  });

  it("imports leaf items without unit in structure_only", () => {
    const result = previewSpreadsheetImport([
      ["ARQ 1", "Cap ARQ", ""],
      ["ARQ 1.1", "Sub ARQ", ""],
      ["ARQ 1.1.1", "Limpieza terreno", ""],
    ]);
    assert.equal(result.valid, true);
    assert.equal(result.rows.find((r) => r.code === "1.1.1")?.type, "ITEM");
    assert.equal(result.rows.find((r) => r.code === "1.1.1")?.unit, undefined);
  });

  it("preview multi-rubro is valid", () => {
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
