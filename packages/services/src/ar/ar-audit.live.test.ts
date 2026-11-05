/** AG09 AR SQL regression. Opt-in; identity guard runs before every owned fixture write. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hash } from "bcryptjs";
import { before, after, describe, it } from "node:test";
import { Prisma, prisma } from "@bloqer/database";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import { createSalesInvoice, getSalesInvoiceById, issueSalesInvoice, updateSalesInvoice, cancelSalesInvoice, listInvoicesByProject } from "./sales-invoice.service";
import { getReceivableById, getReceivableBySalesInvoiceId, listReceivablesByProject, summarizeReceivablesByProject } from "./receivable.service";
import { createSalesCreditNoteFromInvoice, createSalesDebitNoteFromInvoice, issueSalesCreditNote, issueSalesDebitNote, cancelSalesCreditNote } from "./credit-debit-note.service";
import { createCollection, cancelCollection, getCollectionById, listCollectionsByProject } from "../treasury/collection.service";
import { registerArIncome } from "./register-ar-income.service";
import { registerArAdvance } from "./register-ar-advance.service";
import { fetchCompanyReceivableSnapshotRows, aggregateCompanyReceivableBalances } from "./company-ar-snapshot";
import { postJournalEntry } from "../accounting/journal-entry.service";

const denied = (e: unknown) => e instanceof ServiceError && ["FORBIDDEN", "NOT_FOUND"].includes(e.code);
const invalid = (e: unknown) => e instanceof ServiceError && e.code === "VALIDATION";
const conflict = (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT";
describe("AG09 AR sales, notes and collection SQL integrity", { skip: process.env.BLOQER_AUDIT_LIVE !== "1", concurrency: false }, () => {
  const tenantId = randomUUID(), foreignTenantId = randomUUID(), companyId = randomUUID(), companyB = randomUUID(), actorId = randomUUID(), pmId = randomUUID(), clientId = randomUUID(), foreignClientId = randomUUID();
  const ctx: ServiceContext = { tenantId, companyId, actorUserId: actorId, roles: ["OWNER"] };
  const other: ServiceContext = { ...ctx, companyId: companyB };
  const global: ServiceContext = { ...ctx, companyId: null };
  const pm: ServiceContext = { ...ctx, actorUserId: pmId, roles: ["PROJECT_MANAGER"] };
  const date = "2026-11-05";
  let verified = false;
  const retain = process.env.BLOQER_AUDIT_RETAIN_FIXTURES === "1";
  before(async () => {
    await assertAuditDatabaseIdentity(prisma); verified = true; clearProjectAccessModeCache();
    await prisma.$transaction(async (tx) => {
      await tx.tenant.createMany({ data: [tenantId, foreignTenantId].map((id) => ({ id, name: "Synthetic AG09 AR", slug: "audit-ar-" + id, projectAccessMode: "MEMBERSHIP_SCOPED" as const })) });
      await tx.company.createMany({ data: [companyId, companyB].map((id) => ({ id, tenantId, name: "Synthetic AG09 AR " + id, country: "AR", ivaCondition: "RESPONSIBLE_INSCRIPTO" as const })) });
      const passwordHash = retain ? await hash("audit-ag09-local-only", 10) : null;
      await tx.user.createMany({ data: [actorId, pmId].map((id) => ({ id, email: "audit-ar-" + id + "@example.test", passwordHash, status: "ACTIVE" as const, emailVerified: new Date() })) });
      await tx.userMembership.createMany({ data: [{ tenantId, companyId, userId: actorId, roles: ["OWNER"] }, { tenantId, companyId, userId: pmId, roles: ["PROJECT_MANAGER"] }] });
      await tx.contact.create({ data: { id: clientId, tenantId, legalName: "Synthetic AG09 client", country: "AR", ivaCondition: "RESPONSIBLE_INSCRIPTO", roles: { create: { tenantId, role: "CLIENT" } } } });
      await tx.contact.create({ data: { id: foreignClientId, tenantId: foreignTenantId, legalName: "Foreign synthetic client" } });
      await tx.tenantModuleSetting.create({ data: { tenantId, moduleKey: "ACCOUNTING", isEnabled: false } });
    }, { timeout: 30_000 });
  });
  after(async () => {
    clearProjectAccessModeCache(); if (!verified) return;
    if (retain) {
      const path = fileURLToPath(new URL("../../../../output/platform-audit/ag-09-2026-11-05/ar-retained-fixture.json", import.meta.url));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify({ tenantId, foreignTenantId, companyId, companyB, actorId, pmId, clientId, actorEmail: "audit-ar-" + actorId + "@example.test", projects: await prisma.project.findMany({ where: { tenantId }, select: { id: true, code: true } }), accounts: await prisma.treasuryAccount.findMany({ where: { tenantId }, select: { id: true, currency: true } }) }, null, 2));
      await prisma.$disconnect(); return;
    }
    try {
      await prisma.$transaction(async (tx) => {
        await tx.notification.deleteMany({ where: { tenantId } });
        await tx.accountMovement.deleteMany({ where: { tenantId } });
        await tx.collection.deleteMany({ where: { tenantId } });
        await tx.receivableCreditApplication.deleteMany({ where: { tenantId } });
        await tx.receivable.deleteMany({ where: { tenantId } });
        await tx.salesInvoiceLine.deleteMany({ where: { invoice: { tenantId } } });
        await tx.salesInvoice.deleteMany({ where: { tenantId } });
        await tx.journalEntryLine.deleteMany({ where: { journalEntry: { tenantId } } });
        await tx.journalEntry.deleteMany({ where: { tenantId } });
        await tx.accountingAccount.deleteMany({ where: { tenantId } });
        await tx.auditLog.deleteMany({ where: { tenantId } });
        await tx.projectMembership.deleteMany({ where: { tenantId } });
        await tx.project.deleteMany({ where: { tenantId } });
        await tx.treasuryAccount.deleteMany({ where: { tenantId } });
        await tx.period.deleteMany({ where: { tenantId } });
        await tx.contactRole.deleteMany({ where: { tenantId } });
        await tx.contact.deleteMany({ where: { tenantId: { in: [tenantId, foreignTenantId] } } });
        await tx.userMembership.deleteMany({ where: { tenantId } });
        await tx.tenantModuleSetting.deleteMany({ where: { tenantId } });
        await tx.company.deleteMany({ where: { tenantId } });
        await tx.tenant.deleteMany({ where: { id: { in: [tenantId, foreignTenantId] } } });
        await tx.user.deleteMany({ where: { id: { in: [actorId, pmId] } } });
      }, { timeout: 60_000 });
    } finally { await prisma.$disconnect(); }
  });
  const key = () => randomUUID();
  async function project() { return prisma.project.create({ data: { tenantId, companyId: null, clientContactId: clientId, name: "Synthetic AG09 work", code: key(), country: "AR", status: "ACTIVE" } }); }
  async function account(currency = "ARS", owner: string | null = companyId) { return prisma.treasuryAccount.create({ data: { tenantId, companyId: owner, name: "Synthetic AG09 bank " + key(), type: "BANK", currency } }); }
  async function draft(projectId: string, context = ctx, opts: { amount?: string; currency?: string; fxRate?: string } = {}) {
    return createSalesInvoice({ projectId, clientContactId: clientId, issueDate: date, dueDate: date, currency: opts.currency ?? "ARS", fxRate: opts.fxRate, invoiceLetter: "C", externalInvoiceRef: null, iibbPerceptionRate: "0", lines: [{ description: "Synthetic service", quantity: "1", unitPrice: opts.amount ?? "100", taxRate: "0", discountPct: "0", sortOrder: 0 }] }, context);
  }
  async function issued(projectId: string, context = ctx, opts: { amount?: string; currency?: string; fxRate?: string } = {}) {
    const invoice = await draft(projectId, context, opts); await issueSalesInvoice(invoice.id, context, projectId);
    const receivable = await prisma.receivable.findUniqueOrThrow({ where: { salesInvoiceId: invoice.id } });
    return { invoice, receivable };
  }
  async function collect(receivableId: string, accountId: string, amount?: string, fxRate?: string) {
    return createCollection({ receivableId, accountId, collectionDate: date, reference: null, collectFullBalance: amount === undefined, amount, fxRate, idempotencyKey: key() }, ctx);
  }
  const income = (idempotencyKey = key()) => ({ clientContactId: clientId, issueDate: date, dueDate: date, currency: "ARS", invoiceLetter: "C" as const, externalInvoiceRef: null, iibbPerceptionRate: "0", idempotencyKey, lines: [{ description: "Corporate synthetic", quantity: "1", unitPrice: "100", taxRate: "0", discountPct: "0", sortOrder: 0 }] });
  async function journal(sourceType: "SALES_INVOICE" | "SALES_CREDIT_NOTE" | "SALES_DEBIT_NOTE" | "COLLECTION", sourceId: string, projectId: string, amount = "20") {
    const debit = await prisma.accountingAccount.create({ data: { tenantId, companyId, code: key(), name: "Synthetic AR asset", type: "ASSET" } });
    const credit = await prisma.accountingAccount.create({ data: { tenantId, companyId, code: key(), name: "Synthetic AR income", type: "INCOME" } });
    return prisma.journalEntry.create({ data: { tenantId, companyId, projectId, entryDate: new Date(date), sourceType, sourceId, description: "Synthetic AR boundary", createdByUserId: actorId, updatedByUserId: actorId,
      lines: { create: [{ accountId: debit.id, projectId, debit: amount, currency: "ARS" }, { accountId: credit.id, projectId, credit: amount, currency: "ARS" }] } } });
  }
  async function failJournalAudit(work: () => Promise<unknown>) {
    const original = prisma.$transaction, transaction = original.bind(prisma);
    prisma.$transaction = (async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) =>
      transaction(async (tx) => {
        const delegate = new Proxy(tx.auditLog, { get(target, property) {
          if (property !== "create") return Reflect.get(target, property);
          return async (args: Prisma.AuditLogCreateArgs) => {
            if (args.data.action === "journal_entry.cancelled") throw new Error("synthetic journal audit failure");
            return target.create(args);
          };
        } });
        return fn(new Proxy(tx, { get(target, property) { return property === "auditLog" ? delegate : Reflect.get(target, property); } }));
      }, options)) as typeof prisma.$transaction;
    try { await assert.rejects(work, /synthetic journal audit failure/); }
    finally { prisma.$transaction = original; }
  }
  async function afterPreflight<T>(work: () => Promise<T>, change: () => Promise<unknown>) {
    const original = prisma.$transaction, transaction = original.bind(prisma); let first = true;
    prisma.$transaction = (async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => {
      if (first) { first = false; await change(); }
      return transaction(fn, options);
    }) as typeof prisma.$transaction;
    try { return await work(); } finally { prisma.$transaction = original; }
  }

  it("restricts shared-project invoice, AR and collection lists and ID reads to the document company", async () => {
    const p = await project(), a = await issued(p.id), b = await issued(p.id, other), bank = await account();
    await collect(a.receivable.id, bank.id, "10");
    const bankB = await account("ARS", companyB);
    await createCollection({ receivableId: b.receivable.id, accountId: bankB.id, collectionDate: date, reference: null, amount: "10", idempotencyKey: key() }, other);
    assert.equal((await listInvoicesByProject(p.id, ctx)).total, 1);
    assert.equal((await listReceivablesByProject(p.id, ctx)).total, 1);
    assert.equal((await listCollectionsByProject(p.id, ctx)).total, 1);
    assert.equal((await listInvoicesByProject(p.id, global)).total, 2);
    await assert.rejects(() => getReceivableById(b.receivable.id, ctx), denied);
    await assert.rejects(() => getReceivableBySalesInvoiceId(b.invoice.id, ctx), denied);
    assert.equal((await summarizeReceivablesByProject(p.id, ctx)).totalByCurrency[0]?.amount, "90.00");
  });
  it("requires project ACL before invoice cancellation even when retried or route scope is omitted", async () => {
    const p = await project(), invoice = await draft(p.id);
    await assert.rejects(() => cancelSalesInvoice(invoice.id, pm), denied);
    await cancelSalesInvoice(invoice.id, ctx, p.id);
    await assert.rejects(() => cancelSalesInvoice(invoice.id, pm), denied);
    assert.equal((await cancelSalesInvoice(invoice.id, ctx, p.id)).status, "CANCELLED");
  });
  it("denies corporate AR and collection IDs to project-only finance", async () => {
    const result = await registerArIncome(income(), ctx);
    const r = await prisma.receivable.findUniqueOrThrow({ where: { id: result.traceChain.find((r) => r.entityType === "Receivable")!.entityId } });
    const bank = await account(), c = await collect(r.id, bank.id, "10");
    await assert.rejects(() => getReceivableById(r.id, pm), denied);
    await assert.rejects(() => getCollectionById(c.id, pm), denied);
  });
  it("validates real relation parents rather than serializing a foreign contact name", async () => {
    const p = await project(), inv = await draft(p.id);
    await prisma.salesInvoice.update({ where: { id: inv.id }, data: { clientContactId: foreignClientId } });
    try { await assert.rejects(() => getSalesInvoiceById(inv.id, ctx), conflict); }
    finally { await prisma.salesInvoice.update({ where: { id: inv.id }, data: { clientContactId: clientId } }); }
  });
  it("rejects invalid direct inputs and preserves draft notes clearing", async () => {
    const p = await project(), inv = await draft(p.id);
    await updateSalesInvoice(inv.id, { notes: "A", internalNotes: "B" }, ctx);
    const cleared = await updateSalesInvoice(inv.id, { notes: null, internalNotes: null }, ctx);
    assert.equal(cleared.notes, null); assert.equal(cleared.internalNotes, null);
    await assert.rejects(() => updateSalesInvoice(inv.id, { issueDate: "2026-02-30" }, ctx), invalid);
    await assert.rejects(() => updateSalesInvoice(inv.id, { dueDate: "2026-01-01" }, ctx), invalid);
  });
  it("rounds note lines before header totals and serializes every money/FX field", async () => {
    const p = await project(), { invoice } = await issued(p.id);
    const note = await createSalesDebitNoteFromInvoice({ parentSalesInvoiceId: invoice.id, lines: [{ description: "Fraction", quantity: "1", unitPrice: "0.025", taxRate: "0" }, { description: "Fraction2", quantity: "1", unitPrice: "0.025", taxRate: "0" }] }, ctx);
    assert.equal(note.totalAmount, "0.06");
    const rows = await prisma.salesInvoiceLine.findMany({ where: { invoiceId: note.id } });
    assert.ok(rows.every((row) => row.lineSubtotal.eq("0.03")));
    assert.equal(typeof note.fxRate, "string"); assert.equal(typeof note.amountArs, "string");
  });
  it("serializes NC/ND numbering across corporate parents and separate projects", async () => {
    const first = await registerArIncome(income(), ctx), second = await registerArIncome(income(), ctx);
    const ids = [first, second].map((r) => r.traceChain.find((link) => link.entityType === "SalesInvoice")!.entityId);
    const notes = await Promise.all(ids.map((id) => createSalesDebitNoteFromInvoice({ parentSalesInvoiceId: id }, ctx)));
    assert.notEqual(notes[0]!.number, notes[1]!.number);
  });
  it("keeps cash and credit separate through partial application, reasons and reversal replay", async () => {
    const p = await project(), { invoice, receivable } = await issued(p.id), bank = await account();
    const nc = await createSalesCreditNoteFromInvoice({ parentSalesInvoiceId: invoice.id, lines: [{ description: "NC", quantity: "1", unitPrice: "30", taxRate: "0" }] }, ctx);
    await issueSalesCreditNote(nc.id, ctx);
    const c = await collect(receivable.id, bank.id, "20");
    const r = await getReceivableById(receivable.id, ctx);
    assert.equal(r.paidAmount, "20.00"); assert.equal(r.creditedAmount, "30.00"); assert.equal(r.balanceDue, "50.00");
    const snapshots = await fetchCompanyReceivableSnapshotRows(ctx);
    assert.ok(aggregateCompanyReceivableBalances(snapshots).totalByCurrency.length > 0);
    await assert.rejects(() => cancelSalesCreditNote(nc.id, ctx), invalid);
    await cancelSalesCreditNote(nc.id, ctx, undefined, "Synthetic reversal");
    await assert.rejects(() => cancelCollection(c.id, ctx), invalid);
    await cancelCollection(c.id, ctx, undefined, "Synthetic cash reversal");
    await cancelCollection(c.id, ctx);
    await cancelSalesCreditNote(nc.id, ctx);
    const final = await getReceivableById(receivable.id, ctx);
    assert.equal(final.paidAmount, "0.00"); assert.equal(final.creditedAmount, "0.00"); assert.equal(final.balanceDue, "100.00");
    assert.equal(await prisma.auditLog.count({ where: { tenantId, entityId: c.id, action: "collection.cancelled" } }), 1);
  });
  it("derives settlement without rewriting historical cash, status or timestamps", async () => {
    const p = await project(), { receivable } = await issued(p.id);
    await prisma.receivable.update({ where: { id: receivable.id }, data: { paidAmount: "49.999", creditedAmount: "50", status: "PARTIAL" } });
    try {
      const before = await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } });
      const r = await getReceivableById(receivable.id, ctx);
      assert.equal(r.paidAmount, "50.00"); assert.equal(r.creditedAmount, "50.00"); assert.equal(r.balanceDue, "0.00");
      assert.equal(r.status, "PAID");
      const after = await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } });
      assert.equal(after.paidAmount.toString(), "49.999");
      assert.equal(after.status, before.status);
      assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime());
    } finally {
      await prisma.receivable.update({ where: { id: receivable.id }, data: { paidAmount: "0", creditedAmount: "0", status: "OPEN" } });
    }
  });
  it("requires explicit foreign FX and preserves it on advance invoice and collection", async () => {
    const p = await project(), bank = await account("USD");
    await assert.rejects(() => draft(p.id, ctx, { currency: "USD" }), invalid);
    const result = await registerArAdvance({ projectId: p.id, clientContactId: clientId, issueDate: date, amount: "10", currency: "USD", fxRate: "1250.123456", idempotencyKey: key(), collectNow: { accountId: bank.id, collectionDate: date, reference: null, idempotencyKey: key() } }, ctx);
    const id = result.traceChain.find((r) => r.entityType === "SalesInvoice")!.entityId;
    const invoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id } });
    const c = await prisma.collection.findFirstOrThrow({ where: { salesInvoiceId: id } });
    assert.equal(invoice.fxRate.toFixed(6), "1250.123456"); assert.equal(invoice.amountArs.toFixed(2), "12501.23");
    assert.equal(c.fxRate.toFixed(6), "1250.123456"); assert.equal(c.amountArs.toFixed(2), "12501.23"); assert.ok(invoice.invoiceLetter);
  });
  it("rejects replay from another company or with changed IIBB and emits no second document", async () => {
    const payload = income(); const result = await registerArIncome(payload, ctx);
    await assert.rejects(() => registerArIncome(payload, other), denied);
    await assert.rejects(() => registerArIncome({ ...payload, iibbPerceptionRate: "3" }, ctx), conflict);
    const retry = await registerArIncome(payload, ctx); assert.equal(retry.primaryEntityId, result.primaryEntityId);
    assert.equal(await prisma.salesInvoice.count({ where: { tenantId, idempotencyKey: payload.idempotencyKey } }), 1);
  });
  it("uses one company/account lock order for standalone and composite collections", async () => {
    const p = await project(), { receivable } = await issued(p.id), bank = await account();
    await Promise.all([collect(receivable.id, bank.id, "10"), registerArIncome({ ...income(), collectNow: { accountId: bank.id, collectionDate: date, reference: null, amount: "10", idempotencyKey: key() } }, ctx)]);
  });
  it("rolls invoice creation back with its audit entry", async () => {
    const p = await project(), beforeCount = await prisma.salesInvoice.count({ where: { tenantId } });
    await assert.rejects(() => draft(p.id, { ...ctx, actorUserId: key() }));
    assert.equal(await prisma.salesInvoice.count({ where: { tenantId } }), beforeCount);
  });
  it("leaves the issued parent intact while a debit note blocks cancellation", async () => {
    const p = await project(), { invoice } = await issued(p.id);
    const nd = await createSalesDebitNoteFromInvoice({ parentSalesInvoiceId: invoice.id }, ctx); await issueSalesDebitNote(nd.id, ctx);
    await assert.rejects(() => cancelSalesInvoice(invoice.id, ctx, p.id, "Synthetic cancellation"), conflict);
    assert.equal((await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).status, "ISSUED");
  });
  it("requires Treasury for collection and cancellation without changing AR-only permissions", async () => {
    const p = await project(), { receivable } = await issued(p.id), bank = await account();
    const c = await collect(receivable.id, bank.id, "20");
    await prisma.tenantModuleSetting.upsert({ where: { tenantId_moduleKey: { tenantId, moduleKey: "TREASURY" } }, create: { tenantId, moduleKey: "TREASURY", isEnabled: false }, update: { isEnabled: false } });
    try {
      await assert.rejects(() => collect(receivable.id, bank.id, "10"), denied);
      await assert.rejects(() => cancelCollection(c.id, ctx, undefined, "Synthetic reversal"), denied);
      assert.equal((await prisma.collection.findUniqueOrThrow({ where: { id: c.id } })).status, "CONFIRMED");
      assert.equal((await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } })).paidAmount.toFixed(2), "20.00");
    } finally { await prisma.tenantModuleSetting.delete({ where: { tenantId_moduleKey: { tenantId, moduleKey: "TREASURY" } } }); }
  });
  it("refuses a missing, duplicated or inconsistent collection cash leg without reversing debt", async () => {
    const p = await project(), { receivable } = await issued(p.id), bank = await account();
    const c = await collect(receivable.id, bank.id, "20");
    const movement = await prisma.accountMovement.findFirstOrThrow({ where: { tenantId, sourceType: "COLLECTION", sourceId: c.id } });
    const cancel = () => cancelCollection(c.id, ctx, undefined, "Synthetic reversal");
    await prisma.accountMovement.delete({ where: { id: movement.id } });
    try { await assert.rejects(cancel, conflict); }
    finally { await prisma.accountMovement.create({ data: movement }); }
    const duplicateId = key();
    await prisma.accountMovement.create({ data: { ...movement, id: duplicateId } });
    try { await assert.rejects(cancel, conflict); }
    finally { await prisma.accountMovement.delete({ where: { id: duplicateId } }); }
    await prisma.accountMovement.update({ where: { id: movement.id }, data: { amount: "19" } });
    try { await assert.rejects(cancel, conflict); }
    finally { await prisma.accountMovement.update({ where: { id: movement.id }, data: { amount: movement.amount } }); }
    assert.equal((await prisma.collection.findUniqueOrThrow({ where: { id: c.id } })).status, "CONFIRMED");
    assert.equal((await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } })).paidAmount.toFixed(2), "20.00");
    await cancel();
    await cancelCollection(c.id, ctx);
    assert.equal((await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } })).paidAmount.toFixed(2), "0.00");
  });
  it("rejects a corrupted AR parent before exposing corporate KPI money", async () => {
    const p = await project(), { receivable } = await issued(p.id);
    await prisma.receivable.update({ where: { id: receivable.id }, data: { clientContactId: foreignClientId } });
    try { await assert.rejects(() => fetchCompanyReceivableSnapshotRows(ctx), conflict); }
    finally { await prisma.receivable.update({ where: { id: receivable.id }, data: { clientContactId: clientId } }); }
  });
  it("rechecks Treasury inside both collection transactions after preflight", async () => {
    const p = await project(), { receivable } = await issued(p.id), bank = await account();
    const c = await collect(receivable.id, bank.id, "20");
    for (const work of [() => collect(receivable.id, bank.id, "10"), () => cancelCollection(c.id, ctx, undefined, "Synthetic correction")]) {
      try {
        await assert.rejects(() => afterPreflight<unknown>(work, () => prisma.tenantModuleSetting.upsert({ where: { tenantId_moduleKey: { tenantId, moduleKey: "TREASURY" } }, create: { tenantId, moduleKey: "TREASURY", isEnabled: false }, update: { isEnabled: false } })), denied);
        assert.equal((await prisma.collection.findUniqueOrThrow({ where: { id: c.id } })).status, "CONFIRMED");
        assert.equal((await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } })).paidAmount.toFixed(2), "20.00");
      } finally { await prisma.tenantModuleSetting.deleteMany({ where: { tenantId, moduleKey: "TREASURY" } }); }
    }
  });
  it("rolls collection, cash, debt and linked journal back when journal cancellation audit fails", async () => {
    const p = await project(), { receivable } = await issued(p.id), bank = await account();
    const c = await collect(receivable.id, bank.id, "20"), entry = await journal("COLLECTION", c.id, p.id);
    await failJournalAudit(() => cancelCollection(c.id, ctx, undefined, "Synthetic correction"));
    assert.equal((await prisma.collection.findUniqueOrThrow({ where: { id: c.id } })).status, "CONFIRMED");
    assert.equal((await prisma.accountMovement.findFirstOrThrow({ where: { sourceType: "COLLECTION", sourceId: c.id } })).status, "CONFIRMED");
    assert.equal((await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } })).paidAmount.toFixed(2), "20.00");
    assert.equal((await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id } })).status, "DRAFT");
    await cancelCollection(c.id, ctx, undefined, "Synthetic correction");
    assert.equal((await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id } })).status, "CANCELLED");
  });
  it("rolls invoice and credit-note cancellation back with their linked journal audit", async () => {
    const p = await project(), { invoice, receivable } = await issued(p.id), entry = await journal("SALES_INVOICE", invoice.id, p.id, "100");
    await failJournalAudit(() => cancelSalesInvoice(invoice.id, ctx, p.id, "Synthetic correction"));
    assert.equal((await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).status, "ISSUED");
    assert.equal((await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } })).status, "OPEN");
    assert.equal((await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id } })).status, "DRAFT");
    await cancelSalesInvoice(invoice.id, ctx, p.id, "Synthetic correction");
    assert.equal((await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id } })).status, "CANCELLED");
    const another = await issued(p.id), nc = await createSalesCreditNoteFromInvoice({ parentSalesInvoiceId: another.invoice.id, lines: [{ description: "Credit", quantity: "1", unitPrice: "20", taxRate: "0" }] }, ctx);
    await issueSalesCreditNote(nc.id, ctx); const ncEntry = await journal("SALES_CREDIT_NOTE", nc.id, p.id);
    await failJournalAudit(() => cancelSalesCreditNote(nc.id, ctx, p.id, "Synthetic correction"));
    assert.equal((await prisma.salesInvoice.findUniqueOrThrow({ where: { id: nc.id } })).status, "ISSUED");
    assert.equal((await prisma.receivable.findUniqueOrThrow({ where: { id: another.receivable.id } })).creditedAmount.toFixed(2), "20.00");
    assert.equal((await prisma.journalEntry.findUniqueOrThrow({ where: { id: ncEntry.id } })).status, "DRAFT");
    await cancelSalesCreditNote(nc.id, ctx, p.id, "Synthetic correction");
    assert.equal((await prisma.journalEntry.findUniqueOrThrow({ where: { id: ncEntry.id } })).status, "CANCELLED");
    const nd = await createSalesDebitNoteFromInvoice({ parentSalesInvoiceId: another.invoice.id }, ctx);
    await issueSalesDebitNote(nd.id, ctx); const ndEntry = await journal("SALES_DEBIT_NOTE", nd.id, p.id, "100");
    await failJournalAudit(() => cancelSalesInvoice(nd.id, ctx, p.id, "Synthetic correction"));
    assert.equal((await prisma.salesInvoice.findUniqueOrThrow({ where: { id: nd.id } })).status, "ISSUED");
    assert.equal((await prisma.journalEntry.findUniqueOrThrow({ where: { id: ndEntry.id } })).status, "DRAFT");
    await cancelSalesInvoice(nd.id, ctx, p.id, "Synthetic correction");
    assert.equal((await prisma.journalEntry.findUniqueOrThrow({ where: { id: ndEntry.id } })).status, "CANCELLED");
  });
  it("rejects cash cancellation if a journal is posted after the outside preflight", async () => {
    const p = await project(), { receivable } = await issued(p.id), bank = await account();
    const c = await collect(receivable.id, bank.id, "20"), entry = await journal("COLLECTION", c.id, p.id);
    await prisma.tenantModuleSetting.update({ where: { tenantId_moduleKey: { tenantId, moduleKey: "ACCOUNTING" } }, data: { isEnabled: true } });
    try {
      await assert.rejects(() => afterPreflight(() => cancelCollection(c.id, ctx, p.id, "Synthetic correction"), () => postJournalEntry(entry.id, ctx)), conflict);
      assert.equal((await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id } })).status, "POSTED");
      assert.equal((await prisma.collection.findUniqueOrThrow({ where: { id: c.id } })).status, "CONFIRMED");
      assert.equal((await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } })).paidAmount.toFixed(2), "20.00");
    } finally { await prisma.tenantModuleSetting.update({ where: { tenantId_moduleKey: { tenantId, moduleKey: "ACCOUNTING" } }, data: { isEnabled: false } }); }
  });
  it("requires nonnegative IVA and perception on direct inputs and every persisted draft kind", async () => {
    const p = await project(), { invoice: parent } = await issued(p.id);
    await assert.rejects(() => createSalesInvoice({ projectId: p.id, clientContactId: clientId, issueDate: date, dueDate: date, currency: "ARS", invoiceLetter: "C", iibbPerceptionRate: "-1", externalInvoiceRef: null, lines: [{ description: "Invalid", quantity: "1", unitPrice: "10", taxRate: "0", discountPct: "0", sortOrder: 0 }] }, ctx), invalid);
    for (const kind of ["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"] as const) {
      const inv = kind === "INVOICE" ? await draft(p.id) : kind === "CREDIT_NOTE"
        ? await createSalesCreditNoteFromInvoice({ parentSalesInvoiceId: parent.id, lines: [{ description: "Credit", quantity: "1", unitPrice: "10", taxRate: "0" }] }, ctx)
        : await createSalesDebitNoteFromInvoice({ parentSalesInvoiceId: parent.id }, ctx);
      const line = inv.lines[0]!;
      await prisma.salesInvoiceLine.update({ where: { id: line.id }, data: { taxRate: "-5", lineTax: "-0.50" } });
      const issue = () => kind === "INVOICE" ? issueSalesInvoice(inv.id, ctx) : kind === "CREDIT_NOTE" ? issueSalesCreditNote(inv.id, ctx) : issueSalesDebitNote(inv.id, ctx);
      await assert.rejects(issue, invalid);
      assert.equal((await prisma.salesInvoice.findUniqueOrThrow({ where: { id: inv.id } })).status, "DRAFT");
      await updateSalesInvoice(inv.id, { invoiceLetter: "C", iibbPerceptionRate: "0" }, ctx);
      await issue();
      assert.equal((await prisma.salesInvoice.findUniqueOrThrow({ where: { id: inv.id } })).status, "ISSUED");
    }
  });
  it("keeps an issued historical negative perception readable while refusing a new inherited debit", async () => {
    const p = await project(), { invoice, receivable } = await issued(p.id);
    await prisma.salesInvoice.update({ where: { id: invoice.id }, data: { iibbPerceptionRate: "-1", iibbPerceptionAmount: "-1", totalAmount: "99" } });
    await prisma.receivable.update({ where: { id: receivable.id }, data: { originalAmount: "99" } });
    try {
      const before = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
      const read = await getSalesInvoiceById(invoice.id, ctx);
      assert.equal(read.iibbPerceptionRate, "-1.0000"); assert.equal(read.totalAmount, "99.00");
      await assert.rejects(() => createSalesDebitNoteFromInvoice({ parentSalesInvoiceId: invoice.id }, ctx), invalid);
      const after = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
      assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime());
      assert.equal(after.iibbPerceptionRate.toString(), "-1");
    } finally {
      await prisma.salesInvoice.update({ where: { id: invoice.id }, data: { iibbPerceptionRate: "0", iibbPerceptionAmount: "0", totalAmount: "100" } });
      await prisma.receivable.update({ where: { id: receivable.id }, data: { originalAmount: "100" } });
    }
  });
  it("D133 rejects stored negative header amounts before recalculation and requires explicit correction for INVOICE NC ND", async () => {
    for (const kind of ["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"] as const) {
      const p = await project(), { invoice: parent, receivable: parentDebt } = await issued(p.id);
      const inv = kind === "INVOICE" ? await draft(p.id) : kind === "CREDIT_NOTE"
        ? await createSalesCreditNoteFromInvoice({ parentSalesInvoiceId: parent.id, lines: [{ description: "Credit", quantity: "1", unitPrice: "10", taxRate: "0" }] }, ctx)
        : await createSalesDebitNoteFromInvoice({ parentSalesInvoiceId: parent.id }, ctx);
      const issue = () => kind === "INVOICE" ? issueSalesInvoice(inv.id, ctx) : kind === "CREDIT_NOTE" ? issueSalesCreditNote(inv.id, ctx) : issueSalesDebitNote(inv.id, ctx);
      for (const field of ["taxAmount", "iibbPerceptionAmount"] as const) {
        await prisma.salesInvoice.update({ where: { id: inv.id }, data: { [field]: "-1" } });
        const before = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: inv.id } });
        const debtBefore = await prisma.receivable.findUniqueOrThrow({ where: { id: parentDebt.id } });
        const auditBefore = await prisma.auditLog.count({ where: { tenantId, entityId: inv.id } });
        assert.equal(before.iibbPerceptionRate.toString(), "0");
        assert.ok((await prisma.salesInvoiceLine.findMany({ where: { invoiceId: inv.id } })).every((line) => line.taxRate.eq(0) && line.lineTax.eq(0)));
        await assert.rejects(issue, invalid);
        const after = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: inv.id } });
        assert.equal(after.status, "DRAFT"); assert.equal(after[field].toString(), "-1");
        assert.equal(after.totalAmount.toString(), before.totalAmount.toString());
        assert.equal(after.taxAmount.toString(), before.taxAmount.toString());
        assert.equal(after.iibbPerceptionAmount.toString(), before.iibbPerceptionAmount.toString());
        assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime());
        assert.equal(await prisma.auditLog.count({ where: { tenantId, entityId: inv.id } }), auditBefore);
        assert.equal(await prisma.receivable.count({ where: { salesInvoiceId: inv.id } }), 0);
        const debtAfter = await prisma.receivable.findUniqueOrThrow({ where: { id: parentDebt.id } });
        assert.equal(debtAfter.creditedAmount.toString(), debtBefore.creditedAmount.toString());
        assert.equal(debtAfter.paidAmount.toString(), debtBefore.paidAmount.toString());
        assert.equal(debtAfter.status, debtBefore.status);
        assert.equal(debtAfter.updatedAt.getTime(), debtBefore.updatedAt.getTime());
        await updateSalesInvoice(inv.id, { invoiceLetter: "C", iibbPerceptionRate: "0" }, ctx);
      }
      await issue();
      assert.equal((await prisma.salesInvoice.findUniqueOrThrow({ where: { id: inv.id } })).status, "ISSUED");
    }
  });
});
