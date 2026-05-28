import type { BudgetImportRow } from "@bloqer/validators";

export type SpreadsheetParseError = {
  row: number;
  field: string;
  message: string;
};

export type ParsedSpreadsheetRow = BudgetImportRow & { _sourceRow: number };

export type SpreadsheetParseResult = {
  rows: ParsedSpreadsheetRow[];
  errors: SpreadsheetParseError[];
  skippedRows: number;
};

const CODE_PATTERN = /^\d+(\.\d+)*$/;
const SKIP_NAME_PATTERNS = /^(total|presupuesto|subtotal|importe|%)/i;

/** Normaliza celda A: "ARQ 1.1.1" → "1.1.1" (incluye celdas numéricas de Excel). */
export function normalizeItemCode(raw: unknown): string | null {
  if (raw == null) return null;
  let s: string;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    s = Number.isInteger(raw) ? String(raw) : String(raw);
  } else {
    s = String(raw).trim();
  }
  if (!s) return null;

  const withoutPrefix = s.replace(/^[A-Za-zÁÉÍÓÚáéíóúñÑ]+\s*/u, "").trim();
  if (!CODE_PATTERN.test(withoutPrefix)) return null;
  return withoutPrefix;
}

function parentCodeFrom(code: string): string | undefined {
  const idx = code.lastIndexOf(".");
  if (idx === -1) return undefined;
  return code.slice(0, idx);
}

function inferNodeType(code: string, unit: string | undefined): "GROUP" | "ITEM" {
  const segments = code.split(".").filter(Boolean).length;
  const hasUnit = Boolean(unit?.trim());
  if (hasUnit) return "ITEM";
  if (segments >= 3) return "ITEM";
  return "GROUP";
}

function cellString(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).trim();
}

/**
 * Parsea filas crudas de hoja (columna A = código, B = nombre, C = unidad).
 * Perfil: presupuesto oficial con numeración en columna A.
 */
export function parseNumberedSpreadsheetRows(rawRows: unknown[][]): SpreadsheetParseResult {
  const rows: ParsedSpreadsheetRow[] = [];
  const errors: SpreadsheetParseError[] = [];
  let skippedRows = 0;

  rawRows.forEach((rawRow, idx) => {
    const rowNum = idx + 1;
    const colA = rawRow[0];
    const colB = rawRow[1];
    const colC = rawRow[2];

    const code = normalizeItemCode(colA);
    if (!code) {
      skippedRows += 1;
      return;
    }

    const name = cellString(colB);
    if (!name || SKIP_NAME_PATTERNS.test(name)) {
      skippedRows += 1;
      return;
    }

    const unit = cellString(colC) || undefined;
    const segments = code.split(".").filter(Boolean).length;

    if (segments > 3) {
      errors.push({
        row: rowNum,
        field: "code",
        message: `El código "${code}" supera 3 niveles de profundidad`,
      });
      return;
    }

    const type = inferNodeType(code, unit);

    if (type === "ITEM" && segments === 1) {
      errors.push({
        row: rowNum,
        field: "code",
        message: `El ítem "${code}" debe estar bajo un capítulo (p. ej. 1.1 o 1.1.1)`,
      });
      return;
    }

    if (type === "GROUP" && segments >= 3) {
      errors.push({
        row: rowNum,
        field: "unit",
        message: `El código "${code}" requiere unidad en columna C para ser ítem hoja`,
      });
      return;
    }

    rows.push({
      code,
      parent_code: parentCodeFrom(code),
      type,
      name,
      unit: type === "ITEM" ? unit : undefined,
      quantity: 0,
      _sourceRow: rowNum,
    });
  });

  return { rows, errors, skippedRows };
}
