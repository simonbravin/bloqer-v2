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

test("assertCertificationLineWithinBudget rejects PUBLIC over ceiling", () => {
  assert.throws(
    () =>
      assertCertificationLineWithinBudget({
        projectType: "PUBLIC",
        itemCode: "1.1",
        cumulative: new Prisma.Decimal("110"),
        budgetQty: new Prisma.Decimal("100"),
        certificationNotes: "nota",
      }),
    (err) => err instanceof ServiceError && err.code === "CONFLICT" && err.message.includes("BR-CERT-002"),
  );
});

test("assertCertificationLineWithinBudget rejects PRIVATE over ceiling without notes", () => {
  assert.throws(
    () =>
      assertCertificationLineWithinBudget({
        projectType: "PRIVATE",
        itemCode: "1.1",
        cumulative: new Prisma.Decimal("110"),
        budgetQty: new Prisma.Decimal("100"),
        certificationNotes: null,
      }),
    (err) => err instanceof ServiceError && err.code === "CONFLICT" && err.message.includes("BR-CERT-002b"),
  );
});

test("assertCertificationLineWithinBudget allows PRIVATE over ceiling with notes", () => {
  assert.doesNotThrow(() =>
    assertCertificationLineWithinBudget({
      projectType: "PRIVATE",
      itemCode: "1.1",
      cumulative: new Prisma.Decimal("110"),
      budgetQty: new Prisma.Decimal("100"),
      certificationNotes: "Adenda verbal / ajuste de cómputo",
    }),
  );
});

test("assertCertificationLineWithinBudget allows under ceiling", () => {
  assert.doesNotThrow(() =>
    assertCertificationLineWithinBudget({
      projectType: "PUBLIC",
      itemCode: "1.1",
      cumulative: new Prisma.Decimal("100"),
      budgetQty: new Prisma.Decimal("100"),
      certificationNotes: null,
    }),
  );
});
