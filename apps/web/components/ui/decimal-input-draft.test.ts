import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDecimalEditBuffer,
  formatGroupedDecimal,
  resolveDocumentLineAmounts,
} from "@bloqer/utils";
import { DecimalInputDraft } from "./decimal-input-draft";

describe("decimal editing preserves document precision", () => {
  it("opening and submitting a 4dp unit price does not persist the rounded display", () => {
    const editor = new DecimalInputDraft();
    const price = "8.2645";
    assert.equal(editor.commit(formatGroupedDecimal(price, 2), 4), null);
    assert.equal(editor.commit(formatDecimalEditBuffer(price, 4), 4), null);
    const line = (unitPrice: string) =>
      resolveDocumentLineAmounts({ quantity: "333", unitPrice, taxRatePercent: "21" });
    assert.equal(line(price).lineTotal, "3330.02");
    assert.notEqual(line("8.26").lineTotal, line(price).lineTotal);
  });

  it("retains four decimals when editing a unit price with an Argentine decimal separator", () => {
    const editor = new DecimalInputDraft();
    assert.equal(editor.change("8,26455", 4), "8.2646");
    assert.equal(editor.commit("8,26455", 4), "8.2646");
    assert.equal(editor.commit("8,26", 4), null, "blur followed by submit must not round again");
  });

  it("keeps monetary amounts at 2dp half-up and FX at 6dp", () => {
    const editor = new DecimalInputDraft();
    assert.equal(editor.change("1,005", 2), "1.01");
    assert.equal(editor.commit("1,005", 2), "1.01");
    assert.equal(editor.change("1234,5678915", 6), "1234.567892");
    assert.equal(editor.commit("1234,5678915", 6), "1234.567892");
  });

  it("allows clearing and does not commit invalid tokens or a reset draft", () => {
    const editor = new DecimalInputDraft();
    assert.equal(editor.change("", 4), "");
    assert.equal(editor.commit("", 4), "");
    assert.equal(editor.change("abc", 4), null);
    assert.equal(editor.commit("abc", 4), null);
    editor.change("1,2345", 4);
    editor.reset();
    assert.equal(editor.commit("1,23", 4), null);
  });
});
