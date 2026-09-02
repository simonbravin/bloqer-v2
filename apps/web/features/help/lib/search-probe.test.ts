/**
 * Probe suite: hit-count budgets + Argentine colloquialisms.
 * Run: node --import tsx --test search-probe.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { HELP_ARTICLES } from "./catalog";
import { searchHelpArticles } from "./search";

const MAX_HITS = 8;

/** Queries that should stay tight (few results, sensible top hit). */
const TIGHT_QUERIES: { q: string; max: number; topSlugIncludes?: string }[] = [
  { q: "aprobar orden de compra", max: 5, topSlugIncludes: "orden-de-compra" },
  { q: "cargar proveedor", max: 4, topSlugIncludes: "proveedor" },
  { q: "pagar sueldo", max: 4, topSlugIncludes: "sueldo" },
  { q: "comprar material", max: 6, topSlugIncludes: "circuito-comprar" },
  { q: "cobrar factura", max: 5, topSlugIncludes: "cobrar" },
  { q: "conciliar banco", max: 4, topSlugIncludes: "conciliar" },
  { q: "cerrar el mes", max: 3, topSlugIncludes: "cerrar" },
  { q: "parte diario", max: 3, topSlugIncludes: "libro" },
  { q: "transferir plata", max: 4, topSlugIncludes: "transferir" },
  { q: "dar de alta un proveedor", max: 4, topSlugIncludes: "proveedor" },
  { q: "ingresar mercaderia", max: 4, topSlugIncludes: "recibir" },
  { q: "remito", max: 4, topSlugIncludes: "recibir" },
  { q: "boleta", max: 5 },
  { q: "caja chica", max: 5 },
  { q: "liquidacion de sueldos", max: 4, topSlugIncludes: "sueldo" },
  { q: "haberes", max: 4, topSlugIncludes: "sueldo" },
  { q: "comitente", max: 3, topSlugIncludes: "cliente" },
  { q: "mandante", max: 3, topSlugIncludes: "cliente" },
  { q: "no me deja pagar", max: 4, topSlugIncludes: "bloquea" },
  { q: "mover plata", max: 4, topSlugIncludes: "transferir" },
  { q: "pedido de compra", max: 5, topSlugIncludes: "solicitud" },
  { q: "certificado de avance", max: 5, topSlugIncludes: "certificacion" },
  { q: "cuenta corriente", max: 6 },
  { q: "factura proveedor", max: 8 },
  { q: "gasto ferreteria", max: 5 },
];

/** Single broad tokens — must not dump half the catalog. */
const BROAD_TOKENS: { q: string; max: number }[] = [
  { q: "compra", max: MAX_HITS },
  { q: "pagar", max: MAX_HITS },
  { q: "factura", max: MAX_HITS },
  { q: "aprobar", max: MAX_HITS },
  { q: "caja", max: MAX_HITS },
  { q: "obra", max: MAX_HITS },
  { q: "stock", max: MAX_HITS },
  { q: "roles", max: MAX_HITS },
  { q: "pago", max: MAX_HITS },
];

test("tight queries stay within hit budget", () => {
  const failures: string[] = [];
  for (const c of TIGHT_QUERIES) {
    const hits = searchHelpArticles(HELP_ARTICLES, { query: c.q });
    if (hits.length === 0) {
      failures.push(`${c.q}: EMPTY`);
      continue;
    }
    if (hits.length > c.max) {
      failures.push(`${c.q}: ${hits.length} hits > max ${c.max} → ${hits.map((h) => h.slug).join(", ")}`);
    }
    if (c.topSlugIncludes && !hits[0]!.slug.includes(c.topSlugIncludes)) {
      failures.push(`${c.q}: top=${hits[0]!.slug} (want *${c.topSlugIncludes}*)`);
    }
  }
  assert.equal(failures.length, 0, failures.join("\n"));
});

test("broad single tokens do not dump the catalog", () => {
  const failures: string[] = [];
  for (const c of BROAD_TOKENS) {
    const hits = searchHelpArticles(HELP_ARTICLES, { query: c.q });
    if (hits.length > c.max) {
      failures.push(`${c.q}: ${hits.length} > ${c.max} → ${hits.map((h) => h.slug).join(", ")}`);
    }
    if (hits.length === 0) {
      failures.push(`${c.q}: EMPTY (too strict)`);
    }
  }
  assert.equal(failures.length, 0, failures.join("\n"));
});

test("new concept/report articles are findable", () => {
  const cases: { q: string; expectSlugIncludes: string }[] = [
    { q: "comprometido", expectSlugIncludes: "afectaciones" },
    { q: "presupuesto vs real", expectSlugIncludes: "presupuesto-vs-real" },
    { q: "rentabilidad", expectSlugIncludes: "rentabilidad" },
    { q: "exportar pdf", expectSlugIncludes: "exportar-reportes" },
    { q: "adenda", expectSlugIncludes: "adenda" },
    { q: "anular oc", expectSlugIncludes: "anular" },
    { q: "dimensiones de avance", expectSlugIncludes: "dimensiones" },
    { q: "registro de actividad", expectSlugIncludes: "registro" },
    { q: "limitaciones", expectSlugIncludes: "limitaciones" },
    { q: "2 decimales", expectSlugIncludes: "montos" },
    { q: "checklist", expectSlugIncludes: "checklist" },
    { q: "puesta en marcha contable", expectSlugIncludes: "puesta-en-marcha" },
    { q: "tablero materiales", expectSlugIncludes: "tablero-materiales" },
    { q: "tablero mano de obra", expectSlugIncludes: "tablero-mano-obra" },
    { q: "tablero equipos", expectSlugIncludes: "tablero-equipos" },
    { q: "pedir mano de obra", expectSlugIncludes: "pedir-material" },
    { q: "varianza equipos", expectSlugIncludes: "tablero-equipos" },
    { q: "justificacion desvio", expectSlugIncludes: "orden-de-compra" },
  ];
  for (const c of cases) {
    const hits = searchHelpArticles(HELP_ARTICLES, { query: c.q });
    assert.ok(hits.length > 0 && hits.length <= 8, `${c.q}: ${hits.length}`);
    assert.ok(
      hits.some((a) => a.slug.includes(c.expectSlugIncludes)),
      `${c.q} -> ${hits.map((h) => h.slug).join(", ")}`,
    );
  }
});

test("catalog size sanity", () => {
  assert.ok(HELP_ARTICLES.length >= 55 && HELP_ARTICLES.length <= 90, String(HELP_ARTICLES.length));
});
