import { Document, Page, Text, View, Svg, Path, Line, Circle, Rect, G } from "@react-pdf/renderer";
import type { ProjectProgressReport } from "@bloqer/services";
import { formatGroupedDecimal } from "@bloqer/utils";
import type { PdfReportBranding } from "../branding/pdf-branding.types";
import {
  PdfReportFooter,
  PdfReportHeader,
  reportPdfStyles,
  truncateText,
} from "./report-pdf-shared";
import {
  buildProgressCommercialSeries,
  projectProgressBarGeometry,
  type ProgressPdfPlotSeries,
} from "./project-progress-chart-data";

const colors = {
  ink: "#172b3a",
  muted: "#526574",
  line: "#dce4e9",
  blue: "#2563a6",
  teal: "#178478",
  slate: "#718293",
  amber: "#a16207",
};
const pageStyle = {
  ...reportPdfStyles.page,
  paddingTop: 28,
  paddingBottom: 46,
  paddingHorizontal: 34,
};
const fmt = (value: string | null, dp = 2) =>
  value === null ? "Sin base comparable" : formatGroupedDecimal(value, dp);
const pct = (value: string | null) => (value === null ? "Pendiente de validar" : `${fmt(value)}%`);
type PlotSeries = ProgressPdfPlotSeries;

/** Number conversion is only for SVG coordinates; money is never aggregated here. */
function LinePlot({
  title,
  unit,
  labels,
  series,
  percentage = false,
}: {
  title: string;
  unit: string;
  labels: string[];
  series: PlotSeries[];
  percentage?: boolean;
}) {
  const width = 365;
  const height = 140;
  const left = 46;
  const top = 14;
  const plotWidth = width - left - 10;
  const plotHeight = height - top - 27;
  const valid = series
    .flatMap((s) => s.values.filter((v): v is string => v !== null).map(Number))
    .filter(Number.isFinite);
  const maximum = Math.max(percentage ? 100 : 1, ...valid);
  const minimum = Math.min(0, ...valid);
  const y = (value: number) =>
    top + plotHeight - ((value - minimum) / (maximum - minimum)) * plotHeight;
  const x = (i: number) => left + (i / Math.max(1, labels.length - 1)) * plotWidth;
  const paths = (s: PlotSeries) => {
    let drawing = false;
    return s.values
      .map((value, i) => {
        if (value === null || !Number.isFinite(Number(value))) {
          drawing = false;
          return "";
        }
        const command = drawing ? "L" : "M";
        drawing = true;
        return `${command}${x(i).toFixed(2)},${y(Number(value)).toFixed(2)}`;
      })
      .join(" ");
  };
  return (
    <View wrap={false} style={{ width, paddingTop: 7 }}>
      <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: colors.ink }}>{title}</Text>
      <Text style={{ fontSize: 6.5, color: colors.muted, marginTop: 3 }}>{unit}</Text>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {[0, 1, 2, 3, 4].map((t) => {
          const value = minimum + ((maximum - minimum) * t) / 4;
          return (
            <G key={t}>
              <Line
                x1={left}
                x2={width - 10}
                y1={y(value)}
                y2={y(value)}
                stroke={colors.line}
                strokeWidth={0.5}
              />
              <Text
                x={left - 5}
                y={y(value) + 2}
                style={{ fontSize: 6, fill: colors.muted, textAnchor: "end" }}
              >
                {formatGroupedDecimal(value.toFixed(0), 0)}
                {percentage ? "%" : ""}
              </Text>
            </G>
          );
        })}
        {series.map((s) => (
          <Path
            key={s.name}
            d={paths(s)}
            stroke={s.color}
            strokeWidth={1.6}
            strokeDasharray={s.dashed ? "4 3" : undefined}
            fill="none"
          />
        ))}
        {series.flatMap((s) =>
          s.values.map((value, i) =>
            value === null ? null : (
              <Circle
                key={`${s.name}-${i}`}
                cx={x(i)}
                cy={y(Number(value))}
                r={1.8}
                fill={s.color}
              />
            ),
          ),
        )}
        {labels.map((label, i) =>
          i === 0 ||
          i === labels.length - 1 ||
          (labels.length > 4 && i % Math.ceil(labels.length / 4) === 0) ? (
            <Text
              key={i}
              x={x(i)}
              y={height - 10}
              style={{
                fontSize: 6,
                fill: colors.muted,
                textAnchor: i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle",
              }}
            >
              {label}
            </Text>
          ) : null,
        )}
      </Svg>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {series.map((s) => (
          <View key={s.name} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 9, height: 2, backgroundColor: s.color }} />
            <Text style={{ fontSize: 6 }}>{s.name}</Text>
          </View>
        ))}
      </View>
      <Text style={{ fontSize: 6, color: colors.muted, marginTop: 4 }}>
        Eje horizontal: mes · Acumulado hasta cada corte · Fuente: documentos del proyecto, estado
        actual.
      </Text>
    </View>
  );
}

function CostBars({ report }: { report: ProjectProgressReport }) {
  const bars: [string, string | null, string][] = [
    ["Presupuesto de costo", report.financial.budgetCost, colors.slate],
    ["Devengado", report.financial.costAccrued, colors.blue],
    ["Exposición", report.financial.costExposure, colors.teal],
  ];
  const valid = bars.filter((b): b is [string, string, string] => b[1] !== null);
  if (!valid.length) return null;
  const geometry = projectProgressBarGeometry(
    valid.map((bar) => Number(bar[1])),
    460,
  );
  return (
    <View wrap={false} style={{ marginTop: 12 }}>
      <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 5 }}>
        Presupuesto y costos · {report.currency}
      </Text>
      {valid.map(([label, value, color], index) => (
        <View key={label} style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
          <Text style={{ width: 110, fontSize: 7 }}>{label}</Text>
          <Svg width={460} height={8}>
            <Rect
              x={geometry.segments[index]!.x}
              y={0}
              width={geometry.segments[index]!.width}
              height={8}
              fill={color}
            />
            <Line
              x1={geometry.zeroX}
              x2={geometry.zeroX}
              y1={0}
              y2={8}
              stroke={colors.ink}
              strokeWidth={0.6}
            />
          </Svg>
          <Text style={{ width: 180, textAlign: "right", fontSize: 7 }}>
            {fmt(value)} {report.currency}
          </Text>
        </View>
      ))}
      <Text style={{ fontSize: 6.5, color: colors.muted }}>
        Eje horizontal: importe en {report.currency}; línea vertical = cero. Capas comparadas, no
        sumables. Pagado: {fmt(report.financial.costPaid)}. Exposición = devengado + compromiso
        abierto.
      </Text>
    </View>
  );
}

function ExecutivePage({
  report,
  branding,
  filterLine,
}: {
  report: ProjectProgressReport;
  branding: PdfReportBranding;
  filterLine: string;
}) {
  const metrics: [string, string, string, string][] = [
    [
      "Físico validado",
      pct(report.physical.pct),
      `Cobertura: ${report.physical.coveragePct === null ? "Sin base" : `${fmt(report.physical.coveragePct)}%`} · ${report.physical.coveredCount}/${report.physical.totalCount} partidas`,
      `Última medición: ${report.sourceDates.jobsite ?? "Sin evidencia al corte"}`,
    ],
    [
      "Certificado sobre venta",
      pct(report.financial.certifiedPct),
      `${fmt(report.financial.certified)} ${report.currency}`,
      `Último certificado: ${report.sourceDates.certifications ?? "Sin evidencia al corte"}`,
    ],
    [
      "Devengado sobre presupuesto",
      pct(report.financial.costAccruedPct),
      `${fmt(report.financial.costAccrued)} ${report.currency}`,
      `Último registro de costo: ${report.sourceDates.costs ?? "Sin evidencia al corte"}`,
    ],
    [
      "Cobrado sobre facturado",
      pct(report.financial.collectionPct),
      `${fmt(report.financial.collected)} ${report.currency}`,
      `Última cobranza: ${report.sourceDates.collections ?? "Sin evidencia al corte"}`,
    ],
  ];
  const commercial = buildProgressCommercialSeries(report.series, {
    certified: colors.blue,
    invoiced: colors.slate,
    collected: colors.teal,
  });
  const execution: PlotSeries[] = [
    {
      name: "Físico validado",
      values: report.series.map((p) => p.physicalPct),
      color: colors.blue,
    },
    {
      name: "Plan vigente comparable",
      values: report.series.map((p) => p.planPct),
      color: colors.slate,
      dashed: true,
    },
  ];
  if (report.series.some((p) => p.physicalPct === null && p.physicalObservedPct !== null))
    execution.push({
      name: "Aporte observado parcial",
      values: report.series.map((p) => (p.physicalPct === null ? p.physicalObservedPct : null)),
      color: colors.teal,
      dashed: true,
    });
  if (report.series.some((p) => p.planPct === null && p.planObservedPct !== null))
    execution.push({
      name: "Plan observado parcial",
      values: report.series.map((p) => (p.planPct === null ? p.planObservedPct : null)),
      color: colors.amber,
      dashed: true,
    });
  return (
    <Page size="A4" orientation="landscape" style={pageStyle}>
      <PdfReportHeader branding={branding} title="Avance del proyecto" filterLine={filterLine} />
      <View style={{ flexDirection: "row", gap: 9, marginTop: 4 }}>
        {metrics.map(([label, value, detail, sourceDate]) => (
          <View
            key={label}
            style={{ flex: 1, borderTopWidth: 2, borderTopColor: colors.line, paddingTop: 7 }}
          >
            <Text style={{ fontSize: 7, color: colors.muted }}>{label}</Text>
            <Text
              style={{
                fontSize: value.length > 15 ? 10 : 18,
                fontFamily: "Helvetica-Bold",
                color: colors.ink,
                marginTop: 5,
              }}
            >
              {value}
            </Text>
            <Text style={{ fontSize: 6, color: colors.muted, marginTop: 4 }}>{detail}</Text>
            <Text style={{ fontSize: 6, color: colors.muted, marginTop: 3 }}>{sourceDate}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
        <LinePlot
          title="Ejecución frente al plan vigente"
          unit="Porcentaje del alcance físico ponderado por costo directo"
          labels={report.series.map((p) => p.periodLabel)}
          percentage
          series={execution}
        />
        {commercial.length ? (
          <LinePlot
            title="Certificación, facturación y cobranza"
            unit={`Importe acumulado (${report.currency})`}
            labels={report.series.map((p) => p.periodLabel)}
            series={commercial}
          />
        ) : null}
      </View>
      <CostBars report={report} />
      <Text style={{ fontSize: 6.5, color: colors.muted, marginTop: 10 }}>
        Alcance: {truncateText(report.budgetName, 170)} · Plan y alcance vigentes. Los acumulados
        incluyen el saldo anterior a {report.dateFrom}. Aporte observado:{" "}
        {pct(report.physical.observedPct)}; no es un avance validado con cobertura incompleta.
      </Text>
      <PdfReportFooter branding={branding} />
    </Page>
  );
}

export function ProjectProgressPdfDocument({
  report,
  branding,
}: {
  report: ProjectProgressReport;
  branding: PdfReportBranding;
}) {
  const filterLine = `Movimientos: ${report.dateFrom} a ${report.dateTo} · Acumulado al ${report.dateTo} · ${report.currency} · ${truncateText(report.budgetName, 80)}`;
  const rowLimit = 90;
  const rows = report.rows.slice(0, rowLimit);
  const chunks = Array.from({ length: Math.ceil(rows.length / 16) }, (_, i) =>
    rows.slice(i * 16, (i + 1) * 16),
  );
  const showCert = report.financial.certified !== null;
  const showCost = report.financial.budgetCost !== null || report.financial.costAccrued !== null;
  const columns: {
    title: string;
    flex: number;
    render: (r: ProjectProgressReport["rows"][number]) => string;
  }[] = [
    { title: "EDT / partida", flex: 2.2, render: (r) => `${r.wbsCode} · ${r.wbsName}` },
    { title: "Unidad", flex: 0.55, render: (r) => r.unit },
    { title: "Alcance", flex: 0.7, render: (r) => fmt(r.budgetQty) },
    {
      title: "Físico %",
      flex: 0.7,
      render: (r) => (r.physicalPct === null ? "Sin validar" : fmt(r.physicalPct)),
    },
    {
      title: "Por ejecutar",
      flex: 0.8,
      render: (r) =>
        r.physicalRemainingQty === null ? "Sin validar" : fmt(r.physicalRemainingQty),
    },
    ...(showCert
      ? [
          {
            title: "Por certificar",
            flex: 0.8,
            render: (r: ProjectProgressReport["rows"][number]) =>
              r.pendingCertifyQty === null ? "Sin base" : fmt(r.pendingCertifyQty),
          },
        ]
      : []),
    ...(showCost
      ? [
          {
            title: "Exposición",
            flex: 1,
            render: (r: ProjectProgressReport["rows"][number]) =>
              r.costExposure === null ? "Sin base" : fmt(r.costExposure),
          },
        ]
      : []),
    { title: "Observaciones", flex: 1.9, render: (r) => r.issues.join(" · ") },
  ];
  return (
    <Document>
      <ExecutivePage report={report} branding={branding} filterLine={filterLine} />
      <Page size="A4" orientation="landscape" style={pageStyle} wrap>
        <PdfReportHeader
          branding={branding}
          title="Avance del proyecto · pendientes y criterios"
          filterLine={filterLine}
        />
        <Text style={reportPdfStyles.sectionTitle}>
          Qué requiere atención · {report.pending.length} pendientes
        </Text>
        {report.pending.slice(0, 20).map((p) => (
          <View key={p.id} style={{ ...reportPdfStyles.row, paddingVertical: 5 }} wrap={false}>
            <Text style={{ fontSize: 7.5, flex: 1.2, fontFamily: "Helvetica-Bold" }}>
              {truncateText(p.title, 90)}
            </Text>
            <Text style={{ fontSize: 7, flex: 2 }}>{truncateText(p.detail, 260)}</Text>
            <View style={{ width: 130, paddingLeft: 8, flexShrink: 0 }}>
              {p.date ? <Text style={{ fontSize: 6.5, textAlign: "right" }}>{p.date}</Text> : null}
              {p.amount ? (
                <Text style={{ fontSize: 6.5, textAlign: "right" }}>
                  {fmt(p.amount)} {report.currency}
                </Text>
              ) : null}
              {p.qty ? (
                <Text style={{ fontSize: 6.5, textAlign: "right" }}>
                  {fmt(p.qty)} {p.unit ?? ""}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
        {report.pending.length > 20 ? (
          <Text style={reportPdfStyles.meta}>
            Se muestran 20 de {report.pending.length} pendientes. Excel y CSV incluyen el detalle
            completo.
          </Text>
        ) : null}
        <Text style={reportPdfStyles.sectionTitle}>Calidad y alcance de la información</Text>
        {[
          ...report.warnings,
          ...report.sectionsExcluded.map((s) => `Sección no disponible: ${s}`),
        ].map((w, i) => (
          <Text key={i} style={{ ...reportPdfStyles.meta, color: colors.amber }}>
            {w}
          </Text>
        ))}
        {report.notes.map((note, i) => (
          <Text key={`note-${i}`} style={reportPdfStyles.meta}>
            {note}
          </Text>
        ))}
        <Text style={reportPdfStyles.meta}>
          La cobertura mide qué parte del costo presupuestado tiene medición válida. No se
          renormalizan las partidas observadas. Los históricos ambiguos se conservan y se señalan.
        </Text>
        <Text style={reportPdfStyles.meta}>
          El plan comparable usa fechas actuales y los mismos pesos del físico. Las aprobaciones y
          anulaciones corresponden al estado actual de los documentos. No representa una línea base
          histórica congelada.
        </Text>
        <Text style={reportPdfStyles.meta}>
          Los importes comerciales pueden tener bases fiscales distintas. La diferencia entre
          certificado y facturado no determina automáticamente un saldo facturable. El costo para
          terminar no está estimado.
        </Text>
        <PdfReportFooter branding={branding} />
      </Page>
      {chunks.map((chunk, pageIndex) => (
        <Page key={pageIndex} size="A4" orientation="landscape" style={pageStyle}>
          <PdfReportHeader
            branding={branding}
            title="Avance del proyecto · detalle por partida"
            filterLine={filterLine}
          />
          <Text style={reportPdfStyles.meta}>
            Cantidades en la unidad de cada partida · Importes en {report.currency} ·{" "}
            {pageIndex * 16 + 1}–{Math.min((pageIndex + 1) * 16, rows.length)} de{" "}
            {report.rows.length} partidas
          </Text>
          <View style={reportPdfStyles.headerRow}>
            {columns.map((c) => (
              <Text key={c.title} style={{ ...reportPdfStyles.cell, flex: c.flex }}>
                {c.title}
              </Text>
            ))}
          </View>
          {chunk.map((r) => (
            <View
              key={`${r.budgetId}-${r.wbsNodeId}`}
              style={{ ...reportPdfStyles.row, paddingVertical: 6 }}
              wrap={false}
            >
              {columns.map((c) => (
                <Text key={c.title} style={{ ...reportPdfStyles.cell, flex: c.flex }}>
                  {truncateText(
                    c.render(r),
                    c.title === "Observaciones" ? 100 : c.title === "EDT / partida" ? 66 : 28,
                  )}
                </Text>
              ))}
            </View>
          ))}
          <PdfReportFooter
            branding={branding}
            extraNote={
              report.rows.length > rowLimit
                ? `Detalle limitado a ${rowLimit} de ${report.rows.length} partidas. Excel/CSV incluyen todas.`
                : undefined
            }
          />
        </Page>
      ))}
    </Document>
  );
}
