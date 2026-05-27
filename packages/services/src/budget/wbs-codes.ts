import type { WbsNodeType } from "@bloqer/database";

type WbsNodeRow = { id: string; parentId: string | null; code: string; type: WbsNodeType; sortOrder: number };

/** Próximo código para capítulo raíz (1, 2, 3…). */
export function nextRootGroupCode(roots: WbsNodeRow[]): string {
  let max = 0;
  for (const n of roots) {
    if (n.parentId !== null) continue;
    const top = parseInt(n.code.split(".")[0] ?? "", 10);
    if (!Number.isNaN(top)) max = Math.max(max, top);
  }
  return String(max + 1);
}

/** Próximo código hijo bajo un capítulo (p. ej. 1.3 si existen 1.1 y 1.2). */
export function nextChildItemCode(parentCode: string, siblings: WbsNodeRow[]): string {
  let max = 0;
  const prefix = `${parentCode}.`;
  for (const n of siblings) {
    if (!n.code.startsWith(prefix)) continue;
    const suffix = n.code.slice(prefix.length);
    const part = parseInt(suffix.split(".")[0] ?? "", 10);
    if (!Number.isNaN(part)) max = Math.max(max, part);
  }
  return `${parentCode}.${max + 1}`;
}

/** sortOrder al final entre hermanos. */
export function nextSortOrder(siblings: WbsNodeRow[]): number {
  if (siblings.length === 0) return 0;
  return Math.max(...siblings.map((s) => s.sortOrder)) + 1;
}

/**
 * Recalcula códigos según orden de hermanos (sortOrder / orderedNodeIds).
 * Si cambia un capítulo raíz, renumerar también el subárbol (1.x → 2.x).
 */
export function buildRenumberPlan(
  allNodes: WbsNodeRow[],
  parentId: string | null,
  orderedSiblingIds: string[],
): Map<string, string> {
  const updates = new Map<string, string>();
  const parent = parentId ? allNodes.find((n) => n.id === parentId) : null;
  const parentCode = parent?.code ?? "";

  orderedSiblingIds.forEach((id, index) => {
    const node = allNodes.find((n) => n.id === id);
    if (!node) return;
    const newCode =
      parentId === null ? String(index + 1) : `${parentCode}.${index + 1}`;
    if (node.code !== newCode) {
      updates.set(id, newCode);
      if (node.type === "GROUP") {
        applySubtreePrefixRenumber(allNodes, id, node.code, newCode, updates);
      }
    }
  });

  return updates;
}

function applySubtreePrefixRenumber(
  allNodes: WbsNodeRow[],
  groupId: string,
  oldPrefix: string,
  newPrefix: string,
  updates: Map<string, string>,
) {
  const descendants = allNodes.filter(
    (n) => n.id !== groupId && (n.code === oldPrefix || n.code.startsWith(`${oldPrefix}.`)),
  );
  for (const d of descendants) {
    const suffix = d.code === oldPrefix ? "" : d.code.slice(oldPrefix.length);
    const next = suffix ? `${newPrefix}${suffix}` : newPrefix;
    if (d.code !== next) updates.set(d.id, next);
  }
}
