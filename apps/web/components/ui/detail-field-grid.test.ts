import assert from "node:assert/strict";
import { test } from "node:test";
import { jsx, jsxs } from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { DetailField, DetailFieldGrid } from "./detail-field-grid";

test("repeated detail labels keep distinct accessible field associations", () => {
  const html = renderToStaticMarkup(jsxs(DetailFieldGrid, { children: [
    jsx(DetailField, { label: "Nombre", iconKey: "client", children: "Primer registro" }),
    jsx(DetailField, { label: "Nombre", iconKey: "client", children: "Segundo registro" }),
  ] }));
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const references = [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2);
  assert.deepEqual(references, ids);
  assert.match(html, /<dt/);
  assert.match(html, /<dd/);
});
