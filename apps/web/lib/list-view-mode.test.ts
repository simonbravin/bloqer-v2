import assert from "node:assert/strict";
import { test } from "node:test";
import { parseListViewParam, resolveListViewMode } from "./list-view-mode";

test("URL param wins over storage and viewport", () => {
  assert.equal(
    resolveListViewMode({ urlView: "table", stored: "cards", isMdUp: false }),
    "table",
  );
  assert.equal(
    resolveListViewMode({ urlView: "cards", stored: "table", isMdUp: true }),
    "cards",
  );
});

test("stored preference wins when URL is empty", () => {
  assert.equal(
    resolveListViewMode({ urlView: null, stored: "table", isMdUp: false }),
    "table",
  );
  assert.equal(
    resolveListViewMode({ urlView: null, stored: "cards", isMdUp: true }),
    "cards",
  );
});

test("viewport default is cards below md and table from md up", () => {
  assert.equal(
    resolveListViewMode({ urlView: null, stored: null, isMdUp: false }),
    "cards",
  );
  assert.equal(
    resolveListViewMode({ urlView: null, stored: null, isMdUp: true }),
    "table",
  );
});

test("parseListViewParam ignores unknown values", () => {
  assert.equal(parseListViewParam("kanban"), null);
  assert.equal(parseListViewParam("cards"), "cards");
});
