import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";

import { hash } from "bcryptjs";
import { isStorageConfigured } from "@bloqer/config";
import { prisma } from "@bloqer/database";
import { toIsoDateInTimeZone } from "@bloqer/utils";
import { createJobsiteLogSchema, updateJobsiteLogSchema } from "@bloqer/validators";

import {
  archiveDocument,
  confirmDocumentUpload,
  getDocumentById,
  getDocumentDownloadUrl,
  getDocumentFileBytes,
  initiateDocumentUpload,
  listEntityDocuments,
  listProjectDocuments,
} from "../documents/document.service";
import { getMyFieldPendingItems } from "../field/field-pending.service";
import { getProjectProgressReport } from "../reports/project-progress.service";
import { clearProjectAccessModeCache } from "../security/access";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import {
  approveJobsiteLog,
  cancelJobsiteLog,
  createJobsiteLog,
  getJobsiteLogActivityLog,
  getJobsiteLogById,
  listJobsiteLogsByProject,
  listProjectWbsItemsForLog,
  returnJobsiteLog,
  submitJobsiteLog,
  updateJobsiteLog,
} from "./jobsite-log.service";

const denied = (error: unknown) =>
  error instanceof ServiceError && ["NOT_FOUND", "FORBIDDEN"].includes(error.code);
const rejected = (error: unknown) =>
  error instanceof ServiceError && ["VALIDATION", "CONFLICT"].includes(error.code);

describe("AG-11 jobsite lifecycle and evidence on isolated SQL", {
  skip: process.env.BLOQER_AUDIT_LIVE !== "1",
  concurrency: false,
}, () => {
  const tenantId = randomUUID();
  const companyA = randomUUID();
  const companyB = randomUUID();
  const sharedProject = randomUUID();
  const hiddenProject = randomUUID();
  const pausedProject = randomUUID();
  const contactId = randomUUID();
  const productId = randomUUID();
  const budgetId = randomUUID();
  const wbsNodeId = randomUUID();
  const scheduleId = randomUUID();
  const scheduleItemId = randomUUID();
  const sharedWarehouseId = randomUUID();
  const hiddenWarehouseId = randomUUID();
  const ownerId = randomUUID();
  const foremanId = randomUUID();
  const readerId = randomUUID();
  const sisterAdminId = randomUUID();
  const ownerEmail = `ag11-owner-${ownerId}@bloqer.demo`;
  const readerEmail = `ag11-reader-${readerId}@bloqer.demo`;
  const retain = process.env.BLOQER_AUDIT_RETAIN_FIXTURES === "1";
  const owner: ServiceContext = { tenantId, companyId: companyA, actorUserId: ownerId, roles: ["OWNER"] };
  const foreman: ServiceContext = { ...owner, actorUserId: foremanId, roles: ["SITE_FOREMAN"] };
  const reader: ServiceContext = { ...owner, actorUserId: readerId, roles: ["PROJECT_VIEWER"] };
  const sister: ServiceContext = { ...owner, companyId: companyB, actorUserId: sisterAdminId, roles: ["ADMIN"] };
  const today = toIsoDateInTimeZone();
  let verified = false;
  let sharedPartId: string;
  let sisterPartId: string;
  let hiddenPartId: string;
  let pausedPartId: string;

  const input = (projectId = sharedProject) => createJobsiteLogSchema.parse({
    projectId,
    logDate: today,
    title: "Parte de prueba",
    generalNotes: "<p>Inicio del frente de obra.</p>",
    labor: [{ workersCount: 3, crewDescription: "Cuadrilla A", hoursWorked: "8.00" }],
    idempotencyKey: randomUUID(),
  });

  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    assert.equal(isStorageConfigured(), false, "Evidence fixtures require external storage to be disabled");
    verified = true;
    clearProjectAccessModeCache();
    const passwordHash = retain ? await hash("audit-ag11-local-only", 10) : null;
    await prisma.$transaction(async (tx) => {
      await tx.tenant.create({ data: {
        id: tenantId, name: "Operación de obra de prueba", slug: `audit-ag11-${tenantId}`,
        projectAccessMode: "MEMBERSHIP_SCOPED",
      } });
      await tx.company.createMany({ data: [
        { id: companyA, tenantId, name: "Empresa de prueba A", status: "ACTIVE" },
        { id: companyB, tenantId, name: "Empresa de prueba B", status: "ACTIVE" },
      ] });
      await tx.user.createMany({ data: [
        { id: ownerId, email: ownerEmail },
        { id: readerId, email: readerEmail },
        { id: foremanId, email: `ag11-foreman-${foremanId}@example.test` },
        { id: sisterAdminId, email: `ag11-sister-${sisterAdminId}@example.test` },
      ].map((user) => ({ ...user, passwordHash, status: "ACTIVE" as const, emailVerified: new Date() })) });
      await tx.userMembership.createMany({ data: [owner, foreman, reader, sister].map((ctx) => ({
        tenantId, companyId: ctx.companyId, userId: ctx.actorUserId, roles: ctx.roles, status: "ACTIVE",
      })) });
      await tx.contact.create({ data: { id: contactId, tenantId, legalName: "Cliente de prueba AG-11" } });
      await tx.contactRole.create({ data: { tenantId, contactId, role: "CLIENT" } });
      await tx.project.createMany({ data: [
        { id: sharedProject, companyId: null, code: "AG11-01", name: "Obra compartida de prueba", status: "ACTIVE" as const },
        { id: hiddenProject, companyId: companyA, code: "AG11-02", name: "Obra sin asignar", status: "ACTIVE" as const },
        { id: pausedProject, companyId: companyA, code: "AG11-03", name: "Obra pausada de prueba", status: "ON_HOLD" as const },
      ].map((project) => ({ ...project, tenantId, clientContactId: contactId, country: "AR" })) });
      await tx.projectMembership.createMany({ data: [foremanId, readerId].map((userId) => ({
        tenantId, projectId: sharedProject, userId,
      })) });
      await tx.product.create({ data: {
        id: productId, tenantId, companyId: companyA, sku: "AG11-CEMENTO", name: "Cemento de prueba", unit: "kg",
      } });
      await tx.warehouse.createMany({ data: [
        { id: sharedWarehouseId, projectId: sharedProject, name: "Depósito de prueba" },
        { id: hiddenWarehouseId, projectId: hiddenProject, name: "Depósito de obra sin asignar" },
      ].map((warehouse) => ({ ...warehouse, tenantId, companyId: companyA, type: "PROJECT" })) });
      await tx.stockMovement.createMany({ data: [sharedWarehouseId, hiddenWarehouseId].map((warehouseId) => ({
        tenantId, companyId: companyA, warehouseId, productId, quantity: "5.0000",
        type: "IN", sourceType: "OPENING_BALANCE", movementDate: new Date(today),
      })) });
      await tx.budget.create({ data: {
        id: budgetId, tenantId, companyId: companyA, projectId: sharedProject, versionNumber: 1,
        name: "Presupuesto de prueba", status: "APPROVED", totalCost: 1000, totalSalePrice: 1500,
      } });
      await tx.wbsNode.create({ data: {
        id: wbsNodeId, budgetId, type: "ITEM", code: "1.1", name: "Frente de prueba",
      } });
      await tx.costItem.create({ data: {
        budgetId, wbsNodeId, unit: "m2", quantity: 20,
        unitCostDirect: 50, unitSalePrice: 75, totalCostDirect: 1000, totalSalePrice: 1500,
      } });
      await tx.schedule.create({ data: {
        id: scheduleId, tenantId, projectId: sharedProject, baselineBudgetId: budgetId,
      } });
      await tx.scheduleItem.create({ data: {
        id: scheduleItemId, tenantId, scheduleId, name: "Tarea de prueba",
        startDate: new Date(today), endDate: new Date(today), durationDays: 1,
        wbsLinks: { create: { tenantId, wbsNodeId, isPrimary: true } },
      } });
      const paused = await tx.jobsiteLog.create({ data: {
        tenantId, companyId: companyA, projectId: pausedProject, logDate: new Date(today),
        generalNotes: "Parte previo a la pausa.", createdBy: ownerId,
      } });
      pausedPartId = paused.id;
    }, { timeout: 30_000 });
    sharedPartId = (await createJobsiteLog(input(), foreman)).id;
    sisterPartId = (await createJobsiteLog(input(), sister)).id;
    hiddenPartId = (await createJobsiteLog(input(hiddenProject), owner)).id;
  });

  after(async () => {
    if (!verified) return;
    try {
      if (retain) {
        const directory = new URL("../../../../output/platform-audit/ag-11-2026-11-05/", import.meta.url);
        await mkdir(directory, { recursive: true });
        await writeFile(new URL("retained-fixture.json", directory), JSON.stringify({
          ownerEmail, readerEmail, sharedProject, hiddenProject, pausedProject, sharedPartId, tenantId, companyA,
        }, null, 2) + "\n");
        return;
      }
      await prisma.$transaction(async (tx) => {
        await tx.emailDeliveryLog.deleteMany({ where: { tenantId } });
        await tx.notification.deleteMany({ where: { tenantId } });
        await tx.auditLog.deleteMany({ where: { tenantId } });
        await tx.documentAttachment.deleteMany({ where: { tenantId } });
        await tx.documentFolder.deleteMany({ where: { tenantId } });
        await tx.jobsiteLogProgress.deleteMany({ where: { jobsiteLog: { tenantId } } });
        await tx.jobsiteLogLabor.deleteMany({ where: { jobsiteLog: { tenantId } } });
        await tx.jobsiteLogMaterialUsage.deleteMany({ where: { jobsiteLog: { tenantId } } });
        await tx.jobsiteLog.deleteMany({ where: { tenantId } });
        await tx.stockMovement.deleteMany({ where: { tenantId } });
        await tx.warehouse.deleteMany({ where: { tenantId } });
        await tx.product.deleteMany({ where: { tenantId } });
        await tx.receivable.deleteMany({ where: { tenantId } });
        await tx.salesInvoice.deleteMany({ where: { tenantId } });
        await tx.certification.deleteMany({ where: { tenantId } });
        await tx.schedule.deleteMany({ where: { tenantId } });
        await tx.costItem.deleteMany({ where: { budgetId } });
        await tx.wbsNode.deleteMany({ where: { budgetId } });
        await tx.budget.deleteMany({ where: { tenantId } });
        await tx.projectMembership.deleteMany({ where: { tenantId } });
        await tx.project.deleteMany({ where: { tenantId } });
        await tx.contactRole.deleteMany({ where: { tenantId } });
        await tx.contact.deleteMany({ where: { tenantId } });
        await tx.tenantModuleSetting.deleteMany({ where: { tenantId } });
        await tx.userMembership.deleteMany({ where: { tenantId } });
        await tx.company.deleteMany({ where: { tenantId } });
        await tx.tenant.deleteMany({ where: { id: tenantId } });
        await tx.user.deleteMany({ where: { id: { in: [ownerId, foremanId, readerId, sisterAdminId] } } });
      }, { timeout: 45_000 });
    } finally {
      clearProjectAccessModeCache();
      await prisma.$disconnect();
    }
  });

  it("does not list, read, cancel or expose activity from a sister company's part", async () => {
    assert.deepEqual((await listJobsiteLogsByProject(sharedProject, undefined, owner)).map((log) => log.id), [sharedPartId]);
    await assert.rejects(getJobsiteLogById(sisterPartId, owner), denied);
    await assert.rejects(getJobsiteLogActivityLog(sisterPartId, owner), denied);
    await assert.rejects(cancelJobsiteLog(sisterPartId, owner), denied);
    await assert.rejects(createJobsiteLog({ ...input(), companyId: companyB }, foreman), denied);
  });

  it("checks project assignment and operational state for cancellation and WBS lookup", async () => {
    await assert.rejects(cancelJobsiteLog(hiddenPartId, foreman), denied);
    await assert.rejects(listProjectWbsItemsForLog(hiddenProject, foreman), denied);
    await assert.rejects(cancelJobsiteLog(pausedPartId, owner), rejected);
    await assert.rejects(createJobsiteLog(input(), reader), denied);
    assert.equal((await getJobsiteLogById(hiddenPartId, owner)).status, "DRAFT");
  });

  it("replays equivalent work hours and rejects changed crew notes under the same key", async () => {
    const request = input();
    const created = await createJobsiteLog(request, foreman);
    const equivalent = { ...request, labor: [{ ...request.labor[0]!, hoursWorked: "8" }] };
    assert.equal((await createJobsiteLog(equivalent, foreman)).id, created.id);
    await assert.rejects(createJobsiteLog({
      ...request, labor: [{ ...request.labor[0]!, notes: "Otra observación" }],
    }, foreman), rejected);
    assert.equal(await prisma.auditLog.count({
      where: { tenantId, entityId: created.id, action: "JOBSITE_LOG_CREATED" },
    }), 1);
  });

  it("enforces real calendar dates and nonempty content before persisting", async () => {
    await assert.rejects(createJobsiteLog({ ...input(), logDate: "2026-02-30" }, foreman), rejected);
    await assert.rejects(createJobsiteLog({
      ...input(), title: " ", generalNotes: "<p><br></p>", labor: [],
    }, foreman), rejected);
    await assert.rejects(updateJobsiteLog(sharedPartId, updateJobsiteLogSchema.parse({
      title: " ", generalNotes: "<p><br></p>",
      progress: [], labor: [], materials: [], issues: [],
    }), foreman), rejected);
    await assert.rejects(listJobsiteLogsByProject(sharedProject, { dateFrom: "2026-02-30" }, foreman), rejected);
  });

  it("returns with observations, resubmits and approves exactly once with scoped notices", async () => {
    assert.equal((await submitJobsiteLog(sharedPartId, foreman)).status, "SUBMITTED");
    await assert.rejects(returnJobsiteLog(sharedPartId, { returnNotes: "  " }, owner), rejected);
    await assert.rejects(returnJobsiteLog(sharedPartId, { returnNotes: "Corregir" }, sister), denied);
    const returned = await returnJobsiteLog(sharedPartId, { returnNotes: " Revisar frente " }, owner);
    assert.equal(returned.status, "DRAFT");
    assert.equal(returned.returnNotes, "Revisar frente");
    await updateJobsiteLog(sharedPartId, updateJobsiteLogSchema.parse({
      ...input(), generalNotes: "<ul><li>Frente verificado.</li></ul>",
      progress: [{ wbsNodeId, quantityCompleted: "5.0000", physicalPct: "25.0000" }],
    }), foreman);
    await submitJobsiteLog(sharedPartId, foreman);
    const approvals = await Promise.allSettled([
      approveJobsiteLog(sharedPartId, owner),
      approveJobsiteLog(sharedPartId, owner),
    ]);
    assert.ok(approvals.some((result) => result.status === "fulfilled"));
    assert.equal((await getJobsiteLogById(sharedPartId, reader)).status, "APPROVED");
    assert.equal(await prisma.auditLog.count({
      where: { tenantId, entityId: sharedPartId, action: "JOBSITE_LOG_APPROVED" },
    }), 1);
    assert.equal(await prisma.notification.count({
      where: { tenantId, recipientUserId: sisterAdminId, linkedEntityId: sharedPartId },
    }), 0);
    assert.equal(await prisma.notification.count({
      where: { tenantId, recipientUserId: foremanId, linkedEntityId: sharedPartId, type: "JOBSITE_LOG_RETURNED" },
    }), 1);
    await assert.rejects(cancelJobsiteLog(sharedPartId, owner), rejected);
  });

  it("shows approved Field evidence and schedule progress as separate sources in R-002", async () => {
    const report = await getProjectProgressReport(sharedProject, { dateTo: today }, owner);
    assert.equal(report.type, "REPORT");
    if (report.type !== "REPORT") return;
    assert.equal(Number(report.physical.pct), 25);
    assert.equal(Number(report.physical.coveragePct), 100);
    assert.equal(Number(report.schedule.progressPct), 25);
    assert.equal(report.schedule.totalTasks, 1);
    assert.equal(report.rows.length, 1);
    assert.equal(Number(report.rows[0]?.physicalQty), 5);
    assert.equal(Number(report.rows[0]?.physicalRemainingQty), 15);
  });

  it("AG-14 scopes historical certificates in Field and rejects a foreign receivable in R-002", async () => {
    const date = new Date(today);
    const [ownCertificate, foreignCertificate] = await prisma.$transaction(async (tx) => {
      const makeCertificate = async (companyId: string, number: number) => {
        const budget = await tx.budget.create({ data: {
          tenantId, companyId, projectId: sharedProject, versionNumber: number + 1,
          name: "Presupuesto USD de prueba", status: "CLOSED", currency: "USD",
        } });
        return tx.certification.create({ data: {
          tenantId, companyId: null, projectId: sharedProject, budgetId: budget.id,
          number, periodStart: date, periodEnd: date, issueDate: date, status: "ISSUED", totalAmount: "125.25",
        } });
      };
      const own = await makeCertificate(companyA, 1);
      const foreign = await makeCertificate(companyB, 2);
      const invoice = await tx.salesInvoice.create({ data: {
        tenantId, companyId: companyA, projectId: sharedProject, clientContactId: contactId,
        certificationId: own.id, number: 1, issueDate: date, dueDate: date, currency: "USD",
        status: "ISSUED", subtotal: "125.25", totalAmount: "125.25",
      } });
      await tx.receivable.create({ data: {
        tenantId, companyId: companyB, projectId: sharedProject, clientContactId: contactId,
        salesInvoiceId: invoice.id, issueDate: date, dueDate: date, currency: "USD", originalAmount: "9876.54",
      } });
      return [own, foreign] as const;
    }, { timeout: 30_000 });

    const itemsFor = (ctx: ServiceContext) => getMyFieldPendingItems(ctx, { projectId: sharedProject, group: "certificaciones" });
    const [ownPending, foreignPending] = await Promise.all([itemsFor(owner), itemsFor(sister)]);
    assert.equal(ownPending.counts.certifications, 1);
    assert.equal(foreignPending.counts.certifications, 1);
    assert.deepEqual(ownPending.items.map(({ entityId, currency }) => ({ entityId, currency })), [
      { entityId: ownCertificate.id, currency: "USD" },
    ]);
    assert.deepEqual(foreignPending.items.map(({ entityId }) => entityId), [foreignCertificate.id]);

    const filters = { budgetId: ownCertificate.budgetId, dateTo: today };
    const report = await getProjectProgressReport(sharedProject, filters, owner);
    if (report.type !== "REPORT") return assert.fail("Expected a report");
    assert.equal(report.financial.invoiced, "125.25");
    assert.equal(report.financial.collected, null);
    assert.equal(report.financial.receivableBalance, null);
    assert.equal(report.financial.overdueBalance, null);
    assert.doesNotMatch(JSON.stringify(report), /9876\.54/);
    assert.match(report.warnings.join(" "), /relación con la factura no se pudo comprobar/);
    const restricted = await getProjectProgressReport(sharedProject, filters, reader);
    if (restricted.type !== "REPORT") return assert.fail("Expected a report for the assigned reader");
    assert.equal(restricted.sourceAccess.ar, false);
    assert.equal(restricted.financial.invoiced, null);
  });

  it("protects attached evidence across parent scope, including historical null company", async () => {
    const upload = (linkedEntityId: string, projectId: string, originalFileName: string) => ({
      linkedEntityType: "JOBSITE_LOG" as const, linkedEntityId, projectId, originalFileName,
      mimeType: "image/png" as const, category: "JOBSITE_EVIDENCE" as const, sizeBytes: 128, idempotencyKey: randomUUID(),
    });
    const ownDoc = await initiateDocumentUpload(upload(sharedPartId, sharedProject, "frente-a.png"), foreman);
    assert.equal(ownDoc.storageConfigured, false);
    const sisterDoc = await initiateDocumentUpload(upload(sisterPartId, sharedProject, "frente-b.png"), sister);
    const hiddenDoc = await initiateDocumentUpload(upload(hiddenPartId, hiddenProject, "frente-oculto.png"), owner);
    await prisma.documentAttachment.update({
      where: { id: sisterDoc.documentId },
      data: { companyId: null },
    });
    await prisma.documentAttachment.update({ where: { id: ownDoc.documentId }, data: { companyId: null } });
    assert.deepEqual((await listEntityDocuments("JOBSITE_LOG", sharedPartId, reader, { projectId: sharedProject })).map((doc) => doc.id), [ownDoc.documentId]);
    assert.deepEqual((await listProjectDocuments(sharedProject, { status: "ACTIVE" }, owner)).map((doc) => doc.id), [ownDoc.documentId]);
    await assert.rejects(initiateDocumentUpload(upload(sisterPartId, sharedProject, "sin-acceso.png"), owner), denied);
    await assert.rejects(listEntityDocuments("JOBSITE_LOG", sisterPartId, owner, { projectId: sharedProject }), denied);
    await assert.rejects(listEntityDocuments("JOBSITE_LOG", hiddenPartId, foreman, { projectId: hiddenProject }), denied);
    await prisma.documentAttachment.update({
      where: { id: sisterDoc.documentId },
      data: { status: "UPLOADING", storageProvider: "R2" },
    });
    await assert.rejects(confirmDocumentUpload(sisterDoc.documentId, owner), denied);
    await assert.rejects(getDocumentById(sisterDoc.documentId, owner), denied);
    await assert.rejects(getDocumentDownloadUrl(sisterDoc.documentId, owner), denied);
    await assert.rejects(getDocumentFileBytes(hiddenDoc.documentId, foreman), denied);
    await assert.rejects(archiveDocument(hiddenDoc.documentId, foreman), denied);
    assert.equal((await getDocumentById(ownDoc.documentId, reader)).companyId, null);
    assert.ok((await listProjectDocuments(sharedProject, { status: "ACTIVE" }, reader)).some((doc) => doc.id === ownDoc.documentId));
    assert.equal(await prisma.notification.count({
      where: { tenantId, recipientUserId: sisterAdminId, linkedEntityId: sharedPartId, type: "DOCUMENT_UPLOAD_CONFIRMED" },
    }), 0);
  });

  it("requires a WBS allocation before submitting a linked material", async () => {
    const material = { productId, warehouseId: sharedWarehouseId, description: "Cemento", quantity: "1.0000" };
    const part = await createJobsiteLog({ ...input(), materials: [material] }, foreman);
    await assert.rejects(submitJobsiteLog(part.id, foreman), /partida EDT/);
    assert.equal((await getJobsiteLogById(part.id, owner)).status, "DRAFT");
    await updateJobsiteLog(part.id, updateJobsiteLogSchema.parse({
      materials: [{ ...material, wbsNodeId }],
    }), foreman);
    assert.equal((await submitJobsiteLog(part.id, foreman)).status, "SUBMITTED");
  });

  it("rejects a foreign project warehouse and prevents two approvals spending the same balance", async () => {
    const material = { productId, warehouseId: sharedWarehouseId, wbsNodeId, description: "Cemento", quantity: "5.0000" };
    const wrongWarehouse = { ...material, warehouseId: hiddenWarehouseId };
    await assert.rejects(createJobsiteLog({ ...input(), materials: [wrongWarehouse] }, foreman), denied);

    const first = await createJobsiteLog({ ...input(), materials: [material] }, foreman);
    const second = await createJobsiteLog({ ...input(), materials: [material] }, foreman);
    await submitJobsiteLog(first.id, foreman);
    await submitJobsiteLog(second.id, foreman);
    const approvals = await Promise.allSettled([
      approveJobsiteLog(first.id, owner),
      approveJobsiteLog(second.id, owner),
    ]);
    assert.equal(
      approvals.filter((result) => result.status === "fulfilled").length,
      1,
      approvals.map((result) => result.status === "rejected" ? String(result.reason) : result.status).join(" | "),
    );
    const failure = approvals.find((result) => result.status === "rejected");
    assert.ok(failure && rejected(failure.reason));
    const movements = await prisma.stockMovement.findMany({
      where: { tenantId, warehouseId: sharedWarehouseId, productId, type: "OUT", sourceType: "CONSUMPTION" },
    });
    assert.equal(movements.length, 1);
    assert.equal(movements[0]?.quantity.toFixed(4), "5.0000");
    const parts = await prisma.jobsiteLog.findMany({ where: { id: { in: [first.id, second.id] } } });
    assert.deepEqual(parts.map((part) => part.status).sort(), ["APPROVED", "SUBMITTED"]);
  });

  it("keeps a linked part submitted when inventory is disabled and permits removing the links", async () => {
    const material = {
      productId, warehouseId: sharedWarehouseId, wbsNodeId,
      description: "Cemento", quantity: "5.0000",
    };
    const countConsumptions = () => prisma.stockMovement.count({ where: { tenantId, sourceType: "CONSUMPTION" } });
    const previousConsumptions = await countConsumptions();
    const part = await prisma.jobsiteLog.create({ data: {
      tenantId, companyId: companyA, projectId: sharedProject, logDate: new Date(today),
      status: "SUBMITTED", createdBy: foremanId, generalNotes: "Parte de prueba con inventario vinculado.",
      materials: { create: material },
    } });
    await prisma.tenantModuleSetting.create({ data: { tenantId, moduleKey: "INVENTORY", isEnabled: false } });
    try {
      await assert.rejects(approveJobsiteLog(part.id, owner), /Activá Inventario/);
      assert.equal((await getJobsiteLogById(part.id, owner)).status, "SUBMITTED");
      await assert.rejects(createJobsiteLog({ ...input(), materials: [material] }, foreman), /Activá Inventario/);
      await returnJobsiteLog(part.id, { returnNotes: "Quitar los vínculos de stock." }, owner);
      await updateJobsiteLog(part.id, updateJobsiteLogSchema.parse({
        generalNotes: "Se conserva el consumo como descripción.",
        materials: [{ description: "Cemento", quantity: "5.0000" }],
      }), foreman);
      await submitJobsiteLog(part.id, foreman);
      assert.equal((await approveJobsiteLog(part.id, owner)).status, "APPROVED");
      assert.equal(await countConsumptions(), previousConsumptions);
    } finally {
      await prisma.tenantModuleSetting.deleteMany({ where: { tenantId, moduleKey: "INVENTORY" } });
    }
  });
});
