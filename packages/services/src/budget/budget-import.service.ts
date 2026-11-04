// Budget CSV/XLSX import — server-side execute and preview with tenant checks.

import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "@bloqer/database";
import type { BudgetImportRow } from "@bloqer/validators";
import { can } from "@bloqer/domain";
import { log } from "../audit/audit.service";
import { toMoneyDecimal } from "../finance/money-decimal";
import { ServiceContext, ServiceError } from "../types";
import { assertProjectAllowsBudgetPlanning } from "../project/project-operational-guard";
import { assertTenantModuleEnabled } from "../tenant-modules/tenant-module.service";
import { isCrossCompany } from "../company-scope";
import {
  approvedEditOverrideAuditMeta,
  assertBudgetWbsStructureMutable,
  lockBudgetForEconomicEdit,
} from "./budget.service";
import { _recalcBudgetSummary } from "./budget-calc.service";
import { computeBudgetItemUnitSaleBreakdown } from "./budget-sale-calc";
import { assertBudgetDecimalFits } from "./budget-decimal";
import {
  detectProfileFromImportRows,
  reconcileImportRowTypes,
} from "./wbs-code-rules";
import {
  type ImportMode,
  type PreviewResult,
  previewSpreadsheetImport,
  parseImportRows,
  validateImportRows,
} from "./budget-import-pure";
import { assertWbsSubtreeDeletable } from "./wbs.service";

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
  if (!can(ctx.roles, "EDIT", "BUDGETS")) throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  await assertTenantModuleEnabled(ctx, "BUDGETS");
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(budget.companyId, ctx)) throw new ServiceError("FORBIDDEN", "Presupuesto de otra empresa");
  await assertProjectAllowsBudgetPlanning(budget.projectId, ctx);
  await assertBudgetWbsStructureMutable(budget, ctx);

  // Execution supports an empty budget or replacement, never appending nodes.
  // Existing codes must not invalidate a file intended to replace that tree.
  return previewSpreadsheetImport(rawRows, [], mode);
}

export async function executeImport(
  budgetId: string,
  rows: BudgetImportRow[],
  ctx: ServiceContext,
  options?: { mode?: ImportMode; replaceExisting?: boolean; },
): Promise<ExecuteImportResult> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  await assertTenantModuleEnabled(ctx, "BUDGETS");

  const mode = options?.mode ?? "structure_only";
  if (mode !== "structure_only" && mode !== "full") throw new ServiceError("VALIDATION", "Modo de importación inválido");
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsBudgetPlanning(budget.projectId, ctx);

  const parsed = parseImportRows(rows);
  if (parsed.errors.length > 0) throw new ServiceError("VALIDATION", parsed.errors[0]!.message);
  const profile = detectProfileFromImportRows(parsed.validRows);
  const normalizedRows = reconcileImportRowTypes(parsed.validRows, profile);
  const numbered = normalizedRows.map((r, i) => ({ ...r, _row: i + 1 }));
  const { errors } = validateImportRows(numbered, [], mode);
  if (errors.length > 0) {
    throw new ServiceError("CONFLICT", errors[0]!.message);
  }

  const sorted = topologicalSortRows(normalizedRows);

  let createdNodes = 0;
  let createdItems = 0;
  const codeToId = new Map(sorted.map((row) => [row.code, randomUUID()]));
  const sortOrderByParent = new Map<string | undefined, number>();

  await prisma.$transaction(async (tx) => {
    const currentBudget = await lockBudgetForEconomicEdit(tx, budgetId, ctx);
    await assertBudgetWbsStructureMutable(currentBudget, ctx, tx);
    const existingNodes = await tx.wbsNode.findMany({ where: { budgetId }, select: { id: true, code: true } });
    if (existingNodes.length > 0 && !options?.replaceExisting) throw new ServiceError("CONFLICT", "El presupuesto ya tiene nodos EDT. Eliminá la estructura existente o usá reemplazar en la importación.");

    if (options?.replaceExisting && existingNodes.length > 0) {
      const nodeIds = existingNodes.map((n) => n.id);
      await assertWbsSubtreeDeletable(tx, nodeIds);
      await tx.costAnalysisLine.deleteMany({ where: { budgetId } });
      await tx.costItem.deleteMany({ where: { budgetId } });
      await tx.wbsNode.deleteMany({ where: { budgetId } });
    }

    const settings = mode === "full" ? await tx.budgetSettings.findUniqueOrThrow({ where: { budgetId } }) : null;
    const nodesToCreate: Prisma.WbsNodeCreateManyInput[] = [];
    const itemsToCreate: Prisma.CostItemCreateManyInput[] = [];
    const linesToCreate: Prisma.CostAnalysisLineCreateManyInput[] = [];
    for (const row of sorted) {
      const parentKey = row.parent_code;
      const sortOrder = sortOrderByParent.get(parentKey) ?? 0;
      sortOrderByParent.set(parentKey, sortOrder + 1);
      const parentId = row.parent_code ? codeToId.get(row.parent_code) ?? null : null;
      if (row.parent_code && !parentId) {
        throw new ServiceError("CONFLICT", `Padre no resuelto: ${row.parent_code}`);
      }

      const nodeId = codeToId.get(row.code)!;
      nodesToCreate.push({
        id: nodeId,
        budgetId,
        parentId,
        type: row.type,
        code: row.code,
        name: row.name,
        description: row.description ?? null,
        sortOrder,
      });
      createdNodes += 1;

      if (row.type === "ITEM") {
        const costItemId = randomUUID();
        const quantity = mode === "full" ? new Prisma.Decimal(row.quantity ?? "0") : new Prisma.Decimal(0);
        assertBudgetDecimalFits(quantity, "Cantidad importada");
        const costItem: Prisma.CostItemCreateManyInput = {
          id: costItemId,
          budgetId,
          wbsNodeId: nodeId,
          unit: mode === "full" ? row.unit ?? "" : "",
          quantity,
          notes: row.notes ?? null,
        };
        itemsToCreate.push(costItem);
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
          let directUnitCost = new Prisma.Decimal(0);
          for (const entry of categoryAmounts) {
            if (/^-?0+(\.0+)?$/.test(entry.amount)) continue;
            const money = toMoneyDecimal(entry.amount);
            directUnitCost = directUnitCost.plus(money);
            linesToCreate.push({
              id: randomUUID(),
              costItemId,
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
            });
          }
          const unitCostDirect = toMoneyDecimal(directUnitCost);
          const sale = computeBudgetItemUnitSaleBreakdown(unitCostDirect.toString(), {
            overheadPct: settings!.overheadPct.toString(), financialCostPct: settings!.financialCostPct.toString(),
            financialDaysAvg: settings!.financialDaysAvg, profitPct: settings!.profitPct.toString(), taxPct: settings!.taxPct.toString(),
          });
          const unitSalePrice = new Prisma.Decimal(sale.totalSale);
          const amounts = { unitCostDirect, unitSalePrice, totalCostDirect: toMoneyDecimal(unitCostDirect.times(quantity)), totalSalePrice: toMoneyDecimal(unitSalePrice.times(quantity)) };
          for (const amount of Object.values(amounts)) assertBudgetDecimalFits(amount, "Importe importado");
          Object.assign(costItem, amounts);
        }
      }
    }

    // Insert a whole level-independent graph in three statements, rather than
    // two or more network round-trips for every spreadsheet row.
    await tx.wbsNode.createMany({ data: nodesToCreate });
    if (itemsToCreate.length > 0) await tx.costItem.createMany({ data: itemsToCreate });
    if (linesToCreate.length > 0) await tx.costAnalysisLine.createMany({ data: linesToCreate });
    await _recalcBudgetSummary(tx, budgetId);
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
        ...approvedEditOverrideAuditMeta(currentBudget.status),
      },
      ipAddress: ctx.ipAddress,
    }, tx);
  }, { maxWait: 10_000, timeout: 30_000 });

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
