import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultTaxRateForInvoiceLetter,
  evaluateInvoiceLetterTaxConsistency,
  normalizeIvaRatePreset,
} from "./iva-rates";

describe("defaultTaxRateForInvoiceLetter", () => {
  it("A/B → 21, C/E → 0", () => {
    assert.equal(defaultTaxRateForInvoiceLetter("A"), "21");
    assert.equal(defaultTaxRateForInvoiceLetter("B"), "21");
    assert.equal(defaultTaxRateForInvoiceLetter("C"), "0");
    assert.equal(defaultTaxRateForInvoiceLetter("E"), "0");
  });
});

describe("normalizeIvaRatePreset", () => {
  it("maps 21.0000 → 21", () => {
    assert.equal(normalizeIvaRatePreset("21.0000"), "21");
    assert.equal(normalizeIvaRatePreset("10.50"), "10.5");
    assert.equal(normalizeIvaRatePreset("13"), null);
  });
});

describe("evaluateInvoiceLetterTaxConsistency", () => {
  it("errors when C/E have positive tax", () => {
    const c = evaluateInvoiceLetterTaxConsistency({ invoiceLetter: "C", taxAmount: "100" });
    assert.equal(c.some((i) => i.severity === "error"), true);
    const e = evaluateInvoiceLetterTaxConsistency({ invoiceLetter: "E", taxAmount: "1" });
    assert.equal(e.some((i) => i.severity === "error"), true);
  });

  it("warns when A has zero tax", () => {
    const a = evaluateInvoiceLetterTaxConsistency({ invoiceLetter: "A", taxAmount: "0" });
    assert.equal(a.some((i) => i.severity === "warning"), true);
    assert.equal(a.some((i) => i.severity === "error"), false);
  });

  it("ok when A has tax", () => {
    const a = evaluateInvoiceLetterTaxConsistency({ invoiceLetter: "A", taxAmount: "210" });
    assert.equal(a.length, 0);
  });
});
