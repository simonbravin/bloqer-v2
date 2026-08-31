import * as XLSX from "xlsx";

export type XlsxSheetInput = {
  sheetName: string;
  headers: string[];
  rows: string[][];
  /** Optional rows prepended before headers (metadata). */
  preamble?: string[][];
  /** Excel character widths per column (0-based). */
  colWidths?: number[];
  /** Freeze panes: split after this many columns / rows (1-based Excel semantics via SheetJS). */
  freeze?: { xSplit?: number; ySplit?: number };
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
    if (sheet.colWidths?.length) {
      ws["!cols"] = sheet.colWidths.map((wch) => ({ wch }));
    }
    if (sheet.freeze) {
      const xSplit = sheet.freeze.xSplit ?? 0;
      const ySplit = sheet.freeze.ySplit ?? 0;
      const topLeftCell = `${XLSX.utils.encode_col(xSplit)}${ySplit + 1}`;
      ws["!views"] = [
        {
          state: "frozen",
          xSplit,
          ySplit,
          topLeftCell,
          activeCell: topLeftCell,
        },
      ];
    }
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
