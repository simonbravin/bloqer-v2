/**
 * Structural integrity audit for help catalog.
 * Run: node --import tsx --test catalog-integrity.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { HELP_ARTICLES, HELP_FEATURED_SLUGS, getHelpArticle, listHelpIntentChips } from "./catalog";
import type { HelpHref, HelpModule } from "./types";
import { HELP_MODULE_LABELS } from "./types";
import { searchHelpArticles } from "./search";

const VALID_MODULES = new Set(Object.keys(HELP_MODULE_LABELS) as HelpModule[]);

function assertHref(slug: string, href: HelpHref) {
  if (href.kind === "company") {
    assert.ok(href.path.startsWith("/"), `${slug} company path`);
    assert.ok(!href.path.includes("/proyectos/[id]"), `${slug} bad company path`);
  } else {
    assert.ok(href.suffix.startsWith("/"), `${slug} project suffix must start with /`);
    assert.ok(!href.suffix.includes("[id]"), `${slug} suffix has placeholder`);
  }
}

test("every article has required shape", () => {
  const failures: string[] = [];
  for (const a of HELP_ARTICLES) {
    if (!a.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug)) failures.push(`bad slug: ${a.slug}`);
    if (!a.title?.trim()) failures.push(`${a.slug}: empty title`);
    if (!a.summary?.trim()) failures.push(`${a.slug}: empty summary`);
    if (!a.steps?.length) failures.push(`${a.slug}: no steps`);
    if (!a.keywords?.length) failures.push(`${a.slug}: no keywords`);
    if (!a.modules?.length) failures.push(`${a.slug}: no modules`);
    if (!a.intents?.length) failures.push(`${a.slug}: no intents`);
    if (!a.hrefs?.length) failures.push(`${a.slug}: no hrefs`);
    if (!a.guideRef?.trim()) failures.push(`${a.slug}: no guideRef`);
    if (!a.where?.menu?.trim()) failures.push(`${a.slug}: no where.menu`);
    if (!a.typicalRoles?.length) failures.push(`${a.slug}: no roles`);
    for (const m of a.modules) {
      if (!VALID_MODULES.has(m)) failures.push(`${a.slug}: bad module ${m}`);
    }
    for (const h of a.hrefs) {
      try {
        assertHref(a.slug, h);
      } catch (e) {
        failures.push(String(e));
      }
    }
    for (const k of a.keywords) {
      if (k !== k.trim() || k.length < 2) failures.push(`${a.slug}: bad keyword «${k}»`);
    }
    // Self-related is noise
    if (a.relatedSlugs.includes(a.slug)) failures.push(`${a.slug}: self-related`);
  }
  assert.equal(failures.length, 0, failures.join("\n"));
});

test("no duplicate keywords within an article (normalized)", () => {
  const failures: string[] = [];
  for (const a of HELP_ARTICLES) {
    const norm = a.keywords.map((k) => k.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase());
    if (new Set(norm).size !== norm.length) failures.push(a.slug);
  }
  assert.equal(failures.length, 0, failures.join(", "));
});

test("intent chips stay usable (not flooded)", () => {
  const chips = listHelpIntentChips();
  assert.ok(chips.length >= 8, String(chips.length));
  assert.ok(chips.length <= 28, `too many chips: ${chips.length}`);
});

test("featured home slugs resolve", () => {
  for (const slug of HELP_FEATURED_SLUGS) {
    assert.ok(getHelpArticle(slug), `featured missing: ${slug}`);
  }
});

test("«oc» alone must not dump half the catalog", () => {
  const hits = searchHelpArticles(HELP_ARTICLES, { query: "oc" });
  assert.ok(hits.length <= 8, hits.map((h) => h.slug).join(", "));
  assert.ok(
    hits.some((h) => h.slug.includes("orden-de-compra") || h.slug.includes("recibir") || h.slug.includes("oc")),
  );
});

test("empty query with intent chip returns only matching intents", () => {
  const hits = searchHelpArticles(HELP_ARTICLES, { intent: "exportar-reportes", query: "" });
  assert.ok(hits.length >= 1);
  assert.ok(hits.every((a) => a.intents.includes("exportar-reportes")));
});

test("related graph has no orphans pointed from new articles", () => {
  for (const a of HELP_ARTICLES) {
    for (const r of a.relatedSlugs) {
      assert.ok(getHelpArticle(r), `${a.slug} → ${r}`);
    }
  }
});
