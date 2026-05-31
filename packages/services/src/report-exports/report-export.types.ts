/**
 * Phase 9A–9B — export formats.
 */
export type ReportExportFormat = "csv" | "pdf" | "json" | "xlsx";

/** Result of a CSV (or UTF-8 text) export for HTTP handlers. */
export type ReportCsvPayload = {
  content: string;
  filename: string;
};

/** Result of an XLSX export for HTTP handlers. */
export type ReportXlsxPayload = {
  buffer: Buffer;
  filename: string;
};
