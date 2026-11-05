import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import { assertNonnegativeInvoiceTaxes } from "./invoice-tax-guards";

const d = (v: string) => new Prisma.Decimal(v);
const invoice = () => ({ taxAmount: d("21"), iibbPerceptionRate: d("3"), iibbPerceptionAmount: d("3"), lines: [{ taxRate: d("21"), lineTax: d("21") }] });
describe("D-133 invoice tax guards", () => {
  it("allows zero and does not invent a new maximum tax rate", () => {
    assert.doesNotThrow(() => assertNonnegativeInvoiceTaxes({ taxAmount: d("0"), iibbPerceptionRate: d("0"), iibbPerceptionAmount: d("0"), lines: [{ taxRate: d("0"), lineTax: d("0") }] }));
    assert.doesNotThrow(() => assertNonnegativeInvoiceTaxes({ ...invoice(), lines: [{ taxRate: d("150"), lineTax: d("150") }] }));
  });
  for (const field of ["taxAmount", "iibbPerceptionRate", "iibbPerceptionAmount"] as const) {
    it(`rejects a persisted draft with negative ${field} without rewriting it`, () => {
      const draft = invoice(); draft[field] = d("-0.0001");
      assert.throws(() => assertNonnegativeInvoiceTaxes(draft), { code: "VALIDATION" });
      assert.equal(draft[field].toString(), "-0.0001");
    });
  }
  it("rejects negative line tax rates and stored tax components", () => {
    assert.throws(() => assertNonnegativeInvoiceTaxes({ ...invoice(), lines: [{ taxRate: d("-10") }] }), { code: "VALIDATION" });
    assert.throws(() => assertNonnegativeInvoiceTaxes({ ...invoice(), lines: [{ taxRate: d("21"), lineTax: d("-1") }] }), { code: "VALIDATION" });
  });
});
