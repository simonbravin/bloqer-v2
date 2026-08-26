import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createPaymentSchema,
  positiveQtyString,
  qtyString,
  unitPriceString,
} from "@bloqer/validators";

describe("money validators non-negative (BUG-040/049)", () => {
  it("rejects negative qty", () => {
    const r = qtyString.safeParse("-1");
    assert.equal(r.success, false);
  });

  it("rejects negative unit price", () => {
    const r = unitPriceString.safeParse("-10.5");
    assert.equal(r.success, false);
  });

  it("accepts zero qty", () => {
    const r = qtyString.safeParse("0");
    assert.equal(r.success, true);
  });

  it("positiveQtyString rejects zero and dust that rounds to zero", () => {
    assert.equal(positiveQtyString.safeParse("0").success, false);
    assert.equal(positiveQtyString.safeParse("0.00004").success, false);
    const ok = positiveQtyString.safeParse("1");
    assert.equal(ok.success, true);
    if (ok.success) assert.equal(ok.data, "1.0000");
  });

  it("rejects negative payment amount", () => {
    const r = createPaymentSchema.safeParse({
      payableId: "11111111-1111-4111-8111-111111111111",
      accountId: "11111111-1111-4111-8111-111111111112",
      paymentDate: "2026-08-20",
      amount: "-1.00",
      idempotencyKey: "11111111-1111-4111-8111-111111111113",
    });
    assert.equal(r.success, false);
  });
});
