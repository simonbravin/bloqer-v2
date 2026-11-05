import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureBundledKnowledgeLoaded } from "./ensure-bundled";
import { searchKnowledge } from "./search";

describe("AG-07 inventory guidance from the distributed index", () => {
  const cases = [
    {
      name: "explains a fixed product unit after first use without converting physical quantities",
      query: "unidad producto primer uso fija bolsas kg toneladas convertir",
      expected: /unidad[\s\S]*primer uso[\s\S]*queda fija[\s\S]*no convierte/i,
    },
    {
      name: "finds the existing product and warehouse edit workflow",
      query: "editar producto depósito guardar cambios SKU ficha",
      expected: /Editar producto|Editar dep[oó]sito/,
    },
    {
      name: "keeps physical warehouse stock separate from WBS attribution",
      query: "saldo físico producto depósito partida consumo stock independiente",
      expected: /saldo f[ií]sico[\s\S]*producto[\s\S]*dep[oó]sito/,
    },
    {
      name: "does not turn an unvalued consumption into a new journal",
      query: "consumo stock sin valuación asiento nominal moneda",
      expected: /consumos sin valuaci[oó]n[\s\S]*asiento/,
    },
    {
      name: "does not present FIFO or reservations as currently implemented",
      query: "inventario motor FIFO promedio reservas implementados limitación",
      expected: /no hay motor FIFO\/promedio ni reservas/,
    },
  ];
  for (const scenario of cases) {
    it(scenario.name, () => {
      assert.equal(ensureBundledKnowledgeLoaded(), true);
      const hits = searchKnowledge(scenario.query, { k: 8 });
      assert.ok(
        hits.some((hit) => scenario.expected.test(hit.text)),
        `Missing current inventory rule: ${hits.map((hit) => hit.id).join(", ")}`,
      );
    });
  }
});
