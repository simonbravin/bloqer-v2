import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { isStorageConfigured } from "@bloqer/config";
import { prisma, type LinkedEntityType } from "@bloqer/database";
import { buildStorageKey } from "@bloqer/storage";
import { clearProjectAccessModeCache } from "../security/access";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { withSyntheticStorageObjects, withSyntheticStorageSigning } from "../testing/storage-signing-fixture";
import { getDocumentVersionLinks } from "./document-versions.service";
import { buildProjectDocumentDeliveryExport, getProjectDocumentDeliveryIndex } from "./document-delivery-index.service";
import { ServiceError, type ServiceContext } from "../types";
import { createDocumentFolder, listProjectDocumentFolders, moveDocumentFolder } from "./document-folder.service";
import { exportDocumentHistory, getDocumentHistory } from "./document-history.service";
import { parseBuiltCsv } from "../report-exports/csv-export.service";
import {
  archiveDocument,
  confirmDocumentUpload,
  getDocumentById,
  getDocumentDownloadUrl,
  getDocumentFileBytes,
  initiateDocumentUpload,
  listEntityDocuments,
  listProjectDocuments,
  uploadDocument,
  restoreDocument,
  verifyStoredDocument,
  softDeleteDocument,
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
      await tx.user.createMany({ data: actors.map(({ actorUserId }) => ({ id: actorUserId, name: "Responsable de prueba", email: `${actorUserId}@example.test`, status: "ACTIVE" })) });
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
        await tx.documentAttachment.updateMany({ where: { tenantId }, data: { replacesAttachmentId: null } });
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
    await assert.rejects(getDocumentHistory(own.id, reader), denied);
    await assert.rejects(getDocumentHistory(foreign.id, owner), denied);
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

  it("indexes authorized delivery files and revision provenance without exposing other companies or mutating originals", async () => {
    const old = await addDocument({ linkedEntityType: "PROJECT", linkedEntityId: projectId, projectId, companyId: null });
    const latest = await addDocument({ linkedEntityType: "PROJECT", linkedEntityId: projectId, projectId, companyId: null });
    const ownInvoice = await addDocument({ linkedEntityType: "SUPPLIER_INVOICE", linkedEntityId: invoiceA, projectId, companyId: null });
    const foreignInvoice = await addDocument({ linkedEntityType: "SUPPLIER_INVOICE", linkedEntityId: invoiceB, projectId, companyId: null });
    const pending = await addDocument({ linkedEntityType: "PROJECT", linkedEntityId: projectId, projectId, companyId: null, status: "UPLOADING" });
    for (const doc of [old, latest, ownInvoice, foreignInvoice, pending]) {
      await prisma.documentAttachment.update({ where: { id: doc.id }, data: { originalFileName: `H4-${doc.id}.pdf` } });
    }
    await prisma.documentAttachment.update({ where: { id: old.id }, data: { status: "ARCHIVED", storageProvider: "R2" } });
    await prisma.documentAttachment.update({ where: { id: latest.id }, data: { storageProvider: "R2", replacesAttachmentId: old.id } });
    const beforeAudit = await prisma.auditLog.count({ where: { tenantId } });
    const index = await getProjectDocumentDeliveryIndex(projectId, { search: "H4-", status: "ALL" }, owner);
    assert.deepEqual(new Set(index.rows.map(({ id }) => id)), new Set([old.id, latest.id, ownInvoice.id]));
    assert.equal(index.rows.find(({ id }) => id === latest.id)?.previous?.id, old.id);
    assert.equal(index.rows.find(({ id }) => id === old.id)?.next?.id, latest.id);
    assert.equal(index.rows.find(({ id }) => id === ownInvoice.id)?.companyId, companyA);
    assert.equal(index.rows.find(({ id }) => id === ownInvoice.id)?.originalRegistered, false);
    assert.equal(index.originalsRegistered, 2);
    assert.equal(index.rows.find(({ id }) => id === latest.id)?.uploadedByName, "Responsable de prueba");
    const readerIndex = await getProjectDocumentDeliveryIndex(projectId, { search: "H4-", status: "ALL" }, reader);
    assert.deepEqual(new Set(readerIndex.rows.map(({ id }) => id)), new Set([old.id, latest.id]));
    const foreignIndex = await getProjectDocumentDeliveryIndex(projectId, { search: "H4-", status: "ALL" }, sibling);
    assert.ok(foreignIndex.rows.some(({ id }) => id === foreignInvoice.id));
    assert.ok(!foreignIndex.rows.some(({ id }) => id === ownInvoice.id));
    const exported = await buildProjectDocumentDeliveryExport(projectId, { search: "H4-", status: "ALL", page: 100 }, owner);
    assert.equal(exported.table.rows.length, 3);
    assert.ok(!JSON.stringify(exported).includes(foreignInvoice.id));
    assert.ok(!JSON.stringify(exported).includes("storageKey"));
    await assert.rejects(getProjectDocumentDeliveryIndex(projectId, {}, { ...reader, actorUserId: randomUUID() }), denied);
    await assert.rejects(getProjectDocumentDeliveryIndex(projectId, {}, { ...owner, tenantId: randomUUID() }), denied);
    assert.equal(await prisma.auditLog.count({ where: { tenantId } }), beforeAudit);
    assert.equal((await prisma.documentAttachment.findUniqueOrThrow({ where: { id: old.id } })).status, "ARCHIVED");
  });

  it("rejects another uploader's replay and hides old pending attempts without mutating on reads", async () => {
    const payload = invoiceUpload(invoiceA, projectId);
    await withSyntheticStorageSigning(async () => {
      const started = Date.now();
      const created = await initiateDocumentUpload(payload, owner);
      assert.equal(created.status, "UPLOADING");
      assert.equal(created.storageConfigured, true);
      assert.equal((await initiateDocumentUpload(payload, owner)).documentId, created.documentId);
      await assert.rejects(initiateDocumentUpload(payload, buyer), { code: "CONFLICT" });
      const doc = await getDocumentById(created.documentId, owner);
      assert.equal(doc.uploadedBy, owner.actorUserId);
      assert.equal(doc.uploadedByName, "Responsable de prueba");
      assert.ok(Date.parse(doc.createdAt) >= started - 1000);
      assert.ok(!("storageKey" in doc) && !("publicUrl" in doc));
      const event = await prisma.auditLog.findFirstOrThrow({ where: { tenantId, entityId: created.documentId, action: "document.upload_initiated" } });
      assert.equal(event.actorUserId, owner.actorUserId);
      assert.equal(event.companyId, companyA);
      assert.equal(event.projectId, projectId);
    });
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

  it("rejects both upload paths without storage and creates no attachment or upload audit", async () => {
    const payload = invoiceUpload(invoiceA, projectId);
    const before = await prisma.documentAttachment.count({ where: { tenantId } });
    const beforeAudits = await prisma.auditLog.count({ where: { tenantId } });
    await assert.rejects(initiateDocumentUpload(payload, owner), { code: "CONFLICT" });
    const bytes = Buffer.from("%PDF-1.7\nfixture");
    await assert.rejects(uploadDocument({ ...payload, sizeBytes: bytes.length }, bytes, owner), { code: "CONFLICT" });
    assert.equal(await prisma.documentAttachment.count({ where: { tenantId } }), before);
    assert.equal(await prisma.auditLog.count({ where: { tenantId } }), beforeAudits);
  });

  it("denies another tenant and a user without project membership before disclosing author or files", async () => {
    const doc = await addDocument({ linkedEntityType: "PROJECT", linkedEntityId: projectId, projectId, companyId: companyA });
    const outsider = { ...reader, actorUserId: sibling.actorUserId };
    await assert.rejects(getDocumentById(doc.id, { ...owner, tenantId: randomUUID() }), missing);
    await assert.rejects(getDocumentHistory(doc.id, { ...owner, tenantId: randomUUID() }), missing);
    await assert.rejects(exportDocumentHistory(doc.id, { ...owner, tenantId: randomUUID() }), missing);
    await assert.rejects(verifyStoredDocument(doc.id, { ...owner, tenantId: randomUUID() }), missing);
    await assert.rejects(getDocumentById(doc.id, outsider), denied);
    await assert.rejects(getDocumentDownloadUrl(doc.id, outsider), denied);
    await assert.rejects(getDocumentHistory(doc.id, outsider), denied);
    await assert.rejects(exportDocumentHistory(doc.id, outsider), denied);
    await assert.rejects(verifyStoredDocument(doc.id, outsider), denied);
    const listed = await listProjectDocuments(projectId, {}, owner);
    assert.equal(listed.find(({ id }) => id === doc.id)?.uploadedByName, "Responsable de prueba");
  });

  it("preserves original references and attribution when operational evidence is archived and restored", async () => {
    const original = await addDocument({ linkedEntityType: "SUPPLIER_INVOICE", linkedEntityId: invoiceA, projectId, companyId: companyA });
    await archiveDocument(original.id, owner);
    const archived = await prisma.documentAttachment.findUniqueOrThrow({ where: { id: original.id } });
    assert.equal(archived.status, "ARCHIVED");
    assert.equal(archived.storageKey, original.storageKey);
    assert.equal(archived.uploadedBy, original.uploadedBy);
    assert.equal(archived.createdAt.toISOString(), original.createdAt.toISOString());
    await assert.rejects(softDeleteDocument(original.id, owner), denied);
    await restoreDocument(original.id, owner);
    assert.equal((await getDocumentById(original.id, owner)).status, "ACTIVE");
    assert.equal(await prisma.auditLog.count({ where: { tenantId, entityId: original.id, action: { in: ["document.archived", "document.reactivated"] } } }), 2);
    const history = await getDocumentHistory(original.id, owner);
    assert.deepEqual(new Set(history.entries.map((entry) => entry.action)), new Set(["document.archived", "document.reactivated"]));
    assert.ok(history.entries.every((entry) => entry.actorName === "Responsable de prueba" && Number.isFinite(Date.parse(entry.createdAt))));
  });

  it("paginates tied timestamps without losing events and excludes mismatched audit scopes and private payloads", async () => {
    const doc = await addDocument({ linkedEntityType: "PROJECT", linkedEntityId: projectId, projectId, companyId: companyA });
    const other = await addDocument({ linkedEntityType: "PROJECT", linkedEntityId: projectId, projectId, companyId: companyA });
    const ids = Array.from({ length: 53 }, () => randomUUID());
    const foreignCursor = randomUUID();
    const base = {
      tenantId, projectId, companyId: companyA, entityType: "DocumentAttachment", entityId: doc.id,
      actorUserId: owner.actorUserId, action: "document.archived", createdAt: new Date("2026-11-20T10:00:00Z"),
      after: { storageKey: "private-fixture-key", status: "ARCHIVED" }, ipAddress: "192.0.2.1",
    };
    await prisma.auditLog.createMany({ data: [
      ...ids.map((id) => ({ ...base, id })),
      { ...base, id: foreignCursor, entityId: other.id },
      { ...base, id: randomUUID(), companyId: companyB },
      { ...base, id: randomUUID(), action: "internal.private_event" },
    ] });
    const first = await getDocumentHistory(doc.id, owner);
    assert.equal(first.entries.length, 50);
    assert.ok(first.nextCursor);
    const second = await getDocumentHistory(doc.id, owner, first.nextCursor);
    assert.equal(second.entries.length, 3);
    assert.equal(second.nextCursor, null);
    assert.deepEqual(new Set([...first.entries, ...second.entries].map((entry) => entry.id)), new Set(ids));
    assert.deepEqual(Object.keys(first.entries[0]!).sort(), ["action", "actorName", "createdAt", "id"]);
    assert.doesNotMatch(JSON.stringify(first), /private-fixture-key|192\.0\.2\.1|storageKey|ipAddress/);
    await assert.rejects(getDocumentHistory(doc.id, owner, foreignCursor), { code: "VALIDATION" });
    await assert.rejects(getDocumentHistory(doc.id, owner, "invalid-cursor"), { code: "VALIDATION" });
    const csv = await exportDocumentHistory(doc.id, owner);
    const exported = parseBuiltCsv(csv);
    assert.equal(exported.rows.length, 53, "Export includes events beyond the first page");
    assert.deepEqual(new Set(exported.rows.map((row) => row[6])), new Set(ids));
    assert.ok(exported.rows.every((row) => row[0] === doc.id && row[2] === companyA && row[3] === projectId && row[9] === base.createdAt.toISOString()));
    assert.doesNotMatch(csv, /private-fixture-key|192\.0\.2\.1|storageKey|ipAddress|internal.private_event/);
  });

  it("exports only authorized company evidence and escapes spreadsheet formulas in file and actor names", async () => {
    const doc = await addDocument({ linkedEntityType: "SUPPLIER_INVOICE", linkedEntityId: invoiceA, projectId, companyId: companyA });
    await prisma.documentAttachment.update({ where: { id: doc.id }, data: { originalFileName: "=malicious.pdf" } });
    await prisma.user.update({ where: { id: buyer.actorUserId }, data: { name: "+formula" } });
    await prisma.auditLog.create({ data: {
      tenantId, projectId, companyId: companyA, entityType: "DocumentAttachment", entityId: doc.id,
      actorUserId: buyer.actorUserId, action: "document.uploaded",
    } });
    const { rows } = parseBuiltCsv(await exportDocumentHistory(doc.id, owner));
    assert.equal(rows[0]?.[1], "'=malicious.pdf");
    assert.equal(rows[0]?.[8], "'+formula");
    await assert.rejects(exportDocumentHistory(doc.id, sibling), denied);
    await assert.rejects(verifyStoredDocument(doc.id, sibling), denied);
    await assert.rejects(verifyStoredDocument(doc.id, owner), { code: "CONFLICT" });
  });

  it("rejects an oversized history export instead of delivering an incomplete CSV", async () => {
    const doc = await addDocument({ linkedEntityType: "PROJECT", linkedEntityId: projectId, projectId, companyId: companyA });
    await prisma.auditLog.createMany({ data: Array.from({ length: 5001 }, () => ({
      id: randomUUID(), tenantId, projectId, companyId: companyA, entityType: "DocumentAttachment", entityId: doc.id,
      actorUserId: owner.actorUserId, action: "document.archived",
    })) });
    await assert.rejects(exportDocumentHistory(doc.id, owner), { code: "CONFLICT" });
    assert.equal((await getDocumentHistory(doc.id, owner)).entries.length, 50);
  });

  it("restores an archive only once under concurrency and preserves its original metadata", async () => {
    const doc = await addDocument({ linkedEntityType: "SUPPLIER_INVOICE", linkedEntityId: invoiceA, projectId, companyId: companyA });
    await archiveDocument(doc.id, owner);
    await assert.rejects(restoreDocument(doc.id, sibling), denied);
    const attempts = await Promise.allSettled([restoreDocument(doc.id, owner), restoreDocument(doc.id, owner)]);
    assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
    assert.equal(await prisma.auditLog.count({ where: { tenantId, entityId: doc.id, action: "document.reactivated" } }), 1);
    const restored = await prisma.documentAttachment.findUniqueOrThrow({ where: { id: doc.id } });
    assert.equal(restored.storageKey, doc.storageKey);
    assert.equal(restored.uploadedBy, doc.uploadedBy);
    assert.equal(restored.createdAt.toISOString(), doc.createdAt.toISOString());
    assert.equal(restored.status, "ACTIVE");
  });

  it("keeps original bytes during failed revisions and atomically confirms a revision with safe replay", async () => {
    await withSyntheticStorageObjects(async (objects) => {
      const originalBytes = Buffer.from("%PDF-1.7\noriginal evidence");
      const first = await uploadDocument({ ...invoiceUpload(invoiceA, projectId), sizeBytes: originalBytes.length }, originalBytes, owner);
      const original = await prisma.documentAttachment.findUniqueOrThrow({ where: { id: first.documentId } });
      const bytes = Buffer.from("%PDF-1.7\nrevised evidence");
      const input = { ...invoiceUpload(invoiceA, projectId), replacesAttachmentId: first.documentId, sizeBytes: bytes.length };
      const pending = await initiateDocumentUpload(input, owner);
      const row = await prisma.documentAttachment.findUniqueOrThrow({ where: { id: pending.documentId } });
      await assert.rejects(confirmDocumentUpload(row.id, owner), { code: "VALIDATION" });
      assert.equal((await getDocumentById(original.id, owner)).status, "ACTIVE");
      assert.deepEqual((await getDocumentFileBytes(original.id, owner)).body, originalBytes);
      assert.notEqual(original.storageKey, row.storageKey);
      objects.set(row.storageKey, bytes);
      const results = await Promise.all([confirmDocumentUpload(row.id, owner), confirmDocumentUpload(row.id, owner)]);
      assert.ok(results.every((result) => result.id === row.id));
      assert.equal((await getDocumentById(original.id, owner)).status, "ARCHIVED");
      assert.equal((await getDocumentById(row.id, owner)).status, "ACTIVE");
      assert.deepEqual((await getDocumentFileBytes(original.id, owner)).body, originalBytes);
      assert.deepEqual((await getDocumentFileBytes(row.id, owner)).body, bytes);
      assert.equal((await initiateDocumentUpload(input, owner)).documentId, row.id);
      assert.equal(await prisma.auditLog.count({ where: { tenantId, entityId: row.id, action: "document.upload_confirmed" } }), 1);
      assert.equal(await prisma.auditLog.count({ where: { tenantId, entityId: original.id, action: "document.archived" } }), 1);
      assert.equal((await getDocumentVersionLinks(original.id, owner)).next?.id, row.id);
      assert.equal((await getDocumentVersionLinks(row.id, owner)).previous?.id, original.id);
      assert.equal((await getDocumentVersionLinks(original.id, owner)).canCreateVersion, false);
      await assert.rejects(getDocumentVersionLinks(row.id, sibling), denied);
      await assert.rejects(initiateDocumentUpload({ ...input, idempotencyKey: randomUUID(), linkedEntityId: invoiceB }, { ...owner, companyId: null }), denied);
    });
  });

  it("recovers an interrupted photo on the same row after rejecting invalid bytes, with scope and provenance intact", async () => {
    await withSyntheticStorageObjects(async (objects) => {
      const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
      const input = { ...invoiceUpload(invoiceA, projectId), originalFileName: "foto.png", mimeType: "image/png" as const, category: "PHOTO" as const, sizeBytes: bytes.length };
      const pending = await initiateDocumentUpload(input, owner);
      const original = await prisma.documentAttachment.findUniqueOrThrow({ where: { id: pending.documentId } });
      await assert.rejects(confirmDocumentUpload(original.id, owner), { code: "VALIDATION" });
      objects.set(original.storageKey, Buffer.from("incomplete"));
      await assert.rejects(confirmDocumentUpload(original.id, sibling), denied);
      await assert.rejects(confirmDocumentUpload(original.id, reader), denied);
      await assert.rejects(confirmDocumentUpload(original.id, { ...owner, tenantId: randomUUID() }), missing);
      assert.ok(objects.has(original.storageKey), "Denied callers must not alter the object");
      await assert.rejects(confirmDocumentUpload(original.id, owner), { code: "VALIDATION" });
      assert.equal(objects.has(original.storageKey), false);
      const retry = await initiateDocumentUpload(input, owner);
      assert.equal(retry.documentId, original.id);
      assert.equal(retry.created, false);
      const repaired = await prisma.documentAttachment.findUniqueOrThrow({ where: { id: original.id } });
      assert.notEqual(repaired.storageKey, original.storageKey);
      objects.set(repaired.storageKey, bytes);
      await confirmDocumentUpload(repaired.id, owner);
      await confirmDocumentUpload(repaired.id, owner);
      const stored = await getDocumentById(repaired.id, owner);
      assert.equal(stored.status, "ACTIVE");
      assert.equal(stored.uploadedBy, original.uploadedBy);
      assert.equal(stored.createdAt, original.createdAt.toISOString());
      assert.equal(stored.companyId, companyA);
      assert.deepEqual((await getDocumentFileBytes(stored.id, owner)).body, bytes);
      assert.equal(await prisma.documentAttachment.count({ where: { tenantId, idempotencyKey: input.idempotencyKey } }), 1);
      assert.equal(await prisma.auditLog.count({ where: { tenantId, entityId: stored.id, action: "document.upload_initiated" } }), 1);
      assert.equal(await prisma.auditLog.count({ where: { tenantId, entityId: stored.id, action: "document.upload_confirmed" } }), 1);
    });
  });

  it("allows only one concurrent successor and preserves versioned library evidence", async () => {
    await withSyntheticStorageObjects(async (objects) => {
      const bytes = Buffer.from("%PDF-1.7\nlibrary plan");
      const input = { projectId, originalFileName: "plano.pdf", mimeType: "application/pdf" as const, sizeBytes: bytes.length, category: "PLAN" as const, idempotencyKey: randomUUID() };
      const original = await uploadDocument(input, bytes, owner);
      const revisions = await Promise.all([1, 2].map(() => initiateDocumentUpload({ ...input, idempotencyKey: randomUUID(), replacesAttachmentId: original.documentId }, owner)));
      for (const revision of revisions) {
        const row = await prisma.documentAttachment.findUniqueOrThrow({ where: { id: revision.documentId } });
        objects.set(row.storageKey, bytes);
      }
      const outcomes = await Promise.allSettled(revisions.map((revision) => confirmDocumentUpload(revision.documentId, owner)));
      assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
      assert.equal(await prisma.documentAttachment.count({ where: { tenantId, replacesAttachmentId: original.documentId, status: "ACTIVE" } }), 1);
      const successor = await prisma.documentAttachment.findFirstOrThrow({ where: { tenantId, replacesAttachmentId: original.documentId, status: "ACTIVE" } });
      await assert.rejects(softDeleteDocument(original.documentId, owner), denied);
      await assert.rejects(softDeleteDocument(successor.id, owner), denied);
      const cancelled = await prisma.documentAttachment.findFirstOrThrow({ where: { tenantId, replacesAttachmentId: original.documentId, status: "UPLOADING" } });
      await softDeleteDocument(cancelled.id, owner);
      assert.equal((await getDocumentVersionLinks(original.documentId, owner)).next?.id, successor.id);
      assert.deepEqual((await getDocumentFileBytes(original.documentId, owner)).body, bytes);
    });
  });
});
