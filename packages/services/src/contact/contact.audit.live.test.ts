import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { prisma, type ContactRoleType, type TaxIdType } from "@bloqer/database";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import {
  archiveContact, assignContactRole, createContact, getContactById, listContacts,
  reactivateContact, removeContactRole, updateClientProfile, updateContact,
  updateSubcontractorProfile, updateSupplierProfile,
} from "./contact.service";

describe("AG-03 directory on an explicitly isolated SQL database", {
  skip: process.env.BLOQER_AUDIT_LIVE !== "1", concurrency: false,
}, () => {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const userId = randomUUID();
  let databaseVerified = false;
  const ctx: ServiceContext = { tenantId, actorUserId: userId, companyId: null, roles: ["OWNER"] };
  const errorCode = (code: ServiceError["code"]) =>
    (error: unknown) => error instanceof ServiceError && error.code === code;
  const name = () => `Synthetic directory audit ${randomUUID()}`;
  const create = (initialRole: ContactRoleType = "OTHER") => createContact({ legalName: name(), initialRole }, ctx);
  const graph = (id: string) => prisma.contact.findUniqueOrThrow({
    where: { id },
    include: { roles: { orderBy: { role: "asc" } }, clientProfile: true, supplierProfile: true, subcontractorProfile: true },
  });

  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    databaseVerified = true;
    await prisma.user.create({ data: { id: userId, email: `audit-directory-${userId}@example.invalid`, status: "ACTIVE" } });
    for (const id of [tenantId, otherTenantId]) {
      await prisma.tenant.create({ data: { id, name: "Synthetic directory audit", slug: `audit-directory-${id}` } });
    }
  });
  after(async () => {
    try {
      if (!databaseVerified) return;
      const tenantIds = [tenantId, otherTenantId];
      await prisma.$transaction(async (tx) => {
        await tx.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.project.deleteMany({ where: { tenantId: { in: tenantIds } } });
        const contactScope = { contact: { tenantId: { in: tenantIds } } };
        await tx.clientProfile.deleteMany({ where: contactScope });
        await tx.supplierProfile.deleteMany({ where: contactScope });
        await tx.subcontractorProfile.deleteMany({ where: contactScope });
        await tx.contactRole.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.contact.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } });
        await tx.user.deleteMany({ where: { id: userId } });
      }, { timeout: 30_000 });
    } finally {
      await prisma.$disconnect();
    }
  });

  for (const [taxId, taxIdType] of [
    ["20-11111111-1", "CUIT"], ["20.11111112/2", "CUIL"], ["20 11111113 3", "CUIT"],
    ["20-11111114-4", null], ["20.11111115/5", null],
  ] as const) {
    it(`rejects a duplicate of legacy ${taxIdType ?? "untyped"} ${taxId} without rewriting history`, async () => {
      const legacy = await prisma.contact.create({ data: {
        tenantId, legalName: name(), taxId, taxIdType,
        roles: { create: { tenantId, role: "SUPPLIER" } },
      } });
      const digits = taxId.replace(/[^0-9]/g, "");
      await assert.rejects(() => createContact({ legalName: name(), initialRole: "CLIENT", taxId: digits, taxIdType: "CUIT" }, ctx), errorCode("CONFLICT"));
      assert.equal((await prisma.contact.findUniqueOrThrow({ where: { id: legacy.id } })).taxId, taxId);
      const listed = await listContacts({ search: digits }, ctx);
      assert.ok(listed.data.some((row) => row.id === legacy.id));
    });
  }

  it("normalizes canonical writers and returns one recoverable conflict for concurrent duplicates", async () => {
    const results = await Promise.allSettled([
      createContact({ legalName: name(), initialRole: "CLIENT", taxIdType: "CUIT", taxId: "20-22222222-2" }, ctx),
      createContact({ legalName: name(), initialRole: "SUPPLIER", taxIdType: "CUIL", taxId: "20222222222" }, ctx),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(rejected?.status === "rejected" && errorCode("CONFLICT")(rejected.reason));
    const row = await prisma.contact.findFirstOrThrow({ where: { tenantId, taxId: "20222222222" } });
    assert.equal(await prisma.contact.count({ where: { tenantId, taxId: "20222222222" } }), 1);
    assert.ok((await listContacts({ search: "20-22222222-2" }, ctx)).data.some((contact) => contact.id === row.id));
  });

  it("keeps normalized fiscal uniqueness tenant-scoped and excludes the contact being edited", async () => {
    const row = await createContact({ legalName: name(), initialRole: "CLIENT", taxIdType: "CUIT", taxId: "20-33333333-3" }, ctx);
    await updateContact(row.id, { taxId: "20.33333333/3" }, ctx);
    const other = await createContact({ legalName: name(), initialRole: "SUPPLIER", taxIdType: "CUIT", taxId: "20333333333" }, { ...ctx, tenantId: otherTenantId });
    assert.notEqual(row.id, other.id);
    await assert.rejects(() => getContactById(row.id, { ...ctx, tenantId: otherTenantId }), errorCode("FORBIDDEN"));
  });

  it("does not interpret explicitly foreign or untyped alphanumeric identifiers as CUIT", async () => {
    for (const [taxId, taxIdType] of [
      ["20-44444444-4", "FOREIGN"], ["AB20555555555", null],
    ] as Array<[string, TaxIdType | null]>) {
      await prisma.contact.create({ data: { tenantId, legalName: name(), taxId, taxIdType } });
      const digits = taxId.replace(/[^0-9]/g, "");
      const row = await createContact({ legalName: name(), initialRole: "OTHER", taxIdType: "CUIT", taxId: digits }, ctx);
      assert.equal(row.taxId, digits);
    }
    const foreign = await createContact({ legalName: name(), initialRole: "OTHER", taxIdType: "FOREIGN", taxId: "FOREIGN-123" }, ctx);
    assert.equal(foreign.taxId, "FOREIGN-123");
  });

  it("clears all optional profiles, rounds credit limits, and blocks edits after removing the active role", async () => {
    const row = await create("CLIENT");
    await assignContactRole(row.id, { role: "SUPPLIER" }, ctx);
    await assignContactRole(row.id, { role: "SUBCONTRACTOR" }, ctx);
    assert.equal((await updateClientProfile(row.id, { creditLimit: "100.005", notes: "Antes", defaultCurrency: "usd" }, ctx)).creditLimit?.toFixed(2), "100.01");
    await updateSupplierProfile(row.id, { bankAccount: "Synthetic bank", notes: "Antes" }, ctx);
    await updateSubcontractorProfile(row.id, { specialty: "Synthetic specialty", notes: "Antes" }, ctx);
    assert.equal((await updateClientProfile(row.id, { creditLimit: null, notes: null }, ctx)).creditLimit, null);
    assert.equal((await updateSupplierProfile(row.id, { bankAccount: null, notes: null }, ctx)).bankAccount, null);
    assert.equal((await updateSubcontractorProfile(row.id, { specialty: null, notes: null }, ctx)).specialty, null);
    for (const [role, update] of [
      ["CLIENT", () => updateClientProfile(row.id, { notes: "Denied" }, ctx)],
      ["SUPPLIER", () => updateSupplierProfile(row.id, { notes: "Denied" }, ctx)],
      ["SUBCONTRACTOR", () => updateSubcontractorProfile(row.id, { notes: "Denied" }, ctx)],
    ] as const) {
      await removeContactRole(row.id, role, ctx);
      await assert.rejects(update, errorCode("NOT_FOUND"));
    }
  });

  it("preserves historical profiles and explicit null notes when a role is reactivated", async () => {
    const row = await create("CLIENT");
    await updateClientProfile(row.id, { creditLimit: "123.45", notes: "Keep history" }, ctx);
    await removeContactRole(row.id, "CLIENT", ctx);
    await assignContactRole(row.id, { role: "CLIENT", notes: null, creditLimit: "999" }, ctx);
    const saved = await graph(row.id);
    assert.equal(saved.clientProfile?.creditLimit?.toFixed(2), "123.45");
    assert.equal(saved.clientProfile?.notes, "Keep history");
    assert.equal(saved.roles.find((role) => role.role === "CLIENT")?.notes, null);
  });

  it("archives contacts out of new selectors while keeping project references and reversible history", async () => {
    const row = await create("CLIENT");
    const project = await prisma.project.create({ data: { tenantId, clientContactId: row.id, code: `AUDIT-${randomUUID()}`, name: "Synthetic client history" } });
    await assert.rejects(() => removeContactRole(row.id, "CLIENT", ctx), errorCode("CONFLICT"));
    await archiveContact(row.id, ctx);
    assert.equal((await getContactById(row.id, ctx)).status, "ARCHIVED");
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).clientContactId, row.id);
    assert.equal((await listContacts({ status: "ACTIVE", role: "CLIENT", search: row.legalName }, ctx)).total, 0);
    await reactivateContact(row.id, ctx);
    assert.equal((await listContacts({ status: "ACTIVE", role: "CLIENT", search: row.legalName }, ctx)).total, 1);
  });

  it("rolls back contact creation, its role and its profile if the audit insert fails", async () => {
    const legalName = name();
    await assert.rejects(() => createContact({ legalName, initialRole: "CLIENT" }, { ...ctx, actorUserId: randomUUID() }));
    assert.equal(await prisma.contact.count({ where: { tenantId, legalName } }), 0);
  });

  for (const [operation, initialRole, invoke] of [
    ["general edit", "OTHER", (id: string, context: ServiceContext) => updateContact(id, { email: "rollback@example.invalid" }, context)],
    ["archive", "OTHER", (id: string, context: ServiceContext) => archiveContact(id, context)],
    ["reactivate", "OTHER", (id: string, context: ServiceContext) => reactivateContact(id, context)],
    ["role assignment", "OTHER", (id: string, context: ServiceContext) => assignContactRole(id, { role: "SUPPLIER" }, context)],
    ["role removal", "CLIENT", (id: string, context: ServiceContext) => removeContactRole(id, "CLIENT", context)],
    ["client profile", "CLIENT", (id: string, context: ServiceContext) => updateClientProfile(id, { creditLimit: "20.005", notes: "Must roll back" }, context)],
    ["supplier profile", "SUPPLIER", (id: string, context: ServiceContext) => updateSupplierProfile(id, { bankAccount: "Must roll back" }, context)],
    ["subcontractor profile", "SUBCONTRACTOR", (id: string, context: ServiceContext) => updateSubcontractorProfile(id, { specialty: "Must roll back" }, context)],
  ] as const) {
    it(`rolls back ${operation} when its audit cannot be inserted`, async () => {
      const row = await create(initialRole);
      if (operation === "reactivate") await archiveContact(row.id, ctx);
      const before = await graph(row.id);
      const audits = await prisma.auditLog.count({ where: { tenantId } });
      await assert.rejects(() => invoke(row.id, { ...ctx, actorUserId: randomUUID() }));
      assert.deepEqual(await graph(row.id), before);
      assert.equal(await prisma.auditLog.count({ where: { tenantId } }), audits);
    });
  }
});
