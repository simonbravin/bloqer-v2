/** Maintained AG-06 SQL regressions for request/quote/award contracts and races. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { Prisma, prisma } from "@bloqer/database";
import type { CreatePurchaseRequestInput } from "@bloqer/validators";

import { clearProjectAccessModeCache } from "../security/access";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import {
  createProcurementQuote, listProcurementQuotesDetailedForRequest,
  listProcurementQuotesForRequest, updateProcurementQuote,
} from "./procurement-quote.service";
import {
  createPurchaseOrderFromQuoteLines, createPurchaseOrdersFromAwards,
  onPurchaseOrderCancelledLinkedToRequest, selectProcurementQuoteAndCreatePo,
} from "./purchase-request-to-po.service";
import {
  cancelPurchaseRequest, createPurchaseRequest, getPurchaseRequestById,
  getPurchaseRequestPoLinks, listPurchaseRequestsByProject,
  returnPurchaseRequest, submitPurchaseRequest, updatePurchaseRequest,
} from "./purchase-request.service";

const live = process.env.BLOQER_AUDIT_LIVE === "1";
const serviceError = (...codes: string[]) => (error: unknown) => error instanceof ServiceError && codes.includes(error.code);

describe("AG-06 request, quotation and award contracts on isolated SQL", { skip: !live, concurrency: false }, () => {
  const tenantId = randomUUID(), foreignTenantId = randomUUID();
  const companyId = randomUUID(), otherCompanyId = randomUUID(), foreignCompanyId = randomUUID();
  const actorUserId = randomUUID(), memberUserId = randomUUID();
  const contactId = randomUUID(), secondContactId = randomUUID(), foreignContactId = randomUUID();
  const otherProductId = randomUUID(), foreignProductId = randomUUID();
  const tenantIds = [tenantId, foreignTenantId];
  const ctx: ServiceContext = { tenantId, companyId, actorUserId, roles: ["OWNER"] };
  let verified = false;

  before(async () => {
    // Reject even an apparently local database until both connection URLs AND
    // current_database() have matched the maintained audit allowlist.
    await assertAuditDatabaseIdentity(prisma);
    verified = true;
    clearProjectAccessModeCache();
    await prisma.$transaction(async (tx) => {
      await tx.tenant.createMany({ data: tenantIds.map((id) => ({ id, name: "Synthetic AG06 requests", slug: `audit-ag06-requests-${id}`, projectAccessMode: "MEMBERSHIP_SCOPED" as const })) });
      await tx.company.createMany({ data: [
        { id: companyId, tenantId, name: "Synthetic AG06 request company" },
        { id: otherCompanyId, tenantId, name: "Synthetic AG06 other company" },
        { id: foreignCompanyId, tenantId: foreignTenantId, name: "Synthetic AG06 foreign company" },
      ] });
      await tx.user.createMany({ data: [actorUserId, memberUserId].map((id) => ({ id, email: `audit-ag06-requests-${id}@example.test`, status: "ACTIVE" as const })) });
      await tx.userMembership.createMany({ data: [
        { tenantId, companyId, userId: actorUserId, roles: ["OWNER"] },
        { tenantId, companyId, userId: memberUserId, roles: ["PROCUREMENT"] },
      ] });
      await tx.contact.createMany({ data: [
        { id: contactId, tenantId, legalName: "Synthetic AG06 supplier A" },
        { id: secondContactId, tenantId, legalName: "Synthetic AG06 supplier B" },
        { id: foreignContactId, tenantId: foreignTenantId, legalName: "Synthetic AG06 foreign supplier" },
      ] });
      await tx.contactRole.createMany({ data: [
        { tenantId, contactId, role: "CLIENT" }, { tenantId, contactId, role: "SUPPLIER" },
        { tenantId, contactId: secondContactId, role: "SUPPLIER" },
        { tenantId: foreignTenantId, contactId: foreignContactId, role: "CLIENT" },
        { tenantId: foreignTenantId, contactId: foreignContactId, role: "SUPPLIER" },
      ] });
      await tx.product.createMany({ data: [
        { id: otherProductId, tenantId, companyId: otherCompanyId, sku: "synthetic-other", name: "Synthetic other product" },
        { id: foreignProductId, tenantId: foreignTenantId, companyId: foreignCompanyId, sku: "synthetic-foreign", name: "Synthetic foreign product" },
      ] });
      await tx.companyProcurementSettings.createMany({ data: [companyId, otherCompanyId, foreignCompanyId].map((id) => ({ companyId: id, minQuotesRequired: 1, apPaymentNotificationChannel: "IN_APP" as const })) });
    }, { timeout: 30_000 });
  });

  after(async () => {
    clearProjectAccessModeCache();
    if (!verified) return;
    try {
      await prisma.$transaction(async (tx) => {
        const tenants = { in: tenantIds };
        await tx.emailDeliveryLog.deleteMany({ where: { tenantId: tenants } });
        await tx.notification.deleteMany({ where: { tenantId: tenants } });
        await tx.userNotificationEmailPreference.deleteMany({ where: { tenantId: tenants } });
        await tx.tenantNotificationEmailPolicy.deleteMany({ where: { tenantId: tenants } });
        await tx.purchaseRequestLine.updateMany({ where: { purchaseRequest: { tenantId: tenants } }, data: { awardedPurchaseOrderId: null } });
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { tenantId: tenants } } });
        await tx.purchaseOrder.deleteMany({ where: { tenantId: tenants } });
        await tx.procurementQuoteLine.deleteMany({ where: { procurementQuote: { tenantId: tenants } } });
        await tx.procurementQuote.deleteMany({ where: { tenantId: tenants } });
        await tx.purchaseRequestLine.deleteMany({ where: { purchaseRequest: { tenantId: tenants } } });
        await tx.purchaseRequest.deleteMany({ where: { tenantId: tenants } });
        await tx.auditLog.deleteMany({ where: { tenantId: tenants } });
        await tx.costAnalysisLine.deleteMany({ where: { budget: { tenantId: tenants } } });
        await tx.costItem.deleteMany({ where: { budget: { tenantId: tenants } } });
        await tx.wbsNode.deleteMany({ where: { budget: { tenantId: tenants } } });
        await tx.budget.deleteMany({ where: { tenantId: tenants } });
        await tx.projectMembership.deleteMany({ where: { tenantId: tenants } });
        await tx.project.deleteMany({ where: { tenantId: tenants } });
        await tx.product.deleteMany({ where: { tenantId: tenants } });
        await tx.contactRole.deleteMany({ where: { tenantId: tenants } });
        await tx.contact.deleteMany({ where: { tenantId: tenants } });
        await tx.companyProcurementSettings.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId, foreignCompanyId] } } });
        await tx.userMembership.deleteMany({ where: { tenantId: tenants } });
        await tx.tenantModuleSetting.deleteMany({ where: { tenantId: tenants } });
        await tx.company.deleteMany({ where: { tenantId: tenants } });
        await tx.tenant.deleteMany({ where: { id: tenants } });
        await tx.user.deleteMany({ where: { id: { in: [actorUserId, memberUserId] } } });
      }, { timeout: 60_000 });
    } finally { await prisma.$disconnect(); }
  });

  async function scope(options: { tenant?: string; company?: string | null; currency?: string; projectId?: string } = {}) {
    const ownerTenant = options.tenant ?? tenantId;
    const ownerCompany = options.company === undefined ? companyId : options.company;
    const projectId = options.projectId ?? randomUUID();
    const budgetId = randomUUID(), wbsNodeId = randomUUID(), costItemId = randomUUID();
    const apuId = randomUUID(), laborApuId = randomUUID();
    await prisma.$transaction(async (tx) => {
      if (!options.projectId) await tx.project.create({ data: {
        id: projectId, tenantId: ownerTenant, companyId: null,
        clientContactId: ownerTenant === tenantId ? contactId : foreignContactId,
        code: randomUUID(), name: "Synthetic AG06 request project", status: "ACTIVE", country: "AR",
      } });
      const latest = await tx.budget.aggregate({ where: { projectId }, _max: { versionNumber: true } });
      // The real partial unique allows one APPROVED principal per project;
      // additional fixture budgets are addenda attached to that principal.
      const principal = await tx.budget.findFirst({ where: { projectId, tenantId: ownerTenant, parentBudgetId: null }, select: { id: true } });
      await tx.budget.create({ data: { id: budgetId, tenantId: ownerTenant, companyId: ownerCompany, projectId, parentBudgetId: principal?.id ?? null, versionNumber: (latest._max.versionNumber ?? 0) + 1, name: "Synthetic AG06 request budget", currency: options.currency ?? "ARS", status: "APPROVED" } });
      await tx.wbsNode.create({ data: { id: wbsNodeId, budgetId, type: "ITEM", code: "1", name: "Synthetic AG06 request WBS" } });
      await tx.costItem.create({ data: { id: costItemId, budgetId, wbsNodeId, unit: "m2", quantity: "10", unitCostDirect: "40", totalCostDirect: "400" } });
      await tx.costAnalysisLine.createMany({ data: [
        { id: apuId, budgetId, costItemId, category: "MATERIAL", description: "Synthetic material APU", unit: "kg", coefficient: "2", unitCost: "10", totalCost: "20" },
        { id: laborApuId, budgetId, costItemId, category: "LABOR", description: "Synthetic labor APU", unit: "h", coefficient: "1", unitCost: "20", totalCost: "20" },
      ] });
    }, { timeout: 30_000 });
    return { projectId, budgetId, wbsNodeId, costItemId, apuId, laborApuId, companyId: ownerCompany, tenantId: ownerTenant };
  }
  type Scope = Awaited<ReturnType<typeof scope>>;
  const lineInput = (s: Scope, overrides: Partial<CreatePurchaseRequestInput["lines"][number]> = {}): CreatePurchaseRequestInput["lines"][number] => ({
    wbsNodeId: s.wbsNodeId, costAnalysisLineId: s.apuId,
    description: "Synthetic material request", unit: "kg", quantity: "2.5", lineType: "MATERIAL", sortOrder: 0, ...overrides,
  });
  async function request(s: Scope, options: { context?: ServiceContext; lines?: CreatePurchaseRequestInput["lines"]; submitted?: boolean } = {}) {
    const context = options.context ?? ctx;
    const created = await createPurchaseRequest({ projectId: s.projectId, neededByDate: "2026-11-04", notes: "Synthetic request notes", lines: options.lines ?? [lineInput(s)] }, context);
    if (options.submitted) await submitPurchaseRequest(created.id, context);
    return getPurchaseRequestById(created.id, context);
  }
  type Request = Awaited<ReturnType<typeof request>>;
  const quoteLines = (pr: Request, unitPrice = "12") => pr.lines.map((line, sortOrder) => ({ purchaseRequestLineId: line.id, unitPrice, taxRate: "0", discountPct: "0", offerKind: "QUOTED" as const, sortOrder }));
  async function quote(pr: Request, options: { supplier?: string; currency?: string; fxRate?: string; unitPrice?: string; context?: ServiceContext } = {}) {
    return createProcurementQuote({ purchaseRequestId: pr.id, supplierContactId: options.supplier ?? contactId, currency: options.currency ?? "ARS", fxRate: options.fxRate, iibbPerceptionRate: "0", validUntil: "2050-01-01", lines: quoteLines(pr, options.unitPrice) }, options.context ?? ctx);
  }

  /** Pause only the service's transaction ENTRY; all interleaved operations and
   * assertions still execute against PostgreSQL. No timing-dependent sleeps. */
  async function interleaveAfterPreview<T>(action: () => Promise<T>, interleaving: () => Promise<unknown>): Promise<T> {
    const original = prisma.$transaction;
    const transact = original.bind(prisma);
    let release!: () => void, reached!: () => void, intercepted = false;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const atTransaction = new Promise<void>((resolve) => { reached = resolve; });
    // Prisma exposes this method through a dynamic proxy descriptor; Node's
    // mock.method cannot replace it. Direct replacement is restored exactly.
    prisma.$transaction = (async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => {
      if (!intercepted) { intercepted = true; reached(); await gate; }
      return transact(work, options);
    }) as typeof prisma.$transaction;
    const pending = Promise.resolve().then(action);
    try {
      await Promise.race([atTransaction, pending.then(() => { throw new Error("Expected a service transaction boundary"); })]);
      await interleaving();
      release();
      return await pending;
    } finally { release(); prisma.$transaction = original; await pending.catch(() => undefined); }
  }

  it("creates on a shared project using the active company and excludes another company's requests", async () => {
    const a = await scope(), b = await scope({ projectId: a.projectId, company: otherCompanyId });
    const own = await request(a), other = await request(b, { context: { ...ctx, companyId: otherCompanyId } });
    assert.equal(own.companyId, companyId);
    const listed = await listPurchaseRequestsByProject(a.projectId, ctx);
    assert.deepEqual(listed.map((row) => row.id), [own.id]);
    await assert.rejects(() => getPurchaseRequestById(other.id, ctx), serviceError("FORBIDDEN"));
  });

  it("scopes every request mutation and child-link read to tenant, company and project membership", async () => {
    const s = await scope(), pr = await request(s);
    const foreignContext = { ...ctx, tenantId: foreignTenantId, companyId: foreignCompanyId };
    const otherCompanyContext = { ...ctx, companyId: otherCompanyId };
    const unassigned = { ...ctx, actorUserId: memberUserId, roles: ["PROCUREMENT" as const] };
    const operations = [
      (c: ServiceContext) => getPurchaseRequestById(pr.id, c),
      (c: ServiceContext) => getPurchaseRequestPoLinks(pr.id, c),
      (c: ServiceContext) => updatePurchaseRequest(pr.id, { notes: "Must not write" }, c),
      (c: ServiceContext) => submitPurchaseRequest(pr.id, c),
      (c: ServiceContext) => returnPurchaseRequest(pr.id, "Must not write", c),
      (c: ServiceContext) => cancelPurchaseRequest(pr.id, c),
    ];
    for (const run of operations) {
      await assert.rejects(() => run(foreignContext), serviceError("NOT_FOUND"));
      await assert.rejects(() => run(otherCompanyContext), serviceError("FORBIDDEN"));
      await assert.rejects(() => run(unassigned), serviceError("FORBIDDEN"));
    }
    assert.equal((await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: pr.id } })).status, "DRAFT");
  });

  it("enforces procurement gates and read-only roles before writing a request", async () => {
    const s = await scope(), input = { projectId: s.projectId, neededByDate: "2026-11-04", lines: [lineInput(s)] };
    await assert.rejects(() => createPurchaseRequest(input, { ...ctx, roles: ["VIEWER"] }), serviceError("FORBIDDEN"));
    await prisma.tenantModuleSetting.create({ data: { tenantId, moduleKey: "PROCUREMENT", isEnabled: false } });
    try { await assert.rejects(() => createPurchaseRequest(input, ctx), serviceError("FORBIDDEN")); }
    finally { await prisma.tenantModuleSetting.deleteMany({ where: { tenantId, moduleKey: "PROCUREMENT" } }); }
    assert.equal(await prisma.purchaseRequest.count({ where: { projectId: s.projectId } }), 0);
  });

  it("rejects cross-company WBS/APU/products and cross-tenant products without partial documents", async () => {
    const s = await scope(), other = await scope({ projectId: s.projectId, company: otherCompanyId });
    const badLines = [
      lineInput(other), lineInput(s, { costAnalysisLineId: other.apuId }),
      lineInput(s, { productId: otherProductId }), lineInput(s, { productId: foreignProductId }),
    ];
    for (const line of badLines) await assert.rejects(() => request(s, { lines: [line] }), serviceError("NOT_FOUND", "FORBIDDEN", "CONFLICT"));
    assert.equal(await prisma.purchaseRequest.count({ where: { projectId: s.projectId } }), 0);
  });

  it("serializes company-wide request numbers across different projects", async () => {
    const a = await scope(), b = await scope();
    const [left, right] = await Promise.all([request(a), request(b)]);
    assert.notEqual(left.number, right.number);
    assert.equal(Math.abs(left.number - right.number), 1);
  });

  it("snapshots the current locked lines when a draft edit wins after submit's preview", async () => {
    const s = await scope(), pr = await request(s);
    await interleaveAfterPreview(() => submitPurchaseRequest(pr.id, ctx), () => updatePurchaseRequest(pr.id, { lines: [lineInput(s, { quantity: "3.125" })] }, ctx));
    const saved = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: pr.id }, include: { lines: true } });
    assert.equal(saved.status, "SUBMITTED");
    assert.notEqual(saved.lines[0]!.id, pr.lines[0]!.id);
    assert.equal(saved.lines[0]!.quantity.toFixed(4), "3.1250");
    assert.equal(saved.lines[0]!.budgetUnitCostSnapshot?.toFixed(4), "10.0000");
    assert.equal(saved.lines[0]!.budgetQuantitySnapshot?.toFixed(4), "20.0000");
  });

  it("rechecks all quotation history when quote creation wins after return's preview", async () => {
    const s = await scope(), pr = await request(s, { submitted: true });
    await assert.rejects(() => interleaveAfterPreview(() => returnPurchaseRequest(pr.id, "Corregir materiales", ctx), () => quote(pr)), serviceError("CONFLICT"));
    const saved = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: pr.id }, include: { lines: true } });
    assert.equal(saved.status, "SUBMITTED"); assert.equal(saved.returnedAt, null);
    assert.equal(saved.lines[0]!.budgetUnitCostSnapshot?.toFixed(4), "10.0000");
  });

  it("rejects a stale quote payload when return, edit and resubmit replace its previewed lines", async () => {
    const s = await scope(), pr = await request(s, { submitted: true });
    await assert.rejects(() => interleaveAfterPreview(() => quote(pr), async () => {
      await returnPurchaseRequest(pr.id, "Revisar cantidades", ctx);
      await updatePurchaseRequest(pr.id, { lines: [lineInput(s, { quantity: "4" })] }, ctx);
      await submitPurchaseRequest(pr.id, ctx);
    }), serviceError("CONFLICT"));
    const saved = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: pr.id }, include: { lines: true } });
    assert.equal(saved.status, "SUBMITTED"); assert.equal(saved.lines[0]!.quantity.toFixed(4), "4.0000");
    assert.equal(await prisma.procurementQuote.count({ where: { purchaseRequestId: pr.id } }), 0);
  });

  it("rechecks linked active orders when an award wins after cancellation's preview", async () => {
    const s = await scope(), pr = await request(s, { submitted: true }), q = await quote(pr);
    await assert.rejects(() => interleaveAfterPreview(() => cancelPurchaseRequest(pr.id, ctx), () => selectProcurementQuoteAndCreatePo(q.id, ctx)), serviceError("CONFLICT"));
    assert.equal((await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: pr.id } })).status, "QUOTE_SELECTED");
    assert.equal(await prisma.purchaseOrder.count({ where: { purchaseRequestId: pr.id, status: "DRAFT" } }), 1);
  });

  it("rolls return and cancellation back atomically when their audit insertion fails", async () => {
    const s = await scope(), pr = await request(s, { submitted: true });
    const original = prisma.$transaction;
    const transact = original.bind(prisma);
    prisma.$transaction = (async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => transact(async (tx) => {
      const audit = new Proxy(tx.auditLog, { get(target, key) { return key === "create" ? async () => { throw new Error("synthetic request audit failure"); } : Reflect.get(target, key); } });
      return work(new Proxy(tx, { get(target, key) { return key === "auditLog" ? audit : Reflect.get(target, key); } }));
    }, options)) as typeof prisma.$transaction;
    try {
      await assert.rejects(() => returnPurchaseRequest(pr.id, "Volver a revisar", ctx), /synthetic request audit failure/);
      await assert.rejects(() => cancelPurchaseRequest(pr.id, ctx), /synthetic request audit failure/);
    } finally { prisma.$transaction = original; }
    const saved = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: pr.id }, include: { lines: true } });
    assert.equal(saved.status, "SUBMITTED"); assert.equal(saved.returnedAt, null);
    assert.equal(saved.lines[0]!.budgetUnitCostSnapshot?.toFixed(4), "10.0000");
    assert.equal(await prisma.auditLog.count({ where: { tenantId, entityId: pr.id, action: { in: ["purchase_request.returned_for_changes", "purchase_request.cancelled"] } } }), 0);
  });

  it("D126 blocks return for rejected and superseded histories without rewriting any offer", async () => {
    for (const status of ["REJECTED", "SUPERSEDED"] as const) {
      const s = await scope(), pr = await request(s, { submitted: true }), q = await quote(pr);
      await prisma.procurementQuote.update({ where: { id: q.id }, data: { status } });
      await assert.rejects(() => returnPurchaseRequest(pr.id, "Cambiar materiales", ctx), serviceError("CONFLICT"));
      assert.equal((await prisma.procurementQuote.findUniqueOrThrow({ where: { id: q.id } })).status, status);
      assert.equal((await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: pr.id } })).status, "SUBMITTED");
    }
  });

  it("D126 keeps historical draft line identities and permits only non-destructive header edits", async () => {
    const s = await scope(), pr = await request(s, { submitted: true }), q = await quote(pr);
    await prisma.procurementQuote.update({ where: { id: q.id }, data: { status: "REJECTED" } });
    // Reproduce a legacy DRAFT left by the old permissive return rule.
    await prisma.purchaseRequest.update({ where: { id: pr.id }, data: { status: "DRAFT", neededByDate: null } });
    await updatePurchaseRequest(pr.id, { notes: "Header correction" }, ctx);
    await updatePurchaseRequest(pr.id, { lines: [lineInput(s)] }, ctx);
    await assert.rejects(() => updatePurchaseRequest(pr.id, { notes: "Must roll back", lines: [lineInput(s, { quantity: "8" })] }, ctx), serviceError("CONFLICT"));
    const saved = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: pr.id }, include: { lines: true } });
    assert.equal(saved.neededByDate, null); assert.equal(saved.notes, "Header correction");
    assert.equal(saved.lines[0]!.id, pr.lines[0]!.id); assert.equal(saved.lines[0]!.quantity.toFixed(4), "2.5000");
    assert.equal(saved.lines[0]!.budgetUnitCostSnapshot?.toFixed(4), "10.0000");
    const history = await prisma.procurementQuoteLine.findFirstOrThrow({ where: { procurementQuoteId: q.id } });
    assert.equal(history.purchaseRequestLineId, pr.lines[0]!.id); assert.equal(history.lineTotal.toFixed(2), "30.00");
    await prisma.costAnalysisLine.update({ where: { id: s.apuId }, data: { unitCost: "99" } });
    await submitPurchaseRequest(pr.id, ctx);
    const resubmitted = await prisma.purchaseRequestLine.findUniqueOrThrow({ where: { id: pr.lines[0]!.id } });
    assert.equal(resubmitted.budgetUnitCostSnapshot?.toFixed(4), "10.0000");
    assert.equal(resubmitted.budgetQuantitySnapshot?.toFixed(4), "20.0000");
    assert.equal((await prisma.procurementQuote.findUniqueOrThrow({ where: { id: q.id } })).status, "REJECTED");
  });

  it("returns a request without quotes, edits and resubmits with fresh snapshots and audit", async () => {
    const s = await scope(), pr = await request(s, { submitted: true });
    await returnPurchaseRequest(pr.id, "Ajustar alcance", ctx);
    assert.equal((await prisma.purchaseRequestLine.findFirstOrThrow({ where: { purchaseRequestId: pr.id } })).budgetUnitCostSnapshot, null);
    await prisma.costAnalysisLine.update({ where: { id: s.apuId }, data: { unitCost: "11.25" } });
    await updatePurchaseRequest(pr.id, { lines: [lineInput(s, { quantity: "3" })] }, ctx);
    await submitPurchaseRequest(pr.id, ctx);
    const saved = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: pr.id }, include: { lines: true } });
    assert.equal(saved.status, "SUBMITTED"); assert.equal(saved.returnReason, null);
    assert.equal(saved.lines[0]!.budgetUnitCostSnapshot?.toFixed(4), "11.2500");
    assert.equal(await prisma.auditLog.count({ where: { tenantId, entityId: pr.id, action: "purchase_request.returned_for_changes" } }), 1);
  });

  it("uses native budget currency, withholds partial estimates and never exposes raw Prisma joins", async () => {
    const s = await scope({ currency: "USD" }), pr = await request(s);
    assert.equal(pr.estimatedAmount, "25.00"); assert.equal(pr.estimatedAmountCurrency, "USD");
    assert.equal(pr.lines[0]!.budgetCurrency, "USD");
    assert.ok(!Object.hasOwn(pr, "quotes")); assert.ok(!Object.hasOwn(pr, "purchaseOrders"));
    assert.equal(typeof pr.lines[0]!.quantity, "string");
    await updatePurchaseRequest(pr.id, { lines: [lineInput(s), lineInput(s, { description: "No APU source", costAnalysisLineId: null, sortOrder: 1 })] }, ctx);
    assert.equal((await getPurchaseRequestById(pr.id, ctx)).estimatedAmount, null);
    await updatePurchaseRequest(pr.id, { lines: [lineInput(s, { unit: "m3" })] }, ctx);
    assert.equal((await getPurchaseRequestById(pr.id, ctx)).estimatedAmount, null);
    const local = await scope({ projectId: s.projectId, currency: "ARS" });
    const mixed = await request(s, { submitted: true, lines: [lineInput(s), lineInput(local, { sortOrder: 1 })] });
    assert.equal(mixed.hasMultipleWbs, true); assert.equal(mixed.estimatedAmount, null);
    assert.deepEqual(mixed.lines.map((line) => line.budgetCurrency), ["USD", "ARS"]);
    await quote(mixed);
    const detailed = await listProcurementQuotesDetailedForRequest(mixed.id, ctx);
    assert.deepEqual(detailed[0]!.lines.map((line) => line.budgetCurrency), ["USD", "ARS"]);
  });

  it("does not replace a missing submitted snapshot with a later live APU cost", async () => {
    const s = await scope(), pr = await request(s, { submitted: true });
    await prisma.purchaseRequestLine.update({ where: { id: pr.lines[0]!.id }, data: { budgetUnitCostSnapshot: null } });
    await prisma.costAnalysisLine.update({ where: { id: s.apuId }, data: { unitCost: "99" } });
    assert.equal((await getPurchaseRequestById(pr.id, ctx)).estimatedAmount, null);
  });

  it("requires manual foreign FX, preserves omitted FX/currency on edit and serializes six decimal places", async () => {
    const s = await scope(), pr = await request(s, { submitted: true });
    await assert.rejects(() => quote(pr, { currency: "USD" }), serviceError("VALIDATION"));
    assert.equal(await prisma.procurementQuote.count({ where: { purchaseRequestId: pr.id } }), 0);
    const q = await quote(pr, { currency: "USD", fxRate: "1234.567891" });
    await updateProcurementQuote(q.id, pr.id, { lines: quoteLines(pr, "13") }, ctx);
    await assert.rejects(() => updateProcurementQuote(q.id, pr.id, { currency: "EUR", lines: quoteLines(pr) }, ctx), serviceError("VALIDATION"));
    const saved = await prisma.procurementQuote.findUniqueOrThrow({ where: { id: q.id } });
    assert.equal(saved.currency, "USD"); assert.equal(saved.fxRate.toFixed(6), "1234.567891");
    const brief = await listProcurementQuotesForRequest(pr.id, ctx), detailed = await listProcurementQuotesDetailedForRequest(pr.id, ctx);
    assert.equal(brief[0]!.fxRate, "1234.567891"); assert.equal(detailed[0]!.fxRate, "1234.567891");
    assert.equal(detailed[0]!.totalAmount, "32.50");
  });

  it("revalidates a supplier's active role before quote edits and awards", async () => {
    const s = await scope(), pr = await request(s, { submitted: true }), q = await quote(pr, { supplier: secondContactId });
    await prisma.contact.update({ where: { id: secondContactId }, data: { status: "ARCHIVED" } });
    try {
      await assert.rejects(() => updateProcurementQuote(q.id, pr.id, { lines: quoteLines(pr) }, ctx), serviceError("CONFLICT", "FORBIDDEN"));
      await assert.rejects(() => selectProcurementQuoteAndCreatePo(q.id, ctx), serviceError("CONFLICT", "FORBIDDEN"));
      assert.equal(await prisma.purchaseOrder.count({ where: { purchaseRequestId: pr.id } }), 0);
    } finally { await prisma.contact.update({ where: { id: secondContactId }, data: { status: "ACTIVE" } }); }
  });

  it("records partial multi-PO FX totals and preserves LABOR typification from an explicit legacy APU", async () => {
    const s = await scope({ currency: "USD" });
    const pr = await request(s, { submitted: true, lines: [lineInput(s), lineInput(s, { description: "Synthetic labor request", costAnalysisLineId: s.laborApuId, lineType: "SERVICE", unit: "h", quantity: "1.5", sortOrder: 1 })] });
    await prisma.purchaseRequestLine.update({ where: { id: pr.lines[1]!.id }, data: { costType: null } });
    const q = await quote(pr, { currency: "USD", fxRate: "1234.567891", unitPrice: "10" });
    const first = await createPurchaseOrderFromQuoteLines(q.id, [pr.lines[0]!.id], ctx);
    assert.equal((await getPurchaseRequestById(pr.id, ctx)).status, "SUBMITTED");
    const second = await createPurchaseOrderFromQuoteLines(q.id, [pr.lines[1]!.id], ctx);
    const orders = await prisma.purchaseOrder.findMany({ where: { id: { in: [first.purchaseOrderId, second.purchaseOrderId] } }, include: { lines: true }, orderBy: { number: "asc" } });
    assert.equal(orders[0]!.totalAmount.toFixed(2), "25.00"); assert.equal(orders[0]!.totalAmountArs.toFixed(2), "30864.20");
    assert.equal(orders[1]!.totalAmount.toFixed(2), "15.00"); assert.equal(orders[1]!.totalAmountArs.toFixed(2), "18518.52");
    assert.equal(orders[1]!.lines[0]!.costType, "LABOR");
    assert.equal((await getPurchaseRequestById(pr.id, ctx)).status, "QUOTE_SELECTED");
    const links = await getPurchaseRequestPoLinks(pr.id, ctx);
    assert.equal(links.activeOrders.length, 2); assert.equal(links.awardedLineCount, 2);
  });

  it("allocates distinct company-wide order numbers for concurrent awards in separate projects", async () => {
    const a = await scope(), b = await scope(), left = await request(a, { submitted: true }), right = await request(b, { submitted: true });
    const q1 = await quote(left), q2 = await quote(right);
    const results = await Promise.all([selectProcurementQuoteAndCreatePo(q1.id, ctx), selectProcurementQuoteAndCreatePo(q2.id, ctx)]);
    const saved = await prisma.purchaseOrder.findMany({ where: { id: { in: results.map((row) => row.purchaseOrderId) } } });
    assert.equal(new Set(saved.map((row) => row.number)).size, 2);
  });

  it("recovers canceled legacy award pointers before reaward and retains the historical canceled order", async () => {
    const s = await scope(), pr = await request(s, { submitted: true }), q = await quote(pr);
    const original = await selectProcurementQuoteAndCreatePo(q.id, ctx);
    // Reproduce a canceled legacy document whose old callback missed the cache/FK.
    await prisma.purchaseOrder.update({ where: { id: original.purchaseOrderId }, data: { status: "CANCELLED" } });
    const next = await selectProcurementQuoteAndCreatePo(q.id, ctx);
    assert.notEqual(next.purchaseOrderId, original.purchaseOrderId);
    const oldLine = await prisma.purchaseOrderLine.findFirstOrThrow({ where: { purchaseOrderId: original.purchaseOrderId } });
    assert.equal(oldLine.isActiveAward, false); assert.equal(oldLine.procurementQuoteLineId, null);
    assert.equal(oldLine.purchaseRequestLineId, pr.lines[0]!.id);
    assert.equal((await prisma.purchaseRequestLine.findUniqueOrThrow({ where: { id: pr.lines[0]!.id } })).awardedPurchaseOrderId, next.purchaseOrderId);
    assert.equal(await prisma.purchaseOrder.count({ where: { purchaseRequestId: pr.id } }), 2);
  });

  it("rejects malformed historical quote sources and foreign suppliers before exposing their joined data", async () => {
    const a = await scope(), b = await scope(), own = await request(a, { submitted: true }), other = await request(b, { submitted: true }), q = await quote(own);
    const ql = await prisma.procurementQuoteLine.findFirstOrThrow({ where: { procurementQuoteId: q.id } });
    await prisma.procurementQuoteLine.update({ where: { id: ql.id }, data: { purchaseRequestLineId: other.lines[0]!.id } });
    await assert.rejects(() => listProcurementQuotesDetailedForRequest(own.id, ctx), serviceError("CONFLICT"));
    await prisma.procurementQuoteLine.update({ where: { id: ql.id }, data: { purchaseRequestLineId: own.lines[0]!.id } });
    await prisma.procurementQuote.update({ where: { id: q.id }, data: { supplierContactId: foreignContactId } });
    await assert.rejects(() => listProcurementQuotesForRequest(own.id, ctx), serviceError("CONFLICT"));
    await assert.rejects(() => listProcurementQuotesDetailedForRequest(own.id, ctx), serviceError("CONFLICT"));
  });

  it("rejects a legacy foreign WBS/APU at read and award boundaries with no new order", async () => {
    const s = await scope(), foreign = await scope({ tenant: foreignTenantId, company: foreignCompanyId });
    const pr = await request(s, { submitted: true }), q = await quote(pr);
    await prisma.purchaseRequestLine.update({ where: { id: pr.lines[0]!.id }, data: { wbsNodeId: foreign.wbsNodeId, costAnalysisLineId: foreign.apuId } });
    await assert.rejects(() => getPurchaseRequestById(pr.id, ctx), serviceError("CONFLICT"));
    await assert.rejects(() => selectProcurementQuoteAndCreatePo(q.id, ctx), serviceError("CONFLICT", "NOT_FOUND", "FORBIDDEN"));
    assert.equal(await prisma.purchaseOrder.count({ where: { purchaseRequestId: pr.id } }), 0);
  });

  it("batch awards remain atomic when a later group is invalid", async () => {
    const s = await scope(), pr = await request(s, { submitted: true, lines: [lineInput(s), lineInput(s, { description: "Second request line", sortOrder: 1 })] });
    const q = await quote(pr);
    await assert.rejects(() => createPurchaseOrdersFromAwards(pr.id, [
      { procurementQuoteId: q.id, purchaseRequestLineIds: [pr.lines[0]!.id] },
      { procurementQuoteId: randomUUID(), purchaseRequestLineIds: [pr.lines[1]!.id] },
    ], ctx), serviceError("NOT_FOUND"));
    assert.equal(await prisma.purchaseOrder.count({ where: { purchaseRequestId: pr.id } }), 0);
    assert.equal(await prisma.purchaseRequestLine.count({ where: { purchaseRequestId: pr.id, awardedPurchaseOrderId: { not: null } } }), 0);
  });

  it("linked cancellation preserves terminal history and never clears another request's award cache", async () => {
    const s = await scope(), pr = await request(s, { submitted: true }), q = await quote(pr);
    const po = await selectProcurementQuoteAndCreatePo(q.id, ctx);
    const other = await request(s);
    await prisma.$transaction(async (tx) => {
      await tx.purchaseOrder.update({ where: { id: po.purchaseOrderId }, data: { status: "CANCELLED" } });
      await tx.purchaseRequest.update({ where: { id: pr.id }, data: { status: "CANCELLED" } });
      await tx.procurementQuote.update({ where: { id: q.id }, data: { status: "REJECTED" } });
      await tx.purchaseRequestLine.update({ where: { id: other.lines[0]!.id }, data: { awardedPurchaseOrderId: po.purchaseOrderId } });
      await onPurchaseOrderCancelledLinkedToRequest(po.purchaseOrderId, ctx, tx);
    }, { timeout: 30_000 });
    assert.equal((await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: pr.id } })).status, "CANCELLED");
    assert.equal((await prisma.procurementQuote.findUniqueOrThrow({ where: { id: q.id } })).status, "REJECTED");
    assert.equal((await prisma.purchaseRequestLine.findUniqueOrThrow({ where: { id: other.lines[0]!.id } })).awardedPurchaseOrderId, po.purchaseOrderId);
    await assert.rejects(() => getPurchaseRequestPoLinks(other.id, ctx), serviceError("CONFLICT"));
  });
});
