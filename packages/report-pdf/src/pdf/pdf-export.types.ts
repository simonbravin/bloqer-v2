/** Binary PDF for HTTP handlers (Phase 9B). */
export type ReportPdfPayload = {
  buffer: Buffer;
  filename: string;
};

/** Max detail rows rendered in a single PDF (rest omitted with explicit notice). Phase 9C may paginate. */
export const MAX_AGING_PDF_LINE_ITEMS = 350;
export const MAX_COST_CONTROL_PDF_ROWS = 90;
export const MAX_PROJECT_REPORT_PDF_ROWS = 90;
export const MAX_AUDIT_LOG_PDF_ROWS = 350;
