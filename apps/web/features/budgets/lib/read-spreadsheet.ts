/** Lee CSV o XLSX y devuelve filas crudas (columnas A y B: código y descripción). */
export async function readSpreadsheetFile(file: File): Promise<unknown[][]> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "csv") {
    const text = await file.text();
    return parseCsvText(text);
  }

  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const sheet = workbook.Sheets[sheetName]!;
    return xlsxSheetToRows(sheet, XLSX);
  }

  throw new Error("Formato no soportado. Usá .csv o .xlsx");
}

function detectCsvDelimiter(firstLine: string): "," | ";" {
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

function parseCsvLine(line: string, delimiter: "," | ";"): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
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
  return cells.slice(0, 2);
}

/** Usa texto formateado de celda (w) para conservar 11.10; Excel guarda 11.1 como número. */
function xlsxSheetToRows(
  sheet: { "!ref"?: string; [cell: string]: unknown },
  XLSX: { utils: { decode_range: (ref: string) => { s: { r: number; c: number }; e: { r: number; c: number } }; encode_cell: (addr: { r: number; c: number }) => string } },
): unknown[][] {
  const ref = sheet["!ref"];
  if (!ref || typeof ref !== "string") return [];

  const range = XLSX.utils.decode_range(ref);
  const rows: unknown[][] = [];

  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: unknown[] = [];
    for (let c = 0; c <= 1; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })] as
        | { w?: string; v?: unknown }
        | undefined;
      if (!cell) {
        row.push("");
        continue;
      }
      if (cell.w != null && String(cell.w).trim() !== "") {
        row.push(String(cell.w).trim());
      } else if (cell.v != null && cell.v !== "") {
        row.push(cell.v);
      } else {
        row.push("");
      }
    }
    rows.push(row);
  }

  return rows;
}

function parseCsvText(text: string): unknown[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const delimiter = detectCsvDelimiter(lines[0]!);
  return lines.map((line) => parseCsvLine(line, delimiter));
}
