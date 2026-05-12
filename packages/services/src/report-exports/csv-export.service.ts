/**
 * CSV for LATAM / Excel: semicolon separator, UTF-8 with BOM, CRLF lines.
 * Dates in export rows should be ISO YYYY-MM-DD unless the report already uses another display format.
 *
 * Excel / Sheets formula injection: cells starting with =, +, -, @ or tab are prefixed with a
 * single quote so they open as text (OWASP CSV guidance).
 */
const SEP = ";";
const BOM = "\uFEFF";

/** Leading characters that spreadsheet apps may interpret as formulas. */
const EXCEL_FORMULA_PREFIX = /^[=+\-@\t]/;

function normalizeForCsv(value: unknown): string {
  if (value == null) return "";
  const s = String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (EXCEL_FORMULA_PREFIX.test(s)) return `'${s}`;
  return s;
}

export function escapeCsvCell(value: unknown): string {
  const v = normalizeForCsv(value);
  if (v.includes(SEP) || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [
    headers.map(escapeCsvCell).join(SEP),
    ...rows.map((r) => r.map((c) => escapeCsvCell(c)).join(SEP)),
  ];
  return BOM + lines.join("\r\n");
}
