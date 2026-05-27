import type { WbsViewNode } from "@bloqer/services";

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
  return String(roots.length + 1);
}

export function suggestChildItemCode(parent: WbsViewNode, nodes: WbsViewNode[]): string {
  const flat = flatten(nodes);
  const siblings = flat.filter((n) => n.parentId === parent.id);
  return `${parent.code}.${siblings.length + 1}`;
}

export function getSiblings(nodes: WbsViewNode[], parentId: string | null): NodeLike[] {
  const flat = flatten(nodes);
  return flat.filter((n) => n.parentId === parentId);
}
