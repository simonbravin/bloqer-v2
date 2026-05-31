import * as XLSX from "xlsx";

export type XlsxSheetInput = {
  sheetName: string;
  headers: string[];
  rows: string[][];
  /** Optional rows prepended before headers (metadata). */
  preamble?: string[][];
};

export function buildXlsxWorkbook(sheets: XlsxSheetInput[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const aoa: string[][] = [];
    if (sheet.preamble?.length) {
      aoa.push(...sheet.preamble);
      aoa.push([]);
    }
    aoa.push(sheet.headers);
    aoa.push(...sheet.rows);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const safeName = sheet.sheetName.replace(/[\\/*?:[\]]/g, "_").slice(0, 31) || "Sheet1";
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function buildXlsxSheet(
  headers: string[],
  rows: string[][],
  options?: { sheetName?: string; preamble?: string[][] },
): Buffer {
  return buildXlsxWorkbook([
    {
      sheetName: options?.sheetName ?? "Presupuesto",
      headers,
      rows,
      preamble: options?.preamble,
    },
  ]);
}
