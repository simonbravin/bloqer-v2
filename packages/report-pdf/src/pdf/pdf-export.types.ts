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
export const MAX_JOBSITE_LOG_PDF_TABLE_ROWS = 60;
export const MAX_JOBSITE_LOG_PDF_HISTORY_ENTRIES = 40;
export const MAX_SCHEDULE_PDF_TABLE_ROWS = 600;
export const SCHEDULE_GANTT_PDF_ROWS_PER_PAGE = 17;
