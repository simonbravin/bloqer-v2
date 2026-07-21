// ─────────────────────────────────────────────────────────────────────────────
// build_guide.js — Generador del DOCX "Guía Operativa Bloqer v2"
//
// FUENTE VIVA: ../GUIA_OPERATIVA_BLOQER_V2_REVISADA.md  (post Lotes 1–7 UI/UX)
// El contenido NO se hardcodea: se parsea el Markdown y se renderiza con `docx`.
//
// Salida:
//   - Guía_Operativa_Bloqer_v2_PROFESIONAL.docx  (entregable principal)
//   - Guía_Operativa_Bloqer_v2.docx              (copia idéntica)
//
// Correr:  node build_guide.js
// ─────────────────────────────────────────────────────────────────────────────
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, AlignmentType, HeadingLevel, BorderStyle,
  WidthType, ShadingType, VerticalAlign, PageNumber, PageBreak,
  LevelFormat, ExternalHyperlink, TableOfContents, UnderlineType
} = require('docx');
const fs = require('fs');
const path = require('path');

// ─── BRAND COLORS ─────────────────────────────────────────────────────────────
const BLUE_DARK   = "1D4ED8";   // primary brand
const BLUE_MID    = "2563EB";
const BLUE_LIGHT  = "DBEAFE";   // table header bg
const BLUE_ACCENT = "3B82F6";
const BLUE_TIP    = "EFF6FF";   // tip box bg
const ORANGE_WARN = "FEF3C7";   // warning box bg
const ORANGE_TEXT = "92400E";
const GREEN_CHECK = "D1FAE5";
const GREEN_TEXT  = "065F46";
const GRAY_BG     = "F8FAFC";
const GRAY_BORDER = "CBD5E1";
const GRAY_DASH   = "94A3B8";
const CAPTURE_BG  = "F1F5F9";
const CODE_COLOR  = "0F172A";
const WHITE       = "FFFFFF";
const TEXT_DARK   = "1E293B";
const TEXT_MID    = "475569";

// ─── LOW-LEVEL HELPERS ──────────────────────────────────────────────────────
const border = (color = GRAY_BORDER, size = 4) => ({ style: BorderStyle.SINGLE, size, color });
const borders = (color = GRAY_BORDER) => ({ top: border(color), bottom: border(color), left: border(color), right: border(color) });
const noBorder = () => ({ style: BorderStyle.NONE, size: 0, color: "FFFFFF" });
const dashedBorders = (color = GRAY_DASH) => {
  const b = { style: BorderStyle.DASHED, size: 8, color };
  return { top: b, bottom: b, left: b, right: b };
};

const cellPad = { top: 100, bottom: 100, left: 140, right: 140 };
const cellPadSm = { top: 70, bottom: 70, left: 120, right: 120 };

function space(n = 1) {
  return Array(n).fill(null).map(() => new Paragraph({ children: [new TextRun({ text: "", size: 20 })] }));
}
function emptyLines(n) {
  return Array(n).fill(null).map(() => new Paragraph({ children: [new TextRun({ text: "", size: 20 })], spacing: { after: 0 } }));
}

// ─── INLINE MARKDOWN → TextRun[] ────────────────────────────────────────────
// Soporta **negrita**, `código`, [texto](url).
function parseInline(text, base = {}) {
  const opts = { size: 20, color: TEXT_DARK, font: "Arial", bold: false, italic: false, ...base };
  const runs = [];
  const pushText = (t, extra = {}) => {
    if (!t) return;
    runs.push(new TextRun({
      text: t,
      size: opts.size,
      color: extra.color !== undefined ? extra.color : opts.color,
      font: extra.font !== undefined ? extra.font : opts.font,
      bold: extra.bold !== undefined ? extra.bold : opts.bold,
      italic: extra.italic !== undefined ? extra.italic : opts.italic,
    }));
  };
  const re = /(\*\*(.+?)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    pushText(text.slice(last, m.index));
    if (m[1]) {                       // **negrita**
      pushText(m[2], { bold: true });
    } else if (m[3]) {                // `código`
      pushText(m[4], { font: "Consolas", color: CODE_COLOR });
    } else if (m[5]) {                // [texto](url)
      const label = m[6], url = m[7];
      if (/^https?:\/\//i.test(url)) {
        runs.push(new ExternalHyperlink({
          link: url,
          children: [new TextRun({
            text: label, size: opts.size, font: opts.font, color: BLUE_MID,
            underline: { type: UnderlineType.SINGLE, color: BLUE_MID },
          })],
        }));
      } else {                        // path relativo → texto plano
        pushText(label, { italic: true, color: TEXT_MID });
      }
    }
    last = re.lastIndex;
  }
  pushText(text.slice(last));
  return runs.length ? runs : [new TextRun({ text: "", size: opts.size, font: opts.font })];
}

const stripMd = (t) => t.replace(/\*\*/g, "").replace(/`/g, "");

// ─── HEADINGS ────────────────────────────────────────────────────────────────
function sectionTitle(text) {   // MD ## → Heading 1 (con salto de página)
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    children: [new TextRun({ text: stripMd(text), bold: true, color: BLUE_DARK, size: 34, font: "Arial" })],
  });
}
function subTitle(text) {        // MD ### → Heading 2
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: stripMd(text), bold: true, color: BLUE_MID, size: 26, font: "Arial" })],
  });
}
function plainH1(text) {         // Heading 1 sin salto de página (Introducción / Índice)
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: stripMd(text), bold: true, color: BLUE_DARK, size: 34, font: "Arial" })],
  });
}

// ─── PARAGRAPH / LIST ITEMS ─────────────────────────────────────────────────
function bodyPara(text) {
  return new Paragraph({ children: parseInline(text), spacing: { after: 120 } });
}
function listItem(line) {
  const m = line.match(/^(\s*)[-*]\s+(.*)$/);
  const indent = m[1].length;
  let text = m[2];
  const task = text.match(/^\[([ xX])\]\s+(.*)$/);
  if (task) {
    const checked = task[1].trim().length > 0;
    return new Paragraph({
      spacing: { after: 60 },
      indent: { left: 420 + (indent >= 2 ? 360 : 0), hanging: 300 },
      children: [
        new TextRun({ text: (checked ? "\u2611" : "\u2610") + "  ", size: 20, color: checked ? GREEN_TEXT : TEXT_MID, font: "Arial" }),
        ...parseInline(task[2]),
      ],
    });
  }
  return new Paragraph({
    numbering: { reference: "bullets", level: indent >= 2 ? 1 : 0 },
    spacing: { after: 60 },
    children: parseInline(text),
  });
}
function orderedItem(line) {
  const m = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
  return new Paragraph({
    indent: { left: 600, hanging: 320 },
    spacing: { after: 60 },
    children: [
      new TextRun({ text: m[2] + ".  ", bold: true, color: BLUE_DARK, size: 20, font: "Arial" }),
      ...parseInline(m[3]),
    ],
  });
}

// ─── CALLOUT (blockquote genérico) ──────────────────────────────────────────
function tipBox(text, type = "tip", label = null) {
  const bg = type === "tip" ? BLUE_TIP : type === "warn" ? ORANGE_WARN : GREEN_CHECK;
  const tc = type === "tip" ? BLUE_ACCENT : type === "warn" ? ORANGE_TEXT : GREEN_TEXT;
  const lbl = label || (type === "tip" ? "NOTA" : type === "warn" ? "ATENCIÓN" : "IMPORTANTE");
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [new TableRow({ children: [new TableCell({
      borders: { top: border(tc), bottom: border(tc), left: { style: BorderStyle.SINGLE, size: 20, color: tc }, right: border(tc) },
      width: { size: 9360, type: WidthType.DXA },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 200, right: 200 },
      children: [new Paragraph({
        children: [new TextRun({ text: lbl + ": ", bold: true, color: tc, size: 18, font: "Arial" }), ...parseInline(text, { size: 18 })],
      })],
    })] })],
  });
}

function calloutBox(qlines) {
  const joined = qlines.join(" ");
  const low = joined.toLowerCase();

  // ¿Bloque de metadata (varias líneas con **Etiqueta:**)? → caja informativa
  const boldCount = qlines.filter(l => /^\*\*.+?\*\*/.test(l.trim())).length;
  const infoMode = boldCount >= 3;

  let type = "tip";
  if (/hito/.test(low)) type = "check";
  else if (/limitaci|atenci[oó]n|correcci[oó]n|cr[ií]tic|no existe|no implementad|no reversible|error a evitar|no hay/.test(low)) type = "warn";

  const bg = type === "tip" ? BLUE_TIP : type === "warn" ? ORANGE_WARN : GREEN_CHECK;
  const tc = type === "tip" ? BLUE_ACCENT : type === "warn" ? ORANGE_TEXT : GREEN_TEXT;
  const leftBar = { style: BorderStyle.SINGLE, size: 20, color: tc };

  const paras = [];
  let bodyLines = qlines;
  let headLabel;

  if (infoMode) {
    headLabel = "ACERCA DE ESTA GUÍA";
  } else {
    const bm = (qlines[0] || "").trim().match(/^\*\*(.+?)\*\*:?\s*/);
    if (bm) {
      headLabel = bm[1].replace(/:$/, "").toUpperCase();
      const rest = qlines[0].trim().slice(bm[0].length);
      bodyLines = [rest, ...qlines.slice(1)];
    } else {
      headLabel = type === "tip" ? "NOTA" : type === "warn" ? "ATENCIÓN" : "HITO CLAVE";
    }
  }

  let firstEmitted = false;
  for (let raw of bodyLines) {
    const line = raw.trim();
    if (line === "" && !firstEmitted) continue;
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      paras.push(new Paragraph({
        spacing: { after: 40 },
        indent: { left: 500, hanging: 240 },
        children: [new TextRun({ text: "\u2022  ", size: 18, color: tc, font: "Arial" }), ...parseInline(li[1], { size: 18 })],
      }));
    } else if (!firstEmitted) {
      paras.push(new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: headLabel + ": ", bold: true, color: tc, size: 18, font: "Arial" }), ...parseInline(line, { size: 18 })],
      }));
    } else {
      paras.push(new Paragraph({ spacing: { after: 40 }, children: parseInline(line, { size: 18 }) }));
    }
    firstEmitted = true;
  }
  if (paras.length === 0) paras.push(new Paragraph({ children: [new TextRun({ text: headLabel, bold: true, color: tc, size: 18, font: "Arial" })] }));

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [new TableRow({ children: [new TableCell({
      borders: { top: border(tc), bottom: border(tc), left: leftBar, right: border(tc) },
      width: { size: 9360, type: WidthType.DXA },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 200, right: 200 },
      children: paras,
    })] })],
  });
}

// ─── CAPTURA SUGERIDA → caja placeholder ────────────────────────────────────
function captureBox(qlines) {
  const rawTitle = (qlines[0] || "").trim();
  const title = stripMd(rawTitle).replace(/📷\s*/, "").replace(/Captura sugerida/i, "CAPTURA SUGERIDA");
  const detailStr = qlines.slice(1).join(" ").trim();
  const details = detailStr ? detailStr.split(/\s+·\s+/).map(s => s.trim()).filter(Boolean) : [];

  const inner = [];
  inner.push(new Paragraph({
    spacing: { after: 40 },
    children: [new TextRun({ text: "📷 " + title, bold: true, color: BLUE_DARK, size: 20, font: "Arial" })],
  }));
  inner.push(...emptyLines(3));
  inner.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text: "[  Insertar captura aquí  ]", italic: true, color: GRAY_DASH, size: 22, font: "Arial" })],
  }));
  inner.push(...emptyLines(3));
  for (const d of details) {
    inner.push(new Paragraph({
      spacing: { after: 20 },
      children: parseInline(d, { size: 16, color: TEXT_MID }),
    }));
  }

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [new TableRow({ children: [new TableCell({
      borders: dashedBorders(GRAY_DASH),
      width: { size: 9360, type: WidthType.DXA },
      shading: { fill: CAPTURE_BG, type: ShadingType.CLEAR },
      margins: { top: 180, bottom: 180, left: 240, right: 240 },
      children: inner,
    })] })],
  });
}

// ─── TABLA markdown → docx Table ────────────────────────────────────────────
function renderTable(tlines) {
  const parseRow = (l) => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
  const rows = tlines.map(parseRow);
  const header = rows[0];
  const dataRows = rows.slice(2); // rows[1] = separador |---|
  const ncol = header.length;
  const TOTAL = 9360;

  const maxLens = new Array(ncol).fill(1);
  for (const r of [header, ...dataRows]) {
    for (let c = 0; c < ncol; c++) {
      const len = stripMd(r[c] || "").length;
      if (len > maxLens[c]) maxLens[c] = len;
    }
  }
  const sum = maxLens.reduce((a, b) => a + b, 0);
  let widths = maxLens.map(l => Math.round(TOTAL * l / sum));
  widths[ncol - 1] += TOTAL - widths.reduce((a, b) => a + b, 0);

  const hdrCell = (text, width) => new TableCell({
    borders: borders(BLUE_MID),
    width: { size: width, type: WidthType.DXA },
    shading: { fill: BLUE_DARK, type: ShadingType.CLEAR },
    margins: cellPad,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ children: [new TextRun({ text: stripMd(text), bold: true, color: WHITE, size: 18, font: "Arial" })] })],
  });
  const dataCell = (text, width, shade) => new TableCell({
    borders: borders(GRAY_BORDER),
    width: { size: width, type: WidthType.DXA },
    shading: { fill: shade, type: ShadingType.CLEAR },
    margins: cellPadSm,
    verticalAlign: VerticalAlign.TOP,
    children: [new Paragraph({ children: parseInline(text, { size: 18 }) })],
  });

  const rowsOut = [];
  rowsOut.push(new TableRow({ tableHeader: true, children: header.map((h, c) => hdrCell(h, widths[c])) }));
  dataRows.forEach((r, ri) => {
    const shade = ri % 2 === 1 ? GRAY_BG : WHITE;
    rowsOut.push(new TableRow({ children: header.map((_, c) => dataCell(r[c] || "", widths[c], shade)) }));
  });

  return new Table({ width: { size: TOTAL, type: WidthType.DXA }, columnWidths: widths, rows: rowsOut });
}

// ─── MERMAID → tipBox de referencia ─────────────────────────────────────────
function mermaidBox() {
  return tipBox(
    "Diagrama disponible en la versión Markdown editable de esta guía. Representa las relaciones y transiciones descriptas en esta sección (niveles empresa / proyecto / plataforma, ciclos de estado y flujos económicos).",
    "tip", "DIAGRAMA"
  );
}
function codeBlock(codeLines) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [new TableRow({ children: [new TableCell({
      borders: borders(GRAY_BORDER),
      width: { size: 9360, type: WidthType.DXA },
      shading: { fill: GRAY_BG, type: ShadingType.CLEAR },
      margins: cellPadSm,
      children: codeLines.map(l => new Paragraph({ children: [new TextRun({ text: l || " ", font: "Consolas", size: 16, color: CODE_COLOR })] })),
    })] })],
  });
}

// ─── PARSER PRINCIPAL ────────────────────────────────────────────────────────
function isBlockStart(line) {
  const t = line.trim();
  return /^#{1,6}\s/.test(line) || /^>/.test(line) || /^\|/.test(t) ||
    /^```/.test(t) || /^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line) || /^---+$/.test(t);
}

function parseMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let captureCount = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (t === "") { i++; continue; }
    if (/^---+$/.test(t)) { i++; continue; }

    if (/^#\s+/.test(line)) { i++; continue; }                 // # título del doc → lo maneja la portada
    if (/^##\s+/.test(line)) { out.push(sectionTitle(line.replace(/^##\s+/, ""))); i++; continue; }
    if (/^###\s+/.test(line)) { out.push(subTitle(line.replace(/^###+\s+/, ""))); i++; continue; }

    if (/^```/.test(t)) {                                        // code fence
      const fence = t.replace(/^```/, "").trim();
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
      i++; // cierre
      out.push(/mermaid/i.test(fence) ? mermaidBox() : codeBlock(buf));
      out.push(...space(1));
      continue;
    }

    if (/^>/.test(line)) {                                       // blockquote group
      const q = [];
      while (i < lines.length && /^>/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, "").replace(/\s+$/, "")); i++; }
      if (/^\*{0,2}\s*📷\s*Captura sugerida/i.test((q[0] || "").trim())) { out.push(captureBox(q)); captureCount++; }
      else out.push(calloutBox(q));
      out.push(...space(1));
      continue;
    }

    if (/^\|/.test(t)) {                                         // tabla
      const tb = [];
      while (i < lines.length && /^\|/.test(lines[i].trim())) { tb.push(lines[i].trim()); i++; }
      out.push(renderTable(tb));
      out.push(...space(1));
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {                             // lista no ordenada / checklist
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { out.push(listItem(lines[i])); i++; }
      out.push(...space(1));
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {                           // lista ordenada
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { out.push(orderedItem(lines[i])); i++; }
      out.push(...space(1));
      continue;
    }

    // párrafo normal (multi-línea hasta blanco / nuevo bloque)
    const para = [line]; i++;
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) { para.push(lines[i]); i++; }
    out.push(bodyPara(para.join(" ").replace(/\s+/g, " ").trim()));
  }

  return { elements: out, captureCount };
}

// ─── LOGO ─────────────────────────────────────────────────────────────────────
const logoPath = path.join(__dirname, "../../../docs/logo/bloqer-logo.png");
if (!fs.existsSync(logoPath)) { console.error("ERROR: no se encontró el logo en " + logoPath); process.exit(1); }
const logoBuffer = fs.readFileSync(logoPath);

// ─── LEER MARKDOWN FUENTE ──────────────────────────────────────────────────
const mdPath = path.join(__dirname, "../GUIA_OPERATIVA_BLOQER_V2_REVISADA.md");
if (!fs.existsSync(mdPath)) { console.error("ERROR: no se encontró la fuente MD en " + mdPath); process.exit(1); }
const md = fs.readFileSync(mdPath, "utf8");
const { elements, captureCount } = parseMarkdown(md);

// ─── DOCUMENTO ─────────────────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [
      { reference: "bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 600, hanging: 300 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1000, hanging: 300 } } } },
      ] },
    ],
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 20, color: TEXT_DARK } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 34, bold: true, font: "Arial", color: BLUE_DARK }, paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: BLUE_MID }, paragraph: { spacing: { before: 300, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Arial", color: TEXT_DARK }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 } },
    ],
  },

  sections: [
    // ═══ PORTADA ═══════════════════════════════════════════════════════════
    {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { before: 1200, after: 600 },
          children: [new ImageRun({ type: "png", data: logoBuffer, transformation: { width: 220, height: 60 },
            altText: { title: "Bloqer", description: "Logo Bloqer", name: "BloqerLogo" } })],
        }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400, after: 80 },
          children: [new TextRun({ text: "GUÍA OPERATIVA", bold: true, size: 72, color: BLUE_DARK, font: "Arial" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 },
          children: [new TextRun({ text: "Bloqer v2 — Operación empresa y proyecto", size: 34, color: TEXT_MID, font: "Arial" })] }),

        new Table({
          width: { size: 6000, type: WidthType.DXA }, columnWidths: [6000],
          rows: [new TableRow({ children: [new TableCell({
            borders: { top: { style: BorderStyle.SINGLE, size: 12, color: BLUE_DARK }, bottom: noBorder(), left: noBorder(), right: noBorder() },
            width: { size: 6000, type: WidthType.DXA }, shading: { fill: WHITE, type: ShadingType.CLEAR }, margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [new Paragraph({ children: [new TextRun({ text: "" })] })],
          })] })],
        }),

        ...space(2),

        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 80 },
          children: [new TextRun({ text: "ERP para empresas constructoras", size: 28, color: BLUE_ACCENT, font: "Arial", bold: true })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 600 },
          children: [new TextRun({ text: "Operación de punta a punta: proyectos, presupuestos, compras, certificaciones, tesorería y control de costos", size: 22, color: TEXT_MID, font: "Arial", italic: true })] }),

        ...space(3),

        new Table({
          width: { size: 7600, type: WidthType.DXA }, columnWidths: [2600, 5000],
          rows: [
            new TableRow({ children: [
              new TableCell({ borders: borders(GRAY_BORDER), width: { size: 2600, type: WidthType.DXA }, shading: { fill: BLUE_LIGHT, type: ShadingType.CLEAR }, margins: cellPadSm,
                children: [new Paragraph({ children: [new TextRun({ text: "Versión", bold: true, color: BLUE_DARK, size: 18, font: "Arial" })] })] }),
              new TableCell({ borders: borders(GRAY_BORDER), width: { size: 5000, type: WidthType.DXA }, shading: { fill: WHITE, type: ShadingType.CLEAR }, margins: cellPadSm,
                children: [new Paragraph({ children: [new TextRun({ text: "2.1 — Julio 2026", size: 18, font: "Arial" })] })] }),
            ] }),
            new TableRow({ children: [
              new TableCell({ borders: borders(GRAY_BORDER), width: { size: 2600, type: WidthType.DXA }, shading: { fill: BLUE_LIGHT, type: ShadingType.CLEAR }, margins: cellPadSm,
                children: [new Paragraph({ children: [new TextRun({ text: "Audiencia", bold: true, color: BLUE_DARK, size: 18, font: "Arial" })] })] }),
              new TableCell({ borders: borders(GRAY_BORDER), width: { size: 5000, type: WidthType.DXA }, shading: { fill: WHITE, type: ShadingType.CLEAR }, margins: cellPadSm,
                children: [new Paragraph({ children: [new TextRun({ text: "Dueños/Directores, PM, jefes de obra, capataces, compras, administración, finanzas, tesorería y contabilidad", size: 18, font: "Arial" })] })] }),
            ] }),
            new TableRow({ children: [
              new TableCell({ borders: borders(GRAY_BORDER), width: { size: 2600, type: WidthType.DXA }, shading: { fill: BLUE_LIGHT, type: ShadingType.CLEAR }, margins: cellPadSm,
                children: [new Paragraph({ children: [new TextRun({ text: "Alcance", bold: true, color: BLUE_DARK, size: 18, font: "Arial" })] })] }),
              new TableCell({ borders: borders(GRAY_BORDER), width: { size: 5000, type: WidthType.DXA }, shading: { fill: WHITE, type: ShadingType.CLEAR }, margins: cellPadSm,
                children: [new Paragraph({ children: [new TextRun({ text: "Operación end-to-end a nivel empresa y nivel proyecto: de la configuración inicial al cobro y el pago", size: 18, font: "Arial" })] })] }),
            ] }),
            new TableRow({ children: [
              new TableCell({ borders: borders(GRAY_BORDER), width: { size: 2600, type: WidthType.DXA }, shading: { fill: BLUE_LIGHT, type: ShadingType.CLEAR }, margins: cellPadSm,
                children: [new Paragraph({ children: [new TextRun({ text: "Clasificación", bold: true, color: BLUE_DARK, size: 18, font: "Arial" })] })] }),
              new TableCell({ borders: borders(GRAY_BORDER), width: { size: 5000, type: WidthType.DXA }, shading: { fill: WHITE, type: ShadingType.CLEAR }, margins: cellPadSm,
                children: [new Paragraph({ children: [new TextRun({ text: "Uso interno — Confidencial", size: 18, font: "Arial" })] })] }),
            ] }),
          ],
        }),

        ...space(8),

        new Paragraph({ alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "bloqer.com  ·  Construido para el constructor moderno", size: 18, color: TEXT_MID, font: "Arial", italic: true })] }),
      ],
    },

    // ═══ CONTENIDO ═════════════════════════════════════════════════════════
    {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
      headers: {
        default: new Header({ children: [new Table({
          width: { size: 9638, type: WidthType.DXA }, columnWidths: [6000, 3638],
          rows: [new TableRow({ children: [
            new TableCell({
              borders: { top: noBorder(), bottom: { style: BorderStyle.SINGLE, size: 8, color: BLUE_DARK }, left: noBorder(), right: noBorder() },
              width: { size: 6000, type: WidthType.DXA }, shading: { fill: WHITE, type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 0, right: 0 },
              children: [new Paragraph({ children: [new TextRun({ text: "Guía Operativa Bloqer v2", bold: true, color: BLUE_DARK, size: 18, font: "Arial" })] })],
            }),
            new TableCell({
              borders: { top: noBorder(), bottom: { style: BorderStyle.SINGLE, size: 8, color: BLUE_DARK }, left: noBorder(), right: noBorder() },
              width: { size: 3638, type: WidthType.DXA }, shading: { fill: WHITE, type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 0, right: 0 },
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new ImageRun({ type: "png", data: logoBuffer, transformation: { width: 88, height: 24 },
                altText: { title: "Bloqer", description: "Logo", name: "logo" } })] })],
            }),
          ] })],
        })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER, space: 4 } },
          children: [
            new TextRun({ text: "bloqer.com  ·  Uso Interno  ·  Página ", size: 16, color: TEXT_MID, font: "Arial" }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, color: TEXT_MID, font: "Arial" }),
            new TextRun({ text: " de ", size: 16, color: TEXT_MID, font: "Arial" }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: TEXT_MID, font: "Arial" }),
          ],
        })] }),
      },
      children: [
        plainH1("Índice de Contenidos"),
        new TableOfContents("", { hyperlink: true, headingStyleRange: "1-2" }),

        new Paragraph({ children: [new PageBreak()] }),
        plainH1("Introducción"),
        ...elements,

        ...space(2),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 },
          children: [new ImageRun({ type: "png", data: logoBuffer, transformation: { width: 140, height: 38 },
            altText: { title: "Bloqer", description: "Logo Bloqer", name: "BloqerLogoFooter" } })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 },
          children: [new TextRun({ text: "Documento vivo — regenerado desde GUIA_OPERATIVA_BLOQER_V2_REVISADA.md (post Lotes 1–7).", size: 16, color: TEXT_MID, font: "Arial", italic: true })] }),
        new Paragraph({ alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Construido para el constructor moderno  ·  bloqer.com", size: 16, color: BLUE_ACCENT, font: "Arial" })] }),
      ],
    },
  ],
});

// ─── EMITIR ────────────────────────────────────────────────────────────────
Packer.toBuffer(doc).then(buffer => {
  const outPro = path.join(__dirname, "Guía_Operativa_Bloqer_v2_PROFESIONAL.docx");
  const outStd = path.join(__dirname, "Guía_Operativa_Bloqer_v2.docx");
  fs.writeFileSync(outPro, buffer);
  fs.writeFileSync(outStd, buffer);
  console.log("OK  → " + outPro + "  (" + (buffer.length / 1024).toFixed(1) + " KB)");
  console.log("OK  → " + outStd + "  (copia)");
  console.log("Placeholders de captura renderizados: " + captureCount);
}).catch(err => {
  console.error("ERROR:", err);
  process.exit(1);
});
