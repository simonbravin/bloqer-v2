import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureBundledKnowledgeLoaded } from "./ensure-bundled";
import { searchKnowledge } from "./search";

describe("AG-09 financial guidance from the distributed index", () => {
  const cases = [
    {
      name: "finds corporate credit and debit notes without requiring a project or a new receivable",
      query: "Oficina Comprobantes de venta Nueva nota de crédito Factura de referencia sin CxC propia",
      expected: /Comprobantes de venta[\s\S]*(?:sin CxC propia|Factura de referencia)/i,
    },
    {
      name: "explains that settling debt with credit is different from paying cash",
      query: "CxP Saldada créditos NC pagos salida de caja",
      expected: /Saldada[\s\S]*(?:créditos|crédito)[\s\S]*(?:salida de caja|salida de dinero|caja)/i,
    },
    {
      name: "requires manually captured FX for foreign-currency payments",
      query: "pago moneda extranjera FX manual ARS por 1 unidad 6 decimales",
      expected: /(?:moneda extranjera[\s\S]*FX manual del pago|FX manual del pago[\s\S]*6 decimales)/i,
    },
    {
      name: "keeps aging totals separated by currency",
      query: "aging antigüedad saldos totales por moneda ARS USD",
      expected: /(?:totales[\s\S]*por moneda[\s\S]*sin sumar ARS con USD|totales[\s\S]*por moneda[\s\S]*No sumar ARS con USD)/i,
    },
    {
      name: "preserves nonnegative invoice taxes and allows zero",
      query: "factura IVA percepción IIBB no negativos cero borrador D-133",
      expected: /IVA[\s\S]*percepción[\s\S]*no negativos[\s\S]*cero permitido/i,
    },
    {
      name: "finds the corporate collection cancellation route and reason",
      query: "CxC empresa historial Cancelar cobranza motivo anuladas",
      expected: /historial[\s\S]*Cancelar cobranza[\s\S]*motivo|Cancelar cobranza[\s\S]*motivo[\s\S]*historial/i,
    },
    {
      name: "keeps advances on the existing invoice-receivable-collection path",
      query: "anticipo venta rápida factura CxC cobranza letra FX manual",
      expected: /(?:Anticipo|anticipo)[\s\S]*factura[\s\S]*CxC[\s\S]*cobranza[\s\S]*FX manual/i,
    },
  ];
  for (const scenario of cases) {
    it(scenario.name, () => {
      assert.equal(ensureBundledKnowledgeLoaded(), true);
      const hits = searchKnowledge(scenario.query, { k: 8 });
      assert.ok(
        hits.some((hit) => scenario.expected.test(hit.text)),
        `Missing current financial guidance: ${hits.map((hit) => hit.id).join(", ")}`,
      );
    });
  }
});
