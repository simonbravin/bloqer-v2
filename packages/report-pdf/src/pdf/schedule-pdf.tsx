import { Document, Page, Text, View } from "@react-pdf/renderer";
import {
  buildGanttAxisTicks,
  formatScheduleExportDate,
  ganttBarFraction,
  splitGanttPdfWindows,
  todayMarkerFraction,
  type ScheduleExportGantt,
  type ScheduleExportPayload,
  type ScheduleExportRow,
} from "@bloqer/services/schedule-export-pure";
import type { PdfReportBranding } from "../branding/pdf-branding.types";
import { MAX_SCHEDULE_PDF_TABLE_ROWS, SCHEDULE_GANTT_PDF_ROWS_PER_PAGE } from "./pdf-export.types";
import { PdfReportFooter, reportPdfStyles, truncateText } from "./report-pdf-shared";

type Props = {
  payload: ScheduleExportPayload;
  branding: PdfReportBranding;
};

type TableCol = {
  key: keyof ScheduleExportRow;
  label: string;
  flex: number;
  date?: boolean;
};

const COLS_DATES: TableCol[] = [
  { key: "displayName", label: "Tarea", flex: 2.2 },
  { key: "typeLabel", label: "Tipo", flex: 0.7 },
  { key: "wbsCode", label: "EDT", flex: 0.7 },
  { key: "statusLabel", label: "Estado", flex: 0.9 },
  { key: "startLabel", label: "Inicio", flex: 0.85, date: true },
  { key: "endLabel", label: "Fin", flex: 0.85, date: true },
  { key: "durationLabel", label: "Duración", flex: 0.75 },
  { key: "alerts", label: "Alertas", flex: 1.2 },
];

const COLS_METRICS: TableCol[] = [
  { key: "displayName", label: "Tarea", flex: 2.2 },
  { key: "realPct", label: "Real", flex: 0.7 },
  { key: "planPct", label: "Plan t.", flex: 0.7 },
  { key: "qtyPct", label: "Cant.", flex: 0.7 },
  { key: "certPct", label: "Cert.", flex: 0.7 },
  { key: "budgetLabel", label: "Presup.", flex: 1.1 },
  { key: "committedLabel", label: "Comprom.", flex: 1.1 },
];

const PAGE = {
  ...reportPdfStyles.page,
  paddingTop: 70,
};

function chunkRows<T>(rows: T[], size: number): T[][] {
  if (rows.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function orgLine(branding: PdfReportBranding): string {
  if (branding.companyDisplayName && branding.companyDisplayName !== branding.tenantName) {
    return `${branding.companyDisplayName} · ${branding.tenantName}`;
  }
  return branding.tenantName;
}

function BrandHeader(props: {
  branding: PdfReportBranding;
  title: string;
  filterLine: string;
  extra?: string;
}) {
  return (
    <View fixed style={{ marginBottom: 6 }}>
      <Text style={reportPdfStyles.orgLine}>{orgLine(props.branding)}</Text>
      {props.branding.projectLabel ? (
        <Text style={reportPdfStyles.projectLine}>Obra: {props.branding.projectLabel}</Text>
      ) : null}
      <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 2 }}>{props.title}</Text>
      {props.extra ? <Text style={reportPdfStyles.meta}>{props.extra}</Text> : null}
      <Text style={reportPdfStyles.meta}>Filtros: {props.filterLine}</Text>
    </View>
  );
}

function dateCellStyle(isDate: boolean | undefined) {
  return {
    fontSize: isDate ? 7.5 : 6.5,
    textAlign: isDate ? ("right" as const) : ("left" as const),
    paddingRight: 4,
  };
}

function TableBand(props: {
  payload: ScheduleExportPayload;
  branding: PdfReportBranding;
  title: string;
  columns: TableCol[];
}) {
  const slice = props.payload.rows.slice(0, MAX_SCHEDULE_PDF_TABLE_ROWS);
  const truncated = props.payload.rows.length > MAX_SCHEDULE_PDF_TABLE_ROWS;
  const footerNote = truncated
    ? `Detalle truncado: ${props.payload.rows.length - MAX_SCHEDULE_PDF_TABLE_ROWS} filas omitidas (límite ${MAX_SCHEDULE_PDF_TABLE_ROWS}). Excel trae el listado completo.`
    : undefined;

  return (
    <Page size="A4" orientation="landscape" style={PAGE} wrap>
      <BrandHeader
        branding={props.branding}
        title={props.title}
        filterLine={props.payload.filterLine}
        extra={`${props.payload.budgetName}${props.payload.summaryLine ? ` · ${props.payload.summaryLine}` : ""}`}
      />
      <View style={reportPdfStyles.headerRow} fixed>
        {props.columns.map((c) => (
          <Text
            key={c.key}
            style={[
              reportPdfStyles.cell,
              dateCellStyle(c.date),
              { flex: c.flex, fontFamily: "Helvetica-Bold" },
            ]}
          >
            {c.label}
          </Text>
        ))}
      </View>
      {slice.map((row) => (
        <View key={`${props.title}-${row.id}`} style={reportPdfStyles.row} wrap={false}>
          {props.columns.map((c) => (
            <Text
              key={c.key}
              style={[reportPdfStyles.cell, dateCellStyle(c.date), { flex: c.flex }]}
            >
              {truncateText(String(row[c.key] ?? ""), c.key === "displayName" ? 48 : c.date ? 10 : 32)}
            </Text>
          ))}
        </View>
      ))}
      <PdfReportFooter branding={props.branding} extraNote={footerNote} />
    </Page>
  );
}

function GanttLegend() {
  const item = (color: string, label: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 10 }}>
      <View style={{ width: 10, height: 8, backgroundColor: color, marginRight: 4, borderRadius: 1 }} />
      <Text style={{ fontSize: 6.5, color: "#444444" }}>{label}</Text>
    </View>
  );
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 4 }}>
      {item("#475569", "Contenedor")}
      {item("#3b82f6", "En curso")}
      {item("#94a3b8", "Planificado")}
      {item("#22c55e", "Hecho")}
      {item("#ef4444", "Atrasado / bloqueado")}
      {item("#7c3aed", "Hito")}
      <View style={{ flexDirection: "row", alignItems: "center", marginRight: 10 }}>
        <View style={{ width: 1, height: 10, backgroundColor: "#dc2626", marginRight: 4 }} />
        <Text style={{ fontSize: 6.5, color: "#444444" }}>Hoy</Text>
      </View>
    </View>
  );
}

function GanttAxis({ gantt }: { gantt: ScheduleExportGantt }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 4 }}>
      <View style={{ width: 158 }} />
      <View style={{ flex: 1, height: 14, position: "relative" }}>
        {gantt.axisTicks.map((tick) => (
          <Text
            key={tick.iso}
            style={{
              position: "absolute",
              left: `${tick.left * 100}%`,
              fontSize: 6,
              color: "#555555",
            }}
          >
            {tick.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function GanttBar(props: { row: ScheduleExportRow; gantt: ScheduleExportGantt }) {
  const bar = ganttBarFraction(
    props.row.startDate,
    props.row.endDate,
    props.gantt.rangeStartIso,
    props.gantt.rangeEndIso,
  );
  return (
    <View
      style={{
        flex: 1,
        height: 14,
        backgroundColor: "#f4f4f5",
        borderRadius: 2,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {props.gantt.todayLeft != null ? (
        <View
          style={{
            position: "absolute",
            left: `${props.gantt.todayLeft * 100}%`,
            top: 0,
            bottom: 0,
            width: 1,
            backgroundColor: "#dc2626",
          }}
        />
      ) : null}
      {bar ? (
        props.row.isMilestone ? (
          <View
            style={{
              position: "absolute",
              left: `${bar.left * 100}%`,
              top: 2,
              width: 10,
              height: 10,
              backgroundColor: props.row.barColor,
              transform: "rotate(45deg)",
            }}
          />
        ) : (
          <View
            style={{
              position: "absolute",
              left: `${bar.left * 100}%`,
              width: `${Math.max(bar.width * 100, 0.8)}%`,
              top: 2,
              height: 10,
              backgroundColor: props.row.barColor,
              borderRadius: 2,
            }}
          >
            {props.row.progressRatio > 0 ? (
              <View
                style={{
                  width: `${props.row.progressRatio * 100}%`,
                  height: 10,
                  backgroundColor: "#111111",
                  opacity: 0.28,
                  borderRadius: 2,
                }}
              />
            ) : null}
          </View>
        )
      ) : (
        <Text style={{ fontSize: 6, color: "#888888", marginLeft: 4, marginTop: 2 }}>—</Text>
      )}
    </View>
  );
}

function windowGantt(base: ScheduleExportGantt, startIso: string, endIso: string): ScheduleExportGantt {
  return {
    ...base,
    rangeStartIso: startIso,
    rangeEndIso: endIso,
    todayLeft: todayMarkerFraction(startIso, endIso, base.todayIso),
    axisTicks: buildGanttAxisTicks(startIso, endIso),
  };
}

function GanttSection(props: { payload: ScheduleExportPayload; branding: PdfReportBranding }) {
  const base = props.payload.gantt;
  const windows = base
    ? splitGanttPdfWindows(base.rangeStartIso, base.rangeEndIso, base.scale)
    : [{ startIso: "", endIso: "" }];
  const rowChunks = chunkRows(props.payload.rows, SCHEDULE_GANTT_PDF_ROWS_PER_PAGE);
  const totalPages = windows.length * rowChunks.length;

  return (
    <>
      {windows.flatMap((window, wi) =>
        rowChunks.map((chunk, ri) => {
          const pageNo = wi * rowChunks.length + ri + 1;
          const gantt =
            base && window.startIso
              ? windowGantt(base, window.startIso, window.endIso)
              : null;
          const axisLabel = gantt
            ? `${formatScheduleExportDate(gantt.rangeStartIso)} → ${formatScheduleExportDate(gantt.rangeEndIso)}`
            : "Sin fechas en los ítems filtrados";
          return (
            <Page
              key={`gantt-${wi}-${ri}`}
              size="A4"
              orientation="landscape"
              style={PAGE}
            >
              <BrandHeader
                branding={props.branding}
                title="Cronograma — Gantt"
                filterLine={props.payload.filterLine}
                extra={`${props.payload.budgetName} · Eje ${axisLabel} · Horizontal ${wi + 1}/${windows.length} · Filas ${ri + 1}/${rowChunks.length} · Hoja ${pageNo}/${totalPages}`}
              />
              <GanttLegend />
              {gantt ? <GanttAxis gantt={gantt} /> : null}
              {chunk.length === 0 ? (
                <Text style={reportPdfStyles.meta}>No hay ítems para el filtro aplicado.</Text>
              ) : (
                chunk.map((row) => (
                  <View
                    key={row.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 3,
                      minHeight: 16,
                    }}
                    wrap={false}
                  >
                    <View style={{ width: 158, paddingRight: 6 }}>
                      <Text style={{ fontSize: 6.5 }}>{truncateText(row.displayName, 32)}</Text>
                      <Text style={{ fontSize: 5.5, color: "#666666" }}>
                        {row.startLabel} → {row.endLabel}
                      </Text>
                    </View>
                    {gantt ? (
                      <GanttBar row={row} gantt={gantt} />
                    ) : (
                      <Text style={{ fontSize: 6.5, color: "#888888" }}>Sin fechas</Text>
                    )}
                  </View>
                ))
              )}
              <PdfReportFooter branding={props.branding} />
            </Page>
          );
        }),
      )}
    </>
  );
}

export function SchedulePdfDocument(props: Props) {
  const showTable = props.payload.view === "table" || props.payload.view === "both";
  const showGantt = props.payload.view === "gantt" || props.payload.view === "both";

  return (
    <Document>
      {showTable ? (
        <>
          <TableBand
            payload={props.payload}
            branding={props.branding}
            title="Cronograma — Tabla (fechas)"
            columns={COLS_DATES}
          />
          <TableBand
            payload={props.payload}
            branding={props.branding}
            title="Cronograma — Tabla (avance y costos)"
            columns={COLS_METRICS}
          />
        </>
      ) : null}
      {showGantt ? <GanttSection payload={props.payload} branding={props.branding} /> : null}
    </Document>
  );
}
