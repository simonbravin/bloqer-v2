// Budget CSV/XLSX import — server-side execute and preview with tenant checks.

import { Prisma, prisma } from "@bloqer/database";
import type { BudgetImportRow } from "@bloqer/validators";
import { can } from "@bloqer/domain";
import { log } from "../audit/audit.service";
import { toMoneyDecimal } from "../finance/money-decimal";
import { ServiceContext, ServiceError } from "../types";
import { assertProjectAllowsBudgetPlanning } from "../project/project-operational-guard";
import {
  approvedEditOverrideAuditMeta,
  assertBudgetEditable,
  assertBudgetWbsStructureMutable,
  lockBudgetForEconomicEdit,
} from "./budget.service";
import { _recalcAllItems, _recalcBudgetSummary } from "./budget-calc.service";
import {
  detectProfileFromImportRows,
  reconcileImportRowTypes,
} from "./wbs-code-rules";
import {
  type ImportMode,
  type PreviewResult,
  previewSpreadsheetImport,
  validateImportRows,
} from "./budget-import-pure";

export * from "./budget-import-pure";

export type ExecuteImportResult = {
  createdNodes: number;
  createdItems: number;
};

export async function previewImport(
  budgetId: string,
  rawRows: unknown[][],
  ctx: ServiceContext,
  mode: ImportMode = "structure_only",
): Promise<PreviewResult> {
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertBudgetEditable(budget);
  await assertProjectAllowsBudgetPlanning(budget.projectId, ctx.tenantId);

  const existingNodes = await prisma.wbsNode.findMany({
    where: { budgetId },
    select: { code: true },
  });
  const existingCodes = existingNodes.map((n) => n.code);

  return previewSpreadsheetImport(rawRows, existingCodes, mode);
}

export async function executeImport(
  budgetId: string,
  rows: BudgetImportRow[],
  ctx: ServiceContext,
  options?: { mode?: ImportMode; replaceExisting?: boolean },
): Promise<ExecuteImportResult> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }

  const mode = options?.mode ?? "structure_only";
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertBudgetEditable(budget);
  await assertProjectAllowsBudgetPlanning(budget.projectId, ctx.tenantId);
  await assertBudgetWbsStructureMutable(budget, ctx);

  const existingNodes = await prisma.wbsNode.findMany({
    where: { budgetId },
    select: { id: true, code: true },
  });
  const existingCodes = existingNodes.map((n) => n.code);

  if (existingCodes.length > 0 && !options?.replaceExisting) {
    throw new ServiceError(
      "CONFLICT",
      "El presupuesto ya tiene nodos EDT. Eliminá la estructura existente o usá reemplazar en la importación.",
    );
  }

  const profile = detectProfileFromImportRows(rows);
  const normalizedRows = reconcileImportRowTypes(rows, profile);
  const numbered = normalizedRows.map((r, i) => ({ ...r, _row: i + 1 }));
  const { errors } = validateImportRows(numbered, options?.replaceExisting ? [] : existingCodes, mode);
  if (errors.length > 0) {
    throw new ServiceError("CONFLICT", errors[0]!.message);
  }

  const sorted = topologicalSortRows(normalizedRows);

  let createdNodes = 0;
  let createdItems = 0;
  const codeToId = new Map<string, string>();
  const sortOrderByParent = new Map<string | undefined, number>();

  await prisma.$transaction(async (tx) => {
    await lockBudgetForEconomicEdit(tx, budgetId, ctx.tenantId);

    if (options?.replaceExisting && existingNodes.length > 0) {
      const nodeIds = existingNodes.map((n) => n.id);
      const [certLines, poLines, jobsiteRefs] = await Promise.all([
        tx.certificationLine.count({ where: { wbsNodeId: { in: nodeIds } } }),
        tx.purchaseOrderLine.count({ where: { wbsNodeId: { in: nodeIds } } }),
        tx.jobsiteLogProgress.count({ where: { wbsNodeId: { in: nodeIds } } }),
      ]);
      if (certLines > 0 || poLines > 0 || jobsiteRefs > 0) {
        throw new ServiceError(
          "CONFLICT",
          "No se puede reemplazar la EDT: hay certificaciones, compras o libro de obra vinculados a ítems existentes.",
        );
      }
      await tx.costAnalysisLine.deleteMany({ where: { budgetId } });
      await tx.costItem.deleteMany({ where: { budgetId } });
      await tx.wbsNode.deleteMany({ where: { budgetId } });
    }

    for (const row of sorted) {
      const parentKey = row.parent_code;
      const sortOrder = sortOrderByParent.get(parentKey) ?? 0;
      sortOrderByParent.set(parentKey, sortOrder + 1);
      const parentId = row.parent_code ? codeToId.get(row.parent_code) ?? null : null;
      if (row.parent_code && !parentId) {
        throw new ServiceError("CONFLICT", `Padre no resuelto: ${row.parent_code}`);
      }

      const node = await tx.wbsNode.create({
        data: {
          budgetId,
          parentId,
          type: row.type,
          code: row.code,
          name: row.name,
          description: row.description ?? null,
          sortOrder,
        },
      });
      codeToId.set(row.code, node.id);
      createdNodes += 1;

      if (row.type === "ITEM") {
        const costItem = await tx.costItem.create({
          data: {
            budgetId,
            wbsNodeId: node.id,
            unit: row.unit ?? "",
            quantity: new Prisma.Decimal(row.quantity ?? "0"),
            notes: row.notes ?? null,
          },
        });
        createdItems += 1;

        // full mode: materialize category unit costs as APU lines (unit mode, coef=1).
        if (mode === "full") {
          const categoryAmounts: Array<{
            category: "MATERIAL" | "LABOR" | "EQUIPMENT" | "SUBCONTRACT" | "OTHER";
            amount: string;
            label: string;
          }> = [
            { category: "MATERIAL", amount: row.material_cost ?? "0.00", label: "Materiales (import)" },
            { category: "LABOR", amount: row.labor_cost ?? "0.00", label: "Mano de obra (import)" },
            { category: "EQUIPMENT", amount: row.equipment_cost ?? "0.00", label: "Equipos (import)" },
            { category: "SUBCONTRACT", amount: row.subcontract_cost ?? "0.00", label: "Subcontratos (import)" },
            { category: "OTHER", amount: row.other_cost ?? "0.00", label: "Otros (import)" },
          ];
          let sortOrder = 0;
          for (const entry of categoryAmounts) {
            if (/^-?0+(\.0+)?$/.test(entry.amount)) continue;
            const money = toMoneyDecimal(entry.amount);
            await tx.costAnalysisLine.create({
              data: {
                costItemId: costItem.id,
                budgetId,
                category: entry.category,
                description: entry.label,
                unit: row.unit?.trim() || "un",
                coefficient: 1,
                unitCost: money,
                totalCost: money,
                partidaQuantity: null,
                isLumpSum: false,
                sortOrder: sortOrder++,
              },
            });
          }
        }
      }
    }

    if (mode === "full") {
      await _recalcAllItems(tx, budgetId);
    } else {
      await _recalcBudgetSummary(tx, budgetId);
    }
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "wbs.imported",
    entityType: "Budget",
    entityId: budgetId,
    projectId: budget.projectId,
    after: {
      createdNodes,
      createdItems,
      mode,
      ...approvedEditOverrideAuditMeta(budget.status),
    },
    ipAddress: ctx.ipAddress,
  });

  return { createdNodes, createdItems };
}

function topologicalSortRows(rows: BudgetImportRow[]): BudgetImportRow[] {
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const sorted: BudgetImportRow[] = [];
  const done = new Set<string>();

  function visit(code: string) {
    if (done.has(code)) return;
    const row = byCode.get(code);
    if (!row) return;
    if (row.parent_code) visit(row.parent_code);
    if (!done.has(code)) {
      done.add(code);
      sorted.push(row);
    }
  }

  for (const row of rows) visit(row.code);
  return sorted;
}
