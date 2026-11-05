import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma, type AccountMovement } from "@bloqer/database";
import { createSalesInvoiceSchema, createSalesNoteSchema, createCollectionSchema, registerArAdvanceSchema, updateSalesInvoiceSchema } from "@bloqer/validators";
import { aggregateCompanyReceivableBalances } from "./company-ar-snapshot";
import { arCancellationReason, assertArInvoiceParents, assertArReceivableParents, assertArCollectionParents, assertArDateRange, parseArInput, stripArParents, assertArTransactionModules, collectionMovementForCancellation } from "./ar-integrity";
import { ServiceError, type ServiceContext } from "../types";

const ctx: ServiceContext = { tenantId: "tenant", companyId: "company", actorUserId: "actor", roles: ["OWNER"] };
const root = () => ({ tenantId: "tenant", companyId: "company", projectId: "project", clientContactId: "client", company: { id: "company", tenantId: "tenant" }, clientContact: { id: "client", tenantId: "tenant" }, project: { id: "project", tenantId: "tenant", companyId: null } });
const invoice = () => ({ ...root(), id: "invoice", currency: "ARS", documentKind: "INVOICE", certificationId: null, certification: null, totalAmount: new Prisma.Decimal(100), status: "ISSUED" });
const receivable = () => ({ ...root(), id: "receivable", salesInvoiceId: "invoice", currency: "ARS", salesInvoice: invoice(), originalAmount: new Prisma.Decimal(100), paidAmount: new Prisma.Decimal(0), creditedAmount: new Prisma.Decimal(0), status: "OPEN" });
const collection = () => ({ ...root(), id: "collection", salesInvoiceId: "invoice", receivableId: "receivable", accountId: "account", currency: "ARS", salesInvoice: invoice(), receivable: receivable(), account: { id: "account", tenantId: "tenant", companyId: null, currency: "ARS" } });
const fails = (fn: () => unknown) => assert.throws(fn, (e) => e instanceof ServiceError);

describe("AG09 AR financial graph and inputs", () => {
  it("retains own/shared project and tenant-wide account access", () => {
    assertArInvoiceParents(invoice(), ctx);
    assertArReceivableParents(receivable(), ctx);
    assertArCollectionParents(collection(), ctx);
  });
  it("does not let a shared project widen financial company ownership", () => {
    fails(() => assertArInvoiceParents({ ...invoice(), companyId: "other" }, ctx));
    assertArInvoiceParents(invoice(), { ...ctx, companyId: null });
  });
  it("rejects foreign company, client and project parents", () => {
    for (const key of ["company", "clientContact", "project"] as const) {
      const row = invoice();
      row[key].tenantId = "foreign";
      fails(() => assertArInvoiceParents(row, ctx));
    }
  });
  it("rejects a receivable whose invoice differs in client or currency", () => {
    const row = receivable(); row.salesInvoice.currency = "USD";
    fails(() => assertArReceivableParents(row, ctx));
    row.salesInvoice.currency = "ARS"; row.salesInvoice.clientContactId = "other";
    fails(() => assertArReceivableParents(row, ctx));
  });
  it("rejects foreign or incompatible account and detached collection obligation", () => {
    const row = collection(); row.account.tenantId = "foreign";
    fails(() => assertArCollectionParents(row, ctx));
    row.account.tenantId = "tenant"; row.account.currency = "USD";
    fails(() => assertArCollectionParents(row, ctx));
    row.account.currency = "ARS"; row.receivableId = "other";
    fails(() => assertArCollectionParents(row, ctx));
  });
  it("requires an audited reason only after document issue / cash confirmation", () => {
    assert.equal(arCancellationReason("DRAFT"), null);
    assert.equal(arCancellationReason("ISSUED", " motivo "), "motivo");
    fails(() => arCancellationReason("ISSUED", " "));
    fails(() => arCancellationReason("CONFIRMED"));
  });
  it("counts a partial non-cash credit in corporate open and overdue balances", () => {
    const result = aggregateCompanyReceivableBalances([{ currency: "ARS", dueDate: new Date("2020-01-01"), originalAmount: new Prisma.Decimal(100), paidAmount: new Prisma.Decimal(20), creditedAmount: new Prisma.Decimal(30), status: "PARTIAL" }]);
    assert.equal(result.totalByCurrency[0]?.amount, "50.00");
    assert.equal(result.overdueByCurrency[0]?.amount, "50.00");
  });
  it("rejects impossible calendar dates at every AR boundary", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const line = { description: "Servicio", quantity: "1", unitPrice: "10" };
    assert.equal(createSalesInvoiceSchema.safeParse({ clientContactId: id, projectId: id, issueDate: "2026-02-30", dueDate: "2026-03-01", lines: [line] }).success, false);
    assert.equal(updateSalesInvoiceSchema.safeParse({ dueDate: "2026-04-31" }).success, false);
    assert.equal(createSalesNoteSchema.safeParse({ parentSalesInvoiceId: id, issueDate: "2026-02-29" }).success, false);
    assert.equal(createCollectionSchema.safeParse({ receivableId: id, accountId: id, collectionDate: "2026-02-30", collectFullBalance: true, idempotencyKey: id }).success, false);
    assert.equal(registerArAdvanceSchema.safeParse({ projectId: id, clientContactId: id, issueDate: "2026-02-30", amount: "1", idempotencyKey: id, collectNow: { accountId: id, collectionDate: "2026-03-01", idempotencyKey: id } }).success, false);
  });
  it("rejects reversed date ranges and direct negative fiscal-note inputs", () => {
    fails(() => assertArDateRange("2026-03-02", "2026-03-01"));
    assertArDateRange("2026-03-01", "2026-03-01");
    fails(() => parseArInput(createSalesNoteSchema, { parentSalesInvoiceId: "11111111-1111-4111-8111-111111111111", lines: [{ description: "Nota", quantity: "-1", unitPrice: "10" }] }));
  });
  it("keeps validated relation graphs outside the DTO", () => {
    const dto = stripArParents(collection());
    assert.equal("salesInvoice" in dto, false);
    assert.equal("account" in dto, false);
    assert.equal(dto.id, "collection");
  });
  it("checks Treasury in the actual transaction independently from AR", async () => {
    const tx = { tenantModuleSetting: { findMany: async () => [{ moduleKey: "TREASURY", isEnabled: false }] } } as unknown as Prisma.TransactionClient;
    await assertArTransactionModules(tx, ctx);
    await assert.rejects(() => assertArTransactionModules(tx, ctx, true), (e) => e instanceof ServiceError && e.code === "FORBIDDEN");
  });
  it("requires one exact cash leg and preserves reconciliation protection", () => {
    const date = new Date("2026-11-05");
    const c = { ...collection(), amount: new Prisma.Decimal(20), collectionDate: date };
    const movement = { id: "movement", tenantId: c.tenantId, companyId: c.companyId, projectId: c.projectId, accountId: c.accountId, currency: c.currency, amount: c.amount, movementDate: date, type: "INFLOW", sourceType: "COLLECTION", sourceId: c.id, status: "CONFIRMED" } as AccountMovement;
    assert.equal(collectionMovementForCancellation(c, [movement]), movement);
    fails(() => collectionMovementForCancellation(c, []));
    fails(() => collectionMovementForCancellation(c, [movement, { ...movement, id: "duplicate" }]));
    for (const [key, value] of Object.entries({ tenantId: "foreign", companyId: "foreign", projectId: "foreign", accountId: "foreign", currency: "USD", amount: new Prisma.Decimal(19), movementDate: new Date("2026-11-04"), type: "OUTFLOW", status: "CANCELLED", sourceId: "other", sourceType: "PAYMENT" })) {
      fails(() => collectionMovementForCancellation(c, [{ ...movement, [key]: value }]));
    }
    assert.throws(() => collectionMovementForCancellation(c, [{ ...movement, status: "RECONCILED" }]), /conciliado/);
  });
});
