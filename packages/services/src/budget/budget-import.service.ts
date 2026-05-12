// Budget CSV/XLSX import foundation.
// Full UI upload deferred; service contract and validation are implemented now.
// executeImport: future work — see comment below.

import { prisma } from "@bloqer/database";
import { budgetImportRowSchema, IMPORT_TEMPLATE_COLUMNS } from "@bloqer/validators";
import type { BudgetImportRow } from "@bloqer/validators";
import { ServiceContext, ServiceError } from "../types";
import { assertBudgetEditable } from "./budget.service";

export { IMPORT_TEMPLATE_COLUMNS };

export type ImportError = {
  row: number;
  field: string;
  message: string;
};

export type ImportWarning = {
  row: number;
  message: string;
};

export type ParseResult = {
  validRows: (BudgetImportRow & { _row: number })[];
  errors: ImportError[];
};

export type PreviewResult = {
  valid: boolean;
  rows: (BudgetImportRow & { _row: number; _parentResolved: boolean })[];
  errors: ImportError[];
  warnings: ImportWarning[];
};

// ─── Parse raw unknown rows into typed + validated rows ───────────────────────

export function parseImportRows(rawRows: unknown[]): ParseResult {
  const validRows: (BudgetImportRow & { _row: number })[] = [];
  const errors: ImportError[] = [];

  rawRows.forEach((raw, idx) => {
    const rowNum = idx + 1;
    const result = budgetImportRowSchema.safeParse(raw);
    if (!result.success) {
      result.error.issues.forEach((issue) => {
        errors.push({
          row: rowNum,
          field: issue.path.join(".") || "general",
          message: issue.message,
        });
      });
    } else {
      validRows.push({ ...result.data, _row: rowNum });
    }
  });

  return { validRows, errors };
}

// ─── Validate import rows against business rules ──────────────────────────────

export function validateImportRows(
  rows: (BudgetImportRow & { _row: number })[],
  existingCodes: string[],
): { errors: ImportError[]; warnings: ImportWarning[] } {
  const errors: ImportError[] = [];
  const warnings: ImportWarning[] = [];
  const seenCodes = new Set<string>();
  const existingSet = new Set(existingCodes);

  for (const row of rows) {
    // Duplicate codes within import batch
    if (seenCodes.has(row.code)) {
      errors.push({ row: row._row, field: "code", message: `Código duplicado en la importación: "${row.code}"` });
    }
    seenCodes.add(row.code);

    // Collision with existing WBS
    if (existingSet.has(row.code)) {
      errors.push({ row: row._row, field: "code", message: `Ya existe un nodo con el código "${row.code}" en este presupuesto` });
    }

    // ITEM requires unit + quantity
    if (row.type === "ITEM") {
      if (!row.unit) {
        errors.push({ row: row._row, field: "unit", message: "Los ítems requieren unidad de medida" });
      }
      if (row.quantity === undefined || row.quantity === null) {
        errors.push({ row: row._row, field: "quantity", message: "Los ítems requieren cantidad" });
      }
    }

    // GROUP should not have cost fields
    if (row.type === "GROUP") {
      const hasCosts = row.material_cost || row.labor_cost || row.equipment_cost || row.subcontract_cost || row.other_cost;
      if (hasCosts) {
        warnings.push({ row: row._row, message: `El nodo GROUP "${row.code}" tiene costos; serán ignorados` });
      }
    }
  }

  // Validate parent_code references exist (either in batch or existing)
  const allCodes = new Set([...seenCodes, ...existingSet]);
  for (const row of rows) {
    if (row.parent_code && !allCodes.has(row.parent_code)) {
      errors.push({
        row: row._row,
        field: "parent_code",
        message: `El código padre "${row.parent_code}" no existe en el presupuesto ni en la importación`,
      });
    }
  }

  // Validate parent ordering (parent must appear before child in the batch)
  const processedCodes = new Set(existingSet);
  for (const row of rows) {
    if (row.parent_code && !processedCodes.has(row.parent_code)) {
      errors.push({
        row: row._row,
        field: "parent_code",
        message: `El padre "${row.parent_code}" debe aparecer antes que su hijo "${row.code}" en el archivo`,
      });
    }
    processedCodes.add(row.code);
  }

  return { errors, warnings };
}

// ─── Preview — dry-run with full validation ───────────────────────────────────

export async function previewImport(
  budgetId: string,
  rawRows: unknown[],
  ctx: ServiceContext,
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

  const { validRows, errors: parseErrors } = parseImportRows(rawRows);
  const { errors: validationErrors, warnings } = validateImportRows(validRows, existingCodes);
  const allErrors = [...parseErrors, ...validationErrors];

  const rows = validRows.map((r) => ({
    ...r,
    _parentResolved: !r.parent_code || existingCodes.includes(r.parent_code) || validRows.some((vr) => vr.code === r.parent_code),
  }));

  return {
    valid: allErrors.length === 0,
    rows,
    errors: allErrors,
    warnings,
  };
}

// ─── executeImport ────────────────────────────────────────────────────────────
// Future work: implement after UI upload phase.
// Contract: accepts validated PreviewResult.rows, creates WbsNode + CostItem + CostAnalysisLines
// in a transaction, in topological order (parents before children).
// Must call _recalcAllItems at the end.
// Must reject if budget is not editable.
