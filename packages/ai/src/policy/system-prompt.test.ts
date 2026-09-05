import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildBloqerAiSystemPrompt } from "./system-prompt";

const FORBIDDEN_LEAK_MARKERS = [
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "AUTH_SECRET",
  "ignore previous",
];

describe("system prompt policy", () => {
  it("includes read-only and data-vs-instructions rules", () => {
    const p = buildBloqerAiSystemPrompt({
      locale: "es-AR",
      timezone: "America/Argentina/Buenos_Aires",
      contextSummary: "test",
    });
    assert.match(p, /NO podés modificar|solo lectura/i);
    assert.match(p, /DATA|prompt injection/i);
    assert.match(p, /No inventes/i);
    for (const m of FORBIDDEN_LEAK_MARKERS) {
      assert.ok(!p.includes(m), `system prompt must not embed ${m}`);
    }
  });
});
