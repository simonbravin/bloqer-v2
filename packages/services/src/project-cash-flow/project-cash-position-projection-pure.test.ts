import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@bloqer/database";
import { computeProjectedCapital } from "./project-cash-position-projection-pure";

test("computeProjectedCapital applies cobros - pagos + CxC - CxP", () => {
  const result = computeProjectedCapital(
    new Prisma.Decimal(10_000_000),
    new Prisma.Decimal(0),
    new Prisma.Decimal(0),
    new Prisma.Decimal(0),
  );
  assert.equal(result.toFixed(2), "10000000.00");
});

test("computeProjectedCapital subtracts payables and payments", () => {
  const result = computeProjectedCapital(
    new Prisma.Decimal(100),
    new Prisma.Decimal(30),
    new Prisma.Decimal(50),
    new Prisma.Decimal(20),
  );
  assert.equal(result.toFixed(2), "100.00");
});
