import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRESENTATION_END,
  PRESENTATION_START,
  parseAiPresentationFromAssistantText,
  scorePresentationQuality,
} from "./index";

describe("parseAiPresentationFromAssistantText", () => {
  it("extracts fenced executive presentation and strips markers from visible text", () => {
    const body = {
      kind: "executive",
      headline: "Casa Hogar — 3 temas de atención",
      summary: "Priorizo cronograma, compras y pagos.",
      insights: [
        {
          kind: "schedule",
          severity: "attention",
          title: "Cronograma",
          value: "12 tareas atrasadas",
          explanation: "La obra está en etapa inicial y ya hay atraso.",
          recommendation: "Revisar las que bloquean sucesoras.",
          links: [{ label: "Ver atrasadas", href: "/proyectos/abc/cronograma" }],
        },
      ],
      actions: [{ rank: 1, label: "Resolver OC pendientes", links: [] }],
      secondaryMetrics: [{ label: "Avance", value: "2,4%" }],
      followUps: ["Analizar cronograma", "Analizar compras"],
    };
    const raw = `Resumen breve.\n\n${PRESENTATION_START}\n${JSON.stringify(body)}\n${PRESENTATION_END}\n`;
    const parsed = parseAiPresentationFromAssistantText(raw);
    assert.equal(parsed.invalidPresentation, false);
    assert.equal(parsed.visibleText.includes("Resumen breve"), true);
    assert.equal(parsed.visibleText.includes(PRESENTATION_START), false);
    assert.ok(parsed.presentation);
    assert.equal(parsed.presentation!.kind, "executive");
    assert.equal(parsed.presentation!.insights.length, 1);
    assert.equal(parsed.presentation!.insights[0]!.links[0]!.href, "/proyectos/abc/cronograma");
  });

  it("drops unsafe hrefs", () => {
    const body = {
      kind: "direct",
      headline: "CxP",
      insights: [
        {
          kind: "payables",
          severity: "attention",
          title: "Vencido",
          explanation: "Hay montos vencidos.",
          links: [
            { label: "ok", href: "/finanzas/cuentas-por-pagar" },
            { label: "bad", href: "https://evil.example" },
            { label: "xss", href: "javascript:alert(1)" },
          ],
        },
      ],
      actions: [],
      secondaryMetrics: [],
      followUps: [],
    };
    const raw = `${PRESENTATION_START}${JSON.stringify(body)}${PRESENTATION_END}`;
    const parsed = parseAiPresentationFromAssistantText(raw);
    assert.ok(parsed.presentation);
    assert.deepEqual(
      parsed.presentation!.insights[0]!.links.map((l) => l.href),
      ["/finanzas/cuentas-por-pagar"],
    );
  });

  it("falls back when fence is missing", () => {
    const parsed = parseAiPresentationFromAssistantText("Solo texto plano sin presentación.");
    assert.equal(parsed.presentation, null);
    assert.equal(parsed.invalidPresentation, false);
    assert.match(parsed.visibleText, /Solo texto/);
  });
});

describe("scorePresentationQuality", () => {
  it("flags executive without actions", () => {
    const scored = scorePresentationQuality({
      kind: "executive",
      headline: "Test",
      insights: [
        {
          kind: "other",
          severity: "neutral",
          title: "A",
          explanation: "B",
          links: [],
        },
      ],
      actions: [],
      secondaryMetrics: [],
      followUps: [],
    });
    assert.equal(scored.pass, false);
    assert.ok(scored.notes.some((n) => /actions/i.test(n)));
  });
});
