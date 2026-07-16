import type { WbsViewNode } from "@bloqer/services";
import { isStructuralLeafByCode } from "@bloqer/services/budget-import-pure";

/** Sin hijos en el árbol → se puede cargar APU en este nivel (12, 1.1, 1.1.1, etc.). */
export function isWbsStructuralLeaf(node: WbsViewNode): boolean {
  return isStructuralLeafByCode(node.code, node.children.length);
}

/** True si el nodo hoja tiene cómputo cargado (líneas, cantidad o costo). */
export function nodeHasApuData(node: WbsViewNode): boolean {
  const ci = node.costItem;
  if (!ci) return false;
  if (ci.analysisLines.length > 0) return true;
  if ((parseFloat(ci.quantity) || 0) > 0) return true;
  if ((parseFloat(ci.totalCostDirect) || 0) > 0) return true;
  return false;
}
