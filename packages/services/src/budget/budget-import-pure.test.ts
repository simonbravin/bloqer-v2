import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { previewSpreadsheetImport, validateImportRows } from "./budget-import-pure";

describe("previewSpreadsheetImport", () => {
  it("rejects empty spreadsheet", () => {
    const result = previewSpreadsheetImport([["", "header", ""]]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.field === "general"));
  });

  it("rechaza estructuras de JSON que superan los niveles permitidos", () => {
    const { errors } = validateImportRows(
      [
        { code: "1.1.1", type: "ITEM", name: "Ítem hoja", _row: 1 },
        { code: "1.1.1.1", type: "ITEM", name: "Hijo", parent_code: "1.1.1", _row: 2 },
      ],
      [],
    );
    assert.ok(errors.some((error) => error.field === "code"));
  });

  it("reconcilia padre con hijo a GROUP dentro de la jerarquía permitida", () => {
    const { errors } = validateImportRows([
      { code: "1", type: "ITEM", name: "Capítulo", _row: 1 },
      { code: "1.1", parent_code: "1", type: "GROUP", name: "Partida hoja", _row: 2 },
    ], []);
    assert.deepEqual(errors, []);
  });

  for (const [code, parent_code] of [["1.1", undefined], ["1.2", "2"], ["1", "1"], ["A!", undefined]] as const) {
    it(`rechaza código/padre incompatible ${code}/${parent_code}`, () => {
      const { errors } = validateImportRows([{ code, parent_code, type: "ITEM", name: "Partida", _row: 1 }], []);
      assert.ok(errors.length > 0);
    });
  }

  it("rechaza reemplazo vacío y cantidades cero en full; permite placeholders de estructura", () => {
    assert.ok(validateImportRows([], []).errors.length > 0);
    const row = { code: "1", type: "ITEM" as const, name: "Partida", quantity: "0.0000", unit: "m2", _row: 1 };
    assert.ok(validateImportRows([row], [], "full").errors.some((error) => error.field === "quantity"));
    assert.deepEqual(validateImportRows([row], [], "structure_only").errors, []);
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
