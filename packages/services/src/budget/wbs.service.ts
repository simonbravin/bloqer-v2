import { Prisma, prisma } from "@bloqer/database";
import type { WbsNodeType } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateWbsNodeInput, UpdateWbsNodeInput, ReorderWbsNodesInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";
import { assertBudgetEditable, canViewBudgetsArea } from "./budget.service";
import { _recalcBudgetSummary } from "./budget-calc.service";
import { isDisciplineRootCode, validateManualNodeCode } from "./wbs-code-rules";
import {
  buildRenumberPlan,
  countCodeSegments,
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
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to view WBS");
  }
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

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
      nodeMap.get(n.parentId)?.children.push(n);
    } else {
      roots.push(n);
    }
  }

  for (const n of nodeMap.values()) {
    n.children.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  function computeTotals(n: InternalNode): { cost: Prisma.Decimal; sale: Prisma.Decimal } {
    if (n.type === "ITEM" && n.costItem) {
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
  roots.sort((a, b) => a.sortOrder - b.sortOrder);

  function serialize(n: InternalNode): WbsViewNode {
    return {
      id: n.id,
      budgetId: n.budgetId,
      parentId: n.parentId,
      type: n.type,
      code: n.code,
      name: n.name,
      description: n.description,
      sortOrder: n.sortOrder,
      costItem: n.costItem
        ? {
            id: n.costItem.id,
            unit: n.costItem.unit,
            quantity: n.costItem.quantity.toString(),
            unitCostDirect: n.costItem.unitCostDirect.toString(),
            unitSalePrice: n.costItem.unitSalePrice.toString(),
            totalCostDirect: n.costItem.totalCostDirect.toString(),
            totalSalePrice: n.costItem.totalSalePrice.toString(),
            notes: n.costItem.notes,
            analysisLines: n.costItem.analysisLines.map((l) => ({
              id: l.id,
              category: l.category,
              description: l.description,
              unit: l.unit,
              coefficient: l.coefficient.toString(),
              unitCost: l.unitCost.toString(),
              totalCost: l.totalCost.toString(),
              sortOrder: l.sortOrder,
              supplierContactId: l.supplierContactId,
              notes: l.notes,
            })),
          }
        : null,
      children: n.children.map(serialize),
      totalCostDirect: n.totalCostDirect.toString(),
      totalSalePrice: n.totalSalePrice.toString(),
    };
  }

  return roots.map(serialize);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function addWbsNode(
  budgetId: string,
  input: CreateWbsNodeInput,
  ctx: ServiceContext,
): Promise<{ id: string }> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  assertBudgetEditable(budget);

  const allNodes = await prisma.wbsNode.findMany({
    where: { budgetId },
    select: { id: true, parentId: true, code: true, type: true, sortOrder: true },
  });

  const siblings = allNodes.filter((n) => n.parentId === (input.parentId ?? null));
  const roots = allNodes.filter((n) => n.parentId === null);

  let code = input.code?.trim();
  if (!code) {
    if (input.parentId) {
      const parent = allNodes.find((n) => n.id === input.parentId);
      if (!parent) throw new ServiceError("NOT_FOUND", "Nodo padre no encontrado");
      code = nextChildCode(parent.code, siblings);
    } else {
      if (input.type !== "GROUP") {
        throw new ServiceError("CONFLICT", "Los ítems deben crearse dentro de un capítulo");
      }
      const hasDisciplineRoots = roots.some((r) => isDisciplineRootCode(r.code));
      if (hasDisciplineRoots) {
        throw new ServiceError(
          "CONFLICT",
          "Agregá capítulos bajo un rubro (ARQ, EST, …) desde el árbol",
        );
      }
      code = nextRootGroupCode(roots);
    }
  }

  const parentCodeForValidation = input.parentId
    ? allNodes.find((n) => n.id === input.parentId)?.code ?? null
    : null;
  const manualError = validateManualNodeCode(code, input.type, parentCodeForValidation);
  if (manualError) throw new ServiceError("CONFLICT", manualError);

  const existing = await prisma.wbsNode.findUnique({
    where: { budgetId_code: { budgetId, code } },
  });
  if (existing) throw new ServiceError("CONFLICT", `Ya existe un nodo con el código "${code}"`);

  const sortOrder = input.sortOrder ?? nextSortOrder(siblings);

  if (input.parentId) {
    const parent = await prisma.wbsNode.findUnique({ where: { id: input.parentId } });
    if (!parent || parent.budgetId !== budgetId) {
      throw new ServiceError("NOT_FOUND", "Nodo padre no encontrado");
    }
    if (parent.type === "ITEM") {
      throw new ServiceError("CONFLICT", "Un nodo ITEM no puede tener hijos");
    }
    const parentManualError = validateManualNodeCode(
      code,
      input.type,
      parent.code,
    );
    if (parentManualError) throw new ServiceError("CONFLICT", parentManualError);
  }

  const node = await prisma.$transaction(async (tx) => {
    const n = await tx.wbsNode.create({
      data: {
        budgetId,
        parentId: input.parentId ?? null,
        type: input.type,
        code,
        name: input.name,
        description: input.description,
        sortOrder,
      },
    });
    // ITEM nodes always get a CostItem container
    if (input.type === "ITEM") {
      await tx.costItem.create({
        data: {
          budgetId,
          wbsNodeId: n.id,
          unit: input.unit ?? "",
          quantity: input.quantity ?? 0,
        },
      });
    }
    return n;
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "wbs_node.added",
    entityType: "WbsNode",
    entityId: node.id,
    after: { code: node.code, name: node.name, type: node.type, budgetId },
    ipAddress: ctx.ipAddress,
  });

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
  const node = await prisma.wbsNode.findUnique({ where: { id } });
  if (!node) throw new ServiceError("NOT_FOUND", "Nodo WBS no encontrado");

  const budget = await prisma.budget.findUniqueOrThrow({ where: { id: node.budgetId } });
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  assertBudgetEditable(budget);

  if (input.code && input.code !== node.code) {
    const conflict = await prisma.wbsNode.findUnique({
      where: { budgetId_code: { budgetId: node.budgetId, code: input.code } },
    });
    if (conflict) throw new ServiceError("CONFLICT", `Ya existe un nodo con el código "${input.code}"`);
  }

  await prisma.wbsNode.update({ where: { id }, data: input });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "wbs_node.updated",
    entityType: "WbsNode",
    entityId: id,
    after: input,
    ipAddress: ctx.ipAddress,
  });
}

export async function removeWbsNode(id: string, ctx: ServiceContext): Promise<void> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  const node = await prisma.wbsNode.findUnique({
    where: { id },
    include: {
      children: true,
      costItem: { include: { analysisLines: true } },
    },
  });
  if (!node) throw new ServiceError("NOT_FOUND", "Nodo WBS no encontrado");

  const budget = await prisma.budget.findUniqueOrThrow({ where: { id: node.budgetId } });
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  assertBudgetEditable(budget);

  if (node.children.length > 0) {
    throw new ServiceError(
      "CONFLICT",
      "No se puede eliminar un nodo con subnodos. Elimine los hijos primero.",
    );
  }

  // Downstream reference guards
  const certLineCount = await prisma.certificationLine.count({ where: { wbsNodeId: id } });
  if (certLineCount > 0) {
    throw new ServiceError(
      "CONFLICT",
      "El nodo tiene líneas de certificación asociadas y no puede eliminarse.",
    );
  }
  // TODO: add guards when implemented — PurchaseOrderLine, SubcontractCertification, StockMovement, JobsiteLogEntry

  await prisma.$transaction(async (tx) => {
    if (node.costItem) {
      await tx.costAnalysisLine.deleteMany({ where: { costItemId: node.costItem.id } });
      await tx.costItem.delete({ where: { id: node.costItem.id } });
    }
    await tx.wbsNode.delete({ where: { id } });

    const parentId = node.parentId;
    const siblings = await tx.wbsNode.findMany({
      where: { budgetId: node.budgetId, parentId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, parentId: true, code: true, type: true, sortOrder: true },
    });
    if (siblings.length > 0) {
      const allNodes = await tx.wbsNode.findMany({
        where: { budgetId: node.budgetId },
        select: { id: true, parentId: true, code: true, type: true, sortOrder: true },
      });
      await applyRenumberPlanTx(
        tx,
        allNodes,
        parentId,
        siblings.map((s) => s.id),
      );
    }

    await _recalcBudgetSummary(tx, node.budgetId);
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "wbs_node.removed",
    entityType: "WbsNode",
    entityId: id,
    after: { code: node.code, budgetId: node.budgetId },
    ipAddress: ctx.ipAddress,
  });
}

export async function reorderWbsNodes(
  budgetId: string,
  input: ReorderWbsNodesInput,
  ctx: ServiceContext,
): Promise<void> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  assertBudgetEditable(budget);

  const nodes = await prisma.wbsNode.findMany({
    where: { id: { in: input.orderedNodeIds }, budgetId },
  });

  if (nodes.length !== input.orderedNodeIds.length) {
    throw new ServiceError("NOT_FOUND", "Uno o más nodos no pertenecen a este presupuesto");
  }
  const expectedParent = input.parentId;
  if (!nodes.every((n) => n.parentId === expectedParent)) {
    throw new ServiceError("CONFLICT", "Todos los nodos deben tener el mismo padre para reordenar");
  }

  const allNodes = await prisma.wbsNode.findMany({
    where: { budgetId },
    select: { id: true, parentId: true, code: true, type: true, sortOrder: true },
  });

  await prisma.$transaction(async (tx) => {
    for (let idx = 0; idx < input.orderedNodeIds.length; idx++) {
      await tx.wbsNode.update({
        where: { id: input.orderedNodeIds[idx]! },
        data: { sortOrder: idx },
      });
    }

    await applyRenumberPlanTx(tx, allNodes, input.parentId, input.orderedNodeIds);
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "wbs_nodes.reordered",
    entityType: "WbsNode",
    entityId: budgetId,
    after: { parentId: input.parentId, orderedNodeIds: input.orderedNodeIds },
    ipAddress: ctx.ipAddress,
  });
}
