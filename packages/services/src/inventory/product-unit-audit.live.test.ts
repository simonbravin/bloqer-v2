/** D130 product-unit policy and first-reference races. No writes before the isolated DB guard. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, describe, it } from "node:test";
import { Prisma, prisma } from "@bloqer/database";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import { createProduct, getProductById, updateProduct } from "./product.service";
import { createPurchaseRequest } from "../procurement/purchase-request.service";
import {
  addCostAnalysisLine,
  updateCostAnalysisLine,
  saveCostItemApu,
} from "../budget/cost-analysis.service";
import {
  createJobsiteLog,
  submitJobsiteLog,
  approveJobsiteLog,
  updateJobsiteLog,
} from "../jobsite-log/jobsite-log.service";
import { getStockBalance } from "./stock-balance.service";

const live = process.env.BLOQER_AUDIT_LIVE === "1";
const conflict = (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe(
  "D130 unit policy and first references on isolated SQL",
  { skip: !live, concurrency: false },
  () => {
    const tenantId = randomUUID(),
      companyId = randomUUID(),
      actorId = randomUUID(),
      contactId = randomUUID();
    const ctx: ServiceContext = { tenantId, companyId, actorUserId: actorId, roles: ["OWNER"] };
    const day = new Date("2026-11-04T00:00:00Z");
    let verified = false,
      sequence = 7000;
    before(async () => {
      await assertAuditDatabaseIdentity(prisma);
      verified = true;
      clearProjectAccessModeCache();
      await prisma.$transaction(
        async (tx) => {
          await tx.tenant.create({
            data: {
              id: tenantId,
              slug: `audit-unit-${tenantId}`,
              name: "Synthetic D130 units",
              projectAccessMode: "MEMBERSHIP_SCOPED",
            },
          });
          await tx.company.create({
            data: { id: companyId, tenantId, name: "Synthetic D130 company" },
          });
          await tx.user.create({
            data: { id: actorId, email: `audit-unit-${actorId}@example.test` },
          });
          await tx.userMembership.create({
            data: { tenantId, companyId, userId: actorId, roles: ["OWNER"] },
          });
          await tx.contact.create({
            data: {
              id: contactId,
              tenantId,
              legalName: "Synthetic D130 counterparty",
              roles: {
                create: [
                  { tenantId, role: "CLIENT" },
                  { tenantId, role: "SUPPLIER" },
                ],
              },
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
            await tx.notification.deleteMany({ where: { tenantId } });
            await tx.stockMovement.deleteMany({ where: { tenantId } });
            await tx.warehouseTransfer.deleteMany({ where: { tenantId } });
            await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { tenantId } } });
            await tx.purchaseOrder.deleteMany({ where: { tenantId } });
            await tx.purchaseRequestLine.deleteMany({ where: { purchaseRequest: { tenantId } } });
            await tx.purchaseRequest.deleteMany({ where: { tenantId } });
            await tx.jobsiteLogMaterialUsage.deleteMany({ where: { jobsiteLog: { tenantId } } });
            await tx.jobsiteLogProgress.deleteMany({ where: { jobsiteLog: { tenantId } } });
            await tx.jobsiteLogLabor.deleteMany({ where: { jobsiteLog: { tenantId } } });
            await tx.jobsiteLogIssue.deleteMany({ where: { jobsiteLog: { tenantId } } });
            await tx.jobsiteLog.deleteMany({ where: { tenantId } });
            await tx.costAnalysisLine.deleteMany({ where: { budget: { tenantId } } });
            await tx.costItem.deleteMany({ where: { budget: { tenantId } } });
            await tx.wbsNode.deleteMany({ where: { budget: { tenantId } } });
            await tx.budgetSettings.deleteMany({ where: { budget: { tenantId } } });
            await tx.budget.deleteMany({ where: { tenantId } });
            await tx.warehouse.deleteMany({ where: { tenantId } });
            await tx.product.deleteMany({ where: { tenantId } });
            await tx.auditLog.deleteMany({ where: { tenantId } });
            await tx.projectMembership.deleteMany({ where: { tenantId } });
            await tx.project.deleteMany({ where: { tenantId } });
            await tx.contactRole.deleteMany({ where: { tenantId } });
            await tx.contact.deleteMany({ where: { tenantId } });
            await tx.userMembership.deleteMany({ where: { tenantId } });
            await tx.tenantModuleSetting.deleteMany({ where: { tenantId } });
            await tx.company.deleteMany({ where: { tenantId } });
            await tx.tenant.delete({ where: { id: tenantId } });
            await tx.user.delete({ where: { id: actorId } });
          },
          { timeout: 60_000 },
        );
      } finally {
        await prisma.$disconnect();
      }
    });
    const freeProduct = (unit = "kg") =>
      createProduct(
        { companyId: null, sku: randomUUID(), name: "Synthetic D130 product", unit },
        ctx,
      );
    async function scope(draft = false) {
      const project = await prisma.project.create({
        data: {
          tenantId,
          companyId: null,
          clientContactId: contactId,
          code: randomUUID(),
          name: "Synthetic D130 project",
          country: "AR",
          status: "ACTIVE",
        },
      });
      const budget = await prisma.budget.create({
        data: {
          tenantId,
          companyId: null,
          projectId: project.id,
          name: "Synthetic D130 budget",
          versionNumber: 1,
          status: draft ? "DRAFT" : "APPROVED",
        },
      });
      await prisma.budgetSettings.create({ data: { budgetId: budget.id } });
      const wbs = await prisma.wbsNode.create({
        data: { budgetId: budget.id, type: "ITEM", code: "1", name: "Synthetic D130 item" },
      });
      const item = await prisma.costItem.create({
        data: { budgetId: budget.id, wbsNodeId: wbs.id, quantity: 10, unit: "kg" },
      });
      const warehouse = await prisma.warehouse.create({
        data: { tenantId, companyId, name: randomUUID() },
      });
      const destination = await prisma.warehouse.create({
        data: { tenantId, companyId, name: randomUUID() },
      });
      clearProjectAccessModeCache();
      return { project, budget, wbs, item, warehouse, destination };
    }
    type Scope = Awaited<ReturnType<typeof scope>>;
    const request = (s: Scope, productId: string, unit = "kg") =>
      createPurchaseRequest(
        {
          projectId: s.project.id,
          neededByDate: "2026-11-20",
          lines: [
            {
              wbsNodeId: s.wbs.id,
              productId,
              description: "Synthetic D130 request",
              unit,
              quantity: "1",
              lineType: "MATERIAL",
              sortOrder: 0,
            },
          ],
        },
        ctx,
      );
    const apu = (s: Scope, productId: string, unit = "kg") =>
      addCostAnalysisLine(
        {
          costItemId: s.item.id,
          category: "MATERIAL",
          description: "Synthetic D130 APU",
          unit,
          coefficient: 1,
          unitCost: 1,
          productId,
        },
        ctx,
      );

    it("D130 changes an unreferenced unit atomically and exposes accurate edit eligibility", async () => {
      const p = await freeProduct();
      assert.equal((await getProductById(p.id, ctx)).canEditUnit, true);
      const changed = await updateProduct(p.id, { unit: "t" }, ctx);
      assert.equal(changed.unit, "t");
      assert.equal(changed.canEditUnit, true);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { tenantId, entityId: p.id, action: "PRODUCT_UPDATED" },
        orderBy: { createdAt: "desc" },
      });
      assert.equal((audit.before as { unit: string }).unit, "kg");
    });

    for (const family of ["request", "order", "apu", "jobsite", "transfer", "movement"] as const) {
      it(`D130 freezes product units for ${family} references including inactive histories`, async () => {
        const s = await scope(),
          p = await freeProduct();
        if (family === "request")
          await prisma.purchaseRequest.create({
            data: {
              tenantId,
              companyId,
              projectId: s.project.id,
              number: ++sequence,
              status: "CANCELLED",
              lines: {
                create: {
                  wbsNodeId: s.wbs.id,
                  productId: p.id,
                  description: "History",
                  unit: "kg",
                  quantity: 1,
                  lineType: "MATERIAL",
                },
              },
            },
          });
        if (family === "order")
          await prisma.purchaseOrder.create({
            data: {
              tenantId,
              companyId,
              projectId: s.project.id,
              supplierContactId: contactId,
              number: ++sequence,
              issueDate: day,
              status: "CANCELLED",
              currency: "ARS",
              fxRate: 1,
              lines: {
                create: {
                  wbsNodeId: s.wbs.id,
                  productId: p.id,
                  description: "History",
                  unit: "kg",
                  quantity: 1,
                  unitPrice: 1,
                  lineSubtotal: 1,
                  lineTotal: 1,
                },
              },
            },
          });
        if (family === "apu")
          await prisma.costAnalysisLine.create({
            data: {
              budgetId: s.budget.id,
              costItemId: s.item.id,
              productId: p.id,
              description: "History",
              category: "MATERIAL",
              unit: "kg",
              coefficient: 1,
              unitCost: 1,
              totalCost: 1,
            },
          });
        if (family === "jobsite")
          await prisma.jobsiteLog.create({
            data: {
              tenantId,
              companyId,
              projectId: s.project.id,
              logDate: day,
              status: "DRAFT",
              materials: { create: { productId: p.id, description: "History", quantity: 1 } },
            },
          });
        if (family === "transfer")
          await prisma.warehouseTransfer.create({
            data: {
              tenantId,
              companyId,
              number: ++sequence,
              sourceWarehouseId: s.warehouse.id,
              destinationWarehouseId: s.destination.id,
              productId: p.id,
              transferDate: day,
              quantity: 1,
              status: "CANCELLED",
            },
          });
        if (family === "movement")
          await prisma.stockMovement.create({
            data: {
              tenantId,
              companyId,
              warehouseId: s.warehouse.id,
              productId: p.id,
              movementDate: day,
              quantity: 1,
              type: "IN",
              sourceType: "OPENING_BALANCE",
              status: "CANCELLED",
            },
          });
        const before = await prisma.auditLog.count({ where: { tenantId, entityId: p.id } });
        assert.equal((await getProductById(p.id, ctx)).canEditUnit, false);
        await assert.rejects(updateProduct(p.id, { unit: "t" }, ctx), conflict);
        assert.equal(await prisma.auditLog.count({ where: { tenantId, entityId: p.id } }), before);
        const renamed = await updateProduct(
          p.id,
          { name: "Allowed correction", unit: " KG " },
          ctx,
        );
        assert.equal(renamed.unit, "kg");
        assert.equal(renamed.name, "Allowed correction");
        assert.equal(renamed.canEditUnit, false);
      });
    }

    it("D130 rejects incompatible or blank new request units without partial documents", async () => {
      const s = await scope(),
        p = await freeProduct();
      const before = await prisma.purchaseRequest.count({
        where: { tenantId, projectId: s.project.id },
      });
      await assert.rejects(request(s, p.id, "t"), conflict);
      await assert.rejects(request(s, p.id, ""), conflict);
      assert.equal(
        await prisma.purchaseRequest.count({ where: { tenantId, projectId: s.project.id } }),
        before,
      );
      const created = await request(s, p.id, " KG ");
      assert.equal(created.lines[0]!.unit, " KG ");
    });

    it("D130 validates APU units and serializes their first reference against unit changes", async () => {
      const s = await scope(true),
        p = await freeProduct();
      await assert.rejects(apu(s, p.id, "t"), conflict);
      assert.equal(await prisma.costAnalysisLine.count({ where: { productId: p.id } }), 0);
      const results = await Promise.allSettled([
        apu(s, p.id),
        updateProduct(p.id, { unit: "t" }, ctx),
      ]);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      const saved = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
      const lines = await prisma.costAnalysisLine.findMany({ where: { productId: p.id } });
      if (lines.length) assert.equal(saved.unit, lines[0]!.unit);
      else assert.equal(saved.unit, "t");
    });

    it("D130 protects a product from its first draft material reference and preserves existing replays", async () => {
      const s = await scope(),
        p = await freeProduct();
      const input = {
        projectId: s.project.id,
        companyId,
        logDate: "2026-11-04",
        title: "Synthetic D130 draft",
        progress: [],
        labor: [],
        issues: [],
        materials: [
          { productId: p.id, description: "Material uses the product unit", quantity: "1" },
        ],
        idempotencyKey: randomUUID(),
      };
      const draft = await createJobsiteLog(input, ctx);
      await assert.rejects(updateProduct(p.id, { unit: "t" }, ctx), conflict);
      await prisma.product.update({ where: { id: p.id }, data: { unit: "" } }); // Synthetic legacy history only.
      assert.equal((await createJobsiteLog(input, ctx)).id, draft.id);
      const blank = await freeProduct();
      await prisma.product.update({ where: { id: blank.id }, data: { unit: "" } });
      await assert.rejects(
        createJobsiteLog(
          {
            ...input,
            idempotencyKey: randomUUID(),
            materials: [
              { productId: blank.id, description: "Blank unit must be fixed first", quantity: "1" },
            ],
          },
          ctx,
        ),
        conflict,
      );
      assert.equal(
        await prisma.jobsiteLogMaterialUsage.count({ where: { productId: blank.id } }),
        0,
      );
    });

    /** Hold an actual service write inside its SQL TX, then observe the competing Product lock attempt. */
    async function interleave(
      firstKind: "request" | "unit",
      first: () => Promise<unknown>,
      second: () => Promise<unknown>,
    ) {
      const original = prisma.$transaction,
        transaction = original.bind(prisma);
      const written = deferred(),
        release = deferred(),
        attempted = deferred();
      let held = false,
        gateOpen = false;
      prisma.$transaction = (async (
        work: (tx: Prisma.TransactionClient) => Promise<unknown>,
        options: object,
      ) =>
        transaction(async (tx) => {
          const proxy = new Proxy(tx, {
            get(target, key) {
              if (key === "$queryRaw")
                return async (sql: TemplateStringsArray, ...values: unknown[]) => {
                  if (
                    gateOpen &&
                    sql.join("").includes("FROM products") &&
                    sql.join("").includes("FOR UPDATE")
                  )
                    attempted.resolve();
                  return target.$queryRaw(sql, ...values);
                };
              if (key === (firstKind === "request" ? "purchaseRequest" : "product"))
                return new Proxy(Reflect.get(target, key), {
                  get(delegate, method) {
                    if (method === (firstKind === "request" ? "create" : "update"))
                      return async (...args: unknown[]) => {
                        const result = await Reflect.apply(
                          Reflect.get(delegate, method),
                          delegate,
                          args,
                        );
                        if (!held) {
                          held = true;
                          gateOpen = true;
                          written.resolve();
                          await release.promise;
                        }
                        return result;
                      };
                    return Reflect.get(delegate, method);
                  },
                });
              return Reflect.get(target, key);
            },
          });
          return work(proxy);
        }, options)) as typeof prisma.$transaction;
      const firstPending = Promise.resolve().then(first);
      let secondPending: Promise<unknown> | undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Expected concurrent unit/reference lock boundary")),
          30_000,
        );
      });
      try {
        await Promise.race([
          written.promise,
          deadline,
          firstPending.then(() => {
            throw new Error("First service did not reach held write");
          }),
        ]);
        secondPending = Promise.resolve().then(second);
        // Attach immediately so a missing lock is an assertion, never an unhandled rejection.
        const secondResult = secondPending.then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
        await Promise.race([
          attempted.promise,
          deadline,
          secondResult.then(() => {
            throw new Error("Competitor did not wait on the product unit lock");
          }),
        ]);
        release.resolve();
        await firstPending;
        const result = await secondResult;
        assert.ok("error" in result);
        assert.ok(conflict(result.error));
      } finally {
        release.resolve();
        if (timeout) clearTimeout(timeout);
        prisma.$transaction = original;
        await Promise.allSettled([firstPending, ...(secondPending ? [secondPending] : [])]);
      }
    }

    it("D130 first request reference holds the unit lock until commit and the concurrent edit then rejects", async () => {
      const s = await scope(),
        p = await freeProduct();
      await interleave(
        "request",
        () => request(s, p.id),
        () => updateProduct(p.id, { unit: "t" }, ctx),
      );
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).unit, "kg");
      assert.equal(await prisma.purchaseRequestLine.count({ where: { productId: p.id } }), 1);
    });
    it("D130 first unit edit holds the lock until commit and a stale-unit request then rejects atomically", async () => {
      const s = await scope(),
        p = await freeProduct();
      await interleave(
        "unit",
        () => updateProduct(p.id, { unit: "t" }, ctx),
        () => request(s, p.id),
      );
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).unit, "t");
      assert.equal(await prisma.purchaseRequestLine.count({ where: { productId: p.id } }), 0);
    });

    it("D130 approves product-unit material consumption exactly once without confusing its WBS unit", async () => {
      const s = await scope(),
        p = await freeProduct();
      // Physical product kilograms can legitimately be consumed against a square-metre WBS item.
      await prisma.costItem.update({ where: { id: s.item.id }, data: { unit: "m2" } });
      await prisma.stockMovement.create({
        data: {
          tenantId,
          companyId,
          warehouseId: s.warehouse.id,
          productId: p.id,
          movementDate: day,
          quantity: "3.0000",
          type: "IN",
          sourceType: "OPENING_BALANCE",
          status: "CONFIRMED",
        },
      });
      const input = {
        projectId: s.project.id,
        companyId,
        logDate: "2026-11-04",
        title: "Synthetic D130 consumption",
        progress: [],
        labor: [],
        issues: [],
        materials: [
          {
            productId: p.id,
            warehouseId: s.warehouse.id,
            wbsNodeId: s.wbs.id,
            description: "Product unit is kg, WBS unit is m2",
            quantity: "1.2500",
          },
        ],
        idempotencyKey: randomUUID(),
      };
      const draft = await createJobsiteLog(input, ctx);
      await submitJobsiteLog(draft.id, ctx);
      const approved = await approveJobsiteLog(draft.id, ctx);
      assert.equal(approved.status, "APPROVED");
      const usage = await prisma.jobsiteLogMaterialUsage.findFirstOrThrow({
        where: { jobsiteLogId: draft.id },
      });
      const movementWhere = {
        tenantId,
        productId: p.id,
        sourceType: "CONSUMPTION" as const,
        sourceId: usage.id,
        status: "CONFIRMED" as const,
      };
      const movement = await prisma.stockMovement.findFirstOrThrow({ where: movementWhere });
      assert.equal(movement.quantity.toString(), "1.25");
      assert.equal(movement.wbsNodeId, s.wbs.id);
      assert.equal(
        (
          await getStockBalance({ tenantId, productId: p.id, warehouseId: s.warehouse.id })
        ).toString(),
        "1.75",
      );
      assert.equal((await createJobsiteLog(input, ctx)).id, draft.id);
      await assert.rejects(approveJobsiteLog(draft.id, ctx), conflict);
      assert.equal(await prisma.stockMovement.count({ where: movementWhere }), 1);
      assert.equal(
        (
          await getStockBalance({ tenantId, productId: p.id, warehouseId: s.warehouse.id })
        ).toString(),
        "1.75",
      );
    });
    it("D130 effective APU units reject omitted-product edits and roll back mixed batch saves", async () => {
      const s = await scope(true),
        p = await freeProduct();
      const original = await apu(s, p.id);
      const auditsBefore = await prisma.auditLog.count({
        where: { tenantId, projectId: s.project.id },
      });
      await assert.rejects(updateCostAnalysisLine(original.id, { unit: "t" }, ctx), conflict);
      assert.equal(
        (await prisma.costAnalysisLine.findUniqueOrThrow({ where: { id: original.id } })).unit,
        "kg",
      );
      await assert.rejects(
        saveCostItemApu(
          {
            costItemId: s.item.id,
            quantity: 20,
            notes: "This header must roll back",
            lines: [
              {
                id: original.id,
                category: "MATERIAL",
                description: "This line must roll back",
                unit: "kg",
                coefficient: 2,
                unitCost: 3,
                totalCost: 6,
              },
              {
                category: "MATERIAL",
                description: "Incompatible later line",
                unit: "t",
                coefficient: 1,
                unitCost: 1,
                totalCost: 1,
                productId: p.id,
              },
            ],
          },
          ctx,
        ),
        conflict,
      );
      const itemAfter = await prisma.costItem.findUniqueOrThrow({ where: { id: s.item.id } });
      assert.equal(itemAfter.quantity.toString(), "10");
      assert.equal(itemAfter.notes, null);
      const linesAfter = await prisma.costAnalysisLine.findMany({
        where: { costItemId: s.item.id },
      });
      assert.equal(linesAfter.length, 1);
      assert.equal(linesAfter[0]!.id, original.id);
      assert.equal(linesAfter[0]!.description, original.description);
      assert.equal(linesAfter[0]!.coefficient.toString(), original.coefficient.toString());
      assert.equal(linesAfter[0]!.unitCost.toString(), original.unitCost.toString());
      assert.equal(
        await prisma.auditLog.count({ where: { tenantId, projectId: s.project.id } }),
        auditsBefore,
      );
    });

    it("D130 draft update protects its first material reference and rejects blank units atomically", async () => {
      const s = await scope(),
        p = await freeProduct(),
        blank = await freeProduct();
      const draft = await createJobsiteLog(
        {
          projectId: s.project.id,
          companyId,
          logDate: "2026-11-04",
          title: "Draft before materials",
          progress: [],
          labor: [],
          materials: [],
          issues: [],
          idempotencyKey: randomUUID(),
        },
        ctx,
      );
      assert.equal((await getProductById(p.id, ctx)).canEditUnit, true);
      await updateJobsiteLog(
        draft.id,
        {
          progress: [],
          labor: [],
          issues: [],
          materials: [{ productId: p.id, description: "First reference via edit", quantity: "1" }],
        },
        ctx,
      );
      await assert.rejects(updateProduct(p.id, { unit: "t" }, ctx), conflict);
      await prisma.product.update({ where: { id: blank.id }, data: { unit: "" } });
      await assert.rejects(
        updateJobsiteLog(
          draft.id,
          {
            title: "Must roll back",
            progress: [],
            labor: [],
            issues: [],
            materials: [
              { productId: blank.id, description: "Blank unit reference", quantity: "1" },
            ],
          },
          ctx,
        ),
        conflict,
      );
      const saved = await prisma.jobsiteLog.findUniqueOrThrow({
        where: { id: draft.id },
        include: { materials: true },
      });
      assert.equal(saved.title, "Draft before materials");
      assert.equal(saved.materials.length, 1);
      assert.equal(saved.materials[0]!.productId, p.id);
      assert.equal(
        await prisma.jobsiteLogMaterialUsage.count({ where: { productId: blank.id } }),
        0,
      );
    });
  },
);
