/** Maintained SQL regression for AG-05 operational material/resource reads. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { prisma, type Prisma } from "@bloqer/database";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import { getProjectResourceBoard, getResourceApuCommitmentsForWbs } from "../resources/project-resource-board.service";
import { getResourceVarianceReport } from "../resources/resource-variance.service";
import { getProjectMaterialsBoard } from "./project-materials-board.service";
import { loadMaterialApuCommitments } from "./material-commitment";

const live = process.env.BLOQER_AUDIT_LIVE === "1";
const unavailable = (error: unknown) => error instanceof ServiceError && ["FORBIDDEN", "NOT_FOUND"].includes(error.code);

describe("AG-05 planning boards: isolated SQL scope, coverage and date-only values", { skip: !live, concurrency: false }, () => {
  const tenantId = randomUUID(), companyId = randomUUID(), companyB = randomUUID();
  const ownerId = randomUUID(), viewerId = randomUUID(), restrictedId = randomUUID(), contactId = randomUUID();
  const projectId = randomUUID(), otherProjectId = randomUUID(), unassignedProjectId = randomUUID();
  const budgetId = randomUUID(), foreignBudgetId = randomUUID(), wbsId = randomUUID(), undatedWbsId = randomUUID();
  const costId = randomUUID(), undatedCostId = randomUUID(), productId = randomUUID();
  const materialId = randomUUID(), bagId = randomUUID(), laborId = randomUUID(), secondLaborId = randomUUID(), equipmentId = randomUUID();
  const requestId = randomUUID(), requestLineId = randomUUID(), orderId = randomUUID(), invoiceId = randomUUID();
  const creditNoteId = randomUUID(), debitNoteId = randomUUID();
  const ctx: ServiceContext = { tenantId, companyId, actorUserId: ownerId, roles: ["OWNER"] };
  const viewer: ServiceContext = { tenantId, companyId, actorUserId: viewerId, roles: ["VIEWER"] };
  const restricted: ServiceContext = { tenantId, companyId, actorUserId: restrictedId, roles: ["PROJECT_VIEWER"] };
  const day = new Date("2026-11-04T00:00:00.000Z");
  let verified = false;
  let nextInvoiceNumber = 1;

  before(async () => {
    await assertAuditDatabaseIdentity(prisma); verified = true; clearProjectAccessModeCache();
    await prisma.$transaction(async (tx) => {
      await tx.tenant.create({ data: { id: tenantId, name: "Synthetic AG05 boards", slug: `audit-boards-${tenantId}`, projectAccessMode: "MEMBERSHIP_SCOPED" } });
      await tx.company.createMany({ data: [companyId, companyB].map((id) => ({ id, tenantId, name: "Synthetic board company" })) });
      await tx.user.createMany({ data: [ownerId, viewerId, restrictedId].map((id) => ({ id, email: `audit-boards-${id}@example.test`, status: "ACTIVE" })) });
      await tx.userMembership.createMany({ data: [
        { tenantId, companyId, userId: ownerId, roles: ["OWNER"] },
        { tenantId, companyId, userId: viewerId, roles: ["VIEWER"] },
        { tenantId, companyId, userId: restrictedId, roles: ["PROJECT_VIEWER"] },
      ] });
      await tx.contact.create({ data: { id: contactId, tenantId, legalName: "Synthetic board counterparty" } });
      await tx.contactRole.createMany({ data: ["CLIENT", "SUPPLIER"].map((role) => ({ tenantId, contactId, role: role as "CLIENT" | "SUPPLIER" })) });
      await tx.project.createMany({ data: [
        { id: projectId, tenantId, companyId: null, clientContactId: contactId, name: "Shared synthetic project", code: randomUUID(), country: "AR", status: "ACTIVE" },
        { id: otherProjectId, tenantId, companyId: companyB, clientContactId: contactId, name: "Other company project", code: randomUUID(), country: "AR", status: "ACTIVE" },
        { id: unassignedProjectId, tenantId, companyId, clientContactId: contactId, name: "Unassigned synthetic project", code: randomUUID(), country: "AR", status: "ACTIVE" },
      ] });
      await tx.projectMembership.createMany({ data: [viewerId, restrictedId].map((userId) => ({ tenantId, projectId, userId })) });
      await tx.budget.create({ data: { id: budgetId, tenantId, companyId, projectId, name: "Synthetic board principal", versionNumber: 1, status: "APPROVED" } });
      await tx.budget.create({ data: { id: foreignBudgetId, tenantId, companyId: companyB, projectId, parentBudgetId: budgetId, name: "Hidden company addendum", versionNumber: 2, status: "APPROVED" } });
      await tx.wbsNode.createMany({ data: [
        { id: wbsId, budgetId, code: "1", name: "Synthetic measured item", type: "ITEM" },
        { id: undatedWbsId, budgetId, code: "2", name: "Synthetic undated item", type: "ITEM" },
      ] });
      await tx.costItem.createMany({ data: [
        { id: costId, budgetId, wbsNodeId: wbsId, quantity: 1, unit: "m2", unitCostDirect: 470, totalCostDirect: 470 },
        { id: undatedCostId, budgetId, wbsNodeId: undatedWbsId, quantity: 1, unit: "un" },
      ] });
      await tx.product.create({ data: { id: productId, tenantId, companyId, sku: "SYNTH-BOARD", name: "Synthetic material", unit: "kg" } });
      const apu = (id: string, category: "MATERIAL" | "LABOR" | "EQUIPMENT", description: string, unit: string, qty: number) => ({ id, budgetId, costItemId: costId, category, description, unit, coefficient: qty, partidaQuantity: qty, unitCost: 10, totalCost: qty * 10, isLumpSum: false });
      await tx.costAnalysisLine.createMany({ data: [
        { ...apu(materialId, "MATERIAL", "Synthetic cement", "kg", 10), productId },
        { ...apu(bagId, "MATERIAL", "Synthetic cement", "bolsa", 2), productId },
        apu(laborId, "LABOR", "Synthetic labor A", "h", 10),
        apu(secondLaborId, "LABOR", "Synthetic labor B", "h", 20),
        apu(equipmentId, "EQUIPMENT", "Synthetic equipment", "h", 5),
        { ...apu(randomUUID(), "MATERIAL", "Synthetic no date", "un", 3), costItemId: undatedCostId, productId: null },
      ] });
      const schedule = await tx.schedule.create({ data: { tenantId, projectId, baselineBudgetId: budgetId } });
      const dated = await tx.scheduleItem.create({ data: { tenantId, scheduleId: schedule.id, name: "Dated synthetic task", type: "TASK", startDate: day, endDate: new Date("2026-11-09T00:00:00.000Z") } });
      const undated = await tx.scheduleItem.create({ data: { tenantId, scheduleId: schedule.id, name: "Undated synthetic task", type: "TASK" } });
      await tx.scheduleItemWbsLink.createMany({ data: [{ tenantId, scheduleItemId: dated.id, wbsNodeId: wbsId, isPrimary: true }, { tenantId, scheduleItemId: undated.id, wbsNodeId: undatedWbsId, isPrimary: true }] });
      await tx.purchaseRequest.create({ data: { id: requestId, tenantId, companyId, projectId, number: 1, status: "SUBMITTED" } });
      await tx.purchaseOrder.create({ data: { id: orderId, tenantId, companyId, projectId, supplierContactId: contactId, purchaseRequestId: requestId, number: 1, issueDate: day, status: "DRAFT" } });
      await tx.purchaseRequestLine.createMany({ data: [
        { id: requestLineId, purchaseRequestId: requestId, wbsNodeId: wbsId, costAnalysisLineId: laborId, costType: "LABOR", lineType: "SERVICE", description: "Synthetic labor A", unit: "h", quantity: 4, awardedPurchaseOrderId: orderId },
        { purchaseRequestId: requestId, wbsNodeId: wbsId, costAnalysisLineId: secondLaborId, costType: "LABOR", lineType: "SERVICE", description: "Synthetic labor B", unit: "h", quantity: 7 },
        { purchaseRequestId: requestId, wbsNodeId: wbsId, costAnalysisLineId: materialId, productId, costType: "MATERIAL", description: "Synthetic cement", unit: "kg", quantity: 3 },
      ] });
      await tx.purchaseOrderLine.create({ data: { purchaseOrderId: orderId, purchaseRequestLineId: requestLineId, wbsNodeId: wbsId, costAnalysisLineId: laborId, costType: "LABOR", description: "Synthetic labor A", unit: "h", quantity: 4, unitPrice: 10, lineSubtotal: 40, lineTotal: 40 } });
      for (const otherCompany of [companyB]) {
        const otherRequest = await tx.purchaseRequest.create({ data: { tenantId, companyId: otherCompany, projectId, number: 1, status: "SUBMITTED" } });
        await tx.purchaseRequestLine.createMany({ data: [
          { purchaseRequestId: otherRequest.id, wbsNodeId: wbsId, costAnalysisLineId: materialId, productId, costType: "MATERIAL", description: "Hidden material request", unit: "kg", quantity: 99 },
          { purchaseRequestId: otherRequest.id, wbsNodeId: wbsId, costAnalysisLineId: laborId, costType: "LABOR", description: "Hidden labor request", unit: "h", quantity: 99 },
        ] });
      }
      await createInvoice(tx, invoiceId, companyId, "INVOICE", 10, 100);
      await createInvoice(tx, creditNoteId, companyId, "CREDIT_NOTE", 2, 20);
      await createInvoice(tx, debitNoteId, companyId, "DEBIT_NOTE", 1, 10);
      await createInvoice(tx, randomUUID(), companyB, "INVOICE", 99, 990);
    }, { timeout: 30_000 });
  });

  async function createInvoice(
    tx: Prisma.TransactionClient,
    id: string,
    invoiceCompany: string,
    kind: "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE",
    qty: number | string,
    amount: number,
    line: { costAnalysisLineId?: string | null; purchaseOrderLineId?: string | null; costType?: "LABOR" | "EQUIPMENT" | null; description?: string; referencedInvoiceId?: string } = {},
  ) {
    await tx.supplierInvoice.create({ data: { id, tenantId, companyId: invoiceCompany, projectId, supplierContactId: contactId, number: nextInvoiceNumber++, documentKind: kind, referencedSupplierInvoiceId: kind === "INVOICE" ? null : (line.referencedInvoiceId ?? invoiceId), status: "ISSUED", issueDate: day, dueDate: day, subtotal: amount, totalAmount: amount, amountArs: amount, lines: { create: {
      wbsNodeId: wbsId,
      costAnalysisLineId: line.costAnalysisLineId === undefined ? laborId : line.costAnalysisLineId,
      purchaseOrderLineId: line.purchaseOrderLineId,
      costType: line.costType === undefined ? "LABOR" : line.costType,
      description: line.description ?? "Synthetic labor invoice",
      quantity: qty, unitPrice: 10, lineSubtotal: amount, lineTotal: amount,
    } } } });
  }

  async function removeInvoices(ids: string[]) {
    await prisma.supplierInvoiceLine.deleteMany({ where: { invoiceId: { in: ids }, invoice: { tenantId } } });
    await prisma.supplierInvoice.deleteMany({ where: { id: { in: ids }, tenantId, documentKind: { not: "INVOICE" } } });
    await prisma.supplierInvoice.deleteMany({ where: { id: { in: ids }, tenantId } });
  }

  after(async () => {
    clearProjectAccessModeCache(); if (!verified) return;
    await prisma.$transaction(async (tx) => {
      await tx.supplierInvoiceLine.deleteMany({ where: { invoice: { tenantId } } });
      await tx.supplierInvoice.deleteMany({ where: { tenantId, documentKind: { not: "INVOICE" } } });
      await tx.supplierInvoice.deleteMany({ where: { tenantId } });
      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { tenantId } } });
      await tx.purchaseRequestLine.deleteMany({ where: { purchaseRequest: { tenantId } } });
      await tx.purchaseOrder.deleteMany({ where: { tenantId } });
      await tx.purchaseRequest.deleteMany({ where: { tenantId } });
      await tx.scheduleItemWbsLink.deleteMany({ where: { scheduleItem: { tenantId } } });
      await tx.scheduleItem.deleteMany({ where: { tenantId } });
      await tx.schedule.deleteMany({ where: { tenantId } });
      await tx.costAnalysisLine.deleteMany({ where: { budget: { tenantId } } });
      await tx.costItem.deleteMany({ where: { budget: { tenantId } } });
      await tx.wbsNode.deleteMany({ where: { budget: { tenantId } } });
      await tx.budget.deleteMany({ where: { tenantId, parentBudgetId: { not: null } } });
      await tx.budget.deleteMany({ where: { tenantId } });
      await tx.projectMembership.deleteMany({ where: { tenantId } });
      await tx.project.deleteMany({ where: { tenantId } });
      await tx.product.deleteMany({ where: { tenantId } });
      await tx.contactRole.deleteMany({ where: { tenantId } });
      await tx.contact.deleteMany({ where: { tenantId } });
      await tx.userMembership.deleteMany({ where: { tenantId } });
      await tx.tenantModuleSetting.deleteMany({ where: { tenantId } });
      await tx.company.deleteMany({ where: { tenantId } });
      await tx.tenant.deleteMany({ where: { id: tenantId } });
      await tx.user.deleteMany({ where: { id: { in: [ownerId, viewerId, restrictedId] } } });
    }, { timeout: 30_000 });
    await prisma.$disconnect();
  });

  it("rejects unassigned and other-company projects before material/resource data", async () => {
    for (const read of [
      () => getProjectMaterialsBoard(unassignedProjectId, {}, viewer),
      () => getProjectResourceBoard(unassignedProjectId, "LABOR", {}, viewer),
      () => loadMaterialApuCommitments(unassignedProjectId, viewer),
      () => getProjectMaterialsBoard(otherProjectId, {}, ctx),
      () => getProjectResourceBoard(otherProjectId, "EQUIPMENT", {}, ctx),
    ]) await assert.rejects(read, unavailable);
  });

  it("does not expose another company's budget under the shared project", async () => {
    const materials = await getProjectMaterialsBoard(projectId, { budgetId: foreignBudgetId }, ctx);
    const resources = await getProjectResourceBoard(projectId, "LABOR", { budgetId: foreignBudgetId }, ctx);
    assert.equal(materials.type, "NO_APPROVED_BUDGETS");
    assert.equal(resources.type, "NO_APPROVED_BUDGETS");
    assert.deepEqual(await loadMaterialApuCommitments(projectId, ctx, { budgetId: foreignBudgetId }), []);
  });

  it("keeps different material units separate and excludes another company's requests", async () => {
    const board = await getProjectMaterialsBoard(projectId, { window: "all" }, ctx);
    assert.equal(board.type, "REPORT"); if (board.type !== "REPORT") return;
    const kg = board.rows.find((r) => r.costAnalysisLineId === materialId)!;
    const bag = board.rows.find((r) => r.costAnalysisLineId === bagId)!;
    assert.equal(kg.needQty, "10.0000"); assert.equal(kg.orderedQty, "3.0000"); assert.equal(kg.shortfallQty, "7.0000"); assert.equal(kg.unit, "kg");
    assert.equal(bag.needQty, "2.0000"); assert.equal(bag.orderedQty, "0.0000"); assert.equal(bag.unit, "bolsa"); assert.notEqual(kg.rowKey, bag.rowKey);
    const commitments = await loadMaterialApuCommitments(projectId, ctx);
    assert.equal(commitments.find((row) => row.costAnalysisLineId === materialId)?.orderedQty, "3.0000");
  });

  it("preserves SQL DATE labels and flags a linked task without dates as unscheduled", async () => {
    const materials = await getProjectMaterialsBoard(projectId, { window: "all" }, ctx);
    const resources = await getProjectResourceBoard(projectId, "LABOR", { window: "all" }, ctx);
    assert.equal(materials.type, "REPORT"); assert.equal(resources.type, "REPORT"); if (materials.type !== "REPORT" || resources.type !== "REPORT") return;
    for (const row of [...materials.rows, ...resources.rows].filter((r) => r.wbsNodeId === wbsId)) {
      assert.equal(row.requiredStart, "2026-11-04"); assert.equal(row.requiredEnd, "2026-11-09"); assert.equal(row.unscheduled, false);
    }
    const undated = materials.rows.find((r) => r.wbsNodeId === undatedWbsId)!;
    assert.equal(undated.unscheduled, true); assert.equal(undated.requiredStart, null);
  });

  it("counts active draft awards once and retains the other unawarded request lines", async () => {
    const check = async () => {
      const board = await getProjectResourceBoard(projectId, "LABOR", { window: "all" }, ctx);
      assert.equal(board.type, "REPORT"); if (board.type !== "REPORT") return;
      assert.equal(board.rows.find((r) => r.costAnalysisLineId === laborId)?.orderedQty, "4.0000");
      assert.equal(board.rows.find((r) => r.costAnalysisLineId === secondLaborId)?.orderedQty, "7.0000");
    };
    await check();
    try { await prisma.purchaseOrder.update({ where: { id: orderId }, data: { status: "CONFIRMED" } }); await check(); }
    finally { await prisma.purchaseOrder.update({ where: { id: orderId }, data: { status: "DRAFT" } }); }
  });

  it("nets invoice, credit and debit quantities by explicit resource without another company's invoice", async () => {
    const board = await getProjectResourceBoard(projectId, "LABOR", { window: "all" }, ctx);
    assert.equal(board.type, "REPORT"); if (board.type !== "REPORT") return;
    const labor = board.rows.find((row) => row.costAnalysisLineId === laborId)!;
    assert.equal(labor.invoicedQty, "9.0000");
    assert.equal(labor.shortfallQty, "1.0000");
    assert.equal(labor.unit, "h");
    assert.equal(board.totals.invoicedQty, "9.0000");
    const commitments = await getResourceApuCommitmentsForWbs(projectId, wbsId, "LABOR", ctx);
    assert.equal(commitments.find((row) => row.costAnalysisLineId === laborId)?.invoicedQty, "9.0000");
    assert.equal(commitments.find((row) => row.costAnalysisLineId === laborId)?.shortfallQty, "1.0000");
  });

  it("preserves a negative net fiscal quantity at four decimals while ordered quantity covers the need", async () => {
    try {
      await prisma.supplierInvoiceLine.updateMany({ where: { invoiceId: creditNoteId }, data: { quantity: "20.1234" } });
      const board = await getProjectResourceBoard(projectId, "LABOR", { window: "all" }, ctx);
      assert.equal(board.type, "REPORT"); if (board.type !== "REPORT") return;
      const labor = board.rows.find((row) => row.costAnalysisLineId === laborId)!;
      assert.equal(labor.invoicedQty, "-9.1234");
      assert.equal(labor.orderedQty, "4.0000");
      assert.equal(labor.shortfallQty, "6.0000");
      assert.equal(labor.overCommitted, false);
    } finally { await prisma.supplierInvoiceLine.updateMany({ where: { invoiceId: creditNoteId }, data: { quantity: 2 } }); }
  });

  it("nets a note through an explicit compatible PO APU reference", async () => {
    const poLine = await prisma.purchaseOrderLine.findFirstOrThrow({ where: { purchaseOrderId: orderId }, select: { id: true } });
    try {
      await prisma.supplierInvoiceLine.updateMany({ where: { invoiceId: creditNoteId }, data: { costAnalysisLineId: null, purchaseOrderLineId: poLine.id } });
      const board = await getProjectResourceBoard(projectId, "LABOR", { window: "all" }, ctx);
      assert.equal(board.type, "REPORT"); if (board.type !== "REPORT") return;
      assert.equal(board.rows.find((row) => row.costAnalysisLineId === laborId)?.invoicedQty, "9.0000");
      assert.equal(board.rows.find((row) => row.costAnalysisLineId === laborId)?.shortfallQty, "1.0000");
      assert.ok(board.rows.every((row) => row.costAnalysisLineId != null));
    } finally { await prisma.supplierInvoiceLine.updateMany({ where: { invoiceId: creditNoteId }, data: { costAnalysisLineId: laborId, purchaseOrderLineId: null } }); }
  });

  it("keeps generic notes separate even when their description exactly matches the resource", async () => {
    const creditId = randomUUID(), debitId = randomUUID();
    try {
      await prisma.$transaction(async (tx) => {
        await createInvoice(tx, creditId, companyId, "CREDIT_NOTE", 6, 60, { costAnalysisLineId: null, description: "Synthetic labor A" });
        await createInvoice(tx, debitId, companyId, "DEBIT_NOTE", 1, 10, { costAnalysisLineId: null, description: "Synthetic labor A" });
      });
      const board = await getProjectResourceBoard(projectId, "LABOR", { window: "all" }, ctx);
      assert.equal(board.type, "REPORT"); if (board.type !== "REPORT") return;
      assert.equal(board.rows.find((row) => row.costAnalysisLineId === laborId)?.invoicedQty, "9.0000");
      const unlinked = board.rows.find((row) => row.costAnalysisLineId === null && row.description === "Synthetic labor A")!;
      assert.equal(unlinked.invoicedQty, "-5.0000");
      assert.equal(unlinked.needQty, "0.0000");
      assert.equal(unlinked.relatedSupplierInvoiceId, null);
      assert.ok(board.warnings.some((warning) => warning.includes("no cubren la necesidad APU")));
    } finally { await removeInvoices([creditId, debitId]); }
  });

  it("keeps incompatible invoice and note units separate from APU coverage and from each other", async () => {
    const mismatchPoIds = [randomUUID(), randomUUID()], noteIds = [randomUUID(), randomUUID()];
    try {
      await prisma.$transaction(async (tx) => {
        for (const [index, unit] of ["jornal", "turno"].entries()) {
          await tx.purchaseOrderLine.create({ data: { id: mismatchPoIds[index]!, purchaseOrderId: orderId, wbsNodeId: wbsId, costAnalysisLineId: laborId, costType: "LABOR", description: "Synthetic labor A", unit, quantity: 2, unitPrice: 10, lineSubtotal: 20, lineTotal: 20 } });
          await createInvoice(tx, noteIds[index]!, companyId, "CREDIT_NOTE", 2, 20, {
            costAnalysisLineId: index === 0 ? laborId : null, purchaseOrderLineId: mismatchPoIds[index]!,
          });
        }
      });
      const board = await getProjectResourceBoard(projectId, "LABOR", { window: "all" }, ctx);
      assert.equal(board.type, "REPORT"); if (board.type !== "REPORT") return;
      assert.equal(board.rows.find((row) => row.costAnalysisLineId === laborId)?.invoicedQty, "9.0000");
      assert.equal(board.rows.find((row) => row.costAnalysisLineId === laborId)?.shortfallQty, "1.0000");
      const mismatches = board.rows.filter((row) => row.costAnalysisLineId === null && ["jornal", "turno"].includes(row.unit ?? ""));
      assert.equal(mismatches.length, 2);
      assert.equal(new Set(mismatches.map((row) => row.rowKey)).size, 2);
      for (const row of mismatches) { assert.equal(row.invoicedQty, "-2.0000"); assert.equal(row.orderedQty, "0.0000"); }
    } finally {
      await removeInvoices(noteIds);
      await prisma.purchaseOrderLine.deleteMany({ where: { id: { in: mismatchPoIds }, purchaseOrderId: orderId } });
    }
  });

  it("applies the same net fiscal coverage to equipment with compatible resource references", async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    try {
      await prisma.$transaction(async (tx) => {
        const line = { costAnalysisLineId: equipmentId, costType: "EQUIPMENT" as const, referencedInvoiceId: ids[0]! };
        await createInvoice(tx, ids[0]!, companyId, "INVOICE", 4, 40, line);
        await createInvoice(tx, ids[1]!, companyId, "CREDIT_NOTE", 1, 10, line);
        await createInvoice(tx, ids[2]!, companyId, "DEBIT_NOTE", "0.5000", 5, line);
      });
      const board = await getProjectResourceBoard(projectId, "EQUIPMENT", { window: "all" }, ctx);
      assert.equal(board.type, "REPORT"); if (board.type !== "REPORT") return;
      const equipment = board.rows.find((row) => row.costAnalysisLineId === equipmentId)!;
      assert.equal(equipment.invoicedQty, "3.5000");
      assert.equal(equipment.shortfallQty, "1.5000");
      assert.equal(equipment.unit, "h");
    } finally { await removeInvoices(ids); }
  });

  it("keeps the invoice's own APU category ahead of its linked PO category", async () => {
    const poLine = await prisma.purchaseOrderLine.findFirstOrThrow({ where: { purchaseOrderId: orderId }, select: { id: true } });
    try {
      await prisma.supplierInvoiceLine.updateMany({ where: { invoiceId }, data: { costAnalysisLineId: equipmentId, costType: null, purchaseOrderLineId: poLine.id } });
      const labor = await getProjectResourceBoard(projectId, "LABOR", { window: "all" }, ctx);
      const equipment = await getProjectResourceBoard(projectId, "EQUIPMENT", { window: "all" }, ctx);
      assert.equal(labor.type, "REPORT"); assert.equal(equipment.type, "REPORT"); if (labor.type !== "REPORT" || equipment.type !== "REPORT") return;
      assert.equal(labor.rows.find((row) => row.costAnalysisLineId === laborId)?.invoicedQty, "-1.0000");
      assert.ok(labor.rows.every((row) => row.costAnalysisLineId !== null));
      assert.equal(equipment.rows.find((row) => row.costAnalysisLineId === equipmentId)?.invoicedQty, "10.0000");
    } finally { await prisma.supplierInvoiceLine.updateMany({ where: { invoiceId }, data: { costAnalysisLineId: laborId, costType: "LABOR", purchaseOrderLineId: null } }); }
  });

  it("subtracts credit notes from net monetary resource variance without mixing company sources", async () => {
    const report = await getResourceVarianceReport(projectId, "LABOR", {}, ctx);
    assert.equal(report.type, "REPORT"); if (report.type !== "REPORT") return;
    assert.equal(report.totals.budgetCost, "300.00"); assert.equal(report.totals.accruedCost, "90.00"); assert.equal(report.totals.variance, "210.00");
  });

  it("does not return purchase/AP IDs or figures without their source permissions", async () => {
    const material = await getProjectMaterialsBoard(projectId, { window: "all" }, restricted);
    const resources = await getProjectResourceBoard(projectId, "LABOR", { window: "all" }, restricted);
    assert.equal(material.type, "REPORT"); assert.equal(resources.type, "REPORT"); if (material.type !== "REPORT" || resources.type !== "REPORT") return;
    for (const row of material.rows) { assert.equal(row.orderedQty, "0.0000"); assert.equal(row.relatedPurchaseRequestId, null); assert.equal(row.relatedPurchaseOrderId, null); }
    for (const row of resources.rows) { assert.equal(row.orderedQty, "0.0000"); assert.equal(row.invoicedQty, "0.0000"); assert.equal(row.relatedSupplierInvoiceId, null); }
    assert.ok(material.warnings.some((warning) => warning.includes("incompleta")));
    assert.ok(resources.warnings.some((warning) => warning.includes("AP no disponible")));
  });

  it("honors disabled source modules while preserving budget needs", async () => {
    try {
      await prisma.tenantModuleSetting.createMany({ data: ["PROCUREMENT", "AP", "SCHEDULE"].map((moduleKey) => ({ tenantId, moduleKey, isEnabled: false })) });
      const board = await getProjectResourceBoard(projectId, "LABOR", { window: "all" }, ctx);
      assert.equal(board.type, "REPORT"); if (board.type !== "REPORT") return;
      assert.ok(board.rows.length > 0);
      for (const row of board.rows) { assert.equal(row.orderedQty, "0.0000"); assert.equal(row.invoicedQty, "0.0000"); assert.equal(row.unscheduled, true); }
    } finally { await prisma.tenantModuleSetting.deleteMany({ where: { tenantId } }); }
  });

  it("never covers an APU need with a different physical unit in its request", async () => {
    const materialRequestLine = randomUUID(), laborRequestLine = randomUUID();
    try {
      await prisma.purchaseRequestLine.createMany({ data: [
        { id: materialRequestLine, purchaseRequestId: requestId, wbsNodeId: wbsId, costAnalysisLineId: materialId, productId, costType: "MATERIAL", description: "Synthetic unit mismatch", unit: "bolsa", quantity: 5 },
        { id: laborRequestLine, purchaseRequestId: requestId, wbsNodeId: wbsId, costAnalysisLineId: laborId, costType: "LABOR", lineType: "SERVICE", description: "Synthetic unit mismatch", unit: "jornal", quantity: 5 },
      ] });
      const materials = await getProjectMaterialsBoard(projectId, { window: "all" }, ctx);
      const resources = await getProjectResourceBoard(projectId, "LABOR", { window: "all" }, ctx);
      assert.equal(materials.type, "REPORT"); assert.equal(resources.type, "REPORT"); if (materials.type !== "REPORT" || resources.type !== "REPORT") return;
      assert.equal(materials.rows.find((r) => r.costAnalysisLineId === materialId)?.orderedQty, "3.0000");
      assert.equal(resources.rows.find((r) => r.costAnalysisLineId === laborId)?.orderedQty, "4.0000");
      assert.ok(materials.rows.some((r) => r.unit === "bolsa" && r.costAnalysisLineId === null && r.orderedQty === "5.0000"));
      assert.ok(resources.rows.some((r) => r.unit === "jornal" && r.costAnalysisLineId === null && r.orderedQty === "5.0000"));
      const commitments = await loadMaterialApuCommitments(projectId, ctx);
      assert.equal(commitments.find((r) => r.costAnalysisLineId === materialId)?.orderedQty, "3.0000");
    } finally { await prisma.purchaseRequestLine.deleteMany({ where: { id: { in: [materialRequestLine, laborRequestLine] }, purchaseRequestId: requestId } }); }
  });

  it("rejects a disabled root module instead of querying its planning data", async () => {
    try {
      await prisma.tenantModuleSetting.create({ data: { tenantId, moduleKey: "BUDGETS", isEnabled: false } });
      for (const read of [
        () => getProjectMaterialsBoard(projectId, {}, ctx),
        () => getProjectResourceBoard(projectId, "LABOR", {}, ctx),
        () => getResourceVarianceReport(projectId, "LABOR", {}, ctx),
        () => loadMaterialApuCommitments(projectId, ctx),
      ]) await assert.rejects(read, unavailable);
    } finally { await prisma.tenantModuleSetting.deleteMany({ where: { tenantId } }); }
  });

  it("does not expose contradictory legacy APU children and rejects their monetary variance", async () => {
    const hiddenMaterialId = randomUUID(), hiddenLaborId = randomUUID();
    try {
      await prisma.costAnalysisLine.createMany({ data: [
        { id: hiddenMaterialId, budgetId: foreignBudgetId, costItemId: costId, category: "MATERIAL", description: "Hidden foreign-budget material", unit: "kg", coefficient: 9, unitCost: 10, totalCost: 90 },
        { id: hiddenLaborId, budgetId: foreignBudgetId, costItemId: costId, category: "LABOR", description: "Hidden foreign-budget labor", unit: "h", coefficient: 9, unitCost: 10, totalCost: 90 },
      ] });
      const materials = await getProjectMaterialsBoard(projectId, { window: "all" }, ctx);
      const resources = await getProjectResourceBoard(projectId, "LABOR", { window: "all" }, ctx);
      await assert.rejects(() => getResourceVarianceReport(projectId, "LABOR", {}, ctx), (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT");
      assert.equal(materials.type, "REPORT"); assert.equal(resources.type, "REPORT"); if (materials.type !== "REPORT" || resources.type !== "REPORT") return;
      assert.ok(materials.rows.every((row) => row.costAnalysisLineId !== hiddenMaterialId));
      assert.ok(resources.rows.every((row) => row.costAnalysisLineId !== hiddenLaborId));
      assert.ok((await loadMaterialApuCommitments(projectId, ctx)).every((row) => row.costAnalysisLineId !== hiddenMaterialId));
    } finally { await prisma.costAnalysisLine.deleteMany({ where: { id: { in: [hiddenMaterialId, hiddenLaborId] }, costItemId: costId, budgetId: foreignBudgetId } }); }
  });
});
