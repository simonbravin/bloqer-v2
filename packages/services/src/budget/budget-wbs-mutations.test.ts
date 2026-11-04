import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";
import { Prisma, prisma } from "@bloqer/database";
import { ServiceError, type ServiceContext } from "../types";
import { clearProjectAccessModeCache } from "../security/access";
import { addWbsNode, ensureWbsLeafForApu, getWbsTree, removeWbsNode, reorderWbsNodes, updateWbsNode } from "./wbs.service";
import { updateCostItem } from "./cost-item.service";
import { addCostAnalysisLine, saveCostItemApu, updateCostAnalysisLine } from "./cost-analysis.service";
import { executeImport, previewImport } from "./budget-import.service";

const D = (value: number | string) => new Prisma.Decimal(value);
const ctx: ServiceContext = { tenantId: "tenant", companyId: "company", actorUserId: "actor", roles: ["PROJECT_MANAGER"] };
const node = (id = "node", code = "1", parentId: string | null = null, type: "GROUP" | "ITEM" = "ITEM") => ({ id, code, parentId, type, budgetId: "budget", name: id, description: null, sortOrder: 0 });
const item = () => ({ id: "item", budgetId: "budget", wbsNodeId: "node", unit: "m2", quantity: D(4), unitCostDirect: D(0), unitSalePrice: D(0), totalCostDirect: D(0), totalSalePrice: D(0), notes: null });
const line = () => ({ id: "line", costItemId: "item", budgetId: "budget", category: "MATERIAL", description: "Material", unit: "un", coefficient: D(1), unitCost: D(10), totalCost: D(10), partidaQuantity: null as Prisma.Decimal | null, isLumpSum: false, productId: null, supplierContactId: "supplier", sortOrder: 0, notes: null });

function stub(t: TestContext, target: object, key: string, replacement: unknown) {
  const delegate = target as Record<string, unknown>;
  const previous = delegate[key];
  delegate[key] = replacement;
  t.after(() => { delegate[key] = previous; });
}

function setup(t: TestContext) {
  clearProjectAccessModeCache();
  t.after(clearProjectAccessModeCache);
  const budget = { id: "budget", projectId: "project", tenantId: "tenant", companyId: "company", status: "DRAFT", currency: "ARS", totalCost: D(0), totalSalePrice: D(0) };
  const project = { id: "project", tenantId: "tenant", companyId: "company", status: "ACTIVE", country: "AR", allowApprovedBudgetEconomicEdits: true };
  const state = {
    budget, project, nodes: [node()], items: [item()], lines: [line()],
    audit: [] as Array<Record<string, unknown>>, locks: [] as string[], baseline: false, auditFail: false,
    mode: "TENANT_WIDE", membership: false, moduleEnabled: true,
    links: {} as Record<string, number>, certifiedQty: "0", writes: 0, commits: 0,
    batches: { nodes: 0, items: 0, lines: 0 },
    product: { tenantId: "tenant", companyId: "company" as string | null },
    contact: { tenantId: "tenant", status: "ACTIVE" }, role: { tenantId: "tenant", status: "ACTIVE" },
  };
  let inside = false;
  let queue = Promise.resolve();
  let working = { nodes: state.nodes, items: state.items, lines: state.lines, audit: state.audit };
  const current = () => inside ? working : state;
  stub(t, prisma, "$transaction", (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
    const result = queue.then(async () => {
      working = { nodes: state.nodes.map((row) => ({ ...row })), items: state.items.map((row) => ({ ...row })), lines: state.lines.map((row) => ({ ...row })), audit: [...state.audit] };
      inside = true;
      try {
        const value = await callback(prisma as Prisma.TransactionClient);
        Object.assign(state, working); state.commits++;
        return value;
      } finally { inside = false; }
    });
    queue = result.then(() => undefined, () => undefined);
    return result;
  });
  stub(t, prisma, "$queryRaw", async (strings: TemplateStringsArray) => { state.locks.push(strings.join("?")); return []; });
  stub(t, prisma.tenantModuleSetting, "findMany", async () => state.moduleEnabled ? [] : [{ moduleKey: "BUDGETS", isEnabled: false }]);
  stub(t, prisma.tenant, "findUnique", async () => ({ projectAccessMode: state.mode, allowApprovedBudgetEconomicEdits: true }));
  stub(t, prisma.project, "findUnique", async () => inside ? state.project : { ...project, status: "ACTIVE" });
  stub(t, prisma.project, "findFirst", async () => state.project);
  stub(t, prisma.projectMembership, "findUnique", async () => state.membership ? { id: "membership" } : null);
  stub(t, prisma.budget, "findUnique", async () => ({ ...state.budget, status: "DRAFT" }));
  stub(t, prisma.budget, "findFirst", async () => state.budget);
  stub(t, prisma.budget, "findUniqueOrThrow", async () => state.budget);
  stub(t, prisma.budget, "update", async () => { state.writes++; return state.budget; });
  stub(t, prisma.schedule, "count", async () => state.baseline ? 1 : 0);
  const settings = { overheadPct: D(0), financialCostPct: D(0), financialDaysAvg: 0, profitPct: D(0), taxPct: D(0) };
  stub(t, prisma.budgetSettings, "findUniqueOrThrow", async () => settings);
  stub(t, prisma.costItem, "findUnique", async (args: { where: { id?: string; wbsNodeId?: string; }; }) => {
    const found = current().items.find((row) => args.where.id ? row.id === args.where.id : row.wbsNodeId === args.where.wbsNodeId);
    return found && !inside ? { ...found, quantity: D(2) } : found ?? null;
  });
  stub(t, prisma.costItem, "findUniqueOrThrow", async () => current().items[0]);
  stub(t, prisma.costItem, "findMany", async () => current().items);
  stub(t, prisma.costItem, "update", async (args: { where: { id: string; }; data: Record<string, unknown>; }) => {
    state.writes++; const row = current().items.find((entry) => entry.id === args.where.id)!;
    Object.assign(row, Object.fromEntries(Object.entries(args.data).filter(([, value]) => value !== undefined)));
    return row;
  });
  stub(t, prisma.costItem, "create", async (args: { data: Record<string, unknown>; }) => {
    const row = { ...item(), ...args.data, id: `item-${current().items.length + 1}` };
    current().items.push(row); state.writes++; return row;
  });
  stub(t, prisma.costItem, "createMany", async (args: { data: Array<Record<string, unknown>>; }) => { state.batches.items++; current().items.push(...args.data.map((data) => ({ ...item(), ...data }))); state.writes++; return { count: args.data.length }; });
  stub(t, prisma.costItem, "deleteMany", async () => { current().items.length = 0; state.writes++; return { count: 1 }; });
  stub(t, prisma.wbsNode, "findUnique", async (args: { where: { id?: string; budgetId_code?: { code: string; }; }; }) => current().nodes.find((row) => args.where.id ? row.id === args.where.id : row.code === args.where.budgetId_code?.code) ?? null);
  stub(t, prisma.wbsNode, "findFirst", async (args: { where: { id: string; type?: string; }; }) => current().nodes.find((row) => row.id === args.where.id && (!args.where.type || row.type === args.where.type)) ?? null);
  stub(t, prisma.wbsNode, "findMany", async (args: { where: { parentId?: string | null; }; }) => args.where.parentId !== undefined ? current().nodes.filter((row) => row.parentId === args.where.parentId) : current().nodes);
  stub(t, prisma.wbsNode, "count", async (args: { where: { parentId: string; }; }) => current().nodes.filter((row) => row.parentId === args.where.parentId).length);
  stub(t, prisma.wbsNode, "update", async (args: { where: { id: string; }; data: Record<string, unknown>; }) => { const row = current().nodes.find((entry) => entry.id === args.where.id)!; Object.assign(row, Object.fromEntries(Object.entries(args.data).filter(([, value]) => value !== undefined))); state.writes++; return row; });
  stub(t, prisma.wbsNode, "create", async (args: { data: Record<string, unknown>; }) => { const row = { ...node(), ...args.data, id: `node-${current().nodes.length + 1}` }; current().nodes.push(row); state.writes++; return row; });
  stub(t, prisma.wbsNode, "createMany", async (args: { data: Array<Record<string, unknown>>; }) => { state.batches.nodes++; current().nodes.push(...args.data.map((data) => ({ ...node(), ...data }))); state.writes++; return { count: args.data.length }; });
  stub(t, prisma.wbsNode, "deleteMany", async () => { current().nodes.length = 0; state.writes++; return { count: 1 }; });
  stub(t, prisma.wbsNode, "delete", async (args: { where: { id: string; }; }) => { current().nodes = current().nodes.filter((row) => row.id !== args.where.id); state.writes++; return node(); });
  stub(t, prisma.costAnalysisLine, "findUnique", async () => ({ ...state.lines[0], unitCost: D(1), totalCost: D(1) }));
  stub(t, prisma.costAnalysisLine, "findFirst", async () => current().lines[0]);
  stub(t, prisma.costAnalysisLine, "findMany", async () => current().lines);
  stub(t, prisma.costAnalysisLine, "update", async (args: { where: { id: string; }; data: Record<string, unknown>; }) => { const row = current().lines.find((entry) => entry.id === args.where.id)!; Object.assign(row, Object.fromEntries(Object.entries(args.data).filter(([, value]) => value !== undefined))); state.writes++; return row; });
  stub(t, prisma.costAnalysisLine, "create", async (args: { data: Record<string, unknown>; }) => { const row = { ...line(), ...args.data, id: `line-${current().lines.length + 1}` }; current().lines.push(row); state.writes++; return row; });
  stub(t, prisma.costAnalysisLine, "createMany", async (args: { data: Array<Record<string, unknown>>; }) => { state.batches.lines++; current().lines.push(...args.data.map((data) => ({ ...line(), ...data }))); state.writes++; return { count: args.data.length }; });
  stub(t, prisma.costAnalysisLine, "delete", async (args: { where: { id: string; }; }) => { current().lines = current().lines.filter((row) => row.id !== args.where.id); state.writes++; return line(); });
  stub(t, prisma.costAnalysisLine, "deleteMany", async () => { current().lines.length = 0; state.writes++; return { count: 1 }; });
  for (const model of ["certificationLine", "purchaseOrderLine", "purchaseRequestLine", "supplierInvoiceLine", "stockMovement", "subcontractLine", "scheduleItemWbsLink", "jobsiteLogProgress", "jobsiteLogMaterialUsage"] as const) {
    stub(t, prisma[model], "count", async () => state.links[model] ?? 0);
  }
  stub(t, prisma.certificationLine, "findMany", async () => [{ cumulativeQty: D(state.certifiedQty) }]);
  stub(t, prisma.product, "findUnique", async () => state.product);
  stub(t, prisma.contact, "findUnique", async () => state.contact);
  stub(t, prisma.contactRole, "findFirst", async () => state.role);
  stub(t, prisma.auditLog, "create", async (args: { data: Record<string, unknown>; }) => { assert.equal(inside, true, "audit must be atomic with the business mutation"); if (state.auditFail) throw new Error("AUDIT_FAILED"); current().audit.push(args.data); return args.data; });
  return state;
}

const conflict = (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT";
const forbidden = (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN";

describe("WBS/APU mutations use current transactional state", { concurrency: false }, () => {
  it("enforces project membership, company and module before returning WBS data", async (t) => {
    const state = setup(t); state.mode = "MEMBERSHIP_SCOPED";
    await assert.rejects(() => getWbsTree("budget", ctx), forbidden);
    state.mode = "TENANT_WIDE"; clearProjectAccessModeCache(); state.budget.companyId = "another-company";
    await assert.rejects(() => getWbsTree("budget", ctx), forbidden);
    state.budget.companyId = "company"; state.moduleEnabled = false;
    await assert.rejects(() => getWbsTree("budget", ctx), forbidden);
  });

  for (const status of ["CLOSED", "IN_REVIEW"]) it(`ensure APU cannot bypass current ${status} status`, async (t) => {
    const state = setup(t); state.budget.status = status;
    await assert.rejects(() => ensureWbsLeafForApu("budget", "node", ctx), conflict);
    assert.equal(state.writes, 0); assert.equal(state.audit.length, 0);
  });

  it("blocks a project completed after the preflight and a newly selected schedule baseline", async (t) => {
    const state = setup(t); state.project.status = "COMPLETED";
    await assert.rejects(() => addWbsNode("budget", { type: "ITEM", name: "Partida" }, ctx), conflict);
    state.project.status = "ACTIVE"; state.baseline = true;
    await assert.rejects(() => addWbsNode("budget", { type: "ITEM", name: "Partida" }, ctx), conflict);
    state.nodes[0]!.type = "GROUP"; state.items = [];
    await assert.rejects(() => ensureWbsLeafForApu("budget", "node", ctx), conflict);
    assert.equal(state.writes, 0);
  });

  it("numbers simultaneous additions from the current locked tree", async (t) => {
    const state = setup(t);
    await Promise.all([addWbsNode("budget", { type: "ITEM", name: "A" }, ctx), addWbsNode("budget", { type: "ITEM", name: "B" }, ctx)]);
    assert.deepEqual(state.nodes.map((row) => row.code), ["1", "2", "3"]);
    assert.equal(state.audit.length, 2);
    assert.match(state.locks[0]!, /tenants.*FOR SHARE/);
    assert.match(state.locks[1]!, /projects.*NO KEY UPDATE/);
    assert.match(state.locks[2]!, /budgets.*FOR UPDATE/);
  });

  it("renames a chapter and its descendants together", async (t) => {
    const state = setup(t); state.nodes = [node("node", "1", null, "GROUP"), node("child", "1.1", "node")];
    await updateWbsNode("node", { code: "3" }, ctx);
    assert.deepEqual(state.nodes.map((row) => row.code), ["3", "3.1"]);
    assert.equal(state.audit.length, 1);
  });

  it("rejects explicit codes and root renames that mix simple and multi-discipline profiles", async (t) => {
    const state = setup(t); state.nodes = [node("node", "ARQ", null, "GROUP"), node("other", "EST", null, "GROUP")];
    await assert.rejects(() => addWbsNode("budget", { type: "ITEM", code: "1", name: "Mixed" }, ctx), conflict);
    await assert.rejects(() => updateWbsNode("node", { code: "1" }, ctx), conflict);
    assert.equal(state.writes, 0);
  });

  it("rejects partial and duplicate sibling reorder payloads before writing", async (t) => {
    const state = setup(t); state.nodes.push(node("second", "2"));
    await assert.rejects(() => reorderWbsNodes("budget", { parentId: null, orderedNodeIds: ["node"] }, ctx), conflict);
    await assert.rejects(() => reorderWbsNodes("budget", { parentId: null, orderedNodeIds: ["node", "node"] }, ctx), conflict);
    assert.equal(state.writes, 0);
  });

  it("blocks deletion and subdivision when material usage already references the node", async (t) => {
    const state = setup(t); state.links.jobsiteLogMaterialUsage = 1;
    await assert.rejects(() => removeWbsNode("node", ctx), conflict);
    await assert.rejects(() => addWbsNode("budget", { parentId: "node", type: "ITEM", name: "Hijo" }, ctx), conflict);
    assert.equal(state.writes, 0);
  });

  it("uses current quantity for resource APU normalization and ignores forged totals", async (t) => {
    const state = setup(t); state.items[0]!.quantity = D(10);
    await addCostAnalysisLine({ costItemId: "item", category: "MATERIAL", description: "Material", unit: "un", coefficient: 1, unitCost: 3, totalCost: 999, partidaQuantity: 100 }, ctx);
    const created = state.lines.at(-1)!;
    assert.equal(created.coefficient.toString(), "10"); assert.equal(created.totalCost.toString(), "30");
  });

  it("does not overwrite a concurrent resource price on a metadata-only APU edit", async (t) => {
    const state = setup(t);
    await updateCostAnalysisLine("line", { description: "Nuevo nombre" }, ctx);
    assert.equal(state.lines[0]!.unitCost.toString(), "10"); assert.equal(state.lines[0]!.totalCost.toString(), "10");
  });

  it("preserves legacy lump money using the current quantity, including a null partidaQuantity", async (t) => {
    const state = setup(t); state.lines[0]!.isLumpSum = true; state.lines[0]!.totalCost = D(50);
    await updateCostItem("item", { quantity: 8 }, ctx);
    assert.equal(state.lines[0]!.totalCost.toString(), "25"); assert.equal(state.items[0]!.totalCostDirect.toString(), "200");
  });

  it("rejects lowering quantity beneath freshly certified accumulated quantity", async (t) => {
    const state = setup(t); state.certifiedQty = "7.0001";
    await assert.rejects(() => updateCostItem("item", { quantity: 7 }, ctx), conflict);
    assert.equal(state.writes, 0);
  });

  it("rolls back economic changes if audit persistence fails", async (t) => {
    const state = setup(t); state.auditFail = true;
    await assert.rejects(() => updateCostItem("item", { quantity: 8 }, ctx), /AUDIT_FAILED/);
    assert.equal(state.items[0]!.quantity.toString(), "4"); assert.equal(state.commits, 0);
  });

  it("allows notes on a zero-quantity import placeholder before the item is completed", async (t) => {
    const state = setup(t); state.items[0]!.quantity = D(0); state.items[0]!.unit = "";
    await updateCostItem("item", { notes: "Pendiente de cómputo" }, ctx);
    assert.equal(state.items[0]!.quantity.toString(), "0"); assert.equal(state.items[0]!.notes, "Pendiente de cómputo");
  });

  it("marks override audit from the locked current status", async (t) => {
    const state = setup(t); state.budget.status = "APPROVED";
    await updateCostItem("item", { notes: "Actualizado" }, ctx);
    assert.equal((state.audit[0]!.after as { approvedEditOverride: boolean; }).approvedEditOverride, true);
  });

  it("rejects foreign product and company hints before creating an APU line", async (t) => {
    const state = setup(t); const input = { costItemId: "item", category: "MATERIAL" as const, description: "Material", unit: "un", coefficient: 1, unitCost: 1, productId: "foreign" };
    state.product.tenantId = "foreign";
    await assert.rejects(() => addCostAnalysisLine(input, ctx), (error: unknown) => error instanceof ServiceError && error.code === "NOT_FOUND");
    state.product.tenantId = "tenant"; state.product.companyId = "other-company";
    await assert.rejects(() => addCostAnalysisLine(input, ctx), (error: unknown) => error instanceof ServiceError && error.code === "NOT_FOUND");
    assert.equal(state.writes, 0);
  });

  it("rejects foreign _delete ids atomically instead of silently ignoring them", async (t) => {
    const state = setup(t);
    await assert.rejects(() => saveCostItemApu({ costItemId: "item", quantity: 8, lines: [{ id: "foreign", category: "MATERIAL", description: "Foreign", unit: "un", coefficient: 1, unitCost: 1, totalCost: 1, _delete: true }] }, ctx), conflict);
    assert.equal(state.items[0]!.quantity.toString(), "4"); assert.equal(state.lines.length, 1); assert.equal(state.commits, 0);
  });

  it("rejects removal of a purchasing hint through omitted full-set lines", async (t) => {
    const state = setup(t); state.links.purchaseRequestLine = 1;
    await assert.rejects(() => saveCostItemApu({ costItemId: "item", lines: [] }, ctx), conflict);
    assert.equal(state.lines.length, 1); assert.equal(state.commits, 0);
  });

  it("imports structure only with zero placeholders even if a caller supplies economic fields", async (t) => {
    const state = setup(t); state.nodes = []; state.items = []; state.lines = [];
    await executeImport("budget", [{ code: "1", type: "ITEM", name: "Importado", unit: "m2", quantity: "100.0000", material_cost: "999.00" }], ctx);
    assert.equal(state.items[0]!.quantity.toString(), "0"); assert.equal(state.items[0]!.unit, ""); assert.equal(state.lines.length, 0);
  });

  it("previews a replacement of the same codes without requiring unsupported append semantics", async (t) => {
    setup(t);
    const preview = await previewImport("budget", [["1", "Partida de reemplazo"]], ctx);
    assert.equal(preview.valid, true);
    assert.deepEqual(preview.errors, []);
    await assert.rejects(() => executeImport("budget", [{ code: "1", type: "ITEM", name: "Reemplazo" }], ctx), conflict);
  });

  it("imports 501 nodes in two graph batches, retaining all parent relationships", async (t) => {
    const state = setup(t); state.nodes = []; state.items = []; state.lines = [];
    const rows = [{ code: "1", type: "GROUP" as const, name: "Capítulo" }, ...Array.from({ length: 500 }, (_, index) => ({ code: `1.${index + 1}`, parent_code: "1", type: "ITEM" as const, name: `Partida ${index + 1}` }))];
    assert.deepEqual(await executeImport("budget", rows, ctx), { createdNodes: 501, createdItems: 500 });
    assert.deepEqual(state.batches, { nodes: 1, items: 1, lines: 0 });
    const parent = state.nodes.find((row) => row.code === "1")!;
    assert.equal(state.nodes.filter((row) => row.parentId === parent.id).length, 500);
    assert.equal(new Set(state.nodes.map((row) => row.id)).size, 501);
  });

  it("imports full economics with shared sale calculations and one APU batch", async (t) => {
    const state = setup(t); state.nodes = []; state.items = []; state.lines = [];
    await executeImport("budget", [{ code: "1", type: "ITEM", name: "Partida", quantity: "3.0000", unit: "m2", material_cost: "0.10", labor_cost: "0.20" }], ctx, { mode: "full" });
    assert.deepEqual(state.batches, { nodes: 1, items: 1, lines: 1 });
    assert.equal(state.items[0]!.unitCostDirect.toString(), "0.3");
    assert.equal(state.items[0]!.totalCostDirect.toString(), "0.9");
    assert.equal(state.items[0]!.totalSalePrice.toString(), "0.9");
    assert.deepEqual(state.lines.map((row) => row.totalCost.toString()), ["0.1", "0.2"]);
  });

  for (const model of ["subcontractLine", "scheduleItemWbsLink", "purchaseRequestLine", "supplierInvoiceLine", "stockMovement", "jobsiteLogMaterialUsage"]) it(`blocks replacing WBS linked through ${model}`, async (t) => {
    const state = setup(t); state.links[model] = 1;
    await assert.rejects(() => executeImport("budget", [{ code: "1", type: "ITEM", name: "Importado" }], ctx, { replaceExisting: true }), conflict);
    assert.equal(state.writes, 0); assert.equal(state.nodes[0]!.id, "node");
  });
});
