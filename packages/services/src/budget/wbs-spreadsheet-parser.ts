import type { BudgetImportRow } from "@bloqer/validators";
import {
  detectImportProfile,
  inferNodeType,
  parentCodeFrom,
  parseCellA,
  validateCanonicalCode,
  type WbsImportProfile,
} from "./wbs-code-rules";

export type SpreadsheetParseError = {
  row: number;
  field: string;
  message: string;
};

export type ParsedSpreadsheetRow = BudgetImportRow & {
  _sourceRow: number;
  _profile: WbsImportProfile;
};

export type SpreadsheetParseResult = {
  profile: WbsImportProfile;
  rows: ParsedSpreadsheetRow[];
  errors: SpreadsheetParseError[];
  skippedRows: number;
};

const SKIP_NAME_PATTERNS = /^(total|presupuesto|subtotal|importe|%)/i;

/** @deprecated Use parseCellA from wbs-code-rules */
export function normalizeItemCode(raw: unknown): string | null {
  const parsed = parseCellA(raw, null);
  if (parsed.kind === "numbered") return parsed.canonical;
  return null;
}

function cellString(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).trim();
}

/**
 * Parsea filas crudas (columna A = código, B = nombre, C = unidad).
 * Auto-detecta perfil simple vs multi-rubro (ARQ, EST, …).
 */
export function parseNumberedSpreadsheetRows(rawRows: unknown[][]): SpreadsheetParseResult {
  const errors: SpreadsheetParseError[] = [];
  let skippedRows = 0;

  type NumberedDraft = {
    rowNum: number;
    discipline: string | null;
    numeric: string;
    name: string;
    unit?: string;
  };

  const numberedDrafts: NumberedDraft[] = [];
  const bannerByDiscipline = new Map<string, { name: string; rowNum: number }>();

  rawRows.forEach((rawRow, idx) => {
    const rowNum = idx + 1;
    const parsed = parseCellA(rawRow[0], rawRow[1]);
    const name = cellString(rawRow[1]);

    if (parsed.kind === "empty") {
      skippedRows += 1;
      return;
    }

    if (parsed.kind === "banner") {
      if (!name || SKIP_NAME_PATTERNS.test(name)) {
        skippedRows += 1;
        return;
      }
      bannerByDiscipline.set(parsed.discipline, { name, rowNum });
      return;
    }

    if (!name || SKIP_NAME_PATTERNS.test(name)) {
      skippedRows += 1;
      return;
    }

    const unit = cellString(rawRow[2]) || undefined;
    numberedDrafts.push({
      rowNum,
      discipline: parsed.discipline,
      numeric: parsed.numeric,
      name,
      unit,
    });
  });

  const profile = detectImportProfile(
    numberedDrafts.map((d) => ({ discipline: d.discipline, numeric: d.numeric })),
  );

  const rows: ParsedSpreadsheetRow[] = [];
  const seenCodes = new Set<string>();

  if (profile === "multi_discipline") {
    const disciplines = new Set<string>();
    for (const d of numberedDrafts) {
      if (d.discipline) disciplines.add(d.discipline);
    }
    for (const [discipline, banner] of bannerByDiscipline) {
      disciplines.add(discipline);
    }

    for (const discipline of [...disciplines].sort()) {
      const banner = bannerByDiscipline.get(discipline);
      const code = discipline;
      if (seenCodes.has(code)) continue;
      seenCodes.add(code);
      rows.push({
        code,
        type: "GROUP",
        name: banner?.name ?? discipline,
        quantity: 0,
        _sourceRow: banner?.rowNum ?? 0,
        _profile: profile,
      });
    }
  }

  for (const draft of numberedDrafts) {
    const canonical =
      profile === "multi_discipline" && draft.discipline
        ? `${draft.discipline}.${draft.numeric}`
        : draft.numeric;

    if (seenCodes.has(canonical)) {
      errors.push({
        row: draft.rowNum,
        field: "code",
        message: `Código duplicado en la importación: "${canonical}"`,
      });
      continue;
    }

    const type = inferNodeType(canonical, draft.unit, profile);
    const structureError = validateCanonicalCode(canonical, type, draft.unit, profile);
    if (structureError) {
      errors.push({ row: draft.rowNum, field: "code", message: structureError });
      continue;
    }

    seenCodes.add(canonical);
    rows.push({
      code: canonical,
      parent_code: parentCodeFrom(canonical),
      type,
      name: draft.name,
      unit: type === "ITEM" ? draft.unit : undefined,
      quantity: 0,
      _sourceRow: draft.rowNum,
      _profile: profile,
    });
  }

  rows.sort((a, b) => {
    if (a._sourceRow === 0 && b._sourceRow !== 0) return -1;
    if (b._sourceRow === 0 && a._sourceRow !== 0) return 1;
    return a._sourceRow - b._sourceRow;
  });

  return { profile, rows, errors, skippedRows };
}
