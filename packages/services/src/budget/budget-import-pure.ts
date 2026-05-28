// Pure WBS import parsing/validation (safe for client bundles — no Prisma).

import { budgetImportRowSchema } from "@bloqer/validators";
import type { BudgetImportRow } from "@bloqer/validators";
import { parseNumberedSpreadsheetRows } from "./wbs-spreadsheet-parser";

const WBS_MAX_CODE_SEGMENTS = 3;

function countCodeSegments(code: string): number {
  return code.split(".").filter((s) => s.length > 0).length;
}

import { IMPORT_TEMPLATE_COLUMNS } from "@bloqer/validators";

export { IMPORT_TEMPLATE_COLUMNS };
export { parseNumberedSpreadsheetRows, normalizeItemCode } from "./wbs-spreadsheet-parser";
export type { SpreadsheetParseError, SpreadsheetParseResult } from "./wbs-spreadsheet-parser";

export type ImportError = {
  row: number;
  field: string;
  message: string;
};

export type ImportWarning = {
  row: number;
  message: string;
};

export type ImportMode = "structure_only" | "full";

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

export function parseSpreadsheetForImport(rawRows: unknown[][]): {
  validRows: (BudgetImportRow & { _row: number })[];
  errors: ImportError[];
  skippedRows: number;
} {
  const { rows, errors: sheetErrors, skippedRows } = parseNumberedSpreadsheetRows(rawRows);
  const sheetErrorsMapped: ImportError[] = sheetErrors.map((e) => ({
    row: e.row,
    field: e.field,
    message: e.message,
  }));

  if (rows.length > 0) {
    const { validRows, errors: parseErrors } = parseImportRows(
      rows.map(({ _sourceRow: _, ...row }) => row),
    );
    const rowByCode = new Map(rows.map((r) => [r.code, r._sourceRow]));
    return {
      validRows: validRows.map((r) => ({ ...r, _row: rowByCode.get(r.code) ?? 0 })),
      errors: [...sheetErrorsMapped, ...parseErrors],
      skippedRows,
    };
  }

  const objectRows = rawRows.filter((r) => r && typeof r === "object" && !Array.isArray(r));
  if (objectRows.length > 0) {
    const { validRows, errors } = parseImportRows(objectRows);
    return { validRows, errors, skippedRows: 0 };
  }

  return { validRows: [], errors: sheetErrorsMapped, skippedRows };
}

export function validateImportRows(
  rows: (BudgetImportRow & { _row: number })[],
  existingCodes: string[],
  mode: ImportMode = "structure_only",
): { errors: ImportError[]; warnings: ImportWarning[] } {
  const errors: ImportError[] = [];
  const warnings: ImportWarning[] = [];
  const seenCodes = new Set<string>();
  const existingSet = new Set(existingCodes);

  for (const row of rows) {
    if (seenCodes.has(row.code)) {
      errors.push({ row: row._row, field: "code", message: `Código duplicado en la importación: "${row.code}"` });
    }
    seenCodes.add(row.code);

    if (existingSet.has(row.code)) {
      errors.push({
        row: row._row,
        field: "code",
        message: `Ya existe un nodo con el código "${row.code}" en este presupuesto`,
      });
    }

    if (row.type === "ITEM") {
      if (!row.unit?.trim()) {
        errors.push({ row: row._row, field: "unit", message: "Los ítems requieren unidad de medida" });
      }
      if (mode === "full" && (row.quantity === undefined || row.quantity === null)) {
        errors.push({ row: row._row, field: "quantity", message: "Los ítems requieren cantidad" });
      }
    }

    if (row.type === "GROUP") {
      const segments = countCodeSegments(row.code);
      if (segments > 2) {
        errors.push({
          row: row._row,
          field: "code",
          message: `El capítulo "${row.code}" supera 2 niveles; use un ítem hoja con unidad`,
        });
      }
      const hasCosts =
        row.material_cost ||
        row.labor_cost ||
        row.equipment_cost ||
        row.subcontract_cost ||
        row.other_cost;
      if (hasCosts) {
        warnings.push({
          row: row._row,
          message: `El nodo GROUP "${row.code}" tiene costos; serán ignorados`,
        });
      }
    }

    if (row.type === "ITEM") {
      const segments = countCodeSegments(row.code);
      if (segments < 2) {
        errors.push({
          row: row._row,
          field: "code",
          message: `El ítem "${row.code}" debe tener al menos dos segmentos (p. ej. 1.1)`,
        });
      }
      if (segments > WBS_MAX_CODE_SEGMENTS) {
        errors.push({
          row: row._row,
          field: "code",
          message: `El ítem "${row.code}" supera ${WBS_MAX_CODE_SEGMENTS} niveles`,
        });
      }
    }
  }

  const typeByCode = new Map(rows.map((r) => [r.code, r.type]));
  for (const row of rows) {
    if (!row.parent_code) continue;
    const parentType = typeByCode.get(row.parent_code);
    if (parentType === "ITEM") {
      errors.push({
        row: row._row,
        field: "parent_code",
        message: `El padre "${row.parent_code}" es un ítem; no puede tener hijos`,
      });
    }
  }

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

export function previewSpreadsheetImport(
  rawRows: unknown[][],
  existingCodes: string[] = [],
  mode: ImportMode = "structure_only",
): PreviewResult {
  const { validRows, errors: parseErrors } = parseSpreadsheetForImport(rawRows);
  const { errors: validationErrors, warnings } = validateImportRows(validRows, existingCodes, mode);
  const allErrors = [...parseErrors, ...validationErrors];

  const rows = validRows.map((r) => ({
    ...r,
    _parentResolved:
      !r.parent_code ||
      existingCodes.includes(r.parent_code) ||
      validRows.some((vr) => vr.code === r.parent_code),
  }));

  if (validRows.length === 0 && allErrors.length === 0) {
    allErrors.push({
      row: 0,
      field: "general",
      message: "No se encontraron filas WBS válidas en el archivo",
    });
  }

  return {
    valid: allErrors.length === 0 && validRows.length > 0,
    rows,
    errors: allErrors,
    warnings,
  };
}
