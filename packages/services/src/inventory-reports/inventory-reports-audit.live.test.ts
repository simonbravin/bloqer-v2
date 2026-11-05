/** Maintained AG-07 report/export/notification/accounting-boundary regressions. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, describe, it } from "node:test";
import { prisma } from "@bloqer/database";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import {
  getStockBalanceReport,
  getStockMovementReport,
  getProductStockDetail,
  getWarehouseStockDetail,
} from "./inventory-reports.service";
import {
  getStockBalanceByWarehouse,
  listNegativeStockBalancesForTenant,
} from "../inventory/stock-balance.service";
import { exportStockMovementsCsv } from "../report-exports/report-export.service";
import { suggestJournalFromStockMovement } from "../accounting/accounting-suggestions.service";
import { getStockMovementById } from "../inventory/stock-movement.service";
import { runNegativeStockAlert } from "../notifications/operational-alerts.service";

const live = process.env.BLOQER_AUDIT_LIVE === "1";
const errorCode =
  (...codes: string[]) =>
  (e: unknown) =>
    e instanceof ServiceError && codes.includes(e.code);

describe(
  "AG-07 inventory reports and connected consumers on isolated SQL",
  { skip: !live, concurrency: false },
  () => {
    const tenantId = randomUUID(),
      otherTenantId = randomUUID();
    const companyId = randomUUID(),
      otherCompanyId = randomUUID(),
      foreignCompanyId = randomUUID();
    const ownerId = randomUUID(),
      otherOwnerId = randomUUID(),
      globalId = randomUUID(),
      viewerId = randomUUID(),
      inactiveId = randomUUID();
    const ids = [ownerId, otherOwnerId, globalId, viewerId, inactiveId];
    const contactId = randomUUID();
    const ctx: ServiceContext = { tenantId, companyId, actorUserId: ownerId, roles: ["OWNER"] };
    const global: ServiceContext = { ...ctx, actorUserId: globalId, companyId: null };
    const viewer: ServiceContext = { ...ctx, actorUserId: viewerId, roles: ["VIEWER"] };
    const day = new Date("2026-11-04T00:00:00Z");
    let verified = false;

    before(async () => {
      await assertAuditDatabaseIdentity(prisma);
      verified = true;
      clearProjectAccessModeCache();
      await prisma.$transaction(
        async (tx) => {
          await tx.tenant.createMany({
            data: [tenantId, otherTenantId].map((id) => ({
              id,
              slug: `audit-ag07-report-${id}`,
              name: "Synthetic AG07 report",
              projectAccessMode: "MEMBERSHIP_SCOPED" as const,
            })),
          });
          await tx.company.createMany({
            data: [
              { id: companyId, tenantId, name: "Synthetic AG07 A" },
              { id: otherCompanyId, tenantId, name: "Synthetic AG07 B" },
              { id: foreignCompanyId, tenantId: otherTenantId, name: "Synthetic AG07 foreign" },
            ],
          });
          await tx.user.createMany({
            data: ids.map((id) => ({
              id,
              email: `ag07-report-${id}@example.test`,
              status: id === inactiveId ? ("INACTIVE" as const) : ("ACTIVE" as const),
            })),
          });
          await tx.userMembership.createMany({
            data: [
              { tenantId, companyId, userId: ownerId, roles: ["OWNER"] },
              { tenantId, companyId: otherCompanyId, userId: otherOwnerId, roles: ["OWNER"] },
              { tenantId, companyId: null, userId: globalId, roles: ["OWNER"] },
              { tenantId, companyId, userId: viewerId, roles: ["VIEWER"] },
              { tenantId, companyId, userId: inactiveId, roles: ["OWNER"] },
            ],
          });
          await tx.contact.create({
            data: {
              id: contactId,
              tenantId,
              legalName: "Synthetic AG07 client",
              roles: { create: { tenantId, role: "CLIENT" } },
            },
          });
        },
        { timeout: 30_000 },
      );
    });

    after(async () => {
      clearProjectAccessModeCache();
      if (!verified) return;
      try {
        await prisma.$transaction(
          async (tx) => {
            const tenants = { in: [tenantId, otherTenantId] };
            await tx.emailDeliveryLog.deleteMany({ where: { tenantId: tenants } });
            await tx.notification.deleteMany({ where: { tenantId: tenants } });
            await tx.stockMovement.deleteMany({ where: { tenantId: tenants } });
            await tx.purchaseReceiptLine.deleteMany({
              where: { purchaseReceipt: { tenantId: tenants } },
            });
            await tx.purchaseReceipt.deleteMany({ where: { tenantId: tenants } });
            await tx.purchaseOrderLine.deleteMany({
              where: { purchaseOrder: { tenantId: tenants } },
            });
            await tx.purchaseOrder.deleteMany({ where: { tenantId: tenants } });
            await tx.warehouseTransfer.deleteMany({ where: { tenantId: tenants } });
            await tx.warehouse.deleteMany({ where: { tenantId: tenants } });
            await tx.product.deleteMany({ where: { tenantId: tenants } });
            await tx.auditLog.deleteMany({ where: { tenantId: tenants } });
            await tx.wbsNode.deleteMany({ where: { budget: { tenantId: tenants } } });
            await tx.budget.deleteMany({ where: { tenantId: tenants } });
            await tx.projectMembership.deleteMany({ where: { tenantId: tenants } });
            await tx.project.deleteMany({ where: { tenantId: tenants } });
            await tx.contactRole.deleteMany({ where: { tenantId: tenants } });
            await tx.contact.deleteMany({ where: { tenantId: tenants } });
            await tx.userMembership.deleteMany({ where: { tenantId: tenants } });
            await tx.tenantModuleSetting.deleteMany({ where: { tenantId: tenants } });
            await tx.company.deleteMany({ where: { tenantId: tenants } });
            await tx.tenant.deleteMany({ where: { id: tenants } });
            await tx.user.deleteMany({ where: { id: { in: ids } } });
          },
          { timeout: 30_000 },
        );
      } finally {
        await prisma.$disconnect();
      }
    });

    async function scope(company = companyId, warehouseProject = false) {
      const project = await prisma.project.create({
        data: {
          tenantId,
          companyId: null,
          clientContactId: contactId,
          name: "Synthetic AG07 project",
          code: randomUUID(),
          country: "AR",
          status: "ACTIVE",
        },
      });
      const product = await prisma.product.create({
        data: {
          tenantId,
          companyId: null,
          name: "Synthetic AG07 product",
          sku: randomUUID(),
          unit: "un",
        },
      });
      const warehouse = await prisma.warehouse.create({
        data: {
          tenantId,
          companyId: company,
          projectId: warehouseProject ? project.id : null,
          name: randomUUID(),
        },
      });
      // A fixture adds projects between calls; a real request receives a fresh context/cache.
      clearProjectAccessModeCache();
      return { project, product, warehouse, company };
    }
    type Scope = Awaited<ReturnType<typeof scope>>;
    async function movement(
      s: Scope,
      quantity: string,
      type: "IN" | "OUT" | "ADJUSTMENT" = "IN",
      projectId: string | null = null,
    ) {
      return prisma.stockMovement.create({
        data: {
          tenantId,
          companyId: s.company,
          productId: s.product.id,
          warehouseId: s.warehouse.id,
          projectId,
          type,
          sourceType:
            type === "OUT"
              ? "CONSUMPTION"
              : type === "ADJUSTMENT"
                ? "ADJUSTMENT"
                : "OPENING_BALANCE",
          movementDate: day,
          quantity,
          unitCost: "50",
          totalCost: "100",
          status: "CONFIRMED",
        },
      });
    }

    it("scopes report filters and direct product/warehouse details to the company while keeping global access", async () => {
      const a = await scope(),
        b = await scope(otherCompanyId);
      await movement(a, "10");
      await movement(b, "20");
      assert.equal(
        (await getStockBalanceReport({ warehouseId: a.warehouse.id }, ctx))[0]!.quantityOnHand,
        "10.0000",
      );
      await assert.rejects(
        getStockBalanceReport({ companyId: otherCompanyId }, ctx),
        errorCode("FORBIDDEN"),
      );
      await assert.rejects(
        getWarehouseStockDetail(b.warehouse.id, {}, ctx),
        errorCode("FORBIDDEN"),
      );
      assert.equal(
        (await getStockBalanceReport({ warehouseId: b.warehouse.id }, global))[0]!.quantityOnHand,
        "20.0000",
      );
      const owned = await prisma.product.create({
        data: { tenantId, companyId: otherCompanyId, sku: randomUUID(), name: "Other company" },
      });
      await assert.rejects(getProductStockDetail(owned.id, {}, ctx), errorCode("FORBIDDEN"));
    });

    it("protects warehouse-linked project data even when the movement project is null", async () => {
      const s = await scope(companyId, true);
      await movement(s, "10");
      assert.equal(
        (await getStockBalanceReport({}, viewer)).some((r) => r.warehouseId === s.warehouse.id),
        false,
      );
      assert.equal(
        (await getStockMovementReport({}, viewer)).some((r) => r.warehouseId === s.warehouse.id),
        false,
      );
      await assert.rejects(
        getWarehouseStockDetail(s.warehouse.id, {}, viewer),
        errorCode("FORBIDDEN", "NOT_FOUND"),
      );
      await prisma.projectMembership.create({
        data: { tenantId, projectId: s.project.id, userId: viewerId },
      });
      clearProjectAccessModeCache();
      assert.equal(
        (await getStockBalanceReport({ warehouseId: s.warehouse.id }, { ...viewer }))[0]!
          .quantityOnHand,
        "10.0000",
      );
    });

    it("rejects contradictory legacy parents before returning labels or a partial stock total", async () => {
      const s = await scope();
      const m = await movement(s, "10");
      const otherProduct = await prisma.product.create({
        data: {
          tenantId,
          companyId: otherCompanyId,
          sku: randomUUID(),
          name: "Private foreign product",
        },
      });
      await prisma.stockMovement.update({
        where: { id: m.id },
        data: { productId: otherProduct.id },
      });
      try {
        await assert.rejects(
          getStockBalanceReport({ warehouseId: s.warehouse.id }, ctx),
          errorCode("FORBIDDEN", "CONFLICT"),
        );
        await assert.rejects(
          getStockMovementReport({ warehouseId: s.warehouse.id }, ctx),
          errorCode("FORBIDDEN", "CONFLICT"),
        );
      } finally {
        await prisma.stockMovement.update({
          where: { id: m.id },
          data: { productId: s.product.id },
        });
      }
    });

    it("validates calendar dates, ranges, enum filters and WBS identifiers at the service boundary", async () => {
      for (const filters of [
        { dateFrom: "2026-02-30" },
        { dateFrom: "2026-11-05", dateTo: "2026-11-04" },
        { movementType: "bogus" },
        { sourceType: "bogus" },
        { wbsNodeId: "not-a-uuid" },
      ]) {
        await assert.rejects(getStockMovementReport(filters, ctx), errorCode("VALIDATION"));
      }
    });

    it("uses one physical balance per product and warehouse across corporate entries and project consumption", async () => {
      const s = await scope();
      await movement(s, "10");
      await movement(s, "3", "OUT", s.project.id);
      assert.equal(
        (await getStockBalanceReport({ warehouseId: s.warehouse.id }, ctx))[0]!.quantityOnHand,
        "7.0000",
      );
      const details = await getStockBalanceByWarehouse({ tenantId, warehouseId: s.warehouse.id });
      assert.equal(details.length, 1);
      assert.equal(details[0]!.totalQuantity, "7.0000");
      assert.equal(
        (await listNegativeStockBalancesForTenant({ tenantId })).some(
          (r) => r.warehouseId === s.warehouse.id,
        ),
        false,
      );
      assert.equal(
        (await getStockBalanceReport({ warehouseId: s.warehouse.id }, viewer))[0]!.quantityOnHand,
        "7.0000",
      );
      assert.equal(
        (await getStockMovementReport({ warehouseId: s.warehouse.id }, viewer)).some(
          (row) => row.projectId === s.project.id,
        ),
        false,
      );
    });

    it("retains nominal amounts without assuming a currency and exposes unknown adjustment direction in CSV", async () => {
      const s = await scope();
      await movement(s, "10");
      const adjustment = await movement(s, "2", "ADJUSTMENT");
      const rows = await getStockMovementReport({ warehouseId: s.warehouse.id }, ctx);
      assert.equal(rows[0]!.costCurrency, null);
      assert.ok(rows[0]!.costWarning);
      assert.equal(rows.find((r) => r.id === adjustment.id)!.signedQuantity, null);
      const csv = await exportStockMovementsCsv({ warehouseId: s.warehouse.id }, ctx);
      assert.match(csv.content, /MonedaCosto/);
      assert.match(csv.content, /Sin valuación comparable/);
      assert.equal(
        (await getStockBalanceReport({ warehouseId: s.warehouse.id }, ctx))[0]!.quantityOnHand,
        "10.0000",
      );
    });

    it("does not create a journal from an unvalued consumption even when a nominal legacy price exists", async () => {
      const s = await scope();
      const m = await movement(s, "2", "OUT", s.project.id);
      await assert.rejects(
        suggestJournalFromStockMovement(m.id, ctx),
        (e: unknown) => errorCode("CONFLICT")(e) && (e as Error).message.includes("Sin valuación"),
      );
      assert.equal(await prisma.journalEntry.count({ where: { tenantId, sourceId: m.id } }), 0);
      await prisma.stockMovement.update({ where: { id: m.id }, data: { status: "CANCELLED" } });
    });

    it("preserves a receipt cost in its proven PO currency without treating it as ARS or consumption valuation", async () => {
      const s = await scope();
      const budget = await prisma.budget.create({
        data: {
          tenantId,
          companyId: null,
          projectId: s.project.id,
          name: "Synthetic AG07 budget",
          versionNumber: 1,
          currency: "USD",
          status: "APPROVED",
        },
      });
      const node = await prisma.wbsNode.create({
        data: { budgetId: budget.id, code: "1", name: "Synthetic AG07 node", type: "ITEM" },
      });
      const order = await prisma.purchaseOrder.create({
        data: {
          tenantId,
          companyId,
          projectId: s.project.id,
          supplierContactId: contactId,
          number: 7001,
          issueDate: day,
          currency: "USD",
          fxRate: 1200,
          subtotal: 50,
          totalAmount: 50,
          totalAmountArs: 60000,
          status: "PARTIALLY_RECEIVED",
          lines: {
            create: {
              wbsNodeId: node.id,
              productId: s.product.id,
              description: "Synthetic AG07 foreign material",
              unit: "un",
              quantity: 5,
              unitPrice: 10,
              lineSubtotal: 50,
              lineTotal: 50,
              receivedQuantity: 2,
            },
          },
        },
        include: { lines: true },
      });
      const receipt = await prisma.purchaseReceipt.create({
        data: {
          tenantId,
          companyId,
          projectId: s.project.id,
          purchaseOrderId: order.id,
          supplierContactId: contactId,
          warehouseId: s.warehouse.id,
          receiptDate: day,
          status: "CONFIRMED",
          lines: { create: { purchaseOrderLineId: order.lines[0]!.id, quantityReceived: 2 } },
        },
        include: { lines: true },
      });
      const m = await prisma.stockMovement.create({
        data: {
          tenantId,
          companyId,
          projectId: s.project.id,
          wbsNodeId: node.id,
          warehouseId: s.warehouse.id,
          productId: s.product.id,
          purchaseReceiptId: receipt.id,
          purchaseReceiptLineId: receipt.lines[0]!.id,
          type: "IN",
          sourceType: "PURCHASE_RECEIPT",
          movementDate: day,
          quantity: 2,
          unitCost: 10,
          totalCost: 20,
        },
      });
      const rows = await getStockMovementReport({ warehouseId: s.warehouse.id }, ctx);
      assert.equal(rows[0]!.costCurrency, "USD");
      assert.equal(rows[0]!.costWarning, null);
    const detail = await getStockMovementById(m.id, ctx);
    assert.equal(detail.costCurrency, "USD");
    assert.equal(detail.costWarning, null);
      assert.equal(rows[0]!.totalCost, "20.00");
      await prisma.stockMovement.update({ where: { id: m.id }, data: { totalCost: 900 } });
      const changed = await getStockMovementReport({ warehouseId: s.warehouse.id }, ctx);
      assert.equal(changed[0]!.costCurrency, null);
      assert.ok(changed[0]!.costWarning);
    const changedDetail = await getStockMovementById(m.id, ctx);
    assert.equal(changedDetail.costCurrency, null);
    assert.ok(changedDetail.costWarning);
    });

    it("routes real physical negative-stock alerts only to active own-company or global recipients", async () => {
      const s = await scope();
      await movement(s, "2", "OUT");
      await runNegativeStockAlert(ctx);
      const rows = await prisma.notification.findMany({
        where: {
          tenantId,
          type: "NEGATIVE_STOCK",
          metadata: { path: ["warehouseId"], equals: s.warehouse.id },
        },
      });
      const recipients = rows.map((r) => r.recipientUserId);
      assert.ok(recipients.includes(ownerId));
      assert.ok(recipients.includes(globalId));
      assert.equal(recipients.includes(otherOwnerId), false);
      assert.equal(recipients.includes(inactiveId), false);
      assert.ok(rows.every((r) => r.companyId === companyId));
    });
  },
);
