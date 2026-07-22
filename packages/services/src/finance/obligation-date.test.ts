import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import {
  aggregateCorporatePayableBalances,
  aggregateCorporateProjectionOutflows,
  type CorporatePayableSnapshotRow,
} from "../ap/corporate-ap-snapshot";
import { isCorporatePayableInProjectionHorizon } from "../reports/company-cash-projection.service";
import {
  deriveObligationDisplayStatus,
  isObligationOverdue,
  obligationDaysOverdue,
  startOfDayUtc,
} from "./obligation-date";

const TODAY = new Date("2026-05-29T00:00:00.000Z");

describe("isObligationOverdue", () => {
  it("due today is not overdue", () => {
    assert.equal(isObligationOverdue(new Date("2026-05-29T12:00:00.000Z"), TODAY), false);
  });

  it("due yesterday is overdue", () => {
    assert.equal(isObligationOverdue(new Date("2026-05-28T00:00:00.000Z"), TODAY), true);
  });
});

describe("deriveObligationDisplayStatus", () => {
  it("marks OPEN as OVERDUE when due date passed", () => {
    const bal = new Prisma.Decimal("100");
    const paid = new Prisma.Decimal(0);
    assert.equal(
      deriveObligationDisplayStatus("OPEN", bal, new Date("2026-05-01T00:00:00.000Z"), TODAY, paid),
      "OVERDUE",
    );
  });

  it("returns PAID when balance is zero even if stored OVERDUE", () => {
    const bal = new Prisma.Decimal(0);
    const paid = new Prisma.Decimal("100");
    assert.equal(
      deriveObligationDisplayStatus("OVERDUE", bal, new Date("2026-05-01T00:00:00.000Z"), TODAY, paid),
      "PAID",
    );
  });

  it("returns PAID for sub-cent dust balance (0.0022 ARS) even if stored OVERDUE", () => {
    const bal = new Prisma.Decimal("0.0022");
    const paid = new Prisma.Decimal("34099.9978");
    assert.equal(
      deriveObligationDisplayStatus("OVERDUE", bal, new Date("2026-05-01T00:00:00.000Z"), TODAY, paid),
      "PAID",
    );
  });

  it("returns PAID when balance is zero and stored OPEN on past due date", () => {
    const bal = new Prisma.Decimal(0);
    const paid = new Prisma.Decimal("50");
    assert.equal(
      deriveObligationDisplayStatus("OPEN", bal, new Date("2026-05-01T00:00:00.000Z"), TODAY, paid),
      "PAID",
    );
  });

  it("returns PARTIAL when balance remains and not overdue", () => {
    const bal = new Prisma.Decimal("50");
    const paid = new Prisma.Decimal("50");
    assert.equal(
      deriveObligationDisplayStatus("PARTIAL", bal, new Date("2026-06-15T00:00:00.000Z"), TODAY, paid),
      "PARTIAL",
    );
  });

  it("keeps stored PAID when balance remains (data corruption guard)", () => {
    const bal = new Prisma.Decimal("10");
    const paid = new Prisma.Decimal("90");
    assert.equal(
      deriveObligationDisplayStatus("PAID", bal, new Date("2026-05-01T00:00:00.000Z"), TODAY, paid),
      "PAID",
    );
  });
});

describe("aggregateCorporatePayableBalances", () => {
  it("sums open and overdue per currency", () => {
    const rows: CorporatePayableSnapshotRow[] = [
      {
        currency: "ARS",
        dueDate: new Date("2026-05-01T00:00:00.000Z"),
        originalAmount: new Prisma.Decimal("100"),
        paidAmount: new Prisma.Decimal(0),
        status: "OPEN",
      },
      {
        currency: "ARS",
        dueDate: new Date("2026-06-15T00:00:00.000Z"),
        originalAmount: new Prisma.Decimal("50"),
        paidAmount: new Prisma.Decimal(0),
        status: "OPEN",
      },
    ];
    const summary = aggregateCorporatePayableBalances(rows, TODAY);
    assert.equal(summary.totalByCurrency.length, 1);
    assert.equal(summary.totalByCurrency[0]!.amount, "150.00");
    assert.equal(summary.overdueByCurrency[0]!.amount, "100.00");
  });
});

describe("aggregateCorporateProjectionOutflows", () => {
  it("includes overdue and excludes payables after horizon", () => {
    const rows: CorporatePayableSnapshotRow[] = [
      {
        currency: "ARS",
        dueDate: new Date("2024-01-01T00:00:00.000Z"),
        originalAmount: new Prisma.Decimal("80"),
        paidAmount: new Prisma.Decimal(0),
        status: "OPEN",
      },
      {
        currency: "ARS",
        dueDate: new Date("2027-01-01T00:00:00.000Z"),
        originalAmount: new Prisma.Decimal("999"),
        paidAmount: new Prisma.Decimal(0),
        status: "OPEN",
      },
    ];
    const slices = aggregateCorporateProjectionOutflows(rows, "2026-12-31");
    assert.equal(slices.length, 1);
    assert.equal(slices[0]!.expectedOutflows.toString(), "80");
    assert.equal(slices[0]!.openPayableCount, 1);
  });
});

describe("isCorporatePayableInProjectionHorizon", () => {
  it("matches aggregate helper semantics", () => {
    const row: CorporatePayableSnapshotRow = {
      currency: "USD",
      dueDate: startOfDayUtc(new Date("2026-07-01T00:00:00.000Z")),
      originalAmount: new Prisma.Decimal("10"),
      paidAmount: new Prisma.Decimal(0),
      status: "PARTIAL",
    };
    assert.equal(isCorporatePayableInProjectionHorizon(row, "2026-12-31"), true);
    assert.equal(isCorporatePayableInProjectionHorizon(row, "2026-06-30"), false);
  });
});

describe("obligationDaysOverdue", () => {
  it("returns zero for due today", () => {
    assert.equal(obligationDaysOverdue(new Date("2026-05-29T00:00:00.000Z"), TODAY), 0);
  });
});
