import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCsv, parseBuiltCsv } from "./csv-export.service";

test("parseBuiltCsv round-trips semicolon CSV with BOM and quotes", () => {
  const content = buildCsv(
    ["Codigo", "Nombre"],
    [
      ["1.10", 'Cemento; "Portland"'],
      ["2.00", "Arena"],
    ],
  );
  const parsed = parseBuiltCsv(content);
  assert.deepEqual(parsed.headers, ["Codigo", "Nombre"]);
  assert.deepEqual(parsed.rows, [
    ["1.10", 'Cemento; "Portland"'],
    ["2.00", "Arena"],
  ]);
});
