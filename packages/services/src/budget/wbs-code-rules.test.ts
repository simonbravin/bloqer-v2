import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectImportProfile,
  inferImportNodeType,
  parseCellA,
  reconcileImportRowTypes,
  validateManualNodeCode,
} from "./wbs-code-rules";

describe("parseCellA", () => {
  it("parses banner row", () => {
    const p = parseCellA("ICF", "Instalaciones");
    assert.equal(p.kind, "banner");
    if (p.kind === "banner") {
      assert.equal(p.discipline, "ICF");
      assert.equal(p.name, "Instalaciones");
    }
  });

  it("parses numbered row with prefix", () => {
    const p = parseCellA("ARQ 4.1.1", "Detalle");
    assert.equal(p.kind, "numbered");
    if (p.kind === "numbered") {
      assert.equal(p.canonical, "ARQ.4.1.1");
    }
  });
});

describe("detectImportProfile", () => {
  it("returns simple for one discipline", () => {
    assert.equal(
      detectImportProfile([{ discipline: "ARQ", numeric: "1" }]),
      "simple",
    );
  });

  it("returns multi_discipline for two prefixes", () => {
    assert.equal(
      detectImportProfile([
        { discipline: "ARQ", numeric: "1" },
        { discipline: "EST", numeric: "1" },
      ]),
      "multi_discipline",
    );
  });
});

describe("validateManualNodeCode", () => {
  it("allows subcapítulo bajo rubro ARQ", () => {
    assert.equal(validateManualNodeCode("ARQ.1", "GROUP", "ARQ"), null);
  });

  it("allows ítem hoja bajo ARQ.1.1", () => {
    assert.equal(validateManualNodeCode("ARQ.1.1.1", "ITEM", "ARQ.1.1"), null);
  });

  it("allows ítem raíz con código 1", () => {
    assert.equal(validateManualNodeCode("1", "ITEM", null), null);
  });
});

describe("reconcileImportRowTypes", () => {
  it("fuerza GROUP en padre con hijo aunque el cliente mande ITEM", () => {
    const rows = reconcileImportRowTypes(
      [
        { code: "1", type: "ITEM", name: "Cap" },
        { code: "1.1", type: "ITEM", name: "Hijo" },
      ],
      "simple",
    );
    assert.equal(rows[0]?.type, "GROUP");
    assert.equal(rows[1]?.type, "ITEM");
  });

  it("mantiene rubro ARQ como GROUP sin hijos", () => {
    const rows = reconcileImportRowTypes([{ code: "ARQ", type: "ITEM", name: "Arq" }], "multi_discipline");
    assert.equal(rows[0]?.type, "GROUP");
    assert.equal(inferImportNodeType("ARQ", new Set(["ARQ"]), "multi_discipline"), "GROUP");
  });
});
