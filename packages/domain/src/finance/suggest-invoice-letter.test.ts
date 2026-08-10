import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatInvoiceLetterBadge,
  formatIvaConditionLabel,
  invoiceLetterHint,
  requiresArInvoiceLetter,
  suggestInvoiceLetter,
} from "./suggest-invoice-letter";

describe("requiresArInvoiceLetter", () => {
  it("true when company is AR", () => {
    assert.equal(requiresArInvoiceLetter("AR", "US"), true);
  });
  it("true when counterparty is AR", () => {
    assert.equal(requiresArInvoiceLetter("UY", "AR"), true);
  });
  it("false when neither is AR", () => {
    assert.equal(requiresArInvoiceLetter("UY", "US"), false);
  });
  it("false when both countries are null", () => {
    assert.equal(requiresArInvoiceLetter(null, null), false);
  });
  it("false when only company is null and counterparty is non-AR", () => {
    assert.equal(requiresArInvoiceLetter(null, "US"), false);
  });
  it("case-insensitive", () => {
    assert.equal(requiresArInvoiceLetter("ar", "uy"), true);
  });
});

describe("suggestInvoiceLetter", () => {
  it("Monotributo issuer → C for any receiver", () => {
    assert.equal(
      suggestInvoiceLetter({
        issuerIvaCondition: "MONOTAX",
        receiverIvaCondition: "RESPONSIBLE_INSCRIPTO",
      }),
      "C",
    );
  });

  it("Exento issuer → C", () => {
    assert.equal(
      suggestInvoiceLetter({
        issuerIvaCondition: "EXEMPT",
        receiverIvaCondition: "FINAL_CONSUMER",
      }),
      "C",
    );
  });

  it("RI → RI → A", () => {
    assert.equal(
      suggestInvoiceLetter({
        issuerIvaCondition: "RESPONSIBLE_INSCRIPTO",
        receiverIvaCondition: "RESPONSIBLE_INSCRIPTO",
      }),
      "A",
    );
  });

  it("RI → CF → B", () => {
    assert.equal(
      suggestInvoiceLetter({
        issuerIvaCondition: "RESPONSIBLE_INSCRIPTO",
        receiverIvaCondition: "FINAL_CONSUMER",
      }),
      "B",
    );
  });

  it("RI → Monotributo → B", () => {
    assert.equal(
      suggestInvoiceLetter({
        issuerIvaCondition: "RESPONSIBLE_INSCRIPTO",
        receiverIvaCondition: "MONOTAX",
      }),
      "B",
    );
  });

  it("RI → FOREIGN condition → E", () => {
    assert.equal(
      suggestInvoiceLetter({
        issuerIvaCondition: "RESPONSIBLE_INSCRIPTO",
        receiverIvaCondition: "FOREIGN",
      }),
      "E",
    );
  });

  it("RI → non-AR country → E", () => {
    assert.equal(
      suggestInvoiceLetter({
        issuerIvaCondition: "RESPONSIBLE_INSCRIPTO",
        receiverIvaCondition: null,
        receiverCountry: "US",
      }),
      "E",
    );
  });

  it("missing issuer → null", () => {
    assert.equal(
      suggestInvoiceLetter({
        issuerIvaCondition: null,
        receiverIvaCondition: "RESPONSIBLE_INSCRIPTO",
      }),
      null,
    );
  });

  it("RI without receiver data → null", () => {
    assert.equal(
      suggestInvoiceLetter({
        issuerIvaCondition: "RESPONSIBLE_INSCRIPTO",
        receiverIvaCondition: null,
        receiverCountry: "AR",
      }),
      null,
    );
  });

  it("RI → EXEMPT / NOT_CATEGORIZED → B", () => {
    assert.equal(
      suggestInvoiceLetter({
        issuerIvaCondition: "RESPONSIBLE_INSCRIPTO",
        receiverIvaCondition: "EXEMPT",
      }),
      "B",
    );
    assert.equal(
      suggestInvoiceLetter({
        issuerIvaCondition: "RESPONSIBLE_INSCRIPTO",
        receiverIvaCondition: "NOT_CATEGORIZED",
      }),
      "B",
    );
  });
});

describe("formatIvaConditionLabel / formatInvoiceLetterBadge", () => {
  it("formats known IVA condition and empty", () => {
    assert.equal(formatIvaConditionLabel("MONOTAX"), "Monotributo");
    assert.equal(formatIvaConditionLabel(null), "—");
    assert.equal(formatIvaConditionLabel("CUSTOM"), "CUSTOM");
  });

  it("formats known invoice letter and empty", () => {
    assert.equal(formatInvoiceLetterBadge("A"), "Factura A");
    assert.equal(formatInvoiceLetterBadge(null), null);
    assert.equal(formatInvoiceLetterBadge("Z"), "Factura Z");
  });

  it("invoiceLetterHint covers A/B/C/E", () => {
    assert.match(invoiceLetterHint("A") ?? "", /IVA discriminado/);
    assert.match(invoiceLetterHint("B") ?? "", /incluye IVA|precio final/i);
    assert.equal(invoiceLetterHint(null), null);
  });
});
