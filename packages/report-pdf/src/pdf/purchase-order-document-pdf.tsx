import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PurchaseOrderDocument } from "@bloqer/services";
import type { PdfReportBranding } from "../branding/pdf-branding.types";
import { PdfReportFooter, reportPdfStyles } from "./report-pdf-shared";

const styles = StyleSheet.create({
  page: { ...reportPdfStyles.page, paddingTop: 126, fontSize: 8.5 },
  header: { position: "absolute", top: 28, left: 40, right: 40 },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 17, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  logo: { width: 105, height: 27, objectFit: "contain" },
  notice: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#884400", marginTop: 6 },
  party: { marginBottom: 11 },
  label: { fontSize: 7.5, color: "#555555", marginBottom: 3 },
  name: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  detail: { marginBottom: 3, lineHeight: 1.3 },
  row: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: "#dddddd" },
  tableHead: { backgroundColor: "#f3f4f6", fontFamily: "Helvetica-Bold" },
  cell: { fontSize: 7.3, paddingRight: 5, lineHeight: 1.35 },
  totals: { width: "56%", marginLeft: "44%", marginTop: 14 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  total: { fontSize: 11, fontFamily: "Helvetica-Bold", borderTopWidth: 1, paddingTop: 8 },
  disclaimer: { marginTop: 14, fontSize: 7, color: "#555555", lineHeight: 1.4 },
});

const columns = [
  { key: "description", label: "Descripción", width: "31%" },
  { key: "quantity", label: "Cantidad", width: "10%" },
  { key: "unit", label: "Unidad", width: "7%" },
  { key: "unitPrice", label: "P. unitario neto", width: "15%" },
  { key: "discountPct", label: "Desc. %", width: "10%" },
  { key: "taxRate", label: "IVA %", width: "9%" },
  { key: "lineTotal", label: "Importe con IVA", width: "18%" },
] as const;

export function PurchaseOrderDocumentPdf({ document, branding }: {
  document: PurchaseOrderDocument;
  branding: PdfReportBranding;
}) {
  // Supplier copies omit the internal generating user's identity, including fallback emails.
  const publicBranding = { ...branding, generatedByLabel: null };
  return (
    <Document title={`Orden de compra ${document.code}`} author={document.company.name}>
      <Page size="A4" style={styles.page}>
        <View fixed style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.title}>Orden de compra · {document.code}</Text>
            {branding.logoDataUri ? <Image src={branding.logoDataUri} style={styles.logo} /> : null}
          </View>
          <Text style={styles.detail}>{document.company.name}</Text>
          <Text style={styles.detail}>Estado: {document.statusLabel} · Moneda: {document.currency}</Text>
          {document.notice ? <Text style={styles.notice}>{document.notice}</Text> : null}
        </View>

        <View style={styles.party} wrap={false}>
          <Text style={styles.label}>COMPRADOR</Text>
          <Text style={styles.name}>{document.company.name}</Text>
          <Text style={styles.detail}>Identificación fiscal: {document.company.fiscalId || "No informada"}</Text>
          {document.company.address ? <Text style={styles.detail}>{document.company.address}</Text> : null}
        </View>
        <View style={styles.party} wrap={false}>
          <Text style={styles.label}>PROVEEDOR</Text>
          <Text style={styles.name}>{document.supplier.name}</Text>
          <Text style={styles.detail}>Identificación fiscal: {document.supplier.fiscalId || "No informada"}</Text>
          {document.supplier.address ? <Text style={styles.detail}>{document.supplier.address}</Text> : null}
        </View>
        <View style={styles.party} wrap={false}>
          <Text style={styles.label}>OBRA Y FECHAS</Text>
          <Text style={styles.name}>{document.project.label}</Text>
          {document.project.address ? <Text style={styles.detail}>Domicilio de obra: {document.project.address}</Text> : null}
          <Text style={styles.detail}>Fecha de la orden: {document.issueDate}</Text>
          <Text style={styles.detail}>Entrega prevista: {document.expectedDeliveryDate || "No informada"}</Text>
        </View>

        <View style={[styles.row, styles.tableHead]} wrap={false} minPresenceAhead={28}>
          {columns.map((column) => <Text key={column.key} style={[styles.cell, { width: column.width }]}>{column.label}</Text>)}
        </View>
        {document.lines.map((line, index) => (
          <View key={index} style={styles.row}>
            {columns.map((column) => (
              <Text key={column.key} style={[styles.cell, { width: column.width, textAlign: column.key === "description" || column.key === "unit" ? "left" : "right" }]}>
                {line[column.key]}
              </Text>
            ))}
          </View>
        ))}
        <View style={styles.totals} wrap={false}>
          {[
            ["Subtotal neto", document.subtotal],
            ["IVA", document.taxAmount],
            [`Percepción IIBB (${document.iibbPerceptionRate}%)`, document.iibbPerceptionAmount],
          ].map(([label, amount]) => <View key={label} style={styles.totalRow}><Text>{label}</Text><Text>{amount}</Text></View>)}
          <View style={[styles.totalRow, styles.total]}><Text>Total {document.currency}</Text><Text>{document.totalAmount}</Text></View>
        </View>
        <Text style={styles.disclaimer}>
          Importes en {document.currency}. Copia del estado registrado al generar este PDF ({branding.generatedAtIso}, UTC).
          Descargar o compartir esta copia no cambia el estado de la orden ni acredita entrega, recepción de mercadería o pago.
        </Text>
        <PdfReportFooter branding={publicBranding} />
      </Page>
    </Document>
  );
}
