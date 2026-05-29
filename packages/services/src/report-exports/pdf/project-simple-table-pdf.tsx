import { Document, Page, Text, View } from "@react-pdf/renderer";
import { MAX_PROJECT_REPORT_PDF_ROWS } from "./pdf-export.types";
import { PdfMetaBlock, reportPdfStyles, truncateText } from "./report-pdf-shared";

export type SimpleTableColumn = { key: string; label: string; flex?: number };

type Props = {
  title: string;
  subtitle?: string;
  filterLine?: string;
  generatedAtIso: string;
  columns: SimpleTableColumn[];
  rows: Record<string, string>[];
  totalsLine?: string;
  warnings?: string[];
};

export function ProjectSimpleTablePdfDocument(props: Props) {
  const slice = props.rows.slice(0, MAX_PROJECT_REPORT_PDF_ROWS);
  const truncated = props.rows.length > MAX_PROJECT_REPORT_PDF_ROWS;

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={reportPdfStyles.page}>
        <PdfMetaBlock
          title={props.title}
          generatedAtIso={props.generatedAtIso}
          filterLine={props.filterLine ?? ""}
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
          Detalle ({truncated ? `primeras ${MAX_PROJECT_REPORT_PDF_ROWS}` : slice.length} filas)
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
      </Page>
    </Document>
  );
}
