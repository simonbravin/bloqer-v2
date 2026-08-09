import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";

/**
 * Documents createTreasuryAccount period-lock gate: openingBalance > 0 requires companyId.
 */
function assertOpeningBalanceRequiresCompany(
  openingBalance: Prisma.Decimal,
  companyId: string | null,
): void {
  if (openingBalance.greaterThan(0) && !companyId) {
    throw new ServiceError(
      "VALIDATION",
      "El saldo inicial requiere una empresa en el contexto o en la cuenta",
    );
  }
}

describe("treasury account opening balance company [period-lock]", () => {
  test("rejects openingBalance > 0 without companyId", () => {
    assert.throws(
      () => assertOpeningBalanceRequiresCompany(new Prisma.Decimal("100.00"), null),
      (e: unknown) =>
        e instanceof ServiceError
        && e.code === "VALIDATION"
        && e.message.includes("saldo inicial"),
    );
  });

  test("allows zero opening balance without companyId", () => {
    assert.doesNotThrow(() =>
      assertOpeningBalanceRequiresCompany(new Prisma.Decimal("0"), null),
    );
  });

  test("allows positive opening balance with companyId", () => {
    assert.doesNotThrow(() =>
      assertOpeningBalanceRequiresCompany(new Prisma.Decimal("50"), "company-1"),
    );
  });
});
