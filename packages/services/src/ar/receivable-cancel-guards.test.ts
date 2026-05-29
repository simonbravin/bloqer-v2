import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";
import { assertCanCancelReceivableDirect } from "./receivable-cancel-guards";

test("assertCanCancelReceivableDirect rejects ISSUED invoice", () => {
  assert.throws(
    () => assertCanCancelReceivableDirect({ salesInvoiceStatus: "ISSUED", activeCollectionCount: 0, paidAmount: new Prisma.Decimal(0) }),
    (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT",
  );
});

test("assertCanCancelReceivableDirect rejects confirmed collections", () => {
  assert.throws(
    () => assertCanCancelReceivableDirect({ salesInvoiceStatus: "CANCELLED", activeCollectionCount: 1, paidAmount: new Prisma.Decimal(0) }),
    (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT",
  );
});

test("assertCanCancelReceivableDirect allows when invoice cancelled and clean", () => {
  assert.doesNotThrow(() =>
    assertCanCancelReceivableDirect({ salesInvoiceStatus: "CANCELLED", activeCollectionCount: 0, paidAmount: new Prisma.Decimal(0) }),
  );
});
