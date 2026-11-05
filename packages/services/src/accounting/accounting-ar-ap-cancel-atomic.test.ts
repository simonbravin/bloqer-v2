import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Prisma, prisma, type JournalEntrySourceType } from "@bloqer/database";
import { assertJournalAllowsOperationalCancel, cancelDraftJournalOnOperationalCancel } from "./accounting-cancel-sync.service";
import { assertArApJournalSourceCurrent, postJournalEntry } from "./journal-entry.service";
import { ServiceError, type ServiceContext } from "../types";

const ctx: ServiceContext = { tenantId: "tenant", companyId: "company", actorUserId: "actor", roles: ["FINANCE"] };
const params = { companyId: "company", sourceType: "PAYMENT" as const, sourceId: "payment", sourceLabel: "el pago" };
const conflict = (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT";
const restore: Array<() => void> = [];
function stub<T, K extends keyof T>(target: T, key: K, implementation: unknown) {
  const old = target[key]; target[key] = implementation as T[K]; restore.push(() => { target[key] = old; });
}

describe("AR/AP cancel synchronizes GL in the operational transaction", { concurrency: false }, () => {
  beforeEach(() => {
    stub(prisma, "$transaction", async () => { throw new Error("Must not open a nested transaction"); });
    stub(prisma.journalEntry, "findFirst", async () => { throw new Error("Must not read outside supplied transaction"); });
  });
  afterEach(() => restore.splice(0).reverse().forEach(fn => fn()));
  function harness(status = "DRAFT", reversal: Partial<{ tenantId: string; companyId: string; status: string; reversesEntryId: string }> | null = null) {
    const reversedByEntry = reversal
      ? { id: "reverse", tenantId: ctx.tenantId, companyId: ctx.companyId, status: "POSTED", reversesEntryId: "journal", ...reversal }
      : null;
    const row = { id: "journal", tenantId: ctx.tenantId, companyId: ctx.companyId, status,
      entryDate: new Date("2026-11-05"), lines: [], reversedByEntry };
    const locks: string[] = [], audits: unknown[] = [];
    let writes = 0, failAudit = false, periodClosed = false;
    const tx = {
      $queryRaw: async (parts: TemplateStringsArray) => { locks.push(parts.join("")); return []; },
      period: { findFirst: async () => periodClosed ? { periodKey: "2026-11" } : null },
      journalEntry: {
        findFirst: async () => row,
        updateMany: async ({ where, data }: { where: { status: string }; data: { status: string } }) => {
          if (row.status !== where.status) return { count: 0 };
          writes++; row.status = data.status; return { count: 1 };
        },
      },
      auditLog: { create: async ({ data }: { data: unknown }) => { if (failAudit) throw new Error("Synthetic audit failure"); audits.push(data); return data; } },
    } as unknown as Prisma.TransactionClient;
    return { tx, row, locks, audits, writes: () => writes, failAudit: () => { failAudit = true; }, closePeriod: () => { periodClosed = true; } };
  }
  it("uses the caller transaction for the company lock, DRAFT flip, audit and final read", async () => {
    const h = harness(); await cancelDraftJournalOnOperationalCancel(ctx, params, h.tx);
    assert.equal(h.row.status, "CANCELLED"); assert.equal(h.writes(), 1); assert.equal(h.audits.length, 1);
    assert.ok(h.locks[0]?.includes("companies"));
    await cancelDraftJournalOnOperationalCancel(ctx, params, h.tx);
    assert.equal(h.writes(), 1); assert.equal(h.audits.length, 1);
  });
  it("blocks POSTED without reverse before any operational commit can succeed", async () => {
    const h = harness("POSTED"); await assert.rejects(() => cancelDraftJournalOnOperationalCancel(ctx, params, h.tx), conflict);
    assert.equal(h.row.status, "POSTED"); assert.equal(h.writes(), 0); assert.equal(h.audits.length, 0);
  });
  it("preserves the existing reverse exception without modifying a POSTED journal", async () => {
    const h = harness("POSTED", {}); await assertJournalAllowsOperationalCancel(ctx, params, h.tx);
    await cancelDraftJournalOnOperationalCancel(ctx, params, h.tx);
    assert.equal(h.row.status, "POSTED"); assert.equal(h.writes(), 0);
  });
  it("does not release operational cancellation through a foreign, DRAFT or mislinked reversal", async () => {
    for (const reversal of [{ tenantId: "foreign" }, { companyId: "another-company" }, { status: "DRAFT" }, { reversesEntryId: "another-journal" }]) {
      const h = harness("POSTED", reversal);
      await assert.rejects(() => assertJournalAllowsOperationalCancel(ctx, params, h.tx), conflict);
      await assert.rejects(() => cancelDraftJournalOnOperationalCancel(ctx, params, h.tx), conflict);
      assert.equal(h.writes(), 0);
      assert.equal(h.audits.length, 0);
    }
  });
  it("propagates a TX audit error so the caller rolls back cash, debt and GL together", async () => {
    const h = harness(); h.failAudit();
    await assert.rejects(() => cancelDraftJournalOnOperationalCancel(ctx, params, h.tx), /Synthetic audit failure/);
    assert.equal(h.writes(), 1);
    // No autonomous transaction committed the GL change: the supplied transaction owns all effects.
    assert.equal(h.audits.length, 0);
  });
  it("D-135 refuses the cancellation before writing GL or its audit when the draft period is closed", async () => {
    const h = harness(); h.closePeriod();
    await assert.rejects(() => cancelDraftJournalOnOperationalCancel(ctx, params, h.tx),
      error => conflict(error) && (error as ServiceError).message.includes("PERIOD_CLOSED"));
    assert.equal(h.row.status, "DRAFT");
    assert.equal(h.writes(), 0);
    assert.equal(h.audits.length, 0);
  });
});

describe("AR/AP source validity is checked at GL create/post time", () => {
  const kinds: Array<[JournalEntrySourceType, string, string]> = [
    ["PAYMENT", "payment", "CONFIRMED"], ["COLLECTION", "collection", "CONFIRMED"],
    ["SALES_INVOICE", "salesInvoice", "ISSUED"], ["SALES_CREDIT_NOTE", "salesInvoice", "ISSUED"], ["SALES_DEBIT_NOTE", "salesInvoice", "ISSUED"],
    ["SUPPLIER_INVOICE", "supplierInvoice", "ISSUED"], ["SUPPLIER_CREDIT_NOTE", "supplierInvoice", "ISSUED"], ["SUPPLIER_DEBIT_NOTE", "supplierInvoice", "ISSUED"],
  ];
  for (const [sourceType, model, status] of kinds) it(`${sourceType}: rejects a missing/cancelled source and checks tenant/company`, async () => {
    const kind = sourceType.endsWith("CREDIT_NOTE") ? "CREDIT_NOTE" : sourceType.endsWith("DEBIT_NOTE") ? "DEBIT_NOTE" : "INVOICE";
    let source: { status: string; documentKind: string } | null = { status, documentKind: kind };
    const tx = { [model]: { findFirst: async ({ where }: { where: unknown }) => {
      assert.deepEqual(where, { id: "source", tenantId: "tenant", companyId: "company" }); return source;
    } } } as unknown as Prisma.TransactionClient;
    const entry = { tenantId: "tenant", companyId: "company", sourceType, sourceId: "source" };
    await assertArApJournalSourceCurrent(tx, entry);
    source.status = "CANCELLED"; await assert.rejects(() => assertArApJournalSourceCurrent(tx, entry), conflict);
    source = null; await assert.rejects(() => assertArApJournalSourceCurrent(tx, entry), conflict);
  });
  it("does not change manual/other-module semantics", async () => {
    const tx = {} as Prisma.TransactionClient;
    await assertArApJournalSourceCurrent(tx, { tenantId: "tenant", companyId: "company", sourceType: "MANUAL", sourceId: null });
    await assertArApJournalSourceCurrent(tx, { tenantId: "tenant", companyId: "company", sourceType: "INTERNAL_TRANSFER", sourceId: "transfer" });
  });
});

describe("posting revalidates the locked journal and current operational source", { concurrency: false }, () => {
  let freshStatus: string, sourceStatus: string, sourceAmount: Prisma.Decimal, revision: Date, writes: number, periodDate: Date | undefined;
  const amount = new Prisma.Decimal(10);
  const lines = [
    { id: "debit", accountId: "cash", projectId: null, description: null, debit: amount, credit: new Prisma.Decimal(0), currency: "ARS", account: { tenantId: ctx.tenantId, companyId: ctx.companyId, code: "1", name: "Cash" } },
    { id: "credit", accountId: "debt", projectId: null, description: null, debit: new Prisma.Decimal(0), credit: amount, currency: "ARS", account: { tenantId: ctx.tenantId, companyId: ctx.companyId, code: "2", name: "Debt" } },
  ];
  const row = () => ({ id: "journal", tenantId: "tenant", companyId: "company", sourceType: "PAYMENT", sourceId: "payment",
    projectId: null, status: freshStatus, entryDate: new Date("2026-11-06"), updatedAt: revision, lines, reversedByEntry: null });
  beforeEach(() => {
    freshStatus = "DRAFT"; sourceStatus = "CONFIRMED"; sourceAmount = amount; revision = new Date("2026-11-05T12:00:00Z"); writes = 0; periodDate = undefined;
    stub(prisma.tenantModuleSetting, "findMany", async () => []);
    stub(prisma.company, "findFirst", async () => ({ id: "company" }));
    stub(prisma.journalEntry, "findFirst", async () => ({ ...row(), status: "DRAFT", entryDate: new Date("2026-11-05") }));
    const tx = {
      $queryRaw: async () => [],
      journalEntry: { findFirst: async () => row(), updateMany: async ({ where }: { where: { updatedAt: Date } }) => {
        assert.equal(where.updatedAt, revision); writes++; freshStatus = "POSTED"; return { count: 1 };
      } },
      payment: { findFirst: async () => ({ status: sourceStatus, amount: sourceAmount, currency: "ARS", projectId: null }) },
      accountingAccount: { findMany: async () => [{ id: "cash" }, { id: "debt" }] },
      period: { findFirst: async ({ where }: { where: { startDate: { lte: Date } } }) => { periodDate = where.startDate.lte; return null; } },
      auditLog: { create: async () => ({}) },
    } as unknown as Prisma.TransactionClient;
    stub(prisma, "$transaction", async (run: (tx: Prisma.TransactionClient) => unknown) => run(tx));
  });
  afterEach(() => restore.splice(0).reverse().forEach(fn => fn()));
  it("cannot post a draft cancelled while waiting for Company", async () => {
    freshStatus = "CANCELLED"; await assert.rejects(() => postJournalEntry("journal", ctx), conflict); assert.equal(writes, 0);
  });
  it("cannot post against cash cancelled while waiting for Company", async () => {
    sourceStatus = "CANCELLED"; await assert.rejects(() => postJournalEntry("journal", ctx), conflict); assert.equal(writes, 0);
  });
  it("cannot post a historical draft whose amounts were forged on the public manual entry point", async () => {
    sourceAmount = new Prisma.Decimal(20);
    await assert.rejects(() => postJournalEntry("journal", ctx), conflict);
    assert.equal(writes, 0);
  });
  it("posts only the fresh revision and checks its current accounting date", async () => {
    await postJournalEntry("journal", ctx); assert.equal(writes, 1); assert.equal(periodDate?.toISOString().slice(0, 10), "2026-11-06");
  });
});
