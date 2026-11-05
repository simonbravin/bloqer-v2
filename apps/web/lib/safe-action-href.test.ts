import assert from "node:assert/strict";
import { test } from "node:test";
import { safeActionHref } from "./safe-action-href";

test("notification action links stay on the application's origin", () => {
  assert.equal(safeActionHref(" /proyectos/1?tab=documentos#archivo "), "/proyectos/1?tab=documentos#archivo");
  for (const href of ["https://example.invalid", "//example.invalid", "/\\example.invalid", "/\t/example.invalid"]) {
    assert.equal(safeActionHref(href), null);
  }
});
