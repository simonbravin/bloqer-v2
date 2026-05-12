import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { CostControlFilters, ProjectCostControlReport } from "../../cost-control/cost-control.service";
import { MAX_COST_CONTROL_PDF_ROWS } from "./pdf-export.types";
import { PdfMetaBlock, reportPdfStyles, truncateText } from "./report-pdf-shared";

function costControlFiltersLine(f: CostControlFilters): string {
  const parts: string[] = [];
  if (f.dateFrom) parts.push(`Desde: ${f.dateFrom}`);
  if (f.dateTo) parts.push(`Hasta: ${f.dateTo}`);
  if (f.wbsSearch) parts.push(`WBS: ${truncateText(f.wbsSearch, 60)}`);
  return parts.length > 0 ? parts.join(" · ") : "Ninguno";
}

function flagsLabel(flags: { overBudget: boolean; overCertified: boolean; missingBudget: boolean }): string {
  const bits: string[] = [];
  if (flags.overBudget) bits.push("sobre presup.");
  if (flags.overCertified) bits.push("sobre certif.");
  if (flags.missingBudget) bits.push("sin presup. línea");
  return bits.length > 0 ? bits.join(", ") : "—";
}

type Props = {
  report: ProjectCostControlReport;
  filters: CostControlFilters;
  generatedAtIso: string;
};

export function CostControlReportPdfDocument(props: Props) {
  const slice = props.report.rows.slice(0, MAX_COST_CONTROL_PDF_ROWS);
  const truncated = props.report.rows.length > MAX_COST_CONTROL_PDF_ROWS;

  const f1 = { flex: 0.75 };
  const f2 = { flex: 1.6 };
  const fn = { flex: 0.95 };

  const title = "Control de costos (proyecto)";

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={reportPdfStyles.page}>
        <PdfMetaBlock
          title={title}
          generatedAtIso={props.generatedAtIso}
          filterLine={costControlFiltersLine(props.filters)}
        />
        <Text style={reportPdfStyles.meta}>
          Presupuesto: {props.report.budgetName} ({props.report.budgetStatus})
        </Text>
        {props.report.warnings.length > 0 && (
          <View style={{ marginTop: 4 }}>
            {props.report.warnings.map((w, i) => (
              <Text key={i} style={[reportPdfStyles.meta, { color: "#884400" }]}>
                Aviso: {truncateText(w, 120)}
              </Text>
            ))}
          </View>
        )}
        {props.report.sectionsExcluded.length > 0 && (
          <View style={{ marginTop: 6 }}>
            <Text style={reportPdfStyles.sectionTitle}>Módulos deshabilitados / secciones excluidas</Text>
            {props.report.sectionsExcluded.map((s, i) => (
              <Text key={i} style={[reportPdfStyles.meta, { color: "#553300" }]}>
                {s.module} — {s.section} ({s.reason})
              </Text>
            ))}
          </View>
        )}

        <Text style={reportPdfStyles.sectionTitle}>Totales agregados (misma moneda interna del reporte; sin FX)</Text>
        <Text style={reportPdfStyles.meta}>Costo presupuestado: {props.report.totals.budgetTotalCost}</Text>
        <Text style={reportPdfStyles.meta}>Exposición esperada: {props.report.totals.expectedCostExposure}</Text>
        <Text style={reportPdfStyles.meta}>Restante presupuesto costo: {props.report.totals.remainingBudgetCost}</Text>

        <Text style={reportPdfStyles.sectionTitle}>
          Líneas WBS ({truncated ? `primeras ${MAX_COST_CONTROL_PDF_ROWS}` : `${slice.length}`} de {props.report.rows.length})
        </Text>
        <View style={reportPdfStyles.headerRow}>
          <Text style={[reportPdfStyles.cell, f1]}>Cód.</Text>
          <Text style={[reportPdfStyles.cell, f2]}>Nombre</Text>
          <Text style={[reportPdfStyles.cell, fn]}>Cert. aprob.</Text>
          <Text style={[reportPdfStyles.cell, fn]}>Comprom.</Text>
          <Text style={[reportPdfStyles.cell, fn]}>Deveng.</Text>
          <Text style={[reportPdfStyles.cell, fn]}>Pagado</Text>
          <Text style={[reportPdfStyles.cell, fn]}>Exposic.</Text>
          <Text style={[reportPdfStyles.cell, fn]}>Restante</Text>
          <Text style={[reportPdfStyles.cell, { flex: 1.1 }]}>Alertas</Text>
        </View>
        {slice.map((r, i) => (
          <View key={i} style={reportPdfStyles.row} wrap={false}>
            <Text style={[reportPdfStyles.cell, f1]}>{truncateText(r.wbsCode, 14)}</Text>
            <Text style={[reportPdfStyles.cell, f2]}>{truncateText(r.wbsName, 36)}</Text>
            <Text style={[reportPdfStyles.cell, fn]}>{r.certifiedApproved}</Text>
            <Text style={[reportPdfStyles.cell, fn]}>{r.committedCost}</Text>
            <Text style={[reportPdfStyles.cell, fn]}>{r.accruedCost}</Text>
            <Text style={[reportPdfStyles.cell, fn]}>{r.paidCost}</Text>
            <Text style={[reportPdfStyles.cell, fn]}>{r.expectedCostExposure}</Text>
            <Text style={[reportPdfStyles.cell, fn]}>{r.remainingBudgetCost}</Text>
            <Text style={[reportPdfStyles.cell, { flex: 1.1 }]}>{flagsLabel(r.flags)}</Text>
          </View>
        ))}

        <Text style={reportPdfStyles.footer}>
          Bloqer · {title}
          {truncated
            ? ` · Truncado: ${props.report.rows.length - MAX_COST_CONTROL_PDF_ROWS} filas omitidas (límite ${MAX_COST_CONTROL_PDF_ROWS}). CSV para detalle completo.`
            : ""}
          {" · "}
          Costos no asignados a ítem WBS: comprom. {props.report.unallocatedCommittedCost}, recib.{" "}
          {props.report.unallocatedReceivedCost}, deveng. {props.report.unallocatedAccruedCost}, pag.{" "}
          {props.report.unallocatedPaidCost}, inv. {props.report.unallocatedInventoryConsumedCost}
        </Text>
      </Page>
    </Document>
  );
}
