/**
 * Bloqer bank statement CSV ([D-076]).
 *
 * Required headers (EN or ES, case-insensitive):
 *   date|fecha, description|descripcion, amount|monto|importe, direction|direccion|tipo
 * Optional: reference|referencia
 *
 * Separator: `,` or `;` (auto-detect). Amount always positive. Direction: CREDIT|DEBIT
 * (aliases: crédito/débito, C/D, ingreso/egreso). Dates: YYYY-MM-DD or DD/MM/YYYY.
 */

import { roundMoney } from "@bloqer/utils";

export const BANK_STATEMENT_CSV_MAX_ROWS = 500;

export type ParsedBankStatementCsvLine = {
  lineDate: string;
  description: string;
  amount: string;
  direction: "CREDIT" | "DEBIT";
  reference: string | null;
  rowNumber: number;
};

export type ParseBankStatementCsvResult =
  | { ok: true; lines: ParsedBankStatementCsvLine[] }
  | { ok: false; error: string };

function detectDelimiter(headerLine: string): "," | ";" {
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semicolons = (headerLine.match(/;/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

function parseCsvLine(line: string, delimiter: "," | ";"): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function mapHeader(raw: string): string | null {
  const h = normalizeHeader(raw);
  if (h === "date" || h === "fecha") return "date";
  if (h === "description" || h === "descripcion" || h === "concepto" || h === "detalle") {
    return "description";
  }
  if (h === "amount" || h === "monto" || h === "importe") return "amount";
  if (h === "direction" || h === "direccion" || h === "tipo") return "direction";
  if (h === "reference" || h === "referencia" || h === "ref") return "reference";
  return null;
}

function parseDirection(raw: string): "CREDIT" | "DEBIT" | null {
  const v = normalizeHeader(raw);
  if (
    v === "credit" ||
    v === "credito" ||
    v === "c" ||
    v === "ingreso" ||
    v === "inflow" ||
    v === "+"
  ) {
    return "CREDIT";
  }
  if (
    v === "debit" ||
    v === "debito" ||
    v === "d" ||
    v === "egreso" ||
    v === "outflow" ||
    v === "-"
  ) {
    return "DEBIT";
  }
  return null;
}

function parseDate(raw: string): string | null {
  const s = raw.trim();
  let iso: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    iso = s;
  } else {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const dd = m[1]!.padStart(2, "0");
      const mm = m[2]!.padStart(2, "0");
      const yyyy = m[3]!;
      iso = `${yyyy}-${mm}-${dd}`;
    }
  }
  if (!iso) return null;
  const dt = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

/** Normalize amount: accept `1.234,56` or `1234.56` / `1234,56` — no float. */
function parseAmount(raw: string): string | null {
  let s = raw.trim().replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    // Assume thousand separators with last comma/dot as decimal
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  if (s === "0" || /^0+(\.0+)?$/.test(s)) return null;
  try {
    return roundMoney(s);
  } catch {
    return null;
  }
}

export function parseBankStatementCsv(text: string): ParseBankStatementCsvResult {
  const stripped = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = stripped.split("\n").filter((l) => l.trim().length > 0);
  if (rawLines.length < 2) {
    return { ok: false, error: "El CSV debe tener encabezado y al menos una fila de datos" };
  }

  const delimiter = detectDelimiter(rawLines[0]!);
  const headerCells = parseCsvLine(rawLines[0]!, delimiter);
  const colIndex: Partial<Record<string, number>> = {};
  for (let i = 0; i < headerCells.length; i++) {
    const key = mapHeader(headerCells[i] ?? "");
    if (key) colIndex[key] = i;
  }

  const required = ["date", "description", "amount", "direction"] as const;
  for (const key of required) {
    if (colIndex[key] == null) {
      return {
        ok: false,
        error:
          "Encabezado inválido. Requerido: date/fecha, description/descripcion, amount/monto, direction/direccion. Opcional: reference/referencia",
      };
    }
  }

  const dataRows = rawLines.slice(1);
  if (dataRows.length > BANK_STATEMENT_CSV_MAX_ROWS) {
    return {
      ok: false,
      error: `Máximo ${BANK_STATEMENT_CSV_MAX_ROWS} filas por importación`,
    };
  }

  const lines: ParsedBankStatementCsvLine[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2; // 1-based including header
    const cells = parseCsvLine(dataRows[i]!, delimiter);
    const dateRaw = cells[colIndex.date!] ?? "";
    const descRaw = cells[colIndex.description!] ?? "";
    const amountRaw = cells[colIndex.amount!] ?? "";
    const dirRaw = cells[colIndex.direction!] ?? "";
    const refRaw =
      colIndex.reference != null ? (cells[colIndex.reference] ?? "").trim() : "";

    if (!dateRaw && !descRaw && !amountRaw && !dirRaw) continue;

    const lineDate = parseDate(dateRaw);
    if (!lineDate) {
      return { ok: false, error: `Fila ${rowNumber}: fecha inválida (usá YYYY-MM-DD o DD/MM/YYYY)` };
    }
    const description = descRaw.trim();
    if (!description) {
      return { ok: false, error: `Fila ${rowNumber}: descripción vacía` };
    }
    if (description.length > 500) {
      return { ok: false, error: `Fila ${rowNumber}: descripción demasiado larga` };
    }
    const amount = parseAmount(amountRaw);
    if (!amount) {
      return { ok: false, error: `Fila ${rowNumber}: monto inválido (debe ser positivo)` };
    }
    const direction = parseDirection(dirRaw);
    if (!direction) {
      return {
        ok: false,
        error: `Fila ${rowNumber}: dirección inválida (CREDIT/DEBIT o crédito/débito)`,
      };
    }
    const reference = refRaw.length > 0 ? refRaw.slice(0, 120) : null;

    lines.push({ lineDate, description, amount, direction, reference, rowNumber });
  }

  if (lines.length === 0) {
    return { ok: false, error: "No hay filas de datos válidas en el CSV" };
  }

  return { ok: true, lines };
}
