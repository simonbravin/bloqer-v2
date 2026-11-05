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

test("CSV table preserves multiline cells and empty columns when reopened for Excel", () => {
  const rows = [["1", 'Primera línea; "detalle"\n\nÚltima línea', ""], ["2", "Siguiente fila", "0.00"]];
  const headers = ["Código", "Notas", "Monto"];
  assert.deepEqual(parseBuiltCsv(buildCsv(headers, rows)), { headers, rows });
});

test("CSV preserves literal negative amounts and escapes spreadsheet expressions", () => {
  const cells = ["-12.34", "-42", "-1+2", "\t=1+2", "  =1+2", "@SUM(A1)"];
  const { rows } = parseBuiltCsv(buildCsv(cells.map(() => "Dato"), [cells]));
  assert.deepEqual(rows[0], ["-12.34", "-42", "'-1+2", "'\t=1+2", "'  =1+2", "'@SUM(A1)"]);
});
