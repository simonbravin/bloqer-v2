import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Prisma, prisma } from "@bloqer/database";
import type { ServiceContext } from "../types";
import {
  ensureDraftJournalFromCollection,
  ensureDraftJournalFromInternalTransfer,
  ensureDraftJournalFromPayment,
  ensureDraftJournalFromSalesInvoice,
  ensureDraftJournalFromSupplierInvoice,
  ensureDraftJournalFromTreasuryMovement,
} from "./accounting-auto-draft.service";

const restore: Array<() => void> = [];
function stub<T, K extends keyof T>(target: T, key: K, implementation: unknown) {
  const original = target[key];
  target[key] = implementation as T[K];
  restore.push(() => { target[key] = original; });
}

describe("auto-drafts never reject an already committed operation (D-061)", { concurrency: false }, () => {
  const ctx: ServiceContext = {
    actorUserId: "user", tenantId: "tenant", companyId: "company", roles: ["FINANCE"],
  };
  const source = {
    id: "source", tenantId: "tenant", companyId: "company", projectId: null,
    status: "CONFIRMED", currency: "ARS", amount: new Prisma.Decimal("10.00"),
    paymentDate: new Date("2026-10-08"), collectionDate: new Date("2026-10-08"),
    movementDate: new Date("2026-10-08"), description: "Treasury operation",
    account: { type: "BANK", currency: "ARS", companyId: "company" },
  };
  const invoice = {
    ...source, status: "ISSUED", documentKind: "INVOICE", number: 101,
    issueDate: new Date("2026-10-08"), subtotal: new Prisma.Decimal("10.00"),
    taxAmount: new Prisma.Decimal(0), iibbPerceptionAmount: new Prisma.Decimal(0),
    totalAmount: new Prisma.Decimal("10.00"),
  };
  let movementType: string;

  beforeEach(() => {
    movementType = "OUTFLOW";
    stub(prisma.payment, "findFirst", async () => source);
    stub(prisma.collection, "findFirst", async () => source);
    stub(prisma.internalTransfer, "findFirst", async () => source);
    stub(prisma.accountMovement, "findFirst", async () => ({
      ...source, type: movementType, sourceType: null, transferId: "source",
    }));
    stub(prisma.accountMovement, "findMany", async () => [
      { ...source, type: "TRANSFER_OUT" }, { ...source, type: "TRANSFER_IN" },
    ]);
    stub(prisma.salesInvoice, "findFirst", async () => invoice);
    stub(prisma.supplierInvoice, "findFirst", async () => invoice);
    stub(prisma.accountingAccount, "findFirst", async () => ({ id: "gl-account", isActive: true }));
    stub(prisma.tenantModuleSetting, "findMany", async () => []);
    stub(prisma.journalEntry, "findFirst", async () => null);
    stub(prisma.accountingMappingRule, "findFirst", async () => null);
    stub(prisma.auditLog, "create", async () => ({}));
    stub(prisma.company, "findFirst", async () => { throw new Error("Draft creation unavailable"); });
    stub(prisma, "$transaction", async () => { throw new Error("Unexpected database write"); });
  });
  afterEach(() => { restore.splice(0).reverse().forEach(fn => fn()); });

  const operations = {
    payment: () => ensureDraftJournalFromPayment("source", ctx),
    collection: () => ensureDraftJournalFromCollection("source", ctx),
    movement: () => ensureDraftJournalFromTreasuryMovement("source", ctx),
    transfer: () => ensureDraftJournalFromInternalTransfer("source", ctx),
    transferMovement: () => {
      movementType = "TRANSFER_OUT";
      return ensureDraftJournalFromTreasuryMovement("source", ctx);
    },
    salesInvoice: () => ensureDraftJournalFromSalesInvoice("source", ctx),
    supplierInvoice: () => ensureDraftJournalFromSupplierInvoice("source", ctx),
  };

  for (const [name, ensureDraft] of Object.entries(operations)) {
    it(`${name}: absorbs asynchronous module lookup failure`, async () => {
      let calls = 0;
      stub(prisma.tenantModuleSetting, "findMany", async () => {
        calls++;
        throw new Error("Module lookup unavailable");
      });
      assert.deepEqual(await ensureDraft(), { status: "skipped", reason: "unexpected_error" });
      assert.equal(calls, 1);
    });
    it(`${name}: absorbs asynchronous journal lookup failure`, async () => {
      let calls = 0;
      stub(prisma.journalEntry, "findFirst", async () => {
        calls++;
        throw new Error("Journal lookup unavailable");
      });
      assert.deepEqual(await ensureDraft(), { status: "skipped", reason: "unexpected_error" });
      assert.equal(calls, 1);
    });
    it(`${name}: absorbs failure while recovering from draft creation failure`, async () => {
      let lookups = 0;
      stub(prisma.accountingMappingRule, "findFirst", async () => ({
        debitAccountId: "debit", creditAccountId: "credit",
      }));
      stub(prisma.journalEntry, "findFirst", async () => {
        if (++lookups === 1) return null;
        throw new Error("Recovery lookup unavailable");
      });
      assert.deepEqual(await ensureDraft(), { status: "skipped", reason: "unexpected_error" });
      assert.equal(lookups, 2);
    });
    it(`${name}: keeps the normal no-rule result`, async () => {
      assert.deepEqual(await ensureDraft(), { status: "skipped", reason: "no_mapping_rule" });
    });
    it(`${name}: an audit failure does not turn a skipped draft into a failed operation`, async () => {
      stub(prisma.auditLog, "create", async () => { throw new Error("Audit unavailable"); });
      assert.deepEqual(await ensureDraft(), { status: "skipped", reason: "no_mapping_rule" });
    });
  }
});
