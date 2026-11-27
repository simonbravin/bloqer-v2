import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { DocumentDeliveryRow } from "@bloqer/services";
import type { PdfReportBranding } from "../branding/pdf-branding.types";
import { PdfReportFooter, PdfReportHeader, reportPdfStyles } from "./report-pdf-shared";

export function DocumentDeliveryPdfDocument({ branding, filterLine, rows }: {
  branding: PdfReportBranding; filterLine: string; rows: DocumentDeliveryRow[];
}) {
  const pages = Array.from({ length: Math.max(1, Math.ceil(rows.length / 12)) }, (_, i) => rows.slice(i * 12, (i + 1) * 12));
  return <Document>{pages.map((page, index) => <Page key={index} size="A4" orientation="landscape" style={reportPdfStyles.page}>
    <PdfReportHeader branding={branding} title="Índice de entrega" filterLine={filterLine} />
    <Text style={reportPdfStyles.meta}>{rows.length} archivos autorizados. Original registrado indica carga confirmada; la integridad se consulta desde el historial. El índice no incluye los originales.</Text>
    <View style={reportPdfStyles.headerRow} fixed>{["Archivo / documento ID", "Estado / original", "Responsable / registro UTC", "Revisiones"].map((label) => <Text key={label} style={[reportPdfStyles.cell, { flex: label.startsWith("Archivo") ? 1.6 : 1 }]}>{label}</Text>)}</View>
    {page.map((row) => <View key={row.id} style={reportPdfStyles.row}>
      <Text style={[reportPdfStyles.cell, { flex: 1.6 }]}>{row.fileName}{"\n"}{row.categoryLabel}{"\n"}{row.id}</Text>
      <Text style={[reportPdfStyles.cell, { flex: 1 }]}>{row.status === "ACTIVE" ? "Activo" : "Archivado"}{"\n"}{row.originalRegistered ? "Original registrado" : "Sin original registrado"}</Text>
      <Text style={[reportPdfStyles.cell, { flex: 1 }]}>{row.uploadedByName}{"\n"}{row.createdAt}</Text>
      <Text style={[reportPdfStyles.cell, { flex: 1 }]}>{row.previous ? `Anterior: ${row.previous.fileName}\n${row.previous.id}` : "Sin anterior visible"}{"\n"}{row.next ? `Siguiente: ${row.next.fileName}\n${row.next.id}` : "Sin siguiente visible"}</Text>
    </View>)}
    {!rows.length ? <Text style={reportPdfStyles.meta}>No hay documentos para los filtros seleccionados.</Text> : null}
    <PdfReportFooter branding={branding} />
  </Page>)}</Document>;
}
