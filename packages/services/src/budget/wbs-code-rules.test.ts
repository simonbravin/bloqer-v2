import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compareWbsCodes,
  detectImportProfile,
  inferImportNodeType,
  isStructuralLeafByCode,
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

describe("isStructuralLeafByCode", () => {
  it("12 sin hijos → hoja con APU", () => {
    assert.equal(isStructuralLeafByCode("12", 0), true);
  });

  it("12 con hijo 12.1 → sin APU en 12", () => {
    assert.equal(isStructuralLeafByCode("12", 1), false);
  });

  it("rubro ARQ sin hijos → no es hoja operativa", () => {
    assert.equal(isStructuralLeafByCode("ARQ", 0), false);
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

describe("compareWbsCodes", () => {
  it("ordena segmentos numéricos de forma natural", () => {
    const codes = ["10.1", "11.1", "1.8", "1.9", "2.2", "2.1"];
    codes.sort(compareWbsCodes);
    assert.deepEqual(codes, ["1.8", "1.9", "2.1", "2.2", "10.1", "11.1"]);
  });

  it("ordena prefijos de rubro antes de comparar números", () => {
    const codes = ["EST.2.1", "ARQ.1.8", "ARQ.2.1"];
    codes.sort(compareWbsCodes);
    assert.deepEqual(codes, ["ARQ.1.8", "ARQ.2.1", "EST.2.1"]);
  });
});
