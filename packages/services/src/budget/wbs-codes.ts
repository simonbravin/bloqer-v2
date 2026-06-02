import type { WbsNodeType } from "@bloqer/database";
import {
  countCodeSegments,
  isDisciplineRootCode,
  isMultiStyleCode,
  WBS_MAX_CODE_SEGMENTS_MULTI,
  WBS_MAX_CODE_SEGMENTS_SIMPLE,
} from "./wbs-code-rules";

export {
  countCodeSegments,
  compareWbsCodes,
  isMultiStyleCode,
  isDisciplineRootCode,
  WBS_MAX_CODE_SEGMENTS_SIMPLE,
  WBS_MAX_CODE_SEGMENTS_MULTI,
} from "./wbs-code-rules";

/** @deprecated Use WBS_MAX_CODE_SEGMENTS_SIMPLE */
export const WBS_MAX_CODE_SEGMENTS = WBS_MAX_CODE_SEGMENTS_SIMPLE;

type WbsNodeRow = { id: string; parentId: string | null; code: string; type: WbsNodeType; sortOrder: number };

/** Próximo código para tarea raíz numérica (1, 2, 3…). */
export function nextRootGroupCode(roots: WbsNodeRow[]): string {
  const numericRoots = roots.filter((n) => n.parentId === null && /^\d+$/.test(n.code));
  return String(numericRoots.length + 1);
}

/** Próximo código hijo directo bajo un padre (p. ej. 1.3 o ARQ.1.2). */
export function nextChildCode(parentCode: string, siblings: WbsNodeRow[]): string {
  const prefix = `${parentCode}.`;
  let childCount = 0;
  for (const n of siblings) {
    if (!n.code.startsWith(prefix)) continue;
    const suffix = n.code.slice(prefix.length);
    if (!suffix || suffix.includes(".")) continue;
    childCount += 1;
  }
  return `${parentCode}.${childCount + 1}`;
}

/** @deprecated Use nextChildCode */
export const nextChildItemCode = nextChildCode;

/** @deprecated Use nextChildCode */
export const nextChildGroupCode = nextChildCode;

export function nextSortOrder(siblings: WbsNodeRow[]): number {
  if (siblings.length === 0) return 0;
  return Math.max(...siblings.map((s) => s.sortOrder)) + 1;
}

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

    if (parentId === null && isDisciplineRootCode(node.code)) {
      return;
    }

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
