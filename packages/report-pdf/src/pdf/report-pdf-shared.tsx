import { StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PdfReportBranding } from "../branding/pdf-branding.types";

export const reportPdfStyles = StyleSheet.create({
  page: {
    paddingTop: 52,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontSize: 8,
    fontFamily: "Helvetica",
  },
  orgLine: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
    marginBottom: 2,
  },
  projectLine: {
    fontSize: 7.5,
    color: "#444444",
    marginBottom: 4,
  },
  title: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    marginTop: 4,
  },
  meta: {
    fontSize: 7,
    color: "#333333",
    marginBottom: 2,
  },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    fontSize: 6,
    color: "#666666",
    borderTopWidth: 0.5,
    borderTopColor: "#cccccc",
    paddingTop: 6,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    marginTop: 10,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.3,
    borderBottomColor: "#dddddd",
    paddingVertical: 3,
    alignItems: "flex-start",
  },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#222222",
    paddingBottom: 4,
    marginTop: 6,
    fontFamily: "Helvetica-Bold",
  },
  cell: {
    fontSize: 6.5,
    paddingRight: 4,
  },
});

export function truncateText(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function organizationLine(branding: PdfReportBranding): string {
  if (branding.companyDisplayName && branding.companyDisplayName !== branding.tenantName) {
    return `${branding.companyDisplayName} · ${branding.tenantName}`;
  }
  return branding.tenantName;
}

export function PdfReportHeader(props: {
  branding: PdfReportBranding;
  title: string;
  filterLine?: string;
}) {
  const filterLine = props.filterLine?.trim();
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={reportPdfStyles.orgLine}>{organizationLine(props.branding)}</Text>
      {props.branding.projectLabel ? (
        <Text style={reportPdfStyles.projectLine}>Obra: {props.branding.projectLabel}</Text>
      ) : null}
      <Text style={reportPdfStyles.title}>{props.title}</Text>
      <Text style={reportPdfStyles.meta}>
        Generado (UTC): {props.branding.generatedAtIso}
      </Text>
      {filterLine ? (
        <Text style={reportPdfStyles.meta}>Filtros: {filterLine}</Text>
      ) : (
        <Text style={reportPdfStyles.meta}>Filtros: Ninguno</Text>
      )}
    </View>
  );
}

export function PdfReportFooter(props: {
  branding: PdfReportBranding;
  extraNote?: string;
}) {
  const byUser = props.branding.generatedByLabel
    ? ` · Por ${props.branding.generatedByLabel}`
    : "";
  return (
    <Text
      style={reportPdfStyles.footer}
      fixed
      render={({ pageNumber, totalPages }) => {
        const note =
          props.extraNote && pageNumber === totalPages ? ` · ${props.extraNote}` : "";
        return `${props.branding.tenantName}${byUser} · Página ${pageNumber} de ${totalPages}${note}`;
      }}
    />
  );
}
