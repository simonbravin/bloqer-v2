import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Prisma } from "@bloqer/database";
import { prisma } from "@bloqer/database";
import {
  appendPayableStatusFilter,
  appendPendingPayablesFilter,
  mergePayableDueDate,
} from "./payable-list-filters";

const TODAY = new Date("2026-05-29T00:00:00.000Z");
const FUTURE = new Date("2026-06-15T00:00:00.000Z");

describe("mergePayableDueDate", () => {
  it("merges gte using the later bound", () => {
    const where: Prisma.PayableWhereInput = { dueDate: { gte: FUTURE } };
    mergePayableDueDate(where, { gte: TODAY });
    assert.equal((where.dueDate as Prisma.DateTimeFilter).gte, FUTURE);
  });

  it("merges lt using the earlier bound", () => {
    const where: Prisma.PayableWhereInput = { dueDate: { lt: FUTURE } };
    mergePayableDueDate(where, { lt: TODAY });
    assert.equal((where.dueDate as Prisma.DateTimeFilter).lt, TODAY);
  });
});

describe("appendPayableStatusFilter", () => {
  it("OPEN keeps user dueDateFrom when it is after today", () => {
    const where: Prisma.PayableWhereInput = {
      dueDate: { gte: FUTURE, lte: new Date("2026-07-01") },
    };
    appendPayableStatusFilter(where, "OPEN", TODAY);
    assert.equal(where.status, "OPEN");
    const due = where.dueDate as Prisma.DateTimeFilter;
    assert.equal(due.gte, FUTURE);
    assert.ok(due.lte);
  });

  it("OVERDUE intersects user range with dueDate before today", () => {
    const where: Prisma.PayableWhereInput = {
      dueDate: { gte: new Date("2026-05-01"), lte: new Date("2026-05-20") },
    };
    appendPayableStatusFilter(where, "OVERDUE", TODAY);
    assert.ok(Array.isArray(where.AND));
    const overdueBranch = where.AND!.find(
      (c) => typeof c === "object" && c !== null && "OR" in c,
    ) as Prisma.PayableWhereInput | undefined;
    assert.ok(overdueBranch?.OR);
    const due = where.dueDate as Prisma.DateTimeFilter;
    assert.ok(due.gte);
    assert.ok(due.lte);
  });

  it("PARTIAL excludes overdue partials", () => {
    const where: Prisma.PayableWhereInput = {};
    appendPayableStatusFilter(where, "PARTIAL", TODAY);
    assert.equal(where.status, "PARTIAL");
    assert.equal((where.dueDate as Prisma.DateTimeFilter).gte, TODAY);
    assert.deepEqual(where.originalAmount, { gt: prisma.payable.fields.paidAmount });
  });

  it("pending filter requires open balance", () => {
    const where: Prisma.PayableWhereInput = {};
    appendPendingPayablesFilter(where);
    assert.ok(Array.isArray(where.AND));
    const pending = where.AND![0] as Prisma.PayableWhereInput;
    assert.deepEqual(pending.status, { notIn: ["PAID", "CANCELLED"] });
    assert.deepEqual(pending.originalAmount, { gt: prisma.payable.fields.paidAmount });
  });
});
