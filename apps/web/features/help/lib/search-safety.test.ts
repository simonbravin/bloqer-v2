import assert from "node:assert/strict";
import { test } from "node:test";
import { HELP_ARTICLES, HELP_INTENT_LABELS, listHelpIntentChips } from "./catalog";
import { searchHelpArticles } from "./search";

function dump(q: string) {
  const hits = searchHelpArticles(HELP_ARTICLES, { query: q });
  return { n: hits.length, slugs: hits.map((h) => h.slug) };
}

test("short acronyms do not explode via synonym OR", () => {
  for (const q of ["oc", "sc", "cc", "pdf"]) {
    const { n, slugs } = dump(q);
    assert.ok(n <= 8, `${q}: ${n} → ${slugs.join(", ")}`);
  }
});

test("ferreteria does not match every proveedor article", () => {
  const { n, slugs } = dump("ferreteria");
  assert.ok(n <= 5, `${n} ${slugs.join(", ")}`);
  assert.ok(slugs.some((s) => s.includes("reintegr") || s.includes("gasto")));
  assert.ok(!slugs.includes("cargar-un-proveedor") || n <= 3);
});

test("plata alone stays bounded", () => {
  const { n } = dump("plata");
  assert.ok(n <= 8, String(n));
});

test("intent chips have curated labels and select only articles for their objective", () => {
  const chips = listHelpIntentChips();
  assert.ok(chips.length > 0);
  const intents = new Set<string>();
  for (const { intent, label } of chips) {
    assert.ok(!intents.has(intent), `duplicate intent chip: ${intent}`);
    intents.add(intent);
    assert.ok(label.trim().length > 0, `${intent}: empty label`);
    assert.equal(label, HELP_INTENT_LABELS[intent], `${intent}: missing curated label`);
    const hits = searchHelpArticles(HELP_ARTICLES, { intent, query: "" });
    assert.ok(hits.length > 0, `${intent}: chip without matching articles`);
    assert.ok(
      hits.every((article) => article.intents.includes(intent)),
      `${intent}: unrelated article`,
    );
  }
});
