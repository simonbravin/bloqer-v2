import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { AgingFilters, AgingReport } from "../../aging/aging.service";
import { MAX_AGING_PDF_LINE_ITEMS } from "./pdf-export.types";
import { PdfMetaBlock, reportPdfStyles, truncateText } from "./report-pdf-shared";

function agingFiltersLine(f: AgingFilters): string {
  const parts: string[] = [];
  if (f.currency) parts.push(`Moneda: ${f.currency}`);
  if (f.bucket) parts.push(`Bucket: ${f.bucket}`);
  if (f.asOfDate) parts.push(`Corte: ${f.asOfDate}`);
  if (f.search) parts.push(`Búsqueda: ${truncateText(f.search, 80)}`);
  if (f.projectId) parts.push("Proyecto: (filtro activo)");
  if (f.contactId) parts.push("Contacto: (filtro activo)");
  if (f.companyId) parts.push("Empresa: (filtro activo)");
  if (f.includePaid) parts.push("Incluye facturas pagadas");
  return parts.length > 0 ? parts.join(" · ") : "Ninguno";
}

type Props = {
  variant: "AR" | "AP";
  report: AgingReport;
  filters: AgingFilters;
  generatedAtIso: string;
};

export function AgingReportPdfDocument(props: Props) {
  const title =
    props.variant === "AR" ? "Cuentas por cobrar" : "Cuentas por pagar";

  const rows: {
    contact: string;
    cur: string;
    inv: string;
    project: string;
    due: string;
    bal: string;
    st: string;
  }[] = [];

  let totalItems = 0;
  for (const g of props.report.rows) {
    for (const it of g.items) {
      totalItems++;
      if (rows.length < MAX_AGING_PDF_LINE_ITEMS) {
        rows.push({
          contact: truncateText(g.contactName, 28),
          cur: g.currency,
          inv: String(it.invoiceNumber),
          project: truncateText(it.projectName, 22),
          due: it.dueDate,
          bal: it.balanceDue,
          st: truncateText(it.status, 10),
        });
      }
    }
  }

  const truncated = totalItems > MAX_AGING_PDF_LINE_ITEMS;
  const currencyLines = Object.entries(props.report.byCurrency)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cur, t]) => `${cur}: saldo total ${t.totalBalance} · vencido ${t.totalOverdue}`);

  const flexContact = { flex: 2.1 };
  const flexSm = { flex: 0.55 };
  const flexMd = { flex: 1 };

  return (
    <Document>
      <Page size="A4" style={reportPdfStyles.page}>
        <PdfMetaBlock
          title={title}
          generatedAtIso={props.generatedAtIso}
          filterLine={agingFiltersLine(props.filters)}
        />
        <Text style={reportPdfStyles.meta}>Fecha de corte reporte: {props.report.asOfDate}</Text>
        <Text style={reportPdfStyles.sectionTitle}>Totales por moneda (sin convertir)</Text>
        {currencyLines.map((line) => (
          <Text key={line} style={reportPdfStyles.meta}>
            {line}
          </Text>
        ))}

        <Text style={reportPdfStyles.sectionTitle}>Detalle ({truncated ? `primeras ${MAX_AGING_PDF_LINE_ITEMS} filas` : `${rows.length} filas`})</Text>
        <View style={reportPdfStyles.headerRow}>
          <Text style={[reportPdfStyles.cell, flexContact]}>Cliente / Proveedor</Text>
          <Text style={[reportPdfStyles.cell, flexSm]}>Mon.</Text>
          <Text style={[reportPdfStyles.cell, flexSm]}>Nº</Text>
          <Text style={[reportPdfStyles.cell, flexMd]}>Proyecto</Text>
          <Text style={[reportPdfStyles.cell, flexSm]}>Venc.</Text>
          <Text style={[reportPdfStyles.cell, flexMd]}>Saldo</Text>
          <Text style={[reportPdfStyles.cell, flexSm]}>Est.</Text>
        </View>
        {rows.map((r, i) => (
          <View key={i} style={reportPdfStyles.row} wrap={false}>
            <Text style={[reportPdfStyles.cell, flexContact]}>{r.contact}</Text>
            <Text style={[reportPdfStyles.cell, flexSm]}>{r.cur}</Text>
            <Text style={[reportPdfStyles.cell, flexSm]}>{r.inv}</Text>
            <Text style={[reportPdfStyles.cell, flexMd]}>{r.project}</Text>
            <Text style={[reportPdfStyles.cell, flexSm]}>{r.due}</Text>
            <Text style={[reportPdfStyles.cell, flexMd]}>{r.bal}</Text>
            <Text style={[reportPdfStyles.cell, flexSm]}>{r.st}</Text>
          </View>
        ))}

        <Text style={reportPdfStyles.footer}>
          Bloqer · {title}
          {truncated
            ? ` · Detalle truncado: ${totalItems - MAX_AGING_PDF_LINE_ITEMS} filas omitidas (límite Phase 9B: ${MAX_AGING_PDF_LINE_ITEMS}). Exportá CSV para el detalle completo.`
            : ""}
        </Text>
      </Page>
    </Document>
  );
}
