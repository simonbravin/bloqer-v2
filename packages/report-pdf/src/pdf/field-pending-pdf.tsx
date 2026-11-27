import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { PdfReportBranding } from "../branding/pdf-branding.types";
import { PdfReportHeader, PdfReportFooter, reportPdfStyles } from "./report-pdf-shared";

export function FieldPendingPdfDocument({ branding, filterLine, rows }: {
  branding: PdfReportBranding; filterLine: string; rows: Record<string, string>[];
}) {
  const columns = [
    { label: "Documento / obra", flex: 1.4, text: (r: Record<string, string>) => `${r.document}\n${r.type}\n${r.projectCode} · ${r.projectName}` },
    { label: "Etapa / estado", flex: 1.1, text: (r: Record<string, string>) => `${r.stage}\n${r.status}` },
    { label: "Descripción / proveedor", flex: 1.3, text: (r: Record<string, string>) => r.description },
    { label: "Solicitante / fecha UTC", flex: 1, text: (r: Record<string, string>) => `${r.requestedBy || "Sin dato"}\n${r.date?.slice(0, 10)}` },
    { label: "Vencida (d)", flex: 0.5, text: (r: Record<string, string>) => r.overdueDays },
    { label: "Monto documento", flex: 0.9, text: (r: Record<string, string>) => r.amount ? `${r.currency} ${r.amount}` : "Sin monto" },
    { label: "Próxima acción", flex: 1, text: (r: Record<string, string>) => r.action },
  ];
  // Small page groups keep large exports tractable and repeat context. Never slice off rows.
  const pages = Array.from({ length: Math.max(1, Math.ceil(rows.length / 20)) }, (_, i) => rows.slice(i * 20, (i + 1) * 20));
  return <Document>{pages.map((page, index) => <Page key={index} size="A4" orientation="landscape" style={reportPdfStyles.page}>
    <PdfReportHeader branding={branding} title="Pendientes" filterLine={filterLine} />
    <Text style={reportPdfStyles.meta}>{rows.length} acciones · Montos del documento, no saldos a pagar. Una OC puede tener más de una acción pendiente.</Text>
    <View style={reportPdfStyles.headerRow} fixed>{columns.map((column) => <Text key={column.label} style={[reportPdfStyles.cell, { flex: column.flex }]}>{column.label}</Text>)}</View>
    {page.map((row, rowIndex) => <View key={rowIndex} style={reportPdfStyles.row}>
      {columns.map((column) => <Text key={column.label} style={[reportPdfStyles.cell, { flex: column.flex }]}>{column.text(row) ?? ""}</Text>)}
    </View>)}
    {!rows.length && <Text style={reportPdfStyles.meta}>No hay pendientes para los filtros seleccionados.</Text>}
    <PdfReportFooter branding={branding} />
  </Page>)}</Document>;
}
