import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Prisma, prisma } from "@bloqer/database";
import { createJournalEntrySchema, type CreateJournalEntryInput } from "@bloqer/validators";
import { ServiceError, type ServiceContext } from "../types";
import {
  assertBalancedJournalEntry,
  assertJournalOperationalSourceCurrent,
  createJournalEntry,
  getJournalEntryById,
  listJournalEntries,
  parseJournalLinesFromInput,
  reversePostedJournalEntry,
  updateJournalEntry,
} from "./journal-entry.service";
import { updateAccountingAccount } from "./accounting-account.service";
import { listPostedJournalBookForExport } from "./accounting-reports.service";
import { getJournalEntrySourceLink } from "./journal-entry-source-link.service";

const ctx: ServiceContext = { tenantId: "tenant", companyId: "company", actorUserId: "actor", roles: ["FINANCE"] };
const date = "2026-11-05";
const input: CreateJournalEntryInput = {
  entryDate: date,
  description: "Manual journal",
  lines: [
    { accountId: "00000000-0000-4000-8000-000000000001", debit: "10.005", credit: "0", currency: " ars " },
    { accountId: "00000000-0000-4000-8000-000000000002", debit: "0", credit: "10.006", currency: "ARS" },
  ],
};
const valid = (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION";
const conflict = (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT";
const restore: Array<() => void> = [];

function stub<T, K extends keyof T>(target: T, key: K, implementation: unknown) {
  const original = target[key];
  target[key] = implementation as T[K];
  restore.push(() => { target[key] = original; });
}

describe("AG-10 accounting service contracts", { concurrency: false }, () => {
  beforeEach(() => {
    stub(prisma.tenantModuleSetting, "findMany", async () => []);
    stub(prisma.company, "findFirst", async () => ({ id: ctx.companyId }));
    stub(prisma, "$transaction", async () => { throw new Error("Unexpected database write"); });
  });
  afterEach(() => restore.splice(0).reverse().forEach(fn => fn()));

  it("rounds half-up before balancing and saves a single canonical currency", () => {
    const lines = parseJournalLinesFromInput(input.lines);
    assertBalancedJournalEntry(lines);
    assert.deepEqual(lines.map(l => [l.currency, l.debit.toFixed(2), l.credit.toFixed(2)]), [
      ["ARS", "10.01", "0.00"], ["ARS", "0.00", "10.01"],
    ]);
    const [debit, credit] = input.lines;
    assert.throws(() => assertBalancedJournalEntry(parseJournalLinesFromInput([
      { ...debit!, debit: "0.005" }, { ...debit!, debit: "0.005" }, { ...credit!, credit: "0.01" },
    ])), valid);
    assert.throws(() => parseJournalLinesFromInput([{ ...debit!, debit: "-1" }]), valid);
    assert.throws(() => parseJournalLinesFromInput([{ ...debit!, debit: "99999999999999.999" }]), valid);
    assert.equal(createJournalEntrySchema.safeParse({ ...input, entryDate: "2026-02-31" }).success, false);
    assert.equal(createJournalEntrySchema.safeParse({ ...input, lines: [{ ...debit!, currency: " " }, credit] }).success, false);
  });

  it("rejects a public manual payload claiming to be the active journal of an invoice", async () => {
    await assert.rejects(() => createJournalEntry({ ...input, sourceType: "SALES_INVOICE", sourceId: "invoice" }, ctx), valid);
    await assert.rejects(() => createJournalEntry({ ...input, sourceId: "untrusted" }, ctx), valid);
  });

  it("does not expose the original collection amount through the journal panel when AR is disabled", async () => {
    stub(prisma.tenantModuleSetting, "findMany", async () => [{ moduleKey: "AR", isEnabled: false }]);
    stub(prisma.collection, "findFirst", async () => ({
      id: "collection", companyId: ctx.companyId, projectId: null, collectionDate: new Date(date),
      currency: "ARS", amount: new Prisma.Decimal("1234.50"), receivableId: "receivable",
    }));
    const source = await getJournalEntrySourceLink(ctx, { companyId: ctx.companyId!, sourceType: "COLLECTION", sourceId: "collection" });
    assert.equal(source?.href, null);
    assert.equal(source?.detail, "");
    assert.match(source?.noAccessHint ?? "", /Necesitás acceso/);
  });

  it("checks closed period after acquiring Company before creating a journal", async () => {
    let locked = false;
    const tx = {
      $queryRaw: async () => { locked = true; return []; },
      period: { findFirst: async () => { assert.equal(locked, true); return { periodKey: "2026-11" }; } },
    } as unknown as Prisma.TransactionClient;
    stub(prisma, "$transaction", async (run: (db: Prisma.TransactionClient) => unknown) => run(tx));
    await assert.rejects(() => createJournalEntry(input, ctx), error => conflict(error) && (error as ServiceError).message.includes("PERIOD_CLOSED"));
  });

  it("validates the project on a header-only update and checks both sides of a date move", async () => {
    const draft = { id: "journal", tenantId: ctx.tenantId, companyId: ctx.companyId, status: "DRAFT",
      entryDate: new Date(date), sourceType: "MANUAL", sourceId: null, projectId: null, lines: [] };
    let lock = false;
    const checked: string[] = [];
    stub(prisma.journalEntry, "findFirst", async () => draft);
    const tx = {
      $queryRaw: async () => { lock = true; return []; },
      journalEntry: { findFirst: async () => draft },
      project: { findMany: async () => [{ id: "project", companyId: "another-company" }] },
      period: { findFirst: async ({ where }: { where: { startDate: { lte: Date } } }) => {
        assert.equal(lock, true);
        checked.push(where.startDate.lte.toISOString().slice(0, 10));
        return null;
      } },
    } as unknown as Prisma.TransactionClient;
    stub(prisma, "$transaction", async (run: (db: Prisma.TransactionClient) => unknown) => run(tx));
    await assert.rejects(() => updateJournalEntry("journal", { entryDate: "2026-10-31", projectId: "project" }, ctx), valid);
    assert.deepEqual(checked, [date, "2026-10-31"]);
  });

  it("rejects historical journal relationships across tenants or companies in reads and reversal", async () => {
    const original = {
      id: "journal", tenantId: ctx.tenantId, companyId: ctx.companyId, projectId: null, project: null,
      entryDate: new Date(date), status: "POSTED", reversesEntryId: null, reversedByEntry: null, reference: null,
      lines: parseJournalLinesFromInput(input.lines).map((line, index) => ({
        ...line, id: `line-${index}`, project: null as { tenantId: string; companyId: string } | null,
        account: { tenantId: ctx.tenantId, companyId: ctx.companyId, code: `account-${index}`, name: "Historical account", isActive: false },
      })),
    };
    let locked = false;
    let writes = 0;
    let audits = 0;
    original.lines[0]!.debit = new Prisma.Decimal("10.0050");
    original.lines[1]!.credit = original.lines[0]!.debit;
    const tx = {
      $queryRaw: async () => { locked = true; return []; },
      journalEntry: {
        findFirst: async () => { assert.equal(locked, true); return original; },
        create: async ({ data }: { data: { sourceId: string; reversesEntryId: string; lines: { create: Array<{ debit: Prisma.Decimal; credit: Prisma.Decimal }> } } }) => {
          assert.equal(locked, true);
          assert.equal(data.lines.create[0]?.credit.toFixed(4), "10.0050");
          writes++;
          return { ...original, id: "reverse", sourceId: data.sourceId, reversesEntryId: data.reversesEntryId, reversesEntry: original,
            lines: original.lines.map((line, i) => ({ ...line, ...data.lines.create[i] })) };
        },
      },
      period: { findFirst: async () => null },
      auditLog: { create: async () => { audits++; return {}; } },
    } as unknown as Prisma.TransactionClient;
    stub(prisma.journalEntry, "findFirst", async () => original);
    stub(prisma.journalEntry, "findMany", async () => [original]);
    stub(prisma.journalEntry, "count", async () => 1);
    stub(prisma, "$transaction", async (run: (db: Prisma.TransactionClient) => unknown) => {
      locked = false;
      return run(tx);
    });

    original.lines[0]!.account.tenantId = "foreign-tenant";
    await assert.rejects(() => getJournalEntryById(original.id, ctx), conflict);
    await assert.rejects(() => listJournalEntries(ctx, { page: 1, pageSize: 20 }), conflict);
    await assert.rejects(() => reversePostedJournalEntry(original.id, ctx, { entryDate: date }), conflict);
    original.lines[0]!.account.tenantId = ctx.tenantId;
    original.lines[1]!.projectId = "foreign-project";
    original.lines[1]!.project = { tenantId: ctx.tenantId, companyId: "another-company" };
    await assert.rejects(() => reversePostedJournalEntry(original.id, ctx, { entryDate: date }), conflict);
    assert.equal(writes, 0);
    assert.equal(audits, 0);

    original.lines[1]!.projectId = null;
    original.lines[1]!.project = null;
    const reversed = await reversePostedJournalEntry(original.id, ctx, { entryDate: date });
    assert.equal(reversed.reversesEntryId, original.id);
    assert.equal(reversed.lines[0]?.credit, "10.01");
    assert.equal(reversed.lines[0]?.accountName, "Historical account");
    assert.equal(writes, 1);
    assert.equal(audits, 1);
  });

  it("exposes reversal references only for a reciprocal POSTED relation in the same scope", async () => {
    const original = { id: "original", tenantId: ctx.tenantId, companyId: ctx.companyId, status: "POSTED", projectId: null, project: null, lines: [] };
    const reverse = { ...original, id: "reverse", reversesEntryId: original.id, sourceId: original.id };
    for (const invalid of [{ status: "DRAFT" }, { companyId: "foreign" }, { tenantId: "foreign" }, { reversesEntryId: "wrong" }]) {
      stub(prisma.journalEntry, "findFirst", async () => ({ ...original, reversedByEntry: { ...reverse, ...invalid } }));
      assert.equal((await getJournalEntryById(original.id, ctx)).reversedByEntryId, null);
    }
    stub(prisma.journalEntry, "findFirst", async () => ({ ...original, reversedByEntry: reverse }));
    assert.equal((await getJournalEntryById(original.id, ctx)).reversedByEntryId, reverse.id);
    stub(prisma.journalEntry, "findFirst", async () => ({ ...reverse, reversesEntry: { ...original, tenantId: "foreign" } }));
    const invalidLink = await getJournalEntryById(reverse.id, ctx);
    assert.equal(invalidLink.reversesEntryId, null);
    assert.equal(invalidLink.sourceId, null);
  });

  it("allows an intercompany transfer journal only in the root company with both matching legs", async () => {
    const amount = new Prisma.Decimal("10.01");
    const movementDate = new Date(date);
    const sourceAccount = { id: "from", tenantId: ctx.tenantId, companyId: ctx.companyId, currency: "ARS" };
    const destinationAccount = { ...sourceAccount, id: "to", companyId: "destination-company" };
    const transfer = { id: "transfer", companyId: ctx.companyId, sourceAccount, destinationAccount, sourceAccountId: "from",
      destinationAccountId: "to", amount, currency: "ARS", transferDate: movementDate };
    const legs = [
      { accountId: "from", companyId: ctx.companyId, status: "CONFIRMED", type: "TRANSFER_OUT", currency: "ARS", amount, movementDate },
      { accountId: "to", companyId: "destination-company", status: "RECONCILED", type: "TRANSFER_IN", currency: "ARS", amount, movementDate },
    ];
    const tx = { internalTransfer: { findFirst: async () => transfer }, accountMovement: { findMany: async () => legs } } as unknown as Prisma.TransactionClient;
    const entry = { tenantId: ctx.tenantId, companyId: ctx.companyId!, projectId: null, sourceType: "INTERNAL_TRANSFER" as const,
      sourceId: "transfer", lines: parseJournalLinesFromInput(input.lines) };
    await assertJournalOperationalSourceCurrent(tx, entry);
    await assert.rejects(() => assertJournalOperationalSourceCurrent(tx, { ...entry, companyId: "destination-company" }), conflict);
    legs[1]!.status = "CANCELLED";
    await assert.rejects(() => assertJournalOperationalSourceCurrent(tx, entry), conflict);
    legs.pop();
    await assert.rejects(() => assertJournalOperationalSourceCurrent(tx, entry), conflict);
  });

  it("rejects a chart-of-accounts cycle before changing parent or writing its audit", async () => {
    const parent = { id: "parent", companyId: ctx.companyId, parentId: null, type: "ASSET" };
    stub(prisma.accountingAccount, "findFirst", async () => parent);
    const tx = {
      $queryRaw: async () => [],
      accountingAccount: {
        findFirst: async () => parent,
        findMany: async () => [parent, { id: "child", parentId: "parent" }],
      },
      journalEntryLine: { findFirst: async () => null },
    } as unknown as Prisma.TransactionClient;
    stub(prisma, "$transaction", async (run: (db: Prisma.TransactionClient) => unknown) => run(tx));
    await assert.rejects(() => updateAccountingAccount("parent", { parentId: "child" }, ctx), valid);
  });

  it("uses one consistent journal export snapshot and avoids fetching rows over the cap", async () => {
    let fetched = false;
    const tx = { journalEntry: {
      count: async () => 5001,
      findMany: async () => { fetched = true; return []; },
    } } as unknown as Prisma.TransactionClient;
    stub(prisma, "$transaction", async (run: (db: Prisma.TransactionClient) => unknown, options: { isolationLevel: string }) => {
      assert.equal(options.isolationLevel, Prisma.TransactionIsolationLevel.RepeatableRead);
      return run(tx);
    });
    const book = await listPostedJournalBookForExport(ctx, { dateFrom: date, dateTo: date }, 5000);
    assert.equal(book.total, 5001);
    assert.deepEqual(book.data, []);
    assert.equal(fetched, false);
  });
});
