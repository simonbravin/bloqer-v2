import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureBundledKnowledgeLoaded } from "./ensure-bundled";
import { searchKnowledge } from "./search";

describe("AG-08 certification guidance from the distributed index", () => {
  const cases = [
    {
      name: "finds the approved subcontract circuit before payment",
      query: "certificación subcontrato aprobar factura proveedor borrador emitir CxP",
      expected: /aprobar[\s\S]*factura[\s\S]*borrador[\s\S]*emitir[\s\S]*CxP/i,
    },
    {
      name: "keeps normal certification quantities nonnegative",
      query: "certificación cantidades no negativas rectificación diseño previo",
      expected:
        /cantidades no negativas|no hay un procedimiento de certificación negativa habilitado/i,
    },
    {
      name: "distinguishes credit settlement from cash and keeps debit-note debt visible",
      query: "recorrido factura certificación Sin saldo pendiente NC ND efectivo",
      expected: /NC aplicada[\s\S]*sin haber cobrado efectivo[\s\S]*ND vinculada/i,
    },
    {
      name: "does not interpret unavailable financial data as zero",
      query: "subcontrato liquidación No disponible fuente financiera saldo cero",
      expected: /No disponible[\s\S]*no significa saldo cero/i,
    },
    {
      name: "requires a reason for emitted certification cancellation but exempts drafts",
      query: "cancelar certificación emitida aprobada Motivo Borrador obligatorio",
      expected:
        /Cancelar certificación[\s\S]*Motivo[\s\S]*Borrador[\s\S]*no hay motivo obligatorio/i,
    },
  ];
  for (const scenario of cases) {
    it(scenario.name, () => {
      assert.equal(ensureBundledKnowledgeLoaded(), true);
      const hits = searchKnowledge(scenario.query, { k: 8 });
      assert.ok(
        hits.some((hit) => scenario.expected.test(hit.text)),
        `Missing current certification guidance: ${hits.map((hit) => hit.id).join(", ")}`,
      );
    });
  }
});
