// Budget CSV/XLSX import — server-side execute and preview with tenant checks.

import { prisma } from "@bloqer/database";
import type { BudgetImportRow } from "@bloqer/validators";
import { can } from "@bloqer/domain";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";
import { assertBudgetEditable, assertBudgetWbsStructureMutable } from "./budget.service";
import { _recalcBudgetSummary } from "./budget-calc.service";
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
  assertBudgetEditable(budget);

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
  assertBudgetEditable(budget);
  await assertBudgetWbsStructureMutable(budget, ctx);

  const existingNodes = await prisma.wbsNode.findMany({
    where: { budgetId },
    select: { id: true, code: true },
  });
  const existingCodes = existingNodes.map((n) => n.code);

  if (existingCodes.length > 0 && !options?.replaceExisting) {
    throw new ServiceError(
      "CONFLICT",
      "El presupuesto ya tiene nodos WBS. Eliminá la estructura existente o usá reemplazar en la importación.",
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

  if (options?.replaceExisting && existingNodes.length > 0) {
    const nodeIds = existingNodes.map((n) => n.id);
    const [certLines, poLines, jobsiteRefs] = await Promise.all([
      prisma.certificationLine.count({ where: { wbsNodeId: { in: nodeIds } } }),
      prisma.purchaseOrderLine.count({ where: { wbsNodeId: { in: nodeIds } } }),
      prisma.jobsiteLogProgress.count({ where: { wbsNodeId: { in: nodeIds } } }),
    ]);
    if (certLines > 0 || poLines > 0 || jobsiteRefs > 0) {
      throw new ServiceError(
        "CONFLICT",
        "No se puede reemplazar el WBS: hay certificaciones, compras o libro de obra vinculados a ítems existentes.",
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    if (options?.replaceExisting && existingNodes.length > 0) {
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
        await tx.costItem.create({
          data: {
            budgetId,
            wbsNodeId: node.id,
            unit: row.unit ?? "",
            quantity: row.quantity ?? 0,
            notes: row.notes ?? null,
          },
        });
        createdItems += 1;
      }
    }

    await _recalcBudgetSummary(tx, budgetId);
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "wbs.imported",
    entityType: "Budget",
    entityId: budgetId,
    after: { createdNodes, createdItems, mode },
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
