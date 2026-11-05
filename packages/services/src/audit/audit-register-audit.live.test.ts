import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { prisma } from "@bloqer/database";
import { clearProjectAccessModeCache } from "../security/access";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import {
  exportTenantAuditLogCsv,
  fetchTenantAuditLogForExport,
  getTenantAuditLogEntry,
  listAuditActorOptions,
  listAuditProjectOptions,
  listTenantAuditLog,
  resolveTenantAuditLogExportFilters,
} from "./audit-read.service";

const denied = (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN";
const notFound = (error: unknown) => error instanceof ServiceError && error.code === "NOT_FOUND";

describe("AG-13 audit register on isolated SQL", {
  skip: process.env.BLOQER_AUDIT_LIVE !== "1",
  concurrency: false,
}, () => {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const ownCompany = randomUUID();
  const otherCompany = randomUUID();
  const sharedProject = randomUUID();
  const otherProject = randomUUID();
  const contactId = randomUUID();
  const actorUserId = randomUUID();
  const otherUserId = randomUUID();
  const own = randomUUID();
  const other = randomUUID();
  const shared = randomUUID();
  const foreign = randomUUID();
  const oldMembership = randomUUID();
  const ownLegacyOrder = randomUUID();
  const otherLegacyOrder = randomUUID();
  const ownLegacyBudget = randomUUID();
  const otherLegacyBudget = randomUUID();
  const ownLegacyAssignment = randomUUID();
  const otherLegacyAssignment = randomUUID();
  const ownLegacyAttachment = randomUUID();
  const otherLegacyAttachment = randomUUID();
  const sharedLegacyAttachment = randomUUID();
  const orphanedLegacyAttachment = randomUUID();
  const day = new Date("2026-11-05T03:00:00Z");
  const scoped: ServiceContext = { tenantId, companyId: ownCompany, actorUserId, roles: ["ADMIN"] };
  const global: ServiceContext = { ...scoped, companyId: null, roles: ["OWNER"] };
  let verified = false;

  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    verified = true;
    clearProjectAccessModeCache();
    await prisma.$transaction(async (tx) => {
      await tx.tenant.createMany({ data: [tenantId, otherTenantId].map((id) => ({
        id, slug: "audit-ag13-register-" + id, name: "Synthetic AG-13",
        projectAccessMode: "MEMBERSHIP_SCOPED", timezone: "America/Argentina/Buenos_Aires",
      })) });
      await tx.company.createMany({ data: [
        { id: ownCompany, tenantId, name: "Empresa propia" },
        { id: otherCompany, tenantId, name: "Empresa ajena" },
      ] });
      await tx.user.createMany({ data: [actorUserId, otherUserId].map((id) => ({
        id, email: "ag13-register-" + id + "@example.test", status: "ACTIVE",
      })) });
      const memberships = await Promise.all([
        tx.userMembership.create({ data: {
          tenantId, userId: actorUserId, companyId: ownCompany, roles: ["ADMIN"], status: "ACTIVE",
        } }),
        tx.userMembership.create({ data: {
          tenantId, userId: otherUserId, companyId: otherCompany, roles: ["ADMIN"], status: "ACTIVE",
        } }),
      ]);
      await tx.contact.create({ data: { id: contactId, tenantId, legalName: "Contacto sintético" } });
      await tx.project.createMany({ data: [
        { id: sharedProject, companyId: null, code: "SHARED" },
        { id: otherProject, companyId: otherCompany, code: "OTHER" },
      ].map((row) => ({ ...row, tenantId, name: row.code, clientContactId: contactId, status: "ACTIVE" })) });
      const [ownPo, otherPo] = await Promise.all([ownCompany, otherCompany].map((companyId, index) =>
        tx.purchaseOrder.create({ data: {
          tenantId, companyId, projectId: sharedProject, supplierContactId: contactId,
          number: index + 1, issueDate: day, subtotal: "50", totalAmount: "50", status: "CONFIRMED",
        } }),
      ));
      assert.ok(ownPo && otherPo);
      const [ownSettings, otherSettings] = await Promise.all([ownCompany, otherCompany].map((companyId, index) =>
        tx.budgetSettings.create({ data: { budget: { create: {
          tenantId, companyId, projectId: sharedProject, versionNumber: index + 1, name: "Presupuesto sintético",
        } } } }),
      ));
      const attachments = [
        { id: ownLegacyAttachment, linkedEntityType: "PURCHASE_ORDER", linkedEntityId: ownPo.id },
        { id: otherLegacyAttachment, linkedEntityType: "PURCHASE_ORDER", linkedEntityId: otherPo.id },
        { id: sharedLegacyAttachment, linkedEntityType: null, linkedEntityId: null },
        { id: orphanedLegacyAttachment, linkedEntityType: "PURCHASE_ORDER", linkedEntityId: randomUUID() },
      ] as const;
      await tx.documentAttachment.createMany({ data: attachments.map((attachment) => ({
        ...attachment, tenantId, projectId: sharedProject, uploadedBy: actorUserId,
        originalFileName: "synthetic.pdf", fileName: "synthetic.pdf", mimeType: "application/pdf",
        sizeBytes: 16, storageKey: `synthetic/${attachment.id}`,
      })) });
      await tx.auditLog.createMany({ data: [
        { id: own, tenantId, companyId: ownCompany, projectId: sharedProject, actorUserId, action: "own.visible",
          entityType: "PurchaseOrder", entityId: ownPo.id, createdAt: day,
          before: { number: 42, payload: '{"authorization":"private-fixture-value","note":"safe-note"}' } },
        { id: other, tenantId, companyId: otherCompany, projectId: sharedProject, actorUserId: otherUserId,
          action: "other.hidden", entityType: "PurchaseOrder", entityId: otherPo.id, createdAt: day },
        { id: shared, tenantId, action: "shared.visible", entityType: "Tenant", entityId: tenantId,
          createdAt: new Date("2026-11-06T02:59:00Z") },
        { id: foreign, tenantId: otherTenantId, action: "foreign.hidden", entityType: "Tenant",
          entityId: otherTenantId, createdAt: day },
        { id: ownLegacyOrder, tenantId, action: "own.legacy", entityType: "PurchaseOrder", entityId: ownPo.id, createdAt: day },
        { id: otherLegacyOrder, tenantId, action: "other.legacy", entityType: "PurchaseOrder", entityId: otherPo.id, createdAt: day },
        { id: ownLegacyBudget, tenantId, action: "budget.settings_updated", entityType: "BudgetSettings",
          entityId: ownSettings!.id, createdAt: day },
        { id: otherLegacyBudget, tenantId, action: "budget.settings_updated", entityType: "BudgetSettings",
          entityId: otherSettings!.id, createdAt: day },
        { id: ownLegacyAssignment, tenantId, action: "project_membership.user_set", entityType: "User",
          entityId: actorUserId, createdAt: day, after: { addedProjectIds: sharedProject, removedProjectIds: "" } },
        { id: otherLegacyAssignment, tenantId, action: "project_membership.user_set", entityType: "User",
          entityId: otherUserId, createdAt: day, after: { addedProjectIds: sharedProject, removedProjectIds: otherProject } },
        ...attachments.map(({ id }) => ({ id, tenantId, action: "document.uploaded", entityType: "DocumentAttachment",
          entityId: id, createdAt: day })),
        { id: oldMembership, tenantId, action: "membership.legacy", entityType: "UserMembership",
          entityId: memberships[0]!.id, createdAt: day },
        { tenantId, action: "company.legacy.own", entityType: "Company", entityId: ownCompany, createdAt: day },
        { tenantId, action: "company.legacy.other", entityType: "Company", entityId: otherCompany, createdAt: day },
        ...Array.from({ length: 53 }, () => ({
          tenantId, action: "unproven.hidden", entityType: "PurchaseOrder",
          entityId: randomUUID(), createdAt: new Date("2026-11-07T03:00:00Z"),
        })),
      ] });
    }, { timeout: 40_000 });
  });

  after(async () => {
    if (!verified) return;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.auditLog.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
        await tx.documentAttachment.deleteMany({ where: { tenantId } });
        await tx.budgetSettings.deleteMany({ where: { budget: { tenantId } } });
        await tx.budget.deleteMany({ where: { tenantId } });
        await tx.purchaseOrder.deleteMany({ where: { tenantId } });
        await tx.project.deleteMany({ where: { tenantId } });
        await tx.contact.deleteMany({ where: { tenantId } });
        await tx.userMembership.deleteMany({ where: { tenantId } });
        await tx.company.deleteMany({ where: { tenantId } });
        await tx.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
        await tx.user.deleteMany({ where: { id: { in: [actorUserId, otherUserId] } } });
      }, { timeout: 40_000 });
    } finally {
      clearProjectAccessModeCache();
      await prisma.$disconnect();
    }
  });

  it("fills pagination with visible records and checks company, project and tenant in detail", async () => {
    const page = await listTenantAuditLog({ limit: 1 }, scoped);
    assert.equal(page.rows[0]?.id, shared);
    assert.ok(page.nextCursor);
    const next = await listTenantAuditLog({ cursor: page.nextCursor }, scoped);
    assert.deepEqual(next.rows.map((row) => row.action).sort(), [
      "budget.settings_updated", "company.legacy.own", "document.uploaded", "document.uploaded",
      "own.legacy", "own.visible", "project_membership.user_set",
    ]);
    for (const visible of [ownLegacyBudget, ownLegacyAssignment, ownLegacyAttachment, sharedLegacyAttachment]) {
      assert.ok(next.rows.some((row) => row.id === visible));
      assert.equal((await getTenantAuditLogEntry(visible, scoped)).id, visible);
    }
    for (const hidden of [other, foreign, otherLegacyOrder, oldMembership, otherLegacyBudget,
      otherLegacyAssignment, otherLegacyAttachment, orphanedLegacyAttachment]) {
      await assert.rejects(() => getTenantAuditLogEntry(hidden, scoped), notFound);
    }
    assert.equal((await getTenantAuditLogEntry(oldMembership, global)).id, oldMembership);
    const filters = await listTenantAuditLog({ projectId: sharedProject, module: "PROCUREMENT" }, scoped);
    assert.deepEqual(filters.rows.map((row) => row.action).sort(), ["own.legacy", "own.visible"]);
    await assert.rejects(() => listTenantAuditLog({ companyId: otherCompany }, scoped), denied);
    await assert.rejects(() => listTenantAuditLog({ projectId: otherProject }, scoped), denied);
    assert.deepEqual((await listAuditActorOptions(scoped)).map((row) => row.userId), [actorUserId]);
    assert.deepEqual((await listAuditProjectOptions(scoped)).map((row) => row.id), [sharedProject]);
  });

  it("uses the displayed local day and sanitizes legacy details consistently in list, CSV and PDF sources", async () => {
    const input = resolveTenantAuditLogExportFilters({ dateFrom: "2026-11-05", dateTo: "2026-11-05" },
      "America/Argentina/Buenos_Aires");
    const list = await listTenantAuditLog(input, scoped);
    assert.ok(list.rows.some((row) => row.id === shared));
    assert.equal(list.rows.find((row) => row.id === own)?.reference, "#42");
    const detail = await getTenantAuditLogEntry(own, scoped);
    assert.doesNotMatch(JSON.stringify(detail.before), /private-fixture-value/);
    const rows = await fetchTenantAuditLogForExport(input, scoped, 10);
    assert.deepEqual(rows.rows.map((row) => row.id), list.rows.map((row) => row.id));
    const csv = await exportTenantAuditLogCsv(input, scoped);
    assert.doesNotMatch(csv.content, /private-fixture-value|other\.hidden|other\.legacy|membership\.legacy/);
    assert.match(csv.content, /safe-note/);
  });

  it("blocks direct reads and export when AUDIT is disabled, preserving stored history", async () => {
    await prisma.tenantModuleSetting.create({ data: { tenantId, moduleKey: "AUDIT", isEnabled: false } });
    await assert.rejects(() => listTenantAuditLog({}, scoped), denied);
    await assert.rejects(() => getTenantAuditLogEntry(own, scoped), denied);
    await assert.rejects(() => exportTenantAuditLogCsv({}, scoped), denied);
    assert.ok(await prisma.auditLog.count({ where: { tenantId } }) > 0);
  });
});
