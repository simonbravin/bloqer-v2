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
});
