import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterSafeAiLinks,
  isSafeInternalHref,
  sanitizeAssistantPlainText,
} from "./safe-ai-content";

test("isSafeInternalHref allows Bloqer internal paths only", () => {
  assert.equal(isSafeInternalHref("/proyectos/abc/materiales"), true);
  assert.equal(isSafeInternalHref("/ayuda/solicitud-compra"), true);
  assert.equal(isSafeInternalHref("https://evil.example"), false);
  assert.equal(isSafeInternalHref("javascript:alert(1)"), false);
  assert.equal(isSafeInternalHref("data:text/html,hi"), false);
  assert.equal(isSafeInternalHref("//evil.example"), false);
});

test("filterSafeAiLinks keeps tool links and drops unsafe ones", () => {
  const links = filterSafeAiLinks([
    { label: "Ver CxP", href: "/finanzas/cxp" },
    { label: "evil", href: "https://evil.example" },
    { label: "xss", href: "javascript:alert(1)" },
    { label: "Ver CxP dup", href: "/finanzas/cxp" },
    { label: "", href: "/ok" },
  ]);
  assert.deepEqual(links, [{ label: "Ver CxP", href: "/finanzas/cxp" }]);
});

test("sanitizeAssistantPlainText strips control characters", () => {
  assert.equal(sanitizeAssistantPlainText("hola\u0000mundo"), "holamundo");
});
