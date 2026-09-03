/**
 * Heuristic to find obra "gastos generales / indirectos" WBS nodes by label.
 * There is no persisted `isOverhead` flag yet ([D-050]: model as budgetable WBS ITEMs).
 * Match GROUP or ITEM names/codes; ITEMs under a matching GROUP inherit.
 *
 * Intentionally strict: do not treat product names that merely contain "GG"
 * (e.g. "Cable GG 4mm") as GG chapters.
 */

export function normalizeGgLabel(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** True when code or name looks like a GG / indirectos partida or chapter. */
export function matchesGgWbsLabel(code: string, name: string): boolean {
  const c = normalizeGgLabel(code);
  const n = normalizeGgLabel(name);
  if (!c && !n) return false;

  // Codes: GG, G.G., GG.1, GG-2, GG1, GG01
  if (c === "gg" || /^g\.?g\.?([.\-\s_]|$|\d)/i.test(c)) return true;

  // Strong phrases in the name (chapter / leaf)
  if (/\b(gastos?\s+generales?|gasto\s+general)\b/.test(n)) return true;
  if (/\bgastos?\s+indirectos?\b/.test(n)) return true;
  // Whole-name / starts-with chapter titles (avoid "Costos indirectos de materiales")
  if (/^(indirectos?)\b/.test(n)) return true;
  if (/^(administracion\s+de\s+obra)\b/.test(n)) return true;

  return false;
}

export type GgWbsNodeInput = {
  id: string;
  parentId: string | null;
  type: "GROUP" | "ITEM";
  code: string;
  name: string;
};

/**
 * Returns ITEM node ids that count as presupuesto/gasto GG:
 * - ITEM whose own label matches, or
 * - ITEM descending from a GROUP whose label matches.
 */
export function selectGgItemIds(nodes: readonly GgWbsNodeInput[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const list = children.get(n.parentId) ?? [];
    list.push(n.id);
    children.set(n.parentId, list);
  }

  const ggRootIds = new Set<string>();
  for (const n of nodes) {
    if (matchesGgWbsLabel(n.code, n.name)) ggRootIds.add(n.id);
  }

  const underGg = new Set<string>();
  const stack = [...ggRootIds];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (underGg.has(id)) continue;
    underGg.add(id);
    for (const childId of children.get(id) ?? []) stack.push(childId);
  }

  const itemIds = new Set<string>();
  for (const n of nodes) {
    if (n.type !== "ITEM") continue;
    if (underGg.has(n.id) || matchesGgWbsLabel(n.code, n.name)) {
      itemIds.add(n.id);
    }
  }
  return itemIds;
}
