import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";
import {
  assertCertificationLineWithinBudget,
  assertCertificationStatusEditable,
} from "./certification-guards";

test("assertCertificationStatusEditable allows DRAFT", () => {
  assert.doesNotThrow(() => assertCertificationStatusEditable("DRAFT"));
});

test("assertCertificationStatusEditable rejects ISSUED", () => {
  assert.throws(
    () => assertCertificationStatusEditable("ISSUED"),
    (err) => err instanceof ServiceError && err.code === "CONFLICT",
  );
});

test("assertCertificationLineWithinBudget rejects quantity above the contractual ceiling", () => {
  assert.throws(
    () =>
      assertCertificationLineWithinBudget({
        itemCode: "1.1",
        cumulative: new Prisma.Decimal("110"),
        budgetQty: new Prisma.Decimal("100"),
      }),
    (err) =>
      err instanceof ServiceError && err.code === "CONFLICT" && err.message.includes("BR-CERT-002"),
  );
});

test("assertCertificationLineWithinBudget rejects physical progress independently of quantity", () => {
  assert.throws(
    () =>
      assertCertificationLineWithinBudget({
        itemCode: "1.1",
        cumulative: new Prisma.Decimal("50"),
        budgetQty: new Prisma.Decimal("100"),
        cumulativePhysicalPct: new Prisma.Decimal("100.0001"),
      }),
    (err) =>
      err instanceof ServiceError &&
      err.code === "CONFLICT" &&
      err.message.includes("BR-CERT-002b"),
  );
});

test("assertCertificationLineWithinBudget rejects a four-decimal excess", () => {
  assert.throws(() =>
    assertCertificationLineWithinBudget({
      itemCode: "1.1",
      cumulative: new Prisma.Decimal("100.0001"),
      budgetQty: new Prisma.Decimal("100"),
    }),
  );
});

test("assertCertificationLineWithinBudget allows under ceiling", () => {
  assert.doesNotThrow(() =>
    assertCertificationLineWithinBudget({
      itemCode: "1.1",
      cumulative: new Prisma.Decimal("100"),
      budgetQty: new Prisma.Decimal("100"),
      cumulativePhysicalPct: new Prisma.Decimal("100"),
    }),
  );
});
