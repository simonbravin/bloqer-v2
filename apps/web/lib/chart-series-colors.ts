/**
 * Canonical chart series colors for Recharts (SVG needs concrete colors).
 * Aligns with treasury cash-flow: emerald income, rose cost, sky economic, indigo accent.
 */
export const CHART_SERIES = {
  /** Certificado / ingreso económico */
  certified: "#0284c7",
  /** Cobrado / inflow de caja */
  collected: "#059669",
  /** Costo devengado */
  costAccrued: "#d97706",
  /** Costo pagado / egreso */
  costPaid: "#e11d48",
  /** Margen / neto */
  margin: "#4f46e5",
  /** Facturado AR */
  invoiced: "#0d9488",
} as const;
