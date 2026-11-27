import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@bloqer/database";
import { computeDelayedReceivables, computeProjectedCapital, hypotheticalCollectionDate, MAX_COLLECTION_DELAY_DAYS, parseCollectionDelayDays } from "./project-cash-position-projection-pure";

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

const receivable = (date: string, amount: string, paid = "0", credited = "0") => ({
  dueDate: new Date(date), originalAmount: new Prisma.Decimal(amount),
  paidAmount: new Prisma.Decimal(paid), creditedAmount: new Prisma.Decimal(credited),
});

test("D-150 delay starts today for overdue receivables and at due date for future ones", () => {
  assert.equal(hypotheticalCollectionDate(new Date("2026-10-01"), "2026-11-27", 5).toISOString().slice(0, 10), "2026-12-02");
  assert.equal(hypotheticalCollectionDate(new Date("2026-12-01"), "2026-11-27", 5).toISOString().slice(0, 10), "2026-12-06");
  assert.equal(hypotheticalCollectionDate(new Date("2028-02-28"), "2028-02-28", 1).toISOString().slice(0, 10), "2028-02-29");
  assert.equal(hypotheticalCollectionDate(new Date("2026-12-31"), "2026-12-31", 1).toISOString().slice(0, 10), "2027-01-01");
});

test("scenario preserves net balances and includes the exact target day", () => {
  const rows = [receivable("2026-10-01", "100", "20", "30"), receivable("2026-12-01", "200"), receivable("2027-01-01", "999")];
  const shifted = computeDelayedReceivables(rows, "2026-12-02", "2026-11-27", 5);
  assert.equal(shifted.included.toFixed(2), "50.00");
  assert.equal(shifted.deferred.toFixed(2), "200.00");
  assert.equal(shifted.deferredCount, 1);
  assert.equal(computeProjectedCapital(new Prisma.Decimal(20), new Prisma.Decimal(10), shifted.included, new Prisma.Decimal(25)).toFixed(2), "35.00");
  const zeroDelay = computeDelayedReceivables(rows, "2026-12-02", "2026-11-27", 0);
  assert.equal(zeroDelay.included.toFixed(2), "250.00");
  assert.equal(zeroDelay.deferred.toFixed(2), "0.00");
  assert.equal(zeroDelay.deferredCount, 0);
});

test("scenario excludes settled, credited and sub-cent residual amounts without rounding drift", () => {
  const shifted = computeDelayedReceivables([
    receivable("2026-11-27", "100", "100"), receivable("2026-11-27", "100", "0", "100"),
    receivable("2026-11-27", "0.001"), receivable("2026-11-27", "0.10"), receivable("2026-11-27", "0.20"),
  ], "2026-11-27", "2026-11-27", 1);
  assert.equal(shifted.included.toFixed(2), "0.00");
  assert.equal(shifted.deferred.toFixed(2), "0.30");
  assert.equal(shifted.deferredCount, 2);
});

test("delay input distinguishes disabled, zero and invalid values", () => {
  for (const value of [undefined, null, ""]) assert.equal(parseCollectionDelayDays(value), null);
  assert.equal(parseCollectionDelayDays("0"), 0);
  assert.equal(parseCollectionDelayDays(15), 15);
  assert.equal(parseCollectionDelayDays(String(MAX_COLLECTION_DELAY_DAYS)), MAX_COLLECTION_DELAY_DAYS);
  for (const value of [-1, 1.5, "1.5", "1e2", " 1", "NaN", true, [], Infinity, MAX_COLLECTION_DELAY_DAYS + 1]) {
    assert.throws(() => parseCollectionDelayDays(value), /atraso entero/);
  }
});
