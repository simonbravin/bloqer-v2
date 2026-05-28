import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectImportProfile,
  parseCellA,
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

  it("blocks subcapítulo bajo ARQ.1.1", () => {
    assert.ok(validateManualNodeCode("ARQ.1.1.1", "GROUP", "ARQ.1.1"));
  });
});
