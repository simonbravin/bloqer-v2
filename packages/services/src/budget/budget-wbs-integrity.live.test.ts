/** Maintained SQL verification of the WBS/APU graph and batched import. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { after, before, describe, it, type TestContext } from "node:test";
import { prisma, type Prisma } from "@bloqer/database";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import { createBudget } from "./budget.service";
import { addWbsNode, ensureWbsLeafForApu, removeWbsNode, reorderWbsNodes, updateWbsNode } from "./wbs.service";
import { executeImport } from "./budget-import.service";
import { addCostAnalysisLine, saveCostItemApu } from "./cost-analysis.service";
import { updateCostItem } from "./cost-item.service";
import { _recalcAllItems } from "./budget-calc.service";
import { exportBudgetWbsCsv, exportBudgetWbsXlsx, parseBudgetWbsExportFilters } from "./budget-wbs-export.service";
import { parseBuiltCsv } from "../report-exports/csv-export.service";
import * as XLSX from "xlsx";

const live = process.env.BLOQER_AUDIT_LIVE === "1";
const conflict = (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT";

function observeBatchWrites(t: TestContext) {
  const counts: Record<string, number> = {};
  const original = prisma.$transaction;
  type Operation = (tx: Prisma.TransactionClient) => Promise<unknown>;
  const transaction = original.bind(prisma) as (operation: Operation, options?: { timeout?: number; maxWait?: number; }) => Promise<unknown>;
  (prisma as unknown as Record<string, unknown>)["$transaction"] = (operation: Operation, options?: { timeout?: number; maxWait?: number; }) => transaction((tx) => operation(new Proxy(tx, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      if (["wbsNode", "costItem", "costAnalysisLine"].includes(String(property))) return new Proxy(value as object, {
        get(delegate, method) {
          const action: unknown = Reflect.get(delegate, method);
          if (method === "create" || method === "createMany") return async (args: unknown) => {
            const key = `${String(property)}.${String(method)}`; counts[key] = (counts[key] ?? 0) + 1;
            return (action as (input: unknown) => Promise<unknown>).call(delegate, args);
          };
          return typeof action === "function" ? action.bind(delegate) : action;
        },
      });
      return typeof value === "function" ? value.bind(target) : value;
    },
  })), options);
  t.after(() => { (prisma as unknown as Record<string, unknown>)["$transaction"] = original; });
  return counts;
}

describe("AG-04 WBS/APU: SQL graph, import volume and atomic integrity", { skip: !live, concurrency: false }, () => {
  const tenantId = randomUUID(), companyId = randomUUID(), otherCompanyId = randomUUID(), actorId = randomUUID(), clientId = randomUUID();
  const ctx: ServiceContext = { tenantId, companyId, actorUserId: actorId, roles: ["OWNER"] };
  let verified = false;

  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    verified = true; clearProjectAccessModeCache();
    await prisma.$transaction(async (tx) => {
      await tx.tenant.create({ data: { id: tenantId, name: "Synthetic AG04 WBS", slug: `audit-wbs-${tenantId}` } });
      await tx.company.createMany({ data: [companyId, otherCompanyId].map((id) => ({ id, tenantId, name: "Synthetic WBS company" })) });
      await tx.user.create({ data: { id: actorId, email: `audit-wbs-${actorId}@example.test`, status: "ACTIVE" } });
      await tx.userMembership.create({ data: { tenantId, companyId, userId: actorId, roles: ["OWNER"] } });
      await tx.contact.create({ data: { id: clientId, tenantId, legalName: "Synthetic WBS client" } });
      await tx.contactRole.create({ data: { tenantId, contactId: clientId, role: "CLIENT" } });
    }, { timeout: 30_000 });
  });

  after(async () => {
    clearProjectAccessModeCache(); if (!verified) return;
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({ where: { tenantId } });
      await tx.costAnalysisLine.deleteMany({ where: { budget: { tenantId } } });
      await tx.costItem.deleteMany({ where: { budget: { tenantId } } });
      await tx.wbsNode.deleteMany({ where: { budget: { tenantId } } });
      await tx.budgetSettings.deleteMany({ where: { budget: { tenantId } } });
      await tx.budget.deleteMany({ where: { tenantId } });
      await tx.projectMembership.deleteMany({ where: { tenantId } });
      await tx.project.deleteMany({ where: { tenantId } });
      await tx.product.deleteMany({ where: { tenantId } });
      await tx.contactRole.deleteMany({ where: { tenantId } });
      await tx.contact.deleteMany({ where: { tenantId } });
      await tx.userMembership.deleteMany({ where: { tenantId } });
      await tx.tenantModuleSetting.deleteMany({ where: { tenantId } });
      await tx.company.deleteMany({ where: { tenantId } });
      await tx.tenant.deleteMany({ where: { id: tenantId } });
      await tx.user.deleteMany({ where: { id: actorId } });
    }, { timeout: 30_000 });
    await prisma.$disconnect();
  });

  async function draft() {
    const project = await prisma.project.create({ data: { tenantId, companyId, clientContactId: clientId, name: "Synthetic WBS project", code: randomUUID(), country: "AR", status: "ACTIVE" } });
    return createBudget({ projectId: project.id, name: "Synthetic WBS budget", profitPct: 10, overheadPct: 5, taxPct: 21 }, ctx);
  }

  it("exports persisted WBS amounts and axes consistently as CSV and XLSX", async () => {
    const budget = await draft();
    const node = await addWbsNode(budget.id, { type: "ITEM", name: "Synthetic export item", quantity: 2, unit: "un" }, ctx);
    const item = await prisma.costItem.findUniqueOrThrow({ where: { wbsNodeId: node.id } });
    await addCostAnalysisLine({ costItemId: item.id, category: "MATERIAL", description: "APU must not become a WBS export row", unit: "un", coefficient: 1, unitCost: 100 }, ctx);
    const filters = parseBudgetWbsExportFilters({ base: "cost", scale: "unit", detail: "compact", incidence: "1" });
    const csv = await exportBudgetWbsCsv(budget.id, budget.projectId, filters, ctx);
    const table = parseBuiltCsv(csv.content);
    assert.deepEqual(table.headers, ["CodigoWBS", "Item", "Unidad", "Cantidad", "CostoDirecto_u", "CostoDirecto", "IncidenciaPct"]);
    assert.equal(table.rows.length, 2);
    assert.deepEqual(table.rows[0]!.slice(4), ["100.00", "200.00", "100.00%"]);
    assert.equal(table.rows[1]![5], "200.00");
    const xlsx = await exportBudgetWbsXlsx(budget.id, budget.projectId, filters, ctx);
    const workbook = XLSX.read(xlsx.buffer, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[workbook.SheetNames[0]!]!, { header: 1 });
    const headerIndex = rows.findIndex((row) => row[0] === "CodigoWBS");
    assert.ok(headerIndex >= 0);
    assert.deepEqual(rows[headerIndex], table.headers);
    assert.deepEqual(rows[headerIndex + 1], table.rows[0]);
    assert.equal(rows[headerIndex + 2]![5], "200.00");
  });

  it("inserts 501 WBS nodes with their self-FKs and 500 cost items using two batches", async (t) => {
    const budget = await draft(); const counts = observeBatchWrites(t);
    const start = performance.now();
    const result = await executeImport(budget.id, [{ code: "1", type: "GROUP", name: "Capítulo" }, ...Array.from({ length: 500 }, (_, index) => ({ code: `1.${index + 1}`, parent_code: "1", type: "ITEM" as const, name: `Partida ${index + 1}` }))], ctx);
    t.diagnostic(`501-node structure import: ${Math.round(performance.now() - start)} ms; ${JSON.stringify(counts)}`);
    assert.deepEqual(result, { createdNodes: 501, createdItems: 500 });
    assert.deepEqual(counts, { "wbsNode.createMany": 1, "costItem.createMany": 1 });
    const root = await prisma.wbsNode.findUniqueOrThrow({ where: { budgetId_code: { budgetId: budget.id, code: "1" } } });
    assert.equal(await prisma.wbsNode.count({ where: { budgetId: budget.id, parentId: root.id } }), 500);
    assert.equal(await prisma.costItem.count({ where: { budgetId: budget.id, quantity: 0, unit: "" } }), 500);
  });

  it("full import matches the canonical recalculation, including cascade rounding", async () => {
    const budget = await draft();
    await executeImport(budget.id, [{ code: "1", name: "Partida", type: "ITEM", unit: "m2", quantity: "390.1234", material_cost: "7692.31", labor_cost: "0.10", other_cost: "0.20" }], ctx, { mode: "full" });
    const before = await prisma.costItem.findFirstOrThrow({ where: { budgetId: budget.id } });
    await prisma.$transaction((tx) => _recalcAllItems(tx, budget.id), { timeout: 30_000 });
    const after = await prisma.costItem.findUniqueOrThrow({ where: { id: before.id } });
    for (const field of ["unitCostDirect", "unitSalePrice", "totalCostDirect", "totalSalePrice"] as const) assert.equal(before[field].toString(), after[field].toString(), field);
  });

  it("serializes simultaneous additions and preserves hierarchy through rename/reorder/removal", async () => {
    const budget = await draft();
    await Promise.all([addWbsNode(budget.id, { type: "ITEM", name: "A" }, ctx), addWbsNode(budget.id, { type: "ITEM", name: "B" }, ctx)]);
    assert.deepEqual((await prisma.wbsNode.findMany({ where: { budgetId: budget.id }, orderBy: { code: "asc" } })).map((row) => row.code), ["1", "2"]);
    const root = await prisma.wbsNode.findUniqueOrThrow({ where: { budgetId_code: { budgetId: budget.id, code: "1" } } });
    const a = await addWbsNode(budget.id, { type: "ITEM", parentId: root.id, name: "A.1" }, ctx);
    const b = await addWbsNode(budget.id, { type: "ITEM", parentId: root.id, name: "A.2" }, ctx);
    await updateWbsNode(root.id, { code: "3" }, ctx);
    await reorderWbsNodes(budget.id, { parentId: root.id, orderedNodeIds: [b.id, a.id] }, ctx);
    assert.equal((await prisma.wbsNode.findUniqueOrThrow({ where: { id: b.id } })).code, "3.1");
    await removeWbsNode(a.id, ctx); await removeWbsNode(b.id, ctx);
    assert.equal((await prisma.wbsNode.findUniqueOrThrow({ where: { id: root.id } })).type, "ITEM");
    assert.equal(await prisma.costItem.count({ where: { budgetId: budget.id, wbsNodeId: root.id } }), 1);
  });

  it("cannot mutate a closed budget by ensuring a missing APU", async () => {
    const budget = await draft();
    const node = await prisma.wbsNode.create({ data: { budgetId: budget.id, code: "1", name: "Empty group", type: "GROUP" } });
    await prisma.budget.update({ where: { id: budget.id }, data: { status: "CLOSED" } });
    await assert.rejects(() => ensureWbsLeafForApu(budget.id, node.id, ctx), conflict);
    assert.equal(await prisma.costItem.count({ where: { wbsNodeId: node.id } }), 0);
  });

  it("preserves resource quantities and global legacy money when item quantity changes", async () => {
    const budget = await draft(); const node = await addWbsNode(budget.id, { type: "ITEM", name: "Partida", quantity: 390, unit: "ml" }, ctx);
    const item = await prisma.costItem.findUniqueOrThrow({ where: { wbsNodeId: node.id } });
    await addCostAnalysisLine({ costItemId: item.id, category: "MATERIAL", description: "Resource", unit: "un", coefficient: 1, unitCost: 6000, partidaQuantity: 500 }, ctx);
    await updateCostItem(item.id, { quantity: 500 }, ctx);
    const resource = await prisma.costAnalysisLine.findFirstOrThrow({ where: { costItemId: item.id } });
    assert.equal(resource.partidaQuantity?.toString(), "500"); assert.equal(resource.coefficient.toString(), "1"); assert.equal(resource.totalCost.toString(), "6000");
    await prisma.costAnalysisLine.update({ where: { id: resource.id }, data: { isLumpSum: true, partidaQuantity: null, coefficient: 1, unitCost: 50, totalCost: 50 } });
    await updateCostItem(item.id, { quantity: 1000 }, ctx);
    assert.equal((await prisma.costAnalysisLine.findUniqueOrThrow({ where: { id: resource.id } })).totalCost.toString(), "25");
  });

  it("rejects a product from another company and foreign deleted ids without partial writes", async () => {
    const budget = await draft(); const node = await addWbsNode(budget.id, { type: "ITEM", name: "Partida", quantity: 1, unit: "un" }, ctx);
    const item = await prisma.costItem.findUniqueOrThrow({ where: { wbsNodeId: node.id } });
    const product = await prisma.product.create({ data: { tenantId, companyId: otherCompanyId, sku: randomUUID(), name: "Other company product" } });
    await assert.rejects(() => addCostAnalysisLine({ costItemId: item.id, category: "MATERIAL", description: "Forbidden product", unit: "un", coefficient: 1, unitCost: 100, productId: product.id }, ctx), (error: unknown) => error instanceof ServiceError && error.code === "NOT_FOUND");
    await assert.rejects(() => saveCostItemApu({ costItemId: item.id, quantity: 2, lines: [{ id: randomUUID(), category: "MATERIAL", description: "Foreign id", unit: "un", coefficient: 1, unitCost: 1, totalCost: 1, _delete: true }] }, ctx), conflict);
    assert.equal((await prisma.costItem.findUniqueOrThrow({ where: { id: item.id } })).quantity.toString(), "1");
  });

  it("rolls back the economic mutation when its audit actor FK cannot be persisted", async () => {
    const budget = await draft(); const node = await addWbsNode(budget.id, { type: "ITEM", name: "Partida", quantity: 1, unit: "un" }, ctx);
    const item = await prisma.costItem.findUniqueOrThrow({ where: { wbsNodeId: node.id } });
    await assert.rejects(() => updateCostItem(item.id, { quantity: 2 }, { ...ctx, actorUserId: randomUUID() }));
    assert.equal((await prisma.costItem.findUniqueOrThrow({ where: { id: item.id } })).quantity.toString(), "1");
  });
});
