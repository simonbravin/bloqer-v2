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
  let max = 0;
  for (const n of roots) {
    const top = parseInt(n.code.split(".")[0] ?? "", 10);
    if (!Number.isNaN(top)) max = Math.max(max, top);
  }
  return String(max + 1);
}

export function suggestChildItemCode(parent: WbsViewNode, nodes: WbsViewNode[]): string {
  const flat = flatten(nodes);
  const siblings = flat.filter((n) => n.parentId === parent.id);
  let max = 0;
  const prefix = `${parent.code}.`;
  for (const n of siblings) {
    if (!n.code.startsWith(prefix)) continue;
    const suffix = n.code.slice(prefix.length);
    const part = parseInt(suffix.split(".")[0] ?? "", 10);
    if (!Number.isNaN(part)) max = Math.max(max, part);
  }
  return `${parent.code}.${max + 1}`;
}

export function getSiblings(nodes: WbsViewNode[], parentId: string | null): NodeLike[] {
  const flat = flatten(nodes);
  return flat.filter((n) => n.parentId === parentId);
}
