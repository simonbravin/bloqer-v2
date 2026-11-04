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

function detectCsvDelimiter(source: string): "," | ";" {
  const text = source.trimStart();
  let commas = 0;
  let semicolons = 0;
  let inQuotes = false;
  let atFieldStart = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && (inQuotes || atFieldStart)) {
      if (inQuotes && text[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (ch === "\n" || ch === "\r") break;
      if (ch === ",") commas++;
      if (ch === ";") semicolons++;
      if (ch === "," || ch === ";") atFieldStart = true;
      else if (ch?.trim()) atFieldStart = false;
    }
  }
  return semicolons > commas ? ";" : ",";
}

function parseCsvText(source: string): unknown[][] {
  const text = source.replace(/^\uFEFF/, "");
  const delimiter = detectCsvDelimiter(text);
  const rows: string[][] = [];
  let cells: string[] = [];
  let current = "";
  let inQuotes = false;
  function finishRow() {
    cells.push(current.trim());
    if (cells.some((cell) => cell !== "")) rows.push(cells.slice(0, 2));
    cells = [];
    current = "";
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      if (inQuotes || current.trim() === "") {
        inQuotes = !inQuotes;
        continue;
      }
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      finishRow();
      if (ch === "\r" && text[i + 1] === "\n") i++;
      continue;
    }
    current += ch;
  }
  if (inQuotes) throw new Error("El CSV tiene un campo con comillas sin cerrar. Corregí el archivo y volvé a subirlo.");
  finishRow();
  return rows;
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
