/** Shared report layout tokens — keep charts/filters consistent on mobile. */

export const REPORT_CHART_FRAME_CLASS = "h-[220px] w-full min-w-0 sm:h-[280px]";

/** Ancho del eje Y: alcanza para `-12.5M` / `100%` sin recortar. */
export const REPORT_CHART_Y_AXIS_WIDTH = 52;

export const REPORT_FILTER_FORM_CLASS =
  "flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3 sm:p-4";

export const REPORT_FILTER_FIELD_CLASS =
  "min-w-0 flex-1 basis-[9.75rem] space-y-1 sm:flex-none sm:basis-auto";

export const REPORT_FILTER_CONTROL_CLASS = "h-8 w-full min-w-0 text-xs sm:w-44";
