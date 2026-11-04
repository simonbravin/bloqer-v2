import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { prisma } from "@bloqer/database";
import { getCompanies, getCompanyById, createCompany } from "../company/company.service";
import { createMembership, getSessionTenantContext } from "../membership/membership.service";
import { createTenant, updateTenantStatus } from "../tenant/tenant.service";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import { getTenantSettings, getTenantPermissionMatrixNotes, updateTenantDisplaySettings, updateTenantPermissionMatrixNotes } from "./tenant-settings.service";

describe("AG-01 context and settings on an isolated SQL database", { skip: process.env.BLOQER_AUDIT_LIVE !== "1" }, () => {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const ctx: ServiceContext = { tenantId, actorUserId: userId, companyId, roles: ["OWNER"] };
  const display = { name: "Synthetic audit settings", timezone: "America/Argentina/Buenos_Aires", baseCurrency: "ARS" };
  const denied = (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN";

  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    await prisma.user.create({ data: { id: userId, email: `audit-settings-${userId}@example.invalid`, status: "ACTIVE" } });
    await prisma.tenant.create({ data: { id: tenantId, name: display.name, slug: `audit-${tenantId}`, status: "ACTIVE" } });
    await prisma.company.create({ data: { id: otherCompanyId, tenantId, name: "Synthetic other company", website: "https://other.example.invalid" } });
    await prisma.company.create({ data: { id: companyId, tenantId, name: "Synthetic assigned company", website: "https://before.example.invalid", ivaCondition: "MONOTAX" } });
    await prisma.userMembership.create({ data: { userId, tenantId, companyId, roles: ["OWNER"], status: "ACTIVE" } });
  });

  after(async () => { await prisma.$disconnect(); });

  it("company picklists and direct reads respect the membership anchor, including tenant admins", async () => {
    assert.deepEqual((await getCompanies(ctx)).map((row) => row.id), [companyId]);
    assert.equal((await getCompanies({ ...ctx, companyId: null })).length, 2);
    await assert.rejects(() => getCompanyById(otherCompanyId, ctx), denied);
    assert.equal((await getTenantSettings(ctx)).primaryCompany?.id, companyId);
  });

  it("clearing optional settings persists null on the assigned company and audits that value", async () => {
    await updateTenantDisplaySettings({ ...display, website: null, ivaCondition: null }, ctx);
    const row = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    assert.equal(row.website, null);
    assert.equal(row.ivaCondition, null);
    assert.equal((await prisma.company.findUniqueOrThrow({ where: { id: otherCompanyId } })).website, "https://other.example.invalid");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { tenantId, action: "TENANT_DISPLAY_SETTINGS_UPDATED" }, orderBy: { createdAt: "desc" } });
    // Audit metadata intentionally serializes nested objects as bounded JSON strings.
    const contact = JSON.parse((log.after as { companyContact: string }).companyContact) as { website: unknown };
    assert.equal(contact.website, null);
  });

  it("a failed audit insert rolls back both display and company changes", async () => {
    await assert.rejects(() => updateTenantDisplaySettings({ ...display, name: "Must roll back", website: "https://rollback.example.invalid" }, { ...ctx, actorUserId: randomUUID() }));
    assert.equal((await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).name, display.name);
    assert.equal((await prisma.company.findUniqueOrThrow({ where: { id: companyId } })).website, null);
  });

  it("parallel partial permission notes preserve both changes and both audit records", async () => {
    await Promise.all([
      updateTenantPermissionMatrixNotes({ notes: { PROJECTS: { text: "Synthetic projects note" } } }, ctx),
      updateTenantPermissionMatrixNotes({ notes: { SCHEDULE: { text: "Synthetic schedule note" } } }, ctx),
    ]);
    const notes = await getTenantPermissionMatrixNotes(ctx);
    assert.equal(notes.PROJECTS?.text, "Synthetic projects note");
    assert.equal(notes.SCHEDULE?.text, "Synthetic schedule note");
    assert.equal(await prisma.auditLog.count({ where: { tenantId, action: "TENANT_PERMISSION_MATRIX_NOTES_UPDATED" } }), 2);
  });

  it("permission note changes roll back when their audit cannot be written", async () => {
    await assert.rejects(() => updateTenantPermissionMatrixNotes({ notes: { PROJECTS: { text: "Must roll back" } } }, { ...ctx, actorUserId: randomUUID() }));
    assert.equal((await getTenantPermissionMatrixNotes(ctx)).PROJECTS?.text, "Synthetic projects note");
  });

  it("an inactive or foreign company cannot broaden an anchored session", async () => {
    await prisma.company.update({ where: { id: companyId }, data: { status: "INACTIVE" } });
    try {
      assert.equal(await getSessionTenantContext(userId, { preferredTenantId: tenantId }), null);
    } finally {
      await prisma.company.update({ where: { id: companyId }, data: { status: "ACTIVE" } });
    }
    const foreignTenant = await prisma.tenant.create({ data: { name: "Synthetic foreign tenant", slug: `audit-${randomUUID()}` } });
    const foreignCompany = await prisma.company.create({ data: { tenantId: foreignTenant.id, name: "Synthetic foreign company" } });
    await prisma.userMembership.update({ where: { userId_tenantId: { userId, tenantId } }, data: { companyId: foreignCompany.id } });
    try {
      assert.equal(await getSessionTenantContext(userId), null);
    } finally {
      await prisma.userMembership.update({ where: { userId_tenantId: { userId, tenantId } }, data: { companyId } });
    }
  });

  it("configuration module flags block direct reads and writes; either enabled read branch works", async () => {
    for (const moduleKey of ["TENANT_SETTINGS", "USERS_PERMISSIONS"]) {
      await prisma.tenantModuleSetting.create({ data: { tenantId, moduleKey, isEnabled: false } });
    }
    try {
      await assert.rejects(() => getTenantSettings(ctx), denied);
      await assert.rejects(() => getTenantPermissionMatrixNotes(ctx), denied);
      await assert.rejects(() => updateTenantDisplaySettings(display, ctx), denied);
      await assert.rejects(() => updateTenantPermissionMatrixNotes({ notes: {} }, ctx), denied);
      await prisma.tenantModuleSetting.update({ where: { tenantId_moduleKey: { tenantId, moduleKey: "USERS_PERMISSIONS" } }, data: { isEnabled: true } });
      assert.equal((await getTenantSettings(ctx)).id, tenantId);
    } finally {
      await prisma.tenantModuleSetting.deleteMany({ where: { tenantId } });
    }
  });

  it("membership, company and tenant creation and status are atomic with their audits", async () => {
    const brokenCtx = { ...ctx, actorUserId: randomUUID() };
    const newUser = await prisma.user.create({ data: { email: `audit-new-${randomUUID()}@example.invalid`, status: "ACTIVE" } });
    await assert.rejects(() => createMembership({ userId: newUser.id, tenantId, roles: ["VIEWER"] }, brokenCtx));
    assert.equal(await prisma.userMembership.count({ where: { userId: newUser.id, tenantId } }), 0);
    await assert.rejects(() => createCompany({ name: "Synthetic rollback company" }, brokenCtx));
    assert.equal(await prisma.company.count({ where: { tenantId } }), 2);
    const slug = `audit-rollback-${randomUUID()}`;
    await assert.rejects(() => createTenant({ name: "Synthetic rollback tenant", slug }, brokenCtx.actorUserId));
    assert.equal(await prisma.tenant.count({ where: { slug } }), 0);
    await assert.rejects(() => updateTenantStatus(tenantId, "SUSPENDED", brokenCtx));
    assert.equal((await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).status, "ACTIVE");
  });
});
