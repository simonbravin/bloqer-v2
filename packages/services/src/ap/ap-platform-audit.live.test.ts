/** Maintained AG-09 SQL regressions. Never writes before effective isolated-DB verification. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { prisma } from "@bloqer/database";
import { createSupplierInvoiceSchema, registerApExpenseSchema, createJournalEntrySchema } from "@bloqer/validators";
import { createJournalEntryAsAutomation, postJournalEntry } from "../accounting/journal-entry.service";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import { createSupplierInvoice, issueSupplierInvoice, updateSupplierInvoice, cancelSupplierInvoice, getCompanySupplierInvoiceById } from "./supplier-invoice.service";
import { createPayment, cancelPayment } from "./payment.service";
import { getCompanyPayableById } from "./payable.service";
import { registerApExpense } from "./register-ap-expense.service";
import { createSupplierCreditNoteFromInvoice, createSupplierDebitNoteFromInvoice, issueSupplierCreditNote, issueSupplierDebitNote, cancelSupplierCreditNote } from "./credit-debit-note.service";

const invalid = (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION";
const conflict = (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT";
const denied = (error: unknown) => error instanceof ServiceError && ["FORBIDDEN", "NOT_FOUND", "CONFLICT"].includes(error.code);

describe("AG-09 AP on isolated SQL", { skip: process.env.BLOQER_AUDIT_LIVE !== "1", concurrency: false }, () => {
  const tenantId = randomUUID(), foreignTenantId = randomUUID(), companyId = randomUUID(), secondCompanyId = randomUUID(), foreignCompanyId = randomUUID();
  const actorId = randomUUID(), supplierId = randomUUID(), foreignSupplierId = randomUUID();
  const usdAccountId = randomUUID(), arsAccountId = randomUUID(), projectId = randomUUID(), foreignProjectId = randomUUID();
  const budgetId = randomUUID(), foreignBudgetId = randomUUID(), wbsId = randomUUID(), foreignWbsId = randomUUID();
  const debitAccountId = randomUUID(), creditAccountId = randomUUID();
  const ctx: ServiceContext = { tenantId, companyId, actorUserId: actorId, roles: ["OWNER"] };
  const day = "2026-11-05";
  let verified = false;
  before(async () => {
    await assertAuditDatabaseIdentity(prisma); verified = true;
    await prisma.$transaction(async tx => {
      await tx.tenant.createMany({ data: [tenantId, foreignTenantId].map(id => ({ id, name: "Synthetic AG09 AP", slug: "audit-ap-" + id })) });
      await tx.company.createMany({ data: [
        { id: companyId, tenantId, name: "Synthetic AP A", ivaCondition: "RESPONSIBLE_INSCRIPTO" },
        { id: secondCompanyId, tenantId, name: "Synthetic AP B" },
        { id: foreignCompanyId, tenantId: foreignTenantId, name: "Synthetic foreign AP" },
      ] });
      await tx.user.create({ data: { id: actorId, email: "audit-ap-" + actorId + "@example.test" } });
      await tx.userMembership.create({ data: { tenantId, companyId, userId: actorId, roles: ["OWNER"] } });
      for (const [id, tenant] of [[supplierId, tenantId], [foreignSupplierId, foreignTenantId]]) {
        await tx.contact.create({ data: { id: id!, tenantId: tenant!, legalName: "Synthetic AP counterparty", country: "AR", ivaCondition: "RESPONSIBLE_INSCRIPTO",
          roles: { create: [{ tenantId: tenant!, role: "SUPPLIER" }, { tenantId: tenant!, role: "CLIENT" }] } } });
      }
      await tx.treasuryAccount.createMany({ data: [
        { id: usdAccountId, tenantId, companyId: null, name: "Synthetic AP USD", type: "BANK", currency: "USD", openingBalance: "100000" },
        { id: arsAccountId, tenantId, companyId: null, name: "Synthetic AP ARS", type: "CASH", currency: "ARS", openingBalance: "100000" },
      ] });
      for (const scope of [
        { tenantId, companyId, projectId, budgetId, contactId: supplierId, wbsId },
        { tenantId: foreignTenantId, companyId: foreignCompanyId, projectId: foreignProjectId, budgetId: foreignBudgetId, contactId: foreignSupplierId, wbsId: foreignWbsId },
      ]) {
        await tx.project.create({ data: { id: scope.projectId, tenantId: scope.tenantId, companyId: scope.companyId, clientContactId: scope.contactId, code: "AP-AUDIT", name: "Synthetic AP project", status: "ACTIVE" } });
        await tx.budget.create({ data: { id: scope.budgetId, tenantId: scope.tenantId, companyId: scope.companyId, projectId: scope.projectId, versionNumber: 1, name: "Synthetic AP budget", status: "APPROVED" } });
        await tx.wbsNode.create({ data: { id: scope.wbsId, budgetId: scope.budgetId, type: "ITEM", code: "1", name: "Synthetic AP cost" } });
      }
      await tx.companyProcurementSettings.create({ data: { companyId, apPaymentNotificationChannel: "IN_APP" } });
      await tx.accountingAccount.createMany({ data: [
        { id: debitAccountId, tenantId, companyId, code: "AP-TEST-DEBIT", name: "Synthetic AP GL debit", type: "ASSET" },
        { id: creditAccountId, tenantId, companyId, code: "AP-TEST-CREDIT", name: "Synthetic AP GL credit", type: "LIABILITY" },
      ] });
      for (const tenant of [tenantId, foreignTenantId]) await tx.tenantModuleSetting.create({ data: { tenantId: tenant, moduleKey: "ACCOUNTING", isEnabled: false } });
    }, { timeout: 30_000 });
  });
  after(async () => {
    if (!verified) return;
    const tenants = { in: [tenantId, foreignTenantId] };
    try {
      await prisma.$transaction(async tx => {
        await tx.notification.deleteMany({ where: { tenantId: tenants } });
        await tx.emailDeliveryLog.deleteMany({ where: { tenantId: tenants } });
        await tx.journalEntryLine.deleteMany({ where: { journalEntry: { tenantId: tenants } } });
        await tx.journalEntry.deleteMany({ where: { tenantId: tenants } });
        await tx.accountingAccount.deleteMany({ where: { tenantId: tenants } });
        await tx.accountMovement.deleteMany({ where: { tenantId: tenants } });
        await tx.payment.deleteMany({ where: { tenantId: tenants } });
        await tx.payableCreditApplication.deleteMany({ where: { tenantId: tenants } });
        await tx.payable.deleteMany({ where: { tenantId: tenants } });
        await tx.supplierInvoiceLine.deleteMany({ where: { invoice: { tenantId: tenants } } });
        await tx.supplierInvoice.deleteMany({ where: { tenantId: tenants } });
        await tx.treasuryAccount.deleteMany({ where: { tenantId: tenants } });
        await tx.wbsNode.deleteMany({ where: { budget: { tenantId: tenants } } });
        await tx.budget.deleteMany({ where: { tenantId: tenants } });
        await tx.project.deleteMany({ where: { tenantId: tenants } });
        await tx.auditLog.deleteMany({ where: { tenantId: tenants } });
        await tx.companyProcurementSettings.deleteMany({ where: { company: { tenantId: tenants } } });
        await tx.contactRole.deleteMany({ where: { tenantId: tenants } });
        await tx.contact.deleteMany({ where: { tenantId: tenants } });
        await tx.userMembership.deleteMany({ where: { tenantId: tenants } });
        await tx.tenantModuleSetting.deleteMany({ where: { tenantId: tenants } });
        await tx.company.deleteMany({ where: { tenantId: tenants } });
        await tx.tenant.deleteMany({ where: { id: tenants } });
        await tx.user.delete({ where: { id: actorId } });
      }, { timeout: 30_000 });
    } finally { await prisma.$disconnect(); }
  });
  async function issued(currency = "ARS", project = false, context = ctx) {
    const draft = await createSupplierInvoice(createSupplierInvoiceSchema.parse({ projectId: project ? projectId : null,
      supplierContactId: supplierId, issueDate: day, dueDate: "2026-12-05", currency, fxRate: currency === "USD" ? "1200" : undefined,
      invoiceLetter: "A", iibbPerceptionRate: "0", lines: [{ description: "Synthetic AP expense", quantity: "1", unitPrice: "100", taxRate: "0", wbsNodeId: project ? wbsId : null }] }), context);
    await issueSupplierInvoice(draft.id, context);
    const payable = await prisma.payable.findUniqueOrThrow({ where: { supplierInvoiceId: draft.id } });
    return { invoiceId: draft.id, payable };
  }
  const journalInput = (paymentId: string) => createJournalEntrySchema.parse({ entryDate: day, description: "Synthetic AP GL boundary", sourceType: "PAYMENT", sourceId: paymentId,
    lines: [{ accountId: debitAccountId, debit: "40", credit: "0", currency: "ARS" }, { accountId: creditAccountId, debit: "0", credit: "40", currency: "ARS" }] });
  async function paidWithJournal() {
    const s = await issued();
    const payment = await createPayment({ payableId: s.payable.id, accountId: arsAccountId, paymentDate: day,
      amount: "40", idempotencyKey: randomUUID(), reference: null }, ctx);
    const journal = await createJournalEntryAsAutomation(journalInput(payment.id), ctx, companyId);
    return { ...s, payment, journal };
  }
  const setAccounting = (isEnabled: boolean) => prisma.tenantModuleSetting.update({ where: { tenantId_moduleKey: { tenantId, moduleKey: "ACCOUNTING" } }, data: { isEnabled } });
  it("pays USD with the payment's manual FX, replays once, then reverses exactly once", async () => {
    const s = await issued("USD"), idempotencyKey = randomUUID();
    const input = { payableId: s.payable.id, accountId: usdAccountId, paymentDate: day, amount: "40", fxRate: "1250.123456", idempotencyKey, reference: null };
    const payment = await createPayment(input, ctx);
    assert.equal(payment.fxRate, "1250.123456"); assert.equal(payment.amountArs, "50004.94");
    assert.equal((await createPayment(input, ctx)).id, payment.id);
    await assert.rejects(() => createPayment({ ...input, fxRate: "1300" }, ctx), conflict);
    await assert.rejects(() => createPayment({ ...input, fxRate: undefined }, ctx), conflict);
    assert.equal(await prisma.accountMovement.count({ where: { sourceType: "PAYMENT", sourceId: payment.id } }), 1);
    await cancelPayment(payment.id, ctx, undefined, "Synthetic reversal");
    await cancelPayment(payment.id, ctx, undefined, "Synthetic retry");
    const payable = await prisma.payable.findUniqueOrThrow({ where: { id: s.payable.id } });
    assert.equal(payable.paidAmount.toFixed(2), "0.00");
    assert.equal(await prisma.auditLog.count({ where: { entityId: payment.id, action: "payment.cancelled" } }), 1);
  });
  it("missing FX is a rollback and cannot create cash or change balance", async () => {
    const s = await issued("USD");
    await assert.rejects(() => createPayment({ payableId: s.payable.id, accountId: usdAccountId, paymentDate: day, amount: "40", idempotencyKey: randomUUID(), reference: null }, ctx), invalid);
    assert.equal(await prisma.payment.count({ where: { payableId: s.payable.id } }), 0);
    assert.equal((await prisma.payable.findUniqueOrThrow({ where: { id: s.payable.id } })).paidAmount.toFixed(2), "0.00");
  });
  it("partial cash plus full remaining NC keeps cash and credit separate through reads and reversal", async () => {
    const s = await issued();
    await createPayment({ payableId: s.payable.id, accountId: arsAccountId, paymentDate: day, amount: "40", idempotencyKey: randomUUID(), reference: null }, ctx);
    const note = await createSupplierCreditNoteFromInvoice({ parentSupplierInvoiceId: s.invoiceId }, ctx);
    await issueSupplierCreditNote(note.id, ctx);
    await prisma.payable.update({ where: { id: s.payable.id }, data: { status: "OPEN" } });
    const read = await getCompanyPayableById(s.payable.id, ctx);
    assert.equal(read.paidAmount, "40.00"); assert.equal(read.creditedAmount, "60.00"); assert.equal(read.balanceDue, "0.00");
    await cancelSupplierCreditNote(note.id, ctx, undefined, "Synthetic credit reversal");
    const restored = await getCompanyPayableById(s.payable.id, ctx);
    assert.equal(restored.paidAmount, "40.00"); assert.equal(restored.balanceDue, "60.00");
  });
  it("notes round each line and simultaneous corporate creators get separate numbers", async () => {
    const s = await issued();
    const notes = await Promise.all([0, 1, 2].map(() => createSupplierDebitNoteFromInvoice({ parentSupplierInvoiceId: s.invoiceId,
      lines: [0, 1].map(sortOrder => ({ description: "Synthetic tiny line", quantity: "1", unitPrice: "0.05", taxRate: "10", sortOrder })) }, ctx)));
    assert.equal(new Set(notes.map(n => n.number)).size, 3);
    for (const note of notes) { assert.equal(note.totalAmount, "0.12"); assert.equal(note.lines[0]!.lineTax, "0.01"); }
  });
  it("foreign WBS cannot enter a note or be emitted from a malformed historical draft", async () => {
    const s = await issued("ARS", true);
    await assert.rejects(() => createSupplierCreditNoteFromInvoice({ parentSupplierInvoiceId: s.invoiceId,
      lines: [{ description: "Synthetic invalid relation", quantity: "1", unitPrice: "10", wbsNodeId: foreignWbsId }] }, ctx), denied);
    const note = await createSupplierCreditNoteFromInvoice({ parentSupplierInvoiceId: s.invoiceId }, ctx);
    await prisma.supplierInvoiceLine.update({ where: { id: note.lines[0]!.id }, data: { wbsNodeId: foreignWbsId } });
    await assert.rejects(() => issueSupplierCreditNote(note.id, ctx), denied);
    assert.equal(await prisma.payableCreditApplication.count({ where: { creditNoteSupplierInvoiceId: note.id } }), 0);
  });
  it("parent cancellation racing credit issue never leaves an issued note on a cancelled parent", async () => {
    const s = await issued(); const note = await createSupplierCreditNoteFromInvoice({ parentSupplierInvoiceId: s.invoiceId }, ctx);
    const results = await Promise.allSettled([issueSupplierCreditNote(note.id, ctx), cancelSupplierInvoice(s.invoiceId, ctx, undefined, "Synthetic race")]);
    assert.ok(results.some(result => result.status === "fulfilled"));
    for (const result of results) if (result.status === "rejected") assert.ok(conflict(result.reason));
    const [parent, credit] = await Promise.all([prisma.supplierInvoice.findUniqueOrThrow({ where: { id: s.invoiceId } }), prisma.supplierInvoice.findUniqueOrThrow({ where: { id: note.id } })]);
    assert.ok(parent.status !== "CANCELLED" || credit.status !== "ISSUED");
  });
  it("corporate credit issue racing cancellation keeps credit application and document consistent", async () => {
    const s = await issued(); const note = await createSupplierCreditNoteFromInvoice({ parentSupplierInvoiceId: s.invoiceId }, ctx);
    const results = await Promise.allSettled([issueSupplierCreditNote(note.id, ctx), cancelSupplierCreditNote(note.id, ctx, undefined, "Synthetic race")]);
    assert.ok(results.some(result => result.status === "fulfilled"));
    for (const result of results) if (result.status === "rejected") assert.ok(conflict(result.reason));
    const row = await prisma.supplierInvoice.findUniqueOrThrow({ where: { id: note.id }, include: { creditApplicationAsNote: true } });
    assert.equal(row.creditApplicationAsNote?.status === "CONFIRMED", row.status === "ISSUED");
  });
  it("cross-company replay and forged contact parents are rejected", async () => {
    const input = registerApExpenseSchema.parse({ supplierContactId: supplierId, issueDate: day, dueDate: "2026-12-05", currency: "ARS", invoiceLetter: "A", iibbPerceptionRate: "0",
      lines: [{ description: "Synthetic composite", quantity: "1", unitPrice: "10" }], idempotencyKey: randomUUID() });
    const result = await registerApExpense(input, ctx);
    await assert.rejects(() => registerApExpense(input, { ...ctx, companyId: secondCompanyId }), conflict);
    const invoiceId = result.traceChain.find(link => link.entityType === "SupplierInvoice")!.entityId;
    await prisma.supplierInvoice.update({ where: { id: invoiceId }, data: { supplierContactId: foreignSupplierId } });
    await assert.rejects(() => getCompanySupplierInvoiceById(invoiceId, ctx), conflict);
    const payable = await prisma.payable.findUniqueOrThrow({ where: { supplierInvoiceId: invoiceId } });
    await assert.rejects(() => createPayment({ payableId: payable.id, accountId: arsAccountId, paymentDate: day,
      amount: "10", idempotencyKey: randomUUID(), reference: null }, ctx), conflict);
    assert.equal(await prisma.payment.count({ where: { payableId: payable.id } }), 0);
  });
  it("direct spend threshold includes the final IIBB perception", async () => {
    await prisma.companyProcurementSettings.update({ where: { companyId }, data: { purchaseRequestRequiredAboveArs: "1000" } });
    const input = registerApExpenseSchema.parse({ projectId, supplierContactId: supplierId, issueDate: day, dueDate: "2026-12-05", currency: "ARS", invoiceLetter: "A", iibbPerceptionRate: "3",
      lines: [{ description: "Synthetic threshold", quantity: "1", unitPrice: "980", taxRate: "0", wbsNodeId: wbsId }], idempotencyKey: randomUUID() });
    try {
      await assert.rejects(() => registerApExpense(input, { ...ctx, roles: ["PROCUREMENT"] }), conflict);
      assert.equal(await prisma.supplierInvoice.count({ where: { tenantId, idempotencyKey: input.idempotencyKey } }), 0);
      const lower = { ...input, idempotencyKey: randomUUID(), lines: input.lines.map(line => ({ ...line, unitPrice: "970" })) };
      await registerApExpense(lower, { ...ctx, roles: ["PROCUREMENT"] });
    } finally {
      await prisma.companyProcurementSettings.update({ where: { companyId }, data: { purchaseRequestRequiredAboveArs: null } });
    }
  });
  it("a composite retry cannot change invoice FX, IIBB or payment FX", async () => {
    const input = registerApExpenseSchema.parse({ supplierContactId: supplierId, issueDate: day, dueDate: "2026-12-05", currency: "USD", fxRate: "1200", invoiceLetter: "A", iibbPerceptionRate: "0",
      lines: [{ description: "Synthetic FX replay", quantity: "1", unitPrice: "10" }], idempotencyKey: randomUUID(),
      payNow: { accountId: usdAccountId, paymentDate: day, fxRate: "1250", payFullBalance: true, idempotencyKey: randomUUID() } });
    const created = await registerApExpense(input, ctx);
    assert.equal((await registerApExpense(input, ctx)).primaryEntityId, created.primaryEntityId);
    for (const changed of [
      { ...input, fxRate: "1201" }, { ...input, iibbPerceptionRate: "3" },
      { ...input, payNow: { ...input.payNow!, fxRate: "1300" } },
    ]) await assert.rejects(() => registerApExpense(changed, ctx), conflict);
    await assert.rejects(() => registerApExpense({ ...input, payNow: { ...input.payNow!, reference: "Changed retry" } }, ctx), conflict);
    await assert.rejects(() => registerApExpense({ ...input, payNow: { ...input.payNow!, notes: "Changed retry" } }, ctx), conflict);
    await assert.rejects(() => registerApExpense({ ...input, payNow: { ...input.payNow!, idempotencyKey: randomUUID() } }, ctx), conflict);
    assert.equal(await prisma.payment.count({ where: { tenantId, idempotencyKey: input.payNow!.idempotencyKey } }), 1);
  });
  it("different companies cannot concurrently overdraw the same shared account", async () => {
    const other = { ...ctx, companyId: secondCompanyId };
    const [a, b] = await Promise.all([issued(), issued("ARS", false, other)]);
    const account = await prisma.treasuryAccount.create({ data: { tenantId, companyId: null, name: "Synthetic constrained shared cash", type: "CASH", currency: "ARS", openingBalance: "150" } });
    const results = await Promise.allSettled([a, b].map((s, index) => createPayment({ payableId: s.payable.id,
      accountId: account.id, paymentDate: day, payFullBalance: true, idempotencyKey: randomUUID(), reference: null }, index === 0 ? ctx : other)));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    for (const result of results) if (result.status === "rejected") assert.ok(conflict(result.reason));
    const movements = await prisma.accountMovement.findMany({ where: { accountId: account.id, status: "CONFIRMED" } });
    assert.equal(movements.length, 1); assert.equal(movements[0]!.amount.toFixed(2), "100.00");
  });
  it("a GL audit failure rolls back payment, cash, debt, GL and their cancellation audits together", async () => {
    const s = await paidWithJournal();
    const originalTransaction = prisma.$transaction.bind(prisma);
    const fail = new Error("Synthetic GL audit failure");
    prisma.$transaction = (async (run: unknown, options: unknown) => originalTransaction(async tx => {
      const wrapped = new Proxy(tx, { get(target, property) {
        if (property !== "auditLog") return Reflect.get(target, property);
        return new Proxy(target.auditLog, { get(model, method) {
          if (method !== "create") return Reflect.get(model, method);
          return async (args: { data: { action: string } }) => {
            if (args.data.action === "journal_entry.cancelled") throw fail;
            return model.create(args as Parameters<typeof model.create>[0]);
          };
        } });
      } });
      return (run as (db: typeof tx) => unknown)(wrapped);
    }, options as Parameters<typeof originalTransaction>[1])) as typeof prisma.$transaction;
    try { await assert.rejects(() => cancelPayment(s.payment.id, ctx, undefined, "Synthetic rollback"), error => error === fail); }
    finally { prisma.$transaction = originalTransaction; }
    const [payment, debt, journal, movement] = await Promise.all([
      prisma.payment.findUniqueOrThrow({ where: { id: s.payment.id } }), prisma.payable.findUniqueOrThrow({ where: { id: s.payable.id } }),
      prisma.journalEntry.findUniqueOrThrow({ where: { id: s.journal.id } }), prisma.accountMovement.findFirstOrThrow({ where: { sourceType: "PAYMENT", sourceId: s.payment.id } }),
    ]);
    assert.equal(payment.status, "CONFIRMED"); assert.equal(debt.paidAmount.toFixed(2), "40.00"); assert.equal(journal.status, "DRAFT"); assert.equal(movement.status, "CONFIRMED");
    assert.equal(await prisma.auditLog.count({ where: { entityId: { in: [s.payment.id, s.journal.id] }, action: { in: ["payment.cancelled", "journal_entry.cancelled"] } } }), 0);
  });
  it("posting racing payment cancellation leaves either active cash plus POSTED, or cancelled cash plus CANCELLED GL", async () => {
    const s = await paidWithJournal(); await setAccounting(true);
    try {
      await Promise.allSettled([postJournalEntry(s.journal.id, ctx), cancelPayment(s.payment.id, ctx, undefined, "Synthetic GL race")]);
      const [payment, journal] = await Promise.all([prisma.payment.findUniqueOrThrow({ where: { id: s.payment.id } }), prisma.journalEntry.findUniqueOrThrow({ where: { id: s.journal.id } })]);
      assert.ok((payment.status === "CONFIRMED" && journal.status === "POSTED") || (payment.status === "CANCELLED" && journal.status === "CANCELLED"));
    } finally { await setAccounting(false); }
  });
  it("late automation cannot create a postable journal after payment cancellation", async () => {
    const s = await issued();
    const payment = await createPayment({ payableId: s.payable.id, accountId: arsAccountId, paymentDate: day, amount: "40", idempotencyKey: randomUUID(), reference: null }, ctx);
    await cancelPayment(payment.id, ctx, undefined, "Synthetic late automation");
    await assert.rejects(() => createJournalEntryAsAutomation(journalInput(payment.id), ctx, companyId), conflict);
    assert.equal(await prisma.journalEntry.count({ where: { tenantId, sourceType: "PAYMENT", sourceId: payment.id } }), 0);
    const legacy = await prisma.journalEntry.create({ data: { tenantId, companyId, entryDate: new Date(day), status: "DRAFT", sourceType: "PAYMENT", sourceId: payment.id,
      description: "Synthetic legacy late draft", createdByUserId: actorId, updatedByUserId: actorId,
      lines: { create: [{ accountId: debitAccountId, debit: "40", credit: "0", currency: "ARS" }, { accountId: creditAccountId, debit: "0", credit: "40", currency: "ARS" }] } } });
    await setAccounting(true);
    try { await assert.rejects(() => postJournalEntry(legacy.id, ctx), conflict); }
    finally { await setAccounting(false); }
    assert.equal((await prisma.journalEntry.findUniqueOrThrow({ where: { id: legacy.id } })).status, "DRAFT");
  });
  it("new negative taxes are rejected and a historical negative draft cannot issue new debt", async () => {
    const raw = { supplierContactId: supplierId, issueDate: day, dueDate: "2026-12-05", currency: "ARS", invoiceLetter: "A", iibbPerceptionRate: "0",
      lines: [{ description: "Synthetic negative tax", quantity: "1", unitPrice: "100", taxRate: "-1" }] };
    assert.equal(createSupplierInvoiceSchema.safeParse(raw).success, false);
    assert.equal(createSupplierInvoiceSchema.safeParse({ ...raw, iibbPerceptionRate: "-1", lines: [{ ...raw.lines[0]!, taxRate: "0" }] }).success, false);
    const draft = await createSupplierInvoice(createSupplierInvoiceSchema.parse({ ...raw, lines: [{ ...raw.lines[0]!, taxRate: "0" }] }), ctx);
    await prisma.supplierInvoiceLine.update({ where: { id: draft.lines[0]!.id }, data: { taxRate: "-1", lineTax: "-1", lineTotal: "99" } });
    await assert.rejects(() => issueSupplierInvoice(draft.id, ctx), invalid);
    assert.equal(await prisma.payable.count({ where: { supplierInvoiceId: draft.id } }), 0);
    assert.equal((await prisma.supplierInvoiceLine.findUniqueOrThrow({ where: { id: draft.lines[0]!.id } })).taxRate.toString(), "-1");
  });
  it("a corrupted historical WBS link blocks payment before cash or debt changes", async () => {
    const s = await issued("ARS", true);
    const line = await prisma.supplierInvoiceLine.findFirstOrThrow({ where: { invoiceId: s.invoiceId } });
    await prisma.supplierInvoiceLine.update({ where: { id: line.id }, data: { wbsNodeId: foreignWbsId } });
    await assert.rejects(() => createPayment({ payableId: s.payable.id, accountId: arsAccountId, paymentDate: day,
      amount: "10", idempotencyKey: randomUUID(), reference: null }, ctx), conflict);
    assert.equal(await prisma.payment.count({ where: { payableId: s.payable.id } }), 0);
    assert.equal((await prisma.payable.findUniqueOrThrow({ where: { id: s.payable.id } })).paidAmount.toFixed(2), "0.00");
    await prisma.supplierInvoiceLine.update({ where: { id: line.id }, data: { wbsNodeId: wbsId } });
  });
  it("D133 rejects stored negative header amounts before recalculation and requires explicit correction for INVOICE NC ND", async () => {
    for (const kind of ["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"] as const) {
      const parent = await issued();
      const inv = kind === "INVOICE"
        ? await createSupplierInvoice(createSupplierInvoiceSchema.parse({ supplierContactId: supplierId, issueDate: day, dueDate: "2026-12-05", currency: "ARS", invoiceLetter: "A", iibbPerceptionRate: "0", lines: [{ description: "Header-only tax regression", quantity: "1", unitPrice: "100", taxRate: "0" }] }), ctx)
        : kind === "CREDIT_NOTE" ? await createSupplierCreditNoteFromInvoice({ parentSupplierInvoiceId: parent.invoiceId }, ctx)
        : await createSupplierDebitNoteFromInvoice({ parentSupplierInvoiceId: parent.invoiceId }, ctx);
      const issue = () => kind === "INVOICE" ? issueSupplierInvoice(inv.id, ctx) : kind === "CREDIT_NOTE" ? issueSupplierCreditNote(inv.id, ctx) : issueSupplierDebitNote(inv.id, ctx);
      for (const field of ["taxAmount", "iibbPerceptionAmount"] as const) {
        await prisma.supplierInvoice.update({ where: { id: inv.id }, data: { [field]: "-1" } });
        const before = await prisma.supplierInvoice.findUniqueOrThrow({ where: { id: inv.id } });
        const debtBefore = await prisma.payable.findUniqueOrThrow({ where: { id: parent.payable.id } });
        const auditBefore = await prisma.auditLog.count({ where: { tenantId, entityId: inv.id } });
        assert.equal(before.iibbPerceptionRate.toString(), "0");
        assert.ok((await prisma.supplierInvoiceLine.findMany({ where: { invoiceId: inv.id } })).every((line) => line.taxRate.eq(0) && line.lineTax.eq(0)));
        await assert.rejects(issue, invalid);
        const after = await prisma.supplierInvoice.findUniqueOrThrow({ where: { id: inv.id } });
        assert.equal(after.status, "DRAFT"); assert.equal(after[field].toString(), "-1");
        assert.equal(after.totalAmount.toString(), before.totalAmount.toString());
        assert.equal(after.taxAmount.toString(), before.taxAmount.toString());
        assert.equal(after.iibbPerceptionAmount.toString(), before.iibbPerceptionAmount.toString());
        assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime());
        assert.equal(await prisma.auditLog.count({ where: { tenantId, entityId: inv.id } }), auditBefore);
        assert.equal(await prisma.payable.count({ where: { supplierInvoiceId: inv.id } }), 0);
        const debtAfter = await prisma.payable.findUniqueOrThrow({ where: { id: parent.payable.id } });
        assert.equal(debtAfter.creditedAmount.toString(), debtBefore.creditedAmount.toString());
        assert.equal(debtAfter.paidAmount.toString(), debtBefore.paidAmount.toString());
        assert.equal(debtAfter.status, debtBefore.status);
        assert.equal(debtAfter.updatedAt.getTime(), debtBefore.updatedAt.getTime());
        await updateSupplierInvoice(inv.id, { iibbPerceptionRate: "0" }, ctx);
      }
      await issue();
      assert.equal((await prisma.supplierInvoice.findUniqueOrThrow({ where: { id: inv.id } })).status, "ISSUED");
    }
  });
});
