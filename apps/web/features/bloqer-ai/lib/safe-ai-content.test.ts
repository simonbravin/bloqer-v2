import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSafeInternalHref, sanitizeAssistantPlainText } from "./safe-ai-content";

describe("safe-ai-content", () => {
  it("allows internal routes only", () => {
    assert.equal(isSafeInternalHref("/proyectos/abc/materiales"), true);
    assert.equal(isSafeInternalHref("/ayuda/solicitud-compra"), true);
    assert.equal(isSafeInternalHref("https://evil.example"), false);
    assert.equal(isSafeInternalHref("javascript:alert(1)"), false);
    assert.equal(isSafeInternalHref("//evil.example"), false);
  });

  it("strips control characters from assistant text", () => {
    assert.equal(sanitizeAssistantPlainText("hola\u0000mundo"), "holamundo");
  });
});
