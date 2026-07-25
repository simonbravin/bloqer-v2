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

/** Presentation labels for account-movement exports shared by Finanzas and Tesorería. */
export type MovementExportLabels = {
  /** PDF header title (es-AR). */
  title: string;
  /** ASCII filename stem without extension. */
  filenameBase: string;
};

export const TREASURY_MOVEMENTS_EXPORT_LABELS: MovementExportLabels = {
  title: "Movimientos de tesorería",
  filenameBase: "tesoreria_movimientos",
};

export const FINANCE_TRANSACTIONS_EXPORT_LABELS: MovementExportLabels = {
  title: "Transacciones",
  filenameBase: "finanzas_transacciones",
};
