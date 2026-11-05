/**
 * CSV for LATAM / Excel: semicolon separator, UTF-8 with BOM, CRLF lines.
 * Dates in export rows should be ISO YYYY-MM-DD unless the report already uses another display format.
 *
 * Prefix formula-like text with a quote. A literal negative decimal has no formula operands
 * and can remain numeric in Excel or another CSV consumer.
 */
const SEP = ";";
const BOM = "\uFEFF";

const EXCEL_FORMULA_PREFIX = /^(?:\t|\s*[=+\-@])/;
const NEGATIVE_DECIMAL_LITERAL = /^-\d+(?:\.\d+)?$/;

function normalizeForCsv(value: unknown): string {
  if (value == null) return "";
  const s = String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (EXCEL_FORMULA_PREFIX.test(s) && !NEGATIVE_DECIMAL_LITERAL.test(s)) return `'${s}`;
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

/** Inverse of `buildCsv` (semicolon + optional BOM). Used to reuse a CSV table as XLSX. */
export function parseBuiltCsv(content: string): { headers: string[]; rows: string[][] } {
  const text = content.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else inQuotes = false;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === SEP) {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" || ch === "\n") {
      records.push([...row, cell]);
      row = [];
      cell = "";
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
    } else {
      cell += ch;
    }
  }
  records.push([...row, cell]);
  const [headers = [], ...rows] = records;
  return { headers, rows };
}
