import { Prisma, prisma } from "@bloqer/database";
import type { WbsNodeType } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateWbsNodeInput, UpdateWbsNodeInput, ReorderWbsNodesInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";
import { isCrossCompany } from "../company-scope";
import { requireProjectAccess } from "../security/access";
import { assertTenantModuleEnabled } from "../tenant-modules/tenant-module.service";
import {
  approvedEditOverrideAuditMeta,
  assertBudgetWbsStructureMutable,
  canViewBudgetsArea,
  lockBudgetForEconomicEdit,
} from "./budget.service";
import { assertProjectAllowsBudgetPlanning } from "../project/project-operational-guard";
import { _recalcBudgetSummary } from "./budget-calc.service";
import { assertBudgetDecimalFits } from "./budget-decimal";
import { isDisciplineRootCode, validateManualNodeCode } from "./wbs-code-rules";
import { serializeMoneyDecimal, serializeQtyDecimal, serializeUnitPriceDecimal } from "../finance/money-decimal";
import {
  buildRenumberPlan,
  nextChildCode,
  nextRootGroupCode,
  nextSortOrder,
} from "./wbs-codes";

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

type WbsNodeRenumberRow = {
  id: string;
  parentId: string | null;
  code: string;
  type: WbsNodeType;
  sortOrder: number;
};

async function applyRenumberPlanTx(
  tx: TxClient,
  allNodes: WbsNodeRenumberRow[],
  parentId: string | null,
  orderedSiblingIds: string[],
): Promise<void> {
  const renumber = buildRenumberPlan(allNodes, parentId, orderedSiblingIds);
  await applyCodePlanTx(tx, renumber);
}

async function applyCodePlanTx(tx: TxClient, renumber: Map<string, string>): Promise<void> {
  if (renumber.size === 0) return;

  const tempPrefix = `__renumber_${Date.now()}_`;
  let tempIdx = 0;
  for (const id of renumber.keys()) {
    await tx.wbsNode.update({
      where: { id },
      data: { code: `${tempPrefix}${tempIdx++}` },
    });
  }
  for (const [id, code] of renumber) {
    await tx.wbsNode.update({ where: { id }, data: { code } });
  }
}

// ─── View types (serializable for client) ─────────────────────────────────────

export type CostAnalysisLineView = {
  id: string;
  category: string;
  description: string;
  unit: string;
  coefficient: string;
  unitCost: string;
  totalCost: string;
  partidaQuantity: string | null;
  isLumpSum: boolean;
  productId: string | null;
  sortOrder: number;
  supplierContactId: string | null;
  notes: string | null;
};

export type CostItemView = {
  id: string;
  unit: string;
  quantity: string;
  unitCostDirect: string;
  unitSalePrice: string;
  totalCostDirect: string;
  totalSalePrice: string;
  notes: string | null;
  analysisLines: CostAnalysisLineView[];
};

export type WbsViewNode = {
  id: string;
  budgetId: string;
  parentId: string | null;
  type: WbsNodeType;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  costItem: CostItemView | null;
  children: WbsViewNode[];
  totalCostDirect: string;
  totalSalePrice: string;
};

type InternalNode = {
  id: string;
  budgetId: string;
  parentId: string | null;
  type: WbsNodeType;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  costItem: {
    id: string;
    unit: string;
    quantity: Prisma.Decimal;
    unitCostDirect: Prisma.Decimal;
    unitSalePrice: Prisma.Decimal;
    totalCostDirect: Prisma.Decimal;
    totalSalePrice: Prisma.Decimal;
    notes: string | null;
    analysisLines: {
      id: string;
      category: string;
      description: string;
      unit: string;
      coefficient: Prisma.Decimal;
      unitCost: Prisma.Decimal;
      totalCost: Prisma.Decimal;
      partidaQuantity: Prisma.Decimal | null;
      isLumpSum: boolean;
      productId: string | null;
      sortOrder: number;
      supplierContactId: string | null;
      notes: string | null;
    }[];
  } | null;
  children: InternalNode[];
  totalCostDirect: Prisma.Decimal;
  totalSalePrice: Prisma.Decimal;
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getWbsTree(budgetId: string, ctx: ServiceContext): Promise<WbsViewNode[]> {
  if (!canViewBudgetsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver la EDT");
  }
  await assertTenantModuleEnabled(ctx, "BUDGETS");
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(budget.companyId, ctx)) throw new ServiceError("FORBIDDEN", "Presupuesto de otra empresa");
  await requireProjectAccess(budget.projectId, ctx);

  const nodes = await prisma.wbsNode.findMany({
    where: { budgetId },
    include: {
      costItem: {
        include: { analysisLines: { orderBy: { sortOrder: "asc" } } },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  const nodeMap = new Map<string, InternalNode>();
  for (const n of nodes) {
    if (n.costItem && (n.costItem.budgetId !== budgetId || n.costItem.analysisLines.some((line) => line.budgetId !== budgetId || line.costItemId !== n.costItem!.id))) {
      throw new ServiceError("CONFLICT", "La EDT contiene un análisis de costo de otro presupuesto");
    }
    nodeMap.set(n.id, {
      ...n,
      children: [],
      totalCostDirect: new Prisma.Decimal(0),
      totalSalePrice: new Prisma.Decimal(0),
    });
  }

  const roots: InternalNode[] = [];
  for (const n of nodeMap.values()) {
    if (n.parentId) {
      const parent = nodeMap.get(n.parentId);
      if (!parent) throw new ServiceError("CONFLICT", "La EDT contiene un padre de otro presupuesto");
      parent.children.push(n);
    } else {
      roots.push(n);
    }
  }

  for (const n of nodeMap.values()) {
    n.children.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const visited = new Set<string>();
  function computeTotals(n: InternalNode): { cost: Prisma.Decimal; sale: Prisma.Decimal; } {
    if (visited.has(n.id)) throw new ServiceError("CONFLICT", "La EDT contiene una jerarquía circular");
    visited.add(n.id);
    if (n.children.length === 0 && n.costItem) {
      n.totalCostDirect = n.costItem.totalCostDirect;
      n.totalSalePrice = n.costItem.totalSalePrice;
      return { cost: n.totalCostDirect, sale: n.totalSalePrice };
    }
    let cost = new Prisma.Decimal(0);
    let sale = new Prisma.Decimal(0);
    for (const child of n.children) {
      const { cost: cc, sale: cs } = computeTotals(child);
      cost = cost.plus(cc);
      sale = sale.plus(cs);
    }
    n.totalCostDirect = cost;
    n.totalSalePrice = sale;
    return { cost, sale };
  }

  roots.forEach(computeTotals);
  if (visited.size !== nodes.length) throw new ServiceError("CONFLICT", "La EDT contiene una jerarquía circular");
  roots.sort((a, b) => a.sortOrder - b.sortOrder);

  function serialize(n: InternalNode): WbsViewNode {
    const isStructuralLeaf = n.children.length === 0;
    return {
      id: n.id,
      budgetId: n.budgetId,
      parentId: n.parentId,
      type: n.type,
      code: n.code,
      name: n.name,
      description: n.description,
      sortOrder: n.sortOrder,
      costItem: isStructuralLeaf && n.costItem
        ? {
          id: n.costItem.id,
          unit: n.costItem.unit,
          quantity: serializeQtyDecimal(n.costItem.quantity),
          unitCostDirect: serializeUnitPriceDecimal(n.costItem.unitCostDirect),
          unitSalePrice: serializeUnitPriceDecimal(n.costItem.unitSalePrice),
          totalCostDirect: serializeMoneyDecimal(n.costItem.totalCostDirect),
          totalSalePrice: serializeMoneyDecimal(n.costItem.totalSalePrice),
          notes: n.costItem.notes,
          analysisLines: n.costItem.analysisLines.map((l) => ({
            id: l.id,
            category: l.category,
            description: l.description,
            unit: l.unit,
            coefficient: serializeQtyDecimal(l.coefficient),
            unitCost: serializeUnitPriceDecimal(l.unitCost),
            // Keep historical unit contributions exact for aggregate rounding;
            // new APU writes already apply money half-up at their boundary.
            totalCost: serializeUnitPriceDecimal(l.totalCost),
            partidaQuantity: l.partidaQuantity != null ? serializeQtyDecimal(l.partidaQuantity) : null,
            isLumpSum: l.isLumpSum,
            productId: l.productId ?? null,
            sortOrder: l.sortOrder,
            supplierContactId: l.supplierContactId,
            notes: l.notes,
          })),
        }
        : null,
      children: n.children.map(serialize),
      totalCostDirect: serializeMoneyDecimal(n.totalCostDirect),
      totalSalePrice: serializeMoneyDecimal(n.totalSalePrice),
    };
  }

  return roots.map(serialize);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

function findNodeInTree(roots: WbsViewNode[], nodeId: string): WbsViewNode | null {
  for (const root of roots) {
    if (root.id === nodeId) return root;
    const stack = [...root.children];
    while (stack.length > 0) {
      const n = stack.pop()!;
      if (n.id === nodeId) return n;
      stack.push(...n.children);
    }
  }
  return null;
}

/** Prepara un nodo hoja (sin hijos) para editar APU: ITEM + CostItem si faltaba. */
export async function ensureWbsLeafForApu(
  budgetId: string,
  nodeId: string,
  ctx: ServiceContext,
): Promise<WbsViewNode> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  await assertTenantModuleEnabled(ctx, "BUDGETS");
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  await assertProjectAllowsBudgetPlanning(budget.projectId, ctx);

  await prisma.$transaction(async (tx) => {
    const currentBudget = await lockBudgetForEconomicEdit(tx, budgetId, ctx);
    const node = await tx.wbsNode.findFirst({ where: { id: nodeId, budgetId } });
    if (!node) throw new ServiceError("NOT_FOUND", "Nodo EDT no encontrado");
    if (isDisciplineRootCode(node.code)) {
      throw new ServiceError("CONFLICT", "El rubro agrupa capítulos; agregá un ítem bajo el rubro");
    }
    if (await tx.wbsNode.count({ where: { parentId: nodeId } })) {
      throw new ServiceError("CONFLICT", "El APU va en el nivel más bajo de la rama (sin hijos)");
    }
    const existing = await tx.costItem.findUnique({ where: { wbsNodeId: nodeId } });
    if (existing && existing.budgetId !== budgetId) {
      throw new ServiceError("CONFLICT", "El ítem no pertenece a este presupuesto");
    }
    if (node.type === "ITEM" && existing) return;
    await assertBudgetWbsStructureMutable(currentBudget, ctx, tx);
    if (node.type === "GROUP") {
      await tx.wbsNode.update({ where: { id: nodeId }, data: { type: "ITEM" } });
    }
    if (!existing) {
      await tx.costItem.create({
        data: { budgetId, wbsNodeId: nodeId, unit: "", quantity: 0 },
      });
    }
    await _recalcBudgetSummary(tx, budgetId);
    await log({
      tenantId: ctx.tenantId, actorUserId: ctx.actorUserId,
      action: "wbs_node.updated", entityType: "WbsNode", entityId: nodeId,
      projectId: budget.projectId,
      after: { type: "ITEM", budgetId, ...approvedEditOverrideAuditMeta(currentBudget.status) },
      ipAddress: ctx.ipAddress,
    }, tx);
  }, { maxWait: 10_000, timeout: 30_000 });

  const tree = await getWbsTree(budgetId, ctx);
  const view = findNodeInTree(tree, nodeId);
  if (!view) throw new ServiceError("NOT_FOUND", "Nodo EDT no encontrado");
  return view;
}

export async function addWbsNode(
  budgetId: string,
  input: CreateWbsNodeInput,
  ctx: ServiceContext,
): Promise<{ id: string; }> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  await assertTenantModuleEnabled(ctx, "BUDGETS");
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsBudgetPlanning(budget.projectId, ctx);

  const node = await prisma.$transaction(async (tx) => {
    const currentBudget = await lockBudgetForEconomicEdit(tx, budgetId, ctx);
    await assertBudgetWbsStructureMutable(currentBudget, ctx, tx);

    const nodeType: WbsNodeType = "ITEM";
    const quantity = new Prisma.Decimal(input.quantity ?? 0).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    assertBudgetDecimalFits(quantity, "Cantidad del ítem");
    if (quantity.isNegative() || ((input.quantity ?? 0) > 0 && !quantity.gt(0))) {
      throw new ServiceError("VALIDATION", "La cantidad del ítem no es válida (mínimo 0,0001 si es mayor a 0)");
    }
    if (quantity.gt(0) && !input.unit?.trim()) throw new ServiceError("VALIDATION", "La unidad del ítem es obligatoria");

    const allNodes = await tx.wbsNode.findMany({
      where: { budgetId },
      select: { id: true, parentId: true, code: true, type: true, sortOrder: true },
    });

    const siblings = allNodes.filter((n) => n.parentId === (input.parentId ?? null));
    const roots = allNodes.filter((n) => n.parentId === null);
    if (!input.parentId && roots.some((root) => isDisciplineRootCode(root.code))) {
      throw new ServiceError("CONFLICT", "Agregá capítulos bajo un rubro (ARQ, EST, …) desde el árbol");
    }

    let code = input.code?.trim();
    if (!code) {
      if (input.parentId) {
        const parent = allNodes.find((n) => n.id === input.parentId);
        if (!parent) throw new ServiceError("NOT_FOUND", "Nodo padre no encontrado");
        code = nextChildCode(parent.code, siblings);
      } else {
        if (input.type !== "GROUP" && input.type !== "ITEM") {
          throw new ServiceError("CONFLICT", "Tipo de nodo inválido");
        }
        code = nextRootGroupCode(roots);
      }
    }

    const parentCodeForValidation = input.parentId
      ? allNodes.find((n) => n.id === input.parentId)?.code ?? null
      : null;
    const manualError = validateManualNodeCode(code, nodeType, parentCodeForValidation);
    if (manualError) throw new ServiceError("CONFLICT", manualError);

    const existing = await tx.wbsNode.findUnique({
      where: { budgetId_code: { budgetId, code } },
    });
    if (existing) throw new ServiceError("CONFLICT", `Ya existe un nodo con el código "${code}"`);

    const sortOrder = input.sortOrder ?? nextSortOrder(siblings);

    if (input.parentId) {
      const parent = await tx.wbsNode.findUnique({ where: { id: input.parentId } });
      if (!parent || parent.budgetId !== budgetId) {
        throw new ServiceError("NOT_FOUND", "Nodo padre no encontrado");
      }
      const parentManualError = validateManualNodeCode(code, nodeType, parent.code);
      if (parentManualError) throw new ServiceError("CONFLICT", parentManualError);
    }

    if (input.parentId) {
      const parentForPromote = await tx.wbsNode.findUnique({
        where: { id: input.parentId },
        select: { type: true },
      });
      const parentCostItem = await tx.costItem.findUnique({
        where: { wbsNodeId: input.parentId },
        select: { id: true, budgetId: true },
      });
      if (parentCostItem && parentCostItem.budgetId !== budgetId) throw new ServiceError("CONFLICT", "El APU del padre pertenece a otro presupuesto");
      if (parentForPromote?.type === "ITEM" || parentCostItem) {
        await assertWbsSubtreeDeletable(tx, [input.parentId]);
      }
    }

    const subdivideApu = input.subdivideApu ?? "discard";

    let movedCostItem = false;

    const n = await tx.wbsNode.create({
      data: {
        budgetId,
        parentId: input.parentId ?? null,
        type: nodeType,
        code,
        name: input.name,
        description: input.description,
        sortOrder,
      },
    });

    if (input.parentId) {
      const parent = await tx.wbsNode.findUnique({ where: { id: input.parentId } });
      if (!parent) {
        throw new ServiceError("NOT_FOUND", "Nodo padre no encontrado");
      }
      const parentHadCost = await tx.costItem.findUnique({
        where: { wbsNodeId: input.parentId },
        select: { id: true },
      });
      if (parent.type === "ITEM" || parentHadCost) {
        if (subdivideApu === "migrate") {
          const moved = await tx.costItem.updateMany({
            where: { wbsNodeId: parent.id },
            data: { wbsNodeId: n.id },
          });
          movedCostItem = moved.count > 0;
        } else if (parentHadCost) {
          await tx.costAnalysisLine.deleteMany({
            where: { costItem: { wbsNodeId: parent.id } },
          });
          await tx.costItem.deleteMany({ where: { wbsNodeId: parent.id } });
        }
        await tx.wbsNode.update({
          where: { id: parent.id },
          data: { type: "GROUP" },
        });
      }

      const parentChildCount = await tx.wbsNode.count({ where: { parentId: input.parentId } });
      if (parentChildCount > 0) {
        if (!movedCostItem) {
          await tx.costAnalysisLine.deleteMany({
            where: { costItem: { wbsNodeId: input.parentId } },
          });
          await tx.costItem.deleteMany({ where: { wbsNodeId: input.parentId } });
        }
        const parentAfter = await tx.wbsNode.findUnique({ where: { id: input.parentId } });
        if (parentAfter?.type === "ITEM") {
          await tx.wbsNode.update({
            where: { id: input.parentId },
            data: { type: "GROUP" },
          });
        }
      }
    }

    if (nodeType === "ITEM" && !movedCostItem) {
      await tx.costItem.create({
        data: {
          budgetId,
          wbsNodeId: n.id,
          unit: input.unit?.trim() ?? "",
          quantity,
        },
      });
    }

    await _recalcBudgetSummary(tx, budgetId);
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "wbs_node.added",
      entityType: "WbsNode",
      entityId: n.id,
      projectId: budget.projectId,
      after: {
        code: n.code,
        name: n.name,
        type: n.type,
        budgetId,
        ...approvedEditOverrideAuditMeta(currentBudget.status),
      },
      ipAddress: ctx.ipAddress,
    }, tx);
    return n;
  }, { maxWait: 10_000, timeout: 30_000 });

  return { id: node.id };
}

export async function updateWbsNode(
  id: string,
  input: UpdateWbsNodeInput,
  ctx: ServiceContext,
): Promise<void> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  await assertTenantModuleEnabled(ctx, "BUDGETS");
  const node = await prisma.wbsNode.findUnique({ where: { id } });
  if (!node) throw new ServiceError("NOT_FOUND", "Nodo EDT no encontrado");

  const budget = await prisma.budget.findUniqueOrThrow({ where: { id: node.budgetId } });
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsBudgetPlanning(budget.projectId, ctx);

  await prisma.$transaction(async (tx) => {
    const currentBudget = await lockBudgetForEconomicEdit(tx, node.budgetId, ctx);
    const current = await tx.wbsNode.findFirst({ where: { id, budgetId: budget.id } });
    if (!current) throw new ServiceError("NOT_FOUND", "Nodo EDT no encontrado");
    const code = input.code?.trim();
    if (code !== undefined && code !== current.code) {
      await assertBudgetWbsStructureMutable(currentBudget, ctx, tx);
      const allNodes = await tx.wbsNode.findMany({ where: { budgetId: budget.id } });
      const rootCodes = allNodes.filter((entry) => entry.parentId === null).map((entry) => entry.id === id ? code : entry.code);
      if (rootCodes.some(isDisciplineRootCode) && rootCodes.some((entry) => !isDisciplineRootCode(entry))) {
        throw new ServiceError("CONFLICT", "La EDT no puede mezclar raíces numéricas con rubros");
      }
      const parent = allNodes.find((n) => n.id === current.parentId);
      const error = validateManualNodeCode(code, current.type, parent?.code ?? null);
      if (error) throw new ServiceError("CONFLICT", error);
      const subtreeIds = new Set(collectSubtreeNodeIds(id, allNodes));
      const occupied = new Set(allNodes.filter((n) => !subtreeIds.has(n.id)).map((n) => n.code));
      const plan = new Map<string, string>();
      for (const descendant of allNodes.filter((n) => subtreeIds.has(n.id))) {
        if (descendant.id !== id) {
          const oldParent = allNodes.find((n) => n.id === descendant.parentId);
          if (!oldParent || validateManualNodeCode(descendant.code, descendant.type, oldParent.code)) {
            throw new ServiceError("CONFLICT", "La EDT contiene códigos inconsistentes con sus padres");
          }
        }
        const nextCode = descendant.id === id ? code : `${code}${descendant.code.slice(current.code.length)}`;
        const maxError = validateManualNodeCode(
          nextCode, descendant.type,
          descendant.id === id ? parent?.code ?? null : nextCode.slice(0, nextCode.lastIndexOf(".")),
        );
        if (maxError) throw new ServiceError("CONFLICT", maxError);
        if (occupied.has(nextCode)) throw new ServiceError("CONFLICT", `Ya existe un nodo con el código "${nextCode}"`);
        occupied.add(nextCode);
        plan.set(descendant.id, nextCode);
      }
      await applyCodePlanTx(tx, plan);
    }
    await tx.wbsNode.update({ where: { id }, data: { ...input, code } });
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "wbs_node.updated",
      entityType: "WbsNode",
      entityId: id,
      projectId: budget.projectId,
      before: { code: current.code, name: current.name, description: current.description },
      after: { ...input, ...approvedEditOverrideAuditMeta(currentBudget.status) },
      ipAddress: ctx.ipAddress,
    }, tx);
  }, { maxWait: 10_000, timeout: 30_000 });
}

function collectSubtreeNodeIds(
  rootId: string,
  nodes: { id: string; parentId: string | null; }[],
): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parentId == null) continue;
    const list = childrenByParent.get(n.parentId) ?? [];
    list.push(n.id);
    childrenByParent.set(n.parentId, list);
  }

  const out: string[] = [];
  const visited = new Set<string>();
  function walk(nodeId: string) {
    if (visited.has(nodeId)) throw new ServiceError("CONFLICT", "La EDT contiene una jerarquía circular");
    visited.add(nodeId);
    out.push(nodeId);
    for (const childId of childrenByParent.get(nodeId) ?? []) walk(childId);
  }
  walk(rootId);
  return out;
}

function sortNodeIdsByDepthDesc(
  nodeIds: string[],
  nodes: { id: string; parentId: string | null; }[],
): string[] {
  const parentById = new Map(nodes.map((n) => [n.id, n.parentId]));
  const depth = (id: string): number => {
    let d = 0;
    let cur: string | null | undefined = id;
    const visited = new Set<string>();
    while (cur) {
      if (visited.has(cur)) throw new ServiceError("CONFLICT", "La EDT contiene una jerarquía circular");
      visited.add(cur);
      const p = parentById.get(cur);
      if (!p) break;
      d += 1;
      cur = p;
    }
    return d;
  };
  return [...nodeIds].sort((a, b) => depth(b) - depth(a));
}

/** Caller holds Project/Budget locks; lock leaves before checking incoming FK links. */
export async function assertWbsSubtreeDeletable(tx: TxClient, nodeIds: string[]): Promise<void> {
  if (nodeIds.length === 0) return;
  await tx.$queryRaw`SELECT id FROM wbs_nodes WHERE id IN (${Prisma.join(nodeIds)}) ORDER BY id FOR UPDATE`;

  const [
    certLines,
    poLines,
    jobsiteRefs,
    subcontractLines,
    scheduleLinks,
    prLines,
    invoiceLines,
    stockMoves,
    jobsiteMaterials,
  ] = await Promise.all([
    tx.certificationLine.count({ where: { wbsNodeId: { in: nodeIds } } }),
    tx.purchaseOrderLine.count({ where: { OR: [{ wbsNodeId: { in: nodeIds } }, { costAnalysisLine: { costItem: { wbsNodeId: { in: nodeIds } } } }] } }),
    tx.jobsiteLogProgress.count({ where: { wbsNodeId: { in: nodeIds } } }),
    tx.subcontractLine.count({ where: { wbsNodeId: { in: nodeIds } } }),
    tx.scheduleItemWbsLink.count({ where: { wbsNodeId: { in: nodeIds } } }),
    tx.purchaseRequestLine.count({ where: { OR: [{ wbsNodeId: { in: nodeIds } }, { costAnalysisLine: { costItem: { wbsNodeId: { in: nodeIds } } } }] } }),
    tx.supplierInvoiceLine.count({ where: { OR: [{ wbsNodeId: { in: nodeIds } }, { costAnalysisLine: { costItem: { wbsNodeId: { in: nodeIds } } } }] } }),
    tx.stockMovement.count({ where: { wbsNodeId: { in: nodeIds } } }),
    tx.jobsiteLogMaterialUsage.count({ where: { wbsNodeId: { in: nodeIds } } }),
  ]);

  if (
    certLines > 0 ||
    poLines > 0 ||
    jobsiteRefs > 0 ||
    subcontractLines > 0 ||
    scheduleLinks > 0 ||
    prLines > 0 ||
    invoiceLines > 0 ||
    stockMoves > 0 || jobsiteMaterials > 0
  ) {
    throw new ServiceError(
      "CONFLICT",
      "No se puede eliminar: hay certificaciones, compras, facturas, stock, subcontratos, cronograma o libro de obra vinculados a ítems del subárbol.",
    );
  }
}

export async function removeWbsNode(id: string, ctx: ServiceContext): Promise<void> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  await assertTenantModuleEnabled(ctx, "BUDGETS");
  const node = await prisma.wbsNode.findUnique({
    where: { id },
    select: { id: true, budgetId: true, parentId: true, code: true, name: true },
  });
  if (!node) throw new ServiceError("NOT_FOUND", "Nodo EDT no encontrado");

  const budget = await prisma.budget.findUniqueOrThrow({ where: { id: node.budgetId } });
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsBudgetPlanning(budget.projectId, ctx);

  await prisma.$transaction(async (tx) => {
    const currentBudget = await lockBudgetForEconomicEdit(tx, budget.id, ctx);
    await assertBudgetWbsStructureMutable(currentBudget, ctx, tx);
    const current = await tx.wbsNode.findFirst({ where: { id, budgetId: budget.id } });
    if (!current) throw new ServiceError("NOT_FOUND", "Nodo EDT no encontrado");

    const allNodes = await tx.wbsNode.findMany({
      where: { budgetId: node.budgetId },
      select: { id: true, parentId: true },
    });
    const subtreeIds = collectSubtreeNodeIds(node.id, allNodes);
    await assertWbsSubtreeDeletable(tx, subtreeIds);

    const deleteOrder = sortNodeIdsByDepthDesc(subtreeIds, allNodes);
    const costItems = await tx.costItem.findMany({
      where: { wbsNodeId: { in: subtreeIds } },
      select: { id: true, budgetId: true },
    });
    if (costItems.some((item) => item.budgetId !== budget.id)) throw new ServiceError("CONFLICT", "La EDT contiene ítems de otro presupuesto");
    const costItemIds = costItems.map((c) => c.id);

    if (costItemIds.length > 0) {
      await tx.costAnalysisLine.deleteMany({ where: { costItemId: { in: costItemIds }, budgetId: budget.id } });
      await tx.costItem.deleteMany({ where: { id: { in: costItemIds } } });
    }

    for (const nodeId of deleteOrder) {
      await tx.wbsNode.delete({ where: { id: nodeId } });
    }

    const parentId = current.parentId;
    if (parentId) {
      const parent = await tx.wbsNode.findUnique({
        where: { id: parentId },
        select: { id: true, type: true, budgetId: true, code: true },
      });
      if (
        parent?.type === "GROUP" &&
        !isDisciplineRootCode(parent.code)
      ) {
        const childCount = await tx.wbsNode.count({
          where: { budgetId: node.budgetId, parentId },
        });
        if (childCount === 0) {
          await tx.wbsNode.update({
            where: { id: parentId },
            data: { type: "ITEM" },
          });
          await tx.costItem.create({
            data: {
              budgetId: node.budgetId,
              wbsNodeId: parentId,
              unit: "",
              quantity: 0,
            },
          });
        }
      }
    }

    const siblings = await tx.wbsNode.findMany({
      where: { budgetId: node.budgetId, parentId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, parentId: true, code: true, type: true, sortOrder: true },
    });
    if (siblings.length > 0) {
      const remaining = await tx.wbsNode.findMany({
        where: { budgetId: node.budgetId },
        select: { id: true, parentId: true, code: true, type: true, sortOrder: true },
      });
      await applyRenumberPlanTx(
        tx,
        remaining,
        parentId,
        siblings.map((s) => s.id),
      );
    }

    await _recalcBudgetSummary(tx, node.budgetId);
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "wbs_node.removed",
      entityType: "WbsNode",
      entityId: id,
      projectId: budget.projectId,
      after: {
        code: current.code,
        budgetId: node.budgetId,
        removedNodeCount: subtreeIds.length,
        ...approvedEditOverrideAuditMeta(currentBudget.status),
      },
      ipAddress: ctx.ipAddress,
    }, tx);
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function reorderWbsNodes(
  budgetId: string,
  input: ReorderWbsNodesInput,
  ctx: ServiceContext,
): Promise<void> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  await assertTenantModuleEnabled(ctx, "BUDGETS");
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsBudgetPlanning(budget.projectId, ctx);

  await prisma.$transaction(async (tx) => {
    const currentBudget = await lockBudgetForEconomicEdit(tx, budgetId, ctx);
    await assertBudgetWbsStructureMutable(currentBudget, ctx, tx);
    const nodes = await tx.wbsNode.findMany({
      where: { parentId: input.parentId, budgetId },
    });

    if (new Set(input.orderedNodeIds).size !== input.orderedNodeIds.length ||
      nodes.length !== input.orderedNodeIds.length ||
      nodes.some((n) => !input.orderedNodeIds.includes(n.id))) {
      throw new ServiceError("CONFLICT", "Incluí todos los nodos del mismo nivel una sola vez para reordenar");
    }
    const expectedParent = input.parentId;
    if (!nodes.every((n) => n.parentId === expectedParent)) {
      throw new ServiceError("CONFLICT", "Todos los nodos deben tener el mismo padre para reordenar");
    }

    const allNodes = await tx.wbsNode.findMany({
      where: { budgetId },
      select: { id: true, parentId: true, code: true, type: true, sortOrder: true },
    });

    for (let idx = 0; idx < input.orderedNodeIds.length; idx++) {
      await tx.wbsNode.update({
        where: { id: input.orderedNodeIds[idx]! },
        data: { sortOrder: idx },
      });
    }

    await applyRenumberPlanTx(tx, allNodes, input.parentId, input.orderedNodeIds);
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "wbs_nodes.reordered",
      entityType: "WbsNode",
      entityId: budgetId,
      projectId: budget.projectId,
      after: {
        parentId: input.parentId,
        orderedNodeIds: input.orderedNodeIds,
        ...approvedEditOverrideAuditMeta(currentBudget.status),
      },
      ipAddress: ctx.ipAddress,
    }, tx);
  }, { maxWait: 10_000, timeout: 30_000 });
}
