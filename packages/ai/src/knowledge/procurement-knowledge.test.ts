import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ensureBundledKnowledgeLoaded } from "./ensure-bundled";
import { searchKnowledge } from "./search";

/** Exercise the shipped index, rather than a synthetic document or an LLM provider. */
describe("AG-06 procurement guidance retrieval", () => {
  const cases = [
    { name: "finds the currency comparability rule", query: "compra presupuesto distinta moneda referencia desvío justificación", decision: "D-125", expected: /comparable/i },
    { name: "finds protection of rejected quotation history", query: "cotización rechazada devolver solicitud borrador historial", decision: "D-126", expected: /hist[oó]ri|nunca tuvo|rechazad/i },
    { name: "finds receipt numbers and historical UUIDs", query: "número recepción RC histórica UUID", decision: "D-127", expected: /UUID/i },
    { name: "does not present partial close as an available action", query: "cerrar saldo OC no recibirá cierre parcial disponible", decision: "D-128", expected: /desarrollo separado|no disponible|no est[aá] disponible/i },
    { name: "finds approval requirements when confirmation FX changes", query: "cambiar tipo cambio FX OC aprobada confirmar nuevo importe aprobador", decision: "D-129", expected: /segregaci[oó]n/i },
    { name: "keeps fiscal debt separate from goods coverage", query: "facturación OC percepción neto IVA pagado saldo real", decision: "D-115", expected: /saldo real/i },
    { name: "does not treat draft reservations as issued invoices", query: "borrador reserva pendiente facturar recibido emitidas", decision: "D-108", expected: /no completa|cobertura emitida|solo las facturas emitidas/i },
  ];
  for (const scenario of cases) {
    it(scenario.name, () => {
      assert.equal(ensureBundledKnowledgeLoaded(), true);
      const hits = searchKnowledge(scenario.query, { k: 8 });
      assert.ok(hits.some((hit) => hit.text.includes(scenario.decision) && scenario.expected.test(hit.text)),
        `Expected current ${scenario.decision} guidance among results: ${hits.map((hit) => hit.id).join(", ")}`);
    });
  }
});
