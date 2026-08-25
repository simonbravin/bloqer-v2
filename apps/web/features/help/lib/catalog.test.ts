import assert from "node:assert/strict";
import { test } from "node:test";
import { HELP_ARTICLES, getHelpArticle } from "./catalog";
import { searchHelpArticles } from "./search";

test("help catalog has unique slugs", () => {
  const slugs = HELP_ARTICLES.map((a) => a.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test("relatedSlugs point to existing articles", () => {
  for (const article of HELP_ARTICLES) {
    for (const related of article.relatedSlugs) {
      assert.ok(getHelpArticle(related), `${article.slug} → missing related ${related}`);
    }
  }
});

test("search «proveedor» / «cargar proveedor» ranks supplier article first", () => {
  for (const query of ["proveedor", "cargar proveedor", "como cargo un proveedor"]) {
    const hits = searchHelpArticles(HELP_ARTICLES, { query });
    assert.ok(hits.length > 0, query);
    assert.equal(hits[0]!.slug, "cargar-un-proveedor", query);
  }
});

test("search «sueldos» ranks payroll cost article, not solo caja", () => {
  for (const query of ["sueldos", "pagar sueldo", "sueldo"]) {
    const hits = searchHelpArticles(HELP_ARTICLES, { query });
    assert.ok(hits.length > 0, query);
    assert.equal(hits[0]!.slug, "pagar-un-sueldo", query);
    assert.ok(!hits[0]!.slug.includes("solo-caja"));
  }
});

test("search «comprar material» ranks procurement circuit, not subcontract", () => {
  const hits = searchHelpArticles(HELP_ARTICLES, { query: "comprar material" });
  assert.ok(hits.length > 0);
  assert.equal(hits[0]!.slug, "circuito-comprar-material-hasta-pagarlo");
  assert.notEqual(hits[0]!.slug, "crear-un-subcontrato");
});

test("module filter narrows results", () => {
  const hits = searchHelpArticles(HELP_ARTICLES, { module: "directorio", query: "" });
  assert.ok(hits.every((a) => a.modules.includes("directorio")));
  assert.ok(hits.some((a) => a.slug === "cargar-un-proveedor"));
});

test("accent-insensitive search", () => {
  const hits = searchHelpArticles(HELP_ARTICLES, { query: "recepcion" });
  assert.ok(hits.some((a) => a.slug === "recibir-una-oc"));
});
