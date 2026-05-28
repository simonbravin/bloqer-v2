import type { WbsViewNode } from "@bloqer/services";

/** True si el ítem hoja tiene cómputo cargado (líneas, cantidad, unidad o costo). */
export function nodeHasApuData(node: WbsViewNode): boolean {
  const ci = node.costItem;
  if (!ci) return false;
  if (ci.analysisLines.length > 0) return true;
  if ((parseFloat(ci.quantity) || 0) > 0) return true;
  if ((parseFloat(ci.totalCostDirect) || 0) > 0) return true;
  return false;
}

/** Ítem hoja: único nivel de la rama donde se edita el APU. */
export function isLeafApuNode(node: WbsViewNode): boolean {
  return node.type === "ITEM" && node.children.length === 0;
}

/** Capítulo / agrupador (con o sin hijos). */
export function isWbsContainer(node: WbsViewNode): boolean {
  return !isLeafApuNode(node);
}
