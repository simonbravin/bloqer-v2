import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeItemCode, parseNumberedSpreadsheetRows } from "./wbs-spreadsheet-parser";

describe("normalizeItemCode", () => {
  it("canonicalizes prefixed cells", () => {
    assert.equal(normalizeItemCode("ARQ 1.1.1"), "ARQ.1.1.1");
  });

  it("accepts plain numeric codes", () => {
    assert.equal(normalizeItemCode("2.1"), "2.1");
  });

  it("rejects invalid codes", () => {
    assert.equal(normalizeItemCode("TOTAL"), null);
  });
});

describe("parseNumberedSpreadsheetRows — simple (un solo rubro)", () => {
  it("parses 3-level hierarchy sin prefijo en códigos", () => {
    const { profile, rows, errors } = parseNumberedSpreadsheetRows([
      ["ARQ 1", "TAREAS COMPLEMENTARIAS", ""],
      ["ARQ 1.1", "PREPARACIÓN DEL TERRENO", ""],
      ["ARQ 1.1.1", "Limpieza terreno", "m²"],
      ["ARQ 1.1.2", "Replanteo", "gl"],
    ]);
    assert.equal(profile, "simple");
    assert.equal(errors.length, 0);
    assert.equal(rows.length, 4);
    assert.equal(rows[0]?.type, "GROUP");
    assert.equal(rows[0]?.code, "1");
    assert.equal(rows[1]?.type, "GROUP");
    assert.equal(rows[1]?.parent_code, "1");
    assert.equal(rows[2]?.type, "ITEM");
    assert.equal(rows[3]?.code, "1.1.2");
  });

  it("ignores column C; hoja con hijos en archivo es GROUP", () => {
    const { rows, errors } = parseNumberedSpreadsheetRows([
      ["ARQ 2", "CUBIERTAS", ""],
      ["ARQ 2.1", "Cubierta panel sándwich", "m²"],
      ["ARQ 2.1.1", "Detalle hoja", "gl"],
    ]);
    assert.equal(errors.length, 0);
    assert.equal(rows[1]?.type, "GROUP");
    assert.equal(rows[1]?.code, "2.1");
    assert.equal(rows[2]?.type, "ITEM");
    assert.equal(rows[2]?.code, "2.1.1");
  });

  it("solo 1 en el archivo → ITEM hoja en raíz", () => {
    const { rows, errors } = parseNumberedSpreadsheetRows([["1", "Rubro único", ""]]);
    assert.equal(errors.length, 0);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.type, "ITEM");
    assert.equal(rows[0]?.code, "1");
  });

  it("1 con 1.1 y 1.2 sin nietos → hijos ITEM, padre GROUP", () => {
    const { rows, errors } = parseNumberedSpreadsheetRows([
      ["1", "Capítulo", ""],
      ["1.1", "A", ""],
      ["1.2", "B", ""],
    ]);
    assert.equal(errors.length, 0);
    const byCode = Object.fromEntries(rows.map((r) => [r.code, r.type]));
    assert.equal(byCode["1"], "GROUP");
    assert.equal(byCode["1.1"], "ITEM");
    assert.equal(byCode["1.2"], "ITEM");
  });

  it("rama mixta: 1.1.1 y 1.1.2 hoja; 1.2 hoja sin hijos", () => {
    const { rows, errors } = parseNumberedSpreadsheetRows([
      ["1", "Cap", ""],
      ["1.1", "Sub", ""],
      ["1.1.1", "Detalle A", ""],
      ["1.1.2", "Detalle B", ""],
      ["1.2", "Ítem suelto", ""],
    ]);
    assert.equal(errors.length, 0);
    const byCode = Object.fromEntries(rows.map((r) => [r.code, r.type]));
    assert.equal(byCode["1"], "GROUP");
    assert.equal(byCode["1.1"], "GROUP");
    assert.equal(byCode["1.1.1"], "ITEM");
    assert.equal(byCode["1.1.2"], "ITEM");
    assert.equal(byCode["1.2"], "ITEM");
  });

  it("rejects depth beyond 3 segments", () => {
    const { errors } = parseNumberedSpreadsheetRows([
      ["1.1.1.1", "Demasiado profundo", "m²"],
    ]);
    assert.ok(errors.length > 0);
  });

  it("skips total rows", () => {
    const { rows, skippedRows } = parseNumberedSpreadsheetRows([
      ["", "PRESUPUESTO OFICIAL", ""],
      ["ARQ 1", "Capítulo", ""],
    ]);
    assert.equal(rows.length, 1);
    assert.ok(skippedRows >= 1);
  });

  it("accepts numeric Excel cell for code", () => {
    assert.equal(normalizeItemCode(1), "1");
    assert.equal(normalizeItemCode(2.1), "2.1");
  });
});

describe("parseNumberedSpreadsheetRows — multi_discipline", () => {
  it("auto-corrige duplicado tipo Excel 11.1 → 11.10", () => {
    const { rows, errors, warnings } = parseNumberedSpreadsheetRows([
      ["11", "ELECTRICIDAD", ""],
      ["11.1", "Toma", ""],
      ["11.2", "Tablero", ""],
      ["11.3", "Seccional", ""],
      ["11.4", "Canalización", ""],
      ["11.5", "Iluminación", ""],
      ["11.6", "Tomas", ""],
      ["11.7", "Artefactos", ""],
      ["11.8", "Emergencia", ""],
      ["11.9", "Splits 3000", ""],
      ["11.1", "Splits 4500fg", ""],
      ["11.11", "Corrientes debiles", ""],
    ]);
    assert.equal(errors.length, 0);
    assert.ok(rows.some((r) => r.code === "11.10"));
    assert.ok(warnings.some((w) => w.message.includes("11.10")));
  });

  it("detecta varios rubros y evita colisión ARQ 1 / EST 1", () => {
    const { profile, rows, errors } = parseNumberedSpreadsheetRows([
      ["ARQ", "ARQUITECTURA", ""],
      ["EST", "ESTRUCTURA", ""],
      ["ARQ 1", "Capítulo ARQ", ""],
      ["EST 1", "Capítulo EST", ""],
      ["ARQ 1.1", "Subcapítulo ARQ", ""],
      ["ARQ 1.1.1", "Ítem ARQ", "m²"],
      ["EST 1.1", "Subcapítulo EST", ""],
      ["EST 1.1.1", "Ítem EST", "gl"],
    ]);
    assert.equal(profile, "multi_discipline");
    assert.equal(errors.length, 0);
    const codes = new Set(rows.map((r) => r.code));
    assert.ok(codes.has("ARQ"));
    assert.ok(codes.has("EST"));
    assert.ok(codes.has("ARQ.1"));
    assert.ok(codes.has("EST.1"));
    assert.ok(codes.has("ARQ.1.1.1"));
    assert.ok(codes.has("EST.1.1.1"));
    assert.equal(codes.has("1"), false);
  });

  it("rejects depth beyond 4 segments in multi", () => {
    const { profile, errors } = parseNumberedSpreadsheetRows([
      ["ARQ", "ARQ", ""],
      ["EST", "EST", ""],
      ["ARQ 1", "A", ""],
      ["EST 1", "B", ""],
      ["ARQ 1.1.1.1", "Demasiado profundo", "m²"],
    ]);
    assert.equal(profile, "multi_discipline");
    assert.ok(errors.length > 0);
  });
});
