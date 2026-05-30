import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { PdfReportBranding } from "../branding/pdf-branding.types";
import { MAX_PROJECT_REPORT_PDF_ROWS } from "./pdf-export.types";
import { PdfReportFooter, PdfReportHeader, reportPdfStyles, truncateText } from "./report-pdf-shared";

export type SimpleTableColumn = { key: string; label: string; flex?: number };

type Props = {
  branding: PdfReportBranding;
  title: string;
  subtitle?: string;
  filterLine?: string;
  columns: SimpleTableColumn[];
  rows: Record<string, string>[];
  totalsLine?: string;
  warnings?: string[];
  maxRows?: number;
  footerNote?: string;
};

export function ProjectSimpleTablePdfDocument(props: Props) {
  const rowLimit = props.maxRows ?? MAX_PROJECT_REPORT_PDF_ROWS;
  const slice = props.rows.slice(0, rowLimit);
  const truncated = props.rows.length > rowLimit;

  const footerNote =
    props.footerNote ??
    (truncated
      ? `Detalle truncado: ${props.rows.length - rowLimit} filas omitidas (límite ${rowLimit}). Exportá CSV para el detalle completo.`
      : undefined);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={reportPdfStyles.page}>
        <PdfReportHeader
          branding={props.branding}
          title={props.title}
          filterLine={props.filterLine}
        />
        {props.subtitle ? <Text style={reportPdfStyles.meta}>{props.subtitle}</Text> : null}
        {props.totalsLine ? (
          <Text style={[reportPdfStyles.meta, { marginTop: 4 }]}>{props.totalsLine}</Text>
        ) : null}
        {props.warnings?.map((w, i) => (
          <Text key={i} style={[reportPdfStyles.meta, { color: "#884400" }]}>
            {truncateText(w, 140)}
          </Text>
        ))}
        <Text style={reportPdfStyles.sectionTitle}>
          Detalle ({truncated ? `primeras ${rowLimit}` : slice.length} filas)
        </Text>
        <View style={reportPdfStyles.headerRow}>
          {props.columns.map((c) => (
            <Text key={c.key} style={[reportPdfStyles.cell, { flex: c.flex ?? 1 }]}>
              {c.label}
            </Text>
          ))}
        </View>
        {slice.map((row, ri) => (
          <View key={ri} style={reportPdfStyles.row}>
            {props.columns.map((c) => (
              <Text key={c.key} style={[reportPdfStyles.cell, { flex: c.flex ?? 1 }]}>
                {truncateText(row[c.key] ?? "", 48)}
              </Text>
            ))}
          </View>
        ))}
        <PdfReportFooter branding={props.branding} extraNote={footerNote} />
      </Page>
    </Document>
  );
}
