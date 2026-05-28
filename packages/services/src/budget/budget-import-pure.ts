// Pure WBS import parsing/validation (safe for client bundles — no Prisma).

import { budgetImportRowSchema, IMPORT_TEMPLATE_COLUMNS } from "@bloqer/validators";
import type { BudgetImportRow } from "@bloqer/validators";
import { parseNumberedSpreadsheetRows } from "./wbs-spreadsheet-parser";
import type { WbsImportProfile } from "./wbs-code-rules";

export { IMPORT_TEMPLATE_COLUMNS };
export { parseNumberedSpreadsheetRows, normalizeItemCode } from "./wbs-spreadsheet-parser";
export type {
  SpreadsheetParseError,
  SpreadsheetParseResult,
  SpreadsheetParseWarning,
} from "./wbs-spreadsheet-parser";
export {
  countCodeSegments,
  isMultiStyleCode,
  WBS_MAX_CODE_SEGMENTS_SIMPLE,
  WBS_MAX_CODE_SEGMENTS_MULTI,
} from "./wbs-code-rules";
export type { WbsImportProfile } from "./wbs-code-rules";

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
  profile: WbsImportProfile;
};

export type PreviewResult = {
  valid: boolean;
  profile: WbsImportProfile;
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

  return { validRows, errors, profile: "simple" };
}

export function parseSpreadsheetForImport(rawRows: unknown[][]): ParseResult & {
  skippedRows: number;
  warnings: ImportWarning[];
} {
  const {
    profile,
    rows,
    errors: sheetErrors,
    warnings: sheetWarnings,
    skippedRows,
  } = parseNumberedSpreadsheetRows(rawRows);
  const sheetErrorsMapped: ImportError[] = sheetErrors.map((e) => ({
    row: e.row,
    field: e.field,
    message: e.message,
  }));
  const sheetWarningsMapped: ImportWarning[] = sheetWarnings.map((w) => ({
    row: w.row,
    message: w.message,
  }));

  if (rows.length > 0) {
    const { validRows, errors: parseErrors } = parseImportRows(
      rows.map(({ _sourceRow: _, _profile: __, ...row }) => row),
    );
    const rowByCode = new Map(rows.map((r) => [r.code, r._sourceRow]));
    return {
      profile,
      validRows: validRows.map((r) => ({ ...r, _row: rowByCode.get(r.code) ?? 0 })),
      errors: [...sheetErrorsMapped, ...parseErrors],
      warnings: sheetWarningsMapped,
      skippedRows,
    };
  }

  const objectRows = rawRows.filter((r) => r && typeof r === "object" && !Array.isArray(r));
  if (objectRows.length > 0) {
    const { validRows, errors } = parseImportRows(objectRows);
    return { profile: "simple", validRows, errors, warnings: [], skippedRows: 0 };
  }

  return {
    profile,
    validRows: [],
    errors: sheetErrorsMapped,
    warnings: sheetWarningsMapped,
    skippedRows,
  };
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

    if (row.type === "ITEM" && mode === "full") {
      if (!row.unit?.trim()) {
        errors.push({ row: row._row, field: "unit", message: "Los ítems requieren unidad de medida" });
      }
      if (row.quantity === undefined || row.quantity === null) {
        errors.push({ row: row._row, field: "quantity", message: "Los ítems requieren cantidad" });
      }
    }

    if (row.type === "GROUP") {
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
  const {
    profile,
    validRows,
    errors: parseErrors,
    warnings: parseWarnings,
  } = parseSpreadsheetForImport(rawRows);
  const { errors: validationErrors, warnings: validationWarnings } = validateImportRows(
    validRows,
    existingCodes,
    mode,
  );
  const allErrors = [...parseErrors, ...validationErrors];
  const warnings = [...parseWarnings, ...validationWarnings];

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
    profile,
    rows,
    errors: allErrors,
    warnings,
  };
}
