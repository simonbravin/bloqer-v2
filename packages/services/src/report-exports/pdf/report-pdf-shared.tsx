import { StyleSheet, Text, View } from "@react-pdf/renderer";

export const reportPdfStyles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontSize: 8,
    fontFamily: "Helvetica",
  },
  title: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
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

export function PdfMetaBlock(props: { title: string; generatedAtIso: string; filterLine: string }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={reportPdfStyles.title}>{props.title}</Text>
      <Text style={reportPdfStyles.meta}>Generado (UTC): {props.generatedAtIso}</Text>
      <Text style={reportPdfStyles.meta}>Filtros: {props.filterLine}</Text>
    </View>
  );
}

export function truncateText(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
