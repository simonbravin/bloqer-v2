/** Maintained AG-07 integrations; writes are guarded and confined to an isolated audit database. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Prisma, prisma } from "@bloqer/database";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import {
  createProduct,
  getProductById,
  listProducts,
  updateProduct,
  deactivateProduct,
  reactivateProduct,
} from "./product.service";
import {
  createWarehouse,
  getWarehouseById,
  listWarehouses,
  updateWarehouse,
  deactivateWarehouse,
  reactivateWarehouse,
  listInventoryConsumptionWarehouses,
} from "./warehouse.service";
import {
  createStockConsumption,
  getStockMovementById,
  listStockMovements,
  listInventoryConsumptionWbsOptions,
} from "./stock-movement.service";
import {
  createWarehouseTransfer,
  cancelWarehouseTransfer,
  getWarehouseTransferById,
  listWarehouseTransfers,
  getSourceStockPreview,
} from "./warehouse-transfer.service";
import { getStockBalance } from "./stock-balance.service";

const live = process.env.BLOQER_AUDIT_LIVE === "1";
const codeIs =
  (...codes: string[]) =>
  (e: unknown) =>
    e instanceof ServiceError && codes.includes(e.code);
describe(
  "AG-07 inventory operational contracts on isolated SQL",
  { skip: !live, concurrency: false },
  () => {
    const tenantId = randomUUID(),
      foreignTenant = randomUUID(),
      companyId = randomUUID(),
      otherCompany = randomUUID(),
      foreignCompany = randomUUID(),
      ownerId = randomUUID(),
      warehouseId = randomUUID(),
      viewerId = randomUUID(),
      contactId = randomUUID();
    const users = [ownerId, warehouseId, viewerId];
    const ctx: ServiceContext = { tenantId, companyId, actorUserId: ownerId, roles: ["OWNER"] };
    const global: ServiceContext = { ...ctx, companyId: null };
    const warehouseCtx: ServiceContext = { ...ctx, actorUserId: warehouseId, roles: ["WAREHOUSE"] };
    const viewer: ServiceContext = { ...ctx, actorUserId: viewerId, roles: ["VIEWER"] };
    const day = "2026-11-04";
    let verified = false;
    before(async () => {
      await assertAuditDatabaseIdentity(prisma);
      verified = true;
      clearProjectAccessModeCache();
      await prisma.$transaction(
        async (tx) => {
          await tx.tenant.createMany({
            data: [tenantId, foreignTenant].map((id) => ({
              id,
              slug: "ag07-stock-" + id,
              name: "Synthetic inventory audit",
              projectAccessMode: "MEMBERSHIP_SCOPED" as const,
            })),
          });
          await tx.company.createMany({
            data: [
              { id: companyId, tenantId, name: "Synthetic inventory A" },
              { id: otherCompany, tenantId, name: "Synthetic inventory B" },
              { id: foreignCompany, tenantId: foreignTenant, name: "Synthetic foreign" },
            ],
          });
          await tx.user.createMany({
            data: users.map((id) => ({ id, email: "ag07-stock-" + id + "@example.test" })),
          });
          await tx.userMembership.createMany({
            data: [
              { tenantId, companyId, userId: ownerId, roles: ["OWNER"] },
              { tenantId, companyId, userId: warehouseId, roles: ["WAREHOUSE"] },
              { tenantId, companyId, userId: viewerId, roles: ["VIEWER"] },
            ],
          });
          await tx.contact.create({
            data: { id: contactId, tenantId, legalName: "Synthetic inventory client" },
          });
        },
        { timeout: 30000 },
      );
    });
    after(async () => {
      clearProjectAccessModeCache();
      if (!verified) return;
      try {
        await prisma.$transaction(
          async (tx) => {
            const tenants = { in: [tenantId, foreignTenant] };
            await tx.stockMovement.deleteMany({ where: { tenantId: tenants } });
            await tx.warehouseTransfer.deleteMany({ where: { tenantId: tenants } });
            await tx.warehouse.deleteMany({ where: { tenantId: tenants } });
            await tx.product.deleteMany({ where: { tenantId: tenants } });
            await tx.wbsNode.deleteMany({ where: { budget: { tenantId: tenants } } });
            await tx.budget.deleteMany({ where: { tenantId: tenants } });
            await tx.auditLog.deleteMany({ where: { tenantId: tenants } });
            await tx.projectMembership.deleteMany({ where: { tenantId: tenants } });
            await tx.project.deleteMany({ where: { tenantId: tenants } });
            await tx.contact.deleteMany({ where: { tenantId: tenants } });
            await tx.userMembership.deleteMany({ where: { tenantId: tenants } });
            await tx.tenantModuleSetting.deleteMany({ where: { tenantId: tenants } });
            await tx.company.deleteMany({ where: { tenantId: tenants } });
            await tx.tenant.deleteMany({ where: { id: tenants } });
            await tx.user.deleteMany({ where: { id: { in: users } } });
          },
          { timeout: 30000 },
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
          name: "Synthetic inventory project",
          code: randomUUID(),
          country: "AR",
          status: "ACTIVE",
        },
      });
      const budget = await prisma.budget.create({
        data: {
          tenantId,
          companyId: null,
          projectId: project.id,
          versionNumber: 1,
          name: "Shared approved baseline",
          status: "APPROVED",
        },
      });
      const wbs = await prisma.wbsNode.create({
        data: { budgetId: budget.id, type: "ITEM", code: "1", name: "Synthetic item" },
      });
      const product = await prisma.product.create({
        data: {
          tenantId,
          companyId: null,
          sku: randomUUID(),
          name: "Synthetic material",
          unit: "un",
        },
      });
      const wh = await prisma.warehouse.create({
        data: {
          tenantId,
          companyId: company,
          projectId: warehouseProject ? project.id : null,
          name: randomUUID(),
        },
      });
      const dst = await prisma.warehouse.create({
        data: { tenantId, companyId: company, name: randomUUID() },
      });
      await prisma.stockMovement.create({
        data: {
          tenantId,
          companyId: company,
          warehouseId: wh.id,
          productId: product.id,
          type: "IN",
          sourceType: "OPENING_BALANCE",
          quantity: "10",
          movementDate: new Date(day),
        },
      });
      clearProjectAccessModeCache();
      return { project, budget, wbs, product, wh, dst, company };
    }
    type Scope = Awaited<ReturnType<typeof scope>>;
    const consume = (s: Scope, quantity = "1") => ({
      projectId: s.project.id,
      wbsNodeId: s.wbs.id,
      warehouseId: s.wh.id,
      productId: s.product.id,
      quantity,
      movementDate: day,
      idempotencyKey: randomUUID(),
    });
    const transfer = (s: Scope, quantity = "1") => ({
      projectId: s.project.id,
      sourceWarehouseId: s.wh.id,
      destinationWarehouseId: s.dst.id,
      productId: s.product.id,
      quantity,
      transferDate: day,
      idempotencyKey: randomUUID(),
    });
    async function failAudit(work: () => Promise<unknown>) {
      const original = prisma.$transaction,
        transaction = original.bind(prisma);
      prisma.$transaction = (async (
        fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
        options: object,
      ) =>
        transaction(async (tx) => {
          const delegate = new Proxy(tx.auditLog, {
            get(target, key) {
              return key === "create"
                ? async () => {
                    throw new Error("synthetic audit failure");
                  }
                : Reflect.get(target, key);
            },
          });
          return fn(
            new Proxy(tx, {
              get(target, key) {
                return key === "auditLog" ? delegate : Reflect.get(target, key);
              },
            }),
          );
        }, options)) as typeof prisma.$transaction;
      try {
        await assert.rejects(work, /synthetic audit failure/);
      } finally {
        prisma.$transaction = original;
      }
    }
    it("isolates products and warehouse catalogues by company and retains shared products and global access", async () => {
      const s = await scope(otherCompany);
      const privateProduct = await prisma.product.create({
        data: { tenantId, companyId: otherCompany, sku: randomUUID(), name: "Private B" },
      });
      assert.equal(
        (await listProducts({}, ctx)).data.some((p) => p.id === privateProduct.id),
        false,
      );
      assert.equal(
        (await listProducts({}, ctx)).data.some((p) => p.id === s.product.id),
        true,
      );
      assert.equal(
        (await listProducts({}, global)).data.some((p) => p.id === privateProduct.id),
        true,
      );
      assert.equal(
        (await listWarehouses({}, ctx)).some((w) => w.id === s.wh.id),
        false,
      );
      await assert.rejects(getProductById(privateProduct.id, ctx), codeIs("FORBIDDEN"));
      await assert.rejects(getWarehouseById(s.wh.id, ctx), codeIs("FORBIDDEN"));
      await assert.rejects(listProducts({ companyId: otherCompany }, ctx), codeIs("FORBIDDEN"));
      await assert.rejects(listWarehouses({ companyId: otherCompany }, ctx), codeIs("FORBIDDEN"));
    });
    it("rejects catalogue writes into another company and foreign-tenant parent companies", async () => {
      await assert.rejects(
        createProduct(
          { companyId: otherCompany, sku: randomUUID(), name: "Invalid", unit: "" },
          ctx,
        ),
        codeIs("FORBIDDEN"),
      );
      await assert.rejects(
        createWarehouse({ companyId: otherCompany, name: "Invalid", type: "CENTRAL" }, ctx),
        codeIs("FORBIDDEN"),
      );
      await assert.rejects(
        createProduct(
          { companyId: foreignCompany, sku: randomUUID(), name: "Invalid", unit: "" },
          global,
        ),
        codeIs("NOT_FOUND"),
      );
    });
    it("keeps product optional fields explicitly clearable and audits lifecycle changes atomically", async () => {
      const p = await createProduct(
        {
          companyId,
          sku: randomUUID(),
          name: " Editable ",
          unit: "un",
          notes: "before",
          category: "before",
          description: "before",
        },
        ctx,
      );
      assert.equal(p.name, "Editable");
      const changed = await updateProduct(
        p.id,
        { notes: null, category: null, description: null },
        ctx,
      );
      assert.equal(changed.notes, null);
      assert.equal(changed.category, null);
      assert.equal(changed.description, null);
      assert.equal((await deactivateProduct(p.id, ctx)).status, "INACTIVE");
      assert.equal((await reactivateProduct(p.id, ctx)).status, "ACTIVE");
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { tenantId, entityId: p.id, action: "PRODUCT_UPDATED" },
      });
      assert.equal(audit.companyId, companyId);
    });
    it("serializes shared-product SKU creation despite PostgreSQL nullable unique semantics", async () => {
      const sku = randomUUID();
      const results = await Promise.allSettled([
        createProduct({ companyId: null, sku, name: "First", unit: "un" }, ctx),
        createProduct({ companyId: null, sku, name: "Second", unit: "un" }, ctx),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(await prisma.product.count({ where: { tenantId, companyId: null, sku } }), 1);
    });
    it("serializes warehouse names across simultaneous creates and rejects duplicate rename", async () => {
      const name = randomUUID();
      const results = await Promise.allSettled([
        createWarehouse({ companyId, name, type: "CENTRAL" }, ctx),
        createWarehouse({ companyId, name, type: "CENTRAL" }, ctx),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const other = await createWarehouse({ companyId, name: randomUUID(), type: "OTHER" }, ctx);
      await assert.rejects(updateWarehouse(other.id, { name }, ctx), codeIs("CONFLICT"));
      const edited = await updateWarehouse(other.id, { address: null, notes: null }, ctx);
      assert.equal(edited.address, null);
      await prisma.warehouse.update({ where: { id: other.id }, data: { status: "CLOSED" } });
      assert.equal((await getWarehouseById(other.id, ctx)).status, "CLOSED");
      await assert.rejects(
        updateWarehouse(other.id, { name: "closed rename" }, ctx),
        codeIs("CONFLICT"),
      );
      await assert.rejects(reactivateWarehouse(other.id, ctx), codeIs("CONFLICT"));
    });
    it("enforces project ACL on warehouse reads edits lifecycle and selection without hiding general warehouses", async () => {
      const s = await scope(companyId, true);
      await assert.rejects(getWarehouseById(s.wh.id, warehouseCtx), codeIs("FORBIDDEN"));
      await assert.rejects(
        updateWarehouse(s.wh.id, { name: randomUUID() }, warehouseCtx),
        codeIs("FORBIDDEN"),
      );
      await assert.rejects(deactivateWarehouse(s.wh.id, warehouseCtx), codeIs("FORBIDDEN"));
      assert.equal(
        (await listWarehouses({}, warehouseCtx)).some((w) => w.id === s.wh.id),
        false,
      );
      await prisma.projectMembership.create({
        data: { tenantId, projectId: s.project.id, userId: warehouseId },
      });
      clearProjectAccessModeCache();
      const options = await listInventoryConsumptionWarehouses(s.project.id, { ...warehouseCtx });
      assert.ok(options.some((w) => w.id === s.wh.id));
      assert.ok(options.some((w) => w.id === s.dst.id));
      assert.equal((await deactivateWarehouse(s.wh.id, ctx)).status, "INACTIVE");
      assert.equal((await reactivateWarehouse(s.wh.id, ctx)).status, "ACTIVE");
    });
    it("rolls product and warehouse mutation back if audit insertion fails", async () => {
      const s = await scope();
      await failAudit(() => updateProduct(s.product.id, { name: "must rollback" }, ctx));
      assert.equal(
        (await prisma.product.findUniqueOrThrow({ where: { id: s.product.id } })).name,
        s.product.name,
      );
      await failAudit(() => deactivateWarehouse(s.wh.id, ctx));
      assert.equal(
        (await prisma.warehouse.findUniqueOrThrow({ where: { id: s.wh.id } })).status,
        "ACTIVE",
      );
    });
    it("blocks read-only roles and disabled inventory before mutation", async () => {
      const s = await scope();
      await assert.rejects(createStockConsumption(consume(s), viewer), codeIs("FORBIDDEN"));
      await prisma.tenantModuleSetting.create({
        data: { tenantId, moduleKey: "INVENTORY", isEnabled: false },
      });
      try {
        await assert.rejects(createStockConsumption(consume(s), ctx), codeIs("FORBIDDEN"));
      } finally {
        await prisma.tenantModuleSetting.deleteMany({
          where: { tenantId, moduleKey: "INVENTORY" },
        });
      }
    });
    it("rejects another company's warehouse or product before creating consumption", async () => {
      const s = await scope(),
        b = await scope(otherCompany);
      await assert.rejects(
        createStockConsumption({ ...consume(s), warehouseId: b.wh.id }, ctx),
        codeIs("FORBIDDEN"),
      );
      const foreign = await prisma.product.create({
        data: {
          tenantId,
          companyId: otherCompany,
          sku: randomUUID(),
          name: "Other company product",
        },
      });
      await assert.rejects(
        createStockConsumption({ ...consume(s), productId: foreign.id }, ctx),
        codeIs("FORBIDDEN"),
      );
    });
    it("accepts a shared-company baseline but rejects a conflicting WBS company on the same shared project", async () => {
      const s = await scope();
      const m = await createStockConsumption(consume(s), ctx);
      assert.equal(m.wbsNodeId, s.wbs.id);
      assert.equal(m.quantity, "1.0000");
      assert.equal(m.costCurrency, null);
      assert.equal(m.canGenerateAccountingDraft, false);
      await prisma.budget.update({ where: { id: s.budget.id }, data: { companyId: otherCompany } });
      try {
        await assert.rejects(createStockConsumption(consume(s), ctx), codeIs("CONFLICT"));
      } finally {
        await prisma.budget.update({ where: { id: s.budget.id }, data: { companyId: null } });
      }
    });
    it("rejects paused projects and invalid calendar input without stock effects", async () => {
      const s = await scope();
      await prisma.project.update({ where: { id: s.project.id }, data: { status: "ON_HOLD" } });
      await assert.rejects(createStockConsumption(consume(s), ctx), codeIs("CONFLICT"));
      await assert.rejects(
        createStockConsumption({ ...consume(s), movementDate: "2026-02-30" }, ctx),
        codeIs("VALIDATION"),
      );
      assert.equal(
        (
          await getStockBalance({ tenantId, warehouseId: s.wh.id, productId: s.product.id })
        ).toFixed(4),
        "10.0000",
      );
    });
    it("serializes concurrent consumption against the same physical stock key", async () => {
      const s = await scope();
      const rs = await Promise.allSettled([
        createStockConsumption(consume(s, "6"), ctx),
        createStockConsumption(consume(s, "6"), ctx),
      ]);
      assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        (
          await getStockBalance({ tenantId, warehouseId: s.wh.id, productId: s.product.id })
        ).toFixed(4),
        "4.0000",
      );
    });
    it("replays identical consumption once and rejects changed notes for the same idempotency intent", async () => {
      const s = await scope(),
        input = { ...consume(s), notes: "intent A" };
      const [a, b] = await Promise.all([
        createStockConsumption(input, ctx),
        createStockConsumption(input, ctx),
      ]);
      assert.equal(a.id, b.id);
      assert.equal(
        await prisma.auditLog.count({
          where: { tenantId, entityId: a.id, action: "STOCK_CONSUMPTION_CREATED" },
        }),
        1,
      );
      await assert.rejects(
        createStockConsumption({ ...input, notes: "different" }, ctx),
        codeIs("CONFLICT"),
      );
      assert.equal((await getStockMovementById(a.id, ctx)).productUnit, "un");
    });
    it("rolls stock consumption back atomically when audit insertion fails", async () => {
      const s = await scope(),
        input = consume(s);
      await failAudit(() => createStockConsumption(input, ctx));
      assert.equal(
        await prisma.stockMovement.count({
          where: { tenantId, idempotencyKey: input.idempotencyKey },
        }),
        0,
      );
      assert.equal(
        (
          await getStockBalance({ tenantId, warehouseId: s.wh.id, productId: s.product.id })
        ).toFixed(4),
        "10.0000",
      );
    });
    it("hides inaccessible project movements and WBS options while allowing an assigned warehouse operator", async () => {
      const s = await scope(companyId, true),
        m = await createStockConsumption(consume(s), ctx);
      await assert.rejects(getStockMovementById(m.id, warehouseCtx), codeIs("FORBIDDEN"));
      assert.equal(
        (await listStockMovements({}, warehouseCtx)).some((r) => r.id === m.id),
        false,
      );
      await assert.rejects(
        listInventoryConsumptionWbsOptions(s.project.id, warehouseCtx),
        codeIs("FORBIDDEN"),
      );
      await prisma.projectMembership.create({
        data: { tenantId, projectId: s.project.id, userId: warehouseId },
      });
      clearProjectAccessModeCache();
      assert.ok(
        (await listInventoryConsumptionWbsOptions(s.project.id, { ...warehouseCtx })).some(
          (r) => r.id === s.wbs.id,
        ),
      );
    });
    it("rejects contradictory legacy movement parents before exposing their names or available stock", async () => {
      const s = await scope(),
        m = await createStockConsumption(consume(s), ctx);
      const p = await prisma.product.create({
        data: { tenantId, companyId: otherCompany, sku: randomUUID(), name: "Private name" },
      });
      await prisma.stockMovement.update({ where: { id: m.id }, data: { productId: p.id } });
      try {
        await assert.rejects(getStockMovementById(m.id, ctx), codeIs("FORBIDDEN", "CONFLICT"));
        await assert.rejects(
          getStockBalance({ tenantId, warehouseId: s.wh.id, productId: p.id }),
          codeIs("CONFLICT"),
        );
      } finally {
        await prisma.stockMovement.update({
          where: { id: m.id },
          data: { productId: s.product.id },
        });
      }
    });
    it("protects transfer preview and creation from cross-company and inaccessible project parents", async () => {
      const s = await scope(),
        b = await scope(otherCompany);
      await assert.rejects(getSourceStockPreview(b.wh.id, b.product.id, ctx), codeIs("FORBIDDEN"));
      await assert.rejects(
        createWarehouseTransfer({ ...transfer(s), destinationWarehouseId: b.dst.id }, ctx),
        codeIs("FORBIDDEN"),
      );
      await assert.rejects(createWarehouseTransfer(transfer(s), warehouseCtx), codeIs("FORBIDDEN"));
    });
    it("creates exactly two coherent transfer legs and replays without duplicate number audit or stock", async () => {
      const s = await scope(),
        // A dot followed by three digits is grouped thousands in es-AR input.
        // Four places represent the canonical decimal unit price unambiguously.
        input = { ...transfer(s, "2"), unitCost: "1.2550", notes: "intent" };
      const [a, b] = await Promise.all([
        createWarehouseTransfer(input, ctx),
        createWarehouseTransfer(input, ctx),
      ]);
      assert.equal(a.id, b.id);
      assert.equal(a.stockMovements.length, 2);
      assert.equal(a.unitCost, "1.2550");
      assert.equal(a.totalCost, "2.51");
      assert.equal(
        await prisma.auditLog.count({
          where: { tenantId, entityId: a.id, action: "warehouse_transfer.created" },
        }),
        1,
      );
      await assert.rejects(
        createWarehouseTransfer({ ...input, unitCost: "2" }, ctx),
        codeIs("CONFLICT"),
      );
      await assert.rejects(
        createWarehouseTransfer({ ...input, notes: "changed" }, ctx),
        codeIs("CONFLICT"),
      );
    });
    it("allocates company-wide transfer numbers for simultaneous different warehouse sources", async () => {
      const a = await scope(),
        b = await scope();
      const rs = await Promise.all([
        createWarehouseTransfer(transfer(a), ctx),
        createWarehouseTransfer(transfer(b), ctx),
      ]);
      assert.notEqual(rs[0]!.number, rs[1]!.number);
    });
    it("handles inverse transfers through canonical key ordering without a deadlock", async () => {
      const s = await scope();
      await prisma.stockMovement.create({
        data: {
          tenantId,
          companyId,
          warehouseId: s.dst.id,
          productId: s.product.id,
          type: "IN",
          sourceType: "OPENING_BALANCE",
          quantity: "10",
          movementDate: new Date(day),
        },
      });
      await Promise.all([
        createWarehouseTransfer(transfer(s), ctx),
        createWarehouseTransfer(
          { ...transfer(s), sourceWarehouseId: s.dst.id, destinationWarehouseId: s.wh.id },
          ctx,
        ),
      ]);
      assert.equal(await getSourceStockPreview(s.wh.id, s.product.id, ctx), "10.0000");
      assert.equal(await getSourceStockPreview(s.dst.id, s.product.id, ctx), "10.0000");
    });
    it("keeps transfers read-only when any warehouse-linked project is paused even if document project is null", async () => {
      const s = await scope(companyId, true);
      await prisma.project.update({ where: { id: s.project.id }, data: { status: "ON_HOLD" } });
      await assert.rejects(
        createWarehouseTransfer({ ...transfer(s), projectId: null }, ctx),
        codeIs("CONFLICT"),
      );
    });
    it("cancels a transfer once and restores both physical stocks without deleting movements", async () => {
      const s = await scope(),
        t = await createWarehouseTransfer(transfer(s, "3"), ctx);
      const results = await Promise.allSettled([
        cancelWarehouseTransfer(t.id, ctx),
        cancelWarehouseTransfer(t.id, ctx),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(await getSourceStockPreview(s.wh.id, s.product.id, ctx), "10.0000");
      assert.equal(await getSourceStockPreview(s.dst.id, s.product.id, ctx), "0.0000");
      assert.equal(
        (await getWarehouseTransferById(t.id, ctx)).stockMovements.filter(
          (m) => m.status === "CANCELLED",
        ).length,
        2,
      );
    });
    it("blocks transfer cancellation after destination consumption and leaves both original legs confirmed", async () => {
      const s = await scope(),
        t = await createWarehouseTransfer(transfer(s, "3"), ctx);
      await createStockConsumption({ ...consume(s), warehouseId: s.dst.id, quantity: "2" }, ctx);
      await assert.rejects(cancelWarehouseTransfer(t.id, ctx), codeIs("CONFLICT"));
      assert.equal((await getWarehouseTransferById(t.id, ctx)).status, "CONFIRMED");
    });
    it("rolls the transfer pair and header back when creation audit fails", async () => {
      const s = await scope(),
        input = transfer(s);
      await failAudit(() => createWarehouseTransfer(input, ctx));
      assert.equal(
        await prisma.warehouseTransfer.count({
          where: { tenantId, idempotencyKey: input.idempotencyKey },
        }),
        0,
      );
      assert.equal(await getSourceStockPreview(s.wh.id, s.product.id, ctx), "10.0000");
    });
    it("rolls transfer cancellation back when audit fails and never touches a foreign-tenant linked leg", async () => {
      const s = await scope(),
        t = await createWarehouseTransfer(transfer(s), ctx);
      await failAudit(() => cancelWarehouseTransfer(t.id, ctx));
      assert.equal((await getWarehouseTransferById(t.id, ctx)).status, "CONFIRMED");
      const leg = t.stockMovements[0]!;
      await prisma.stockMovement.update({
        where: { id: leg.id },
        data: { tenantId: foreignTenant },
      });
      try {
        await assert.rejects(
          cancelWarehouseTransfer(t.id, ctx),
          codeIs("CONFLICT", "FORBIDDEN", "NOT_FOUND"),
        );
        assert.equal(
          (await prisma.stockMovement.findUniqueOrThrow({ where: { id: leg.id } })).status,
          "CONFIRMED",
        );
      } finally {
        await prisma.stockMovement.update({ where: { id: leg.id }, data: { tenantId } });
      }
    });
    it("scopes transfer lists to company and every linked warehouse project ACL", async () => {
      const s = await scope(companyId, true),
        t = await createWarehouseTransfer({ ...transfer(s), projectId: null }, ctx);
      assert.equal(
        (await listWarehouseTransfers({}, warehouseCtx)).some((r) => r.id === t.id),
        false,
      );
      await assert.rejects(getWarehouseTransferById(t.id, warehouseCtx), codeIs("FORBIDDEN"));
    });
  },
);
