import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import {
  serializeFxRateDecimal,
  serializeMoneyDecimal,
  serializeQtyDecimal,
  serializeRatePctDecimal,
  serializeUnitPriceDecimal,
  toMoneyDecimal,
} from "./money-decimal";

describe("serializeMoneyDecimal", () => {
  it("serializes Prisma.Decimal to 2 dp", () => {
    assert.equal(serializeMoneyDecimal(new Prisma.Decimal("100.5")), "100.50");
  });

  it("serializes Decimal-like objects that fail instanceof", () => {
    const foreign = { toString: () => "42.1" };
    assert.equal(serializeMoneyDecimal(foreign as unknown as Prisma.Decimal), "42.10");
  });

  it("rejects arrays and plain objects", () => {
    assert.throws(
      () => serializeMoneyDecimal([1.5] as unknown as Prisma.Decimal),
      /INVALID_AMOUNT/,
    );
    assert.throws(
      () => serializeMoneyDecimal({} as unknown as Prisma.Decimal),
      /INVALID_AMOUNT/,
    );
  });

  it("accepts plain strings and numbers", () => {
    assert.equal(serializeMoneyDecimal("10"), "10.00");
    assert.equal(serializeMoneyDecimal(10.5), "10.50");
  });
});

describe("toMoneyDecimal", () => {
  it("rounds Decimal-like input to 2 dp", () => {
    const foreign = { toString: () => "1.005" };
    assert.equal(toMoneyDecimal(foreign as unknown as Prisma.Decimal).toString(), "1.01");
  });
});

describe("serializeUnitPriceDecimal", () => {
  it("keeps 4 dp for unit prices", () => {
    assert.equal(serializeUnitPriceDecimal(new Prisma.Decimal("10.12345")), "10.1235");
  });
});

describe("serializeQtyDecimal", () => {
  it("keeps 4 dp for quantities", () => {
    assert.equal(serializeQtyDecimal(new Prisma.Decimal("3.1")), "3.1000");
  });
});

describe("serializeFxRateDecimal", () => {
  it("keeps 6 dp for FX", () => {
    assert.equal(serializeFxRateDecimal(new Prisma.Decimal("1180.1")), "1180.100000");
  });
});

describe("serializeRatePctDecimal", () => {
  it("keeps 4 dp for rates", () => {
    assert.equal(serializeRatePctDecimal(new Prisma.Decimal("21")), "21.0000");
  });
});
