import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";
import { assertCostItemQuantityNotBelowCertified } from "./cost-item-certified-qty";

describe("assertCostItemQuantityNotBelowCertified", () => {
  it("allows qty at or above max cumulative certified", async () => {
    const tx = {
      certificationLine: {
        findMany: async () => [
          { cumulativeQty: new Prisma.Decimal("5") },
          { cumulativeQty: new Prisma.Decimal("12.5") },
          { cumulativeQty: new Prisma.Decimal("8") },
        ],
      },
    };
    await assertCostItemQuantityNotBelowCertified(tx, {
      wbsNodeId: "wbs-1",
      tenantId: "t-1",
      quantity: "12.5",
    });
    await assertCostItemQuantityNotBelowCertified(tx, {
      wbsNodeId: "wbs-1",
      tenantId: "t-1",
      quantity: 20,
    });
  });

  it("rejects qty below max cumulative certified", async () => {
    const tx = {
      certificationLine: {
        findMany: async () => [
          { cumulativeQty: new Prisma.Decimal("10") },
          { cumulativeQty: new Prisma.Decimal("3") },
        ],
      },
    };
    await assert.rejects(
      () =>
        assertCostItemQuantityNotBelowCertified(tx, {
          wbsNodeId: "wbs-1",
          tenantId: "t-1",
          quantity: 9.999,
        }),
      (err: unknown) =>
        err instanceof ServiceError &&
        err.code === "CONFLICT" &&
        /ya certificado/.test(err.message),
    );
  });

  it("allows any positive qty when nothing certified", async () => {
    const tx = {
      certificationLine: {
        findMany: async () => [],
      },
    };
    await assertCostItemQuantityNotBelowCertified(tx, {
      wbsNodeId: "wbs-1",
      tenantId: "t-1",
      quantity: 0.0001,
    });
  });
});
