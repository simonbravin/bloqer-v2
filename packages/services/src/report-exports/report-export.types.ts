/**
 * Phase 9A–9B — export formats.
 */
export type ReportExportFormat = "csv" | "pdf" | "json";

/** Result of a CSV (or UTF-8 text) export for HTTP handlers. */
export type ReportCsvPayload = {
  content: string;
  filename: string;
};
