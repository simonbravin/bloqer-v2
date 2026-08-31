/**
 * Styled .xlsx for cronograma (fills + freeze + print). Community SheetJS cannot write cell fills,
 * so this builds a stored (uncompressed) OOXML package.
 */
import {
  excelSerialFromIsoDateOnly,
  periodOverlapsItem,
  type ScheduleExportPayload,
  type ScheduleExportRow,
} from "./schedule-export-pure";

const TABLE_HEADERS = [
  "Tarea",
  "Tipo",
  "EDT",
  "Estado",
  "Inicio",
  "Fin",
  "Duración",
  "Real %",
  "Plan t. %",
  "Cant. %",
  "Cert. %",
  "Presup.",
  "Comprom.",
  "Alertas",
];

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return ~c >>> 0;
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function zipStore(files: Array<{ path: string; body: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.path, "utf8");
    const crc = crc32(file.body);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.body.length, 18);
    local.writeUInt32LE(file.body.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    const localFull = Buffer.concat([local, file.body]);
    locals.push(localFull);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.body.length, 20);
    central.writeUInt32LE(file.body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += localFull.length;
  }
  const centralBlob = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBlob.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBlob, eocd]);
}

function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function argb(hex: string): string {
  const h = hex.replace("#", "").toUpperCase();
  return h.length === 6 ? `FF${h}` : h.padStart(8, "F");
}

function isDark(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length < 6) return false;
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 150;
}

function inlineStr(ref: string, text: string, style?: number): string {
  const s = style != null ? ` s="${style}"` : "";
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
}

function numberCell(ref: string, value: number, style?: number): string {
  const s = style != null ? ` s="${style}"` : "";
  return `<c r="${ref}"${s}><v>${value}</v></c>`;
}

function emptyCell(ref: string, style: number): string {
  return `<c r="${ref}" s="${style}"/>`;
}

function colWidthsXml(widths: number[]): string {
  return `<cols>${widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("")}</cols>`;
}

function preambleRows(payload: ScheduleExportPayload, extra: string[][]): string[][] {
  return [
    ["Empresa", payload.orgLine],
    ["Obra", payload.projectLabel],
    ["Presupuesto", payload.budgetName],
    ["Filtros", payload.filterLine],
    ["Generado (UTC)", payload.generatedAtIso],
    ["Resumen", payload.summaryLine],
    ...extra,
  ];
}

type StyleBook = {
  stylesXml: string;
  header: number;
  label: number;
  date: number;
  delayed: number;
  todayHeader: number;
  fillOf: (hex: string) => number;
};

function buildStyles(hexes: string[]): StyleBook {
  const unique: string[] = [];
  for (const h of hexes) {
    const n = h.startsWith("#") ? h.toLowerCase() : `#${h.toLowerCase()}`;
    if (!unique.includes(n)) unique.push(n);
  }
  const fills = unique.map((hex) => {
    return `<fill><patternFill patternType="solid"><fgColor rgb="${argb(hex)}"/><bgColor indexed="64"/></patternFill></fill>`;
  });
  const fillIndex = (hex: string) => {
    const n = hex.startsWith("#") ? hex.toLowerCase() : `#${hex.toLowerCase()}`;
    return unique.indexOf(n) + 2; // 0 none, 1 gray125
  };

  const xfs: string[] = [];
  const xf = (opts: { font?: number; fill?: number; border?: number; numFmt?: number; wrap?: boolean }) => {
    const fontId = opts.font ?? 0;
    const fillId = opts.fill ?? 0;
    const borderId = opts.border ?? 0;
    const applyFont = opts.font != null ? ' applyFont="1"' : "";
    const applyFill = opts.fill != null ? ' applyFill="1"' : "";
    const applyBorder = opts.border != null ? ' applyBorder="1"' : "";
    const applyNum = opts.numFmt != null ? ` numFmtId="${opts.numFmt}" applyNumberFormat="1"` : ' numFmtId="0"';
    const align = opts.wrap
      ? '<alignment wrapText="1" vertical="center"/>'
      : '<alignment vertical="center"/>';
    xfs.push(
      `<xf fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"${applyNum}${applyFont}${applyFill}${applyBorder}>${align}</xf>`,
    );
    return xfs.length - 1;
  };

  xf({}); // 0 = default (must stay first; empty Gantt cells use s="0")
  const header = xf({ font: 2, fill: fillIndex("#111827") });
  const label = xf({ font: 1 });
  const date = xf({ numFmt: 164 });
  const delayed = xf({ fill: fillIndex("#fecaca") });
  const todayHeader = xf({ font: 1, fill: fillIndex("#fecaca") });
  const fillXf = new Map<string, number>();
  for (const hex of unique) {
    const font = isDark(hex) ? 3 : 0;
    fillXf.set(hex, xf({ font, fill: fillIndex(hex) }));
  }

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
  <fonts count="4">
    <font><sz val="10"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="${2 + fills.length}">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    ${fills.join("")}
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>
</styleSheet>`;

  return {
    stylesXml,
    header,
    label,
    date,
    delayed,
    todayHeader,
    fillOf: (hex: string) => {
      const n = hex.startsWith("#") ? hex.toLowerCase() : `#${hex.toLowerCase()}`;
      return fillXf.get(n) ?? 0;
    },
  };
}

function sheetXml(opts: {
  freezeCol: number;
  freezeRow: number;
  dimension: string;
  cols: number[];
  rowsXml: string;
  fitWidth: boolean;
  tabColor?: string;
}): string {
  const topLeft = `${colLetter(opts.freezeCol)}${opts.freezeRow + 1}`;
  const pageSetup = opts.fitWidth
    ? `<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>`
    : `<pageSetup orientation="landscape" paperSize="9" scale="70"/>`;
  const tab = opts.tabColor ? `<sheetPr><tabColor rgb="${argb(opts.tabColor)}"/></sheetPr>` : "<sheetPr/>";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  ${tab}
  <dimension ref="${opts.dimension}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane xSplit="${opts.freezeCol}" ySplit="${opts.freezeRow}" topLeftCell="${topLeft}" activePane="bottomRight" state="frozen"/>
      <selection pane="bottomRight"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="16"/>
  ${colWidthsXml(opts.cols)}
  <sheetData>${opts.rowsXml}</sheetData>
  <pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
  ${pageSetup}
  <headerFooter>
    <oddHeader>&amp;C&amp;BCronograma</oddHeader>
    <oddFooter>&amp;L&amp;A&amp;RPágina &amp;P / &amp;N</oddFooter>
  </headerFooter>
</worksheet>`;
}

function writePreambleXml(rows: string[][], labelStyle: number): { xml: string; nextRow: number } {
  const parts: string[] = [];
  rows.forEach((row, i) => {
    const r = i + 1;
    parts.push(
      `<row r="${r}">${inlineStr(`${colLetter(0)}${r}`, row[0] ?? "", labelStyle)}${inlineStr(`${colLetter(1)}${r}`, row[1] ?? "")}</row>`,
    );
  });
  const nextRow = rows.length + 2; // blank line then header
  return { xml: parts.join(""), nextRow };
}

function tableSheet(payload: ScheduleExportPayload, styles: StyleBook): string {
  const pre = preambleRows(payload, []);
  const { xml: preXml, nextRow } = writePreambleXml(pre, styles.label);
  const headerRow = nextRow;
  const headerCells = TABLE_HEADERS.map((h, i) => inlineStr(`${colLetter(i)}${headerRow}`, h, styles.header)).join("");
  const data: string[] = [];
  payload.rows.forEach((row, idx) => {
    const r = headerRow + 1 + idx;
    const delayed = row.alerts.startsWith("Atrasado");
    const statusStyle = styles.fillOf(row.barColor);
    const cells = [
      inlineStr(`${colLetter(0)}${r}`, row.displayName, delayed ? styles.delayed : undefined),
      inlineStr(`${colLetter(1)}${r}`, row.typeLabel),
      inlineStr(`${colLetter(2)}${r}`, row.wbsCode),
      inlineStr(`${colLetter(3)}${r}`, row.statusLabel, statusStyle),
      dateOrDash(`${colLetter(4)}${r}`, row.startDate, styles),
      dateOrDash(`${colLetter(5)}${r}`, row.endDate, styles),
      inlineStr(`${colLetter(6)}${r}`, row.durationLabel),
      inlineStr(`${colLetter(7)}${r}`, row.realPct),
      inlineStr(`${colLetter(8)}${r}`, row.planPct),
      inlineStr(`${colLetter(9)}${r}`, row.qtyPct),
      inlineStr(`${colLetter(10)}${r}`, row.certPct),
      inlineStr(`${colLetter(11)}${r}`, row.budgetLabel),
      inlineStr(`${colLetter(12)}${r}`, row.committedLabel),
      inlineStr(`${colLetter(13)}${r}`, row.alerts, delayed ? styles.delayed : undefined),
    ];
    data.push(`<row r="${r}" ht="18">${cells.join("")}</row>`);
  });
  const lastCol = colLetter(TABLE_HEADERS.length - 1);
  const lastRow = headerRow + Math.max(payload.rows.length, 1);
  return sheetXml({
    freezeCol: 1,
    freezeRow: headerRow,
    dimension: `A1:${lastCol}${lastRow}`,
    cols: [42, 12, 12, 14, 12, 12, 12, 10, 12, 10, 10, 16, 16, 28],
    rowsXml: `${preXml}<row r="${headerRow}">${headerCells}</row>${data.join("")}`,
    fitWidth: true,
    tabColor: "#1f4e79",
  });
}

function dateOrDash(ref: string, iso: string | null, styles: StyleBook): string {
  const serial = excelSerialFromIsoDateOnly(iso);
  if (serial == null) return inlineStr(ref, "—");
  return numberCell(ref, serial, styles.date);
}

function ganttSheet(payload: ScheduleExportPayload, styles: StyleBook): string {
  const periods = payload.gantt?.periods ?? [];
  const todayIso = payload.gantt?.todayIso;
  const pre = preambleRows(payload, [
    [
      "Leyenda",
      "El color de cada período es el de la barra Gantt (atrasado rojo, hito violeta, contenedor gris, hecho verde, en curso azul).",
    ],
  ]);
  const { xml: preXml, nextRow } = writePreambleXml(pre, styles.label);
  const headerRow = nextRow;
  const fixed = ["Tarea", "Tipo", "Estado", "Inicio", "Fin"];
  const headers = [...fixed, ...periods.map((p) => p.label)];
  const headerCells = headers
    .map((h, i) => {
      const period = i >= 5 ? periods[i - 5] : null;
      const isToday = Boolean(
        period && todayIso && periodOverlapsItem(period, todayIso, todayIso),
      );
      return inlineStr(`${colLetter(i)}${headerRow}`, h, isToday ? styles.todayHeader : styles.header);
    })
    .join("");

  const data = payload.rows.map((row, idx) => ganttDataRow(row, headerRow + 1 + idx, periods, styles));
  const lastCol = colLetter(Math.max(headers.length - 1, 4));
  const lastRow = headerRow + Math.max(payload.rows.length, 1);
  const periodWidths = periods.map(() => 5);
  return sheetXml({
    freezeCol: 5,
    freezeRow: headerRow,
    dimension: `A1:${lastCol}${lastRow}`,
    cols: [36, 12, 14, 12, 12, ...periodWidths],
    rowsXml: `${preXml}<row r="${headerRow}" ht="22">${headerCells}</row>${data.join("")}`,
    fitWidth: false,
    tabColor: "#3b82f6",
  });
}

function ganttDataRow(
  row: ScheduleExportRow,
  r: number,
  periods: NonNullable<ScheduleExportPayload["gantt"]>["periods"],
  styles: StyleBook,
): string {
  const cells = [
    inlineStr(`${colLetter(0)}${r}`, row.displayName),
    inlineStr(`${colLetter(1)}${r}`, row.typeLabel),
    inlineStr(`${colLetter(2)}${r}`, row.statusLabel, styles.fillOf(row.barColor)),
    dateOrDash(`${colLetter(3)}${r}`, row.startDate, styles),
    dateOrDash(`${colLetter(4)}${r}`, row.endDate, styles),
  ];
  periods.forEach((period, i) => {
    const ref = `${colLetter(5 + i)}${r}`;
    const overlaps = periodOverlapsItem(period, row.startDate, row.endDate);
    if (!overlaps) {
      cells.push(emptyCell(ref, 0));
      return;
    }
    const style = styles.fillOf(row.barColor);
    cells.push(row.isMilestone ? inlineStr(ref, "◆", style) : emptyCell(ref, style));
  });
  return `<row r="${r}" ht="16">${cells.join("")}</row>`;
}

function contentTypesXml(sheetCount: number): string {
  const sheets = Array.from({ length: sheetCount }, (_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets}
</Types>`;
}

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

function workbookRelsXml(sheetCount: number): string {
  const sheetRels = Array.from({ length: sheetCount }, (_, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRels}
  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function workbookXml(sheets: Array<{ name: string; printTitles: string }>): string {
  const sheetEls = sheets
    .map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  const names = sheets
    .map(
      (s, i) =>
        `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${s.printTitles}</definedName>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetEls}</sheets>
  <definedNames>${names}</definedNames>
</workbook>`;
}

export function buildStyledScheduleXlsx(payload: ScheduleExportPayload): Buffer {
  const hexes = [
    "#111827",
    "#fecaca",
    ...payload.rows.map((r) => r.barColor),
  ];
  const styles = buildStyles(hexes);
  const utf8 = (s: string) => Buffer.from(s, "utf8");
  const includeTable = payload.view !== "gantt";
  const includeGantt = payload.view !== "table";
  const sheets: Array<{ name: string; printTitles: string; xml: string }> = [];
  if (includeTable) {
    sheets.push({ name: "Tabla", printTitles: "Tabla!$1:$8", xml: tableSheet(payload, styles) });
  }
  if (includeGantt) {
    sheets.push({
      name: "Gantt",
      printTitles: "Gantt!$A:$E,Gantt!$9:$9",
      xml: ganttSheet(payload, styles),
    });
  }
  const files: Array<{ path: string; body: Buffer }> = [
    { path: "[Content_Types].xml", body: utf8(contentTypesXml(sheets.length)) },
    { path: "_rels/.rels", body: utf8(ROOT_RELS) },
    { path: "xl/workbook.xml", body: utf8(workbookXml(sheets)) },
    { path: "xl/_rels/workbook.xml.rels", body: utf8(workbookRelsXml(sheets.length)) },
    { path: "xl/styles.xml", body: utf8(styles.stylesXml) },
  ];
  sheets.forEach((sheet, i) => {
    files.push({ path: `xl/worksheets/sheet${i + 1}.xml`, body: utf8(sheet.xml) });
  });
  return zipStore(files);
}
