/** AG-07/038: isolated SQL regression for the jobsite form's authorized pick lists. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { prisma } from "@bloqer/database";

import { getJobsiteLogFormPickList } from "../jobsite-log/jobsite-log.service";
import { clearProjectAccessModeCache } from "../security/access";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";

const live = process.env.BLOQER_AUDIT_LIVE === "1";
const sortedIds = (rows: Array<{ id: string }>) => rows.map((row) => row.id).sort();

describe(
  "AG-07 jobsite inventory pick lists on isolated SQL",
  { skip: !live, concurrency: false },
  () => {
    const tenantId = randomUUID(),
      foreignTenantId = randomUUID();
    const companyId = randomUUID(),
      otherCompanyId = randomUUID(),
      foreignCompanyId = randomUUID();
    const actorId = randomUUID(),
      globalActorId = randomUUID(),
      noInventoryActorId = randomUUID();
    const contactId = randomUUID(),
      otherContactId = randomUUID(),
      archivedContactId = randomUUID(),
      foreignContactId = randomUUID();
    const projectId = randomUUID(),
      accessibleOtherProjectId = randomUUID(),
      hiddenProjectId = randomUUID(),
      foreignProjectId = randomUUID();
    const ownProductId = randomUUID(),
      sharedProductId = randomUUID(),
      otherProductId = randomUUID(),
      inactiveProductId = randomUUID(),
      foreignProductId = randomUUID();
    const generalWarehouseId = randomUUID(),
      projectWarehouseId = randomUUID(),
      accessibleOtherWarehouseId = randomUUID(),
      hiddenWarehouseId = randomUUID(),
      otherGeneralWarehouseId = randomUUID(),
      otherSharedWarehouseId = randomUUID(),
      inactiveWarehouseId = randomUUID(),
      foreignWarehouseId = randomUUID();
    const ownSubcontractId = randomUUID(),
      otherSubcontractId = randomUUID(),
      otherProjectSubcontractId = randomUUID(),
      cancelledSubcontractId = randomUUID(),
      foreignSubcontractId = randomUUID();
    const users = [actorId, globalActorId, noInventoryActorId];
    const ctx: ServiceContext = { tenantId, companyId, actorUserId: actorId, roles: ["VIEWER"] };
    const global: ServiceContext = {
      ...ctx,
      companyId: null,
      actorUserId: globalActorId,
      roles: ["OWNER"],
    };
    const withoutInventory: ServiceContext = {
      ...ctx,
      actorUserId: noInventoryActorId,
      roles: ["PROJECT_VIEWER"],
    };
    let verified = false;

    before(async () => {
      await assertAuditDatabaseIdentity(prisma);
      verified = true;
      clearProjectAccessModeCache();
      await prisma.$transaction(
        async (tx) => {
          await tx.tenant.createMany({
            data: [tenantId, foreignTenantId].map((id) => ({
              id,
              name: "Synthetic AG07 jobsite pick lists",
              slug: `ag07-jobsite-options-${id}`,
              projectAccessMode: "MEMBERSHIP_SCOPED" as const,
            })),
          });
          // A is the sole active company for the shared-project/global-context case.
          await tx.company.createMany({
            data: [
              { id: companyId, tenantId, name: "Synthetic options A", status: "ACTIVE" },
              { id: otherCompanyId, tenantId, name: "Synthetic options B", status: "INACTIVE" },
              {
                id: foreignCompanyId,
                tenantId: foreignTenantId,
                name: "Synthetic foreign options",
                status: "ACTIVE",
              },
            ],
          });
          await tx.user.createMany({
            data: users.map((id) => ({
              id,
              email: `ag07-options-${id}@example.test`,
              status: "ACTIVE" as const,
            })),
          });
          await tx.userMembership.createMany({
            data: [
              { tenantId, companyId, userId: actorId, roles: ["VIEWER"] },
              { tenantId, companyId: null, userId: globalActorId, roles: ["OWNER"] },
              { tenantId, companyId, userId: noInventoryActorId, roles: ["PROJECT_VIEWER"] },
            ],
          });
          // Contact has no companyId: all active contacts within the tenant remain available.
          await tx.contact.createMany({
            data: [
              {
                id: contactId,
                tenantId,
                legalName: "Synthetic options contact A",
                status: "ACTIVE",
              },
              {
                id: otherContactId,
                tenantId,
                legalName: "Synthetic options contact B",
                status: "ACTIVE",
              },
              {
                id: archivedContactId,
                tenantId,
                legalName: "Synthetic archived options contact",
                status: "ARCHIVED",
              },
              {
                id: foreignContactId,
                tenantId: foreignTenantId,
                legalName: "Synthetic foreign options contact",
                status: "ACTIVE",
              },
            ],
          });
          await tx.contactRole.createMany({
            data: [
              { tenantId, contactId, role: "CLIENT" },
              { tenantId, contactId, role: "SUBCONTRACTOR" },
              { tenantId, contactId: otherContactId, role: "SUBCONTRACTOR" },
              { tenantId: foreignTenantId, contactId: foreignContactId, role: "CLIENT" },
              { tenantId: foreignTenantId, contactId: foreignContactId, role: "SUBCONTRACTOR" },
            ],
          });
          await tx.project.createMany({
            data: [
              {
                id: projectId,
                tenantId,
                companyId: null,
                clientContactId: contactId,
                code: randomUUID(),
                name: "Synthetic shared options project",
                country: "AR",
                status: "ACTIVE",
              },
              {
                id: accessibleOtherProjectId,
                tenantId,
                companyId,
                clientContactId: contactId,
                code: randomUUID(),
                name: "Synthetic accessible other worksite",
                country: "AR",
                status: "ACTIVE",
              },
              {
                id: hiddenProjectId,
                tenantId,
                companyId,
                clientContactId: contactId,
                code: randomUUID(),
                name: "Synthetic hidden worksite",
                country: "AR",
                status: "ACTIVE",
              },
              {
                id: foreignProjectId,
                tenantId: foreignTenantId,
                companyId: foreignCompanyId,
                clientContactId: foreignContactId,
                code: randomUUID(),
                name: "Synthetic foreign worksite",
                country: "AR",
                status: "ACTIVE",
              },
            ],
          });
          await tx.projectMembership.createMany({
            data: [
              { tenantId, projectId, userId: actorId },
              { tenantId, projectId: accessibleOtherProjectId, userId: actorId },
              { tenantId, projectId, userId: noInventoryActorId },
            ],
          });
          await tx.product.createMany({
            data: [
              {
                id: ownProductId,
                tenantId,
                companyId,
                sku: randomUUID(),
                name: "Synthetic own options product",
                unit: "kg",
                status: "ACTIVE",
              },
              {
                id: sharedProductId,
                tenantId,
                companyId: null,
                sku: randomUUID(),
                name: "Synthetic shared options product",
                unit: "kg",
                status: "ACTIVE",
              },
              {
                id: otherProductId,
                tenantId,
                companyId: otherCompanyId,
                sku: randomUUID(),
                name: "Synthetic other company product",
                unit: "kg",
                status: "ACTIVE",
              },
              {
                id: inactiveProductId,
                tenantId,
                companyId,
                sku: randomUUID(),
                name: "Synthetic inactive options product",
                unit: "kg",
                status: "INACTIVE",
              },
              {
                id: foreignProductId,
                tenantId: foreignTenantId,
                companyId: foreignCompanyId,
                sku: randomUUID(),
                name: "Synthetic foreign options product",
                unit: "kg",
                status: "ACTIVE",
              },
            ],
          });
          await tx.warehouse.createMany({
            data: [
              {
                id: generalWarehouseId,
                tenantId,
                companyId,
                name: "Synthetic general options warehouse",
                status: "ACTIVE",
              },
              {
                id: projectWarehouseId,
                tenantId,
                companyId,
                projectId,
                name: "Synthetic selected project warehouse",
                status: "ACTIVE",
              },
              {
                id: accessibleOtherWarehouseId,
                tenantId,
                companyId,
                projectId: accessibleOtherProjectId,
                name: "Synthetic accessible other project warehouse",
                status: "ACTIVE",
              },
              {
                id: hiddenWarehouseId,
                tenantId,
                companyId,
                projectId: hiddenProjectId,
                name: "Synthetic hidden options warehouse",
                status: "ACTIVE",
              },
              {
                id: otherGeneralWarehouseId,
                tenantId,
                companyId: otherCompanyId,
                name: "Synthetic other company general warehouse",
                status: "ACTIVE",
              },
              {
                id: otherSharedWarehouseId,
                tenantId,
                companyId: otherCompanyId,
                projectId,
                name: "Synthetic other company shared worksite warehouse",
                status: "ACTIVE",
              },
              {
                id: inactiveWarehouseId,
                tenantId,
                companyId,
                name: "Synthetic inactive options warehouse",
                status: "INACTIVE",
              },
              {
                id: foreignWarehouseId,
                tenantId: foreignTenantId,
                companyId: foreignCompanyId,
                name: "Synthetic foreign options warehouse",
                status: "ACTIVE",
              },
            ],
          });
          const contractDate = new Date("2026-11-05T00:00:00.000Z");
          await tx.subcontract.createMany({
            data: [
              {
                id: ownSubcontractId,
                tenantId,
                companyId,
                projectId,
                subcontractorContactId: contactId,
                number: 1,
                title: "Synthetic own options subcontract",
                contractDate,
                status: "ACTIVE",
              },
              {
                id: otherSubcontractId,
                tenantId,
                companyId: otherCompanyId,
                projectId,
                subcontractorContactId: otherContactId,
                number: 1,
                title: "Synthetic other company subcontract",
                contractDate,
                status: "ACTIVE",
              },
              {
                id: otherProjectSubcontractId,
                tenantId,
                companyId,
                projectId: accessibleOtherProjectId,
                subcontractorContactId: contactId,
                number: 2,
                title: "Synthetic other project subcontract",
                contractDate,
                status: "ACTIVE",
              },
              {
                id: cancelledSubcontractId,
                tenantId,
                companyId,
                projectId,
                subcontractorContactId: contactId,
                number: 3,
                title: "Synthetic cancelled options subcontract",
                contractDate,
                status: "CANCELLED",
              },
              {
                id: foreignSubcontractId,
                tenantId: foreignTenantId,
                companyId: foreignCompanyId,
                projectId: foreignProjectId,
                subcontractorContactId: foreignContactId,
                number: 1,
                title: "Synthetic foreign options subcontract",
                contractDate,
                status: "ACTIVE",
              },
            ],
          });
        },
        { maxWait: 10_000, timeout: 60_000 },
      );
    });

    after(async () => {
      clearProjectAccessModeCache();
      if (!verified) return;
      try {
        await prisma.$transaction(
          async (tx) => {
            const tenants = { in: [tenantId, foreignTenantId] };
            await tx.subcontract.deleteMany({ where: { tenantId: tenants } });
            await tx.warehouse.deleteMany({ where: { tenantId: tenants } });
            await tx.product.deleteMany({ where: { tenantId: tenants } });
            await tx.projectMembership.deleteMany({ where: { tenantId: tenants } });
            await tx.project.deleteMany({ where: { tenantId: tenants } });
            await tx.contactRole.deleteMany({ where: { tenantId: tenants } });
            await tx.contact.deleteMany({ where: { tenantId: tenants } });
            await tx.userMembership.deleteMany({ where: { tenantId: tenants } });
            await tx.tenantModuleSetting.deleteMany({ where: { tenantId: tenants } });
            await tx.company.deleteMany({ where: { tenantId: tenants } });
            await tx.tenant.deleteMany({ where: { id: tenants } });
            await tx.user.deleteMany({ where: { id: { in: users } } });
          },
          { maxWait: 10_000, timeout: 60_000 },
        );
      } finally {
        await prisma.$disconnect();
      }
    });

    async function withoutInventoryReads<T>(run: () => Promise<T>): Promise<T> {
      const originalProductRead = prisma.product.findMany;
      const originalWarehouseRead = prisma.warehouse.findMany;
      let productReads = 0,
        warehouseReads = 0;
      prisma.product.findMany = (async () => {
        productReads++;
        throw new Error("Inventory products must not be queried");
      }) as typeof prisma.product.findMany;
      prisma.warehouse.findMany = (async () => {
        warehouseReads++;
        throw new Error("Inventory warehouses must not be queried");
      }) as typeof prisma.warehouse.findMany;
      try {
        return await run();
      } finally {
        prisma.product.findMany = originalProductRead;
        prisma.warehouse.findMany = originalWarehouseRead;
        assert.equal(productReads, 0, "Disabled or inaccessible inventory must not query products");
        assert.equal(
          warehouseReads,
          0,
          "Disabled or inaccessible inventory must not query warehouses",
        );
      }
    }

    it("offers own-company and shared active products without another company's or tenant's catalogue", async () => {
      const result = await getJobsiteLogFormPickList(projectId, ctx);
      assert.equal(result.inventoryModuleEnabled, true);
      assert.deepEqual(sortedIds(result.productOptions), [ownProductId, sharedProductId].sort());
    });

    it("offers general and current-worksite warehouses but not another worksite even when it is authorized", async () => {
      const result = await getJobsiteLogFormPickList(projectId, ctx);
      assert.deepEqual(
        sortedIds(result.warehouseOptions),
        [generalWarehouseId, projectWarehouseId].sort(),
      );
      assert.ok(!result.warehouseOptions.some((row) => row.id === accessibleOtherWarehouseId));
    });

    it("rejects an inaccessible project before inventory option queries", async () => {
      await withoutInventoryReads(async () => {
        await assert.rejects(
          getJobsiteLogFormPickList(hiddenProjectId, ctx),
          (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN",
        );
        await assert.rejects(
          getJobsiteLogFormPickList(foreignProjectId, ctx),
          (error: unknown) =>
            error instanceof ServiceError && ["FORBIDDEN", "NOT_FOUND"].includes(error.code),
        );
      });
    });

    it("returns empty inventory options without querying them when the module is disabled", async () => {
      await prisma.tenantModuleSetting.upsert({
        where: { tenantId_moduleKey: { tenantId, moduleKey: "INVENTORY" } },
        create: { tenantId, moduleKey: "INVENTORY", isEnabled: false },
        update: { isEnabled: false },
      });
      try {
        const result = await withoutInventoryReads(() => getJobsiteLogFormPickList(projectId, ctx));
        assert.equal(result.inventoryModuleEnabled, false);
        assert.deepEqual(result.productOptions, []);
        assert.deepEqual(result.warehouseOptions, []);
        assert.ok(result.contactOptions.some((row) => row.id === contactId));
      } finally {
        await prisma.tenantModuleSetting.deleteMany({
          where: { tenantId, moduleKey: "INVENTORY" },
        });
      }
    });

    it("returns empty inventory options without querying them for a project reader without inventory permission", async () => {
      const result = await withoutInventoryReads(() =>
        getJobsiteLogFormPickList(projectId, withoutInventory),
      );
      assert.equal(result.inventoryModuleEnabled, false);
      assert.deepEqual(result.productOptions, []);
      assert.deepEqual(result.warehouseOptions, []);
    });

    it("scopes subcontracts by company and project while retaining the tenant-wide contact directory", async () => {
      const result = await getJobsiteLogFormPickList(projectId, ctx);
      assert.deepEqual(sortedIds(result.subcontractOptions), [ownSubcontractId]);
      assert.deepEqual(sortedIds(result.contactOptions), [contactId, otherContactId].sort());
    });

    it("resolves the sole active company for a global actor on a shared project before selecting inventory", async () => {
      const result = await getJobsiteLogFormPickList(projectId, global);
      assert.equal(result.companyId, companyId);
      assert.deepEqual(sortedIds(result.productOptions), [ownProductId, sharedProductId].sort());
      assert.deepEqual(
        sortedIds(result.warehouseOptions),
        [generalWarehouseId, projectWarehouseId].sort(),
      );
      assert.deepEqual(sortedIds(result.subcontractOptions), [ownSubcontractId]);
    });
  },
);
