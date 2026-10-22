import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDocumentLineAmounts } from "@bloqer/utils";
import { initialQuoteLineMoney, quoteGlobalTaxRate } from "./quote-line-edit-values";

test("editing preserves non-preset IVA, unit precision and stored line amounts", () => {
  const previous = {
    quantity: "333", unitPrice: "8.2645", taxRate: "2.5123", discountPct: "0.0000",
    lineSubtotal: "2752.08", lineTax: "69.14", lineTotal: "2821.22",
  };
  const input = initialQuoteLineMoney(previous, "21");
  assert.equal(input.taxRate, "2.5123");
  assert.equal(input.unitPrice, "8.2645");
  const money = resolveDocumentLineAmounts({
    ...input, quantity: previous.quantity, taxRatePercent: input.taxRate, previous,
  });
  assert.equal(money.lineSubtotal, previous.lineSubtotal);
  assert.equal(money.lineTax, previous.lineTax);
  assert.equal(money.lineTotal, previous.lineTotal);
});

test("each line keeps its own rate in a mixed-rate quote", () => {
  const rates = ["0.0000", "10.5000", "21.0000", "27.0000", "5.1234"];
  assert.deepEqual(rates.map(taxRate => initialQuoteLineMoney({
    unitPrice: "100.0000", discountPct: "1.2345", taxRate,
  }, "21").taxRate), rates);
});

test("only new lines use the selected default IVA", () => {
  assert.deepEqual(initialQuoteLineMoney(undefined, "10.5"), {
    unitPrice: "0", discountPct: "0", taxRate: "10.5",
  });
});

test("global selector does not advertise 21% for custom or mixed rates", () => {
  assert.equal(quoteGlobalTaxRate([{ taxRate: "2.5123" }]), "");
  assert.equal(quoteGlobalTaxRate([{ taxRate: "21" }, { taxRate: "10.5" }]), "");
  assert.equal(quoteGlobalTaxRate([{ taxRate: "21" }, { taxRate: "21.0000" }]), "21");
  assert.equal(quoteGlobalTaxRate([{ taxRate: "0.0000" }]), "0");
  assert.equal(quoteGlobalTaxRate([]), "");
});
