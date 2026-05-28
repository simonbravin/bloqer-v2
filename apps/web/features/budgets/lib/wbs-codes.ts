import type { WbsViewNode } from "@bloqer/services";
import {
  countCodeSegments,
  isMultiStyleCode,
  WBS_MAX_CODE_SEGMENTS_MULTI,
  WBS_MAX_CODE_SEGMENTS_SIMPLE,
} from "@bloqer/services/budget-import-pure";

export { countCodeSegments, isMultiStyleCode };

type NodeLike = { parentId: string | null; code: string; sortOrder: number };

function flatten(nodes: WbsViewNode[]): WbsViewNode[] {
  const out: WbsViewNode[] = [];
  function walk(ns: WbsViewNode[]) {
    for (const n of ns) {
      out.push(n);
      if (n.children.length) walk(n.children);
    }
  }
  walk(nodes);
  return out;
}

export function suggestRootGroupCode(nodes: WbsViewNode[]): string {
  const flat = flatten(nodes);
  const roots = flat.filter((n) => n.parentId === null);
  const numericRoots = roots.filter((n) => /^\d+$/.test(n.code));
  return String(numericRoots.length + 1);
}

export function suggestChildCode(parent: WbsViewNode, nodes: WbsViewNode[]): string {
  const flat = flatten(nodes);
  const siblings = flat.filter((n) => n.parentId === parent.id);
  return `${parent.code}.${siblings.length + 1}`;
}

export const suggestChildItemCode = suggestChildCode;
export const suggestChildGroupCode = suggestChildCode;

export function getSiblings(nodes: WbsViewNode[], parentId: string | null): NodeLike[] {
  const flat = flatten(nodes);
  return flat.filter((n) => n.parentId === parentId);
}

export function canAddSubchapter(node: WbsViewNode): boolean {
  if (node.type !== "GROUP") return false;
  const segs = countCodeSegments(node.code);
  if (isMultiStyleCode(node.code)) return segs >= 1 && segs <= 2;
  return segs === 1;
}

export function canAddChildItem(node: WbsViewNode): boolean {
  if (node.type !== "GROUP") return false;
  const segs = countCodeSegments(node.code);
  const maxParent = isMultiStyleCode(node.code)
    ? WBS_MAX_CODE_SEGMENTS_MULTI - 1
    : WBS_MAX_CODE_SEGMENTS_SIMPLE - 1;
  return segs <= maxParent;
}

/** Siguiente hijo según profundidad: subcapítulo si aplica, si no ítem hoja. */
export function resolveAddChildPreset(
  node: WbsViewNode,
): "childGroup" | "childItem" | null {
  if (node.type !== "GROUP") return null;
  if (canAddSubchapter(node)) return "childGroup";
  if (canAddChildItem(node)) return "childItem";
  return null;
}

export function addChildButtonTitle(node: WbsViewNode): string {
  const preset = resolveAddChildPreset(node);
  if (preset === "childGroup") return "Agregar subcapítulo";
  if (preset === "childItem") return "Agregar ítem";
  return "Agregar";
}
