import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { isStorageConfigured } from "@bloqer/config";
import { prisma, type LinkedEntityType } from "@bloqer/database";
import { buildStorageKey } from "@bloqer/storage";
import { clearProjectAccessModeCache } from "../security/access";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import { createDocumentFolder, listProjectDocumentFolders, moveDocumentFolder } from "./document-folder.service";
import {
  archiveDocument,
  confirmDocumentUpload,
  getDocumentById,
  getDocumentDownloadUrl,
  initiateDocumentUpload,
  listEntityDocuments,
  listProjectDocuments,
} from "./document.service";

const denied = (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN";
const missing = (error: unknown) => error instanceof ServiceError && error.code === "NOT_FOUND";

describe("AG-13 document parent and company scopes on isolated SQL", {
  skip: process.env.BLOQER_AUDIT_LIVE !== "1",
  concurrency: false,
}, () => {
  const tenantId = randomUUID();
  const companyA = randomUUID();
  const companyB = randomUUID();
  const projectId = randomUUID();
  const supplierId = randomUUID();
  const invoiceA = randomUUID();
  const invoiceB = randomUUID();
  const corporateInvoice = randomUUID();
  const date = new Date("2026-11-05T00:00:00Z");
  const owner: ServiceContext = { tenantId, companyId: companyA, actorUserId: randomUUID(), roles: ["OWNER"] };
  const reader: ServiceContext = { ...owner, actorUserId: randomUUID(), roles: ["PROJECT_VIEWER"] };
  const finance: ServiceContext = { ...owner, actorUserId: randomUUID(), roles: ["PROJECT_FINANCE"] };
  const buyer: ServiceContext = { ...owner, actorUserId: randomUUID(), roles: ["PROCUREMENT"] };
  const sibling: ServiceContext = { ...owner, companyId: companyB, actorUserId: randomUUID(), roles: ["OWNER"] };
  const actors = [owner, reader, finance, buyer, sibling];
  let verified = false;

  async function addDocument(input: {
    linkedEntityType: LinkedEntityType;
    linkedEntityId: string;
    projectId: string | null;
    companyId: string | null;
    status?: "UPLOADING" | "ACTIVE";
    createdAt?: Date;
  }) {
    const id = randomUUID();
    return prisma.documentAttachment.create({ data: {
      ...input,
      id, tenantId, uploadedBy: owner.actorUserId, originalFileName: "evidencia.pdf", fileName: "evidencia.pdf",
      mimeType: "application/pdf", sizeBytes: 12,
      storageKey: buildStorageKey(tenantId, input.projectId, id, "evidencia.pdf"),
    } });
  }

  function invoiceUpload(invoiceId: string, project: string | null) {
    return {
      projectId: project, linkedEntityType: "SUPPLIER_INVOICE" as const, linkedEntityId: invoiceId,
      originalFileName: "respaldo.pdf", mimeType: "application/pdf" as const, category: "INVOICE" as const,
      idempotencyKey: randomUUID(), sizeBytes: 12,
    };
  }

  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    assert.equal(isStorageConfigured(), false, "Storage must be disabled for synthetic document fixtures");
    verified = true;
    clearProjectAccessModeCache();
    await prisma.$transaction(async (tx) => {
      await tx.tenant.create({ data: { id: tenantId, name: "Auditoría Documentos", slug: `audit-doc-${tenantId}`, projectAccessMode: "MEMBERSHIP_SCOPED" } });
      await tx.company.createMany({ data: [companyA, companyB].map((id) => ({ id, tenantId, name: `Empresa de prueba ${id}`, status: "ACTIVE" })) });
      await tx.user.createMany({ data: actors.map(({ actorUserId }) => ({ id: actorUserId, email: `${actorUserId}@example.test`, status: "ACTIVE" })) });
      await tx.userMembership.createMany({ data: actors.map(({ actorUserId, companyId, roles }) => ({
        tenantId, companyId, roles, userId: actorUserId, status: "ACTIVE",
      })) });
      await tx.contact.create({ data: { id: supplierId, tenantId, legalName: "Contacto de prueba", country: "AR" } });
      await tx.project.create({ data: {
        id: projectId, tenantId, companyId: null, name: "Obra compartida de prueba", code: "AG13-DOCS", status: "ACTIVE",
        clientContactId: supplierId, country: "AR",
      } });
      await tx.projectMembership.createMany({ data: [reader, finance, buyer].map(({ actorUserId }) => ({ tenantId, projectId, userId: actorUserId })) });
      await tx.supplierInvoice.createMany({ data: [
        { id: invoiceA, companyId: companyA, projectId, number: 1 },
        { id: invoiceB, companyId: companyB, projectId, number: 1 },
        { id: corporateInvoice, companyId: companyA, projectId: null, number: 2 },
      ].map((scope) => ({ ...scope, tenantId, supplierContactId: supplierId, issueDate: date, dueDate: date, subtotal: "12", totalAmount: "12" })) });
    }, { timeout: 30_000 });
  });

  after(async () => {
    if (!verified) return;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.notification.deleteMany({ where: { tenantId } });
        await tx.auditLog.deleteMany({ where: { tenantId } });
        await tx.documentAttachment.deleteMany({ where: { tenantId } });
        await tx.documentFolder.updateMany({ where: { tenantId, kind: "USER" }, data: { parentId: null } });
        await tx.documentFolder.deleteMany({ where: { tenantId } });
        await tx.supplierInvoice.deleteMany({ where: { tenantId } });
        await tx.projectMembership.deleteMany({ where: { tenantId } });
        await tx.project.deleteMany({ where: { tenantId } });
        await tx.contact.deleteMany({ where: { tenantId } });
        await tx.userMembership.deleteMany({ where: { tenantId } });
        await tx.company.deleteMany({ where: { tenantId } });
        await tx.tenant.deleteMany({ where: { id: tenantId } });
        await tx.user.deleteMany({ where: { id: { in: actors.map(({ actorUserId }) => actorUserId) } } });
      }, { timeout: 30_000 });
    } finally {
      clearProjectAccessModeCache();
      await prisma.$disconnect();
    }
  });

  it("inherits each parent company on a shared project and enforces its role on every surface", async () => {
    const own = await addDocument({ linkedEntityType: "SUPPLIER_INVOICE", linkedEntityId: invoiceA, projectId, companyId: null });
    const foreign = await addDocument({ linkedEntityType: "SUPPLIER_INVOICE", linkedEntityId: invoiceB, projectId, companyId: null });
    const library = await addDocument({ linkedEntityType: "PROJECT", linkedEntityId: projectId, projectId, companyId: null });
    assert.deepEqual(new Set((await listProjectDocuments(projectId, {}, owner)).map(({ id }) => id)), new Set([own.id, library.id]));
    assert.deepEqual((await listProjectDocuments(projectId, {}, reader)).map(({ id }) => id), [library.id]);
    assert.deepEqual((await listEntityDocuments("SUPPLIER_INVOICE", invoiceA, finance, { projectId })).map(({ id }) => id), [own.id]);
    assert.equal((await getDocumentById(foreign.id, sibling)).id, foreign.id);
    for (const ctx of [reader, owner]) await assert.rejects(getDocumentDownloadUrl(foreign.id, ctx), denied);
    await assert.rejects(getDocumentById(own.id, reader), denied);
    await assert.rejects(archiveDocument(foreign.id, owner), denied);
    await assert.rejects(initiateDocumentUpload(invoiceUpload(invoiceB, projectId), owner), denied);
  });

  it("keeps corporate attachments out of a project finance role and fails inconsistent links closed", async () => {
    const corporate = await addDocument({ linkedEntityType: "SUPPLIER_INVOICE", linkedEntityId: corporateInvoice, projectId: null, companyId: companyA });
    const mismatched = await addDocument({ linkedEntityType: "SUPPLIER_INVOICE", linkedEntityId: invoiceA, projectId, companyId: companyB });
    assert.equal((await getDocumentById(corporate.id, owner)).id, corporate.id);
    await assert.rejects(getDocumentById(corporate.id, finance), denied);
    await assert.rejects(listEntityDocuments("SUPPLIER_INVOICE", corporateInvoice, finance), denied);
    await assert.rejects(initiateDocumentUpload(invoiceUpload(corporateInvoice, null), finance), denied);
    await assert.rejects(getDocumentById(mismatched.id, { ...owner, companyId: null }), missing);
  });

  it("rejects another uploader's replay and hides old pending attempts without mutating on reads", async () => {
    const payload = invoiceUpload(invoiceA, projectId);
    const created = await initiateDocumentUpload(payload, owner);
    assert.equal((await initiateDocumentUpload(payload, owner)).documentId, created.documentId);
    await assert.rejects(initiateDocumentUpload(payload, buyer), { code: "CONFLICT" });
    const stale = await addDocument({
      linkedEntityType: "SUPPLIER_INVOICE", linkedEntityId: invoiceA, projectId, companyId: companyA,
      status: "UPLOADING", createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });
    const visible = await listEntityDocuments("SUPPLIER_INVOICE", invoiceA, finance, { projectId });
    assert.ok(!visible.some(({ id }) => id === stale.id));
    assert.equal((await prisma.documentAttachment.findUniqueOrThrow({ where: { id: stale.id } })).status, "UPLOADING");
    await assert.rejects(confirmDocumentUpload(stale.id, sibling), denied);
  });

  it("serializes opposite folder moves so a project tree cannot form a cycle", async () => {
    const general = (await listProjectDocumentFolders(projectId, owner)).find(({ systemKey }) => systemKey === "GENERAL");
    assert.ok(general);
    const a = await createDocumentFolder(projectId, { parentId: general.id, name: "Carpeta de prueba A" }, owner);
    const b = await createDocumentFolder(projectId, { parentId: general.id, name: "Carpeta de prueba B" }, owner);
    const outcomes = await Promise.allSettled([
      moveDocumentFolder(projectId, a.id, { parentId: b.id }, owner),
      moveDocumentFolder(projectId, b.id, { parentId: a.id }, owner),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    assert.ok(rejected?.reason instanceof ServiceError && rejected.reason.code === "VALIDATION");
    assert.equal(await prisma.auditLog.count({ where: { tenantId, projectId, action: "document_folder.moved" } }), 1);
  });
});
