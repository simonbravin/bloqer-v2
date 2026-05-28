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

export function getSiblings(nodes: WbsViewNode[], parentId: string | null): NodeLike[] {
  const flat = flatten(nodes);
  return flat.filter((n) => n.parentId === parentId);
}

function maxSegmentsForNode(node: WbsViewNode): number {
  return isMultiStyleCode(node.code)
    ? WBS_MAX_CODE_SEGMENTS_MULTI
    : WBS_MAX_CODE_SEGMENTS_SIMPLE;
}

export function canAddChild(node: WbsViewNode): boolean {
  return countCodeSegments(node.code) < maxSegmentsForNode(node);
}

/** Agrega ítem hijo en el siguiente nivel (1 → 1.1 → 1.1.1). */
export function resolveAddChildPreset(node: WbsViewNode): "childItem" | null {
  if (!canAddChild(node)) return null;
  if (node.type === "ITEM" || node.type === "GROUP") return "childItem";
  return null;
}

export function addChildButtonTitle(node: WbsViewNode): string {
  if (resolveAddChildPreset(node)) return "Agregar ítem";
  return "Agregar";
}
