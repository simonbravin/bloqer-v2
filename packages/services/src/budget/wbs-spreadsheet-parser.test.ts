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
    assert.equal(rows[2]?.unit, "m²");
    assert.equal(rows[3]?.code, "1.1.2");
  });

  it("treats 2-segment row with unit as ITEM", () => {
    const { rows, errors } = parseNumberedSpreadsheetRows([
      ["ARQ 2", "CUBIERTAS", ""],
      ["ARQ 2.1", "Cubierta panel sándwich", "m²"],
    ]);
    assert.equal(errors.length, 0);
    assert.equal(rows[1]?.type, "ITEM");
    assert.equal(rows[1]?.code, "2.1");
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
