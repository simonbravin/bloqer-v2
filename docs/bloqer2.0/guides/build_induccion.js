// ─────────────────────────────────────────────────────────────────────────────
// build_induccion.js — DOCX "Inducción Bloqer v2" (libreto 10 min)
//
// FUENTE: ./INDUCCION_EQUIPO.md
// Salida: Induccion_Bloqer_v2.docx  (gitignored, igual que la Guía operativa)
//
// Correr:  node build_induccion.js
// Brand: mismos azules / logo / tipografía que build_guide.js
// ─────────────────────────────────────────────────────────────────────────────
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, AlignmentType, HeadingLevel, BorderStyle,
  WidthType, ShadingType, VerticalAlign, PageNumber, LevelFormat,
} = require("docx");
const fs = require("fs");
const path = require("path");

const BLUE_DARK = "1D4ED8";
const BLUE_MID = "2563EB";
const BLUE_LIGHT = "DBEAFE";
const BLUE_ACCENT = "3B82F6";
const BLUE_TIP = "EFF6FF";
const ORANGE_WARN = "FEF3C7";
const ORANGE_TEXT = "92400E";
const GREEN_CHECK = "D1FAE5";
const GREEN_TEXT = "065F46";
const GRAY_BG = "F8FAFC";
const GRAY_BORDER = "CBD5E1";
const WHITE = "FFFFFF";
const TEXT_DARK = "1E293B";
const TEXT_MID = "475569";
const CODE_COLOR = "0F172A";

const border = (color = GRAY_BORDER, size = 4) => ({ style: BorderStyle.SINGLE, size, color });
const borders = (color = GRAY_BORDER) => ({
  top: border(color), bottom: border(color), left: border(color), right: border(color),
});
const noBorder = () => ({ style: BorderStyle.NONE, size: 0, color: "FFFFFF" });
const cellPad = { top: 100, bottom: 100, left: 140, right: 140 };
const cellPadSm = { top: 70, bottom: 70, left: 120, right: 120 };

function space(n = 1) {
  return Array(n).fill(null).map(() => new Paragraph({ children: [new TextRun({ text: "", size: 20 })] }));
}

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
  const re = /(\*\*(.+?)\*\*)|(`([^`]+)`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    pushText(text.slice(last, m.index));
    if (m[1]) pushText(m[2], { bold: true });
    else if (m[3]) pushText(m[4], { font: "Consolas", color: CODE_COLOR });
    last = re.lastIndex;
  }
  pushText(text.slice(last));
  return runs.length ? runs : [new TextRun({ text: "", size: opts.size, font: opts.font })];
}

const stripMd = (t) => t.replace(/\*\*/g, "").replace(/`/g, "");

function sectionTitle(text, pageBreakBefore = false) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore,
    children: [new TextRun({ text: stripMd(text), bold: true, color: BLUE_DARK, size: 32, font: "Arial" })],
  });
}

function subTitle(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: stripMd(text), bold: true, color: BLUE_MID, size: 24, font: "Arial" })],
  });
}

function bodyPara(text) {
  return new Paragraph({ children: parseInline(text), spacing: { after: 120 } });
}

function listItem(line) {
  const m = line.match(/^(\s*)[-*]\s+(.*)$/);
  const indent = m[1].length;
  return new Paragraph({
    numbering: { reference: "bullets", level: indent >= 2 ? 1 : 0 },
    spacing: { after: 60 },
    children: parseInline(m[2]),
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

function calloutBox(qlines) {
  const joined = qlines.join(" ");
  const isSpeech = /Bloqer no es|La SC no compra|Si el gasto|Aprobar es|No les pido|Si lo vas/.test(joined);
  const isWarn = /error que|no hagas|no prometas|no te enredes|atenci/i.test(joined);
  const type = isWarn ? "warn" : isSpeech ? "speech" : "tip";
  const bg = type === "warn" ? ORANGE_WARN : type === "speech" ? GREEN_CHECK : BLUE_TIP;
  const tc = type === "warn" ? ORANGE_TEXT : type === "speech" ? GREEN_TEXT : BLUE_ACCENT;
  const label = type === "warn" ? "OJO" : type === "speech" ? "DECÍ ESTO" : "NOTA";
  const leftBar = { style: BorderStyle.SINGLE, size: 20, color: tc };

  const paras = [];
  let first = true;
  for (const raw of qlines) {
    const line = raw.trim();
    if (!line && first) continue;
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      paras.push(new Paragraph({
        spacing: { after: 40 },
        indent: { left: 500, hanging: 240 },
        children: [
          new TextRun({ text: "\u2022  ", size: 18, color: tc, font: "Arial" }),
          ...parseInline(li[1], { size: 18 }),
        ],
      }));
    } else if (first) {
      paras.push(new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: label + ": ", bold: true, color: tc, size: 18, font: "Arial" }),
          ...parseInline(line, { size: 18, italic: type === "speech" }),
        ],
      }));
    } else {
      paras.push(new Paragraph({
        spacing: { after: 40 },
        children: parseInline(line, { size: 18, italic: type === "speech" }),
      }));
    }
    first = false;
  }
  if (paras.length === 0) {
    paras.push(new Paragraph({
      children: [new TextRun({ text: label, bold: true, color: tc, size: 18, font: "Arial" })],
    }));
  }

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [new TableRow({
      children: [new TableCell({
        borders: { top: border(tc), bottom: border(tc), left: leftBar, right: border(tc) },
        width: { size: 9360, type: WidthType.DXA },
        shading: { fill: bg, type: ShadingType.CLEAR },
        margins: { top: 120, bottom: 120, left: 200, right: 200 },
        children: paras,
      })],
    })],
  });
}

function renderTable(tlines) {
  const parseRow = (l) => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const rows = tlines.map(parseRow);
  const header = rows[0];
  const dataRows = rows.slice(2);
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
  const widths = maxLens.map((l) => Math.round((TOTAL * l) / sum));
  widths[ncol - 1] += TOTAL - widths.reduce((a, b) => a + b, 0);

  const hdrCell = (text, width) => new TableCell({
    borders: borders(BLUE_MID),
    width: { size: width, type: WidthType.DXA },
    shading: { fill: BLUE_DARK, type: ShadingType.CLEAR },
    margins: cellPad,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      children: [new TextRun({ text: stripMd(text), bold: true, color: WHITE, size: 18, font: "Arial" })],
    })],
  });
  const dataCell = (text, width, shade) => new TableCell({
    borders: borders(GRAY_BORDER),
    width: { size: width, type: WidthType.DXA },
    shading: { fill: shade, type: ShadingType.CLEAR },
    margins: cellPadSm,
    verticalAlign: VerticalAlign.TOP,
    children: [new Paragraph({ children: parseInline(text, { size: 18 }) })],
  });

  const rowsOut = [
    new TableRow({ tableHeader: true, children: header.map((h, c) => hdrCell(h, widths[c])) }),
  ];
  dataRows.forEach((r, ri) => {
    const shade = ri % 2 === 1 ? GRAY_BG : WHITE;
    rowsOut.push(new TableRow({
      children: header.map((_, c) => dataCell(r[c] || "", widths[c], shade)),
    }));
  });
  return new Table({ width: { size: TOTAL, type: WidthType.DXA }, columnWidths: widths, rows: rowsOut });
}

function isBlockStart(line) {
  const t = line.trim();
  return (
    /^#{1,6}\s/.test(line) ||
    /^>/.test(line) ||
    /^\|/.test(t) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    /^---+$/.test(t)
  );
}

function parseMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (t === "") { i++; continue; }
    if (/^---+$/.test(t)) { i++; continue; }
    if (/^#\s+/.test(line)) { i++; continue; }

    if (/^##\s+/.test(line)) {
      const title = line.replace(/^##\s+/, "");
      const pageBreak = /Hoja de bolsillo|Notas para vos/i.test(title);
      out.push(sectionTitle(title, pageBreak));
      i++;
      continue;
    }
    if (/^###\s+/.test(line)) {
      out.push(subTitle(line.replace(/^###+\s+/, "")));
      i++;
      continue;
    }

    if (/^>/.test(line)) {
      const q = [];
      while (i < lines.length && /^>/.test(lines[i])) {
        q.push(lines[i].replace(/^>\s?/, "").replace(/\s+$/, ""));
        i++;
      }
      out.push(calloutBox(q));
      out.push(...space(1));
      continue;
    }

    if (/^\|/.test(t)) {
      const tb = [];
      while (i < lines.length && /^\|/.test(lines[i].trim())) {
        tb.push(lines[i].trim());
        i++;
      }
      out.push(renderTable(tb));
      out.push(...space(1));
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        out.push(listItem(lines[i]));
        i++;
      }
      out.push(...space(1));
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        out.push(orderedItem(lines[i]));
        i++;
      }
      out.push(...space(1));
      continue;
    }

    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    out.push(bodyPara(para.join(" ").replace(/\s+/g, " ").trim()));
  }

  return out;
}

const logoCandidates = [
  path.join(__dirname, "assets", "bloqer-logo.png"),
  path.join(__dirname, "..", "..", "logo", "bloqer-logo.png"),
  path.join(__dirname, "..", "..", "..", "docs", "logo", "bloqer-logo.png"),
];
const logoPath = logoCandidates.find((p) => fs.existsSync(p));
if (!logoPath) {
  console.error("ERROR: no se encontró bloqer-logo.png");
  process.exit(1);
}
const logoBuffer = fs.readFileSync(logoPath);

const mdPath = path.join(__dirname, "INDUCCION_EQUIPO.md");
if (!fs.existsSync(mdPath)) {
  console.error("ERROR: no se encontró " + mdPath);
  process.exit(1);
}
const elements = parseMarkdown(fs.readFileSync(mdPath, "utf8"));

const metaRow = (label, value) => new TableRow({
  children: [
    new TableCell({
      borders: borders(GRAY_BORDER),
      width: { size: 2600, type: WidthType.DXA },
      shading: { fill: BLUE_LIGHT, type: ShadingType.CLEAR },
      margins: cellPadSm,
      children: [new Paragraph({
        children: [new TextRun({ text: label, bold: true, color: BLUE_DARK, size: 18, font: "Arial" })],
      })],
    }),
    new TableCell({
      borders: borders(GRAY_BORDER),
      width: { size: 5000, type: WidthType.DXA },
      shading: { fill: WHITE, type: ShadingType.CLEAR },
      margins: cellPadSm,
      children: [new Paragraph({
        children: [new TextRun({ text: value, size: 18, font: "Arial" })],
      })],
    }),
  ],
});

const doc = new Document({
  numbering: {
    config: [{
      reference: "bullets",
      levels: [
        {
          level: 0,
          format: LevelFormat.BULLET,
          text: "•",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 600, hanging: 300 } } },
        },
        {
          level: 1,
          format: LevelFormat.BULLET,
          text: "◦",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1000, hanging: 300 } } },
        },
      ],
    }],
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 20, color: TEXT_DARK } } },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: BLUE_DARK },
        paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: BLUE_MID },
        paragraph: { spacing: { before: 260, after: 120 }, outlineLevel: 1 },
      },
    ],
  },
  sections: [
    {
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 1200, after: 600 },
          children: [new ImageRun({
            type: "png",
            data: logoBuffer,
            transformation: { width: 220, height: 60 },
            altText: { title: "Bloqer", description: "Logo Bloqer", name: "BloqerLogo" },
          })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 80 },
          children: [new TextRun({ text: "INDUCCIÓN OPERATIVA", bold: true, size: 64, color: BLUE_DARK, font: "Arial" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 200 },
          children: [new TextRun({
            text: "Bloqer v2 — 10 minutos · Equipo Indari",
            size: 32,
            color: TEXT_MID,
            font: "Arial",
          })],
        }),
        new Table({
          width: { size: 6000, type: WidthType.DXA },
          columnWidths: [6000],
          rows: [new TableRow({
            children: [new TableCell({
              borders: {
                top: { style: BorderStyle.SINGLE, size: 12, color: BLUE_DARK },
                bottom: noBorder(), left: noBorder(), right: noBorder(),
              },
              width: { size: 6000, type: WidthType.DXA },
              shading: { fill: WHITE, type: ShadingType.CLEAR },
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              children: [new Paragraph({ children: [new TextRun({ text: "" })] })],
            })],
          })],
        }),
        ...space(2),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 80 },
          children: [new TextRun({
            text: "Libreto del llamado — no es un tutorial para leer en voz alta",
            size: 26,
            color: BLUE_ACCENT,
            font: "Arial",
            bold: true,
          })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 600 },
          children: [new TextRun({
            text: "Empresa vs obra · SC vs OC · cómo se registra y transacciona",
            size: 22,
            color: TEXT_MID,
            font: "Arial",
            italic: true,
          })],
        }),
        ...space(2),
        new Table({
          width: { size: 7600, type: WidthType.DXA },
          columnWidths: [2600, 5000],
          rows: [
            metaRow("Formato", "Guía del speaker · ~10 minutos + Q&A"),
            metaRow("Audiencia", "Equipo Indari (compras, administración, PM, obra)"),
            metaRow("Fecha", "Septiembre 2026"),
            metaRow("Clasificación", "Uso interno — Confidencial"),
          ],
        }),
        ...space(6),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            text: "bloqer.com  ·  Construido para el constructor moderno",
            size: 18,
            color: TEXT_MID,
            font: "Arial",
            italic: true,
          })],
        }),
      ],
    },
    {
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } },
      },
      headers: {
        default: new Header({
          children: [new Table({
            width: { size: 9638, type: WidthType.DXA },
            columnWidths: [6000, 3638],
            rows: [new TableRow({
              children: [
                new TableCell({
                  borders: {
                    top: noBorder(),
                    bottom: { style: BorderStyle.SINGLE, size: 8, color: BLUE_DARK },
                    left: noBorder(),
                    right: noBorder(),
                  },
                  width: { size: 6000, type: WidthType.DXA },
                  shading: { fill: WHITE, type: ShadingType.CLEAR },
                  margins: { top: 60, bottom: 60, left: 0, right: 0 },
                  children: [new Paragraph({
                    children: [new TextRun({
                      text: "Inducción Bloqer v2  ·  Equipo Indari",
                      bold: true,
                      color: BLUE_DARK,
                      size: 18,
                      font: "Arial",
                    })],
                  })],
                }),
                new TableCell({
                  borders: {
                    top: noBorder(),
                    bottom: { style: BorderStyle.SINGLE, size: 8, color: BLUE_DARK },
                    left: noBorder(),
                    right: noBorder(),
                  },
                  width: { size: 3638, type: WidthType.DXA },
                  shading: { fill: WHITE, type: ShadingType.CLEAR },
                  margins: { top: 60, bottom: 60, left: 0, right: 0 },
                  children: [new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new ImageRun({
                      type: "png",
                      data: logoBuffer,
                      transformation: { width: 88, height: 24 },
                      altText: { title: "Bloqer", description: "Logo", name: "logo" },
                    })],
                  })],
                }),
              ],
            })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER, space: 4 } },
            children: [
              new TextRun({ text: "bloqer.com  ·  Uso Interno  ·  Página ", size: 16, color: TEXT_MID, font: "Arial" }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, color: TEXT_MID, font: "Arial" }),
              new TextRun({ text: " de ", size: 16, color: TEXT_MID, font: "Arial" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: TEXT_MID, font: "Arial" }),
            ],
          })],
        }),
      },
      children: [
        ...elements,
        ...space(2),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 400 },
          children: [new ImageRun({
            type: "png",
            data: logoBuffer,
            transformation: { width: 140, height: 38 },
            altText: { title: "Bloqer", description: "Logo Bloqer", name: "BloqerLogoFooter" },
          })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 80, after: 80 },
          children: [new TextRun({
            text: "Documento vivo — regenerado desde INDUCCION_EQUIPO.md. Alineado a la Guía operativa Bloqer v2.",
            size: 16,
            color: TEXT_MID,
            font: "Arial",
            italic: true,
          })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            text: "Construido para el constructor moderno  ·  bloqer.com",
            size: 16,
            color: BLUE_ACCENT,
            font: "Arial",
          })],
        }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  const outStd = path.join(__dirname, "Induccion_Bloqer_v2.docx");
  fs.writeFileSync(outStd, buffer);
  console.log("OK  → " + outStd + "  (" + (buffer.length / 1024).toFixed(1) + " KB)");
}).catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
