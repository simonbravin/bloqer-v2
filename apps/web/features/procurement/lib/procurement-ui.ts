/** Shared touch-target sizing for procurement primary actions (PO / receipt / billing). */
export const procurementActionBtnClass = "h-auto min-h-11 max-w-full w-full whitespace-normal py-2 sm:w-auto md:min-h-10";

/** AlertDialog / Sheet footer buttons on mobile. */
export const procurementDialogBtnClass = "h-auto min-h-11 max-w-full whitespace-normal py-2 md:min-h-10";

/** Status filters keep a full touch target without changing the shared Button. */
export const procurementFilterBtnClass = "h-auto min-h-11 px-3 py-2 md:min-h-9";

/** Amber status callout (Aprobada ≠ Comprometido, matching 3 vías, etc.). */
export const procurementAmberCalloutClass =
  "rounded-md border border-amber-300/60 bg-amber-50/80 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100";

export const procurementAmberInsetClass =
  "rounded border border-amber-300/60 bg-amber-50/80 dark:bg-amber-950/20 p-2 space-y-1";

/** Full-width banner on procurement document detail (devolución, avisos). */
export const procurementAmberBannerClass =
  "rounded-lg border border-amber-300/60 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100";
