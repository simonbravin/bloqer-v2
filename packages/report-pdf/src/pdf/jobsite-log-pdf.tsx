import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { JobsiteLogPdfPayload } from "@bloqer/services";
import type { PdfReportBranding } from "../branding/pdf-branding.types";
import { MAX_JOBSITE_LOG_PDF_HISTORY_ENTRIES, MAX_JOBSITE_LOG_PDF_TABLE_ROWS } from "./pdf-export.types";
import { PdfReportFooter, PdfReportHeader, reportPdfStyles, truncateText } from "./report-pdf-shared";
import type { SimpleTableColumn } from "./project-simple-table-pdf";

type Props = {
  payload: JobsiteLogPdfPayload;
  branding: PdfReportBranding;
};

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <Text style={reportPdfStyles.meta}>
      {label}: {truncateText(value, 200)}
    </Text>
  );
}

function SimpleTableSection({
  title,
  columns,
  rows,
  maxRows = MAX_JOBSITE_LOG_PDF_TABLE_ROWS,
}: {
  title: string;
  columns: SimpleTableColumn[];
  rows: Record<string, string>[];
  maxRows?: number;
}) {
  if (rows.length === 0) return null;
  const slice = rows.slice(0, maxRows);
  const truncated = rows.length > maxRows;

  return (
    <View>
      <Text style={reportPdfStyles.sectionTitle}>
        {title} ({truncated ? `primeras ${maxRows} de ${rows.length}` : rows.length})
      </Text>
      <View style={reportPdfStyles.headerRow}>
        {columns.map((c) => (
          <Text key={c.key} style={[reportPdfStyles.cell, { flex: c.flex ?? 1 }]}>
            {c.label}
          </Text>
        ))}
      </View>
      {slice.map((row, ri) => (
        <View key={ri} style={reportPdfStyles.row}>
          {columns.map((c) => (
            <Text key={c.key} style={[reportPdfStyles.cell, { flex: c.flex ?? 1 }]}>
              {truncateText(row[c.key] ?? "", 56)}
            </Text>
          ))}
        </View>
      ))}
      {truncated ? (
        <Text style={[reportPdfStyles.meta, { marginTop: 4, color: "#884400" }]}>
          Detalle truncado en PDF. Consultá el parte en Bloqer para el listado completo.
        </Text>
      ) : null}
    </View>
  );
}

function NarrativeSection({ fields }: { fields: Array<{ label: string; value: string }> }) {
  if (fields.length === 0) return null;
  return (
    <View>
      <Text style={reportPdfStyles.sectionTitle}>Observaciones y notas</Text>
      {fields.map((f) => (
        <View key={f.label} style={{ marginBottom: 6 }}>
          <Text style={[reportPdfStyles.meta, { fontFamily: "Helvetica-Bold" }]}>{f.label}</Text>
          <Text style={reportPdfStyles.meta}>{truncateText(f.value, 900)}</Text>
        </View>
      ))}
    </View>
  );
}

export function JobsiteLogPdfDocument({ payload, branding }: Props) {
  const { meta } = payload;
  const titleParts = [meta.logDateLabel];
  if (meta.title) titleParts.push(meta.title);
  const title = `Libro de obra — ${titleParts.join(" · ")}`;

  const subtitle = [
    meta.statusLabel,
    meta.workFront ? `Frente: ${meta.workFront}` : null,
    meta.shift ? `Turno: ${meta.shift}` : null,
    meta.weather ? `Clima: ${meta.weather}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Document>
      <Page size="A4" wrap style={reportPdfStyles.page}>
        <PdfReportHeader
          branding={branding}
          title={title}
          filterLine={`${meta.projectCode} · ${meta.projectName} · Estado: ${meta.statusLabel}`}
        />
        {subtitle ? <Text style={reportPdfStyles.meta}>{subtitle}</Text> : null}

        <Text style={reportPdfStyles.sectionTitle}>Trazabilidad</Text>
        <MetaLine label="Creado por" value={`${meta.createdByLabel} · ${meta.createdAtLabel}`} />
        {meta.updatedByLabel && meta.updatedAtLabel ? (
          <MetaLine
            label="Última modificación"
            value={`${meta.updatedByLabel} · ${meta.updatedAtLabel}`}
          />
        ) : null}
        {meta.approvedByLabel && meta.approvedAtLabel ? (
          <MetaLine label="Aprobado por" value={`${meta.approvedByLabel} · ${meta.approvedAtLabel}`} />
        ) : meta.status === "APPROVED" ? (
          <Text style={reportPdfStyles.meta}>Aprobado por: registro incompleto en auditoría</Text>
        ) : (
          <Text style={reportPdfStyles.meta}>Aprobado por: — (parte no aprobado)</Text>
        )}
        {meta.returnNotes ? (
          <View style={{ marginTop: 6 }}>
            <Text style={[reportPdfStyles.meta, { fontFamily: "Helvetica-Bold", color: "#884400" }]}>
              Observaciones de devolución pendientes
            </Text>
            <Text style={reportPdfStyles.meta}>{truncateText(meta.returnNotes, 500)}</Text>
          </View>
        ) : null}

        <NarrativeSection fields={payload.narrativeFields} />

        <SimpleTableSection
          title="Avance de obra"
          columns={[
            { key: "wbs", label: "Partida WBS", flex: 1.4 },
            { key: "description", label: "Descripción", flex: 1 },
            { key: "quantity", label: "Cantidad", flex: 0.8 },
            { key: "pct", label: "% Físico", flex: 0.6 },
            { key: "notes", label: "Notas", flex: 0.9 },
          ]}
          rows={payload.progress}
        />

        <SimpleTableSection
          title="Mano de obra"
          columns={[
            { key: "contact", label: "Contacto / SC", flex: 1.1 },
            { key: "crew", label: "Cuadrilla", flex: 1 },
            { key: "workers", label: "Trab.", flex: 0.5 },
            { key: "hours", label: "Horas", flex: 0.5 },
            { key: "notes", label: "Notas", flex: 0.9 },
          ]}
          rows={payload.labor}
        />

        <SimpleTableSection
          title="Materiales utilizados"
          columns={[
            { key: "description", label: "Descripción", flex: 1.1 },
            { key: "product", label: "Producto", flex: 0.9 },
            { key: "warehouse", label: "Depósito", flex: 0.8 },
            { key: "quantity", label: "Cantidad", flex: 0.7 },
            { key: "notes", label: "Notas", flex: 0.8 },
          ]}
          rows={payload.materials}
        />

        <SimpleTableSection
          title="Problemas / incidencias"
          columns={[
            { key: "type", label: "Tipo", flex: 0.7 },
            { key: "severity", label: "Severidad", flex: 0.7 },
            { key: "description", label: "Descripción", flex: 1.2 },
            { key: "status", label: "Estado", flex: 0.6 },
            { key: "notes", label: "Notas", flex: 0.8 },
          ]}
          rows={payload.issues}
        />

        {payload.lifecycleHistory.length > 0 ? (
          <View>
            <Text style={reportPdfStyles.sectionTitle}>Historial de actividad</Text>
            {payload.historyTruncated ? (
              <Text style={[reportPdfStyles.meta, { color: "#884400" }]}>
                Historial truncado: se muestran los {MAX_JOBSITE_LOG_PDF_HISTORY_ENTRIES} movimientos más recientes.
              </Text>
            ) : null}
            {payload.lifecycleHistory.map((entry, i) => (
              <View key={i} style={{ marginBottom: 4 }}>
                <Text style={reportPdfStyles.meta}>
                  {entry.at} · {entry.action} · {entry.actor}
                </Text>
                {entry.detail ? (
                  <Text style={reportPdfStyles.meta}>Archivo: {truncateText(entry.detail, 80)}</Text>
                ) : null}
                {entry.comment ? (
                  <Text style={reportPdfStyles.meta}>{truncateText(entry.comment, 200)}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {payload.attachmentsNote ? (
          <View style={{ marginTop: 8 }}>
            <Text style={[reportPdfStyles.meta, { fontFamily: "Helvetica-Bold" }]}>Adjuntos</Text>
            <Text style={reportPdfStyles.meta}>{truncateText(payload.attachmentsNote, 400)}</Text>
          </View>
        ) : null}

        <PdfReportFooter
          branding={branding}
          extraNote="Documento operativo generado desde Bloqer. Los adjuntos digitales no se incluyen en este PDF."
        />
      </Page>
    </Document>
  );
}
