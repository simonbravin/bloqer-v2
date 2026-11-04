/**
 * D-124: current consumption movements have neither currency nor valuation-layer
 * lineage. A stored unit/total value alone is not a comparable consumption cost.
 * These are read-model warnings, not an inventory valuation algorithm.
 */
export const STOCK_CONSUMPTION_UNVALUED_WARNING =
  "Sin valuación: hay consumos de stock sin valor y moneda trazables. Se conservan las cantidades; su costo y las varianzas basadas en ese costo no son calculables. No se presume costo cero ni ahorro.";

export const STOCK_CONSUMPTION_UNAVAILABLE_WARNING =
  "Costo de consumo no disponible: la fuente Inventario está deshabilitada o no tenés permiso para consultarla. No se puede demostrar ausencia de consumos ni asignar costo cero.";
