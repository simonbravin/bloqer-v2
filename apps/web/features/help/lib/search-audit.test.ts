import assert from "node:assert/strict";
import { test } from "node:test";
import { HELP_ARTICLES } from "./catalog";
import { searchHelpArticles } from "./search";

test("short keyword substring must not false-match unrelated queries", () => {
  // Regression: keyword «oc» matching inside «documentacion» / «proyecto» etc.
  const hits = searchHelpArticles(HELP_ARTICLES, { query: "documentacion" });
  assert.ok(
    !hits.some((a) => a.slug === "orden-de-compra-y-afectar-edt"),
    "OC article must not rank for «documentacion»",
  );
});

test("probe common treasury/accounting queries return something useful", () => {
  const cases: { q: string; expectSlugIncludes: string }[] = [
    { q: "flujo de caja", expectSlugIncludes: "flujo" },
    { q: "movimientos", expectSlugIncludes: "movimientos" },
    { q: "notificaciones", expectSlugIncludes: "notificaciones" },
    { q: "libro diario", expectSlugIncludes: "reportes-contables" },
    { q: "inventario", expectSlugIncludes: "inventario" },
    { q: "anticipo", expectSlugIncludes: "anticipo" },
    { q: "conciliacion", expectSlugIncludes: "conciliar" },
    { q: "contabilizar", expectSlugIncludes: "contabilizar" },
    { q: "sumas y saldos", expectSlugIncludes: "reportes-contables" },
    { q: "logo", expectSlugIncludes: "logo" },
  ];
  for (const c of cases) {
    const hits = searchHelpArticles(HELP_ARTICLES, { query: c.q });
    assert.ok(hits.length > 0, `${c.q} empty`);
    assert.ok(
      hits.some((a) => a.slug.includes(c.expectSlugIncludes)),
      `${c.q} -> ${hits.map((h) => h.slug).join(", ")}`,
    );
  }
});

test("intent + module filters compose (AND)", () => {
  const hits = searchHelpArticles(HELP_ARTICLES, {
    intent: "pagar-sueldo",
    module: "compras",
  });
  assert.equal(hits.length, 0);
});

test("search «pendientes» ranks the inbox article", () => {
  const hits = searchHelpArticles(HELP_ARTICLES, { query: "pendientes" });
  assert.ok(hits.length > 0);
  assert.equal(hits[0]!.slug, "revisar-pendientes");
});

test("garbage query returns no results", () => {
  const hits = searchHelpArticles(HELP_ARTICLES, { query: "xyzzyplugh" });
  assert.equal(hits.length, 0);
});

test("«aprobar orden de compra» ranks OC approval, not budget/cert", () => {
  const hits = searchHelpArticles(HELP_ARTICLES, { query: "aprobar orden de compra" });
  assert.ok(hits.length > 0 && hits.length <= 8, `got ${hits.length}`);
  assert.equal(hits[0]!.slug, "orden-de-compra-y-afectar-edt");
  assert.ok(
    hits.slice(0, 3).some((a) => a.slug === "circuito-comprar-material-hasta-pagarlo") ||
      hits.slice(0, 3).some((a) => a.slug === "politicas-de-compras"),
  );
  assert.ok(!hits.some((a) => a.slug === "aprobar-el-presupuesto"));
  assert.ok(!hits.some((a) => a.slug === "emitir-y-aprobar-certificacion"));
  assert.ok(!hits.some((a) => a.slug === "inventario-corporativo-basico"));
  assert.ok(!hits.some((a) => a.slug === "cargar-libro-de-obra"));
});

test("module filter tesoreria returns only treasury articles", () => {
  const hits = searchHelpArticles(HELP_ARTICLES, { module: "tesoreria" });
  assert.ok(hits.length >= 6);
  assert.ok(hits.every((a) => a.modules.includes("tesoreria")));
});
